package mn.aura.couple.couple.app;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.Couple;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.domain.SpaceRepository;
import mn.aura.couple.couple.domain.SpaceRepository.MemberRow;
import mn.aura.couple.couple.domain.SpaceRepository.SpaceRow;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * «Бидний эхэлсэн өдөр» (FR-2.3, AC-65). Хүн бүр өөрийн санал (`space_member.proposed_start_date`)-ыг
 * тавина; хоёр санал ижил болмогц `space.start_date` баталгаажна. Хэн нэг нь дараа нь өөрчилбөл
 * баталгаа цуцлагдаж, хоёулаа дахин батлах хүртэл тоолуур «Эхэлсэн өдрөө батлаарай» төлөвтэй.
 * Ирээдүйн огноо (хосын бүсийн өнөөдрөөс хойш) → 400.
 */
@Service
public class StartDateService {

    private final SpaceRepository spaces;
    private final CoupleAssembler assembler;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;
    private final JdbcTemplate jdbc;

    public StartDateService(SpaceRepository spaces, CoupleAssembler assembler, ApplicationEventPublisher events,
                            TimeProvider time, JdbcTemplate jdbc) {
        this.spaces = spaces;
        this.assembler = assembler;
        this.events = events;
        this.time = time;
        this.jdbc = jdbc;
    }

    @Transactional
    public Couple propose(SpaceContext ctx, LocalDate date) {
        spaces.lock(ctx.spaceId());
        SpaceRow space = spaces.find(ctx.spaceId()).orElseThrow(ApiException::notFound);
        if (date == null || date.isAfter(time.today(ZoneId.of(space.timezone())))) {
            throw ApiException.validation("date", ErrorCode.VALIDATION_FAILED);
        }
        jdbc.update("UPDATE space_member SET proposed_start_date = ? WHERE space_id = ? AND user_id = ?",
                date, ctx.spaceId(), ctx.userId());
        List<MemberRow> members = spaces.members(ctx.spaceId());
        Optional<LocalDate> agreed = agreedDate(members);
        jdbc.update("UPDATE space SET start_date = ?, start_date_confirmed = ?, version = version + 1, updated_at = ? WHERE id = ?",
                agreed.orElse(null), agreed.isPresent(), java.sql.Timestamp.from(time.now()), ctx.spaceId());
        events.publishEvent(RealtimeEvent.of("couple.updated", ctx.userId(),
                members.stream().map(MemberRow::userId).toList(), Map.of("coupleId", ctx.spaceId())));
        return assembler.forUser(ctx.spaceId(), ctx.userId());
    }

    /** Хоёр гишүүн ижил огноо санал болгосон бол түүнийг. */
    static Optional<LocalDate> agreedDate(List<MemberRow> members) {
        if (members.size() != 2) {
            return Optional.empty();
        }
        LocalDate a = members.get(0).proposedStartDate();
        LocalDate b = members.get(1).proposedStartDate();
        return a != null && a.equals(b) ? Optional.of(a) : Optional.empty();
    }

    /** Хосын тоолуурын эхлэл (баталгаажаагүй бол хоосон) — бусад домэйн хэрэглэнэ. */
    @Transactional(readOnly = true)
    public Optional<LocalDate> confirmedStartDate(UUID spaceId) {
        return spaces.find(spaceId).filter(SpaceRow::startDateConfirmed).map(SpaceRow::startDate);
    }
}
