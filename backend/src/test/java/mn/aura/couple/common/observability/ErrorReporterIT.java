package mn.aura.couple.common.observability;

import static mn.aura.couple.HttpTestClient.json;
import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.zip.GZIPInputStream;
import mn.aura.couple.AbstractIntegrationTest;
import mn.aura.itprobe.ObservabilityProbe;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;

/**
 * AC-201: Sentry DSN хоосон бол гадагш илгээлт 0; тохируулсан үед боловсруулаагүй алдаа
 * (ApiErrorHandler → 500) Sentry envelope болж илгээгдэнэ. Sentry-гийн оронд локал stub сервер.
 */
@DisplayName("ErrorReporter (Sentry)")
class ErrorReporterIT {

    /** Stub-д ирсэн envelope-ууд (gzip-ийг задалсан текст). */
    static final List<String> RECEIVED = new CopyOnWriteArrayList<>();
    static final HttpServer STUB = startStub();

    private static HttpServer startStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", exchange -> {
                try (InputStream raw = exchange.getRequestBody()) {
                    String encoding = exchange.getRequestHeaders().getFirst("Content-Encoding");
                    InputStream in = "gzip".equalsIgnoreCase(encoding) ? new GZIPInputStream(raw) : raw;
                    RECEIVED.add(exchange.getRequestURI() + "\n" + new String(in.readAllBytes(), StandardCharsets.UTF_8));
                }
                exchange.sendResponseHeaders(200, -1);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @AfterAll
    static void stopStub() {
        STUB.stop(0);
    }

    static boolean receivedContaining(String marker) {
        return RECEIVED.stream().anyMatch(s -> s.contains(marker));
    }

    @Nested
    @Import(ObservabilityProbe.class)
    @TestPropertySource(properties = "aura.sentry.dsn=")
    @DisplayName("DSN хоосон")
    class Disabled extends AbstractIntegrationTest {

        @Autowired
        ErrorReporter reporter;

        @Test
        @DisplayName("AC-201 DSN хоосон үед алдаа гарахад гадагш илгээлт 0")
        void noOutboundWhenDsnEmpty() throws Exception {
            String marker = "disabled-" + UUID.randomUUID();
            HttpResponse<String> r = send("GET", url("/it/boom?marker=" + marker), null);
            assertThat(r.statusCode()).isEqualTo(500);
            assertThat(json(r).path("code").asText()).isEqualTo("INTERNAL");
            assertThat(r.body()).doesNotContain(marker);

            assertThat(reporter.isEnabled()).isFalse();
            reporter.flush(Duration.ofSeconds(2));
            Thread.sleep(1500);
            assertThat(receivedContaining(marker)).isFalse();
        }
    }

    @Nested
    @Import(ObservabilityProbe.class)
    @DisplayName("DSN тохируулсан")
    class Enabled extends AbstractIntegrationTest {

        @DynamicPropertySource
        static void sentryDsn(DynamicPropertyRegistry registry) {
            registry.add("aura.sentry.dsn", () -> "http://publickey@127.0.0.1:" + STUB.getAddress().getPort() + "/1");
        }

        @Autowired
        ErrorReporter reporter;

        @Test
        @DisplayName("AC-201 DSN тохируулсан үед боловсруулаагүй алдаа Sentry-д илгээгдэнэ")
        void eventSentWhenDsnSet() throws Exception {
            String marker = "enabled-" + UUID.randomUUID();
            HttpResponse<String> r = send("GET", url("/it/boom?marker=" + marker), null);
            assertThat(r.statusCode()).isEqualTo(500);
            assertThat(reporter.isEnabled()).isTrue();

            reporter.flush(Duration.ofSeconds(5));
            long deadline = System.currentTimeMillis() + 10_000;
            while (!receivedContaining(marker) && System.currentTimeMillis() < deadline) {
                Thread.sleep(100);
            }
            assertThat(receivedContaining(marker)).as("stub-д ирсэн envelope").isTrue();
            String envelope = RECEIVED.stream().filter(s -> s.contains(marker)).findFirst().orElseThrow();
            assertThat(envelope).startsWith("/api/1/envelope/");
            assertThat(envelope).contains("IllegalStateException");
        }
    }
}
