package mn.aura.couple.common.mail;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MailLayoutTest {

    private static final String BASE = "https://aura.example";

    @Test
    @DisplayName("Код нэг тасралтгүй текстээр (iOS-ийн код бөглөлт, E2E задлалт), холбоос товч болон текстээр")
    void codeAndLink() {
        String html = MailLayout.render(BASE, new MailLayout.Content("mn", "Баталгаажуулах код", "Кодыг оруулна уу.",
                "482913", "15 минутын дотор хүчинтэй", "Имэйл баталгаажуулах", BASE + "/verify-email?token=a&email=b",
                "Эсвэл энэ холбоосыг нээнэ үү:", "Та бүртгүүлээгүй бол үл тоомсорлоорой."));

        assertThat(html).contains(">482913<");
        assertThat(html).contains("lang=\"mn\"");
        assertThat(html).contains("href=\"https://aura.example/verify-email?token=a&amp;email=b\"");
        assertThat(html).contains("Имэйл баталгаажуулах");
        assertThat(html).contains(BASE + "/icons/icon-192.png");
        assertThat(html).contains("Энэ имэйлийг Aura автоматаар илгээв.");
    }

    @Test
    @DisplayName("Код, товч байхгүй бол тэдгээрийн хэсэг гарахгүй; утга бүр escape хийгдэнэ")
    void optionalPartsAndEscaping() {
        String html = MailLayout.render(BASE, new MailLayout.Content("en", "Hi <b>there</b>", "a & b",
                null, null, null, null, null, null));

        assertThat(html).contains("Hi &lt;b&gt;there&lt;/b&gt;");
        assertThat(html).contains("a &amp; b");
        assertThat(html).doesNotContain("<b>there");
        assertThat(html).doesNotContain("monospace");
        assertThat(html).doesNotContain("border-radius:999px");
        assertThat(html).contains("This email was sent automatically by Aura.");
    }
}
