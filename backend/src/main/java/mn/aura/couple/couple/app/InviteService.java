package mn.aura.couple.couple.app;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.Invite;
import mn.aura.couple.api.model.InvitePreview;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.ratelimit.AttemptLimiter;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.domain.InviteRepository;
import mn.aura.couple.couple.domain.InviteRepository.InviteRow;
import mn.aura.couple.couple.domain.SpaceRepository;
import mn.aura.couple.couple.domain.SpaceRepository.CoupleMembership;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Урилга (FR-2.1, FR-2.4, FR-15.3). Код `AURA-XXXX`, 7 хоног, нэг удаагийн (AC-169).
 * <ul>
 *   <li>Баталгаажаагүй акаунт урилга үүсгэх, ашиглах боломжгүй — 403 `AUTH_EMAIL_NOT_VERIFIED` (AC-165)</li>
 *   <li>Хостой хүн — 409 `ALREADY_PAIRED`; тасалж буй (14 хоног) — 409 `PAIRING_COOLDOWN` + `availableAt` (AC-66, AC-171)</li>
 *   <li>Акаунт тутам 1 цагт 10 буруу код → 11 дэхээс 423 `INVITE_LOCKED`, зөв код ч татгалзана (AC-09)</li>
 *   <li>Хугацаа дууссан, ашиглагдсан, цуцлагдсан код → 410 `INVITE_INVALID` (AC-08)</li>
 * </ul>
 * Буруу оролдлогын тоолуур алдааны үед буцахгүйн тулд `noRollbackFor = ApiException.class`.
 */
@Service
public class InviteService {

    public static final Duration TTL = Duration.ofDays(7);
    static final AttemptLimiter.Limit WRONG_CODE_LIMIT = AttemptLimiter.Limit.perWindow(10, Duration.ofHours(1));
    static final AttemptLimiter.Limit CREATE_LIMIT = AttemptLimiter.Limit.perWindow(20, Duration.ofHours(1));
    private static final int CODE_ATTEMPTS = 20;

    private final InviteRepository invites;
    private final SpaceRepository spaces;
    private final InviteCodeGenerator codes;
    private final AttemptLimiter limiter;
    private final UserRefs users;
    private final TimeProvider time;
    private final String webBaseUrl;

    public InviteService(InviteRepository invites, SpaceRepository spaces, InviteCodeGenerator codes,
                         AttemptLimiter limiter, UserRefs users, TimeProvider time, AuraProperties properties) {
        this.invites = invites;
        this.spaces = spaces;
        this.codes = codes;
        this.limiter = limiter;
        this.users = users;
        this.time = time;
        this.webBaseUrl = stripSlash(properties.web().baseUrl());
    }

    @Transactional(noRollbackFor = ApiException.class)
    public Invite create(UUID userId) {
        requireVerified(userId);
        requireUnpaired(userId);
        AttemptLimiter.State state = limiter.recordAttempt("invite-create:" + userId, CREATE_LIMIT);
        if (state.count() > CREATE_LIMIT.max()) {
            throw ApiException.rateLimited(state.retryAfterSeconds());
        }
        Instant now = time.now();
        invites.cancelActive(userId, now);
        invites.expire(now);
        UUID id = Ids.newId();
        Instant expiresAt = now.plus(TTL);
        for (int i = 0; i < CODE_ATTEMPTS; i++) {
            String code = codes.next();
            if (invites.insert(id, code, userId, expiresAt, now)) {
                return toDto(new InviteRow(id, code, userId, expiresAt, "ACTIVE", now));
            }
        }
        throw new IllegalStateException("Урилгын код үүсгэж чадсангүй");
    }

    @Transactional(readOnly = true)
    public Optional<Invite> current(UUID userId) {
        return invites.findLatestActive(userId, time.now()).map(this::toDto);
    }

    @Transactional
    public void cancel(UUID userId, UUID inviteId) {
        InviteRow invite = invites.findById(inviteId)
                .filter(i -> i.inviterId().equals(userId) && "ACTIVE".equals(i.status()))
                .orElseThrow(ApiException::notFound);
        invites.setStatus(invite.id(), "CANCELLED", time.now());
    }

