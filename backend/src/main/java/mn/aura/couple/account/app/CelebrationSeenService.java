package mn.aura.couple.account.app;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import mn.aura.couple.api.model.Celebration;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Баярын анимаци хэрэглэгч тутамд нэг удаа (GAP-23 анхдагч, AC-39, AC-MO-02): `GET /me/celebrations` нь
 * `CelebrationSource`-уудын одоогийн баяраас `celebration_seen`-д тэмдэглэгдээгүйг л буцаана. Хоёр хамтрагч
 * тус тусдаа үзнэ; нэг хүн PWA ба APK хоёуланд нээвэл сервер нэг л удаа харуулна.
 */
@Service
public class CelebrationSeenService {

    static final int EVENT_KEY_MAX = 120;

    private final JdbcTemplate jdbc;
    private final List<CelebrationSource> sources;
    private final TimeProvider time;

    public CelebrationSeenService(JdbcTemplate jdbc, List<CelebrationSource> sources, TimeProvider time) {
        this.jdbc = jdbc;
        this.sources = sources;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public List<Celebration> unseen(UUID userId) {
        Map<String, Celebration> all = new LinkedHashMap<>();
        for (CelebrationSource source : sources) {
            for (Celebration c : source.current(userId)) {
                all.putIfAbsent(c.getEventKey(), c);
            }
        }
        if (all.isEmpty()) {
            return new ArrayList<>();
        }
        Set<String> seen = new HashSet<>(jdbc.queryForList(
                "SELECT event_key FROM celebration_seen WHERE user_id = ?", String.class, userId));
        return new ArrayList<>(all.values().stream().filter(c -> !seen.contains(c.getEventKey())).toList());
    }

    /** Idempotent — дахин дуудахад 204 хэвээр. */
    @Transactional
    public void markSeen(UUID userId, String eventKey) {
        if (eventKey == null || eventKey.isBlank() || eventKey.length() > EVENT_KEY_MAX) {
            throw ApiException.validation("eventKey", ErrorCode.VALIDATION_FAILED);
        }
        jdbc.update("INSERT INTO celebration_seen (user_id, event_key, seen_at) VALUES (?, ?, ?) "
                + "ON CONFLICT (user_id, event_key) DO NOTHING", userId, eventKey, Timestamp.from(time.now()));
    }
}
