package mn.aura.couple.notification.app;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.model.Notification;
import mn.aura.couple.api.model.NotificationPage;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.notification.domain.NotificationRepository;
import mn.aura.couple.notification.domain.NotificationRepository.NotificationRow;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Апп доторх мэдэгдлийн жагсаалт (FR-13.4, AC-120): шинээс хуучин, уншаагүй тоо, уншсан болгох,
 * бүгдийг уншсан болгох. Бичвэр нь хэрэглэгчийн одоогийн хэлээр (`NotificationTexts`).
 */
@Service
public class NotificationService {

    static final int DEFAULT_LIMIT = 30;
    static final int MAX_LIMIT = 100;

    private final NotificationRepository repo;
    private final NotificationTexts texts;
    private final TimeProvider time;

    public NotificationService(NotificationRepository repo, NotificationTexts texts, TimeProvider time) {
        this.repo = repo;
        this.texts = texts;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public NotificationPage list(UUID userId, String cursor, Integer limit) {
        int size = limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(MAX_LIMIT, limit));
        Instant beforeAt = null;
        UUID beforeId = null;
        if (cursor != null && !cursor.isBlank()) {
            String[] parts = decode(cursor);
            beforeAt = Instant.parse(parts[0]);
            beforeId = UUID.fromString(parts[1]);
        }
        List<NotificationRow> rows = repo.page(userId, beforeAt, beforeId, size + 1);
        boolean more = rows.size() > size;
        List<NotificationRow> page = more ? rows.subList(0, size) : rows;
        String locale = repo.locale(userId);
        List<Notification> items = page.stream().map(r -> toDto(r, locale)).toList();
        NotificationRow last = page.isEmpty() ? null : page.get(page.size() - 1);
        String next = more && last != null ? encode(last.createdAt() + "|" + last.id()) : null;
        return new NotificationPage(items, next, repo.unreadCount(userId));
    }

    @Transactional
    public void markRead(UUID userId, UUID notificationId) {
        if (repo.markRead(userId, notificationId, time.now()) == 0) {
            throw ApiException.notFound();
        }
    }

    @Transactional
    public void markAllRead(UUID userId) {
        repo.markAllRead(userId, time.now());
    }

    private Notification toDto(NotificationRow r, String locale) {
        NotificationTexts.Text t = texts.render(r.variantId(), locale, r.params());
        Notification n = new Notification(r.id(), r.type(), t.title(), t.body(), r.deepLink(), utc(r.createdAt()));
        n.readAt(utc(r.readAt()));
        return n;
    }

    private static OffsetDateTime utc(Instant i) {
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }

    private static String encode(String s) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(s.getBytes(StandardCharsets.UTF_8));
    }

    private static String[] decode(String cursor) {
        try {
            String[] parts = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split("\\|");
            if (parts.length != 2) {
                throw new IllegalArgumentException(cursor);
            }
            return parts;
        } catch (IllegalArgumentException e) {
            throw ApiException.validation("cursor", ErrorCode.VALIDATION_FAILED);
        }
    }
}