    @Transactional(noRollbackFor = ApiException.class)
    public InvitePreview lookup(UUID userId, String rawCode) {
        InviteRow invite = resolveUsable(userId, rawCode);
        UserRefs.UserRow inviter = users.row(invite.inviterId()).orElseThrow(ApiException::notFound);
        InvitePreview preview = new InvitePreview(inviter.shownName(), utc(invite.expiresAt()));
        preview.inviterAvatar(users.ref(inviter.id()).getAvatar());
        return preview;
    }

    /**
     * Нэгдэх хүсэлтийн хаалга (lookup ба `POST /pairings` хоёуланд). Буруу оролдлогыг тоолно.
     * Дуудагч түгжээтэй мөрийг (FOR UPDATE) авна — нэг урилгыг хоёр хүн зэрэг ашиглахгүй.
     */
    InviteRow resolveUsable(UUID userId, String rawCode) {
        requireVerified(userId);
        String key = "invite:" + userId;
        limiter.lockedFor(key).ifPresent(d -> {
            throw ApiException.withRetryAfter(ErrorCode.INVITE_LOCKED, HttpStatus.LOCKED, AttemptLimiter.seconds(d));
        });
        requireUnpaired(userId);
        String code = InviteCodeGenerator.normalize(rawCode);
        Instant now = time.now();
        Optional<InviteRow> found = code == null ? Optional.empty() : invites.findLatestByCode(code);
        if (found.isPresent() && found.get().inviterId().equals(userId)) {
            // Өөрийн кодыг ашиглах нь буруу оролдлого биш — тоолохгүй
            throw new ApiException(ErrorCode.INVITE_INVALID, HttpStatus.GONE, Map.of("reason", "OWN_INVITE"));
        }
        if (found.isEmpty() || !found.get().usable(now)) {
            AttemptLimiter.State state = limiter.recordAttempt(key, WRONG_CODE_LIMIT);
            if (state.count() > WRONG_CODE_LIMIT.max()) {
                throw ApiException.withRetryAfter(ErrorCode.INVITE_LOCKED, HttpStatus.LOCKED, state.retryAfterSeconds());
            }
            throw new ApiException(ErrorCode.INVITE_INVALID, HttpStatus.GONE);
        }
        InviteRow invite = found.get();
        if (spaces.coupleMembership(invite.inviterId()).isPresent()) {
            throw new ApiException(ErrorCode.ALREADY_PAIRED, HttpStatus.CONFLICT, Map.of("who", "inviter"));
        }
        limiter.reset(key);
        return invite;
    }

    void markUsed(InviteRow invite) {
        invites.setStatus(invite.id(), "USED", time.now());
    }

    void cancelAllOf(UUID userId) {
        invites.cancelActive(userId, time.now());
    }

    void requireVerified(UUID userId) {
        if (!spaces.emailVerified(userId)) {
            throw new ApiException(ErrorCode.AUTH_EMAIL_NOT_VERIFIED, HttpStatus.FORBIDDEN);
        }
    }

    /** Хостой → 409 `ALREADY_PAIRED`; тасалж буй/орхигдсон space → 409 `PAIRING_COOLDOWN` (AC-171). */
    void requireUnpaired(UUID userId) {
        Optional<CoupleMembership> membership = spaces.coupleMembership(userId);
        if (membership.isEmpty()) {
            return;
        }
        CoupleMembership m = membership.get();
        if (m.active()) {
            throw new ApiException(ErrorCode.ALREADY_PAIRED, HttpStatus.CONFLICT, Map.of("who", "me"));
        }
        Map<String, Object> details = m.readOnlyUntil() == null ? Map.of() : Map.of("availableAt", utc(m.readOnlyUntil()).toString());
        throw new ApiException(ErrorCode.PAIRING_COOLDOWN, HttpStatus.CONFLICT, details);
    }

    Invite toDto(InviteRow row) {
        return new Invite(row.id(), row.code(), URI.create(webBaseUrl + "/i/" + row.code()), utc(row.expiresAt()));
    }

    static OffsetDateTime utc(Instant i) {
        return OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }

    private static String stripSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}
