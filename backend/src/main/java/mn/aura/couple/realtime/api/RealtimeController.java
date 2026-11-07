package mn.aura.couple.realtime.api;

import java.security.Principal;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.realtime.app.PresenceService;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

/**
 * Client → сервер STOMP (asyncapi `typing`, `presence`). `chat.delivered` — `ChatMessageService` (T-43).
 */
@Controller
public class RealtimeController {

    private final PresenceService presence;

    public RealtimeController(PresenceService presence) {
        this.presence = presence;
    }

    /** `TypingSignal {typing}`. */
    @MessageMapping("/typing")
    public void typing(@Payload Map<String, Object> signal, Principal principal) {
        presence.typing(UUID.fromString(principal.getName()), Boolean.TRUE.equals(signal.get("typing")));
    }

    /** `PresencePing {state: FOREGROUND|BACKGROUND}`. */
    @MessageMapping("/presence")
    public void presence(@Payload Map<String, Object> ping, Principal principal,
                         @Header("simpSessionId") String sessionId) {
        PresenceService.State state = "BACKGROUND".equals(ping.get("state"))
                ? PresenceService.State.BACKGROUND : PresenceService.State.FOREGROUND;
        presence.ping(UUID.fromString(principal.getName()), sessionId, state);
    }
}
