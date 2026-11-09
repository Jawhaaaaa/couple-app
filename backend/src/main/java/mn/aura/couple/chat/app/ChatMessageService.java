package mn.aura.couple.chat.app;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.MediaRef;
import mn.aura.couple.api.model.Message;
import mn.aura.couple.api.model.MessageCreate;
import mn.aura.couple.api.model.MessageKind;
import mn.aura.couple.api.model.MessagePage;
import mn.aura.couple.api.model.ReactionSummary;
import mn.aura.couple.chat.app.ChatMessageAssembler.Row;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.media.app.MediaRefs;
import mn.aura.couple.realtime.app.PresenceService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Хосын чат (FR-6.1…6.4, FR-6.6, DD-AURA-008, DD-AURA-017):
 * <ul>
 *   <li>Текст, зураг, дуу, файл (≤ 50 MB, хориотой төрөл — upload-ын `MediaInspector`), байршил (AC-87)</li>
 *   <li>`clientMessageId` idempotent — outbox давтан илгээвэл 200 + анхны мессеж, давхардалгүй (AC-28)</li>
 *   <li>Төлөв SENT → DELIVERED (`/app/chat.delivered`) → READ (`POST /messages/read`), илгээгчид
 *       `chat.receipt` (AC-29, AC-176); «илгээгдэж байна» нь client-ийн outbox-ын төлөв</li>
 *   <li>Reply, реакц, засах/устгах — зөвхөн өөрийнхийг (INV-03, AC-88); устгахад агуулга NULL, медиа устна
 *       (INV-05, AC-30)</li>
 *   <li>Хуудаслалт `before`/`after`/`around` — дотоод `seq`-ээр (илгээсэн дараалал)</li>
 *   <li>Push-д мессежийн агуулга огт орохгүй — зөвхөн хамтрагчийн нэр (NFR-06, INV-05)</li>
 * </ul>
 * «Бичиж байна» нь тэгш (INV-06, AC-177) — `PresenceService.typing`.
 */
@Service
public class ChatMessageService {

    public static final int DEFAULT_LIMIT = 30;
    public static final int MAX_LIMIT = 100;
    public static final long FILE_MAX_BYTES = 50L * 1024 * 1024;

    /** Илгээлтийн үр дүн: шинэ (201) эсвэл outbox-оос давтан ирсэн (200). */
    public record Sent(Message message, boolean created) {
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final ChatMessageAssembler assembler;
    private final ChatMediaCleaner mediaCleaner;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final MediaRefs media;
    private final PresenceService presence;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public ChatMessageService(NamedParameterJdbcTemplate jdbc, ChatMessageAssembler assembler,
                              ChatMediaCleaner mediaCleaner, CoupleMembers couples, UserRefs users, MediaRefs media,
                              PresenceService presence, ApplicationEventPublisher events, TimeProvider time) {
        this.jdbc = jdbc;
        this.assembler = assembler;
        this.mediaCleaner = mediaCleaner;
        this.couples = couples;
        this.users = users;
        this.media = media;
        this.presence = presence;
        this.events = events;
        this.time = time;
    }

    // --- Илгээх ---

