package mn.aura.couple.export.app;

import mn.aura.couple.common.job.TestRunnableJob;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** 7 хоног өнгөрсөн экспортын файлыг S3-аас устгаж `EXPIRED` болгоно (AC-126) — цаг тутам. */
@Service
public class ExportExpiryJob implements TestRunnableJob {

    private final DataExportService exports;

    public ExportExpiryJob(DataExportService exports) {
        this.exports = exports;
    }

    @Scheduled(fixedDelayString = "${aura.jobs.export-expiry-interval:PT1H}", initialDelayString = "PT2M")
    @SchedulerLock(name = "exportExpiry", lockAtMostFor = "PT30M")
    public void scheduled() {
        runOnce();
    }

    @Override
    public String name() {
        return "exportExpiry";
    }

    @Override
    public int runOnce() {
        return exports.expire();
    }
}
