package mn.aura.couple.memory.app;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.common.space.SpaceContext;

/**
 * Дуудагчид харагдах дурсамжийн орон зай (DD-AURA-003, R-4): идэвхтэй space (хос эсвэл SOLO) +
 * хос болсон хэрэглэгчийн «Хувийн» SOLO space (хуваалцаагүй үлдсэн зүйлс, зөвхөн өөрт).
 */
public record MemoryScope(UUID userId, UUID activeSpaceId, Optional<UUID> privateSpaceId, Optional<UUID> partnerId) {

    public static MemoryScope of(SpaceContext ctx, Optional<UUID> soloSpace, Optional<UUID> partnerId) {
        Optional<UUID> priv = soloSpace.filter(s -> !s.equals(ctx.spaceId()));
        return new MemoryScope(ctx.userId(), ctx.spaceId(), priv, partnerId);
    }

    /** `scope=shared|private|all` → хайх space-ууд. */
    public List<UUID> spaces(String scope) {
        List<UUID> out = new ArrayList<>();
        if (!"private".equals(scope)) {
            out.add(activeSpaceId);
        }
        if (!"shared".equals(scope)) {
            privateSpaceId.ifPresent(out::add);
        }
        if (out.isEmpty()) {
            // SOLO хэрэглэгчийн «Хувийн» нь идэвхтэй space өөрөө
            out.add(activeSpaceId);
        }
        return out;
    }

    /** Объект дуудагчид харагдах эсэх (хувийн space-ийнх бол зөвхөн зохиогчид). */
    public boolean canSee(UUID spaceId, UUID authorId) {
        return activeSpaceId.equals(spaceId) || (privateSpaceId.isPresent() && privateSpaceId.get().equals(spaceId)
                && userId.equals(authorId));
    }

    public boolean isPrivate(UUID spaceId) {
        return privateSpaceId.isPresent() && privateSpaceId.get().equals(spaceId);
    }
}
