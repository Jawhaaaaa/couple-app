package mn.aura.couple.common.time;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Тестийн цаг (зөвхөн `e2e` profile — INV-10). `set(t)`-ийн дараа цаг зогсохгүй, `t`-ээс
 * үргэлжлэн урагшилна (60 с хүлээх AC-ууд ажиллахын тулд). `reset()` нь бодит цагт буцаана.
 */
public class MutableClock extends Clock {

    private final Clock base;
    private final AtomicReference<Duration> offset;

    public MutableClock(Clock base) {
        this(base, new AtomicReference<>(Duration.ZERO));
    }

    private MutableClock(Clock base, AtomicReference<Duration> offset) {
        this.base = base;
        this.offset = offset;
    }

    public void set(Instant now) {
        offset.set(Duration.between(base.instant(), now));
    }

    public void reset() {
        offset.set(Duration.ZERO);
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return new MutableClock(base.withZone(zone), offset);
    }

    @Override
    public Instant instant() {
        return base.instant().plus(offset.get());
    }
}
