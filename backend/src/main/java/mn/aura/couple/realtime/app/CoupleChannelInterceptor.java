package mn.aura.couple.realtime.app;

import java.security.Principal;
import java.util.Optional;
import java.util.Set;
import mn.aura.couple.common.security.ApiAuthenticationException;
import mn.aura.couple.common.security.BearerTokenAuthenticator;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

/**
 * STOMP-ийн хаалга (DD-AURA-008, AC-31, INV-01):
 * <ul>
 *   <li>CONNECT — `Authorization: Bearer <access>` заавал; REST-тэй ижил `BearerTokenAuthenticator`
 *       (хугацаа, `sv`) — алдаатай бол ERROR frame</li>
 *   <li>SUBSCRIBE — зөвхөн `/user/queue/events` (хэрэглэгч тутмын queue). Хуваалцсан topic байхгүй тул
 *       өөр хосын суваг руу subscribe хийх зам үгүй</li>
 *   <li>SEND — зөвхөн `/app/typing`, `/app/presence`, `/app/chat.delivered`</li>
 * </ul>
 */
@Component
public class CoupleChannelInterceptor implements ChannelInterceptor {

    public static final String EVENTS_DESTINATION = "/user/queue/events";
    static final Set<String> SEND_DESTINATIONS = Set.of("/app/typing", "/app/presence", "/app/chat.delivered");

    private final ObjectProvider<BearerTokenAuthenticator> authenticator;

    public CoupleChannelInterceptor(ObjectProvider<BearerTokenAuthenticator> authenticator) {
        this.authenticator = authenticator;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }
        StompCommand command = accessor.getCommand();
        if (command == StompCommand.CONNECT) {
            accessor.setUser(authenticate(accessor.getFirstNativeHeader("Authorization")));
            return message;
        }
        Principal user = accessor.getUser();
        switch (command) {
            case SUBSCRIBE -> {
                requireUser(user);
                if (!EVENTS_DESTINATION.equals(accessor.getDestination())) {
                    throw new MessageDeliveryException("SUBSCRIBE зөвхөн " + EVENTS_DESTINATION + " руу");
                }
            }
            case SEND -> {
                requireUser(user);
                if (!SEND_DESTINATIONS.contains(accessor.getDestination())) {
                    throw new MessageDeliveryException("Зөвшөөрөгдөөгүй destination");
                }
            }
            default -> {
                // UNSUBSCRIBE, DISCONNECT, ACK г.м. — нэмэлт шалгалт шаардлагагүй
            }
        }
        return message;
    }

    private Authentication authenticate(String header) {
        if (header == null || !header.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw new MessageDeliveryException("Authorization: Bearer шаардлагатай");
        }
        BearerTokenAuthenticator auth = authenticator.getIfAvailable();
        if (auth == null) {
            throw new MessageDeliveryException("Токен шалгагч алга");
        }
        try {
            Optional<Authentication> result = auth.authenticate(header.substring(7).strip());
            return result.orElseThrow(() -> new MessageDeliveryException("Токен хүчингүй"));
        } catch (ApiAuthenticationException e) {
            throw new MessageDeliveryException(e.code().name());
        }
    }

    private static void requireUser(Principal user) {
        if (user == null) {
            throw new MessageDeliveryException("CONNECT-гүй");
        }
    }
}
