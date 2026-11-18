package mn.aura.couple.notification.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import mn.aura.couple.notification.domain.PushSubscriptionRepository.SubscriptionRow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Native APK-ийн push — Expo Push → FCM (GAP-01, сонголтот). `aura.push.expo-access-token` хоосон бол
 * алгасна. `DeviceNotRegistered` → subscription хүчингүй.
 */
@Component
public class ExpoPushSender implements PushChannel {

    private static final Logger log = LoggerFactory.getLogger(ExpoPushSender.class);
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    private final PushProperties properties;
    private final ObjectMapper mapper;

    public ExpoPushSender(PushProperties properties, ObjectMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;
    }

    @Override
    public String kind() {
        return "EXPO";
    }

    @Override
    public Result send(SubscriptionRow sub, PushMessage message) {
        if (!properties.expoEnabled()) {
            return Result.SKIPPED;
        }
        try {
            byte[] body = mapper.writeValueAsBytes(List.of(Map.of(
                    "to", sub.expoToken(),
                    "title", message.title(),
                    "body", message.body(),
                    "data", Map.of("deepLink", message.deepLink(), "type", message.type(),
                            "notificationId", message.notificationId().toString()))));
            HttpRequest request = HttpRequest.newBuilder(URI.create(properties.expoUrl()))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + properties.expoAccessToken())
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                    .build();
            HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 300) {
                log.warn("Expo push амжилтгүй: status={} subscription={}", response.statusCode(), sub.id());
                return Result.FAILED;
            }
            JsonNode ticket = mapper.readTree(response.body()).path("data").path(0);
            if ("error".equals(ticket.path("status").asText())
                    && "DeviceNotRegistered".equals(ticket.path("details").path("error").asText())) {
                return Result.GONE;
            }
            return Result.SENT;
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        } catch (IOException e) {
            log.warn("Expo push сүлжээний алдаа: subscription={}", sub.id(), e);
            return Result.FAILED;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Result.FAILED;
        }
    }
}
