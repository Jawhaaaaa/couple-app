package mn.aura.couple.media.app;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Font;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

/**
 * T-32: backend image-ийн шаардлага. Бодит `docker build`/`buildx --platform linux/arm64` нь хаалганд
 * (AC-161); энд Dockerfile-ийн агуулга ба PDF-ийн фонт classpath-д Монгол үсэгтэй байгааг шалгана.
 */
class DockerImageTest {

    private static final List<String> FONTS = List.of("Nunito_400Regular.ttf", "Nunito_700Bold.ttf",
            "PlayfairDisplay_400Regular.ttf", "PlayfairDisplay_400Regular_Italic.ttf");

    @Test
    @DisplayName("AC-161 runtime image ffmpeg, fontconfig-той, multi-arch суурьтай (jammy), root биш")
    void dockerfile() throws Exception {
        String df = Files.readString(Path.of("../Dockerfile"));
        assertThat(df).contains("FROM eclipse-temurin:21-jre-jammy");
        assertThat(df).contains("ffmpeg").contains("fontconfig").contains("wget");
        assertThat(df).contains("USER aura");
        assertThat(df).doesNotContain("alpine");
    }

    @Test
    @DisplayName("AC-26 PDF-ийн фонт classpath-д, «Өнөөдөр Үүрийн гэгээ» fallback-гүй")
    void fontsHaveCyrillic() throws Exception {
        for (String name : FONTS) {
            try (InputStream in = new ClassPathResource("fonts/" + name).getInputStream()) {
                Font font = Font.createFont(Font.TRUETYPE_FONT, in);
                assertThat(font.canDisplayUpTo("Өнөөдөр Үүрийн гэгээ")).as(name).isEqualTo(-1);
            }
        }
    }
}
