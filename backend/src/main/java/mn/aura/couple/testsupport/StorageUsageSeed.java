package mn.aura.couple.testsupport;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.SeedResult;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.common.space.SpaceContext;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * `STORAGE_USAGE` (AC-200 E2E): хэрэглэгчийн идэвхтэй орон зайн (хостой бол хосын) хадгалах сангийн
 * хэрэглээг `usedBytes` болгоно — 8 GB / 10 GB-ийн төлөвийг бодитоор upload хийлгүйгээр бэлтгэнэ.
 * `params`: `userId` (uuid), `usedBytes` (≥ 0). Зөвхөн `e2e` profile.
 */
@Component
@Profile("e2e")
public class StorageUsageSeed implements TestSeedScenario {

    private final JdbcTemplate jdbc;
    private final SpaceAccessGuard spaces;

    public StorageUsageSeed(JdbcTemplate jdbc, SpaceAccessGuard spaces) {
        this.jdbc = jdbc;
        this.spaces = spaces;
    }

    @Override
    public String name() {
        return "STORAGE_USAGE";
    }

    @Override
    public SeedResult seed(Map<String, Object> params) {
        UUID userId;
        long usedBytes;
        try {
            userId = UUID.fromString(String.valueOf(params.get("userId")));
            usedBytes = ((Number) params.get("usedBytes")).longValue();
        } catch (IllegalArgumentException | ClassCastException | NullPointerException e) {
            throw ApiException.validation("params", ErrorCode.VALIDATION_FAILED);
        }
        if (usedBytes < 0) {
            throw ApiException.validation("usedBytes", ErrorCode.VALIDATION_FAILED);
        }
        SpaceContext space = spaces.resolve(userId).orElseThrow(ApiException::notFound);
        jdbc.update("UPDATE space SET storage_bytes = ? WHERE id = ?", usedBytes, space.spaceId());
        return new SeedResult(new ArrayList<>(), List.of(space.spaceId()), Map.of("spaceId", space.spaceId().toString()));
    }
}
