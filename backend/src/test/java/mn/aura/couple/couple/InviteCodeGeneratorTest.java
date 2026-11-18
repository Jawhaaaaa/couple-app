package mn.aura.couple.couple;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import mn.aura.couple.couple.app.InviteCodeGenerator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class InviteCodeGeneratorTest {

    private final InviteCodeGenerator generator = new InviteCodeGenerator();

    @Test
    @DisplayName("AC-169 1000 код бүгд AURA-XXXX хэлбэртэй, 0/O/1/I агуулахгүй")
    void formatAndAlphabet() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            String code = generator.next();
            assertThat(code).matches("^AURA-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$");
            assertThat(code.substring(5)).doesNotContain("0", "O", "1", "I");
            seen.add(code);
        }
        // 32⁴ орон зайд 1000 үүсгэлт бараг давхцахгүй — санамсаргүй байдлын бүдүүн шалгалт
        assertThat(seen.size()).isGreaterThan(950);
    }

    @Test
    @DisplayName("AC-169 гараар оруулсан кодыг хэвшүүлнэ: жижиг үсэг, зай, угтваргүй")
    void normalize() {
        assertThat(InviteCodeGenerator.normalize("aura-7k3m")).isEqualTo("AURA-7K3M");
        assertThat(InviteCodeGenerator.normalize(" AURA 7K3M ")).isEqualTo("AURA-7K3M");
        assertThat(InviteCodeGenerator.normalize("7k3m")).isEqualTo("AURA-7K3M");
        assertThat(InviteCodeGenerator.normalize("AURA-7K0M")).isNull();
        assertThat(InviteCodeGenerator.normalize("AURA-7K3")).isNull();
        assertThat(InviteCodeGenerator.normalize(null)).isNull();
    }
}
