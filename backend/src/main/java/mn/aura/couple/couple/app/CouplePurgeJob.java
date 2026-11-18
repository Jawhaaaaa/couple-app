package mn.aura.couple.couple.app;

import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.common.job.TestRunnableJob;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.media.app.MediaStorageService;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Хосын өгөгдлийн бүрэн устгал (FR-14.6, FR-14.7, DD-AURA-034, AC-54, AC-128, INV-16): `BREAKING` (14 хоног) эсвэл
 * `ORPHANED` (30 хоног) хугацаа дууссан space-ийг `PURGING` болгож (бүх API-аас шууд алга), storage-ийн
 * `spaces/<id>/` бүх объектыг устгаж, DB-ийн мөрийг (бүх домэйны хүснэгт `ON DELETE CASCADE`) устгана.
 * Гишүүд ганцаараа (SOLO) space-тайгаа үлдэнэ. Экспортын файл (`exports/<user>/`) 7 хоногийн хугацаагаараа үлдэнэ.
 */
@Service
public class CouplePurgeJob implements TestRunnableJob {

    private static final Logger log = LoggerFactory.getLogger(CouplePurgeJob.class);

    private final JdbcTemplate jdbc;
    private final MediaStorageService storage;
    private final TransactionTemplate tx;
    private final TimeProvider time;

    public CouplePurgeJob(JdbcTemplate jdbc, MediaStorageService storage, TransactionTemplate tx, TimeProvider time) {
        this.jdbc = jdbc;
        this.storage = storage;
        this.tx = tx;
        this.time = time;
    }

    @Scheduled(fixedDelayString = "${aura.jobs.purge-interval:PT1H}", initialDelayString = "PT3M")
    @SchedulerLock(name = "couplePurge", lockAtMostFor = "PT1H")
    public void scheduled() {
        runOnce();
    }

    @Override
    public String name() {
        return "couplePurge";
    }

    @Override
    public int runOnce() {
        // 1) Хугацаа дууссаныг PURGING болгоно (тусдаа транзакц — API-аас шууд алга болно)
        List<UUID> due = tx.execute(s -> {
            List<UUID> ids = jdbc.queryForList("""
                    SELECT id FROM space WHERE kind = 'COUPLE'
                       AND ((status IN ('BREAKING', 'ORPHANED') AND read_only_until <= ?) OR status = 'PURGING')
                     ORDER BY read_only_until NULLS FIRST LIMIT 50 FOR UPDATE SKIP LOCKED
                    """, UUID.class, Timestamp.from(time.now()));
            for (UUID id : ids) {
                jdbc.update("UPDATE space SET status = 'PURGING', updated_at = ? WHERE id = ?", Timestamp.from(time.now()), id);
            }
            return ids;
        });
        int purged = 0;
        for (UUID spaceId : due == null ? List.<UUID>of() : due) {
            try {
                // 2) Storage (INV-16) — дахин оролдоход аюулгүй
                storage.deletePrefix(MediaStorageService.spacePrefix(spaceId));
                // 3) DB — бүх домэйны мөр cascade-аар
                tx.executeWithoutResult(s -> {
                    jdbc.update("UPDATE users SET avatar_media_id = NULL WHERE avatar_media_id IN "
                            + "(SELECT id FROM media WHERE space_id = ?)", spaceId);
                    jdbc.update("DELETE FROM space WHERE id = ? AND status = 'PURGING'", spaceId);
                });
                purged++;
            } catch (RuntimeException e) {
                log.warn("Хосын устгал амжилтгүй, дараагийн ажиллалтад дахин: space={}", spaceId, e);
            }
        }
        return purged;
    }
}
