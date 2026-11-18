package mn.aura.couple.testsupport;

import java.util.Map;
import mn.aura.couple.api.model.SeedResult;

/**
 * `POST /test/seed`-ийн нэг scenario (жишээ `COUPLE_BASIC`). Домэйн бүр өөрийн scenario-г
 * `@Profile("e2e")` bean болгон нэмнэ (T-16 ба домэйн нэгжүүд).
 */
public interface TestSeedScenario {

    /** Гэрээний `SeedRequest.scenario` (`^[A-Z0-9_]+$`). */
    String name();

    SeedResult seed(Map<String, Object> params);
}
