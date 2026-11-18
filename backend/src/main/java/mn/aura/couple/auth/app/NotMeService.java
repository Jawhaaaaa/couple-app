package mn.aura.couple.auth.app;

import java.time.Instant;
import mn.aura.couple.auth.domain.DeviceSession;
import mn.aura.couple.auth.domain.EmailToken;
import mn.aura.couple.auth.domain.EmailTokenRepository;
import mn.aura.couple.auth.domain.UserAccountRepository;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * «Би биш» холбоос (`POST /auth/not-me`, AC-125, AC-189): бүх session хаагдаж, дараагийн нэвтрэлтэд
 * нууц үг шаардана (`require_password=true`). Нэг удаагийн.
 */
@Service
public class NotMeService {

    private final EmailTokenRepository tokens;
    private final UserAccountRepository users;
    private final DeviceSessionService sessions;
    private final TokenHasher hasher;
    private final TimeProvider time;

    public NotMeService(EmailTokenRepository tokens, UserAccountRepository users, DeviceSessionService sessions,
                        TokenHasher hasher, TimeProvider time) {
        this.tokens = tokens;
        this.users = users;
        this.sessions = sessions;
        this.hasher = hasher;
        this.time = time;
    }

    @Transactional
    public void report(String linkToken) {
        Instant now = time.now();
        EmailToken token = tokens.findByLinkHash(hasher.sha256(linkToken.strip()), EmailToken.Purpose.NOT_ME)
                .filter(t -> !t.consumed())
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.BAD_REQUEST));
        if (token.expired(now)) {
            throw new ApiException(ErrorCode.TOKEN_EXPIRED, HttpStatus.GONE);
        }
        tokens.consume(token.id(), now);
        sessions.lockRemotely(token.userId(), DeviceSession.RevokedReason.NOT_ME);
    }
}
