package mn.aura.couple.couple.app;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.Couple;
import mn.aura.couple.api.model.Pairing;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.domain.InviteRepository.InviteRow;
import mn.aura.couple.couple.domain.PairingRepository;
import mn.aura.couple.couple.domain.PairingRepository.PairingRow;
import mn.aura.couple.couple.domain.SpaceRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Хос холбох (FR-2.2, FR-2.4). Урсгал: B кодоор нэгдэх хүсэлт (`AWAITING_INVITER`, урилга `USED`,
 * A-д `INVITE_USED` мэдэгдэл — AC-68) → A батлахад л COUPLE space үүснэ (AC-170). Аль нэг нь цуцалбал
 * хос үүсэхгүй, хоёуланд мэдэгдэнэ (AC-10).
 * <p>Хосын бүс = урилга үүсгэгчийн бүс, өөрчлөгдөхгүй (SD-02). INV-02-ыг DB-ийн partial unique index
 * барина — зэрэг баталгаа `DuplicateKeyException` → 409 `ALREADY_PAIRED` (AC-66).
 */
@Service
public class CoupleService {

    private final InviteService invites;
    private final PairingRepository pairings;
    private final SpaceRepository spaces;
    private final UserRefs users;
    private final CoupleAssembler assembler;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public CoupleService(InviteService invites, PairingRepository pairings, SpaceRepository spaces, UserRefs users,
                         CoupleAssembler assembler, ApplicationEventPublisher events, TimeProvider time) {
        this.invites = invites;
        this.pairings = pairings;
        this.spaces = spaces;
        this.users = users;
        this.assembler = assembler;
        this.events = events;
        this.time = time;
    }

    @Transactional(noRollbackFor = ApiException.class)
    public Pairing requestPairing(UUID joinerId, String code) {
        InviteRow invite = invites.resolveUsable(joinerId, code);
        invites.markUsed(invite);
        Instant now = time.now();
        // Нэгдэгчийн өмнөх хүлээгдэж буй хүсэлтүүд хүчингүй — нэг зэрэг нэг л хүсэлт
        for (PairingRow old : pairings.findAllAwaiting(joinerId)) {
            if (old.joinerId().equals(joinerId)) {
                cancelRow(old, joinerId);
            }
        }
        UUID id = Ids.newId();
        pairings.insert(id, invite.id(), invite.inviterId(), joinerId, now);
        Pairing dto = toDto(new PairingRow(id, invite.id(), invite.inviterId(), joinerId, "AWAITING_INVITER", null));
        String joinerName = dto.getJoiner().getDisplayName();
        events.publishEvent(new Notify(invite.inviterId(), null, joinerId, "INVITE_USED",
                Map.of("partner", joinerName), "/join-confirm?pairing=" + id));
        events.publishEvent(RealtimeEvent.of("pairing.requested", joinerId, List.of(invite.inviterId()), dto));
        return dto;
    }

    @Transactional(readOnly = true)
    public Optional<Pairing> currentPairing(UUID userId) {
        return pairings.findAwaiting(userId).map(this::toDto);
    }

    /** Урилга үүсгэгчийн баталгаа — хос энд л үүснэ (AC-170). */
    @Transactional
    public Couple confirm(UUID userId, UUID pairingId) {
        PairingRow pairing = pairings.findForUpdate(pairingId)
                .filter(p -> p.involves(userId))
                .orElseThrow(ApiException::notFound);
        if (!pairing.awaiting()) {
            if ("LINKED".equals(pairing.status())) {
                throw new ApiException(ErrorCode.ALREADY_PAIRED, HttpStatus.CONFLICT, Map.of("who", "me"));
            }
            throw ApiException.notFound();
        }
        if (!pairing.inviterId().equals(userId)) {
            throw new ApiException(ErrorCode.NOT_OWNER, HttpStatus.FORBIDDEN);
        }
        invites.requireVerified(pairing.inviterId());
        invites.requireVerified(pairing.joinerId());
        for (UUID member : List.of(pairing.inviterId(), pairing.joinerId())) {
            if (spaces.coupleMembership(member).isPresent()) {
                throw new ApiException(ErrorCode.ALREADY_PAIRED, HttpStatus.CONFLICT,
                        Map.of("who", member.equals(userId) ? "me" : "partner"));
            }
        }
        Instant now = time.now();
        UUID spaceId = Ids.newId();
        spaces.insertCoupleSpace(spaceId, spaces.userTimezone(pairing.inviterId()), now);
        try {
            spaces.insertCoupleMember(spaceId, pairing.inviterId(), "PENDING", now);
            spaces.insertCoupleMember(spaceId, pairing.joinerId(), "PENDING", now);
        } catch (DuplicateKeyException e) {
            throw new ApiException(ErrorCode.ALREADY_PAIRED, HttpStatus.CONFLICT, Map.of("who", "partner"));
        }
        pairings.setStatus(pairing.id(), "LINKED", spaceId, now);
        for (UUID member : List.of(pairing.inviterId(), pairing.joinerId())) {
            invites.cancelAllOf(member);
            for (PairingRow other : pairings.findAllAwaiting(member)) {
                cancelRow(other, member);
            }
        }
        events.publishEvent(RealtimeEvent.of("couple.linked", userId,
                List.of(pairing.inviterId(), pairing.joinerId()), Map.of("coupleId", spaceId)));
        return assembler.forUser(spaceId, userId);
    }

    @Transactional
    public void cancel(UUID userId, UUID pairingId) {
        PairingRow pairing = pairings.findForUpdate(pairingId)
                .filter(p -> p.involves(userId) && p.awaiting())
                .orElseThrow(ApiException::notFound);
        cancelRow(pairing, userId);
    }

    /** Хүсэлтийг цуцалж хоёр талд мэдэгдэнэ (апп доторх + realtime, AC-10). */
    private void cancelRow(PairingRow pairing, UUID actorId) {
        pairings.setStatus(pairing.id(), "CANCELLED", null, time.now());
        List<UUID> both = List.of(pairing.inviterId(), pairing.joinerId());
        for (UUID recipient : both) {
            events.publishEvent(new Notify(recipient, null, actorId, "PAIRING_CANCELLED", Map.of(), "/invite"));
        }
        events.publishEvent(RealtimeEvent.of("pairing.cancelled", actorId, both, Map.of("pairingId", pairing.id())));
    }

    Pairing toDto(PairingRow row) {
        var refs = users.refs(List.of(row.inviterId(), row.joinerId()));
        return new Pairing(row.id(), Pairing.StatusEnum.fromValue(row.status()), refs.get(row.inviterId()),
                refs.get(row.joinerId()));
    }
}
