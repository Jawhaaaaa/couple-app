package mn.aura.couple.notification.app;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.notification.domain.NotificationRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * «Түр тайван байх» (FR-13.7, AC-123): 1 цаг – 7 хоног мэдэгдэл (push) зогсоно; апп доторх
 * жагсаалт хэвээр бичигдэнэ. Хамтрагч «🌙 түр тайван байна» тэмдэг л харна; хугацаа дуусахад
 * автоматаар унтарна (`quiet_until` < одоо).
 */
@Service
public class QuietModeService {

    private final NotificationRepository repo;
    private final NotificationPreferenceService preferences;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public QuietModeService(NotificationRepository repo, NotificationPreferenceService preferences,
                            CoupleMembers couples, UserRefs users, ApplicationEventPublisher events, TimeProvider time) {
        this.repo = repo;
        this.preferences = preferences;
        this.couples = couples;
        this.users = users;
        this.events = events;
        this.time = time;
    }

    @Transactional
    public Instant enable(UUID userId, int durationMinutes) {
        preferences.load(userId);
        Instant until = time.now().plus(Duration.ofMinutes(durationMinutes));
        repo.setQuietUntil(userId, until);
        couples.partnerOf(userId).ifPresent(partner -> {
            String name = users.ref(userId).getDisplayName();
            events.publishEvent(new Notify(partner, couples.coupleSpaceOf(userId).orElse(null), userId, "QUIET_MODE_ON",
                    Map.of("partner", name), "/home"));
            publish(userId, partner, until);
        });
        return until;
    }

    @Transactional
    public void disable(UUID userId) {
        preferences.load(userId);
        repo.setQuietUntil(userId, null);
        couples.partnerOf(userId).ifPresent(partner -> publish(userId, partner, null));
    }

    /** Хүчинтэй тайван горимын төгсгөл (дууссан бол хоосон) — нүүрний хамтрагчийн карт хэрэглэнэ. */
    @Transactional(readOnly = true)
    public Optional<Instant> quietUntil(UUID userId) {
        Instant now = time.now();
        return repo.settings(userId).map(NotificationRepository.SettingRow::quietUntil).filter(u -> u.isAfter(now));
    }

    private void publish(UUID userId, UUID partner, Instant until) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", userId);
        payload.put("quietUntil", until == null ? null : OffsetDateTime.ofInstant(until, ZoneOffset.UTC));
        events.publishEvent(RealtimeEvent.of("quiet.changed", userId, List.of(userId, partner), payload));
    }
}
