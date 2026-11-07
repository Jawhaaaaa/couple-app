package mn.aura.couple.weather;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * IT-ийн Open-Meteo stub — `e2e/mocks/openMeteo.ts`-тэй ижил хариу (forecast ба `/v1/search`).
 * `fail(true)` → 503.
 */
public final class OpenMeteoStub {

    private final HttpServer server;
    private final List<String> requests = new CopyOnWriteArrayList<>();
    private volatile boolean fail;
    private volatile LocalDate firstDay = LocalDate.parse("2026-11-07");

    private OpenMeteoStub() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        server.createContext("/", this::handle);
        server.start();
    }

    public static OpenMeteoStub start() {
        return new OpenMeteoStub();
    }

    public String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    public List<String> requests() {
        return requests;
    }

    public void fail(boolean v) {
        fail = v;
    }

    public void firstDay(LocalDate d) {
        firstDay = d;
    }

    private void handle(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        requests.add(path + "?" + ex.getRequestURI().getRawQuery());
        String body;
        int status = 200;
        if (fail) {
            status = 503;
            body = "{\"error\":true}";
        } else if (path.endsWith("/search")) {
            String q = ex.getRequestURI().getQuery().toLowerCase();
            body = q.contains("name=tok") ? "{\"results\":[{\"id\":2,\"name\":\"Tokyo\",\"latitude\":35.6895,"
                    + "\"longitude\":139.6917,\"country_code\":\"JP\",\"timezone\":\"Asia/Tokyo\"}]}"
                    : "{\"results\":[{\"id\":1,\"name\":\"Улаанбаатар\",\"latitude\":47.9077,\"longitude\":106.8832,"
                    + "\"country_code\":\"MN\",\"timezone\":\"Asia/Ulaanbaatar\"}]}";
        } else {
            StringBuilder days = new StringBuilder();
            StringBuilder nums = new StringBuilder();
            for (int i = 0; i < 16; i++) {
                days.append(i == 0 ? "" : ",").append('"').append(firstDay.plusDays(i)).append('"');
                nums.append(i == 0 ? "" : ",").append(3);
            }
            body = "{\"current\":{\"temperature_2m\":-18.4,\"weather_code\":71,\"is_day\":1},\"daily\":{\"time\":[" + days
                    + "],\"temperature_2m_max\":[" + nums.toString().replace("3", "-12") + "],\"temperature_2m_min\":["
                    + nums.toString().replace("3", "-26") + "],\"weather_code\":[" + nums + "]}}";
        }
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(status, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }
}
