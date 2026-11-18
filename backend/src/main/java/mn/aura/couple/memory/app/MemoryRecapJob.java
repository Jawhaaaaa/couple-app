package mn.aura.couple.memory.app;

import java.sql.Array;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import mn.aura.couple.api.model.Dashboard;
import mn.aura.couple.api.model.MemorySummary;
import mn.aura.couple.api.model.Recap;
import mn.aura.couple.api.model.RecapSlide;
import mn.aura.couple.api.model.RecapSummary;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.job.TestRunnableJob;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.CoupleCalendar;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.dashboard.app.DashboardContributor;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Жилийн ойн хураангуй (FR-5.11, AC-84): эхэлсэн өдрийн жилийн ой болох өдөр (хосын бүсээр) өнгөрсөн
 * жилийн дурсамж ≥ 5 бол story үүснэ — дуртай, реакц ихтэй, сар бүрээс нэг; нүүрэнд 7 хоног карт.
 * 15 мин тутам (DD-AURA-010), хос бүрд өдөрт нэг удаа (UNIQUE).
 */
@Service
public class MemoryRecapJob implements TestRunnableJob, DashboardContributor {

    static final int MIN_MEMORIES = 5;
    static final int MAX_MEMORY_SLIDES = 6;

    private final NamedParameterJdbcTemplate jdbc;
    private final MemoryAssembler assembler;
    private final TimeProvider time;

    public MemoryRecapJob(NamedParameterJdbcTemplate jdbc, MemoryAssembler assembler, TimeProvider time) {
        this.jdbc = jdbc;
        this.assembler = assembler;
        this.time = time;
    }

    @Scheduled(fixedDelayString = "PT15M")
    @SchedulerLock(name = "memoryRecap", lockAtMostFor = "PT10M")
    public void scheduled() {
        runOnce();
    }

    @Override
    public String name() {
        return "memoryRecap";
    }

    @Override
    @Transactional
    public int runOnce() {
        int created = 0;
        List<Map<String, Object>> spaces = jdbc.queryForList("""
                SELECT id, timezone, start_date FROM space
                 WHERE kind = 'COUPLE' AND status = 'ACTIVE' AND start_date_confirmed AND start_date IS NOT NULL
                """, new MapSqlParameterSource());
        for (Map<String, Object> s : spaces) {
            LocalDate start = ((Date) s.get("start_date")).toLocalDate();
            LocalDate today = time.today(ZoneId.of((String) s.get("timezone")));
            int years = today.getYear() - start.getYear();
            if (years < 1 || !CoupleCalendar.yearMilestone(start, years).equals(today)) {
                continue;
            }
            if (createFor((UUID) s.get("id"), today, years)) {
                created++;
            }
        }
        return created;
    }