    @Transactional
    public Sent send(SpaceContext ctx, MessageCreate in) {
        Optional<Row> existing = byClientId(ctx.userId(), in.getClientMessageId());
        if (existing.isPresent()) {
            return new Sent(assembler.message(existing.get(), ctx.userId()), false);
        }
        MessageKind kind = in.getKind();
        String text = in.getText() == null || in.getText().isBlank() ? null : in.getText().strip();
        UUID mediaId = null;
        String location = null;
        switch (kind) {
            case TEXT -> {
                if (text == null) {
                    throw ApiException.validation("text", ErrorCode.VALIDATION_FAILED);
                }
            }
            case IMAGE, VOICE, FILE -> mediaId = requireMedia(ctx, kind, in.getMediaId());
            case LOCATION -> {
                if (in.getLocation() == null) {
                    throw ApiException.validation("location", ErrorCode.VALIDATION_FAILED);
                }
                location = assembler.locationJson(in.getLocation());
            }
            case HEART -> {
                // «Хайртай» — текстгүй ч болно
            }
        }
        UUID replyTo = null;
        if (in.getReplyToId() != null) {
            Row target = live(ctx, in.getReplyToId());
            replyTo = target.id();
        }
        Integer disappear = in.getDisappearSeconds() != null ? in.getDisappearSeconds().getValue()
                : spaceDisappearSeconds(ctx.spaceId());
        UUID id = Ids.newId();
        Instant now = time.now();
        int inserted = jdbc.update("""
                INSERT INTO chat_message (id, space_id, sender_id, client_message_id, kind, text, media_id, location,
                                          reply_to_id, disappear_seconds, created_at)
                VALUES (:id, :space, :sender, :client, :kind, :text, :media, CAST(:location AS jsonb), :reply, :disappear, :now)
                ON CONFLICT (sender_id, client_message_id) DO NOTHING
                """, new MapSqlParameterSource("id", id).addValue("space", ctx.spaceId()).addValue("sender", ctx.userId())
                .addValue("client", in.getClientMessageId()).addValue("kind", kind.getValue()).addValue("text", text)
                .addValue("media", mediaId).addValue("location", location).addValue("reply", replyTo)
                .addValue("disappear", disappear).addValue("now", Timestamp.from(now)));
        if (inserted == 0) {
            // Зэрэг ирсэн давхар хүсэлт — нөгөө нь түрүүлж бичжээ
            Row first = byClientId(ctx.userId(), in.getClientMessageId()).orElseThrow(ApiException::notFound);
            return new Sent(assembler.message(first, ctx.userId()), false);
        }
        Row row = load(id);
        publish("chat.message.created", ctx, row);
        couples.partnerIn(ctx.spaceId(), ctx.userId()).ifPresent(partner -> {
            if (!presence.isOnline(partner)) {
                // NFR-06, INV-05: push-д агуулга биш, зөвхөн нэр
                events.publishEvent(new Notify(partner, ctx.spaceId(), ctx.userId(), "MESSAGE_NEW",
                        Map.of("partner", users.ref(ctx.userId()).getDisplayName()), "/chat"));
            }
        });
        return new Sent(assembler.message(row, ctx.userId()), true);
    }

