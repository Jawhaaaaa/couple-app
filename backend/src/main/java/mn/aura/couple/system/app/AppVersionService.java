package mn.aura.couple.system.app;

import java.net.URI;
import java.util.Set;
import java.util.regex.Pattern;
import mn.aura.couple.api.model.VersionInfo;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Апп-ын хувилбарын мэдээлэл (`version.json`-ийн эх, FR-17.5, AC-141). Утга бүр орчны хувьсагчаас
 * (`AURA_APP_LATEST_VERSION`, `AURA_APP_MIN_VERSION`, `AURA_APP_BUILD`, `AURA_APP_COMMIT_SHA`,
 * `AURA_DOWNLOAD_URL`, `AURA_APP_STORE_URL`); compose хоосон мөр дамжуулдаг тул хоосон/буруу утга
 * анхдагчаар солигдоно. `current` өгвөл semver-ээр харьцуулна: `< latest` → `updateAvailable`,
 * `< minVersion` → `updateRequired` (S-97). Вэб (PWA) өөрөө шинэчлэгддэг тул `platform=web`-д татах/store
 * холбоос буцаахгүй.
 */
@Service
public class AppVersionService {

    private static final Logger log = LoggerFactory.getLogger(AppVersionService.class);
    static final Pattern SEMVER = Pattern.compile("^[0-9]+\\.[0-9]+\\.[0-9]+$");
    static final Pattern SHA = Pattern.compile("^[0-9a-f]{7,40}$");
    static final String DEFAULT_VERSION = "1.0.0";
    static final String DEFAULT_SHA = "0000000";
    static final Set<String> PLATFORMS = Set.of("web", "android", "ios");

    private final String latest;
    private final String minVersion;
    private final String build;
    private final String commitSha;
    private final URI downloadUrl;
    private final URI storeUrl;

    public AppVersionService(@Value("${aura.app.latest-version:}") String latest,
                             @Value("${aura.app.min-version:}") String minVersion,
                             @Value("${aura.app.build:}") String build,
                             @Value("${aura.app.commit-sha:}") String commitSha,
                             @Value("${aura.app.download-url:}") String downloadUrl,
                             @Value("${aura.app.store-url:}") String storeUrl) {
        this.latest = semver(latest, DEFAULT_VERSION, "latest-version");
        String min = semver(minVersion, this.latest, "min-version");
        this.minVersion = compare(min, this.latest) > 0 ? this.latest : min;
        this.build = blank(build) ? "dev" : build.strip();
        this.commitSha = blank(commitSha) || !SHA.matcher(commitSha.strip().toLowerCase()).matches()
                ? DEFAULT_SHA : commitSha.strip().toLowerCase();
        this.downloadUrl = uri(downloadUrl);
        this.storeUrl = uri(storeUrl);
    }

    public VersionInfo info(String platform, String current) {
        if (platform != null && !PLATFORMS.contains(platform)) {
            throw ApiException.validation("platform", ErrorCode.VALIDATION_FAILED);
        }
        boolean known = current != null && SEMVER.matcher(current).matches();
        VersionInfo info = new VersionInfo(latest, minVersion, build, commitSha,
                known && compare(current, latest) < 0, known && compare(current, minVersion) < 0);
        if (!"web".equals(platform)) {
            info.downloadUrl(downloadUrl).storeUrl(storeUrl);
        }
        return info;
    }

    /** Semver-ийн гурван тоог дарааллаар харьцуулна. */
    static int compare(String a, String b) {
        String[] x = a.split("\\.");
        String[] y = b.split("\\.");
        for (int i = 0; i < 3; i++) {
            int c = Long.compare(Long.parseLong(x[i]), Long.parseLong(y[i]));
            if (c != 0) {
                return c;
            }
        }
        return 0;
    }

    private static String semver(String value, String fallback, String name) {
        if (blank(value)) {
            return fallback;
        }
        String v = value.strip();
        if (!SEMVER.matcher(v).matches()) {
            log.warn("aura.app.{}='{}' semver биш — {} ашиглана", name, v, fallback);
            return fallback;
        }
        return v;
    }

    private static URI uri(String value) {
        if (blank(value)) {
            return null;
        }
        try {
            URI u = URI.create(value.strip());
            return u.isAbsolute() ? u : null;
        } catch (IllegalArgumentException e) {
            log.warn("Хувилбарын холбоос буруу: {}", value);
            return null;
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
