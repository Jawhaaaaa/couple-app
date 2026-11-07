package mn.aura.couple.notification.app;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.model.NotificationSettings;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.notification.domain.NotificationRepository;
import mn.aura.couple.notification.domain.NotificationRepository.SettingRow;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Мэдэгдлийн тохиргоо (FR-13.2, FR-13.3, FR-13.5): төрөл бүрийг унтраах, «Бүү саад бол» (анхдагч
 * 23:00–07:00, хүлээн авагчийн бүсээр, AC-184), агуулга нуух, өглөө/оройн мэндчилгээ (анхдагч — алс
 * зайн хост, GAP-26).
 */
@Service
public class NotificationPreferenceService {

    private final NotificationRepository repo;
    private final CoupleMembers couples;
    private final TimeProvider time;

    public NotificationPreferenceService(NotificationRepository repo, CoupleMembers couples, TimeProvider time) {
        this.repo = repo;
        this.couples = couples;
        this.time = time;
    }

    @Transactional
    public SettingRow load(UUID userId) {
        repo.ensureSettings(userId, couples.isLongDistance(userId));
        return repo.settings(userId).orElseThrow(ApiException::notFound);
    }

    @Transactional
    public NotificationSettings get(UUID userId) {
        return toDto(load(userId));
    }

    @Transactional
    public NotificationSettings put(UUID userId, NotificationSettings in) {
        SettingRow current = load(userId);
        SettingRow next = new SettingRow(userId, parse(in.getDndStart(), "dndStart"), parse(in.getDndEnd(), "dndEnd"),
                Boolean.TRUE.equals(in.getHideContent()), Boolean.TRUE.equals(in.getGreetingMorning()),
                Boolean.TRUE.equals(in.getGreetingEvening()), parse(in.getGreetingMorningAt(), "greetingMorningAt"),
                parse(in.getGreetingEveningAt(), "greetingEveningAt"), current.quietUntil(),
                new LinkedHashSet<>(in.getDisabledTypes() == null ? java.util.Set.of() : in.getDisabledTypes()));
        repo.saveSettings(next, time.now());
        return toDto(next);
    }

    /** «Бүү саад бол» цонх дотор бол цонх дуусах агшин (UTC), үгүй бол null. */
    public static Instant dndEndsAt(SettingRow s, ZoneId zone, Instant now) {
        LocalTime start = s.dndStart();
        LocalTime end = s.dndEnd();
        if (start == null || end == null || start.equals(end)) {
            return null;
        }
        ZonedDateTime local = now.atZone(zone);
        LocalTime t = local.toLocalTime();
        boolean inside = start.isBefore(end) ? !t.isBefore(start) && t.isBefore(end) : !t.isBefore(start) || t.isBefore(end);
        if (!inside) {
            return null;
        }
        LocalDate endDay = t.isBefore(end) ? local.toLocalDate() : local.toLocalDate().plusDays(1);
        return ZonedDateTime.of(endDay, end, zone).toInstant();
    }

    static NotificationSettings toDto(SettingRow s) {
        return new NotificationSettings(new LinkedHashSet<>(s.disabledTypes()), fmt(s.dndStart()), fmt(s.dndEnd()),
                s.hideContent(), s.greetingMorning(), s.greetingEvening(), fmt(s.greetingMorningAt()),
                fmt(s.greetingEveningAt()));
    }

    private static String fmt(LocalTime t) {
        return String.format("%02d:%02d", t.getHour(), t.getMinute());
    }

    private static LocalTime parse(String v, String field) {
        try {
            return LocalTime.parse(v);
        } catch (RuntimeException e) {
            throw ApiException.validation(field, ErrorCode.VALIDATION_FAILED);
        }
    }
}
