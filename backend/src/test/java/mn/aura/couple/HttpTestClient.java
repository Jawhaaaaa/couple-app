package mn.aura.couple;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** Integration тестийн жижиг HTTP туслах (JDK HttpClient — `Origin` толгойг хязгаарладаггүй). */
public final class HttpTestClient {

    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private HttpTestClient() {
    }

    public static HttpResponse<String> send(String method, String url, String jsonBody, String... headers) {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(30));
        if (headers.length > 0) {
            b.headers(headers);
        }
        if (jsonBody != null) {
            b.header("Content-Type", "application/json");
            b.method(method, HttpRequest.BodyPublishers.ofString(jsonBody));
        } else {
            b.method(method, HttpRequest.BodyPublishers.noBody());
        }
        try {
            return CLIENT.send(b.build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    public static HttpResponse<byte[]> getBytes(URI uri) {
        try {
            return CLIENT.send(HttpRequest.newBuilder(uri).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    public static JsonNode json(HttpResponse<String> response) {
        try {
            return MAPPER.readTree(response.body());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
