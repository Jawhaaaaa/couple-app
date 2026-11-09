package mn.aura.couple.auth.api;

import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.MeApi;
import mn.aura.couple.api.model.AccountDeletionRequest;
import mn.aura.couple.api.model.AccountDeletionResult;
import mn.aura.couple.api.model.AvatarRequest;
import mn.aura.couple.api.model.Celebration;
import mn.aura.couple.api.model.CodeRequest;
import mn.aura.couple.api.model.EmailChangeRequest;
import mn.aura.couple.api.model.FirstWeekState;
import mn.aura.couple.api.model.Me;
import mn.aura.couple.api.model.PasswordChange;
import mn.aura.couple.api.model.PolicyAcceptance;
import mn.aura.couple.api.model.Preferences;
import mn.aura.couple.api.model.PreferencesUpdate;
import mn.aura.couple.api.model.ProfileUpdate;
import mn.aura.couple.api.model.SurveyAnswer;
import mn.aura.couple.api.model.SurveyPrompt;
import mn.aura.couple.api.model.TaskStatusRequest;
import mn.aura.couple.account.app.CelebrationSeenService;
import mn.aura.couple.account.app.PreferenceService;
import mn.aura.couple.account.app.ProfileService;
import mn.aura.couple.auth.app.EmailChangeService;
import mn.aura.couple.auth.app.MeAssembler;
import mn.aura.couple.auth.app.PasswordChangeService;
import mn.aura.couple.auth.app.PolicyAcceptanceService;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.security.AuraAuthentication;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/**
 * Гэрээний `Me` tag — auth-тай холбоотой хэсэг (T-17…T-19): `GET /me`, нууц үг солих (AC-189),
 * имэйл солих (AC-136), бодлого зөвшөөрөх (AC-63).
 *
 * <p>Үүсгэсэн `MeApi` нэг интерфейс тул профайл, тохиргоо, эхний 7 хоног, баяр, санал асуулга,
 * устгалын операцууд одоогоор 404 `NOT_FOUND` — account домэйны нэгжүүд (T-26 `ProfileService`,
 * T-75, T-76, T-71…) энэ controller-ыг account багц руу шилжүүлж бөглөнө.
 */
@RestController
public class MeController implements MeApi {

    private final MeAssembler me;
    private final PasswordChangeService passwordChange;
    private final EmailChangeService emailChange;
    private final PolicyAcceptanceService policy;
    private final ProfileService profile;
    private final PreferenceService preferences;
    private final CelebrationSeenService celebrations;

    public MeController(MeAssembler me, PasswordChangeService passwordChange, EmailChangeService emailChange,
                        PolicyAcceptanceService policy, ProfileService profile, PreferenceService preferences,
                        CelebrationSeenService celebrations) {
        this.me = me;
        this.passwordChange = passwordChange;
        this.emailChange = emailChange;
        this.policy = policy;
        this.profile = profile;
        this.preferences = preferences;
        this.celebrations = celebrations;
    }

    @Override
    public ResponseEntity<Me> getMe() {
        return ResponseEntity.ok(me.load(current().userId()));
    }

    @Override
    public ResponseEntity<Void> changePassword(PasswordChange body) {
        AuraAuthentication auth = current();
        passwordChange.change(auth.userId(), auth.sessionId(), body.getCurrentPassword(), body.getNewPassword());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> requestEmailChange(EmailChangeRequest body) {
        emailChange.request(current().userId(), body.getNewEmail(), body.getPassword());
        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }

    @Override
    public ResponseEntity<Me> confirmEmailChange(CodeRequest body) {
        AuraAuthentication auth = current();
        emailChange.confirm(auth.userId(), body.getCode());
        return ResponseEntity.ok(me.load(auth.userId()));
    }

    @Override
    public ResponseEntity<Void> acceptPolicy(PolicyAcceptance body) {
        policy.accept(current().userId(), body.getVersion());
        return ResponseEntity.noContent().build();
    }

    // --- account домэйны нэгжүүд хэрэгжүүлнэ (T-26, T-71, T-75, T-76, T-80…) ---

    @Override
    public ResponseEntity<Me> updateMe(ProfileUpdate body) {
        UUID userId = current().userId();
        profile.update(userId, body);
        return ResponseEntity.ok(me.load(userId));
    }

    @Override
    public ResponseEntity<Me> setAvatar(AvatarRequest body) {
        UUID userId = current().userId();
        profile.setAvatar(userId, body.getMediaId());
        return ResponseEntity.ok(me.load(userId));
    }

    @Override
    public ResponseEntity<Preferences> getPreferences() {
        return ResponseEntity.ok(preferences.get(current().userId()));
    }

    @Override
    public ResponseEntity<Preferences> updatePreferences(PreferencesUpdate body) {
        return ResponseEntity.ok(preferences.update(current().userId(), body));
    }

    @Override
    public ResponseEntity<AccountDeletionResult> deleteAccount(AccountDeletionRequest body) {
        throw notYet();
    }

    @Override
    public ResponseEntity<FirstWeekState> getFirstWeekTasks() {
        throw notYet();
    }

    @Override
    public ResponseEntity<FirstWeekState> setFirstWeekTaskStatus(String taskKey, TaskStatusRequest body) {
        throw notYet();
    }

    @Override
    public ResponseEntity<List<Celebration>> listCelebrations() {
        return ResponseEntity.ok(celebrations.unseen(current().userId()));
    }

    @Override
    public ResponseEntity<Void> markCelebrationSeen(String eventKey) {
        celebrations.markSeen(current().userId(), eventKey);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<SurveyPrompt> getSurvey() {
        throw notYet();
    }

    @Override
    public ResponseEntity<Void> answerSurvey(SurveyAnswer body) {
        throw notYet();
    }

    static AuraAuthentication current() {
        return AuraAuthentication.current()
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.UNAUTHORIZED));
    }

    private static ApiException notYet() {
        return ApiException.notFound();
    }
}