    private boolean createFor(UUID spaceId, LocalDate anniversary, int years) {
        MapSqlParameterSource p = new MapSqlParameterSource("s", spaceId).addValue("from", anniversary.minusYears(1))
                .addValue("to", anniversary);
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT m.id, extract(month FROM m.occurred_on)::int AS mo,
                       (SELECT count(*) FROM memory_favorite f WHERE f.memory_id = m.id) * 3
                     + (SELECT count(*) FROM reaction r WHERE r.target_type = 'MEMORY' AND r.target_id = m.id) * 2
                     + (SELECT count(*) FROM memory_comment c WHERE c.memory_id = m.id) AS score
                  FROM memory m
                 WHERE m.space_id = :s AND m.deleted_at IS NULL AND m.occurred_on >= :from AND m.occurred_on < :to
                 ORDER BY score DESC, m.occurred_on
                """, p);
        if (rows.size() < MIN_MEMORIES) {
            return false;
        }
        Set<UUID> chosen = new LinkedHashSet<>();
        // Хамгийн хайртай (дуртай, реакц, сэтгэгдэл) хоёр
        rows.stream().limit(2).forEach(r -> chosen.add((UUID) r.get("id")));
        // Сар бүрээс нэг (оноо өндрөөс)
        Set<Integer> months = new LinkedHashSet<>();
        for (Map<String, Object> r : rows) {
            if (chosen.size() >= MAX_MEMORY_SLIDES) {
                break;
            }
            if (months.add(((Number) r.get("mo")).intValue())) {
                chosen.add((UUID) r.get("id"));
            }
        }
        List<UUID> ordered = jdbc.queryForList("SELECT id FROM memory WHERE id IN (:ids) ORDER BY occurred_on",
                new MapSqlParameterSource("ids", chosen), UUID.class);
        int n = jdbc.update("""
                INSERT INTO memory_recap (id, space_id, anniversary_on, year_number, memory_ids, created_at)
                VALUES (:id, :s, :d, :y, :ids, :now) ON CONFLICT (space_id, anniversary_on) DO NOTHING
                """, new MapSqlParameterSource("id", Ids.newId()).addValue("s", spaceId).addValue("d", anniversary)
                .addValue("y", years).addValue("ids", ordered.toArray(UUID[]::new))
                .addValue("now", Timestamp.from(time.now())));
        return n > 0;
    }

    @Transactional(readOnly = true)
    public List<RecapSummary> list(SpaceContext ctx) {
        String locale = locale(ctx.userId());
        return jdbc.query("SELECT id, anniversary_on, year_number, memory_ids FROM memory_recap WHERE space_id = :s "
                + "ORDER BY anniversary_on DESC", new MapSqlParameterSource("s", ctx.spaceId()), (rs, i) -> {
            RecapSummary r = new RecapSummary(rs.getObject("id", UUID.class), rs.getDate("anniversary_on").toLocalDate(),
                    label(rs.getInt("year_number"), locale));
            List<UUID> ids = ids(rs.getArray("memory_ids"));
            if (!ids.isEmpty()) {
                assembler.summaries(List.of(ids.get(0)), ctx.userId()).stream().findFirst().ifPresent(m -> r.cover(m.getCover()));
            }
            return r;
        });
    }

    @Transactional(readOnly = true)
    public Recap get(SpaceContext ctx, UUID id) {
        Map<String, Object> row = jdbc.queryForList("SELECT anniversary_on, year_number, memory_ids FROM memory_recap "
                + "WHERE id = :id AND space_id = :s", new MapSqlParameterSource("id", id).addValue("s", ctx.spaceId()))
                .stream().findFirst().orElseThrow(ApiException::notFound);
        String locale = locale(ctx.userId());
        boolean en = "en".equals(locale);
        int years = ((Number) row.get("year_number")).intValue();
        List<UUID> ids;
        try {
            ids = ids((Array) row.get("memory_ids"));
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException(e);
        }
        List<MemorySummary> memories = assembler.summaries(ids, ctx.userId());
        LocalDate on = ((Date) row.get("anniversary_on")).toLocalDate();
        Integer total = jdbc.queryForObject("SELECT count(*) FROM memory WHERE space_id = :s AND deleted_at IS NULL "
                + "AND occurred_on >= :from AND occurred_on < :to", new MapSqlParameterSource("s", ctx.spaceId())
                .addValue("from", on.minusYears(1)).addValue("to", on), Integer.class);
        List<RecapSlide> slides = new ArrayList<>();
        slides.add(new RecapSlide(RecapSlide.KindEnum.TITLE, label(years, locale)));
        slides.add(slide(RecapSlide.KindEnum.STAT, en ? "Memories this year" : "Энэ жилийн дурсамж", total));
        for (MemorySummary m : memories) {
            RecapSlide s = new RecapSlide(RecapSlide.KindEnum.MEMORY, m.getTitle());
            s.memoryId(m.getId());
            s.media(m.getCover());
            s.body(m.getOccurredOn().toString());
            slides.add(s);
        }
        Optional<String> place = jdbc.queryForList("""
                SELECT location_name FROM memory WHERE space_id = :s AND deleted_at IS NULL AND location_name IS NOT NULL
                   AND occurred_on >= :from AND occurred_on < :to
                 GROUP BY location_name ORDER BY count(*) DESC, location_name LIMIT 1
                """, new MapSqlParameterSource("s", ctx.spaceId()).addValue("from", on.minusYears(1)).addValue("to", on),
                String.class).stream().findFirst();
        place.ifPresent(name -> {
            RecapSlide s = new RecapSlide(RecapSlide.KindEnum.PLACE, en ? "Our place of the year" : "Жилийн газар");
            s.body(name);
            slides.add(s);
        });
        slides.add(new RecapSlide(RecapSlide.KindEnum.CLOSING, en ? "Here's to the next year together" : "Дараагийн жилдээ хамтдаа"));
        return new Recap(id, on, label(years, locale), slides);
    }

    /** Нүүрний карт — сүүлийн 7 хоногт үүссэн хураангуй (AC-84). */
    @Override
    public void contribute(Context ctx, Dashboard dashboard) {
        jdbc.query("SELECT id, anniversary_on, year_number FROM memory_recap WHERE space_id = :s AND anniversary_on > :since "
                        + "ORDER BY anniversary_on DESC LIMIT 1",
                new MapSqlParameterSource("s", ctx.spaceId()).addValue("since", ctx.coupleToday().minusDays(7)),
                rs -> {
                    dashboard.recap(new RecapSummary(rs.getObject("id", UUID.class), rs.getDate("anniversary_on").toLocalDate(),
                            label(rs.getInt("year_number"), locale(ctx.userId()))));
                });
    }

    private static RecapSlide slide(RecapSlide.KindEnum kind, String title, Integer value) {
        RecapSlide s = new RecapSlide(kind, title);
        s.value(value);
        return s;
    }

    private String locale(UUID userId) {
        return jdbc.queryForObject("SELECT locale FROM users WHERE id = :u", new MapSqlParameterSource("u", userId), String.class);
    }

    static String label(int years, String locale) {
        return "en".equals(locale) ? "Year " + years : years + " дэх жил";
    }

    private static List<UUID> ids(Array array) throws java.sql.SQLException {
        return array == null ? List.of() : Arrays.asList((UUID[]) array.getArray());
    }
}
