package mn.aura.couple.auth;

import static mn.aura.couple.HttpTestClient.json;
import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.MeterRegistry;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.auth.app.PasswordHasher;
import mn.aura.couple.auth.app.PasswordPolicy;
import mn.aura.couple.common.mail.MailMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** T-17: бүртгэл (FR-1.1, DD-AURA-031). */
@DisplayName("Бүртгэл — RegistrationService")
class RegistrationIT extends AbstractAuthIT {

    @Autowired
    MeterRegistry meters;

    @Autowired
    PasswordPolicy passwordPolicy;

    private double hashCount() {
        return meters.get(PasswordHasher.METRIC).counter().count();
    }

    @Test
    @DisplayName("AC-02 бүртгэлтэй ба шинэ имэйлд статус, бие ижил; хоёр замд ч Argon2 hash тооцогдоно; мэдээлэл зөвхөн имэйлээр")
    void timingSafe() {
        String existing = email("bat");
        assertThat(register(existing, PASSWORD, "1995-05-14").statusCode()).isEqualTo(202);

        double before = hashCount();
        HttpResponse<String> again = register(existing, "Another-Pass-77", "1990-01-01");
        double afterExisting = hashCount();
        String fresh = email("dorj");
        HttpResponse<String> created = register(fresh, PASSWORD, "1995-05-14");
        double afterNew = hashCount();

        assertThat(again.statusCode()).isEqualTo(202).isEqualTo(created.statusCode());
        assertThat(again.body()).isEqualTo(created.body()).isEqualTo("{\"accepted\":true}");
        assertThat(again.headers().map().keySet()).isEqualTo(created.headers().map().keySet());
        // Хоёр зам хоёулаа яг нэг Argon2id hash (хугацааны гол зардал) тооцно
        assertThat(afterExisting - before).isEqualTo(1.0);
        assertThat(afterNew - afterExisting).isEqualTo(1.0);

        MailMessage already = lastMail(existing);
        assertThat(already.subject()).contains("аль хэдийн бүртгэлтэй");
        assertThat(already.code()).isNull();
        MailMessage code = lastMail(fresh);
        assertThat(code.code()).matches("\\d{6}");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE email = ?", Integer.class, existing)).isEqualTo(1);
    }

    @Test
    @DisplayName("AC-04 18 хүрээгүй (2008-11-08) → 400 AGE_RESTRICTED, акаунт үүсэхгүй; 2008-11-07 → зөвшөөрнө")
    void adultsOnly() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        String young = email("young");
        HttpResponse<String> rejected = register(young, PASSWORD, "2008-11-08");
        assertThat(rejected.statusCode()).isEqualTo(400);
        assertThat(code(rejected)).isEqualTo("AGE_RESTRICTED");
        assertThat(json(rejected).path("fieldErrors").get(0).path("field").asText()).isEqualTo("birthDate");
        assertThat(json(rejected).path("message").asText()).isNotBlank();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE email = ?", Integer.class, young)).isZero();

        String adult = email("adult");
        assertThat(register(adult, PASSWORD, "2008-11-07").statusCode()).isEqualTo(202);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE email = ?", Integer.class, adult)).isEqualTo(1);
    }

    @Test
    @DisplayName("AC-63 бодлого зөвшөөрөөгүй → 400 POLICY_NOT_ACCEPTED; зөвшөөрсөн хувилбар, огноо хадгалагдана")
    void policyAcceptance() {
        String e1 = email("nopolicy");
        HttpResponse<String> r = register(e1, PASSWORD, "1995-05-14", "2020-01-01");
        assertThat(r.statusCode()).isEqualTo(400);
        assertThat(code(r)).isEqualTo("POLICY_NOT_ACCEPTED");

        Instant now = Instant.parse("2026-11-07T03:00:00Z");
        clock.set(now);
        String e2 = email("policy");
        assertThat(register(e2, PASSWORD, "1995-05-14").statusCode()).isEqualTo(202);
        UUID id = userId(e2);
        Map<String, Object> row = jdbc.queryForMap("SELECT version, accepted_at FROM policy_acceptance WHERE user_id = ?", id);
        assertThat(row.get("version")).isEqualTo(properties.policy().version());
        assertThat(((java.sql.Timestamp) row.get("accepted_at")).toInstant()).isBetween(now, now.plusSeconds(10));
        assertThat(jdbc.queryForObject("SELECT policy_version FROM users WHERE id = ?", String.class, id))
                .isEqualTo(properties.policy().version());
    }

    @Test
    @DisplayName("AC-164 «1234567» → PASSWORD_WEAK, «password1» → PASSWORD_COMMON (сервер ч шалтгаантай), 8+ ховор нууц үг → бүртгэнэ")
    void passwordPolicy() {
        String e1 = email("weak");
        HttpResponse<String> weak = register(e1, "1234567", "1995-05-14");
        assertThat(weak.statusCode()).isEqualTo(400);
        assertThat(code(weak)).isEqualTo("PASSWORD_WEAK");
        assertThat(json(weak).path("fieldErrors").get(0).path("field").asText()).isEqualTo("password");
        assertThat(json(weak).path("fieldErrors").get(0).path("code").asText()).isEqualTo("PASSWORD_WEAK");

        HttpResponse<String> common = register(email("common"), "password1", "1995-05-14");
        assertThat(common.statusCode()).isEqualTo(400);
        assertThat(code(common)).isEqualTo("PASSWORD_COMMON");
        assertThat(register(email("common2"), "PASSWORD123", "1995-05-14").body()).contains("PASSWORD_COMMON");

        String ok = email("strong");
        assertThat(register(ok, "Khuder-Bulag-81", "1995-05-14").statusCode()).isEqualTo(202);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE email IN (?, ?)", Integer.class, e1, ok)).isEqualTo(1);
        assertThat(passwordPolicy.isCommon("qwerty123")).isTrue();
    }

    @Test
    @DisplayName("AC-164 нийтлэг нууц үгийн жагсаалт ≥ 1 000 мөр (DD-AURA-030)")
    void commonListSize() throws Exception {
        try (var in = getClass().getClassLoader().getResourceAsStream("security/common-passwords.txt")) {
            long lines = new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8).lines()
                    .filter(l -> !l.isBlank() && !l.startsWith("#")).count();
            assertThat(lines).isGreaterThanOrEqualTo(1_000);
        }
    }

    @Test
    @DisplayName("DD-AURA-003 бүртгэлд SOLO space үүсч, нууц үг Argon2id-аар хадгалагдана, имэйл баталгаажаагүй")
    void soloSpaceAndHash() {
        String e = email("solo");
        assertThat(register(e, PASSWORD, "1995-05-14").statusCode()).isEqualTo(202);
        UUID id = userId(e);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM space_member sm JOIN space s ON s.id = sm.space_id
                 WHERE sm.user_id = ? AND s.kind = 'SOLO' AND sm.space_kind = 'SOLO' AND sm.left_at IS NULL
                """, Integer.class, id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT password_hash FROM users WHERE id = ?", String.class, id))
                .startsWith("$argon2id$").doesNotContain(PASSWORD);
        assertThat(jdbc.queryForObject("SELECT email_verified_at IS NULL FROM users WHERE id = ?", Boolean.class, id)).isTrue();
    }
}
