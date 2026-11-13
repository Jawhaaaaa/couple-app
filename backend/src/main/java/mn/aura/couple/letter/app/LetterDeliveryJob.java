package mn.aura.couple.letter.app;

import mn.aura.couple.common.job.TestRunnableJob;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Товлосон захидлын хүргэлт ба капсулын нээлт (FR-10.1, FR-10.5, AC-44, AC-45, DD-AURA-010): 15 с тутам —
 * хүргэх агшин T-ээс ≤ 1 мин-д «хүргэгдсэн», хүлээн авагчид мэдэгдэл. Хоёулаа битүүмжилсэн капсул нээх огноо
 * (хосын бүсээр) болмогц нээгдэнэ.
 */
@Service
public class LetterDeliveryJob implements TestRunnableJob {

    static final int BATCH = 200;

    private final LetterService letters;
    private final TimeCapsuleService capsules;

    public LetterDeliveryJob(LetterService letters, TimeCapsuleService capsules) {
        this.letters = letters;
        this.capsules = capsules;
    }

    @Scheduled(fixedDelayString = "${aura.jobs.letter-interval:PT15S}")
    @SchedulerLock(name = "letterDelivery", lockAtMostFor = "PT2M")
    public void scheduled() {
        runOnce();
    }

    @Override
    public String name() {
        return "letterDelivery";
    }

    @Override
    public int runOnce() {
        return letters.deliverDue(BATCH) + capsules.openDue(BATCH);
    }
}
