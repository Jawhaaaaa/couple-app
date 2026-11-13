package mn.aura.couple.export.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Array;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.media.app.MediaStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

/**
 * Бүтэн экспорт `FULL` (FR-14.5, AC-53, AC-126, AC-30): ZIP — `data/*.json` + `media/` (зураг, видео, дуу) +
 * `index.html`. Зөвхөн хүсэгчийн харах эрхтэй өгөгдөл (INV-04):
 * <ul>
 *   <li>Хамтрагчийн нууц бэлгийн жагсаалт, хуваалцаагүй check-in, надад хүргэгдээгүй захидал, нээгдээгүй капсулын
 *       агуулга, хамтрагчийн deck сонголт, хариулаагүй өдрийн асуултын хариулт — 0</li>
 *   <li>Устгасан ба хугацаа нь дууссан (алга болдог) мессеж — 0 (AC-30, INV-05)</li>
 *   <li>Өөр хосын өгөгдөл — 0 (зөвхөн хүсэлтийн space ба өөрийн SOLO space)</li>
 * </ul>
 */
@Component
public class DataExportJob implements ExportGenerator {

    private static final Logger log = LoggerFactory.getLogger(DataExportJob.class);

    private final NamedParameterJdbcTemplate jdbc;
    private final MediaStorageService storage;
    private final ObjectMapper mapper;
    private final TimeProvider time;

    public DataExportJob(NamedParameterJdbcTemplate jdbc, MediaStorageService storage, ObjectMapper mapper,
                         TimeProvider time) {
        this.jdbc = jdbc;
        this.storage = storage;
        this.mapper = mapper.copy().enable(SerializationFeature.INDENT_OUTPUT);
        this.time = time;
    }

    @Override
    public String kind() {
        return "FULL";
    }

