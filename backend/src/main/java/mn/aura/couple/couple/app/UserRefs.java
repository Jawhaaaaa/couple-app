package mn.aura.couple.couple.app;

import java.math.BigDecimal;
import java.sql.Date;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.CityRef;
import mn.aura.couple.api.model.MediaRef;
import mn.aura.couple.api.model.PartnerCard;
import mn.aura.couple.api.model.UserRef;
import mn.aura.couple.media.app.MediaRefs;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Хэрэглэгчийн товч мэдээлэл (`UserRef`, `PartnerCard`) — бүх домэйн хэрэглэнэ. Нэр нь дуудах нэр байвал
 * түүнийг, үгүй бол бүтэн нэрийг харуулна (§3.6: хамтрагчийг нэр/хочоор нь).
 */
@Component
public class UserRefs {

    /** Нэг хэрэглэгчийн мөр (дотоод хэрэглээ). */
    public record UserRow(UUID id, String displayName, String callName, UUID avatarMediaId, String timezone,
                          String locale, String cityName, String countryCode, BigDecimal lat, BigDecimal lon,
                          java.time.LocalDate birthDate) {

        public String shownName() {
            return callName != null && !callName.isBlank() ? callName : displayName;
        }

        public Optional<CityRef> city() {
            if (cityName == null || lat == null || lon == null) {
                return Optional.empty();
            }
            return Optional.of(new CityRef(cityName, countryCode == null ? "MN" : countryCode, lat, lon, timezone));
        }
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final MediaRefs media;

    public UserRefs(NamedParameterJdbcTemplate jdbc, MediaRefs media) {
        this.jdbc = jdbc;
        this.media = media;
    }

    public Map<UUID, UserRow> rows(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, UserRow> result = new LinkedHashMap<>();
        jdbc.query("""
                SELECT id, display_name, call_name, avatar_media_id, timezone, locale, city_name, country_code,
                       city_lat, city_lon, birth_date
                  FROM users WHERE id IN (:ids)
                """, new MapSqlParameterSource("ids", ids), rs -> {
            Date birth = rs.getDate("birth_date");
            UserRow row = new UserRow(rs.getObject("id", UUID.class), rs.getString("display_name"),
                    rs.getString("call_name"), rs.getObject("avatar_media_id", UUID.class), rs.getString("timezone"),
                    rs.getString("locale"), rs.getString("city_name"), rs.getString("country_code"),
                    rs.getBigDecimal("city_lat"), rs.getBigDecimal("city_lon"),
                    birth == null ? null : birth.toLocalDate());
            result.put(row.id(), row);
        });
        return result;
    }

    public Optional<UserRow> row(UUID id) {
        return Optional.ofNullable(rows(List.of(id)).get(id));
    }

    public UserRef ref(UUID id) {
        return refs(List.of(id)).get(id);
    }

    public Map<UUID, UserRef> refs(Collection<UUID> ids) {
        Map<UUID, UserRow> rows = rows(ids);
        Map<UUID, MediaRef> avatars = media.findAll(rows.values().stream()
                .map(UserRow::avatarMediaId).filter(java.util.Objects::nonNull).toList());
        Map<UUID, UserRef> result = new LinkedHashMap<>();
        for (UserRow r : rows.values()) {
            UserRef ref = new UserRef(r.id(), r.shownName() == null ? "" : r.shownName());
            ref.avatar(r.avatarMediaId() == null ? null : media.nullable(avatars.get(r.avatarMediaId())));
            result.put(r.id(), ref);
        }
        return result;
    }

    public PartnerCard partnerCard(UserRow r) {
        PartnerCard card = new PartnerCard(r.id(), r.displayName() == null ? "" : r.displayName(), r.timezone());
        card.callName(r.callName());
        card.avatar(media.nullable(r.avatarMediaId()));
        card.city(r.city().orElse(null));
        card.birthDate(r.birthDate());
        return card;
    }
}
