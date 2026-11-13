package mn.aura.couple.plan.app;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import mn.aura.couple.api.model.DeckCard;
import mn.aura.couple.api.model.DeckCardIdea;
import mn.aura.couple.api.model.DeckMatch;
import mn.aura.couple.api.model.SwipeResult;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Нууц санал нэгдэл (FR-7.9, GAP-22, AC-36). Deck = хосын санаа + санааны сан (FR-7.11), би swipe хийгээгүйнх.
 * <ul>
 *   <li>Нөгөөгийн сонголт ямар ч хариунд орохгүй (INV-04): картын дараалал нь түүний сонголтоос хамаарахгүй,
 *       swipe-ийн хариу нь зөвхөн «тохирсон эсэх» — «үгүй» ч, хараахан swipe хийгээгүй ч ижил `matched: false`</li>
 *   <li>Хоёулаа «тийм» бол тохирол — хоёр талд `deck.matched` (ANIM-18)</li>
 *   <li>Нэг санааг дахин swipe хийхгүй — 409 `ALREADY_SWIPED`</li>
 * </ul>
 */
@Service
public class SecretDeckService {

    static final int DEFAULT_LIMIT = 30;

    private final NamedParameterJdbcTemplate jdbc;
    private final DateIdeaService ideas;
    private final IdeaLibraryService library;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public SecretDeckService(NamedParameterJdbcTemplate jdbc, DateIdeaService ideas, IdeaLibraryService library,
                             CoupleMembers couples, UserRefs users, ApplicationEventPublisher events, TimeProvider time) {
        this.jdbc = jdbc;
        this.ideas = ideas;
        this.library = library;
        this.couples = couples;
        this.users = users;
        this.events = events;
        this.time = time;
    }

    /** Би swipe хийгээгүй картууд: эхлээд хосын санаа (үүсгэсэн дарааллаар), дараа нь сангийнх (файлын дарааллаар). */
    @Transactional(readOnly = true)
    public List<DeckCard> next(SpaceContext ctx, Integer limit) {
        int size = limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(100, limit));
        Set<String> mine = new HashSet<>(jdbc.queryForList(
                "SELECT idea_ref FROM deck_swipe WHERE space_id = :s AND user_id = :u",
                new MapSqlParameterSource("s", ctx.spaceId()).addValue("u", ctx.userId()), String.class));
        String locale = locale(ctx.userId());
        List<DeckCard> out = new ArrayList<>();
        for (var idea : ideas.all(ctx.spaceId())) {
            String ref = "idea:" + idea.getId();
            if (!mine.contains(ref) && out.size() < size) {
                out.add(new DeckCard(ref, idea));
            }
        }
        for (var item : library.items()) {
            String ref = "library:" + item.id();
            if (!mine.contains(ref) && out.size() < size) {
                out.add(new DeckCard(ref, library.toDto(item, locale)));
            }
        }
        return out;
    }

    @Transactional
    public SwipeResult swipe(SpaceContext ctx, String ideaRef, boolean liked) {
        String locale = locale(ctx.userId());
        resolve(ctx.spaceId(), ideaRef, locale).orElseThrow(ApiException::notFound);
        Instant now = time.now();
        int inserted = jdbc.update("""
                INSERT INTO deck_swipe (space_id, user_id, idea_ref, liked, created_at) VALUES (:s, :u, :ref, :liked, :now)
                ON CONFLICT DO NOTHING
                """, new MapSqlParameterSource("s", ctx.spaceId()).addValue("u", ctx.userId()).addValue("ref", ideaRef)
                .addValue("liked", liked).addValue("now", Timestamp.from(now)));
        if (inserted == 0) {
            throw new ApiException(ErrorCode.ALREADY_SWIPED, HttpStatus.CONFLICT);
        }
        SwipeResult result = new SwipeResult(false);
        if (!liked) {
            return result;
        }
        Integer likes = jdbc.queryForObject("""
                SELECT count(DISTINCT user_id) FROM deck_swipe WHERE space_id = :s AND idea_ref = :ref AND liked
                """, new MapSqlParameterSource("s", ctx.spaceId()).addValue("ref", ideaRef), Integer.class);
        if (likes == null || likes < 2) {
            return result;
        }
        jdbc.update("INSERT INTO deck_match (space_id, idea_ref, matched_at) VALUES (:s, :ref, :now) ON CONFLICT DO NOTHING",
                new MapSqlParameterSource("s", ctx.spaceId()).addValue("ref", ideaRef).addValue("now", Timestamp.from(now)));
        List<UUID> members = couples.members(ctx.spaceId());
        // Хүлээн авагч бүрд өөрийн хэлээр (сангийн санааны гарчиг)
        events.publishEvent(RealtimeEvent.projected("deck.matched", ctx.userId(), members,
                viewer -> match(ctx.spaceId(), ideaRef, now, locale(viewer)).orElse(null)));
        DeckMatch m = match(ctx.spaceId(), ideaRef, now, locale).orElseThrow(ApiException::notFound);
        return result.matched(true).match(m);
    }

    @Transactional(readOnly = true)
    public List<DeckMatch> matches(SpaceContext ctx) {
        String locale = locale(ctx.userId());
        List<DeckMatch> out = new ArrayList<>();
        jdbc.query("SELECT idea_ref, matched_at FROM deck_match WHERE space_id = :s ORDER BY matched_at DESC, idea_ref",
                new MapSqlParameterSource("s", ctx.spaceId()), rs -> {
                    match(ctx.spaceId(), rs.getString("idea_ref"), rs.getTimestamp("matched_at").toInstant(), locale)
                            .ifPresent(out::add); // устгагдсан санаа алгасна
                });
        return out;
    }

    private Optional<DeckMatch> match(UUID spaceId, String ref, Instant at, String locale) {
        return resolve(spaceId, ref, locale).map(idea -> new DeckMatch(ref, idea, OffsetDateTime.ofInstant(at, ZoneOffset.UTC)));
    }

    /** `library:<id>` эсвэл `idea:<uuid>` (энэ space-ийнх) → карт; бусад → empty. */
    private Optional<DeckCardIdea> resolve(UUID spaceId, String ref, String locale) {
        if (ref == null) {
            return Optional.empty();
        }
        if (ref.startsWith("library:")) {
            return library.find(ref.substring("library:".length())).map(i -> library.toDto(i, locale));
        }
        if (ref.startsWith("idea:")) {
            try {
                return ideas.find(spaceId, UUID.fromString(ref.substring("idea:".length()))).map(i -> (DeckCardIdea) i);
            } catch (IllegalArgumentException e) {
                return Optional.empty();
            }
        }
        return Optional.empty();
    }

    private String locale(UUID userId) {
        return users.row(userId).map(UserRefs.UserRow::locale).orElse("mn");
    }
}
