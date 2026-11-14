package mn.aura.couple.admin.app;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.security.AuraAuthentication;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Админ хэн бэ (GAP-16 анхдагч): `.env`-ийн `AURA_ADMIN_EMAILS` (таслалаар) жагсаалтад имэйл нь байгаа,
 * имэйлээ баталгаажуулсан, идэвхтэй хэрэглэгч. Тусдаа токен, роль байхгүй — энгийн access JWT-ээр
 * нэвтэрч, сервер имэйлийг жагсаалттай тулгана. Бусад нь 403 `ADMIN_ONLY` (AC-186, AC-206).
 * Жагсаалт хоосон бол админ API хэнд ч нээгдэхгүй.
 */
@Component
public class AdminAuthorization {

    private final JdbcTemplate jdbc;
    private final Set<String> emails;

    public AdminAuthorization(JdbcTemplate jdbc, @Value("${aura.admin.emails:}") String emails) {
        this.jdbc = jdbc;
        this.emails = parse(emails);
    }

    static Set<String> parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(raw.split("[,;\s]+"))
                .map(String::strip)
                .filter(s -> !s.isEmpty())
                .map(s -> s.toLowerCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
    }

    /** Одоогийн хүсэлтийн хэрэглэгч админ биш бол 403 `ADMIN_ONLY`; админы ID-г буцаана. */
    public UUID requireAdmin() {
        UUID userId = AuraAuthentication.current()
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.UNAUTHORIZED))
                .userId();
        if (!isAdmin(userId)) {
            throw new ApiException(ErrorCode.ADMIN_ONLY, HttpStatus.FORBIDDEN);
        }
        return userId;
    }

    public boolean isAdmin(UUID userId) {
        if (emails.isEmpty()) {
            return false;
        }
        List<String> rows = jdbc.queryForList("""
                SELECT email::text FROM users
                 WHERE id = ? AND status = 'ACTIVE' AND email_verified_at IS NOT NULL
                """, String.class, userId);
        return !rows.isEmpty() && emails.contains(rows.get(0).toLowerCase(Locale.ROOT));
    }
}
