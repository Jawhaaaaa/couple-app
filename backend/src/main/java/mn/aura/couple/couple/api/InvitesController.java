package mn.aura.couple.couple.api;

import java.util.UUID;
import mn.aura.couple.api.InvitesApi;
import mn.aura.couple.api.model.Couple;
import mn.aura.couple.api.model.Invite;
import mn.aura.couple.api.model.InvitePreview;
import mn.aura.couple.api.model.Pairing;
import mn.aura.couple.api.model.PairingRequest;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.couple.app.CoupleService;
import mn.aura.couple.couple.app.InviteService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Invites` tag — урилга ба хос холбох хүсэлт (T-22, FR-2.1, FR-2.2). */
@RestController
public class InvitesController implements InvitesApi {

    private final InviteService invites;
    private final CoupleService couples;

    public InvitesController(InviteService invites, CoupleService couples) {
        this.invites = invites;
        this.couples = couples;
    }

    @Override
    public ResponseEntity<Invite> createInvite() {
        return ResponseEntity.status(HttpStatus.CREATED).body(invites.create(me()));
    }

    @Override
    public ResponseEntity<Invite> getCurrentInvite() {
        return invites.current(me()).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    @Override
    public ResponseEntity<Void> cancelInvite(UUID inviteId) {
        invites.cancel(me(), inviteId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<InvitePreview> lookupInvite(String code) {
        return ResponseEntity.ok(invites.lookup(me(), code));
    }

    @Override
    public ResponseEntity<Pairing> createPairing(PairingRequest pairingRequest) {
        return ResponseEntity.status(HttpStatus.CREATED).body(couples.requestPairing(me(), pairingRequest.getCode()));
    }

    @Override
    public ResponseEntity<Pairing> getCurrentPairing() {
        return couples.currentPairing(me()).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    @Override
    public ResponseEntity<Couple> confirmPairing(UUID pairingId) {
        return ResponseEntity.ok(couples.confirm(me(), pairingId));
    }

    @Override
    public ResponseEntity<Void> cancelPairing(UUID pairingId) {
        couples.cancel(me(), pairingId);
        return ResponseEntity.noContent().build();
    }

    private static UUID me() {
        return SpaceAccessGuard.currentUserId();
    }
}
