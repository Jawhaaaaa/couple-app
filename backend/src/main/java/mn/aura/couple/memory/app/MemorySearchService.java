package mn.aura.couple.memory.app;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.MemoryPage;
import mn.aura.couple.api.model.MemoryPlace;
import mn.aura.couple.api.model.MemorySummary;
import mn.aura.couple.api.model.MonthCount;
import mn.aura.couple.api.model.OnThisDayGroup;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Timeline ба хайлт (FR-5.3, FR-5.8, DD-AURA-015): огнооны дарааллаар (шинээс), cursor; текст (гарчиг +
 * тайлбар + шошго, сэтгэгдэл — pg_trgm ILIKE), огноо, шошго, бүлэг, хэн нэмсэн, дуртай, байршил,
 * `scope=shared|private|all` (R-4). Сарын тоо (sticky толгой, AC-80), шошго, газрууд (AC-116),
 * «Жилийн өмнөх өнөөдөр» (AC-73).
 */
@Service
public class MemorySearchService {

    private final NamedParameterJdbcTemplate jdbc;
    private final MemoryService memories;
    private final MemoryAssembler assembler;
    private final TimeProvider time;

    public MemorySearchService(NamedParameterJdbcTemplate jdbc, MemoryService memories, MemoryAssembler assembler,
                               TimeProvider time) {
        this.jdbc = jdbc;
        this.memories = memories;
        this.assembler = assembler;
        this.time = time;
    }

    /** Хайлтын шүүлт (бүгд сонголтот). */
    public record Filter(String q, LocalDate from, LocalDate to, String tag, UUID groupId, String author,
                         Boolean favorite, Boolean hasLocation, String scope, String place) {
    }

