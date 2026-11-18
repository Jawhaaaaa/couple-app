package mn.aura.couple.dashboard.app;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.Period;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.account.app.ProfileService;
import mn.aura.couple.api.model.Dashboard;
import mn.aura.couple.api.model.DashboardCounter;
import mn.aura.couple.api.model.DashboardCounterBreakdown;
import mn.aura.couple.api.model.DashboardLongDistance;
import mn.aura.couple.api.model.DashboardSignalsToday;
import mn.aura.couple.api.model.PersonCard;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.geo.GeoMath;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.CoupleCalendar;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.couple.app.UserRefs.UserRow;
import mn.aura.couple.notification.app.QuietModeService;
import mn.aura.couple.realtime.app.PresenceService;
import mn.aura.couple.signal.app.HeartSignalService;
import mn.aura.couple.weather.app.WeatherService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Нүүр (S-20, FR-3.1…3.7). Тоолуур — хосын бүсийн өнөөдрөөр (SD-01, SD-02: хоёр талд ижил тоо, AC-13);
 * хоёр хүний карт — орон нутгийн цаг, бүсийн зөрүү (AC-14), онлайн төлөв (тэгш нуулт, AC-70), хотын цаг
 * агаар (татагдахгүй бол хэсэг нуугдана, AC-71), тайван горим (AC-123); алс зайн хост агаарын шугамын
 * зай ба уулзалт (AC-74, GAP-26); өнөөдрийн зүрхний тоо (AC-78). Бусад хэсгийг `DashboardContributor`.
 */
@Service
public class DashboardService {

    private final JdbcTemplate jdbc;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final PresenceService presence;
    private final WeatherService weather;
    private final QuietModeService quiet;
    private final HeartSignalService signals;
    private final List<DashboardContributor> contributors;
    private final TimeProvider time;

    public DashboardService(JdbcTemplate jdbc, CoupleMembers couples, UserRefs users, PresenceService presence,
                            WeatherService weather, QuietModeService quiet, HeartSignalService signals,
                            List<DashboardContributor> contributors, TimeProvider time) {
        this.jdbc = jdbc;
        this.couples = couples;
        this.users = users;
        this.presence = presence;
        this.weather = weather;
        this.quiet = quiet;
        this.signals = signals;
        this.contributors = contributors;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public Dashboard build(SpaceContext ctx, String deviceTz) {
        Instant now = time.now();
        Map<String, Object> space = jdbc.queryForMap(
                "SELECT timezone, start_date, start_date_confirmed, next_meetup_at FROM space WHERE id = ?", ctx.spaceId());
        ZoneId coupleZone = ZoneId.of((String) space.get("timezone"));
        LocalDate today = time.today(coupleZone);
        UserRow me = users.row(ctx.userId()).orElseThrow(ApiException::notFound);
        ZoneId viewerZone = zone(deviceTz).orElse(ZoneId.of(me.timezone()));
        Optional<UUID> partnerId = couples.partnerIn(ctx.spaceId(), ctx.userId());

        boolean confirmed = Boolean.TRUE.equals(space.get("start_date_confirmed")) && space.get("start_date") != null;
        LocalDate start = confirmed ? ((java.sql.Date) space.get("start_date")).toLocalDate() : null;
        Period p = CoupleCalendar.breakdown(start, today);
        DashboardCounter counter = new DashboardCounter((int) CoupleCalendar.counterDays(start, today),
                new DashboardCounterBreakdown(p.getYears(), p.getMonths(), p.getDays()), confirmed);
        counter.startDate(start);

        HeartSignalService.DayCounts counts = signals.today(ctx.spaceId(), ctx.userId());
        Dashboard dashboard = new Dashboard(counter, card(me, me, viewerZone, now),
                new DashboardSignalsToday(counts.sent(), counts.received()), new ArrayList<>(), new ArrayList<>(), 0,
                new ArrayList<>());

        partnerId.flatMap(users::row).ifPresent(partner -> {
            PersonCard card = card(partner, me, viewerZone, now);
            presence.onlineFor(ctx.userId(), partner.id()).ifPresent(online ->
                    card.onlineStatus(online ? PersonCard.OnlineStatusEnum.ONLINE : PersonCard.OnlineStatusEnum.OFFLINE));
            partner.city().flatMap(c -> weather.nowIfAvailable(c.getLat().doubleValue(), c.getLon().doubleValue()))
                    .ifPresent(card::weather);
            quiet.quietUntil(partner.id()).ifPresent(u -> card.quietUntil(OffsetDateTime.ofInstant(u, ZoneOffset.UTC)));
            dashboard.partner(card);
            if (couples.isLongDistance(ctx.userId()) && me.lat() != null && partner.lat() != null) {
                double km = GeoMath.distanceKm(me.lat().doubleValue(), me.lon().doubleValue(), partner.lat().doubleValue(),
                        partner.lon().doubleValue());
                DashboardLongDistance ld = new DashboardLongDistance(BigDecimal.valueOf(km).setScale(0, RoundingMode.HALF_UP));
                Timestamp meetup = (Timestamp) space.get("next_meetup_at");
                ld.nextMeetupAt(meetup == null ? null : OffsetDateTime.ofInstant(meetup.toInstant(), ZoneOffset.UTC));
                dashboard.longDistance(ld);
            }
        });
        if (partnerId.isPresent()) {
            var unseen = signals.unseen(ctx);
            if (unseen.getCount() > 0) {
                dashboard.unseenSignals(unseen);
            }
        }
        DashboardContributor.Context c = new DashboardContributor.Context(ctx.userId(), ctx.spaceId(), partnerId,
                viewerZone, coupleZone, today);
        for (DashboardContributor contributor : contributors) {
            contributor.contribute(c, dashboard);
        }
        return dashboard;
    }

    /** `subject`-ийн карт `viewer`-ийн өнцгөөс (бүсийн зөрүү = subject − viewer, AC-14). */
    private static PersonCard card(UserRow subject, UserRow viewer, ZoneId viewerZone, Instant now) {
        PersonCard base = ProfileService.personCard(subject, viewer, now);
        if (subject.id().equals(viewer.id())) {
            // Өөрийн карт — утасны одоогийн бүсээр (аялал, AC-64)
            int offset = viewerZone.getRules().getOffset(now).getTotalSeconds() / 60;
            return new PersonCard(base.getName(), OffsetDateTime.ofInstant(now, viewerZone), offset, 0);
        }
        int viewerOffset = viewerZone.getRules().getOffset(now).getTotalSeconds() / 60;
        return new PersonCard(base.getName(), base.getLocalTime(), base.getUtcOffsetMinutes(),
                base.getUtcOffsetMinutes() - viewerOffset);
    }

    private static Optional<ZoneId> zone(String tz) {
        if (tz == null || tz.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(ZoneId.of(tz));
        } catch (DateTimeException e) {
            return Optional.empty(); // буруу бүс — профайлын бүсээр
        }
    }
}
