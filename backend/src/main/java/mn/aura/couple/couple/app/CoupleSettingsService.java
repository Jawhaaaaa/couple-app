package mn.aura.couple.couple.app;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.Couple;
import mn.aura.couple.api.model.MyViewUpdate;
import mn.aura.couple.api.model.Theme;
import mn.aura.couple.api.model.ThemeProposal;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.domain.SpaceRepository;
import mn.aura.couple.couple.domain.SpaceRepository.MemberRow;
import mn.aura.couple.couple.domain.ThemeProposalRepository;
import mn.aura.couple.couple.domain.ThemeProposalRepository.ProposalRow;
import mn.aura.couple.media.app.MediaRefs;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Хосын тохиргоо (FR-18.5, FR-18.6, FR-3.7):
 * <ul>
 *   <li>Хоч, avatar, маскотын өнгө — зөвхөн дуудагчид (`space_member` ба `user_preference`), хамтрагчид хэзээ ч
 *       харагдахгүй (AC-137)</li>
 *   <li>Сэдэв — нэг нь санал болгож нөгөө нь зөвшөөрөхөд хоёуланд (realtime `couple.updated`); татгалзвал
 *       санал болгогчид мэдэгдэл (AC-138)</li>
 *   <li>Дараагийн уулзалт (R-5, AC-74)</li>
 * </ul>
 */
@Service
public class CoupleSettingsService {

    private final SpaceRepository spaces;
    private final ThemeProposalRepository themes;
    private final CoupleAssembler assembler;
    private final UserRefs users;
    private final MediaRefs media;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;
    private final JdbcTemplate jdbc;

    public CoupleSettingsService(SpaceRepository spaces, ThemeProposalRepository themes, CoupleAssembler assembler,
                                 UserRefs users, MediaRefs media, ApplicationEventPublisher events, TimeProvider time,
                                 JdbcTemplate jdbc) {
        this.spaces = spaces;
        this.themes = themes;
        this.assembler = assembler;
        this.users = users;
        this.media = media;
        this.events = events;
        this.time = time;
        this.jdbc = jdbc;
    }

    @Transactional
    public Couple updateMyView(SpaceContext ctx, MyViewUpdate update) {
        if (update.getPartnerNickname() != null || isExplicitNull(update)) {
            String nick = update.getPartnerNickname() == null ? null : update.getPartnerNickname().strip();
            jdbc.update("UPDATE space_member SET partner_nickname = ? WHERE space_id = ? AND user_id = ?",
                    nick == null || nick.isEmpty() ? null : nick, ctx.spaceId(), ctx.userId());
        }
        if (update.getPartnerAvatarMediaId() != null) {
            UUID mediaId = update.getPartnerAvatarMediaId();
            if (media.findInSpace(mediaId, ctx.spaceId()).isEmpty() && !isOwnPrivateImage(ctx.userId(), mediaId)) {
                throw ApiException.notFound();
            }
            jdbc.update("UPDATE space_member SET partner_avatar_media_id = ? WHERE space_id = ? AND user_id = ?",
                    mediaId, ctx.spaceId(), ctx.userId());
        }
        if (update.getMascotColor() != null) {
            jdbc.update("""
                    INSERT INTO user_preference (user_id, mascot_color) VALUES (?, ?)
                    ON CONFLICT (user_id) DO UPDATE SET mascot_color = EXCLUDED.mascot_color, updated_at = now()
                    """, ctx.userId(), update.getMascotColor());
        }
        return assembler.forUser(ctx.spaceId(), ctx.userId());
    }

    /**
     * Хамтрагчийн зургийг client `AVATAR` зорилгоор (дуудагчийн SOLO space-д) upload хийдэг — хамтрагчид
     * харагдахгүй хувийн зураг (AC-137). Зөвхөн дуудагчийн өөрийн SOLO space-ийн IMAGE байх ёстой.
     */
    private boolean isOwnPrivateImage(UUID userId, UUID mediaId) {
        Integer n = jdbc.queryForObject("""
                SELECT count(*) FROM media m
                  JOIN space_member sm ON sm.space_id = m.space_id AND sm.user_id = ? AND sm.space_kind = 'SOLO'
                 WHERE m.id = ? AND m.owner_id = ? AND m.kind = 'IMAGE'
                """, Integer.class, userId, mediaId, userId);
        return n != null && n > 0;
    }

