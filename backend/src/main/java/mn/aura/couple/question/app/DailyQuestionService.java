package mn.aura.couple.question.app;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.DailyQuestion;
import mn.aura.couple.api.model.DailyQuestionPage;
import mn.aura.couple.api.model.DailyQuestionQuestion;
import mn.aura.couple.api.model.QuestionAnswer;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.question.app.QuestionPicker.Question;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Өдрийн асуулт (FR-3.5). Хосын өдөр (SD-02, хосын бүсийн 00:00)-ийн эхний хүсэлтэд асуулт царцна —
 * хоёр хүнд ижил (AC-75). Хамтрагчийн хариулт нь хоёулаа хариулсны дараа л API-д гарна (AC-15, INV-04):
 * DTO-г дуудагч тутам проекцлоно. Хоёр дахь хариултаар `question.revealed` хоёуланд.
 */
@Service
public class DailyQuestionService {

    private final JdbcTemplate jdbc;
    private final QuestionPicker picker;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public DailyQuestionService(JdbcTemplate jdbc, QuestionPicker picker, CoupleMembers couples, UserRefs users,
                                ApplicationEventPublisher events, TimeProvider time) {
        this.jdbc = jdbc;
        this.picker = picker;
        this.couples = couples;
        this.users = users;
        this.events = events;
        this.time = time;
    }

    private record Answer(UUID userId, String text, Instant createdAt) {
    }

    @Transactional
    public DailyQuestion today(SpaceContext ctx) {
        LocalDate day = coupleDay(ctx.spaceId());
        String questionId = ensure(ctx.spaceId(), day);
        return view(ctx.userId(), day, questionId, answers(ctx.spaceId(), day));
    }

    @Transactional
    public DailyQuestion answer(SpaceContext ctx, String text) {
        String trimmed = text == null ? "" : text.strip();
        if (trimmed.isEmpty() || trimmed.length() > 1000) {
            throw ApiException.validation("text", ErrorCode.VALIDATION_FAILED);
        }
        LocalDate day = coupleDay(ctx.spaceId());
        String questionId = ensure(ctx.spaceId(), day);
        try {
            jdbc.update("INSERT INTO question_answer (id, space_id, couple_day, user_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    Ids.newId(), ctx.spaceId(), day, ctx.userId(), trimmed, Timestamp.from(time.now()));
        } catch (DuplicateKeyException e) {
            throw new ApiException(ErrorCode.ALREADY_ANSWERED, HttpStatus.CONFLICT);
        }
        Map<UUID, Answer> answers = answers(ctx.spaceId(), day);
        couples.partnerIn(ctx.spaceId(), ctx.userId()).ifPresent(partner -> {
            events.publishEvent(new Notify(partner, ctx.spaceId(), ctx.userId(), "QUESTION_PARTNER_ANSWERED",
                    Map.of("partner", users.ref(ctx.userId()).getDisplayName()), "/home/question"));
            if (answers.size() == 2) {
                // Хүлээн авагч тутам проекц (DD-AURA-005)
                events.publishEvent(RealtimeEvent.projected("question.revealed", ctx.userId(), List.of(ctx.userId(), partner),
                        viewer -> view(viewer, day, questionId, answers)));
            }
        });
        return view(ctx.userId(), day, questionId, answers);
    }

    /** Өмнөх өдрүүд (шинээс хуучин). Хамтрагчийн хариулт — хоёулаа хариулсан өдөр л (AC-75). */
    @Transactional(readOnly = true)
    public DailyQuestionPage history(SpaceContext ctx, String cursor, Integer limit) {
        int size = limit == null ? 30 : Math.max(1, Math.min(100, limit));
        LocalDate before = cursor == null || cursor.isBlank() ? coupleDay(ctx.spaceId()) : decode(cursor);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT couple_day, question_id FROM daily_question WHERE space_id = ? AND couple_day < ? "
                        + "ORDER BY couple_day DESC LIMIT ?", ctx.spaceId(), before, size + 1);
        boolean more = rows.size() > size;
        List<DailyQuestion> items = new ArrayList<>();
        for (Map<String, Object> r : rows.subList(0, Math.min(size, rows.size()))) {
            LocalDate day = ((java.sql.Date) r.get("couple_day")).toLocalDate();
            items.add(view(ctx.userId(), day, (String) r.get("question_id"), answers(ctx.spaceId(), day)));
        }
        String next = more && !items.isEmpty() ? encode(items.get(items.size() - 1).getCoupleDay()) : null;
        return new DailyQuestionPage(items, next);
    }

