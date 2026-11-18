package mn.aura.couple.media.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import mn.aura.couple.common.job.JobHandler;
import mn.aura.couple.common.job.JobQueue;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.media.app.UploadSessionService.MediaUploaded;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Дуу хөрвүүлэлт (FR-6.1, DD-AURA-014, AC-32, AC-158): iOS-ийн mp4/AAC, хөтчийн MediaRecorder-ийн webm/opus, ogg г.м.
 * бүх дуут мессеж ба өнцгийн дууг нэг формат — AAC m4a (mono 64 kbps, `-map_metadata -1`) — болгоно; Safari ч,
 * Android ч тоглуулна. Хамт 64 цэгийн долгион (`waveform`, 0–1) тооцож `MediaRef.waveform`-д өгнө.
 * Хөрвүүлэлт дуустал медиа `PROCESSING`, дараа нь `READY`. Бодит урт 5 минутаас (300 с) хэтэрвэл `FAILED` —
 * client-ийн зарласан `durationMs`-д найдахгүй.
 */
@Component
public class AudioTranscodeJob implements JobHandler {

    public static final String TYPE = "AUDIO_TRANSCODE";
    /** 5 мин + кодлолын бага зэргийн зөрүү. */
    static final double MAX_SECONDS = 300.5;
    static final int WAVEFORM_POINTS = 64;
    static final int PCM_RATE = 8000;
    /** Хөрвүүлэх зорилго — `FILE` хавсралтын дуу нь файл хэвээр (татаж авна). */
    private static final Set<String> PURPOSES = Set.of("VOICE", "PERSPECTIVE_AUDIO");

    private final JdbcTemplate jdbc;
    private final JobQueue jobs;
    private final MediaStorageService storage;
    private final StorageQuota quota;
    private final CommandRunner runner;
    private final ObjectMapper mapper;
    private final TimeProvider time;

    public AudioTranscodeJob(JdbcTemplate jdbc, JobQueue jobs, MediaStorageService storage, StorageQuota quota,
                             CommandRunner runner, ObjectMapper mapper, TimeProvider time) {
        this.jdbc = jdbc;
        this.jobs = jobs;
        this.storage = storage;
        this.quota = quota;
        this.runner = runner;
        this.mapper = mapper;
        this.time = time;
    }

    /** Upload-ийн дараа энэ медиа хөрвүүлэгдэх үү (тэгвэл `PROCESSING`-ээр бичигдэнэ). */
    public static boolean transcodes(String kind, String purpose) {
        return "AUDIO".equals(kind) && PURPOSES.contains(purpose);
    }

    /** Upload дуусахад (ижил транзакц) ажил нэмнэ. */
    @EventListener
    public void onUploaded(MediaUploaded e) {
        if (transcodes(e.kind(), e.purpose())) {
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
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT space_id, s3_key, size_bytes, status FROM media WHERE id = ?", mediaId);
        if (rows.isEmpty() || !"PROCESSING".equals(rows.get(0).get("status"))) {
            return; // аль хэдийн боловсруулсан эсвэл устгасан
        }
        Map<String, Object> media = rows.get(0);
        UUID spaceId = (UUID) media.get("space_id");
        String key = (String) media.get("s3_key");
        Path dir = Files.createTempDirectory("aura-audio-");
        try {
            Files.write(dir.resolve("in.bin"), storage.get(key));
            double seconds = probeDuration(dir, "in.bin");
            if (seconds > MAX_SECONDS) {
                setFailed(mediaId);
                return;
            }
            VideoTranscodeJob.require(runner.run(dir, List.of("ffmpeg", "-y", "-v", "error", "-i", "in.bin", "-vn",
                    "-map_metadata", "-1", "-ac", "1", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart",
                    "out.m4a")), "ffmpeg");
            VideoTranscodeJob.require(runner.run(dir, List.of("ffmpeg", "-y", "-v", "error", "-i", "out.m4a", "-ac", "1",
                    "-ar", String.valueOf(PCM_RATE), "-f", "s16le", "-acodec", "pcm_s16le", "pcm.raw")), "pcm");
            byte[] audio = Files.readAllBytes(dir.resolve("out.m4a"));
            double[] waveform = waveform(Files.readAllBytes(dir.resolve("pcm.raw")), WAVEFORM_POINTS);
            storage.put(key, audio, "audio/mp4");
            jdbc.update("""
                    UPDATE media SET mime = 'audio/mp4', size_bytes = ?, duration_ms = ?, waveform = ?::jsonb,
                           status = 'READY', updated_at = ?
                     WHERE id = ? AND status = 'PROCESSING'
                    """, (long) audio.length, Math.round(seconds * 1000), json(waveform),
                    Timestamp.from(time.now()), mediaId);
            quota.adjust(spaceId, audio.length - ((Number) media.get("size_bytes")).longValue());
        } finally {
            VideoTranscodeJob.deleteRecursively(dir);
        }
    }

    @Override
    public void onGiveUp(JobQueue.Job job, Exception cause) {
        setFailed(job.uuid("mediaId"));
    }

    /**
     * 16 битийн mono PCM-ээс `points` цэгийн долгион: хэсэг бүрийн RMS-ийг хамгийн их утгаар хэвийнжүүлж
     * 0–1 (2 оронтой) болгоно. Чимээгүй бичлэг → бүгд 0.
     */
    static double[] waveform(byte[] pcm, int points) {
        int samples = pcm.length / 2;
        double[] out = new double[points];
        if (samples == 0) {
            return out;
        }
        ByteBuffer buf = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN);
        double max = 0;
        for (int p = 0; p < points; p++) {
            int from = (int) ((long) samples * p / points);
            int to = Math.max(from + 1, (int) ((long) samples * (p + 1) / points));
            double sum = 0;
            int n = 0;
            for (int i = from; i < to && i < samples; i++) {
                double v = buf.getShort(i * 2) / 32768.0;
                sum += v * v;
                n++;
            }
            out[p] = n == 0 ? 0 : Math.sqrt(sum / n);
            max = Math.max(max, out[p]);
        }
        for (int p = 0; p < points; p++) {
            out[p] = max == 0 ? 0 : Math.round(Math.min(1.0, out[p] / max) * 100) / 100.0;
        }
        return out;
    }

    private double probeDuration(Path dir, String file) throws IOException, InterruptedException {
        String out = VideoTranscodeJob.require(runner.run(dir, List.of("ffprobe", "-v", "error", "-show_entries",
                "format=duration", "-of", "csv=p=0", file)), "ffprobe").stdout().strip();
        try {
            return Double.parseDouble(out);
        } catch (NumberFormatException e) {
            throw new IOException("ffprobe-ийн хугацаа уншигдсангүй: " + out, e);
        }
    }

    private String json(double[] waveform) {
        List<Double> list = new ArrayList<>(waveform.length);
        for (double v : waveform) {
            list.add(v);
        }
        try {
            return mapper.writeValueAsString(list);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private void setFailed(UUID mediaId) {
        jdbc.update("UPDATE media SET status = 'FAILED', updated_at = ? WHERE id = ?", Timestamp.from(time.now()), mediaId);
    }
}
