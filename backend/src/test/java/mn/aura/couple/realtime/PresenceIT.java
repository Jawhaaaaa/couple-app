package mn.aura.couple.realtime;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.realtime.app.PresenceService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class PresenceIT extends AbstractSpaceIT {

    @Autowired
    PresenceService presence;

    @Test
    @DisplayName("AC-70 хоёулаа харуулж байвал хамтрагчийн онлайн төлөв ирнэ; A унтраавал хоёр тал хоёулаа харахгүй")
    void symmetricVisibility() throws Exception {
        TestUser a = user("pres-a");
        TestUser b = user("pres-b");
        pair(a, b);
        try (StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            try (StompTestClient aClient = StompTestClient.connect(port, a.token()).events()) {
                JsonNode online = bClient.next("presence.changed", 5000);
                assertThat(online).isNotNull();
                assertThat(online.path("actorId").asText()).isEqualTo(a.id().toString());
                assertThat(online.path("payload").path("online").asBoolean()).isTrue();
                assertThat(presence.onlineFor(b.id(), a.id())).contains(true);

                jdbc.update("UPDATE users SET online_visible = false WHERE id = ?", a.id());
                assertThat(presence.onlineFor(b.id(), a.id())).isEmpty();
                assertThat(presence.onlineFor(a.id(), b.id())).isEmpty();
            }
            // A салсан ч төлөв нуугдсан тул B-д үйл явдал ирэхгүй
            assertThat(bClient.next("presence.changed", 1500)).isNull();
        }
    }

    @Test
    @DisplayName("AC-177 «бичиж байна» — хоёулаа асаалттай үед л хамтрагчид ирнэ")
    void typingSymmetry() throws Exception {
        TestUser a = user("typ-a");
        TestUser b = user("typ-b");
        pair(a, b);
        try (StompTestClient aClient = StompTestClient.connect(port, a.token()).events();
             StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            aClient.send("/app/typing", Map.of("typing", true));
            JsonNode typing = bClient.next("chat.typing", 5000);
            assertThat(typing).isNotNull();
            assertThat(typing.path("payload").path("typing").asBoolean()).isTrue();

            jdbc.update("UPDATE users SET typing_visible = false WHERE id = ?", b.id());
            aClient.send("/app/typing", Map.of("typing", true));
            assertThat(bClient.next("chat.typing", 1500)).isNull();
            bClient.send("/app/typing", Map.of("typing", true));
            assertThat(aClient.next("chat.typing", 1500)).isNull();
        }
    }
}
