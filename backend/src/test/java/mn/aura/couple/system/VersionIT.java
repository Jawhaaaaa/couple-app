package mn.aura.couple.system;

import static mn.aura.couple.HttpTestClient.json;
import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Утгууд `application-test.yml`-ийн `aura.app.*` (prod-д `AURA_APP_*`). */
class VersionIT extends AbstractSpaceIT {

    private JsonNode version(String query) {
        var r = send("GET", url("/api/v1/version" + query), null);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        return json(r);
    }

    @Test
    @DisplayName("AC-141 /version нэвтрэлтгүй: latest, minVersion, build, commit, татах/store холбоос; шинэ хувилбар бэлэн эсэх")
    void versionInfo() {
        JsonNode v = version("?platform=android&current=1.1.5");
        assertThat(v.path("latest").asText()).isEqualTo("1.2.0");
        assertThat(v.path("minVersion").asText()).isEqualTo("1.1.0");
        assertThat(v.path("build").asText()).isEqualTo("142");
        assertThat(v.path("commitSha").asText()).isEqualTo("830fbfe");
        assertThat(v.path("downloadUrl").asText()).isEqualTo("http://localhost:8090/download");
        assertThat(v.path("storeUrl").asText()).startsWith("https://play.google.com/");
        assertThat(v.path("updateAvailable").asBoolean()).isTrue();
        assertThat(v.path("updateRequired").asBoolean()).isFalse();

        JsonNode old = version("?platform=android&current=1.0.9");
        assertThat(old.path("updateAvailable").asBoolean()).isTrue();
        assertThat(old.path("updateRequired").asBoolean()).isTrue();

        JsonNode same = version("?platform=ios&current=1.2.0");
        assertThat(same.path("updateAvailable").asBoolean()).isFalse();
        assertThat(same.path("updateRequired").asBoolean()).isFalse();
        // 1.10.0 > 1.2.0 (тоогоор харьцуулна, мөрөөр биш)
        assertThat(version("?current=1.10.0").path("updateAvailable").asBoolean()).isFalse();

        // Вэб (PWA) өөрөө шинэчлэгдэнэ — татах/store холбоосгүй
        JsonNode web = version("?platform=web&current=1.1.0");
        assertThat(web.has("downloadUrl")).isFalse();
        assertThat(web.has("storeUrl")).isFalse();
        assertThat(web.path("updateAvailable").asBoolean()).isTrue();

        JsonNode none = version("");
        assertThat(none.path("updateAvailable").asBoolean()).isFalse();
        assertThat(none.path("updateRequired").asBoolean()).isFalse();

        assertThat(send("GET", url("/api/v1/version?current=1.2"), null).statusCode()).isEqualTo(400);
        assertThat(send("GET", url("/api/v1/version?platform=symbian"), null).statusCode()).isEqualTo(400);
    }
}
