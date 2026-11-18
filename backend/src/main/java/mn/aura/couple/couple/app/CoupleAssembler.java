package mn.aura.couple.couple.app;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.BreakupState;
import mn.aura.couple.api.model.Couple;
import mn.aura.couple.api.model.CoupleMyView;
import mn.aura.couple.api.model.CoupleSoloShare;
import mn.aura.couple.api.model.SpaceStatus;
import mn.aura.couple.api.model.Theme;
import mn.aura.couple.api.model.ThemeProposal;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.couple.domain.SpaceRepository;
import mn.aura.couple.couple.domain.SpaceRepository.MemberRow;
import mn.aura.couple.couple.domain.SpaceRepository.SpaceRow;
import mn.aura.couple.couple.domain.ThemeProposalRepository;
import mn.aura.couple.media.app.MediaRefs;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Гэрээний `Couple` — дуудагч тутам: `myView` (хоч, avatar, маскотын өнгө) зөвхөн өөрт (AC-137),
 * `myProposal`/`partnerProposal` (AC-65), хуваалцах шийдвэр хүлээгдэж буй бол `soloShare` (AC-67).
 */
@Component
public class CoupleAssembler {

    public static final String DEFAULT_MASCOT_COLOR = "coral";

    private final SpaceRepository spaces;
    private final ThemeProposalRepository themes;
    private final UserRefs users;
    private final MediaRefs media;
    private final SoloContentCounter soloContent;
    private final JdbcTemplate jdbc;

    public CoupleAssembler(SpaceRepository spaces, ThemeProposalRepository themes, UserRefs users, MediaRefs media,
                           SoloContentCounter soloContent, JdbcTemplate jdbc) {
        this.spaces = spaces;
        this.themes = themes;
        this.users = users;
        this.media = media;
        this.soloContent = soloContent;
        this.jdbc = jdbc;
    }

    public Couple forUser(UUID spaceId, UUID userId) {
        SpaceRow space = spaces.find(spaceId).orElseThrow(ApiException::notFound);
        List<MemberRow> members = spaces.members(spaceId);
        MemberRow me = members.stream().filter(m -> m.userId().equals(userId)).findFirst()
                .orElseThrow(ApiException::notFound);
        Optional<MemberRow> partner = members.stream().filter(m -> !m.userId().equals(userId)).findFirst();

        CoupleMyView myView = new CoupleMyView(me.partnerNickname(), mascotColor(userId));
        myView.partnerAvatar(media.nullable(me.partnerAvatarMediaId()));

        Couple couple = new Couple(space.id(), Couple.KindEnum.fromValue(space.kind()),
                SpaceStatus.fromValue(space.status()), space.timezone(), startDateStatus(space, me, partner),
                Theme.fromValue(space.theme()), myView, false);
        couple.startDate(space.startDate());
        couple.myProposal(me.proposedStartDate());
        couple.partnerProposal(partner.map(MemberRow::proposedStartDate).orElse(null));
        couple.nextMeetupAt(utc(space.nextMeetupAt()));
        couple.readOnlyUntil(utc(space.readOnlyUntil()));
        themes.findPending(spaceId).ifPresent(p -> {
            ThemeProposal dto = new ThemeProposal(p.id(), Theme.fromValue(p.theme()),
                    ThemeProposal.StatusEnum.PENDING, users.ref(p.proposerId()), utc(p.createdAt()));
            couple.pendingThemeProposal(dto);
        });
        partner.flatMap(p -> users.row(p.userId())).ifPresent(p -> {
            couple.partner(users.partnerCard(p));
            couple.isLongDistance(isLongDistance(users.row(userId).orElse(null), p));
        });
        if ("BREAKING".equals(space.status()) || "ORPHANED".equals(space.status())) {
            couple.breakup(new BreakupState(SpaceStatus.fromValue(space.status()), utc(space.readOnlyUntil()),
                    me.restoreConfirmedAt() != null,
                    partner.map(p -> p.restoreConfirmedAt() != null).orElse(false)));
        }
        if ("PENDING".equals(me.soloShareDecision())) {
            int pending = soloContent.count(userId);
            if (pending > 0) {
                couple.soloShare(new CoupleSoloShare(pending));
            }
        }
        return couple;
    }

    /** GAP-26: хоёр хүний профайлын хот өөр бол «алс зайн». */
    static boolean isLongDistance(UserRefs.UserRow me, UserRefs.UserRow partner) {
        if (me == null || partner == null || me.cityName() == null || partner.cityName() == null) {
            return false;
        }
        boolean sameName = me.cityName().strip().toLowerCase(Locale.ROOT)
                .equals(partner.cityName().strip().toLowerCase(Locale.ROOT));
        return !(sameName && Objects.equals(me.countryCode(), partner.countryCode()));
    }

    static Couple.StartDateStatusEnum startDateStatus(SpaceRow space, MemberRow me, Optional<MemberRow> partner) {
        if (space.startDateConfirmed() && space.startDate() != null) {
            return Couple.StartDateStatusEnum.CONFIRMED;
        }
        var mine = me.proposedStartDate();
        var theirs = partner.map(MemberRow::proposedStartDate).orElse(null);
        if (mine != null && theirs != null && !mine.equals(theirs)) {
            return Couple.StartDateStatusEnum.MISMATCH;
        }
        return Couple.StartDateStatusEnum.PENDING;
    }

    private String mascotColor(UUID userId) {
        List<String> colors = jdbc.queryForList("SELECT mascot_color FROM user_preference WHERE user_id = ?",
                String.class, userId);
        return colors.isEmpty() || colors.get(0) == null ? DEFAULT_MASCOT_COLOR : colors.get(0);
    }

    static OffsetDateTime utc(Instant i) {
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }
}
