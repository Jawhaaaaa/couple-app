package mn.aura.couple.common.observability;

import static mn.aura.couple.HttpTestClient.json;
import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import mn.aura.couple.AbstractIntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** AC-202: health (liveness/readiness) ба Prometheus metric. */
@DisplayName("Actuator")
class ActuatorIT extends AbstractIntegrationTest {

    @Test
    @DisplayName("AC-202 /actuator/health → 200 UP, liveness ба readiness UP")
    void health() {
        for (String path : new String[] {"/actuator/health", "/actuator/health/liveness", "/actuator/health/readiness"}) {
            HttpResponse<String> r = send("GET", url(path), null);
            assertThat(r.statusCode()).as(path).isEqualTo(200);
            assertThat(json(r).path("status").asText()).as(path).isEqualTo("UP");
        }
    }

    @Test
    @DisplayName("AC-202 /actuator/prometheus → jvm_memory_used_bytes ба http_server_requests")
    void prometheus() {
        send("GET", url("/actuator/health"), null);
        HttpResponse<String> r = send("GET", url("/actuator/prometheus"), null);
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.body()).contains("jvm_memory_used_bytes");
        assertThat(r.body()).contains("http_server_requests_seconds");
    }

    @Test
    @DisplayName("AC-202 бусад actuator endpoint нээлттэй биш (env, beans)")
    void otherEndpointsNotPublic() {
        assertThat(send("GET", url("/actuator/env"), null).statusCode()).isIn(401, 404);
        assertThat(send("GET", url("/actuator/beans"), null).statusCode()).isIn(401, 404);
    }
}
