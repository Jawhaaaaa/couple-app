package mn.aura.couple.common.job;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ажлын дараалал (DD-AURA-010): `job` хүснэгт, `SELECT … FOR UPDATE SKIP LOCKED` — видео/дуу
 * хөрвүүлэх, экспорт, PDF, ZIP, purge. Гадаад дараалал (Redis, RabbitMQ) Always Free дээр нэмэлт
 * үйлчилгээ тул ашиглахгүй. Амжилтгүй ажил 3 удаа (1, 4, 9 мин) дахин оролдоно.
 */
@Component
public class JobQueue {

    public static final int MAX_ATTEMPTS = 3;
    static final Duration LEASE = Duration.ofMinutes(15);
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {
    };

    public record Job(UUID id, String type, Map<String, Object> payload, int attempts) {

        public String string(String key) {
            Object v = payload.get(key);
            return v == null ? null : v.toString();
        }

        public UUID uuid(String key) {
            String v = string(key);
            return v == null ? null : UUID.fromString(v);
        }
    }

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final TimeProvider time;

    public JobQueue(JdbcTemplate jdbc, ObjectMapper mapper, TimeProvider time) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.time = time;
    }

    /** Дуудагчийн транзакцад нэмнэ — commit болоогүй бол ажил ч үүсэхгүй. */
    public UUID enqueue(String type, Map<String, ?> payload) {
        return enqueue(type, payload, time.now());
    }

    public UUID enqueue(String type, Map<String, ?> payload, Instant runAt) {
        UUID id = Ids.newId();
        jdbc.update("INSERT INTO job (id, type, payload, run_at, status, created_at, updated_at) "
                        + "VALUES (?, ?, ?::jsonb, ?, 'PENDING', ?, ?)", id, type, json(payload), Timestamp.from(runAt),
                Timestamp.from(time.now()), Timestamp.from(time.now()));
        return id;
    }

    /** Нэг ажлыг түрээслэнэ (бусад процесс/thread алгасна). Тасарсан RUNNING-ийн түрээс дуусвал дахин авна. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<Job> claim(List<String> types) {
        Instant now = time.now();
        String in = String.join(",", types.stream().map(t -> "?").toList());
        Object[] args = new Object[types.size() + 2];
        args[0] = Timestamp.from(now);
        args[1] = Timestamp.from(now);
        for (int i = 0; i < types.size(); i++) {
            args[i + 2] = types.get(i);
        }
        List<Job> jobs = jdbc.query("""
                SELECT id, type, payload::text AS payload, attempts FROM job
                 WHERE ((status = 'PENDING' AND run_at <= ?) OR (status = 'RUNNING' AND locked_until < ?))
                   AND type IN (""" + in + ") ORDER BY run_at, id LIMIT 1 FOR UPDATE SKIP LOCKED",
                (rs, i) -> new Job(rs.getObject("id", UUID.class), rs.getString("type"), parse(rs.getString("payload")),
                        rs.getInt("attempts")), args);
        if (jobs.isEmpty()) {
            return Optional.empty();
        }
        Job job = jobs.get(0);
        jdbc.update("UPDATE job SET status = 'RUNNING', attempts = attempts + 1, locked_until = ?, updated_at = ? WHERE id = ?",
                Timestamp.from(now.plus(LEASE)), Timestamp.from(now), job.id());
        return Optional.of(new Job(job.id(), job.type(), job.payload(), job.attempts() + 1));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void done(UUID id) {
        jdbc.update("UPDATE job SET status = 'DONE', locked_until = NULL, updated_at = ? WHERE id = ?",
                Timestamp.from(time.now()), id);
    }

    /** Дахин оролдох эсвэл (MAX_ATTEMPTS-д хүрвэл) FAILED. FAILED бол true. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean failed(Job job, String error) {
        Instant now = time.now();
        boolean last = job.attempts() >= MAX_ATTEMPTS;
        jdbc.update("UPDATE job SET status = ?, run_at = ?, locked_until = NULL, last_error = ?, updated_at = ? WHERE id = ?",
                last ? "FAILED" : "PENDING", Timestamp.from(now.plus(Duration.ofMinutes((long) job.attempts() * job.attempts()))),
                error == null ? null : error.substring(0, Math.min(2000, error.length())), Timestamp.from(now), job.id());
        return last;
    }

    private String json(Map<String, ?> payload) {
        try {
            return mapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private Map<String, Object> parse(String json) {
        try {
            return mapper.readValue(json, MAP);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
