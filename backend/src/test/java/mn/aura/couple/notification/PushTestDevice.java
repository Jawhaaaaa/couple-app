package mn.aura.couple.notification;

import static mn.aura.couple.HttpTestClient.json;
import static mn.aura.couple.HttpTestClient.send;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.KeyPair;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.function.Function;
import mn.aura.couple.notification.app.WebPushCrypto;

/**
 * Тестийн «хөтөч»: P-256 түлхүүр + auth secret-тэй Web Push subscription, endpoint нь backend-ийн
 * `/test/push-sink` (DD-AURA-027). Ирсэн payload-ыг RFC 8291-ээр тайлж JSON болгоно.
 */
final class PushTestDevice {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    final String sinkId;
    final String endpoint;
    final byte[] publicRaw;
    final byte[] auth;
    private final ECPrivateKey privateKey;
    private final Function<String, String> url;

    private PushTestDevice(String sinkId, String endpoint, KeyPair keys, byte[] auth, Function<String, String> url) {
        this.sinkId = sinkId;
        this.endpoint = endpoint;
        this.publicRaw = WebPushCrypto.raw((ECPublicKey) keys.getPublic());
        this.privateKey = (ECPrivateKey) keys.getPrivate();
        this.auth = auth;
        this.url = url;
    }

    static PushTestDevice create(Function<String, String> url) throws Exception {
        JsonNode sink = json(send("POST", url.apply("/api/v1/test/push-sink"), "{}"));
        byte[] auth = new byte[16];
        new SecureRandom().nextBytes(auth);
        return new PushTestDevice(sink.path("sinkId").asText(), sink.path("endpoint").asText(), WebPushCrypto.generate(),
                auth, url);
    }

    String subscriptionJson() {
        return "{\"kind\":\"WEB\",\"endpoint\":\"" + endpoint + "\",\"keys\":{\"p256dh\":\""
                + WebPushCrypto.b64(publicRaw) + "\",\"auth\":\"" + WebPushCrypto.b64(auth) + "\"},\"localReminders\":false}";
    }

    void respondWith(int status) {
        send("POST", url.apply("/api/v1/test/push-sink/" + sinkId + "/respond"), "{\"status\":" + status + "}");
    }

    /** Тайлсан payload-ууд (`{title, body, deepLink, type, notificationId}`). */
    List<JsonNode> messages() throws Exception {
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode m : json(send("GET", url.apply("/api/v1/test/push-sink/" + sinkId + "/messages"), null))) {
            byte[] body = Base64.getDecoder().decode(m.path("bodyBase64").asText());
            out.add(MAPPER.readTree(WebPushCrypto.decrypt(body, privateKey, publicRaw, auth)));
        }
        return out;
    }

    /** `count` мессеж ирэх хүртэл (даруй илгээлт async) хүлээнэ. */
    List<JsonNode> await(int count, long millis) throws Exception {
        long deadline = System.currentTimeMillis() + millis;
        List<JsonNode> got = messages();
        while (got.size() < count && System.currentTimeMillis() < deadline) {
            Thread.sleep(100);
            got = messages();
        }
        return got;
    }

    JsonNode rawFirst() {
        return json(send("GET", url.apply("/api/v1/test/push-sink/" + sinkId + "/messages"), null)).path(0);
    }
}
