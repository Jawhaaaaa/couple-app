package mn.aura.couple.chat.app;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import mn.aura.couple.api.model.Message;
import mn.aura.couple.api.model.MessagePage;
import mn.aura.couple.api.model.MessageSearchPage;
import mn.aura.couple.api.model.MessageSearchPageItemsInner;
import mn.aura.couple.chat.app.ChatMessageAssembler.Row;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Чатын хайлт ба навигаци (FR-6.5, AC-89, DD-AURA-015):
 * <ul>
 *   <li>`GET /messages/search` — `lower(text) LIKE` (pg_trgm GIN), шинээс хуучин руу, тохирлын `[start, end]`
 *       тодруулгатай. Устгасан ба хугацаа нь дууссан мессеж хэзээ ч гарахгүй (INV-05, AC-30)</li>
 *   <li>`GET /messages/jump?date` — хосын бүсийн тэр өдрийн эхний мессеж төвтэй хуудас; тэр өдөр мессежгүй бол
 *       дараагийн хамгийн ойрын мессеж, түүнээс хойш ч байхгүй бол хамгийн сүүлийнх</li>
 *   <li>`GET /messages/media?kind` — S-44 медиа, файл, дуу, холбоос (cursor = дотоод `seq`)</li>
 * </ul>
 */
@Service
public class ChatSearchService {

    public static final int DEFAULT_LIMIT = 20;
    public static final int MAX_LIMIT = 50;

    /** Холбоос гэж үзэх бичвэр (S-44 «Холбоос»). */
    static final String LINK_PATTERN = "https?://";

    private final NamedParameterJdbcTemplate jdbc;
    private final ChatMessageAssembler assembler;
    private final ChatMessageService messages;
    private final TimeProvider time;

