package mn.aura.couple.notification.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.notification.domain.PushSubscriptionRepository.SubscriptionRow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Web Push (VAPID, RFC 8030/8291/8292) — PWA-ийн гол push зам (FR-19.3). VAPID түлхүүр хоосон бол
 * алгасна. Push service 404/410 буцаавал subscription хүчингүй (`GONE`, AC-154).
 * <p>Endpoint-ийг хэрэглэгч өгдөг тул зөвхөн зөвшөөрөгдсөн push service-ийн хост руу, HTTPS-ээр
 * илгээнэ (SSRF-ээс хамгаална).
 */
@Component
public class WebPushSender implements PushChannel {

    private static final Logger log = LoggerFactory.getLogger(WebPushSender.class);
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    private final PushProperties properties;
    private final ObjectMapper mapper;
    private final TimeProvider time;

    public WebPushSender(PushProperties properties, ObjectMapper mapper, TimeProvider time) {
        this.properties = properties;
        this.mapper = mapper;
        this.time = time;
    }

    @Override
    public String kind() {
        return "WEB";
    }

    /** Subscription бүртгэхэд хэрэглэнэ — зөвшөөрөгдөөгүй endpoint-ийг 400-аар татгалзана. */
    public boolean endpointAllowed(String endpoint) {
        URI uri;
        try {
            uri = URI.create(endpoint);
        } catch (IllegalArgumentException e) {
            return false;
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"https".equals(scheme) && !(properties.allowHttpEndpoints() && "http".equals(scheme))) {
            return false;
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        return properties.endpointHosts().stream()
                .map(h -> h.strip().toLowerCase(Locale.ROOT))
                .anyMatch(h -> host.equals(h) || host.endsWith("." + h));
    }

    @Override
    public Result send(SubscriptionRow sub, PushMessage message) {
        if (!properties.webPushEnabled()) {
            return Result.SKIPPED;
        }
        if (!endpointAllowed(sub.endpoint())) {
            log.warn("Web Push endpoint зөвшөөрөгдөөгүй хост — алгасав: subscription={}", sub.id());
            return Result.SKIPPED;
        }
        try {
            URI endpoint = URI.create(sub.endpoint());
            byte[] body = WebPushCrypto.encrypt(payload(message), WebPushCrypto.unb64(sub.p256dh()),
                    WebPushCrypto.unb64(sub.auth()));
            HttpRequest request = HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/octet-stream")
                    .header("Content-Encoding", "aes128gcm")
                    .header("TTL", "86400")
                    .header("Urgency", "normal")
                    .header("Authorization", WebPushCrypto.vapidAuthorization(endpoint, subject(),
                            properties.vapidPublicKey(), properties.vapidPrivateKey(), time.now()))
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                    .build();
            int status = HTTP.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
            if (status == 404 || status == 410) {
                return Result.GONE;
            }
            if (status >= 200 && status < 300) {
                return Result.SENT;
            }
            log.warn("Web Push амжилтгүй: status={} subscription={}", status, sub.id());
            return Result.FAILED;
        } catch (IOException e) {
            log.warn("Web Push сүлжээний алдаа: subscription={}", sub.id(), e);
            return Result.FAILED;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Result.FAILED;
        }
    }

    /** VAPID `sub` (RFC 8292) — орчны хувьсагч хоосон бол анхдагч. */
    private String subject() {
        String s = properties.vapidSubject();
        return s == null || s.isBlank() ? "mailto:admin@aura.local" : s.strip();
    }

    private byte[] payload(PushMessage m) {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("title", m.title());
        json.put("body", m.body());
        json.put("deepLink", m.deepLink());
        json.put("type", m.type());
        json.put("notificationId", m.notificationId().toString());
        try {
            return mapper.writeValueAsBytes(json);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
