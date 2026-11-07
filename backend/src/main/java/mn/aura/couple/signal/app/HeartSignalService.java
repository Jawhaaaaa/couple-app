package mn.aura.couple.signal.app;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import mn.aura.couple.api.model.Signal;
import mn.aura.couple.api.model.SignalKind;
import mn.aura.couple.api.model.SignalSummary;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.ratelimit.AttemptLimiter;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * «Зүрх илгээх», «том тэврэлт», «Чамайг бодож байна» (FR-4.1…4.5):
 * <ul>
 *   <li>Хүн тутам минутад 10 дохио; 11 дэх нь 429 `RATE_LIMITED` (+`retryAfterSeconds`) — UI-д зөөлөн
 *       cooldown (AC-19). Тоолуур санах ойд (DD-AURA-029, сэргээлт шаардлагагүй)</li>
 *   <li>«Чамайг бодож байна» ≤ 80 тэмдэгт → 400 `TEXT_TOO_LONG` (AC-77)</li>
 *   <li>Хамтрагчид realtime `signal.received` (≤ 2 с, AC-17) + мэдэгдэл; апп хаалттай үеийн дохионууд
 *       `GET /signals/unseen`-д нэгтгэгдэнэ (AC-18)</li>
 *   <li>Өнөөдрийн илгээсэн/хүлээн авсан тоо — хосын өдрөөр (SD-02), өрсөлдөөнгүй (AC-78)</li>
 * </ul>
 */
@Service
public class HeartSignalService {

    public static final int PER_MINUTE = 10;
    public static final int TEXT_MAX = 80;

    public record DayCounts(int sent, int received) {
    }

    private final JdbcTemplate jdbc;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;
    private final Cache<UUID, Deque<Instant>> recent = Caffeine.newBuilder()
            .expireAfterAccess(Duration.ofMinutes(5)).maximumSize(100_000).build();

    public HeartSignalService(JdbcTemplate jdbc, CoupleMembers couples, UserRefs users,
                              ApplicationEventPublisher events, TimeProvider time) {
        this.jdbc = jdbc;
        this.couples = couples;
        this.users = users;
        this.events = events;
        this.time = time;
    }

