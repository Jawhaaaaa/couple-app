package mn.aura.couple.common.time;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.springframework.stereotype.Component;

/**
 * Бүх цагийн цорын ганц эх (DD-AURA-011, TQ-02). `Instant.now()`/`LocalDate.now()`-г шууд
 * бүү дууд — `e2e` profile-д `MutableClock`-оор цагийг `/test/clock`-оор хөдөлгөнө.
 */
@Component
public class TimeProvider {

    private final Clock clock;

    public TimeProvider(Clock clock) {
        this.clock = clock;
    }

    public Clock clock() {
        return clock;
    }

    public Instant now() {
        return clock.instant();
    }

    /** UTC (INV-08) — DB-ийн `timestamptz` ба API-ийн `date-time`. */
    public OffsetDateTime nowUtc() {
        return OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
    }

    /** Тухайн бүсийн «өнөөдөр» (хосын эсвэл хэрэглэгчийн timezone). */
    public LocalDate today(ZoneId zone) {
        return LocalDate.ofInstant(clock.instant(), zone);
    }
}
