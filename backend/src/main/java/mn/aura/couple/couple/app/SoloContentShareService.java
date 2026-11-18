package mn.aura.couple.couple.app;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.SoloShareResult;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.domain.SpaceRepository;
import mn.aura.couple.couple.domain.SpaceRepository.MemberRow;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ганцаараа үеийн зүйлсийг хуваалцах нэг шийдвэр (FR-2.5, AC-67, DD-AURA-003).
 * «Тийм» → SOLO space-ийн мөрүүдийн `space_id`-г COUPLE болгоно (нэг транзакц); «Үгүй» → SOLO-д үлдэж
 * зөвхөн өөрт «Хувийн» шүүлтээр харагдана. Хоёр дахь удаа шийдэх → 409 `ALREADY_DECIDED`.
 * <p>Профайлын зураг (avatar) SOLO-д үлдэнэ — хос устахад (INV-16) устахгүй.
 * Хувийн зүйл (check-in, нууц бэлгийн санаа) шилжихгүй.
 */
@Service
public class SoloContentShareService {

    /** Шилжүүлэх дараалал: хүүхэд хүснэгт эхэлж — хүснэгт үүсээгүй бол алгасна. */
    private static final List<Move> MOVES = List.of(
            new Move("memory_comment", "UPDATE memory_comment SET space_id = :couple WHERE space_id = :solo"),
            new Move("reaction", "UPDATE reaction SET space_id = :couple WHERE space_id = :solo"),
            new Move("memory_group", "UPDATE memory_group SET space_id = :couple WHERE space_id = :solo"),
            new Move("memory", "UPDATE memory SET space_id = :couple WHERE space_id = :solo AND author_id = :user"),
            new Move("date_idea", "UPDATE date_idea SET space_id = :couple WHERE space_id = :solo AND author_id = :user"),
            new Move("list_item", "UPDATE list_item SET space_id = :couple WHERE space_id = :solo AND created_by = :user"),
            new Move("goal", "UPDATE goal SET space_id = :couple WHERE space_id = :solo AND created_by = :user"),
            new Move("anniversary", "UPDATE anniversary SET space_id = :couple WHERE space_id = :solo AND author_id = :user"),
            new Move("letter", "UPDATE letter SET space_id = :couple WHERE space_id = :solo AND author_id = :user AND status = 'DRAFT'"));

    private record Move(String table, String sql) {
    }

    private final SpaceRepository spaces;
    private final SoloContentCounter counter;
    private final NamedParameterJdbcTemplate jdbc;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public SoloContentShareService(SpaceRepository spaces, SoloContentCounter counter, NamedParameterJdbcTemplate jdbc,
                                   ApplicationEventPublisher events, TimeProvider time) {
        this.spaces = spaces;
        this.counter = counter;
        this.jdbc = jdbc;
        this.events = events;
        this.time = time;
    }

    @Transactional
    public SoloShareResult decide(SpaceContext ctx, boolean share) {
        spaces.lock(ctx.spaceId());
        List<MemberRow> members = spaces.members(ctx.spaceId());
        MemberRow me = members.stream().filter(m -> m.userId().equals(ctx.userId())).findFirst()
                .orElseThrow(ApiException::notFound);
        if (me.soloShareDecision() != null && !"PENDING".equals(me.soloShareDecision())) {
            throw new ApiException(ErrorCode.ALREADY_DECIDED, HttpStatus.CONFLICT);
        }
        int moved = 0;
        if (share) {
            moved = counter.count(ctx.userId());
            UUID solo = spaces.soloSpaceOf(ctx.userId()).orElse(null);
            if (solo != null) {
                move(solo, ctx.spaceId(), ctx.userId());
            }
        }
        jdbc.update("UPDATE space_member SET solo_share_decision = :d WHERE space_id = :s AND user_id = :u",
                new MapSqlParameterSource("d", share ? "SHARED" : "KEPT").addValue("s", ctx.spaceId())
                        .addValue("u", ctx.userId()));
        if (moved > 0) {
            events.publishEvent(RealtimeEvent.of("couple.updated", ctx.userId(),
                    members.stream().map(MemberRow::userId).toList(), Map.of("coupleId", ctx.spaceId())));
        }
        return new SoloShareResult(moved);
    }

    private void move(UUID solo, UUID couple, UUID user) {
        MapSqlParameterSource p = new MapSqlParameterSource("solo", solo).addValue("couple", couple).addValue("user", user)
                .addValue("now", Timestamp.from(time.now()));
        // Медиа: avatar-аас бусад нь хуваалцсан агуулгынх; хадгалах сангийн хэрэглээг дагуулж шилжүүлнэ (NFR-11)
        Long bytes = jdbc.queryForObject("""
                SELECT coalesce(sum(size_bytes), 0) FROM media
                 WHERE space_id = :solo AND id IS DISTINCT FROM (SELECT avatar_media_id FROM users WHERE id = :user)
                """, p, Long.class);
        jdbc.update("""
                UPDATE media SET space_id = :couple, updated_at = :now
                 WHERE space_id = :solo AND id IS DISTINCT FROM (SELECT avatar_media_id FROM users WHERE id = :user)
                """, p);
        long moved = bytes == null ? 0 : bytes;
        if (moved > 0) {
            p.addValue("bytes", moved);
            jdbc.update("UPDATE space SET storage_bytes = greatest(storage_bytes - :bytes, 0) WHERE id = :solo", p);
            jdbc.update("UPDATE space SET storage_bytes = storage_bytes + :bytes WHERE id = :couple", p);
        }
        for (Move m : MOVES) {
            Boolean exists = jdbc.queryForObject("SELECT to_regclass(:t) IS NOT NULL",
                    new MapSqlParameterSource("t", "public." + m.table()), Boolean.class);
            if (Boolean.TRUE.equals(exists)) {
                jdbc.update(m.sql(), p);
            }
        }
    }
}
