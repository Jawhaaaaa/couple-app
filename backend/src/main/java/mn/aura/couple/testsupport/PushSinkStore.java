package mn.aura.couple.testsupport;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Web Push-ийн тестийн хүлээн авагч (DD-AURA-027, AC-154) — санах ойд, зөвхөн `e2e`.
 * Хөтчийн push service-ийн оронд `WebPushSender` энд илгээж, E2E нь ирснийг уншина.
 */
@Component
@Profile("e2e")
public class PushSinkStore {

    public record Message(OffsetDateTime receivedAt, Map<String, String> headers, byte[] body) {
    }

    private static final class Sink {
        final List<Message> messages = new CopyOnWriteArrayList<>();
        volatile int nextStatus = 201;
    }

    private final Map<UUID, Sink> sinks = new ConcurrentHashMap<>();

    public UUID create() {
        UUID id = UUID.randomUUID();
        sinks.put(id, new Sink());
        return id;
    }

    public Optional<List<Message>> messages(UUID id) {
        return Optional.ofNullable(sinks.get(id)).map(s -> List.copyOf(s.messages));
    }

    public boolean respondWith(UUID id, int status) {
        Sink sink = sinks.get(id);
        if (sink == null) {
            return false;
        }
        sink.nextStatus = status;
        return true;
    }

    /** Хүлээн авч, тохируулсан хариуны төлөвийг буцаана (sink байхгүй бол хоосон). */
    public Optional<Integer> receive(UUID id, Message message) {
        Sink sink = sinks.get(id);
        if (sink == null) {
            return Optional.empty();
        }
        sink.messages.add(message);
        return Optional.of(sink.nextStatus);
    }
}
