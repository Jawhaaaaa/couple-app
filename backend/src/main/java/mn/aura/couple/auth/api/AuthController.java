package mn.aura.couple.auth.api;

import jakarta.servlet.http.HttpServletRequest;
import mn.aura.couple.api.AuthApi;
import mn.aura.couple.api.model.AcceptedResponse;
import mn.aura.couple.api.model.EmailRequest;
import mn.aura.couple.api.model.LoginRequest;
import mn.aura.couple.api.model.OAuthExchangeRequest;
import mn.aura.couple.api.model.OAuthExchangeResponse;
import mn.aura.couple.api.model.OAuthLinkRequest;
import mn.aura.couple.api.model.PasswordResetConfirm;
import mn.aura.couple.api.model.RefreshRequest;
import mn.aura.couple.api.model.RegisterRequest;
import mn.aura.couple.api.model.TokenRequest;
import mn.aura.couple.api.model.TokenResponse;
import mn.aura.couple.api.model.VerifyEmailRequest;
import mn.aura.couple.auth.app.DeviceSessionService;
import mn.aura.couple.auth.app.EmailVerificationService;
import mn.aura.couple.auth.app.LoginService;
import mn.aura.couple.auth.app.NotMeService;
import mn.aura.couple.auth.app.PasswordResetService;
import mn.aura.couple.auth.app.RefreshTokenService;
import mn.aura.couple.auth.app.RegistrationService;
import mn.aura.couple.auth.app.TokenIssuer;
import mn.aura.couple.auth.domain.DeviceSession;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.security.AuraAuthentication;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/**
 * Гэрээний `Auth` tag (LLD §4.1). Бүгд public (`SecurityConfig`-ийн `/api/v1/auth/**`), logout нь
 * Bearer токентой бол тэр session-ийг хаана. OAuth-ийн замууд `GoogleOAuthController`-т.
 */
@RestController
public class AuthController implements AuthApi {

    private final RegistrationService registration;
    private final EmailVerificationService verification;
    private final LoginService loginService;
    private final RefreshTokenService refreshTokens;
    private final TokenIssuer issuer;
    private final DeviceSessionService sessions;
    private final PasswordResetService passwordReset;
    private final NotMeService notMe;
    private final GoogleOAuthController oauth;
    private final AuthHttp http;
    private final HttpServletRequest request;

    public AuthController(RegistrationService registration, EmailVerificationService verification,
                          LoginService loginService, RefreshTokenService refreshTokens, TokenIssuer issuer,
                          DeviceSessionService sessions, PasswordResetService passwordReset, NotMeService notMe,
                          GoogleOAuthController oauth, AuthHttp http, HttpServletRequest request) {
        this.registration = registration;
        this.verification = verification;
        this.loginService = loginService;
        this.refreshTokens = refreshTokens;
        this.issuer = issuer;
        this.sessions = sessions;
        this.passwordReset = passwordReset;
        this.notMe = notMe;
        this.oauth = oauth;
        this.http = http;
        this.request = request;
    }

    /** DD-AURA-031: бүртгэлтэй эсэхээс үл хамааран 202 ижил бие. */
    @Override
    public ResponseEntity<AcceptedResponse> registerUser(RegisterRequest body) {
        registration.register(body);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(new AcceptedResponse(AcceptedResponse.AcceptedEnum.TRUE));
    }

    @Override
    public ResponseEntity<TokenResponse> verifyEmail(VerifyEmailRequest body) {
        return http.tokens(verification.verifyCode(body.getEmail(), body.getCode(), AuthHttp.device(null, request)), request);
    }

    @Override
    public ResponseEntity<TokenResponse> verifyEmailLink(TokenRequest body) {
        return http.tokens(verification.verifyLink(body.getToken(), AuthHttp.device(null, request)), request);
    }

    @Override
    public ResponseEntity<Void> resendVerificationEmail(EmailRequest body) {
        verification.resend(body.getEmail());
        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }

    @Override
    public ResponseEntity<TokenResponse> login(LoginRequest body) {
        TokenIssuer.IssuedTokens tokens = loginService.login(body.getEmail(), body.getPassword(),
                AuthHttp.device(body.getDevice(), request), request.getRemoteAddr());
        return http.tokens(tokens, request);
    }

    /**
     * Web: `aura_rt` cookie + `X-Aura-Client: web` (CSRF — header-гүй cookie-г хүлээн авахгүй).
     * Native: биеийн `refreshToken`.
     */
    @Override
    public ResponseEntity<TokenResponse> refreshToken(String xAuraClient, String auraRt, RefreshRequest body) {
        String raw = "web".equalsIgnoreCase(xAuraClient) ? auraRt : (body == null ? null : body.getRefreshToken());
        if (raw == null || raw.isBlank()) {
            throw new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.UNAUTHORIZED);
        }
        RefreshTokenService.Rotation rotation = refreshTokens.rotate(raw);
        return http.tokens(issuer.forSession(rotation.session().userId(), rotation.session().id(), rotation.refreshToken()),
                request);
    }

    @Override
    public ResponseEntity<Void> logout() {
        AuraAuthentication auth = AuraAuthentication.current()
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.UNAUTHORIZED));
        try {
            sessions.revoke(auth.userId(), auth.sessionId(), DeviceSession.RevokedReason.LOGOUT);
        } catch (ApiException e) {
            if (e.code() != ErrorCode.NOT_FOUND) {
                throw e;
            }
        }
        return http.noContentClearingCookie();
    }

    @Override
    public ResponseEntity<Void> requestPasswordReset(EmailRequest body) {
        passwordReset.request(body.getEmail());
        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }

    @Override
    public ResponseEntity<Void> confirmPasswordReset(PasswordResetConfirm body) {
        passwordReset.confirm(body.getToken(), body.getNewPassword());
        return http.noContentClearingCookie();
    }

    @Override
    public ResponseEntity<Void> reportNotMe(TokenRequest body) {
        notMe.report(body.getToken());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> startOAuth(String client, String provider) {
        return oauth.start(provider, client);
    }

    @Override
    public ResponseEntity<Void> oauthCallback(String state, String provider, String code, String error) {
        return oauth.callback(provider, code, state, error, request);
    }

    @Override
    public ResponseEntity<OAuthExchangeResponse> exchangeOAuthCode(OAuthExchangeRequest body) {
        return oauth.exchange(body, request);
    }

    @Override
    public ResponseEntity<TokenResponse> linkOAuthAccount(OAuthLinkRequest body) {
        return oauth.link(body, request);
    }
}
