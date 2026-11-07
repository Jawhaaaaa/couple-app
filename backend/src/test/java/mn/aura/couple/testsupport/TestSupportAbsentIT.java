package mn.aura.couple.testsupport;

import static mn.aura.couple.HttpTestClient.json;
import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import mn.aura.couple.AbstractIntegrationTest;
import mn.aura.couple.common.time.MutableClock;
import mn.aura.couple.common.time.TimeProvider;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;

/** INV-10, DD-AURA-011: тестийн хэрэгсэл зөвхөн `e2e` profile-д байна. */
@DisplayName("TestSupport — prod-д байхгүй, e2e-д л идэвхтэй")
class TestSupportAbsentIT {

    @Nested
    @ActiveProfiles("prod")
    @DisplayName("prod profile")
    class Prod extends AbstractIntegrationTest {

        @Autowired
        ApplicationContext context;

        @Test
        @DisplayName("INV-10 prod-д GET/PUT /api/v1/test/clock → 404 NOT_FOUND")
        void testEndpointsAbsent() {
            for (String method : new String[] {"GET", "PUT", "DELETE"}) {
                HttpResponse<String> r = send(method, url("/api/v1/test/clock"),
                        "PUT".equals(method) ? "{\"now\":\"2030-01-01T00:00:00Z\"}" : null);
                assertThat(r.statusCode()).as(method).isEqualTo(404);
                assertThat(json(r).path("code").asText()).isEqualTo("NOT_FOUND");
            }
            HttpResponse<String> seed = send("POST", url("/api/v1/test/seed"), "{\"scenario\":\"EMPTY\"}",
                    "Authorization", "Bearer anything");
            assertThat(seed.statusCode()).isEqualTo(404);
        }

        @Test
        @DisplayName("INV-10 prod-д TestSupportController ба MutableClock bean үүсэхгүй")
        void beansAbsent() {
            assertThat(context.getBeansOfType(TestSupportController.class)).isEmpty();
            assertThat(context.getBeansOfType(MutableClock.class)).isEmpty();
            assertThat(context.getBeansOfType(PushSinkStore.class)).isEmpty();
        }
    }

    @Nested
    @ActiveProfiles("e2e")
    @DisplayName("e2e profile")
    class E2e extends AbstractIntegrationTest {

        @Autowired
        TimeProvider time;

        @Test
        @DisplayName("INV-10 e2e-д PUT /test/clock → 204, серверийн цаг шилжинэ; DELETE → бодит цаг")
        void clock() {
            HttpResponse<String> set = send("PUT", url("/api/v1/test/clock"), "{\"now\":\"2030-01-01T00:00:00Z\"}");
            assertThat(set.statusCode()).isEqualTo(204);
            assertThat(time.now()).isBetween(Instant.parse("2030-01-01T00:00:00Z"), Instant.parse("2030-01-01T00:01:00Z"));

            HttpResponse<String> reset = send("DELETE", url("/api/v1/test/clock"), null);
            assertThat(reset.statusCode()).isEqualTo(204);
            assertThat(Duration.between(time.now(), Instant.now()).abs()).isLessThan(Duration.ofSeconds(5));
        }

        @Test
        @DisplayName("INV-10 e2e-д буруу биетэй /test/clock → 400 VALIDATION_FAILED")
        void clockValidation() {
            HttpResponse<String> r = send("PUT", url("/api/v1/test/clock"), "{}");
            assertThat(r.statusCode()).isEqualTo(400);
            assertThat(json(r).path("code").asText()).isEqualTo("VALIDATION_FAILED");
        }

        @Test
        @DisplayName("AC-44 үл мэдэгдэх job → 404 NOT_FOUND")
        void unknownJob() {
            HttpResponse<String> r = send("POST", url("/api/v1/test/jobs/noSuchJob/run"), null);
            assertThat(r.statusCode()).isEqualTo(404);
            assertThat(json(r).path("code").asText()).isEqualTo("NOT_FOUND");
        }

        @Test
        @DisplayName("AC-25 seed stub: EMPTY → 200 хоосон үр дүн, үл мэдэгдэх scenario → 400")
        void seed() {
            HttpResponse<String> ok = send("POST", url("/api/v1/test/seed"), "{\"scenario\":\"EMPTY\"}");
            assertThat(ok.statusCode()).isEqualTo(200);
            assertThat(json(ok).path("users").isArray()).isTrue();
            HttpResponse<String> unknown = send("POST", url("/api/v1/test/seed"), "{\"scenario\":\"NO_SUCH\"}");
            assertThat(unknown.statusCode()).isEqualTo(400);
            assertThat(json(unknown).path("fieldErrors").get(0).path("field").asText()).isEqualTo("scenario");
        }

        @Test
        @DisplayName("AC-154 push sink: үүсгэх → хүлээн авах → унших → 410 хариу тохируулах")
        void pushSink() throws Exception {
            HttpResponse<String> created = send("POST", url("/api/v1/test/push-sink"), null);
            assertThat(created.statusCode()).isEqualTo(201);
            String sinkId = json(created).path("sinkId").asText();
            URI endpoint = URI.create(json(created).path("endpoint").asText());
            assertThat(endpoint.getPath()).isEqualTo("/api/v1/test/push-sink/" + sinkId + "/receive");

            var client = java.net.http.HttpClient.newHttpClient();
            var receive = java.net.http.HttpRequest.newBuilder(URI.create(url(endpoint.getPath())))
                    .header("Content-Type", "application/octet-stream")
                    .header("TTL", "60")
                    .POST(java.net.http.HttpRequest.BodyPublishers.ofByteArray(new byte[] {1, 2, 3}))
                    .build();
            assertThat(client.send(receive, HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(201);

            HttpResponse<String> messages = send("GET", url("/api/v1/test/push-sink/" + sinkId + "/messages"), null);
            assertThat(messages.statusCode()).isEqualTo(200);
            assertThat(json(messages).get(0).path("bodyBase64").asText()).isEqualTo("AQID");
            assertThat(json(messages).get(0).path("headers").path("ttl").asText()).isEqualTo("60");

            HttpResponse<String> respond = send("POST", url("/api/v1/test/push-sink/" + sinkId + "/respond"), "{\"status\":410}");
            assertThat(respond.statusCode()).isEqualTo(204);
            assertThat(client.send(receive, HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(410);

            HttpResponse<String> missing = send("GET", url("/api/v1/test/push-sink/00000000-0000-0000-0000-000000000000/messages"), null);
            assertThat(missing.statusCode()).isEqualTo(404);
        }

        @Test
        @DisplayName("AC-01 /test/mail/last — имэйл барих механизм нэмэгдтэл 404")
        void lastMail() {
            HttpResponse<String> r = send("GET", url("/api/v1/test/mail/last?to=bat@example.mn"), null);
            assertThat(r.statusCode()).isEqualTo(404);
        }
    }
}
