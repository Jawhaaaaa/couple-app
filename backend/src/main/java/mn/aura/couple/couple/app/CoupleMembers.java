package mn.aura.couple.couple.app;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.couple.domain.SpaceRepository;
import mn.aura.couple.couple.domain.SpaceRepository.MemberRow;
import org.springframework.stereotype.Component;

/**
 * Хосын гишүүд — бусад домэйн (realtime, мэдэгдэл, чат…) хамтрагчийг энэ public service-ээр олно
 * (DD-AURA-001: багц хоорондын дуудлага зөвхөн `app` давхаргаар).
 */
@Component
public class CoupleMembers {

    private final SpaceRepository spaces;

    public CoupleMembers(SpaceRepository spaces) {
        this.spaces = spaces;
    }

    /** Space-ийн идэвхтэй гишүүд (SOLO-д нэг, COUPLE-д хоёр). */
    public List<UUID> members(UUID spaceId) {
        return spaces.members(spaceId).stream().map(MemberRow::userId).toList();
    }

    /** Space доторх хамтрагч (SOLO эсвэл ганцаараа үлдсэн бол хоосон). */
    public Optional<UUID> partnerIn(UUID spaceId, UUID userId) {
        return members(spaceId).stream().filter(u -> !u.equals(userId)).findFirst();
    }

    /** Хэрэглэгчийн одоогийн хосын хамтрагч (тасалж буй хос ч орно). */
    public Optional<UUID> partnerOf(UUID userId) {
        return spaces.coupleMembership(userId).flatMap(m -> partnerIn(m.spaceId(), userId));
    }

    /** Хэрэглэгчийн идэвхтэй COUPLE space. */
    public Optional<UUID> coupleSpaceOf(UUID userId) {
        return spaces.coupleMembership(userId).map(SpaceRepository.CoupleMembership::spaceId);
    }
}
