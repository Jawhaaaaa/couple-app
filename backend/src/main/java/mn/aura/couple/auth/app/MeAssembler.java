package mn.aura.couple.auth.app;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.model.CityRef;
import mn.aura.couple.api.model.Locale;
import mn.aura.couple.api.model.Me;
import mn.aura.couple.api.model.SpaceStatus;
import mn.aura.couple.api.model.SpaceSummary;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.media.app.MediaRefs;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Гэрээний `Me` (TokenResponse.user, GET /me). Идэвхтэй space: COUPLE байвал түүнийг, үгүй бол SOLO
 * (`SpaceAccessGuard`-тай ижил дүрэм). `policyUpdateRequired` = зөвшөөрсөн хувилбар ≠ `aura.policy.version` (AC-63).
 */
@Component
public class MeAssembler {

    private static final String SQL = """
            SELECT u.id, u.email, u.display_name, u.call_name, u.birth_date, u.timezone, u.locale,
                   u.city_name, u.city_lat, u.city_lon, u.country_code, u.email_verified_at, u.policy_version,
                   u.online_visible, u.typing_visible, u.avatar_media_id, sp.id AS space_id, sp.kind AS space_kind, sp.status AS space_status
              FROM users u
              LEFT JOIN LATERAL (
                    SELECT s.id, s.kind, s.status
                      FROM space_member sm JOIN space s ON s.id = sm.space_id
                     WHERE sm.user_id = u.id AND sm.left_at IS NULL AND s.status <> 'PURGING'
                     ORDER BY CASE s.kind WHEN 'COUPLE' THEN 0 ELSE 1 END, sm.joined_at DESC
                     LIMIT 1) sp ON true
             WHERE u.id = ?
            """;

    private final JdbcTemplate jdbc;
    private final String currentPolicy;
    private final MediaRefs media;

    public MeAssembler(JdbcTemplate jdbc, AuraProperties properties, MediaRefs media) {
        this.jdbc = jdbc;
        this.media = media;
        this.currentPolicy = properties.policy().version();
    }

    public Me load(UUID userId) {
        List<Me> rows = jdbc.query(SQL, (rs, i) -> {
            Date birth = rs.getDate("birth_date");
            Timestamp verified = rs.getTimestamp("email_verified_at");
            String policy = rs.getString("policy_version");
            UUID spaceId = rs.getObject("space_id", UUID.class);
            SpaceSummary space = spaceId == null ? null : new SpaceSummary(spaceId,
                    SpaceSummary.KindEnum.fromValue(rs.getString("space_kind")),
                    SpaceStatus.fromValue(rs.getString("space_status")));
            Me me = new Me(
                    rs.getObject("id", UUID.class),
                    rs.getString("email"),
                    rs.getString("display_name"),
                    birth == null ? null : birth.toLocalDate(),
                    rs.getString("timezone"),
                    Locale.fromValue(rs.getString("locale")),
                    verified != null,
                    policy,
                    policy == null || !policy.equals(currentPolicy),
                    rs.getBoolean("online_visible"),
                    rs.getBoolean("typing_visible"),
                    space);
            me.callName(rs.getString("call_name"));
            me.avatar(media.nullable(rs.getObject("avatar_media_id", UUID.class)));
            String cityName = rs.getString("city_name");
            if (cityName != null) {
                BigDecimal lat = rs.getBigDecimal("city_lat");
                BigDecimal lon = rs.getBigDecimal("city_lon");
                me.city(new CityRef(cityName, rs.getString("country_code"), lat, lon, rs.getString("timezone")));
            }
            return me;
        }, userId);
        return rows.stream().findFirst().orElseThrow(ApiException::notFound);
    }
}
