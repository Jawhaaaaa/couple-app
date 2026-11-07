package mn.aura.couple.common.job;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import mn.aura.couple.common.observability.ErrorReporter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * `job` хүснэгтийг 5 с тутам боловсруулна (DD-AURA-010). `SKIP LOCKED`-оор түрээслэх тул ShedLock
 * шаардлагагүй. E2E/IT-д `POST /test/jobs/jobs/run` нь бэлэн бүх ажлыг шууд гүйцэтгэнэ.
 */
@Component
public class JobRunner implements TestRunnableJob {

    private static final Logger log = LoggerFactory.getLogger(JobRunner.class);
    static final int BATCH = 20;

    private final JobQueue queue;
    private final Map<String, JobHandler> handlers = new LinkedHashMap<>();
    private final ErrorReporter errors;

    public JobRunner(JobQueue queue, List<JobHandler> handlers, ErrorReporter errors) {
        this.queue = queue;
        handlers.forEach(h -> this.handlers.put(h.type(), h));
        this.errors = errors;
    }

    @Scheduled(fixedDelayString = "${aura.jobs.interval:PT5S}")
    public void scheduled() {
        runOnce();
    }

    @Override
    public String name() {
        return "jobs";
    }

    @Override
    public int runOnce() {
        if (handlers.isEmpty()) {
            return 0;
        }
        List<String> types = List.copyOf(handlers.keySet());
        int processed = 0;
        for (int i = 0; i < BATCH; i++) {
            Optional<JobQueue.Job> next = queue.claim(types);
            if (next.isEmpty()) {
                break;
            }
            JobQueue.Job job = next.get();
            JobHandler handler = handlers.get(job.type());
            try {
                handler.handle(job);
                queue.done(job.id());
            } catch (Exception e) {
                log.warn("Ажил амжилтгүй: type={} id={} attempt={}", job.type(), job.id(), job.attempts(), e);
                if (queue.failed(job, e.toString())) {
                    errors.report(e);
                    handler.onGiveUp(job, e);
                }
            }
            processed++;
        }
        return processed;
    }
}