    /** Хоч арилгах (`partnerNickname: null`) — үүсгэсэн DTO нь null ба байхгүйг ялгадаггүй тул бусад талбаргүй үед. */
    private static boolean isExplicitNull(MyViewUpdate u) {
        return u.getPartnerNickname() == null && u.getPartnerAvatarMediaId() == null && u.getMascotColor() == null;
    }

    @Transactional
    public ThemeProposal proposeTheme(SpaceContext ctx, Theme theme) {
        Instant now = time.now();
        UUID id = Ids.newId();
        try {
            themes.insert(id, ctx.spaceId(), ctx.userId(), theme.getValue(), now);
        } catch (DuplicateKeyException e) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, HttpStatus.CONFLICT, Map.of("reason", "PENDING_EXISTS"));
        }
        UUID partner = partnerOf(ctx);
        events.publishEvent(new Notify(partner, ctx.spaceId(), ctx.userId(), "THEME_PROPOSED",
                Map.of("partner", users.ref(ctx.userId()).getDisplayName()), "/settings/couple"));
        events.publishEvent(RealtimeEvent.of("couple.updated", ctx.userId(), List.of(ctx.userId(), partner),
                Map.of("coupleId", ctx.spaceId())));
        return new ThemeProposal(id, theme, ThemeProposal.StatusEnum.PENDING, users.ref(ctx.userId()),
                CoupleAssembler.utc(now));
    }

    @Transactional
    public Couple acceptTheme(SpaceContext ctx, UUID proposalId) {
        ProposalRow p = pendingFromPartner(ctx, proposalId);
        Instant now = time.now();
        themes.setStatus(p.id(), "ACCEPTED", now);
        jdbc.update("UPDATE space SET theme = ?, version = version + 1, updated_at = ? WHERE id = ?",
                p.theme(), Timestamp.from(now), ctx.spaceId());
        events.publishEvent(RealtimeEvent.of("couple.updated", ctx.userId(), List.of(ctx.userId(), p.proposerId()),
                Map.of("coupleId", ctx.spaceId())));
        return assembler.forUser(ctx.spaceId(), ctx.userId());
    }

    @Transactional
    public void declineTheme(SpaceContext ctx, UUID proposalId) {
        ProposalRow p = pendingFromPartner(ctx, proposalId);
        themes.setStatus(p.id(), "DECLINED", time.now());
        events.publishEvent(new Notify(p.proposerId(), ctx.spaceId(), ctx.userId(), "THEME_DECLINED",
                Map.of("partner", users.ref(ctx.userId()).getDisplayName()), "/settings/couple"));
        events.publishEvent(RealtimeEvent.of("couple.updated", ctx.userId(), List.of(ctx.userId(), p.proposerId()),
                Map.of("coupleId", ctx.spaceId())));
    }

    @Transactional
    public Couple setNextMeetup(SpaceContext ctx, OffsetDateTime at) {
        jdbc.update("UPDATE space SET next_meetup_at = ?, version = version + 1, updated_at = ? WHERE id = ?",
                at == null ? null : Timestamp.from(at.toInstant()), Timestamp.from(time.now()), ctx.spaceId());
        events.publishEvent(RealtimeEvent.of("couple.updated", ctx.userId(), List.of(ctx.userId(), partnerOf(ctx)),
                Map.of("coupleId", ctx.spaceId())));
        return assembler.forUser(ctx.spaceId(), ctx.userId());
    }

    /** Санал нь энэ space-ийнх, PENDING, хамтрагчийнх байх ёстой (өөрийнхийг зөвшөөрөх → 403). */
    private ProposalRow pendingFromPartner(SpaceContext ctx, UUID proposalId) {
        ProposalRow p = themes.findForUpdate(proposalId, ctx.spaceId()).orElseThrow(ApiException::notFound);
        if (p.proposerId().equals(ctx.userId())) {
            throw new ApiException(ErrorCode.NOT_OWNER, HttpStatus.FORBIDDEN);
        }
        if (!"PENDING".equals(p.status())) {
            throw new ApiException(ErrorCode.ALREADY_DECIDED, HttpStatus.CONFLICT);
        }
        return p;
    }

    private UUID partnerOf(SpaceContext ctx) {
        return spaces.members(ctx.spaceId()).stream().map(MemberRow::userId)
                .filter(u -> !u.equals(ctx.userId())).findFirst().orElseThrow(ApiException::notFound);
    }
}
