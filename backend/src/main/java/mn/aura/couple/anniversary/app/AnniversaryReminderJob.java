package mn.aura.couple.anniversary.app;

import java.util.UUID;
import mn.aura.couple.common.job.TestRunnableJob;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ойн сануулгыг дараагийн тохиолдол руу шилжүүлнэ (AC-104): давтагдах ой ба төрсөн өдөр өнгөрөхөд ирэх жилийнх,
 * профайлын төрсөн өдөр эсвэл хосын эхэлсэн өдөр солигдоход шинэ огноогоор. Зөрүүтэй ойг л дахин товлоно.
 */
@Service
public class AnniversaryReminderJob implements TestRunnableJob {

    private final AnniversaryService anniversaries;

    public AnniversaryReminderJob(AnniversaryService anniversaries) {
        this.anniversaries = anniversaries;
    }

    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT5M")
    @SchedulerLock(name = "anniversaryReminders", lockAtMostFor = "PT30M")
    public void scheduled() {
        runOnce();
    }

    @Override
    public String name() {
        return "anniversaryReminders";
    }

    @Override
    @Transactional
    public int runOnce() {
        int changed = 0;
        for (UUID spaceId : anniversaries.spacesWithReminders()) {
            for (AnniversaryService.OccasionRow row : anniversaries.rows(spaceId)) {
                if (!row.reminderDays().isEmpty() && anniversaries.syncReminders(spaceId, row)) {
                    changed++;
                }
            }
        }
        return changed;
    }
}
