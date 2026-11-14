package mn.aura.couple.system.api;

import mn.aura.couple.api.SystemApi;
import mn.aura.couple.api.model.VersionInfo;
import mn.aura.couple.system.app.AppVersionService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `System` tag: `GET /version` (нэвтрэлтгүй, AC-141). */
@RestController
public class VersionController implements SystemApi {

    private final AppVersionService versions;

    public VersionController(AppVersionService versions) {
        this.versions = versions;
    }

    @Override
    public ResponseEntity<VersionInfo> getVersion(String platform, String current) {
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(versions.info(platform, current));
    }
}
