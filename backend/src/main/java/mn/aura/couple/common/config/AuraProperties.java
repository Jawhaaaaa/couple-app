package mn.aura.couple.common.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * `aura.*` тохиргоо (LLD §4.5, DD-AURA-038). Утгууд `application.yml`-д орчны хувьсагчаас.
 */
@ConfigurationProperties(prefix = "aura")
public record AuraProperties(
        Jwt jwt,
        S3 s3,
        Mail mail,
        Cors cors,
        Cookie cookie,
        Storage storage,
        Sentry sentry,
        Policy policy,
        Web web,
        Oauth oauth) {

    public AuraProperties {
        jwt = jwt != null ? jwt : new Jwt("");
        s3 = s3 != null ? s3 : new S3(null, null, "us-east-1", "aura-media", null, null, true, Duration.ofMinutes(15));
        mail = mail != null ? mail : new Mail("Aura <no-reply@aura.local>");
        cors = cors != null ? cors : new Cors(List.of());
        cookie = cookie != null ? cookie : new Cookie(true);
        storage = storage != null ? storage : new Storage(10_737_418_240L, 0.8);
        sentry = sentry != null ? sentry : new Sentry("", "dev", null);
        policy = policy != null ? policy : new Policy("2026-11-07");
        web = web != null ? web : new Web("http://localhost:8090");
        oauth = oauth != null ? oauth : new Oauth(null, null, null);
    }

    public record Jwt(@DefaultValue("") String secret) {
    }

    /** S3 (SeaweedFS). `publicEndpoint` нь presigned URL-ийн хост — утас хүрэх хаяг (DD-AURA-013). */
    public record S3(
            String endpoint,
            String publicEndpoint,
            @DefaultValue("us-east-1") String region,
            @DefaultValue("aura-media") String bucket,
            String accessKey,
            String secretKey,
            @DefaultValue("true") boolean pathStyle,
            @DefaultValue("15m") Duration presignTtl) {

        public String effectivePublicEndpoint() {
            return publicEndpoint == null || publicEndpoint.isBlank() ? endpoint : publicEndpoint;
        }
    }

    public record Mail(@DefaultValue("Aura <no-reply@aura.local>") String from) {
    }

    public record Cors(@DefaultValue List<String> allowedOrigins) {
    }

    public record Cookie(@DefaultValue("true") boolean secure) {
    }

    /** Хосын хадгалах сан (NFR-11, AC-200). */
    public record Storage(
            @DefaultValue("10737418240") long quotaBytes,
            @DefaultValue("0.8") double warnRatio) {
    }

    public record Sentry(@DefaultValue("") String dsn, @DefaultValue("dev") String environment, String release) {
    }

    public record Policy(@DefaultValue("2026-11-07") String version) {
    }

    /** Вэб апп-ын гаднах хаяг — имэйлийн холбоос ба вэбийн OAuth буцах хуудас (`/oauth-callback`). */
    public record Web(@DefaultValue("http://localhost:8090") String baseUrl) {
    }

    /**
     * OAuth (DD-AURA-032). `redirectBase` нь backend-ийн гаднах хаяг — IdP-д бүртгэсэн callback нь
     * `{redirectBase}/api/v1/auth/oauth/{provider}/callback`.
     */
    public record Oauth(String redirectBase, Provider google, Provider apple) {

        public Oauth {
            redirectBase = redirectBase == null || redirectBase.isBlank() ? "http://localhost:8080" : redirectBase;
            google = google != null ? google : Provider.disabled();
            apple = apple != null ? apple : Provider.disabled();
        }
    }

    /**
     * OIDC provider. `clientId` хоосон эсвэл `enabled=false` бол 404 `PROVIDER_DISABLED`.
     * `issuer` нь Google-ийнх (`https://accounts.google.com`) биш бол (E2E-ийн stub IdP, GAP-18)
     * endpoint-ууд `{issuer}/authorize`, `{issuer}/token`, `{issuer}/jwks` болно.
     * `idTokenAlg`: `RS256` (JWKS) эсвэл `HS256` (client secret-ээр — зөвхөн stub IdP).
     */
    public record Provider(
            @DefaultValue("true") boolean enabled,
            String clientId,
            String clientSecret,
            String issuer,
            String authorizeUri,
            String tokenUri,
            String jwksUri,
            @DefaultValue("RS256") String idTokenAlg) {

        static Provider disabled() {
            return new Provider(false, "", "", null, null, null, null, "RS256");
        }

        public boolean configured() {
            return enabled && clientId != null && !clientId.isBlank();
        }
    }
}