    /** Мессежийн төрөлд тохирох, энэ space-д илгээгчийн upload хийсэн медиа (AC-87). */
    private UUID requireMedia(SpaceContext ctx, MessageKind kind, UUID mediaId) {
        if (mediaId == null) {
            throw ApiException.validation("mediaId", ErrorCode.VALIDATION_FAILED);
        }
        Integer own = jdbc.queryForObject("SELECT count(*) FROM media WHERE id = :id AND space_id = :space AND owner_id = :me",
                new MapSqlParameterSource("id", mediaId).addValue("space", ctx.spaceId()).addValue("me", ctx.userId()),
                Integer.class);
        if (own == null || own == 0) {
            throw ApiException.notFound();
        }
        MediaRef ref = media.find(mediaId).orElseThrow(ApiException::notFound);
        boolean allowed = switch (kind) {
            case IMAGE -> ref.getKind() == MediaRef.KindEnum.IMAGE;
            case VOICE -> ref.getKind() == MediaRef.KindEnum.AUDIO;
            default -> true; // FILE: PDF, баримт, видео (GAP-19) — хориотой төрлийг upload аль хэдийн татгалзсан
        };
        if (!allowed) {
            throw new ApiException(ErrorCode.MEDIA_TYPE_FORBIDDEN, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        }
        if (kind == MessageKind.FILE && ref.getSizeBytes() > FILE_MAX_BYTES) {
            throw new ApiException(ErrorCode.MEDIA_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, Map.of("maxBytes", FILE_MAX_BYTES));
        }
        return mediaId;
    }

    private Integer spaceDisappearSeconds(UUID spaceId) {
        List<Integer> v = jdbc.queryForList("SELECT chat_disappear_seconds FROM space WHERE id = :s",
                new MapSqlParameterSource("s", spaceId), Integer.class);
        return v.isEmpty() || v.get(0) == null || v.get(0) == 0 ? null : v.get(0);
    }

    // --- Засах, устгах (INV-03) ---

    @Transactional
    public Message edit(SpaceContext ctx, UUID messageId, String text) {
        Row row = own(ctx, messageId);
        if (row.gone(time.now())) {
            throw new ApiException(ErrorCode.MESSAGE_DELETED, HttpStatus.CONFLICT);
        }
        jdbc.update("UPDATE chat_message SET text = :text, edited_at = :now WHERE id = :id",
                new MapSqlParameterSource("text", text.strip()).addValue("now", Timestamp.from(time.now()))
                        .addValue("id", messageId));
        Row updated = load(messageId);
        publish("chat.message.updated", ctx, updated);
        return assembler.message(updated, ctx.userId());
    }

    /** Агуулга NULL, медиа серверээс устна; хоёр талд «Мессеж устгагдсан» (AC-30, AC-176). Давтан дуудвал 204. */
    @Transactional
    public void delete(SpaceContext ctx, UUID messageId) {
        Row row = own(ctx, messageId);
        if (row.deletedAt() != null) {
            return;
        }
        erase(row, time.now());
        events.publishEvent(RealtimeEvent.of("chat.message.deleted", ctx.userId(), couples.members(ctx.spaceId()),
                Map.of("messageId", messageId)));
    }

    /** INV-05: агуулга, байршил, медиа, реакц, pin-ийг арилгана (устгах ба алга болох ажил хуваалцана). */
    void erase(Row row, Instant at) {
        MapSqlParameterSource p = new MapSqlParameterSource("id", row.id()).addValue("now", Timestamp.from(at));
        jdbc.update("""
                UPDATE chat_message SET deleted_at = COALESCE(deleted_at, :now), text = NULL, media_id = NULL, location = NULL,
                       pinned_at = NULL, pinned_by = NULL
                 WHERE id = :id
                """, p);
        jdbc.update("DELETE FROM reaction WHERE target_type = 'MESSAGE' AND target_id = :id", p);
        mediaCleaner.purge(row.mediaId());
    }

    // --- Төлөв (AC-29, AC-176) ---

    /** B мессежүүдийг уншсан — хамтрагчийн `upTo` хүртэлх мессеж READ; алга болдогийн тоолуур эхэлнэ (AC-92). */
    @Transactional
    public void markRead(SpaceContext ctx, UUID upToMessageId) {
        Row anchor = inSpace(ctx.spaceId(), upToMessageId);
        Instant now = time.now();
        List<Map<String, Object>> updated = jdbc.queryForList("""
                UPDATE chat_message
                   SET read_at = :now, delivered_at = COALESCE(delivered_at, :now),
                       expires_at = CASE WHEN disappear_seconds IS NULL THEN NULL
                                         ELSE CAST(:now AS timestamptz) + disappear_seconds * interval '1 second' END
                 WHERE space_id = :space AND sender_id <> :me AND read_at IS NULL AND deleted_at IS NULL AND seq <= :seq
                RETURNING id, seq
                """, new MapSqlParameterSource("now", Timestamp.from(now)).addValue("space", ctx.spaceId())
                .addValue("me", ctx.userId()).addValue("seq", anchor.seq()));
        receipt(ctx.spaceId(), ctx.userId(), updated, "READ", now);
    }

    /** `/app/chat.delivered {upToMessageId}` — хүлээн авагчийн төхөөрөмжид хүрсэн (AC-176). */
    @Transactional
    public void markDelivered(UUID userId, UUID upToMessageId) {
        Optional<UUID> space = couples.coupleSpaceOf(userId);
        if (space.isEmpty() || upToMessageId == null) {
            return;
        }
        List<Row> anchor = jdbc.query("SELECT " + ChatMessageAssembler.COLUMNS + " FROM chat_message m WHERE m.id = :id "
                + "AND m.space_id = :space", new MapSqlParameterSource("id", upToMessageId).addValue("space", space.get()),
                (rs, i) -> ChatMessageAssembler.map(rs));
        if (anchor.isEmpty()) {
            return; // өөр хосын мессеж — чимээгүй үл тооно (INV-01)
        }
        Instant now = time.now();
        List<Map<String, Object>> updated = jdbc.queryForList("""
                UPDATE chat_message SET delivered_at = :now
                 WHERE space_id = :space AND sender_id <> :me AND delivered_at IS NULL AND deleted_at IS NULL AND seq <= :seq
                RETURNING id, seq
                """, new MapSqlParameterSource("now", Timestamp.from(now)).addValue("space", space.get())
                .addValue("me", userId).addValue("seq", anchor.get(0).seq()));
        receipt(space.get(), userId, updated, "DELIVERED", now);
    }

    private void receipt(UUID spaceId, UUID reader, List<Map<String, Object>> updated, String status, Instant at) {
        if (updated.isEmpty()) {
            return;
        }
        Map<String, Object> last = Collections.max(updated, (a, b) -> Long.compare(((Number) a.get("seq")).longValue(),
                ((Number) b.get("seq")).longValue()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("upToMessageId", last.get("id"));
        payload.put("status", status);
        payload.put("at", ChatMessageAssembler.utc(at));
        couples.partnerIn(spaceId, reader).ifPresent(sender ->
                events.publishEvent(RealtimeEvent.of("chat.receipt", reader, List.of(sender), payload)));
    }

    // --- Реакц (ANIM-07) ---

    @Transactional
    public List<ReactionSummary> react(SpaceContext ctx, UUID messageId, String emoji) {
        Row row = live(ctx, messageId);
        jdbc.update("""
                INSERT INTO reaction (id, space_id, target_type, target_id, user_id, emoji, created_at)
                VALUES (:id, :space, 'MESSAGE', :t, :u, :e, :now)
                ON CONFLICT (target_type, target_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = EXCLUDED.created_at
                """, new MapSqlParameterSource("id", Ids.newId()).addValue("space", ctx.spaceId()).addValue("t", row.id())
                .addValue("u", ctx.userId()).addValue("e", emoji).addValue("now", Timestamp.from(time.now())));
        publishReactions(ctx, messageId);
        return assembler.reactions(messageId, ctx.userId());
    }

    @Transactional
    public List<ReactionSummary> unreact(SpaceContext ctx, UUID messageId) {
        live(ctx, messageId);
        jdbc.update("DELETE FROM reaction WHERE target_type = 'MESSAGE' AND target_id = :t AND user_id = :u",
                new MapSqlParameterSource("t", messageId).addValue("u", ctx.userId()));
        publishReactions(ctx, messageId);
        return assembler.reactions(messageId, ctx.userId());
    }

    private void publishReactions(SpaceContext ctx, UUID messageId) {
        events.publishEvent(RealtimeEvent.projected("chat.reaction", ctx.userId(), couples.members(ctx.spaceId()),
                viewer -> Map.of("messageId", messageId, "reactions", assembler.reactions(messageId, viewer))));
    }

    // --- Хуудаслалт ---

    /**
     * `GET /messages`: параметргүй бол хамгийн сүүлийн `limit`; `before`/`after` — тухайн мессежээс өмнөх/хойших;
     * `around` — тухайн мессеж төвтэй (ишлэл товших, хайлтын контекст, AC-88, AC-89). Хуудас дотор хуучнаас шинэ.
     */
    @Transactional(readOnly = true)
    public MessagePage list(SpaceContext ctx, UUID before, UUID after, UUID around, Integer limit) {
        int size = limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(MAX_LIMIT, limit));
        if (around != null) {
            return around(ctx, inSpace(ctx.spaceId(), around), size);
        }
        if (after != null) {
            Row anchor = inSpace(ctx.spaceId(), after);
            List<Row> rows = window(ctx.spaceId(), "m.seq > :seq", "ASC", anchor.seq(), size + 1);
            boolean more = rows.size() > size;
            List<Row> page = more ? rows.subList(0, size) : rows;
            return page(ctx, page, exists(ctx.spaceId(), "seq < :seq", page.isEmpty() ? anchor.seq() + 1 : page.get(0).seq()),
                    more);
        }
        long from = before == null ? Long.MAX_VALUE : inSpace(ctx.spaceId(), before).seq();
        List<Row> rows = window(ctx.spaceId(), "m.seq < :seq", "DESC", from, size + 1);
        boolean more = rows.size() > size;
        List<Row> page = new ArrayList<>(more ? rows.subList(0, size) : rows);
        Collections.reverse(page);
        boolean hasAfter = before != null && exists(ctx.spaceId(), "seq > :seq",
                page.isEmpty() ? from - 1 : page.get(page.size() - 1).seq());
        return page(ctx, page, more, hasAfter);
    }

    /** `anchor` төвтэй хуудас (хайлт, огноо руу үсрэх ч ашиглана). */
    public MessagePage around(SpaceContext ctx, Row anchor, int size) {
        int half = Math.max(0, (size - 1) / 2);
        List<Row> older = new ArrayList<>(window(ctx.spaceId(), "m.seq < :seq", "DESC", anchor.seq(), half + 1));
        boolean moreBefore = older.size() > half;
        if (moreBefore) {
            older = new ArrayList<>(older.subList(0, half));
        }
        Collections.reverse(older);
        int rest = Math.max(0, size - 1 - older.size());
        List<Row> newer = window(ctx.spaceId(), "m.seq > :seq", "ASC", anchor.seq(), rest + 1);
        boolean moreAfter = newer.size() > rest;
        List<Row> page = new ArrayList<>(older);
        if (!anchor.expired(time.now())) {
            page.add(anchor); // устгасан бол «Мессеж устгагдсан» байрандаа харагдана
        }
        page.addAll(moreAfter ? newer.subList(0, rest) : newer);
        return page(ctx, page, moreBefore, moreAfter);
    }

    private MessagePage page(SpaceContext ctx, List<Row> rows, boolean moreBefore, boolean moreAfter) {
        return new MessagePage(new ArrayList<>(assembler.messages(rows, ctx.userId())), moreBefore, moreAfter);
    }

    /** Space-ийн харагдах мессежүүд — хугацаа нь дууссан алга болдог мессеж хэзээ ч гарахгүй (AC-92). */
    private List<Row> window(UUID spaceId, String cond, String dir, long seq, int limit) {
        return jdbc.query("SELECT " + ChatMessageAssembler.COLUMNS + " FROM chat_message m WHERE m.space_id = :space AND "
                        + cond + " AND (m.expires_at IS NULL OR m.expires_at > :now) ORDER BY m.seq " + dir + " LIMIT :limit",
                new MapSqlParameterSource("space", spaceId).addValue("seq", seq).addValue("limit", limit)
                        .addValue("now", Timestamp.from(time.now())),
                (rs, i) -> ChatMessageAssembler.map(rs));
    }

    private boolean exists(UUID spaceId, String cond, long seq) {
        Boolean b = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM chat_message WHERE space_id = :space AND " + cond
                        + " AND (expires_at IS NULL OR expires_at > :now))",
                new MapSqlParameterSource("space", spaceId).addValue("seq", seq).addValue("now", Timestamp.from(time.now())),
                Boolean.class);
        return Boolean.TRUE.equals(b);
    }

    /** Хамтрагчийн уншаагүй мессежийн тоо (нүүрний карт, T-66). */
    @Transactional(readOnly = true)
    public int unreadCount(UUID spaceId, UUID userId) {
        Integer n = jdbc.queryForObject("""
                SELECT count(*) FROM chat_message
                 WHERE space_id = :space AND sender_id <> :me AND read_at IS NULL AND deleted_at IS NULL
                """, new MapSqlParameterSource("space", spaceId).addValue("me", userId), Integer.class);
        return n == null ? 0 : n;
    }

    // --- Туслах ---

    /** Space доторх мессеж (өөр хосынх → 404, INV-01). */
    public Row inSpace(UUID spaceId, UUID messageId) {
        return jdbc.query("SELECT " + ChatMessageAssembler.COLUMNS + " FROM chat_message m WHERE m.id = :id AND m.space_id = :space",
                        new MapSqlParameterSource("id", messageId).addValue("space", spaceId),
                        (rs, i) -> ChatMessageAssembler.map(rs))
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }

    /** Устгаагүй, хугацаа нь дуусаагүй мессеж. */
    public Row live(SpaceContext ctx, UUID messageId) {
        Row row = inSpace(ctx.spaceId(), messageId);
        if (row.gone(time.now())) {
            throw ApiException.notFound();
        }
        return row;
    }

    private Row own(SpaceContext ctx, UUID messageId) {
        Row row = inSpace(ctx.spaceId(), messageId);
        if (row.expired(time.now())) {
            throw ApiException.notFound(); // серверээс алга болсон (AC-92)
        }
        if (!row.senderId().equals(ctx.userId())) {
            throw new ApiException(ErrorCode.NOT_OWNER, HttpStatus.FORBIDDEN);
        }
        return row;
    }

    Row load(UUID id) {
        return assembler.rows(List.of(id)).get(id);
    }

    /** Нэг мессеж `viewer`-ийн өнцгөөс (realtime payload). */
    public Message view(UUID messageId, UUID viewer) {
        return assembler.message(load(messageId), viewer);
    }

    private Optional<Row> byClientId(UUID senderId, UUID clientMessageId) {
        return jdbc.query("SELECT " + ChatMessageAssembler.COLUMNS + " FROM chat_message m WHERE m.sender_id = :s "
                        + "AND m.client_message_id = :c",
                new MapSqlParameterSource("s", senderId).addValue("c", clientMessageId),
                (rs, i) -> ChatMessageAssembler.map(rs)).stream().findFirst();
    }

    /** Хоёр гишүүнд (илгээгчийн бусад төхөөрөмж ч) — реакцын `mine` харж буй хүнээр. */
    void publish(String type, SpaceContext ctx, Row row) {
        events.publishEvent(RealtimeEvent.projected(type, ctx.userId(), couples.members(ctx.spaceId()),
                viewer -> assembler.message(row, viewer)));
    }
}
