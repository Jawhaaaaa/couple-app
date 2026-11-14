package mn.aura.couple.account;

import static mn.aura.couple.HttpTestClient.json;
import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
import java.util.regex.Pattern;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PolicyIT extends AbstractSpaceIT {

    /** `mobile/src/platform/__tests__/policy-guards.test.ts`-ийн FALSE_SECURITY-тэй ижил (AC-193, INV-09). */
    static final Pattern FALSE_SECURITY = Pattern.compile(
            "end[\\s-]?to[\\s-]?end|\\bE2EE?\\b|encrypted locally|encrypted end|төгсгөлөөс төгсгөл|шифрлэгдсэн",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    private JsonNode policy(String query) {
        var r = send("GET", url("/api/v1/policies/current" + query), null);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        return json(r);
    }

    @Test
    @DisplayName("AC-130 /policies/current нэвтрэлтгүй: монгол ба англи бодлого, нөхцөл; админ/гуравдагч этгээдийн дүрэм, 18+, хууль бус агуулгын хориг; худал шифрлэлтийн мэдэгдэл 0")
    void currentPolicy() {
        String version = properties.policy().version();
        JsonNode mn = policy("");
        assertThat(mn.path("version").asText()).isEqualTo(version);
        assertThat(OffsetDateTime.parse(mn.path("publishedAt").asText()).toLocalDate().toString()).isEqualTo(version);
        String privacyMn = mn.path("privacyMarkdown").asText();
        String termsMn = mn.path("termsMarkdown").asText();
        assertThat(privacyMn).startsWith("# Aura — Нууцлалын бодлого").contains("18", "Ноорог (GAP-05)", "админ",
                "Гуравдагч этгээд", "TLS").doesNotContain("<!--").doesNotContain("Privacy Policy");
        assertThat(termsMn).startsWith("# Aura — Үйлчилгээний нөхцөл").contains("Хориотой агуулга", "18", "түдгэлзүүлж");

        JsonNode en = policy("?locale=en");
        assertThat(en.path("version").asText()).isEqualTo(version);
        assertThat(en.path("privacyMarkdown").asText()).startsWith("# Aura — Privacy Policy")
                .contains("aged 18", "Service administrators", "Third parties", "TLS").doesNotContain("Нууцлал");
        assertThat(en.path("termsMarkdown").asText()).startsWith("# Aura — Terms of Service").contains("Prohibited content");
        assertThat(policy("?locale=mn").path("privacyMarkdown").asText()).isEqualTo(privacyMn);

        for (String text : new String[] {privacyMn, termsMn, en.path("privacyMarkdown").asText(), en.path("termsMarkdown").asText()}) {
            assertThat(FALSE_SECURITY.matcher(text).find()).as(text).isFalse();
        }
        assertThat(send("GET", url("/api/v1/policies/current?locale=fr"), null).statusCode()).isEqualTo(400);
    }

    @Test
    @DisplayName("AC-63 бүртгэлд зөвшөөрсөн хувилбар хадгалагдана; шинэ хувилбар гарвал policyUpdateRequired, одоогийнхыг зөвшөөрөхөд арилна")
    void acceptance() {
        String version = policy("").path("version").asText();
        var old = register(email("pol-old"), PASSWORD, "1995-05-14", "2020-01-01");
        assertThat(old.statusCode()).isEqualTo(400);
        assertThat(code(old)).isEqualTo("POLICY_NOT_ACCEPTED");

        TestUser u = user("pol");
        JsonNode me = ok(call(u, "GET", "/me"), 200);
        assertThat(me.path("policyVersionAccepted").asText()).isEqualTo(version);
        assertThat(me.path("policyUpdateRequired").asBoolean()).isFalse();
        assertThat(jdbc.queryForObject("SELECT policy_accepted_at IS NOT NULL FROM users WHERE id = ?", Boolean.class, u.id()))
                .isTrue();

        // Серверт шинэ хувилбар нийтлэгдсэн мэт: хэрэглэгчийн зөвшөөрсөн хувилбар хуучирсан
        jdbc.update("UPDATE users SET policy_version = '2020-01-01' WHERE id = ?", u.id());
        assertThat(ok(call(u, "GET", "/me"), 200).path("policyUpdateRequired").asBoolean()).isTrue();

        var wrong = call(u, "POST", "/me/policy-acceptance", body("version", "2020-01-01"));
        assertThat(wrong.statusCode()).isEqualTo(400);
        assertThat(code(wrong)).isEqualTo("POLICY_NOT_ACCEPTED");
        ok(call(u, "POST", "/me/policy-acceptance", body("version", version)), 204);
        me = ok(call(u, "GET", "/me"), 200);
        assertThat(me.path("policyUpdateRequired").asBoolean()).isFalse();
        assertThat(me.path("policyVersionAccepted").asText()).isEqualTo(version);
    }
}
