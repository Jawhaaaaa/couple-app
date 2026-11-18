package mn.aura.couple.notification.app;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Push сувгийн тохиргоо (LLD §4.5, PAR-AURA-004/006). Хоосон бол тухайн суваг алгасагдана — апп доторх
 * мэдэгдэл үргэлж ажиллана (§8.3).
 *
 * @param vapidPublicKey    base64url (65 байт uncompressed P-256)
 * @param vapidPrivateKey   base64url (32 байт) — зөвхөн орчны хувьсагчаас
 * @param vapidSubject      `mailto:` эсвэл `https:` (RFC 8292)
 * @param endpointHosts     Web Push endpoint-ийн зөвшөөрөгдсөн хостын дагавар (SSRF-ээс хамгаална);
 *                          тестийн push sink-д `localhost` нэмнэ
 * @param expoAccessToken   Expo push (GAP-01) — хоосон бол алгасна
 */
@ConfigurationProperties(prefix = "aura.push")
public record PushProperties(
        @DefaultValue("") String vapidPublicKey,
        @DefaultValue("") String vapidPrivateKey,
        @DefaultValue("mailto:admin@aura.local") String vapidSubject,
        @DefaultValue({"fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"})
        List<String> endpointHosts,
        @DefaultValue("false") boolean allowHttpEndpoints,
        @DefaultValue("") String expoAccessToken,
        @DefaultValue("https://exp.host/--/api/v2/push/send") String expoUrl) {

    public boolean webPushEnabled() {
        return !vapidPublicKey.isBlank() && !vapidPrivateKey.isBlank();
    }

    public boolean expoEnabled() {
        return !expoAccessToken.isBlank();
    }
}
