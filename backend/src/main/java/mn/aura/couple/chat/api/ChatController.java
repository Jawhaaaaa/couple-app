package mn.aura.couple.chat.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.ChatApi;
import mn.aura.couple.api.model.ChatSettings;
import mn.aura.couple.api.model.Message;
import mn.aura.couple.api.model.MessageCreate;
import mn.aura.couple.api.model.MessageEdit;
import mn.aura.couple.api.model.MessagePage;
import mn.aura.couple.api.model.MessageSearchPage;
import mn.aura.couple.api.model.ReactionInput;
import mn.aura.couple.api.model.ReactionSummary;
import mn.aura.couple.api.model.ReadReceipt;
import mn.aura.couple.chat.app.ChatMessageService;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.space.SpaceAccessGuard;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Chat` tag (T-43…T-45, FR-6). */
@RestController
public class ChatController implements ChatApi {

    private final SpaceAccessGuard guard;
    private final ChatMessageService messages;

    public ChatController(SpaceAccessGuard guard, ChatMessageService messages) {
        this.guard = guard;
        this.messages = messages;
    }

    @Override
    public ResponseEntity<MessagePage> listMessages(UUID before, UUID after, UUID around, Integer limit) {
        return ResponseEntity.ok(messages.list(guard.requireCouple(), before, after, around, limit));
    }

    @Override
    public ResponseEntity<Message> sendMessage(MessageCreate body) {
        ChatMessageService.Sent sent = messages.send(guard.requireWritableCouple(), body);
        return ResponseEntity.status(sent.created() ? HttpStatus.CREATED : HttpStatus.OK).body(sent.message());
    }

    @Override
    public ResponseEntity<Message> editMessage(UUID messageId, MessageEdit body) {
        return ResponseEntity.ok(messages.edit(guard.requireWritableCouple(), messageId, body.getText()));
    }

    @Override
    public ResponseEntity<Void> deleteMessage(UUID messageId) {
        messages.delete(guard.requireWritableCouple(), messageId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> markMessagesRead(ReadReceipt body) {
        messages.markRead(guard.requireWritableCouple(), body.getUpToMessageId());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<List<ReactionSummary>> setMessageReaction(UUID messageId, ReactionInput body) {
        return ResponseEntity.ok(messages.react(guard.requireWritableCouple(), messageId, body.getEmoji().getValue()));
    }

    @Override
    public ResponseEntity<List<ReactionSummary>> removeMessageReaction(UUID messageId) {
        return ResponseEntity.ok(messages.unreact(guard.requireWritableCouple(), messageId));
    }

    // --- Хайлт, pin (T-44) ---

    @Override
    public ResponseEntity<MessageSearchPage> searchMessages(String q, String cursor, Integer limit) {
        guard.requireCouple();
        throw ApiException.notFound(); // T-44
    }

    @Override
    public ResponseEntity<MessagePage> jumpToDate(LocalDate date) {
        guard.requireCouple();
        throw ApiException.notFound(); // T-44
    }

    @Override
    public ResponseEntity<MessagePage> listChatMedia(String kind, String cursor, Integer limit) {
        guard.requireCouple();
        throw ApiException.notFound(); // T-44
    }

    @Override
    public ResponseEntity<List<Message>> listPinnedMessages() {
        guard.requireCouple();
        throw ApiException.notFound(); // T-44
    }

    @Override
    public ResponseEntity<Void> pinMessage(UUID messageId) {
        guard.requireWritableCouple();
        throw ApiException.notFound(); // T-44
    }

    @Override
    public ResponseEntity<Void> unpinMessage(UUID messageId) {
        guard.requireWritableCouple();
        throw ApiException.notFound(); // T-44
    }

    // --- Алга болдог мессеж (T-45) ---

    @Override
    public ResponseEntity<Void> reportScreenshot(UUID messageId) {
        guard.requireWritableCouple();
        throw ApiException.notFound(); // T-45
    }

    @Override
    public ResponseEntity<ChatSettings> updateChatSettings(ChatSettings body) {
        guard.requireWritableCouple();
        throw ApiException.notFound(); // T-45
    }
}
