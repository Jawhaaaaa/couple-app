package mn.aura.couple.anniversary.app;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.model.GiftIdea;
import mn.aura.couple.api.model.GiftIdeaInput;
import mn.aura.couple.api.model.GiftIdeaUpdate;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Нууц бэлгийн санаа (FR-8.7, AC-40, INV-04): хайлт бүр `owner_id = хүсэгч` нөхцөлтэй — хамтрагчид жагсаалт 0,
 * бусдын ID-аар засах/устгах 404 (байгаа эсэхийг ч ил гаргахгүй). Realtime үйл явдал, мэдэгдэл, ойн
 * хариу (`Occasion`), нүүрэнд огт орохгүй.
 */
@Service
public class GiftIdeaService {

    private final NamedParameterJdbcTemplate jdbc;
    private final TimeProvider time;

    public GiftIdeaService(NamedParameterJdbcTemplate jdbc, TimeProvider time) {
        this.jdbc = jdbc;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public List<GiftIdea> list(SpaceContext ctx, String occasionKey) {
        MapSqlParameterSource p = new MapSqlParameterSource("owner", ctx.userId()).addValue("space", ctx.spaceId());
        String sql = "SELECT id, occasion_key, text, done, created_at FROM gift_idea WHERE owner_id = :owner AND space_id = :space";
        if (occasionKey != null) {
            sql += " AND occasion_key = :key";
            p.addValue("key", occasionKey);
        }
        return new ArrayList<>(jdbc.query(sql + " ORDER BY done, created_at", p, (rs, i) -> dto(
                rs.getObject("id", UUID.class), rs.getString("occasion_key"), rs.getString("text"), rs.getBoolean("done"),
                rs.getTimestamp("created_at").toInstant())));
    }

    @Transactional
    public GiftIdea create(SpaceContext ctx, GiftIdeaInput in) {
        UUID id = Ids.newId();
        Instant now = time.now();
        String text = in.getText().strip();
        jdbc.update("""
                INSERT INTO gift_idea (id, space_id, owner_id, occasion_key, text, done, created_at)
                VALUES (:id, :space, :owner, :key, :text, false, :now)
                """, new MapSqlParameterSource("id", id).addValue("space", ctx.spaceId()).addValue("owner", ctx.userId())
                .addValue("key", in.getOccasionKey()).addValue("text", text).addValue("now", Timestamp.from(now)));
        return dto(id, in.getOccasionKey(), text, false, now);
    }

    @Transactional
    public GiftIdea update(SpaceContext ctx, UUID id, GiftIdeaUpdate in) {
        MapSqlParameterSource p = own(ctx, id);
        if (in.getText() != null) {
            jdbc.update("UPDATE gift_idea SET text = :text WHERE id = :id", p.addValue("text", in.getText().strip()));
        }
        if (in.getDone() != null) {
            jdbc.update("UPDATE gift_idea SET done = :done WHERE id = :id", p.addValue("done", in.getDone()));
        }
        return jdbc.queryForObject("SELECT id, occasion_key, text, done, created_at FROM gift_idea WHERE id = :id", p,
                (rs, i) -> dto(rs.getObject("id", UUID.class), rs.getString("occasion_key"), rs.getString("text"),
                        rs.getBoolean("done"), rs.getTimestamp("created_at").toInstant()));
    }

    @Transactional
    public void delete(SpaceContext ctx, UUID id) {
        jdbc.update("DELETE FROM gift_idea WHERE id = :id", own(ctx, id));
    }

    /** Өөрийн, идэвхтэй space-ийн санаа; бусдынх эсвэл өөр space-ийнх → 404. */
    private MapSqlParameterSource own(SpaceContext ctx, UUID id) {
        MapSqlParameterSource p = new MapSqlParameterSource("id", id).addValue("owner", ctx.userId())
                .addValue("space", ctx.spaceId());
        Integer n = jdbc.queryForObject("SELECT count(*) FROM gift_idea WHERE id = :id AND owner_id = :owner "
                + "AND space_id = :space", p, Integer.class);
        if (n == null || n == 0) {
            throw ApiException.notFound();
        }
        return p;
    }

    private static GiftIdea dto(UUID id, String key, String text, boolean done, Instant createdAt) {
        return new GiftIdea(id, key, text, done, OffsetDateTime.ofInstant(createdAt, ZoneOffset.UTC));
    }
}