    public ChatSearchService(NamedParameterJdbcTemplate jdbc, ChatMessageAssembler assembler, ChatMessageService messages,
                             TimeProvider time) {
        this.jdbc = jdbc;
        this.assembler = assembler;
        this.messages = messages;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public MessageSearchPage search(SpaceContext ctx, String q, String cursor, Integer limit) {
        String needle = q == null ? "" : q.strip().toLowerCase(Locale.ROOT);
        if (needle.isEmpty()) {
            throw ApiException.validation("q", ErrorCode.VALIDATION_FAILED);
        }
        int size = size(limit);
        MapSqlParameterSource p = visible(ctx).addValue("q", "%" + likeEscape(needle) + "%").addValue("limit", size + 1)
                .addValue("seq", seqCursor(cursor));
        List<Row> rows = jdbc.query("SELECT " + ChatMessageAssembler.COLUMNS + " FROM chat_message m WHERE "
                        + VISIBLE + " AND m.text IS NOT NULL AND lower(m.text) LIKE :q AND m.seq < :seq "
                        + "ORDER BY m.seq DESC LIMIT :limit",
                p, (rs, i) -> ChatMessageAssembler.map(rs));
        boolean more = rows.size() > size;
        List<Row> page = more ? rows.subList(0, size) : rows;
        List<Message> views = assembler.messages(page, ctx.userId());
        List<MessageSearchPageItemsInner> items = new ArrayList<>(views.size());
        for (int i = 0; i < page.size(); i++) {
            items.add(new MessageSearchPageItemsInner(views.get(i), highlights(page.get(i).text(), needle)));
        }
        return new MessageSearchPage(items, more ? Long.toString(page.get(page.size() - 1).seq()) : null);
    }

    /**
     * Бичвэр доторх `needle`-ийн бүх тохирол (давхцалгүй) `[start, end)` — UTF-16 индекс тул JS-ийн `slice`-тай
     * шууд таарна. Жижиг үсэг болгоход урт өөрчлөгддөг ховор тэмдэгттэй бол тодруулгагүй үлдэнэ.
     */
    static List<List<Integer>> highlights(String text, String needle) {
        List<List<Integer>> out = new ArrayList<>();
        if (text == null || needle.isEmpty()) {
            return out;
        }
        String lower = text.toLowerCase(Locale.ROOT);
        if (lower.length() != text.length()) {
            return out;
        }
        int from = 0;
        for (;;) {
            int at = lower.indexOf(needle, from);
            if (at < 0) {
                return out;
            }
            out.add(List.of(at, at + needle.length()));
            from = at + needle.length();
        }
    }

    /** Огноо руу үсрэх (AC-89): хосын timezone-ий тэр өдрийн 00:00-ээс хойших эхний мессеж төвтэй. */
    @Transactional(readOnly = true)
    public MessagePage jump(SpaceContext ctx, LocalDate date) {
        ZoneId zone = spaceZone(ctx);
        Instant dayStart = date.atStartOfDay(zone).toInstant();
        MapSqlParameterSource p = visible(ctx).addValue("from", Timestamp.from(dayStart));
        List<Row> anchor = jdbc.query("SELECT " + ChatMessageAssembler.COLUMNS + " FROM chat_message m WHERE " + VISIBLE
                        + " AND m.created_at >= :from ORDER BY m.created_at, m.seq LIMIT 1",
                p, (rs, i) -> ChatMessageAssembler.map(rs));
        if (anchor.isEmpty()) {
            anchor = jdbc.query("SELECT " + ChatMessageAssembler.COLUMNS + " FROM chat_message m WHERE " + VISIBLE
                    + " ORDER BY m.seq DESC LIMIT 1", p, (rs, i) -> ChatMessageAssembler.map(rs));
        }
        if (anchor.isEmpty()) {
            return new MessagePage(new ArrayList<>(), false, false);
        }
        return messages.around(ctx, anchor.get(0), ChatMessageService.DEFAULT_LIMIT);
    }

    /** S-44: төрлөөр (IMAGE, FILE, VOICE, LINK) шинээс хуучин руу; төрөлгүй бол бүх медиа ба холбоос. */
    @Transactional(readOnly = true)
    public MessagePage media(SpaceContext ctx, String kind, String cursor, Integer limit) {
        int size = size(limit);
        String filter = switch (kind == null ? "" : kind) {
            case "IMAGE" -> "m.kind = 'IMAGE'";
            case "FILE" -> "m.kind = 'FILE'";
            case "VOICE" -> "m.kind = 'VOICE'";
            case "LINK" -> "m.kind = 'TEXT' AND m.text ~* :link";
            case "" -> "(m.kind IN ('IMAGE', 'FILE', 'VOICE') OR (m.kind = 'TEXT' AND m.text ~* :link))";
            default -> throw ApiException.validation("kind", ErrorCode.VALIDATION_FAILED);
        };
        MapSqlParameterSource p = visible(ctx).addValue("link", LINK_PATTERN).addValue("limit", size + 1)
                .addValue("seq", seqCursor(cursor));
        List<Row> rows = jdbc.query("SELECT " + ChatMessageAssembler.COLUMNS + " FROM chat_message m WHERE " + VISIBLE
                        + " AND " + filter + " AND m.seq < :seq ORDER BY m.seq DESC LIMIT :limit",
                p, (rs, i) -> ChatMessageAssembler.map(rs));
        boolean more = rows.size() > size;
        List<Row> page = more ? rows.subList(0, size) : rows;
        MessagePage out = new MessagePage(new ArrayList<>(assembler.messages(page, ctx.userId())), more, false);
        out.nextCursor(more ? Long.toString(page.get(page.size() - 1).seq()) : null);
        return out;
    }

    /** Space-ийн харагдах (устгаагүй, хугацаа нь дуусаагүй) мессеж — INV-05. */
    private static final String VISIBLE = "m.space_id = :space AND m.deleted_at IS NULL "
            + "AND (m.expires_at IS NULL OR m.expires_at > :now)";

    private MapSqlParameterSource visible(SpaceContext ctx) {
        return new MapSqlParameterSource("space", ctx.spaceId()).addValue("now", Timestamp.from(time.now()));
    }

    private ZoneId spaceZone(SpaceContext ctx) {
        List<String> tz = jdbc.queryForList("SELECT timezone FROM space WHERE id = :s",
                new MapSqlParameterSource("s", ctx.spaceId()), String.class);
        try {
            return tz.isEmpty() || tz.get(0) == null ? ZoneId.of("Asia/Ulaanbaatar") : ZoneId.of(tz.get(0));
        } catch (java.time.DateTimeException e) {
            return ZoneId.of("Asia/Ulaanbaatar");
        }
    }

    private static long seqCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return Long.MAX_VALUE;
        }
        try {
            return Long.parseLong(cursor.strip());
        } catch (NumberFormatException e) {
            throw ApiException.validation("cursor", ErrorCode.VALIDATION_FAILED);
        }
    }

    private static int size(Integer limit) {
        return limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(MAX_LIMIT, limit));
    }

    private static String likeEscape(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
