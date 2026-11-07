package mn.aura.couple.common.space;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Тусгаарлалтын хаалга (DD-AURA-004, INV-01). Нэвтэрсэн хэрэглэгчийн идэвхтэй гишүүнчлэлийг
 * `space_member`-ээс уншина: идэвхтэй COUPLE байвал түүнийг, үгүй бол SOLO.
 * Өөр space-ийн объект → 404 `NOT_FOUND` (байгаа эсэхийг ил гаргахгүй).
 */
@Component
public class SpaceAccessGuard {

    private static final String ACTIVE_MEMBERSHIP = """
            SELECT sm.space_id, s.kind
              FROM space_member sm
              JOIN space s ON s.id = sm.space_id
             WHERE sm.user_id = ?
               AND sm.left_at IS NULL
               AND s.status <> 'PURGING'
             ORDER BY CASE s.kind WHEN 'COUPLE' THEN 0 ELSE 1 END, sm.joined_at DESC
             LIMIT 1
            """;

    private final JdbcTemplate jdbc;

    public SpaceAccessGuard(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<SpaceContext> resolve(UUID userId) {
        List<SpaceContext> rows = jdbc.query(ACTIVE_MEMBERSHIP,
                (rs, i) -> new SpaceContext(userId, rs.getObject("space_id", UUID.class),
                        SpaceContext.Kind.valueOf(rs.getString("kind"))),
                userId);
        return rows.stream().findFirst();
    }

    /** Одоогийн хүсэлтийн орон зай. Нэвтрээгүй → 401, гишүүнчлэлгүй → 404. */
    public SpaceContext current() {
        return resolve(currentUserId()).orElseThrow(ApiException::notFound);
    }

    /** Объектын `space_id` нь хүсэлтийн орон зайнх биш бол 404. */
    public void requireSameSpace(SpaceContext ctx, UUID objectSpaceId) {
        if (objectSpaceId == null || !objectSpaceId.equals(ctx.spaceId())) {
            throw ApiException.notFound();
        }
    }

    /** `x-aura-requires-couple: true` — SOLO үед 409 `NOT_PAIRED`. */
    public SpaceContext requireCouple() {
        SpaceContext ctx = current();
        if (!ctx.isCouple()) {
            throw new ApiException(ErrorCode.NOT_PAIRED, HttpStatus.CONFLICT);
        }
        return ctx;
    }

    public static UUID currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            throw new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.UNAUTHORIZED);
        }
        try {
            return UUID.fromString(auth.getName());
        } catch (IllegalArgumentException e) {
            throw new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.UNAUTHORIZED);
        }
    }
}
