package mn.aura.couple.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RealtimeIsolationIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-31 токенгүй CONNECT татгалзагдана")
    void connectRequiresToken() {
        assertThatThrownBy(() -> StompTestClient.connect(port, null)).isInstanceOf(Exception.class);
        assertThatThrownBy(() -> StompTestClient.connect(port, "not-a-jwt")).isInstanceOf(Exception.class);
    }

    @Test
    @DisplayName("AC-31 зөвхөн /user/queue/events; өөр хосын суваг руу SUBSCRIBE → ERROR, өөр хосын үйл явдал ирэхгүй")
    void ownQueueOnly() throws Exception {
        TestUser a = user("rt-a");
        TestUser b = user("rt-b");
        TestUser c = user("rt-c");
        TestUser d = user("rt-d");
        UUID spaceAb = pair(a, b);
        pair(c, d);

        try (StompTestClient bClient = StompTestClient.connect(port, b.token()).events();
             StompTestClient cClient = StompTestClient.connect(port, c.token()).events();
             StompTestClient intruder = StompTestClient.connect(port, d.token())) {
            intruder.subscribe("/topic/couple." + spaceAb);
            assertThat(intruder.nextError(5000)).isNotNull();

            // B-гийн queue-д хүрэх үйл явдал (сэдвийн санал) C-д ирэхгүй
            Thread.sleep(300);
            ok(call(a, "POST", "/couple/theme-proposals", body("theme", "OCEAN")), 201);
            JsonNode forB = bClient.next("couple.updated", 5000);
            assertThat(forB).isNotNull();
            assertThat(forB.path("actorId").asText()).isEqualTo(a.id().toString());
            assertThat(forB.path("id").asText()).isNotBlank();
            assertThat(forB.path("occurredAt").asText()).isNotBlank();
            assertThat(cClient.next("couple.updated", 1500)).isNull();
        }
    }

    @Test
    @DisplayName("AC-31 зөвшөөрөгдөөгүй SEND destination → ERROR")
    void sendWhitelist() throws Exception {
        TestUser a = user("rts-a");
        try (StompTestClient client = StompTestClient.connect(port, a.token())) {
            client.send("/app/admin.metrics", java.util.Map.of("x", 1));
            assertThat(client.nextError(5000)).isNotNull();
        }
    }
}