    @Transactional
    public Signal send(SpaceContext ctx, SignalKind kind, String text, UUID clientId) {
        Optional<Signal> existing = find(ctx.userId(), clientId);
        if (existing.isPresent()) {
            return existing.get(); // outbox-оос давтан ирсэн (DD-AURA-017)
        }
        String clean = kind == SignalKind.THINKING && text != null && !text.isBlank() ? text.strip() : null;
        if (clean != null && clean.codePointCount(0, clean.length()) > TEXT_MAX) {
            throw ApiException.badRequest(ErrorCode.TEXT_TOO_LONG, "text");
        }
        Instant now = time.now();
        throttle(ctx.userId(), now);
        UUID id = Ids.newId();
        LocalDate day = coupleDay(ctx.spaceId());
        try {
            jdbc.update("""
                    INSERT INTO heart_signal (id, space_id, sender_id, client_id, kind, text, couple_day, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, id, ctx.spaceId(), ctx.userId(), clientId, kind.getValue(), clean, day, Timestamp.from(now));
        } catch (DuplicateKeyException e) {
            return find(ctx.userId(), clientId).orElseThrow(() -> e);
        }
        Signal dto = toDto(id, kind.getValue(), clean, ctx.userId(), day, now, null);
        couples.partnerIn(ctx.spaceId(), ctx.userId()).ifPresent(partner -> {
            events.publishEvent(RealtimeEvent.of("signal.received", ctx.userId(), List.of(partner), dto));
            events.publishEvent(new Notify(partner, ctx.spaceId(), ctx.userId(), notificationType(kind),
                    Map.of("partner", dto.getSender().getDisplayName()), "/home"));
        });
        return dto;
    }

    /** Хамтрагчийн үзээгүй дохионууд — апп хаалттай үед ирсэн гурван зүрх нэг карт (AC-18). */
    @Transactional(readOnly = true)
    public SignalSummary unseen(SpaceContext ctx) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT kind, text FROM heart_signal
                 WHERE space_id = ? AND sender_id <> ? AND seen_at IS NULL ORDER BY created_at
                """, ctx.spaceId(), ctx.userId());
        Set<SignalKind> kinds = new LinkedHashSet<>();
        String lastText = null;
        for (Map<String, Object> r : rows) {
            kinds.add(SignalKind.fromValue((String) r.get("kind")));
            if (r.get("text") != null) {
                lastText = (String) r.get("text");
            }
        }
        SignalSummary summary = new SignalSummary(rows.size(), List.copyOf(kinds));
        summary.lastText(lastText);
        return summary;
    }

    @Transactional
    public void markSeen(SpaceContext ctx) {
        jdbc.update("UPDATE heart_signal SET seen_at = ? WHERE space_id = ? AND sender_id <> ? AND seen_at IS NULL",
                Timestamp.from(time.now()), ctx.spaceId(), ctx.userId());
    }

    /** Хосын өнөөдрийн тоо (AC-78) — хоёр талд толин тусгал. */
    @Transactional(readOnly = true)
    public DayCounts today(UUID spaceId, UUID userId) {
        LocalDate day = coupleDay(spaceId);
        Map<String, Object> r = jdbc.queryForMap("""
                SELECT count(*) FILTER (WHERE sender_id = ?) AS sent, count(*) FILTER (WHERE sender_id <> ?) AS received
                  FROM heart_signal WHERE space_id = ? AND couple_day = ?
                """, userId, userId, spaceId, day);
        return new DayCounts(((Number) r.get("sent")).intValue(), ((Number) r.get("received")).intValue());
    }

    /** Нийт илгээсэн зүрх (статистик, FR-12.3). */
    @Transactional(readOnly = true)
    public int totalSent(UUID spaceId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM heart_signal WHERE space_id = ?", Integer.class, spaceId);
        return n == null ? 0 : n;
    }

    private void throttle(UUID userId, Instant now) {
        Deque<Instant> q = recent.get(userId, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && !q.peekFirst().isAfter(now.minusSeconds(60))) {
                q.pollFirst();
            }
            if (q.size() >= PER_MINUTE) {
                throw ApiException.rateLimited(AttemptLimiter.secondsUntil(now, q.peekFirst().plusSeconds(60)));
            }
            q.addLast(now);
        }
    }

    private LocalDate coupleDay(UUID spaceId) {
        return time.today(ZoneId.of(jdbc.queryForObject("SELECT timezone FROM space WHERE id = ?", String.class, spaceId)));
    }

    private Optional<Signal> find(UUID senderId, UUID clientId) {
        return jdbc.query("SELECT id, kind, text, sender_id, couple_day, created_at, seen_at FROM heart_signal "
                        + "WHERE sender_id = ? AND client_id = ?",
                (rs, i) -> toDto(rs.getObject("id", UUID.class), rs.getString("kind"), rs.getString("text"),
                        rs.getObject("sender_id", UUID.class), rs.getDate("couple_day").toLocalDate(),
                        rs.getTimestamp("created_at").toInstant(),
                        rs.getTimestamp("seen_at") == null ? null : rs.getTimestamp("seen_at").toInstant()),
                senderId, clientId).stream().findFirst();
    }

    private Signal toDto(UUID id, String kind, String text, UUID sender, LocalDate day, Instant at, Instant seen) {
        Signal s = new Signal(id, SignalKind.fromValue(kind), users.ref(sender), day, OffsetDateTime.ofInstant(at, ZoneOffset.UTC));
        s.text(text);
        s.seenAt(seen == null ? null : OffsetDateTime.ofInstant(seen, ZoneOffset.UTC));
        return s;
    }

    private static String notificationType(SignalKind kind) {
        return switch (kind) {
            case HEART -> "HEART_RECEIVED";
            case HUG -> "HUG_RECEIVED";
            case THINKING -> "THINKING_OF_YOU";
        };
    }
}
