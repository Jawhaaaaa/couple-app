package mn.aura.couple.account.app;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import mn.aura.couple.api.model.Locale;
import mn.aura.couple.api.model.PolicyDocument;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.config.AuraProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

/**
 * Одоогийн нууцлалын бодлого ба үйлчилгээний нөхцөл (FR-14.2, FR-14.9, AC-63, AC-130). Хувилбар нь
 * `aura.policy.version` (`AURA_POLICY_VERSION`) — бүртгэл (`RegistrationService`), зөвшөөрөл
 * (`PolicyAcceptanceService`), `Me.policyUpdateRequired` (`MeAssembler`) ижил утгыг уншина.
 *
 * <p>Текстийн эх нь репогийн `docs/PRIVACY.md`, `docs/TERMS.md` (build-ийн үед classpath-ын `policy/`).
 * Файл бүр «lang:mn» / «lang:en» тэмдэгтэй HTML тайлбараар хэл тусгаарлагдсан — хүссэн хэлний хэсгийг
 * HTML тайлбаргүйгээр буцаана. `publishedAt` нь `aura.policy.published-at`, хоосон бол хувилбарын огноо
 * (`YYYY-MM-DD` → UTC 00:00).
 */
@Service
public class PolicyVersionService {

    private static final Logger log = LoggerFactory.getLogger(PolicyVersionService.class);
    private static final Pattern LANG_MARKER = Pattern.compile("<!--\\s*lang:(mn|en)\\s*-->");
    private static final Pattern HTML_COMMENT = Pattern.compile("<!--.*?-->", Pattern.DOTALL);

    private final String version;
    private final OffsetDateTime publishedAt;
    private final Map<Locale, String> privacy;
    private final Map<Locale, String> terms;

    public PolicyVersionService(AuraProperties properties,
                                @Value("${aura.policy.published-at:}") String publishedAt) {
        this.version = properties.policy().version();
        this.publishedAt = publishedAt(publishedAt, version);
        this.privacy = load("policy/PRIVACY.md");
        this.terms = load("policy/TERMS.md");
    }

    public String currentVersion() {
        return version;
    }

    /** Текст classpath-д байхгүй (build-д `docs/` ороогүй) бол 404 — хоосон бодлого харуулахгүй. */
    public PolicyDocument current(Locale locale) {
        Locale lang = locale == null ? Locale.MN : locale;
        String p = privacy.get(lang);
        String t = terms.get(lang);
        if (p == null || t == null) {
            throw ApiException.notFound();
        }
        return new PolicyDocument(version, publishedAt, p, t);
    }

    static OffsetDateTime publishedAt(String configured, String version) {
        if (configured != null && !configured.isBlank()) {
            return OffsetDateTime.parse(configured.strip());
        }
        try {
            return LocalDate.parse(version).atStartOfDay().atOffset(ZoneOffset.UTC);
        } catch (DateTimeParseException e) {
            return OffsetDateTime.ofInstant(Instant.EPOCH, ZoneOffset.UTC);
        }
    }

    private static Map<Locale, String> load(String path) {
        Map<Locale, String> out = new EnumMap<>(Locale.class);
        ClassPathResource resource = new ClassPathResource(path);
        if (!resource.exists()) {
            log.error("{} classpath-д алга — GET /policies/current 404 буцаана (build-д docs/ хуулагдаагүй)", path);
            return out;
        }
        try (InputStream in = resource.getInputStream()) {
            out.putAll(split(new String(in.readAllBytes(), StandardCharsets.UTF_8)));
        } catch (IOException e) {
            throw new IllegalStateException(path + " уншигдсангүй", e);
        }
        return out;
    }

    /** «lang:xx» тэмдгээс дараагийн тэмдэг хүртэлх хэсэг, HTML тайлбаргүй. */
    static Map<Locale, String> split(String markdown) {
        Map<Locale, String> out = new EnumMap<>(Locale.class);
        Matcher m = LANG_MARKER.matcher(markdown);
        Optional<Locale> current = Optional.empty();
        int start = 0;
        while (m.find()) {
            int at = m.start();
            int from = start;
            current.ifPresent(l -> out.put(l, clean(markdown.substring(from, at))));
            current = Optional.of(Locale.fromValue(m.group(1)));
            start = m.end();
        }
        int from = start;
        current.ifPresent(l -> out.put(l, clean(markdown.substring(from))));
        return out;
    }

    private static String clean(String s) {
        return HTML_COMMENT.matcher(s).replaceAll("").strip() + "\n";
    }
}
