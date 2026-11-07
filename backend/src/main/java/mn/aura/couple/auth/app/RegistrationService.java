package mn.aura.couple.auth.app;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.RegisterRequest;
import mn.aura.couple.auth.domain.UserAccount;
import mn.aura.couple.auth.domain.UserAccountRepository;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Бүртгэл (FR-1.1). Дараалал:
 * <ol>
 *   <li>Бодлогын хувилбар = `aura.policy.version` (AC-63) → `POLICY_NOT_ACCEPTED`</li>
 *   <li>18+ төрсөн огноогоор, хэрэглэгчийн бүсийн «өнөөдөр» (`TimeProvider`, AC-04) → `AGE_RESTRICTED`</li>
 *   <li>`PasswordPolicy` (AC-164) → `PASSWORD_WEAK` / `PASSWORD_COMMON`</li>
 *   <li>Timing-safe (DD-AURA-031, AC-02): Argon2 hash-ийг ХОЁР замд тооцно; бүртгэлтэй имэйлд
 *       «аль хэдийн бүртгэлтэй» имэйл, шинэд кодтой имэйл — хоёулаа async. Хариу үргэлж 202 ижил.</li>
 *   <li>Шинэ хэрэглэгчид SOLO space (DD-AURA-003), бодлогын хувилбар ба огноо (`policy_acceptance`).</li>
 * </ol>
 * Шалгалтууд имэйл бүртгэлтэй эсэхээс өмнө тул алдааны хариу ч ялгаагүй.
 */
@Service
public class RegistrationService {

    public static final int MIN_AGE = 18;

    private final UserAccountRepository users;
    private final PasswordPolicy passwordPolicy;
    private final PasswordHasher hasher;
    private final EmailVerificationService verification;
    private final AuthMails mails;
    private final TimeProvider time;
    private final String policyVersion;

    public RegistrationService(UserAccountRepository users, PasswordPolicy passwordPolicy, PasswordHasher hasher,
                               EmailVerificationService verification, AuthMails mails, TimeProvider time,
                               AuraProperties properties) {
        this.users = users;
        this.passwordPolicy = passwordPolicy;
        this.hasher = hasher;
        this.verification = verification;
        this.mails = mails;
        this.time = time;
        this.policyVersion = properties.policy().version();
    }

    @Transactional
    public void register(RegisterRequest request) {
        String email = normalizeEmail(request.getEmail());
        if (!policyVersion.equals(request.getAcceptedPolicyVersion())) {
            throw ApiException.badRequest(ErrorCode.POLICY_NOT_ACCEPTED, "acceptedPolicyVersion");
        }
        ZoneId zone = zone(request.getTimezone());
        requireAdult(request.getBirthDate(), zone, "birthDate");
        passwordPolicy.check(request.getPassword(), email, "password");

        String hash = hasher.hash(request.getPassword());
        String locale = request.getLocale() == null ? "mn" : request.getLocale().getValue();

        Optional<UserAccount> existing = users.findByEmail(email);
        if (existing.isPresent()) {
            mails.alreadyRegistered(email, existing.get().locale());
            return;
        }
        Optional<UUID> created = users.insert(new UserAccountRepository.NewUser(email, hash,
                request.getDisplayName().strip(), request.getBirthDate(), zone.getId(), locale, null, policyVersion),
                time.now());
        if (created.isEmpty()) {
            // Зэрэг бүртгэл — нөгөө хүсэлт түрүүлсэн; хариу ижил хэвээр
            mails.alreadyRegistered(email, locale);
            return;
        }
        verification.issueAndSend(created.get(), email, locale);
    }

    /** 18 насанд хүрсэн өдрөөсөө эхлэн зөвшөөрнө (2026-11-07-нд 2008-11-07 ✓, 2008-11-08 ✗ — AC-04). */
    public void requireAdult(LocalDate birthDate, ZoneId zone, String field) {
        LocalDate today = time.today(zone);
        if (birthDate == null || birthDate.plusYears(MIN_AGE).isAfter(today)) {
            throw ApiException.badRequest(ErrorCode.AGE_RESTRICTED, field);
        }
    }

    public static String normalizeEmail(String email) {
        return email == null ? null : email.strip().toLowerCase(Locale.ROOT);
    }

    private static ZoneId zone(String timezone) {
        try {
            return ZoneId.of(timezone);
        } catch (DateTimeException | NullPointerException e) {
            throw ApiException.validation("timezone", ErrorCode.VALIDATION_FAILED);
        }
    }
}
