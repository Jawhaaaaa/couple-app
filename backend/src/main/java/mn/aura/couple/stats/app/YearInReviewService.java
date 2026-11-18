package mn.aura.couple.stats.app;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.MemorySummary;
import mn.aura.couple.api.model.RecapSlide;
import mn.aura.couple.api.model.Stats;
import mn.aura.couple.api.model.YearInReview;
import mn.aura.couple.api.model.YearInReviewTopMonth;
import mn.aura.couple.api.model.YearInReviewTopPlace;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.memory.app.MemoryAssembler;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * «Бидний жил» (FR-12.4, AC-118): тухайн жилийн тоо (`Stats`-ийн түлхүүрүүдээр), хамгийн их дурсамжтай сар,
 * хамгийн их очсон газар, шилдэг дурсамж (≤ 5), 6–10 слайд (ANIM-22). Зөвхөн тухайн space-ийн өгөгдөл.
 */
@Service
public class YearInReviewService {

    static final int TOP_MEMORIES = 5;
    static final int MEMORY_SLIDES = 3;

    private final NamedParameterJdbcTemplate jdbc;
    private final StatsService stats;
    private final MemoryAssembler memories;
    private final UserRefs users;
    private final TimeProvider time;

    public YearInReviewService(NamedParameterJdbcTemplate jdbc, StatsService stats, MemoryAssembler memories,
                               UserRefs users, TimeProvider time) {
        this.jdbc = jdbc;
        this.stats = stats;
        this.memories = memories;
        this.users = users;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public YearInReview year(SpaceContext ctx, int year) {
        String tz = jdbc.queryForObject("SELECT timezone FROM space WHERE id = :s",
                new MapSqlParameterSource("s", ctx.spaceId()), String.class);
        int current = time.today(StatsService.zone(tz)).getYear();
        if (year < 2000 || year > current) {
            throw ApiException.notFound();
        }
        LocalDate from = LocalDate.of(year, 1, 1);
        LocalDate to = LocalDate.of(year, 12, 31);
        Stats s = stats.count(ctx.spaceId(), new StatsService.Range(from, to));
        Map<String, BigDecimal> totals = new LinkedHashMap<>();
        totals.put("memories", BigDecimal.valueOf(s.getMemories()));
        totals.put("photos", BigDecimal.valueOf(s.getPhotos()));
        totals.put("videos", BigDecimal.valueOf(s.getVideos()));
        totals.put("dates", BigDecimal.valueOf(s.getDates()));
        totals.put("goalsCompleted", BigDecimal.valueOf(s.getGoalsCompleted()));
        totals.put("letters", BigDecimal.valueOf(s.getLetters()));
        totals.put("daysTogether", BigDecimal.valueOf(s.getDaysTogether()));
        totals.put("heartsSent", BigDecimal.valueOf(s.getHeartsSent()));
        totals.put("cities", BigDecimal.valueOf(s.getCities()));
        totals.put("countries", BigDecimal.valueOf(s.getCountries()));
        totals.put("distanceKm", s.getDistanceKm());

        MapSqlParameterSource p = new MapSqlParameterSource("s", ctx.spaceId()).addValue("from", Date.valueOf(from))
                .addValue("to", Date.valueOf(to));
        List<YearInReviewTopMonth> months = jdbc.query("""
                SELECT extract(month FROM occurred_on)::int AS m, count(*) AS n FROM memory
                 WHERE space_id = :s AND deleted_at IS NULL AND occurred_on BETWEEN :from AND :to
                 GROUP BY 1 ORDER BY n DESC, m LIMIT 1
                """, p, (rs, i) -> new YearInReviewTopMonth(rs.getInt("m"), rs.getInt("n")));
        List<YearInReviewTopPlace> places = jdbc.query("""
                SELECT location_name, count(*) AS n FROM memory
                 WHERE space_id = :s AND deleted_at IS NULL AND occurred_on BETWEEN :from AND :to AND location_name IS NOT NULL
                 GROUP BY location_name ORDER BY n DESC, location_name LIMIT 1
                """, p, (rs, i) -> new YearInReviewTopPlace(rs.getString("location_name"), rs.getInt("n")));
        // Шилдэг: сэтгэгдэл, реакц, дуртай хамгийн их; тэнцвэл эрт
        List<UUID> topIds = jdbc.queryForList("""
                SELECT m.id FROM memory m
                 WHERE m.space_id = :s AND m.deleted_at IS NULL AND m.occurred_on BETWEEN :from AND :to
                 ORDER BY (SELECT count(*) FROM memory_comment c WHERE c.memory_id = m.id)
                        + (SELECT count(*) FROM memory_favorite f WHERE f.memory_id = m.id)
                        + (SELECT count(*) FROM reaction r WHERE r.target_id = m.id) DESC,
                          m.occurred_on, m.created_at, m.id
                 LIMIT :limit
                """, p.addValue("limit", TOP_MEMORIES), UUID.class);
        List<MemorySummary> top = memories.summaries(topIds, ctx.userId());

        String locale = users.row(ctx.userId()).map(UserRefs.UserRow::locale).orElse("mn");
        boolean en = "en".equals(locale);
        List<RecapSlide> slides = new ArrayList<>();
        slides.add(new RecapSlide(RecapSlide.KindEnum.TITLE, en ? "Our " + year : "Бидний " + year + " он"));
        slides.add(stat(en ? "Memories together" : "Хамтын дурсамж", s.getMemories()));
        slides.add(stat(en ? "Dates" : "Болзоо", s.getDates()));
        for (MemorySummary m : top.subList(0, Math.min(MEMORY_SLIDES, top.size()))) {
            RecapSlide slide = new RecapSlide(RecapSlide.KindEnum.MEMORY, m.getTitle());
            slide.memoryId(m.getId());
            slide.media(m.getCover());
            slides.add(slide);
        }
        if (!places.isEmpty()) {
            RecapSlide place = new RecapSlide(RecapSlide.KindEnum.PLACE, en ? "Our place of the year" : "Жилийн газар");
            place.body(places.get(0).getPlaceName());
            place.value(places.get(0).getCount());
            slides.add(place);
        }
        slides.add(stat(en ? "Hearts sent" : "Илгээсэн зүрх", s.getHeartsSent()));
        if (slides.size() < 8) {
            slides.add(stat(en ? "Days together" : "Хамт өнгөрүүлсэн хоног", s.getDaysTogether()));
        }
        slides.add(new RecapSlide(RecapSlide.KindEnum.CLOSING, en ? "Here's to the next year together" : "Дараагийн жилдээ хамтдаа"));

        YearInReview r = new YearInReview(year, totals, top, slides);
        r.topMonth(months.isEmpty() ? null : months.get(0));
        r.topPlace(places.isEmpty() ? null : places.get(0));
        return r;
    }

    private static RecapSlide stat(String title, Integer value) {
        RecapSlide s = new RecapSlide(RecapSlide.KindEnum.STAT, title);
        s.value(value);
        return s;
    }
}
