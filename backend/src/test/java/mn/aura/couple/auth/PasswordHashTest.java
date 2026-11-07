package mn.aura.couple.auth;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import mn.aura.couple.auth.app.PasswordHasher;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** DD-AURA-030: нууц үгийн hash. */
@DisplayName("Нууц үгийн hash — Argon2id")
class PasswordHashTest {

    private final PasswordHasher hasher = new PasswordHasher(new SimpleMeterRegistry());

    @Test
    @DisplayName("AC-195 Argon2id m=19 MiB, t=2, p=1 — давстай (ижил нууц үг өөр hash), зөв/буруу шалгалт")
    void argon2id() {
        String hash = hasher.hash("Saran-Tsetseg-2026");
        assertThat(hash).startsWith("$argon2id$v=19$m=19456,t=2,p=1$").doesNotContain("Saran");
        assertThat(hasher.hash("Saran-Tsetseg-2026")).isNotEqualTo(hash);
        assertThat(hasher.matches("Saran-Tsetseg-2026", hash)).isTrue();
        assertThat(hasher.matches("saran-tsetseg-2026", hash)).isFalse();
    }

    @Test
    @DisplayName("AC-195 hash байхгүй (OAuth-ийн акаунт) үед false, гэхдээ ижил зардалтай шалгалт хийнэ")
    void missingHash() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        PasswordHasher h = new PasswordHasher(registry);
        assertThat(h.matches("anything", null)).isFalse();
        h.matchesDummy("anything");
        assertThat(registry.get(PasswordHasher.METRIC).counter().count()).isEqualTo(2.0);
    }
}