    @Override
    public Output generate(Request r, Path dir) throws Exception {
        Instant now = time.now();
        UUID me = r.userId();
        List<UUID> spaces = new ArrayList<>(jdbc.queryForList("""
                SELECT space_id FROM space_member WHERE user_id = :u AND (space_kind = 'SOLO' OR space_id = :s)
                """, new MapSqlParameterSource("u", me).addValue("s", r.spaceId()), UUID.class));
        if (spaces.isEmpty()) {
            spaces.add(r.spaceId());
        }
        MapSqlParameterSource p = new MapSqlParameterSource("u", me).addValue("s", r.spaceId()).addValue("spaces", spaces)
                .addValue("now", Timestamp.from(now));
        Map<String, Object> data = new LinkedHashMap<>();
        Set<UUID> mediaIds = new LinkedHashSet<>();

        data.put("profile", rows("""
                SELECT u.id, u.email, u.display_name, u.call_name, u.birth_date, u.timezone, u.locale, u.city_name,
                       u.country_code, u.avatar_media_id, u.created_at FROM users u WHERE u.id = :u
                """, p, mediaIds, "avatar_media_id"));
        data.put("preferences", rows("SELECT * FROM user_preference WHERE user_id = :u", p, null));
        data.put("couple", rows("""
                SELECT s.id, s.kind, s.status, s.timezone, s.start_date, s.theme, s.linked_at,
                       (SELECT json_agg(json_build_object('id', u.id, 'displayName', u.display_name))
                          FROM space_member sm JOIN users u ON u.id = sm.user_id WHERE sm.space_id = s.id) AS members
                  FROM space s WHERE s.id = :s
                """, p, null));
        data.put("memories", rows("""
                SELECT m.id, m.author_id, m.title, m.description, m.occurred_on, m.location_name, m.lat, m.lon, m.city,
                       m.country_code, m.date_plan_id, m.created_at,
                       (SELECT json_agg(mm.media_id ORDER BY mm.position) FROM memory_media mm WHERE mm.memory_id = m.id) AS media,
                       (SELECT json_agg(t.tag) FROM memory_tag t WHERE t.memory_id = m.id) AS tags
                  FROM memory m WHERE m.space_id IN (:spaces) AND m.deleted_at IS NULL ORDER BY m.occurred_on, m.created_at
                """, p, null));
        mediaIds.addAll(jdbc.queryForList("""
                SELECT mm.media_id FROM memory_media mm JOIN memory m ON m.id = mm.memory_id
                 WHERE m.space_id IN (:spaces) AND m.deleted_at IS NULL
                """, p, UUID.class));
        data.put("memoryComments", rows("""
                SELECT c.id, c.memory_id, c.author_id, c.text, c.created_at, c.edited_at FROM memory_comment c
                  JOIN memory m ON m.id = c.memory_id WHERE m.space_id IN (:spaces) AND m.deleted_at IS NULL
                 ORDER BY c.created_at
                """, p, null));
        data.put("memoryPerspectives", rows("""
                SELECT x.id, x.memory_id, x.author_id, x.text, x.audio_media_id, x.created_at FROM memory_perspective x
                  JOIN memory m ON m.id = x.memory_id WHERE m.space_id IN (:spaces) AND m.deleted_at IS NULL
                """, p, mediaIds, "audio_media_id"));
        // AC-30: устгасан ба хугацаа нь дууссан мессеж орохгүй
        data.put("messages", rows("""
                SELECT id, sender_id, kind, text, media_id, location, reply_to_id, edited_at, created_at FROM chat_message
                 WHERE space_id = :s AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > :now)
                 ORDER BY seq
                """, p, mediaIds, "media_id"));
        data.put("dailyQuestions", rows("""
                SELECT q.couple_day, q.question_id, a.user_id, a.text, a.created_at FROM daily_question q
                  JOIN question_answer a ON a.space_id = q.space_id AND a.couple_day = q.couple_day
                 WHERE q.space_id = :s AND (a.user_id = :u OR EXISTS (SELECT 1 FROM question_answer mine
                        WHERE mine.space_id = q.space_id AND mine.couple_day = q.couple_day AND mine.user_id = :u))
                 ORDER BY q.couple_day, a.created_at
                """, p, null));
        data.put("signals", rows("""
                SELECT id, sender_id, kind, text, created_at FROM heart_signal WHERE space_id = :s ORDER BY created_at
                """, p, null));
        data.put("promises", rows("""
                SELECT id, proposer_id, text, status, starts_on, ends_on, outcome_a, outcome_b, created_at
                  FROM shared_promise WHERE space_id = :s ORDER BY created_at
                """, p, null));
        data.put("ideas", rows("SELECT * FROM date_idea WHERE space_id IN (:spaces) ORDER BY created_at", p, null));
        data.put("plans", rows("""
                SELECT id, proposer_id, title, description, category, starts_at, timezone, place_name, lat, lon, status,
                       recurrence, recurrence_until, series_id, occurrence_on, planned_budget_mnt, memory_id, created_at
                  FROM date_plan WHERE space_id IN (:spaces) ORDER BY starts_at
                """, p, null));
        data.put("checklists", rows("""
                SELECT c.id, c.plan_id, c.text, c.done_by, c.done_at FROM checklist_item c JOIN date_plan d ON d.id = c.plan_id
                 WHERE d.space_id IN (:spaces) ORDER BY c.plan_id, c.position
                """, p, null));
        data.put("expenses", rows("SELECT id, plan_id, payer_id, amount_mnt, note, spent_on FROM expense "
                + "WHERE space_id IN (:spaces) ORDER BY spent_on", p, null));
        // Deck: зөвхөн өөрийн сонголт ба тохирол (хамтрагчийнх 0)
        data.put("deckSwipes", rows("SELECT idea_ref, liked, created_at FROM deck_swipe WHERE space_id = :s AND user_id = :u",
                p, null));
        data.put("deckMatches", rows("SELECT idea_ref, matched_at FROM deck_match WHERE space_id = :s", p, null));
        data.put("anniversaries", rows("SELECT * FROM anniversary WHERE space_id IN (:spaces) ORDER BY date", p, null));
        // Нууц бэлэг: зөвхөн өөрийнх (хамтрагчийнх 0)
        data.put("giftIdeas", rows("SELECT id, occasion_key, text, done, created_at FROM gift_idea WHERE owner_id = :u "
                + "AND space_id IN (:spaces) ORDER BY created_at", p, null));
        data.put("lists", rows("SELECT * FROM list_item WHERE space_id IN (:spaces) ORDER BY list_kind, position", p, null));
        data.put("goals", rows("""
                SELECT g.*, (SELECT json_agg(json_build_object('title', s.title, 'doneBy', s.done_by, 'doneAt', s.done_at)
                                ORDER BY s.position) FROM goal_step s WHERE s.goal_id = g.id) AS steps,
                       (SELECT json_agg(json_build_object('userId', c.user_id, 'amountMnt', c.amount_mnt, 'createdAt', c.created_at))
                          FROM goal_contribution c WHERE c.goal_id = g.id) AS contributions
                  FROM goal g WHERE g.space_id IN (:spaces) ORDER BY g.created_at
                """, p, null));
        // Захидал: миний бичсэн бүх (цуцалснаас бусад), надад ирснээс зөвхөн хүргэгдсэн
        data.put("letters", rows("""
                SELECT id, author_id, recipient_id, template, body, deliver_at, occasion_label, status, delivered_at, read_at,
                       created_at,
                       (SELECT json_agg(lm.media_id ORDER BY lm.position) FROM letter_media lm WHERE lm.letter_id = l.id) AS media
                  FROM letter l
                 WHERE l.space_id = :s AND l.status <> 'CANCELLED'
                   AND (l.author_id = :u OR (l.recipient_id = :u AND l.status IN ('DELIVERED', 'READ')))
                 ORDER BY coalesce(l.delivered_at, l.deliver_at, l.created_at)
                """, p, null));
        mediaIds.addAll(jdbc.queryForList("""
                SELECT lm.media_id FROM letter_media lm JOIN letter l ON l.id = lm.letter_id
                 WHERE l.space_id = :s AND l.status <> 'CANCELLED'
                   AND (l.author_id = :u OR (l.recipient_id = :u AND l.status IN ('DELIVERED', 'READ')))
                """, p, UUID.class));
        // Капсул: нээгдсэн бол хэсгүүд, үгүй бол гарчиг ба огноо л (GAP-15)
        data.put("capsules", rows("""
                SELECT c.id, c.title, c.open_on, c.status, c.opened_at,
                       CASE WHEN c.status = 'OPENED' THEN (SELECT json_agg(json_build_object('authorId', x.author_id, 'body', x.body))
                                                              FROM capsule_part x WHERE x.capsule_id = c.id) END AS parts
                  FROM capsule c WHERE c.space_id = :s ORDER BY c.open_on
                """, p, null));
        mediaIds.addAll(jdbc.queryForList("""
                SELECT pm.media_id FROM capsule_part_media pm JOIN capsule c ON c.id = pm.capsule_id
                 WHERE c.space_id = :s AND c.status = 'OPENED'
                """, p, UUID.class));
        // Check-in: өөрийн бүгд, хамтрагчийн зөвхөн хуваалцсан
        data.put("checkIns", rows("""
                SELECT user_id, local_date, level, note, shared FROM check_in
                 WHERE (user_id = :u) OR (space_id = :s AND shared AND user_id <> :u) ORDER BY local_date, user_id
                """, p, null));

        Map<UUID, Map<String, Object>> media = new LinkedHashMap<>();
        if (!mediaIds.isEmpty()) {
            jdbc.query("""
                    SELECT id, kind, mime, s3_key, file_name FROM media
                     WHERE id IN (:ids) AND space_id IN (:spaces) AND status = 'READY'
                    """, new MapSqlParameterSource("ids", mediaIds).addValue("spaces", spaces), rs -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("kind", rs.getString("kind"));
                m.put("mime", rs.getString("mime"));
                m.put("s3Key", rs.getString("s3_key"));
                m.put("fileName", rs.getString("file_name"));
                media.put(rs.getObject("id", UUID.class), m);
            });
        }

