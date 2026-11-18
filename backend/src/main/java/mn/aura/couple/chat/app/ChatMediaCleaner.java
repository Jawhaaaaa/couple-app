package mn.aura.couple.chat.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.media.app.MediaStorageService;
import mn.aura.couple.media.app.StorageQuota;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Устгасан/дууссан мессежийн медиаг серверээс устгана (INV-05, AC-30, AC-92): S3 объект (анхны ба хувилбарууд),
 * `media` мөр, квот буцаана. «Дурсамж болгох»-оор (AC-91) дурсамжид орсон эсвэл профайлын зураг болсон медиа
 * өөр эзэнтэй болсон тул үлдэнэ.
 */
@Component
public class ChatMediaCleaner {

    private final NamedParameterJdbcTemplate jdbc;
    private final MediaStorageService storage;
    private final StorageQuota quota;
    private final ObjectMapper mapper;

    public ChatMediaCleaner(NamedParameterJdbcTemplate jdbc, MediaStorageService storage, StorageQuota quota,
                            ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.storage = storage;
        this.quota = quota;
        this.mapper = mapper;
    }

    /** Мессежийн `media_id`-г аль хэдийн NULL болгосны дараа дуудна. */
    public void purge(UUID mediaId) {
        if (mediaId == null) {
            return;
        }
        MapSqlParameterSource p = new MapSqlParameterSource("id", mediaId);
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT x.space_id, x.s3_key, x.variants::text AS variants, x.size_bytes FROM media x
                 WHERE x.id = :id
                   AND NOT EXISTS (SELECT 1 FROM chat_message c WHERE c.media_id = x.id)
                   AND NOT EXISTS (SELECT 1 FROM memory_media mm WHERE mm.media_id = x.id)
                   AND NOT EXISTS (SELECT 1 FROM memory_perspective mp WHERE mp.audio_media_id = x.id)
                   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.avatar_media_id = x.id)
                """, p);
        if (rows.isEmpty()) {
            return;
        }
        Map<String, Object> m = rows.get(0);
        storage.delete((String) m.get("s3_key"));
        String variants = (String) m.get("variants");
        if (variants != null) {
            try {
                mapper.readValue(variants, new TypeReference<Map<String, String>>() {
                }).values().forEach(storage::delete);
            } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                throw new IllegalStateException("media.variants задлах боломжгүй", e);
            }
        }
        jdbc.update("DELETE FROM media WHERE id = :id", p);
        quota.release((UUID) m.get("space_id"), ((Number) m.get("size_bytes")).longValue());
    }
}
