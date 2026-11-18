package mn.aura.couple.memory;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MemoryGroupIT extends AbstractMemoryIT {

    @Test
    @DisplayName("AC-81 «Анхны аялал» бүлэгт 2 дурсамж → бүлгийн хуудсанд 2; бүлэг устахад дурсамж хэвээр")
    void groups() {
        TestUser a = user("grp-a");
        TestUser b = user("grp-b");
        pair(a, b);
        JsonNode group = ok(call(a, "POST", "/memory-groups", body("name", "Анхны аялал")), 201);
        String gid = group.path("id").asText();
        String m1 = memory(a, "Нэг", "2025-06-01", "\"groupIds\":[\"" + gid + "\"]").path("id").asText();
        String m2 = memory(b, "Хоёр", "2025-06-02", null).path("id").asText();
        ok(call(b, "PUT", "/memory-groups/" + gid + "/memories/" + m2), 204);

        JsonNode detail = ok(call(b, "GET", "/memory-groups/" + gid), 200);
        assertThat(detail.path("count").asInt()).isEqualTo(2);
        assertThat(detail.path("memories")).hasSize(2);
        assertThat(ok(call(a, "GET", "/memories?groupId=" + gid), 200).path("items")).hasSize(2);
        assertThat(ok(call(a, "GET", "/memories/" + m1), 200).path("groups").path(0).path("name").asText()).isEqualTo("Анхны аялал");

        JsonNode renamed = ok(call(b, "PATCH", "/memory-groups/" + gid, "{\"name\":\"2025 зун\",\"version\":0}"), 200);
        assertThat(renamed.path("name").asText()).isEqualTo("2025 зун");
        assertThat(call(a, "PATCH", "/memory-groups/" + gid, "{\"name\":\"x\",\"version\":0}").statusCode()).isEqualTo(409);

        ok(call(a, "DELETE", "/memory-groups/" + gid), 204);
        assertThat(ok(call(a, "GET", "/memories"), 200).path("items")).hasSize(2);
        assertThat(call(a, "GET", "/memory-groups/" + gid).statusCode()).isEqualTo(404);
    }
}
