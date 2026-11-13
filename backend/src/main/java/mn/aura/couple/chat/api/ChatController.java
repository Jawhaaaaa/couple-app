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
import mn.aura.couple.chat.app.ChatSearchService;
import mn.aura.couple.chat.app.DisappearingSettingsService;
import mn.aura.couple.chat.app.PinService;
import mn.aura.couple.common.space.SpaceAccessGuard;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Chat` tag (T-43…T-45, FR-6). */
@RestController
public class ChatController implements ChatApi {

    private final SpaceAccessGuard guard;
    private final ChatMessageService messages;
    private final ChatSearchService search;
    private final PinService pins;
    private final DisappearingSettingsService disappearing;

    public ChatController(SpaceAccessGuard guard, ChatMessageService messages, ChatSearchService search, PinService pins,
                          DisappearingSettingsService disappearing) {
        this.guard = guard;
        this.messages = messages;
        this.search = search;
        this.pins = pins;
        this.disappearing = disappearing;
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
        return ResponseEntity.ok(search.search(guard.requireCouple(), q, cursor, limit));
    }

    @Override
    public ResponseEntity<MessagePage> jumpToDate(LocalDate date) {
        return ResponseEntity.ok(search.jump(guard.requireCouple(), date));
    }

    @Override
    public ResponseEntity<MessagePage> listChatMedia(String kind, String cursor, Integer limit) {
        return ResponseEntity.ok(search.media(guard.requireCouple(), kind, cursor, limit));
    }

    @Override
    public ResponseEntity<List<Message>> listPinnedMessages() {
        return ResponseEntity.ok(pins.pinned(guard.requireCouple()));
    }

    @Override
    public ResponseEntity<Void> pinMessage(UUID messageId) {
        pins.pin(guard.requireWritableCouple(), messageId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> unpinMessage(UUID messageId) {
        pins.unpin(guard.requireWritableCouple(), messageId);
        return ResponseEntity.noContent().build();
    }

    // --- Алга болдог мессеж (T-45) ---

    @Override
    public ResponseEntity<Void> reportScreenshot(UUID messageId) {
        disappearing.screenshot(guard.requireWritableCouple(), messageId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ChatSettings> updateChatSettings(ChatSettings body) {
        int seconds = disappearing.update(guard.requireWritableCouple(),
                body.getDisappearSeconds() == null ? null : body.getDisappearSeconds().getValue());
        return ResponseEntity.ok(new ChatSettings(ChatSettings.DisappearSecondsEnum.fromValue(seconds)));
    }
}
