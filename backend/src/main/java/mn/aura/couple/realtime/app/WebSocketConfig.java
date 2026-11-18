package mn.aura.couple.realtime.app;

import java.util.List;
import mn.aura.couple.common.config.AuraProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * STOMP over WebSocket `/ws` (SockJS-гүй, DD-AURA-008). Нэг процесс тул simple broker; хүлээн авагч
 * бүрд `/user/queue/events`. Heartbeat 10 с/10 с (asyncapi). Origin нь CORS-той ижил жагсаалт.
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    public static final String ENDPOINT = "/ws";

    private final CoupleChannelInterceptor interceptor;
    private final List<String> allowedOrigins;

    public WebSocketConfig(CoupleChannelInterceptor interceptor, AuraProperties properties) {
        this.interceptor = interceptor;
        this.allowedOrigins = properties.cors().allowedOrigins().stream()
                .map(String::trim).filter(o -> !o.isEmpty() && !"*".equals(o)).toList();
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        var endpoint = registry.addEndpoint(ENDPOINT);
        if (!allowedOrigins.isEmpty()) {
            endpoint.setAllowedOrigins(allowedOrigins.toArray(String[]::new));
        }
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        ThreadPoolTaskScheduler heartbeat = new ThreadPoolTaskScheduler();
        heartbeat.setPoolSize(1);
        heartbeat.setThreadNamePrefix("ws-heartbeat-");
        heartbeat.initialize();
        registry.enableSimpleBroker("/queue").setHeartbeatValue(new long[] {10_000, 10_000}).setTaskScheduler(heartbeat);
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(interceptor);
    }
}
