package mn.aura.couple.realtime.app;

import java.security.Principal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/**
 * Онлайн төлөв ба «бичиж байна» (FR-3.2, FR-6.6). WebSocket session бүрийн төлөв (апп нүүрэнд эсвэл
 * ард) санах ойд — нэг процесс (DD-AURA-008). Хэрэглэгч ядаж нэг нүүрэн дэх session-тэй бол онлайн.
 * <p>Тэгш байдал (INV-06, AC-70, AC-177): аль нэг нь онлайн төлөвөө (эсвэл «бичиж байна»-г) унтраасан бол
 * хоёулаа нөгөөгийнхийг харахгүй — үйл явдал ч илгээгдэхгүй, `GET /dashboard`-д ч гарахгүй.
 */
@Service
public class PresenceService {

    public enum State { FOREGROUND, BACKGROUND }

    /** Хэрэглэгч → (WebSocket session → төлөв). */
    private final Map<UUID, Map<String, State>> sessions = new ConcurrentHashMap<>();

    private final CoupleMembers couples;
    private final ApplicationEventPublisher events;
    private final JdbcTemplate jdbc;
    private final TimeProvider time;

    public PresenceService(CoupleMembers couples, ApplicationEventPublisher events, JdbcTemplate jdbc,
                           TimeProvider time) {
        this.couples = couples;
        this.events = events;
        this.jdbc = jdbc;
        this.time = time;
    }

    @EventListener
    public void onConnected(SessionConnectedEvent event) {
        userOf(event.getUser()).ifPresent(u ->
                update(u, StompHeaderAccessor.wrap(event.getMessage()).getSessionId(), State.FOREGROUND));
    }

    @EventListener
    public void onDisconnected(SessionDisconnectEvent event) {
        userOf(event.getUser()).ifPresent(u -> update(u, event.getSessionId(), null));
    }

    /** `/app/presence {state}` — апп ард/нүүрэнд шилжих. */
    public void ping(UUID userId, String sessionId, State state) {
        update(userId, sessionId, state);
    }

    public boolean isOnline(UUID userId) {
        Map<String, State> mine = sessions.get(userId);
        return mine != null && mine.containsValue(State.FOREGROUND);
    }

    /** `viewer`-т `subject`-ийн онлайн төлөв; хоёрын аль нэг нь нуусан бол хоосон (INV-06). */
    public Optional<Boolean> onlineFor(UUID viewer, UUID subject) {
        return bothAllow("online_visible", viewer, subject) ? Optional.of(isOnline(subject)) : Optional.empty();
    }

    /** `/app/typing {typing}` → хамтрагчид `chat.typing` (хоёулаа зөвшөөрсөн үед л, AC-177). */
    public void typing(UUID userId, boolean typing) {
        couples.partnerOf(userId).ifPresent(partner -> {
            if (bothAllow("typing_visible", userId, partner)) {
                events.publishEvent(RealtimeEvent.of("chat.typing", userId, List.of(partner), Map.of("typing", typing)));
            }
        });
    }

    /** Онлайн төлөвийн тохиргоо өөрчлөгдөхөд хамтрагчид шинэ төлөвийг (эсвэл нуугдсаныг) мэдэгдэнэ. */
    public void visibilityChanged(UUID userId) {
        couples.partnerOf(userId).ifPresent(partner -> {
            publishPresence(userId, partner);
            publishPresence(partner, userId);
        });
    }

    private void update(UUID userId, String sessionId, State state) {
        if (sessionId == null) {
            return;
        }
        boolean before = isOnline(userId);
        Map<String, State> mine = sessions.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        if (state == null) {
            mine.remove(sessionId);
        } else {
            mine.put(sessionId, state);
        }
        if (mine.isEmpty()) {
            sessions.remove(userId, mine);
        }
        boolean after = isOnline(userId);
        if (before != after) {
            if (!after) {
                jdbc.update("UPDATE users SET last_active_at = ? WHERE id = ?", Timestamp.from(time.now()), userId);
            }
            couples.partnerOf(userId).ifPresent(partner -> publishPresence(userId, partner));
        }
    }

    private void publishPresence(UUID subject, UUID viewer) {
        if (!bothAllow("online_visible", viewer, subject)) {
            return;
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("online", isOnline(subject));
        payload.put("lastActiveAt", lastActive(subject));
        events.publishEvent(RealtimeEvent.of("presence.changed", subject, List.of(viewer), payload));
    }

    private OffsetDateTime lastActive(UUID userId) {
        List<Timestamp> t = jdbc.queryForList("SELECT last_active_at FROM users WHERE id = ?", Timestamp.class, userId);
        Instant i = t.isEmpty() || t.get(0) == null ? null : t.get(0).toInstant();
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }

    private boolean bothAllow(String column, UUID a, UUID b) {
        if (!"online_visible".equals(column) && !"typing_visible".equals(column)) {
            throw new IllegalArgumentException(column);
        }
        Integer allowed = jdbc.queryForObject("SELECT count(*) FROM users WHERE id IN (?, ?) AND " + column,
                Integer.class, a, b);
        return allowed != null && allowed == (a.equals(b) ? 1 : 2);
    }

    private static Optional<UUID> userOf(Principal principal) {
        if (principal == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(UUID.fromString(principal.getName()));
        } catch (IllegalArgumentException e) {
            return Optional.empty(); // JWT-ээр нэвтрээгүй principal (тестийн бус замд гарахгүй)
        }
    }
}
