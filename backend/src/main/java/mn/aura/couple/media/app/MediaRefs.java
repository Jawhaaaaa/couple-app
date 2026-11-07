package mn.aura.couple.media.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.net.URI;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.MediaRef;
import mn.aura.couple.api.model.MediaRefUrls;
import mn.aura.couple.api.model.NullableMediaRef;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Гэрээний `MediaRef` (DD-AURA-013): `media` мөрөөс 15 минутын presigned GET URL-тай.
 * `media.s3_key` нь анхны файл, `variants` jsonb нь `{"sm": key, "md": key, "lg": key, "poster": key}`.
 * Space-ийн шүүлтийг дуудагч хийнэ — энд зөвхөн дуудагчийн space-ийн media ID ирнэ (DD-AURA-004).
 */
@Component
public class MediaRefs {

    private static final TypeReference<Map<String, String>> VARIANTS = new TypeReference<>() {
    };
    private static final TypeReference<List<BigDecimal>> WAVEFORM = new TypeReference<>() {
    };

    private final NamedParameterJdbcTemplate jdbc;
    private final MediaStorageService storage;
    private final TimeProvider time;
    private final ObjectMapper mapper;

    public MediaRefs(NamedParameterJdbcTemplate jdbc, MediaStorageService storage, TimeProvider time,
                     ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.storage = storage;
        this.time = time;
        this.mapper = mapper;
    }

    public Optional<MediaRef> find(UUID mediaId) {
        if (mediaId == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(findAll(List.of(mediaId)).get(mediaId));
    }

    /** Space-д хамаарах эсэхийг шалгаж уншина (өөр space → хоосон, DD-AURA-004). */
    public Optional<MediaRef> findInSpace(UUID mediaId, UUID spaceId) {
        if (mediaId == null) {
            return Optional.empty();
        }
        List<UUID> ids = jdbc.queryForList("SELECT id FROM media WHERE id = :id AND space_id = :space",
                new MapSqlParameterSource("id", mediaId).addValue("space", spaceId), UUID.class);
        return ids.isEmpty() ? Optional.empty() : find(mediaId);
    }

    /** Олон медиаг нэг хайлтаар (жагсаалтын N+1-ээс сэргийлнэ). Олдоогүй ID map-д орохгүй. */
    public Map<UUID, MediaRef> findAll(Collection<UUID> mediaIds) {
        if (mediaIds == null || mediaIds.isEmpty()) {
            return Map.of();
        }
        OffsetDateTime expires = OffsetDateTime.ofInstant(time.now().plus(storage.presignTtl()), ZoneOffset.UTC);
        Map<UUID, MediaRef> result = new LinkedHashMap<>();
        jdbc.query("""
                SELECT id, kind, status, mime, size_bytes, file_name, s3_key, variants::text AS variants, blurhash,
                       width, height, duration_ms, waveform::text AS waveform
                  FROM media WHERE id IN (:ids)
                """, new MapSqlParameterSource("ids", mediaIds), rs -> {
            UUID id = rs.getObject("id", UUID.class);
            Map<String, String> variants = parse(rs.getString("variants"), VARIANTS, Map.of());
            MediaRefUrls urls = new MediaRefUrls(storage.presignGet(rs.getString("s3_key")));
            urls.sm(url(variants, "sm")).md(url(variants, "md")).lg(url(variants, "lg")).poster(url(variants, "poster"));
            MediaRef ref = new MediaRef(id, MediaRef.KindEnum.fromValue(rs.getString("kind")),
                    MediaRef.StatusEnum.fromValue(rs.getString("status")), rs.getString("mime"),
                    rs.getLong("size_bytes"), urls, expires);
            ref.fileName(rs.getString("file_name"));
            ref.blurhash(rs.getString("blurhash"));
            ref.width((Integer) rs.getObject("width"));
            ref.height((Integer) rs.getObject("height"));
            Object duration = rs.getObject("duration_ms");
            ref.durationMs(duration == null ? null : ((Number) duration).intValue());
            String waveform = rs.getString("waveform");
            ref.waveform(waveform == null ? null : parse(waveform, WAVEFORM, null));
            result.put(id, ref);
        });
        return result;
    }

    /** `UserRef.avatar` г.м. `NullableMediaRef` төрөлтэй талбарт (JSON хэлбэр ижил). */
    public NullableMediaRef nullable(MediaRef ref) {
        return ref == null ? null : mapper.convertValue(ref, NullableMediaRef.class);
    }

    public NullableMediaRef nullable(UUID mediaId) {
        return find(mediaId).map(this::nullable).orElse(null);
    }

    private URI url(Map<String, String> variants, String name) {
        String key = variants.get(name);
        return key == null ? null : storage.presignGet(key);
    }

    private <T> T parse(String json, TypeReference<T> type, T fallback) {
        if (json == null) {
            return fallback;
        }
        try {
            return mapper.readValue(json, type);
        } catch (java.io.IOException e) {
            throw new IllegalStateException("media jsonb задлах боломжгүй", e);
        }
    }

    /** Тестэд: variant-ын түлхүүрийн map-ийг jsonb болгох. */
    public String variantsJson(Map<String, String> variants) {
        try {
            return mapper.writeValueAsString(new HashMap<>(variants));
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
