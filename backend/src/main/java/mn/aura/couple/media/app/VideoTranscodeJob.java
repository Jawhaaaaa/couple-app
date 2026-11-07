package mn.aura.couple.media.app;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import mn.aura.couple.common.job.JobHandler;
import mn.aura.couple.common.job.JobQueue;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.media.app.UploadSessionService.MediaUploaded;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Видео хөрвүүлэлт (FR-5.1, DD-AURA-014, AC-24): ffmpeg `-c:v libx264 -vf scale=-2:720 -c:a aac
 * -map_metadata -1` (байршил г.м. metadata хасна), poster 1 с-ээс. Хөрвүүлэлт дуустал медиа
 * `PROCESSING` («боловсруулж байна»), дараа нь `READY`. Дурсамжийн видео 60 с-ээс урт бол `FAILED`.
 */
@Component
public class VideoTranscodeJob implements JobHandler {

    public static final String TYPE = "VIDEO_TRANSCODE";
    static final double MAX_MEMORY_SECONDS = 61.0;

    private final JdbcTemplate jdbc;
    private final JobQueue jobs;
    private final MediaStorageService storage;
    private final StorageQuota quota;
    private final CommandRunner runner;
    private final TimeProvider time;

    public VideoTranscodeJob(JdbcTemplate jdbc, JobQueue jobs, MediaStorageService storage, StorageQuota quota,
                             CommandRunner runner, TimeProvider time) {
        this.jdbc = jdbc;
        this.jobs = jobs;
        this.storage = storage;
        this.quota = quota;
        this.runner = runner;
        this.time = time;
    }

    /** Upload дуусахад (ижил транзакц) ажил нэмнэ. */
    @EventListener
    public void onUploaded(MediaUploaded e) {
        if ("VIDEO".equals(e.kind())) {
            jobs.enqueue(TYPE, Map.of("mediaId", e.mediaId().toString(), "purpose", e.purpose()));
        }
    }

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public void handle(JobQueue.Job job) throws Exception {
        UUID mediaId = job.uuid("mediaId");
        Map<String, Object> media = jdbc.queryForMap("SELECT space_id, s3_key, size_bytes, status FROM media WHERE id = ?",
                mediaId);
        if (!"PROCESSING".equals(media.get("status"))) {
            return; // аль хэдийн боловсруулсан эсвэл устгасан
        }
        UUID spaceId = (UUID) media.get("space_id");
        String key = (String) media.get("s3_key");
        Path dir = Files.createTempDirectory("aura-video-");
        try {
            Files.write(dir.resolve("in.bin"), storage.get(key));
            double seconds = probeDuration(dir, "in.bin");
            if ("MEMORY".equals(job.string("purpose")) && seconds > MAX_MEMORY_SECONDS) {
                setFailed(mediaId);
                return;
            }
            require(runner.run(dir, List.of("ffmpeg", "-y", "-v", "error", "-i", "in.bin", "-map_metadata", "-1",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-vf", "scale=-2:'min(720,ih)'",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "out.mp4")), "ffmpeg");
            String at = String.format(Locale.ROOT, "%.2f", Math.min(1.0, seconds / 2));
            require(runner.run(dir, List.of("ffmpeg", "-y", "-v", "error", "-ss", at, "-i", "out.mp4", "-frames:v", "1",
                    "-q:v", "3", "poster.jpg")), "poster");
            String[] size = require(runner.run(dir, List.of("ffprobe", "-v", "error", "-select_streams", "v:0",
                    "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", "out.mp4")), "ffprobe").stdout().strip()
                    .split("x");
            byte[] video = Files.readAllBytes(dir.resolve("out.mp4"));
            byte[] poster = Files.readAllBytes(dir.resolve("poster.jpg"));
            String posterKey = MediaStorageService.key(spaceId, mediaId, "poster");
            storage.put(key, video, "video/mp4");
            storage.put(posterKey, poster, "image/jpeg");
            long stored = video.length + poster.length;
            jdbc.update("""
                    UPDATE media SET mime = 'video/mp4', size_bytes = ?, width = ?, height = ?, duration_ms = ?,
                           variants = jsonb_build_object('poster', ?::text), status = 'READY', updated_at = ?
                     WHERE id = ? AND status = 'PROCESSING'
                    """, stored, Integer.parseInt(size[0].strip()), Integer.parseInt(size[1].strip()),
                    Math.round(seconds * 1000), posterKey, Timestamp.from(time.now()), mediaId);
            quota.adjust(spaceId, stored - ((Number) media.get("size_bytes")).longValue());
        } finally {
            deleteRecursively(dir);
        }
    }

    @Override
    public void onGiveUp(JobQueue.Job job, Exception cause) {
        setFailed(job.uuid("mediaId"));
    }

    private double probeDuration(Path dir, String file) throws IOException, InterruptedException {
        String out = require(runner.run(dir, List.of("ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "csv=p=0", file)), "ffprobe").stdout().strip();
        try {
            return Double.parseDouble(out);
        } catch (NumberFormatException e) {
            throw new IOException("ffprobe-ийн хугацаа уншигдсангүй: " + out, e);
        }
    }

    private void setFailed(UUID mediaId) {
        jdbc.update("UPDATE media SET status = 'FAILED', updated_at = ? WHERE id = ?", Timestamp.from(time.now()), mediaId);
    }

    static CommandRunner.Result require(CommandRunner.Result r, String step) throws IOException {
        if (!r.ok()) {
            throw new IOException(step + " exit=" + r.exitCode() + ": " + r.stderr());
        }
        return r;
    }

    static void deleteRecursively(Path dir) throws IOException {
        try (Stream<Path> paths = Files.walk(dir)) {
            for (Path p : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(p);
            }
        }
    }
}
