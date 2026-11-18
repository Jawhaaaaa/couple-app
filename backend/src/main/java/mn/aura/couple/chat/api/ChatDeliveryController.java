package mn.aura.couple.chat.api;

import java.security.Principal;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.chat.app.ChatMessageService;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

/** Client → сервер STOMP `/app/chat.delivered {upToMessageId}` (asyncapi `chatDelivered`, AC-176). */
@Controller
public class ChatDeliveryController {

    private final ChatMessageService messages;

    public ChatDeliveryController(ChatMessageService messages) {
        this.messages = messages;
    }

    @MessageMapping("/chat.delivered")
    public void delivered(@Payload Map<String, Object> ack, Principal principal) {
        Object upTo = ack.get("upToMessageId");
        if (upTo == null) {
            return;
        }
        UUID messageId;
        try {
            messageId = UUID.fromString(upTo.toString());
        } catch (IllegalArgumentException e) {
            return; // буруу хэлбэр — гэрээний бус ack-ыг үл тооно
        }
        messages.markDelivered(UUID.fromString(principal.getName()), messageId);
    }
}