        Path file = dir.resolve("aura-export.zip");
        List<Map<String, Object>> mediaIndex = new ArrayList<>();
        try (OutputStream os = Files.newOutputStream(file);
             ZipOutputStream zip = new ZipOutputStream(os, StandardCharsets.UTF_8)) {
            for (Map.Entry<UUID, Map<String, Object>> e : media.entrySet()) {
                String name = "media/" + e.getKey() + extension((String) e.getValue().get("mime"));
                try {
                    byte[] bytes = storage.get((String) e.getValue().get("s3Key"));
                    zip.putNextEntry(new ZipEntry(name));
                    zip.write(bytes);
                    zip.closeEntry();
                    Map<String, Object> idx = new LinkedHashMap<>();
                    idx.put("id", e.getKey());
                    idx.put("kind", e.getValue().get("kind"));
                    idx.put("file", name);
                    idx.put("originalName", e.getValue().get("fileName"));
                    mediaIndex.add(idx);
                } catch (RuntimeException ex) {
                    log.warn("Экспортод медиа уншигдсангүй: media={}", e.getKey(), ex);
                }
            }
            data.put("media", mediaIndex);
            for (Map.Entry<String, Object> e : data.entrySet()) {
                zip.putNextEntry(new ZipEntry("data/" + e.getKey() + ".json"));
                zip.write(mapper.writeValueAsBytes(e.getValue()));
                zip.closeEntry();
            }
            zip.putNextEntry(new ZipEntry("index.html"));
            zip.write(index(data, r.locale(), now).getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        return new Output(file, ("en".equals(r.locale()) ? "Aura export" : "Aura хуулбар") + ".zip", "application/zip");
    }

    /** Мөрүүдийг JSON-д ээлтэй болгоно; `mediaColumns`-ийн утгыг `mediaIds`-д нэмнэ. */
    private List<Map<String, Object>> rows(String sql, MapSqlParameterSource p, Set<UUID> mediaIds, String... mediaColumns) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : jdbc.queryForList(sql, p)) {
            Map<String, Object> clean = new LinkedHashMap<>();
            for (Map.Entry<String, Object> e : row.entrySet()) {
                clean.put(camel(e.getKey()), value(e.getValue()));
            }
            if (mediaIds != null) {
                for (String c : mediaColumns) {
                    if (row.get(c) instanceof UUID id) {
                        mediaIds.add(id);
                    }
                }
            }
            out.add(clean);
        }
        return out;
    }

    private Object value(Object v) {
        try {
            if (v instanceof Timestamp t) {
                return t.toInstant().toString();
            }
            if (v instanceof Date d) {
                return d.toLocalDate().toString();
            }
            if (v instanceof UUID u) {
                return u.toString();
            }
            if (v != null && "org.postgresql.util.PGobject".equals(v.getClass().getName())) {
                String json = v.toString(); // json/jsonb — PGobject.toString() нь утга
                return json == null || json.isEmpty() ? null : mapper.readTree(json);
            }
            if (v instanceof Array a) {
                return a.getArray();
            }
        } catch (Exception e) {
            return String.valueOf(v);
        }
        return v;
    }

    private static String camel(String column) {
        StringBuilder b = new StringBuilder();
        boolean up = false;
        for (char c : column.toCharArray()) {
            if (c == '_') {
                up = true;
            } else {
                b.append(up ? Character.toUpperCase(c) : c);
                up = false;
            }
        }
        return b.toString();
    }

    @SuppressWarnings("unchecked")
    private static String index(Map<String, Object> data, String locale, Instant now) {
        boolean en = "en".equals(locale);
        StringBuilder h = new StringBuilder();
        h.append("<!doctype html><html lang=\"").append(en ? "en" : "mn").append("\"><head><meta charset=\"utf-8\">")
                .append("<title>Aura</title><style>body{font-family:sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem}")
                .append("img{max-width:240px;margin:4px;border-radius:8px}li{margin:.25rem 0}</style></head><body>");
        h.append("<h1>").append(en ? "Your Aura export" : "Таны Aura-гийн хуулбар").append("</h1><p>")
                .append(now.toString()).append("</p><h2>").append(en ? "Contents" : "Агуулга").append("</h2><ul>");
        for (Map.Entry<String, Object> e : data.entrySet()) {
            int count = e.getValue() instanceof List<?> l ? l.size() : 0;
            h.append("<li><a href=\"data/").append(e.getKey()).append(".json\">").append(e.getKey()).append("</a> — ")
                    .append(count).append("</li>");
        }
        h.append("</ul><h2>").append(en ? "Memories" : "Дурсамж").append("</h2>");
        Map<String, String> files = new LinkedHashMap<>();
        for (Map<String, Object> m : (List<Map<String, Object>>) data.get("media")) {
            files.put(String.valueOf(m.get("id")), String.valueOf(m.get("file")));
        }
        for (Map<String, Object> m : (List<Map<String, Object>>) data.get("memories")) {
            h.append("<section><h3>").append(HtmlUtils.htmlEscape(String.valueOf(m.get("title")))).append(" · ")
                    .append(m.get("occurredOn")).append("</h3>");
            if (m.get("description") != null) {
                h.append("<p>").append(HtmlUtils.htmlEscape(String.valueOf(m.get("description")))).append("</p>");
            }
            if (m.get("media") instanceof Iterable<?> ids) {
                for (Object id : ids) {
                    String f = files.get(String.valueOf(id).replace("\"", ""));
                    if (f != null && f.matches(".*\\.(jpg|png|webp|gif)$")) {
                        h.append("<img src=\"").append(f).append("\" alt=\"\">");
                    } else if (f != null) {
                        h.append("<a href=\"").append(f).append("\">").append(f).append("</a> ");
                    }
                }
            }
            h.append("</section>");
        }
        h.append("</body></html>");
        return h.toString();
    }

    static String extension(String mime) {
        return switch (mime == null ? "" : mime.toLowerCase(Locale.ROOT)) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "image/gif" -> ".gif";
            case "video/mp4" -> ".mp4";
            case "video/quicktime" -> ".mov";
            case "audio/mp4" -> ".m4a";
            case "audio/mpeg" -> ".mp3";
            case "audio/ogg" -> ".ogg";
            case "audio/webm" -> ".webm";
            case "application/pdf" -> ".pdf";
            default -> ".bin";
        };
    }
}
