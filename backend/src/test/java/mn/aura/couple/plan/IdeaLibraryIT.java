package mn.aura.couple.plan;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class IdeaLibraryIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-99 «Өвөл» + «Гадаа» шүүлт — зөвхөн тохирох санаа; «Миний санаа болгох» хуулбар, эх өөрчлөгдөхгүй")
    void filterAndAdopt() {
        TestUser a = user("il-a");
        TestUser b = user("il-b");
        pair(a, b);
        JsonNode all = ok(call(a, "GET", "/idea-library"), 200);
        JsonNode winterOutdoor = ok(call(a, "GET", "/idea-library?season=WINTER&setting=OUTDOOR"), 200);
        assertThat(winterOutdoor.size()).isPositive().isLessThan(all.size());
        winterOutdoor.forEach(i -> {
            assertThat(i.path("setting").asText()).isEqualTo("OUTDOOR");
            assertThat(i.path("seasons").toString()).contains("WINTER");
        });
        JsonNode lib = winterOutdoor.get(0);
        String libId = lib.path("id").asText();

        JsonNode copy = ok(call(a, "POST", "/idea-library/" + libId + "/adopt"), 201);
        assertThat(copy.path("libraryId").asText()).isEqualTo(libId);
        assertThat(copy.path("title").asText()).isEqualTo(lib.path("title").asText());
        assertThat(copy.path("setting").asText()).isEqualTo("OUTDOOR");
        // Давтан авахад шинэ хуулбар үүсэхгүй; хамтрагчийн жагсаалтад харагдана
        assertThat(ok(call(b, "POST", "/idea-library/" + libId + "/adopt"), 201).path("id").asText())
                .isEqualTo(copy.path("id").asText());
        assertThat(ok(call(b, "GET", "/ideas"), 200).size()).isEqualTo(1);

        // Хуулбарыг засахад сан хэвээр
        ok(call(a, "PATCH", "/ideas/" + copy.path("id").asText(), body("title", "Манай хувилбар", "version", 0)), 200);
        JsonNode again = ok(call(a, "GET", "/idea-library?season=WINTER&setting=OUTDOOR"), 200);
        assertThat(again.get(0).path("id").asText()).isEqualTo(libId);
        assertThat(again.get(0).path("title").asText()).isEqualTo(lib.path("title").asText());

        assertThat(call(a, "POST", "/idea-library/lib-missing-999/adopt").statusCode()).isEqualTo(404);
    }

    @Test
    @DisplayName("AC-99 сан хэрэглэгчийн хэлээр (locale=en) ба алс зайн шүүлт")
    void localeAndLongDistance() {
        TestUser a = user("ie-a");
        JsonNode en = ok(call(a, "GET", "/idea-library?locale=en&longDistance=true"), 200);
        assertThat(en.size()).isPositive();
        en.forEach(i -> assertThat(i.path("longDistance").asBoolean()).isTrue());
        JsonNode mn = ok(call(a, "GET", "/idea-library?locale=mn&longDistance=true"), 200);
        assertThat(en.get(0).path("id").asText()).isEqualTo(mn.get(0).path("id").asText());
        assertThat(en.get(0).path("title").asText()).isNotEqualTo(mn.get(0).path("title").asText());
    }
}
