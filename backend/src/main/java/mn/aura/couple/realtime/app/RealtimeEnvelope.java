package mn.aura.couple.realtime.app;

import java.time.OffsetDateTime;
import java.util.UUID;

/** `contracts/asyncapi.yaml`-ийн `RealtimeEnvelope {id, type, occurredAt, actorId, payload}` (DD-AURA-009). */
public record RealtimeEnvelope(UUID id, String type, OffsetDateTime occurredAt, UUID actorId, Object payload) {
}
