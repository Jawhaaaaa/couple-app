package mn.aura.couple.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * IT-ийн Google IdP stub (GAP-18) — `e2e/mocks/oauthIdp.ts`-тэй ижил гэрээ:
 * `GET /authorize` → `302 redirect_uri?code&state`, `POST /token` → `{id_token}` (HS256, client secret).
 */
public final class StubOAuthIdp {

    public static final String CLIENT_ID = "aura-it-google-client";
    public static final String CLIENT_SECRET = "it-google-secret";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public record User(String sub, String email, String name, boolean emailVerified) {
    }

    private final HttpServer server;
    private final Map<String, User> codes = new ConcurrentHashMap<>();
    private volatile User user = new User("google-it-1", "google.it@aura.test", "Google Хэрэглэгч", true);
    private volatile boolean badSignature;

    private StubOAuthIdp() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        server.createContext("/authorize", this::authorize);
        server.createContext("/token", this::token);
        server.start();
    }

    public static StubOAuthIdp start() {
        return new StubOAuthIdp();
    }

    public String issuer() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    public void setUser(User user) {
        this.user = user;
    }

    public void setBadSignature(boolean bad) {
        this.badSignature = bad;
    }

    private void authorize(HttpExchange ex) throws IOException {
        Map<String, String> q = query(ex.getRequestURI().getRawQuery());
        String code = UUID.randomUUID().toString();
        codes.put(code, user);
        String target = q.get("redirect_uri") + "?code=" + enc(code) + "&state=" + enc(q.get("state"));
        ex.getResponseHeaders().add("Location", target);
        ex.sendResponseHeaders(302, -1);
        ex.close();
    }

    private void token(HttpExchange ex) throws IOException {
        Map<String, String> form = query(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        User u = codes.remove(form.getOrDefault("code", ""));
        ex.getResponseHeaders().add("Content-Type", "application/json");
        byte[] body;
        int status;
        if (u == null || !CLIENT_SECRET.equals(form.get("client_secret"))) {
            status = 400;
            body = "{\"error\":\"invalid_grant\"}".getBytes(StandardCharsets.UTF_8);
        } else {
            status = 200;
            body = MAPPER.writeValueAsBytes(Map.of("access_token", "at-" + u.sub(), "token_type", "Bearer",
                    "expires_in", 600, "id_token", idToken(u, form.get("client_id"))));
        }
        ex.sendResponseHeaders(status, body.length);
        ex.getResponseBody().write(body);
        ex.close();
    }

    private String idToken(User u, String aud) throws IOException {
        Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
        long now = System.currentTimeMillis() / 1000;
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("iss", issuer());
        payload.put("aud", aud);
        payload.put("sub", u.sub());
        payload.put("email", u.email());
        payload.put("email_verified", u.emailVerified());
        payload.put("name", u.name());
        payload.put("iat", now);
        payload.put("exp", now + 600);
        String header = b64.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        String body = b64.encodeToString(MAPPER.writeValueAsBytes(payload));
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec((badSignature ? "wrong" : CLIENT_SECRET).getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String sig = b64.encodeToString(mac.doFinal((header + "." + body).getBytes(StandardCharsets.UTF_8)));
            return header + "." + body + "." + sig;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public static Map<String, String> query(String raw) {
        Map<String, String> out = new HashMap<>();
        if (raw == null || raw.isEmpty()) {
            return out;
        }
        for (String pair : raw.split("&")) {
            int i = pair.indexOf('=');
            String k = i < 0 ? pair : pair.substring(0, i);
            String v = i < 0 ? "" : pair.substring(i + 1);
            out.put(URLDecoder.decode(k, StandardCharsets.UTF_8), URLDecoder.decode(v, StandardCharsets.UTF_8));
        }
        return out;
    }

    public static Map<String, String> query(URI uri) {
        return query(uri.getRawQuery());
    }

    private static String enc(String v) {
        return URLEncoder.encode(v == null ? "" : v, StandardCharsets.UTF_8);
    }
}
