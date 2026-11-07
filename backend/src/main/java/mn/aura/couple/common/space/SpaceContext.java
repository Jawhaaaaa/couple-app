package mn.aura.couple.common.space;

import java.util.UUID;

/**
 * Хүсэлтийн идэвхтэй орон зай (DD-AURA-003/004). Repository-гийн хайлт бүр `space_id = :spaceId`
 * параметрийг энэнээс авна (Hibernate `@Filter` биш).
 */
public record SpaceContext(UUID userId, UUID spaceId, Kind kind) {

    public enum Kind { SOLO, COUPLE }

    public boolean isCouple() {
        return kind == Kind.COUPLE;
    }
}
