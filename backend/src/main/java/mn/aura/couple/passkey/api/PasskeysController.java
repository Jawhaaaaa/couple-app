package mn.aura.couple.passkey.api;

import java.util.UUID;
import mn.aura.couple.api.PasskeysApi;
import mn.aura.couple.api.model.PasskeyAssertion;
import mn.aura.couple.api.model.PasskeyRegistration;
import mn.aura.couple.api.model.PasskeyVerification;
import mn.aura.couple.api.model.PublicKeyCredentialCreationOptions;
import mn.aura.couple.api.model.PublicKeyCredentialRequestOptions;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.security.AuraAuthentication;
import mn.aura.couple.passkey.app.PasskeyService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Passkeys` tag (`x-aura-scope: user`, AC-157): S-102 passkey тохируулах, апп түгжээ тайлах. */
@RestController
public class PasskeysController implements PasskeysApi {

    private final PasskeyService passkeys;

    public PasskeysController(PasskeyService passkeys) {
        this.passkeys = passkeys;
    }

    @Override
    public ResponseEntity<PublicKeyCredentialCreationOptions> getPasskeyRegistrationOptions() {
        return ResponseEntity.ok(passkeys.registrationOptions(userId()));
    }

    @Override
    public ResponseEntity<Void> registerPasskey(PasskeyRegistration body) {
        passkeys.register(userId(), body.getCredential());
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @Override
    public ResponseEntity<PublicKeyCredentialRequestOptions> getPasskeyAssertionOptions() {
        return ResponseEntity.ok(passkeys.assertionOptions(userId()));
    }

    @Override
    public ResponseEntity<PasskeyVerification> verifyPasskeyAssertion(PasskeyAssertion body) {
        passkeys.verifyAssertion(userId(), body.getCredential());
        return ResponseEntity.ok(new PasskeyVerification(PasskeyVerification.VerifiedEnum.TRUE));
    }

    @Override
    public ResponseEntity<Void> deletePasskey(String credentialId) {
        passkeys.delete(userId(), credentialId);
        return ResponseEntity.noContent().build();
    }

    private static UUID userId() {
        return AuraAuthentication.current()
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.UNAUTHORIZED))
                .userId();
    }
}
