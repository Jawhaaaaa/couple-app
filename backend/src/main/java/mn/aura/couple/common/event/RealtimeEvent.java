package mn.aura.couple.common.event;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

/**
 * Хэрэглэгч тутмын realtime үйл явдал (DD-AURA-008/009). Домэйн service транзакц дотор
 * `ApplicationEventPublisher`-ээр нийтэлнэ; `RealtimePublisher` commit-ийн дараа хүлээн авагч бүрд
 * `/user/queue/events`-ээр илгээнэ. `payloadFor` нь хүлээн авагч тутам проекцлоно (DD-AURA-005, INV-04).
 *
 * @param type     `contracts/asyncapi.yaml`-ийн `EventType` (жишээ `couple.linked`)
 * @param actorId  үйлдэл хийсэн хэрэглэгч (системийн ажилд null)
 */
public record RealtimeEvent(String type, UUID actorId, Set<UUID> recipients, Function<UUID, Object> payloadFor) {

    public RealtimeEvent {
        recipients = Set.copyOf(new LinkedHashSet<>(recipients));
    }

    /** Бүх хүлээн авагчид ижил payload. */
    public static RealtimeEvent of(String type, UUID actorId, Collection<UUID> recipients, Object payload) {
        return new RealtimeEvent(type, actorId, new LinkedHashSet<>(recipients), r -> payload);
    }

    /** Хүлээн авагч тутам ялгаатай payload (нууц талбартай биет). */
    public static RealtimeEvent projected(String type, UUID actorId, Collection<UUID> recipients,
                                          Function<UUID, Object> payloadFor) {
        return new RealtimeEvent(type, actorId, new LinkedHashSet<>(recipients), payloadFor);
    }
}