    /** Хосын өнөөдөр (SD-02: хосын бүс). */
    public LocalDate coupleDay(UUID spaceId) {
        String tz = jdbc.queryForObject("SELECT timezone FROM space WHERE id = ?", String.class, spaceId);
        return time.today(ZoneId.of(tz));
    }

    private String ensure(UUID spaceId, LocalDate day) {
        List<String> existing = jdbc.queryForList("SELECT question_id FROM daily_question WHERE space_id = ? AND couple_day = ?",
                String.class, spaceId, day);
        if (!existing.isEmpty()) {
            return existing.get(0);
        }
        Map<String, Object> space = jdbc.queryForMap("SELECT timezone, linked_at, created_at FROM space WHERE id = ?", spaceId);
        Timestamp start = (Timestamp) (space.get("linked_at") != null ? space.get("linked_at") : space.get("created_at"));
        LocalDate first = LocalDate.ofInstant(start.toInstant(), ZoneId.of((String) space.get("timezone")));
        Question q = picker.pick(spaceId, ChronoUnit.DAYS.between(first, day));
        jdbc.update("INSERT INTO daily_question (space_id, couple_day, question_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
                spaceId, day, q.id());
        // Зэрэг хүсэлт түрүүлсэн бол түүний сонголт хүчинтэй
        return jdbc.queryForObject("SELECT question_id FROM daily_question WHERE space_id = ? AND couple_day = ?",
                String.class, spaceId, day);
    }

    private Map<UUID, Answer> answers(UUID spaceId, LocalDate day) {
        Map<UUID, Answer> out = new HashMap<>();
        jdbc.query("SELECT user_id, text, created_at FROM question_answer WHERE space_id = ? AND couple_day = ?",
                rs -> {
                    UUID u = rs.getObject("user_id", UUID.class);
                    out.put(u, new Answer(u, rs.getString("text"), rs.getTimestamp("created_at").toInstant()));
                }, spaceId, day);
        return out;
    }

    /** INV-04: `partnerAnswer` нь дуудагч хариулсан ба хамтрагч хариулсан үед л байна. */
    private DailyQuestion view(UUID viewer, LocalDate day, String questionId, Map<UUID, Answer> answers) {
        Question q = picker.find(questionId).orElseThrow(ApiException::notFound);
        Answer mine = answers.get(viewer);
        Answer theirs = answers.values().stream().filter(a -> !a.userId().equals(viewer)).findFirst().orElse(null);
        DailyQuestion dto = new DailyQuestion(day, new DailyQuestionQuestion(q.id(), q.mn(), q.en(), q.category()),
                mine == null ? null : answerDto(mine), theirs != null);
        if (mine != null && theirs != null) {
            dto.partnerAnswer(answerDto(theirs));
        }
        return dto;
    }

    private static QuestionAnswer answerDto(Answer a) {
        return new QuestionAnswer(a.text(), OffsetDateTime.ofInstant(a.createdAt(), ZoneOffset.UTC));
    }

    private static String encode(LocalDate d) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(d.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static LocalDate decode(String cursor) {
        try {
            return LocalDate.parse(new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8));
        } catch (RuntimeException e) {
            throw ApiException.validation("cursor", ErrorCode.VALIDATION_FAILED);
        }
    }
}
