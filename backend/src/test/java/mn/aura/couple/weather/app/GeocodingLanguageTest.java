package mn.aura.couple.weather.app;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Монгол UI-д хотын нэр кирилл (Open-Meteo-гийн `mn` нь уламжлалт бичиг буцаадаг) — AC-62. */
class GeocodingLanguageTest {

    @Test
    void mongolianUsesCyrillicNames() {
        assertThat(OpenMeteoClient.geocodingLanguage("mn")).isEqualTo("ru");
        assertThat(OpenMeteoClient.geocodingLanguage(null)).isEqualTo("ru");
        assertThat(OpenMeteoClient.geocodingLanguage("en")).isEqualTo("en");
    }
}
