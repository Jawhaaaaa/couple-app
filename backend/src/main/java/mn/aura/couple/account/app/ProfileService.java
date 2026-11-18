package mn.aura.couple.account.app;

import java.sql.Timestamp;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.CityRef;
import mn.aura.couple.api.model.MediaRef;
import mn.aura.couple.api.model.PersonCard;
import mn.aura.couple.api.model.ProfileUpdate;
import mn.aura.couple.auth.app.RegistrationService;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.media.app.MediaRefs;
import mn.aura.couple.realtime.app.PresenceService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Профайл (FR-1.4, AC-62): нэр, дуудах нэр, зураг (≤ 10 MB), төрсөн өдөр (18+), цагийн бүс, хэл, хот,
 * онлайн/«бичиж байна» харагдац. Өөрчлөлт хамтрагчид WS `profile.updated`-ээр (≤ 5 с).
 * <p>Зэрэг засвар: `users.version` (DD-AURA-016). `Me`-д version талбар гэрээнд байхгүй тул 409-ийн
 * `details.currentVersion`-оор client одоогийн хувилбарыг мэднэ.
 */
@Service
public class ProfileService {

    public static final long AVATAR_MAX_BYTES = 10L * 1024 * 1024;

    private final JdbcTemplate jdbc;
    private final RegistrationService registration;
    private final MediaRefs media;
    private final UserRefs users;
    private final CoupleMembers couples;
    private final PresenceService presence;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public ProfileService(JdbcTemplate jdbc, RegistrationService registration, MediaRefs media, UserRefs users,
                          CoupleMembers couples, PresenceService presence, ApplicationEventPublisher events,
                          TimeProvider time) {
        this.jdbc = jdbc;
        this.registration = registration;
        this.media = media;
        this.users = users;
        this.couples = couples;
        this.presence = presence;
        this.events = events;
        this.time = time;
    }

    @Transactional
    public void update(UUID userId, ProfileUpdate in) {
        Long current = jdbc.queryForList("SELECT version FROM users WHERE id = ? FOR UPDATE", Long.class, userId)
                .stream().findFirst().orElseThrow(ApiException::notFound);
        if (in.getVersion() == null || in.getVersion().longValue() != current) {
            throw new ApiException(ErrorCode.VERSION_CONFLICT, HttpStatus.CONFLICT, Map.of("currentVersion", current));
        }
        List<String> sets = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        ZoneId zone = ZoneId.of(jdbc.queryForObject("SELECT timezone FROM users WHERE id = ?", String.class, userId));
        if (in.getTimezone() != null) {
            try {
                zone = ZoneId.of(in.getTimezone());
            } catch (DateTimeException e) {
                throw ApiException.validation("timezone", ErrorCode.VALIDATION_FAILED);
            }
            set(sets, args, "timezone", zone.getId());
        }
        if (in.getDisplayName() != null) {
            String name = in.getDisplayName().strip();
            if (name.isEmpty() || name.length() > 50) {
                throw ApiException.validation("displayName", ErrorCode.VALIDATION_FAILED);
            }
            set(sets, args, "display_name", name);
        }
        if (in.getCallName() != null) {
            String call = in.getCallName().strip();
            if (call.length() > 50) {
                throw ApiException.validation("callName", ErrorCode.VALIDATION_FAILED);
            }
            set(sets, args, "call_name", call.isEmpty() ? null : call);
        }
        if (in.getBirthDate() != null) {
            registration.requireAdult(in.getBirthDate(), zone, "birthDate");
            set(sets, args, "birth_date", in.getBirthDate());
        }
        if (in.getLocale() != null) {
            set(sets, args, "locale", in.getLocale().getValue());
        }
        if (in.getCity() != null) {
            CityRef c = in.getCity();
            set(sets, args, "city_name", c.getName().strip());
            set(sets, args, "city_lat", c.getLat());
            set(sets, args, "city_lon", c.getLon());
            set(sets, args, "country_code", c.getCountryCode());
        }
        boolean visibility = false;
        if (in.getOnlineVisible() != null) {
            set(sets, args, "online_visible", in.getOnlineVisible());
            visibility = true;
        }
        if (in.getTypingVisible() != null) {
            set(sets, args, "typing_visible", in.getTypingVisible());
        }
        sets.add("version = version + 1");
        sets.add("updated_at = ?");
        args.add(Timestamp.from(time.now()));
        args.add(userId);
        jdbc.update("UPDATE users SET " + String.join(", ", sets) + " WHERE id = ?", args.toArray());
        if (visibility) {
            presence.visibilityChanged(userId);
        }
        publishProfile(userId);
    }

    /** Профайлын зураг: SOLO (эсвэл одоогийн) space-ийн ≤ 10 MB, бэлэн зураг (AC-62). */
    @Transactional
    public void setAvatar(UUID userId, UUID mediaId) {
        MediaRef ref = ownMedia(userId, mediaId).orElseThrow(ApiException::notFound);
        if (ref.getKind() != MediaRef.KindEnum.IMAGE) {
            throw new ApiException(ErrorCode.MEDIA_TYPE_FORBIDDEN, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        }
        if (ref.getSizeBytes() > AVATAR_MAX_BYTES) {
            throw new ApiException(ErrorCode.MEDIA_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE);
        }
        jdbc.update("UPDATE users SET avatar_media_id = ?, version = version + 1, updated_at = ? WHERE id = ?",
                mediaId, Timestamp.from(time.now()), userId);
        publishProfile(userId);
    }

    private Optional<MediaRef> ownMedia(UUID userId, UUID mediaId) {
        List<UUID> owned = jdbc.queryForList("""
                SELECT m.id FROM media m JOIN space_member sm ON sm.space_id = m.space_id
                 WHERE m.id = ? AND m.owner_id = ? AND sm.user_id = ? AND sm.left_at IS NULL
                """, UUID.class, mediaId, userId, userId);
        return owned.isEmpty() ? Optional.empty() : media.find(mediaId);
    }

    /** Хамтрагчид тухайн хүний карт (хамтрагчийн өнцгөөс — бүсийн зөрүү) `profile.updated`. */
    private void publishProfile(UUID userId) {
        couples.partnerOf(userId).ifPresent(partner -> {
            UserRefs.UserRow me = users.row(userId).orElseThrow(ApiException::notFound);
            UserRefs.UserRow viewer = users.row(partner).orElseThrow(ApiException::notFound);
            events.publishEvent(RealtimeEvent.of("profile.updated", userId, List.of(partner),
                    personCard(me, viewer, time.now())));
        });
    }

    /** `PersonCard`-ийн суурь (нэр, орон нутгийн цаг, бүсийн зөрүү) — нүүр ч хэрэглэнэ. */
    public static PersonCard personCard(UserRefs.UserRow subject, UserRefs.UserRow viewer, Instant now) {
        ZoneId zone = ZoneId.of(subject.timezone());
        ZoneId viewerZone = ZoneId.of(viewer.timezone());
        int offset = zone.getRules().getOffset(now).getTotalSeconds() / 60;
        int viewerOffset = viewerZone.getRules().getOffset(now).getTotalSeconds() / 60;
        return new PersonCard(subject.shownName() == null ? "" : subject.shownName(),
                OffsetDateTime.ofInstant(now, zone), offset, offset - viewerOffset);
    }

    private static void set(List<String> sets, List<Object> args, String column, Object value) {
        sets.add(column + " = ?");
        args.add(value);
    }
}