    @Transactional(readOnly = true)
    public MemoryPage search(SpaceContext ctx, Filter f, String cursor, Integer limit) {
        MemoryScope scope = memories.scope(ctx);
        int size = limit == null ? 30 : Math.max(1, Math.min(100, limit));
        MapSqlParameterSource p = new MapSqlParameterSource("spaces", scope.spaces(normScope(f.scope())))
                .addValue("me", ctx.userId()).addValue("limit", size + 1);
        StringBuilder where = new StringBuilder(" WHERE m.space_id IN (:spaces) AND m.deleted_at IS NULL");
        // Хувийн space-ийн зүйл зөвхөн зохиогчид (SOLO нь зөвхөн өөрийнх тул нэмэлт нөхцөл шаардлагагүй)
        if (f.q() != null && !f.q().isBlank()) {
            p.addValue("q", "%" + likeEscape(f.q().strip().toLowerCase(Locale.ROOT)) + "%");
            where.append(" AND (m.search_text LIKE :q OR EXISTS (SELECT 1 FROM memory_comment c WHERE c.memory_id = m.id "
                    + "AND lower(c.text) LIKE :q))");
        }
        if (f.from() != null) {
            where.append(" AND m.occurred_on >= :from");
            p.addValue("from", f.from());
        }
        if (f.to() != null) {
            where.append(" AND m.occurred_on <= :to");
            p.addValue("to", f.to());
        }
        if (f.tag() != null && !f.tag().isBlank()) {
            where.append(" AND EXISTS (SELECT 1 FROM memory_tag t WHERE t.memory_id = m.id AND t.tag = :tag)");
            p.addValue("tag", f.tag().strip().toLowerCase(Locale.ROOT).replaceAll("^#", ""));
        }
        if (f.groupId() != null) {
            where.append(" AND EXISTS (SELECT 1 FROM memory_group_item gi WHERE gi.memory_id = m.id AND gi.group_id = :group)");
            p.addValue("group", f.groupId());
        }
        if ("me".equals(f.author())) {
            where.append(" AND m.author_id = :me");
        } else if ("partner".equals(f.author())) {
            where.append(" AND m.author_id <> :me");
        }
        if (Boolean.TRUE.equals(f.favorite())) {
            where.append(" AND EXISTS (SELECT 1 FROM memory_favorite fv WHERE fv.memory_id = m.id AND fv.user_id = :me)");
        }
        if (Boolean.TRUE.equals(f.hasLocation())) {
            where.append(" AND m.lat IS NOT NULL");
        } else if (Boolean.FALSE.equals(f.hasLocation())) {
            where.append(" AND m.lat IS NULL");
        }
        if (f.place() != null && !f.place().isBlank()) {
            where.append(" AND lower(m.location_name) LIKE :place");
            p.addValue("place", "%" + likeEscape(f.place().strip().toLowerCase(Locale.ROOT)) + "%");
        }
        if (cursor != null && !cursor.isBlank()) {
            String[] c = MemoryService.decode(cursor);
            if (c.length != 3) {
                throw ApiException.validation("cursor", ErrorCode.VALIDATION_FAILED);
            }
            where.append(" AND (m.occurred_on, m.created_at, m.id) < (:cOn, :cAt, :cId)");
            p.addValue("cOn", LocalDate.parse(c[0])).addValue("cAt", Timestamp.from(Instant.parse(c[1])))
                    .addValue("cId", UUID.fromString(c[2]));
        }
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT m.id, m.occurred_on, m.created_at FROM memory m" + where
                + " ORDER BY m.occurred_on DESC, m.created_at DESC, m.id DESC LIMIT :limit", p);
        boolean more = rows.size() > size;
        List<Map<String, Object>> page = more ? rows.subList(0, size) : rows;
        List<MemorySummary> items = assembler.summaries(page.stream().map(r -> (UUID) r.get("id")).toList(), ctx.userId());
        String next = null;
        if (more) {
            Map<String, Object> last = page.get(page.size() - 1);
            next = MemoryService.encode(((Date) last.get("occurred_on")).toLocalDate() + "|"
                    + ((Timestamp) last.get("created_at")).toInstant() + "|" + last.get("id"));
        }
        return new MemoryPage(new ArrayList<>(items), next);
    }

    /** Сар бүрийн тоо (timeline-ийн толгой «2026 оны 11 сар · 2 дурсамж», AC-80). */
    @Transactional(readOnly = true)
    public List<MonthCount> months(SpaceContext ctx, String scope) {
        return jdbc.query("""
                SELECT extract(year FROM occurred_on)::int AS y, extract(month FROM occurred_on)::int AS mo, count(*) AS n
                  FROM memory WHERE space_id IN (:spaces) AND deleted_at IS NULL
                 GROUP BY 1, 2 ORDER BY 1 DESC, 2 DESC
                """, new MapSqlParameterSource("spaces", memories.scope(ctx).spaces(normScope(scope))),
                (rs, i) -> new MonthCount(rs.getInt("y"), rs.getInt("mo"), rs.getInt("n")));
    }

    @Transactional(readOnly = true)
    public List<String> tags(SpaceContext ctx) {
        return jdbc.queryForList("""
                SELECT t.tag FROM memory_tag t JOIN memory m ON m.id = t.memory_id
                 WHERE m.space_id IN (:spaces) AND m.deleted_at IS NULL GROUP BY t.tag ORDER BY count(*) DESC, t.tag
                """, new MapSqlParameterSource("spaces", memories.scope(ctx).spaces("all")), String.class);
    }

    /** Газрын зургийн цэгүүд (AC-116): ижил газрын нэр, ойролцоо координатаар бүлэглэнэ. */
    @Transactional(readOnly = true)
    public List<MemoryPlace> places(SpaceContext ctx, String bbox) {
        MapSqlParameterSource p = new MapSqlParameterSource("spaces", memories.scope(ctx).spaces("all"));
        String box = "";
        if (bbox != null && !bbox.isBlank()) {
            String[] b = bbox.split(",");
            box = " AND lon BETWEEN :w AND :e AND lat BETWEEN :s AND :n";
            p.addValue("w", Double.parseDouble(b[0])).addValue("s", Double.parseDouble(b[1]))
                    .addValue("e", Double.parseDouble(b[2])).addValue("n", Double.parseDouble(b[3]));
        }
        Map<String, MemoryPlace> out = new LinkedHashMap<>();
        jdbc.query("SELECT id, location_name, lat, lon FROM memory WHERE space_id IN (:spaces) AND deleted_at IS NULL "
                + "AND lat IS NOT NULL" + box + " ORDER BY occurred_on", p, rs -> {
            double lat = rs.getDouble("lat");
            double lon = rs.getDouble("lon");
            String key = String.format(Locale.ROOT, "%.3f,%.3f", lat, lon);
            MemoryPlace place = out.computeIfAbsent(key, k -> new MemoryPlace(BigDecimal.valueOf(lat), BigDecimal.valueOf(lon),
                    rs2(rs), new ArrayList<>(), 0));
            place.getMemoryIds().add(rs.getObject("id", UUID.class));
            place.count(place.getMemoryIds().size());
        });
        return new ArrayList<>(out.values());
    }

    private static String rs2(java.sql.ResultSet rs) {
        try {
            String n = rs.getString("location_name");
            return n == null ? "" : n;
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    /** «Жилийн өмнөх өнөөдөр» (FR-3.6, AC-73): өмнөх жилүүдийн ижил сар/өдөр, жилээр. */
    @Transactional(readOnly = true)
    public List<OnThisDayGroup> onThisDay(SpaceContext ctx, LocalDate date) {
        LocalDate day = date != null ? date : coupleToday(ctx.spaceId());
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, extract(year FROM occurred_on)::int AS y FROM memory
                 WHERE space_id IN (:spaces) AND deleted_at IS NULL
                   AND extract(month FROM occurred_on) = :mo AND extract(day FROM occurred_on) = :d
                   AND occurred_on < :day
                 ORDER BY occurred_on DESC, created_at DESC
                """, new MapSqlParameterSource("spaces", memories.scope(ctx).spaces("all")).addValue("mo", day.getMonthValue())
                .addValue("d", day.getDayOfMonth()).addValue("day", day));
        Map<Integer, List<UUID>> byYear = new LinkedHashMap<>();
        rows.forEach(r -> byYear.computeIfAbsent(((Number) r.get("y")).intValue(), k -> new ArrayList<>()).add((UUID) r.get("id")));
        List<OnThisDayGroup> out = new ArrayList<>();
        byYear.forEach((y, ids) -> out.add(new OnThisDayGroup(y, new ArrayList<>(assembler.summaries(ids, ctx.userId())))));
        return out;
    }

    LocalDate coupleToday(UUID spaceId) {
        String tz = jdbc.queryForObject("SELECT timezone FROM space WHERE id = :s", new MapSqlParameterSource("s", spaceId),
                String.class);
        return time.today(ZoneId.of(tz));
    }

    private static String normScope(String scope) {
        return scope == null || scope.isBlank() ? "all" : scope;
    }

    private static String likeEscape(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
