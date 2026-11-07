package mn.aura.couple.auth.app;

import java.util.UUID;
import mn.aura.couple.auth.domain.UserAccountRepository;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** AC-63: одоогийн бодлогын хувилбарыг (`aura.policy.version`) зөвшөөрөх — хувилбар, огноо хадгална. */
@Service
public class PolicyAcceptanceService {

    private final UserAccountRepository users;
    private final TimeProvider time;
    private final String current;

    public PolicyAcceptanceService(UserAccountRepository users, TimeProvider time, AuraProperties properties) {
        this.users = users;
        this.time = time;
        this.current = properties.policy().version();
    }

    @Transactional
    public void accept(UUID userId, String version) {
        if (!current.equals(version)) {
            throw ApiException.badRequest(ErrorCode.POLICY_NOT_ACCEPTED, "version");
        }
        users.acceptPolicy(userId, version, time.now());
    }
}
