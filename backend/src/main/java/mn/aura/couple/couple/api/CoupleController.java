package mn.aura.couple.couple.api;

import java.util.UUID;
import mn.aura.couple.api.CoupleApi;
import mn.aura.couple.api.model.BreakupRequest;
import mn.aura.couple.api.model.BreakupState;
import mn.aura.couple.api.model.Couple;
import mn.aura.couple.api.model.MyViewUpdate;
import mn.aura.couple.api.model.NextMeetup;
import mn.aura.couple.api.model.SoloShareDecision;
import mn.aura.couple.api.model.SoloShareResult;
import mn.aura.couple.api.model.StartDateProposal;
import mn.aura.couple.api.model.ThemeProposal;
import mn.aura.couple.api.model.ThemeProposalRequest;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.couple.app.CoupleAssembler;
import mn.aura.couple.couple.app.CoupleBreakupService;
import mn.aura.couple.couple.app.CoupleSettingsService;
import mn.aura.couple.couple.app.SoloContentShareService;
import mn.aura.couple.couple.app.StartDateService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/**
 * Гэрээний `Couple` tag. `GET /couple` нь SOLO үед ч (kind=SOLO) хариулна; бусад нь хос шаардана
 * (`x-aura-requires-couple`) — SOLO → 409 `NOT_PAIRED`, тасалж буй → 423 `SPACE_READ_ONLY`.
 */
@RestController
public class CoupleController implements CoupleApi {

    private final SpaceAccessGuard guard;
    private final CoupleAssembler assembler;
    private final StartDateService startDates;
    private final SoloContentShareService soloShare;
    private final CoupleSettingsService settings;
    private final CoupleBreakupService breakups;

    public CoupleController(SpaceAccessGuard guard, CoupleAssembler assembler, StartDateService startDates,
                            SoloContentShareService soloShare, CoupleSettingsService settings,
                            CoupleBreakupService breakups) {
        this.breakups = breakups;
        this.guard = guard;
        this.assembler = assembler;
        this.startDates = startDates;
        this.soloShare = soloShare;
        this.settings = settings;
    }

    @Override
    public ResponseEntity<Couple> getCouple() {
        SpaceContext ctx = guard.current();
        return ResponseEntity.ok(assembler.forUser(ctx.spaceId(), ctx.userId()));
    }

    @Override
    public ResponseEntity<Couple> proposeStartDate(StartDateProposal body) {
        return ResponseEntity.ok(startDates.propose(guard.requireWritableCouple(), body.getDate()));
    }

    @Override
    public ResponseEntity<SoloShareResult> decideSoloShare(SoloShareDecision body) {
        return ResponseEntity.ok(soloShare.decide(guard.requireWritableCouple(), Boolean.TRUE.equals(body.getShare())));
    }

    @Override
    public ResponseEntity<Couple> updateMyView(MyViewUpdate body) {
        return ResponseEntity.ok(settings.updateMyView(guard.requireWritableCouple(), body));
    }

    @Override
    public ResponseEntity<ThemeProposal> proposeTheme(ThemeProposalRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(settings.proposeTheme(guard.requireWritableCouple(), body.getTheme()));
    }

    @Override
    public ResponseEntity<Couple> acceptThemeProposal(UUID proposalId) {
        return ResponseEntity.ok(settings.acceptTheme(guard.requireWritableCouple(), proposalId));
    }

    @Override
    public ResponseEntity<Void> declineThemeProposal(UUID proposalId) {
        settings.declineTheme(guard.requireWritableCouple(), proposalId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Couple> setNextMeetup(NextMeetup body) {
        return ResponseEntity.ok(settings.setNextMeetup(guard.requireWritableCouple(), body.getAt()));
    }

    // Хос тасалах ба сэргээх — T-73 (`CoupleBreakupService`) хэрэгжүүлнэ

    @Override
    public ResponseEntity<BreakupState> startBreakup(BreakupRequest body) {
        return ResponseEntity.status(org.springframework.http.HttpStatus.ACCEPTED)
                .body(breakups.start(guard.requireWritableCouple(), body.getPassword(),
                        body.getConfirmStep() == null ? null : body.getConfirmStep().getValue()));
    }

    @Override
    public ResponseEntity<BreakupState> restoreCouple() {
        return ResponseEntity.ok(breakups.restore(guard.requireCouple())); // BREAKING үед ч зөвшөөрөгдөнө
    }
}
