package mn.aura.couple.chat.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import mn.aura.couple.api.model.MediaRef;
import mn.aura.couple.api.model.Message;
import mn.aura.couple.api.model.MessageKind;
import mn.aura.couple.api.model.MessageQuote;
import mn.aura.couple.api.model.NullablePlace;
import mn.aura.couple.api.model.Place;
import mn.aura.couple.api.model.ReactionEmoji;
import mn.aura.couple.api.model.ReactionSummary;
import mn.aura.couple.api.model.UserRef;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.media.app.MediaRefs;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * `chat_message` мөрөөс гэрээний `Message` (INV-05): устгасан эсвэл хугацаа нь дууссан мессежийн `text`,
 * `media`, `location` хэзээ ч гарахгүй. Жагсаалтын медиа, хэрэглэгч, ишлэл, реакцыг нэг удаагийн хайлтаар
 * авна (N+1-гүй). Реакцын `mine` нь харж буй хүнээс хамаарна.
 */
@Component
public class ChatMessageAssembler {

    /** Ишлэлийн товчилсон бичвэрийн урт. */
    static final int QUOTE_MAX = 160;

    static final String COLUMNS = """
            m.id, m.seq, m.space_id, m.sender_id, m.client_message_id, m.kind, m.text, m.media_id,
            m.location::text AS location, m.reply_to_id, m.edited_at, m.deleted_at, m.disappear_seconds, m.expires_at,
            m.delivered_at, m.read_at, m.pinned_at, m.created_at
            """;

    /** Нэг мессежийн мөр (дотоод). */
    public record Row(UUID id, long seq, UUID spaceId, UUID senderId, UUID clientMessageId, String kind, String text,
                      UUID mediaId, String location, UUID replyToId, Instant editedAt, Instant deletedAt,
                      Integer disappearSeconds, Instant expiresAt, Instant deliveredAt, Instant readAt, Instant pinnedAt,
                      Instant createdAt) {

        /** Устгагдсан эсвэл хугацаа нь дууссан (INV-05). */
        public boolean gone(Instant now) {
            return deletedAt != null || expired(now);
        }

        /** Алга болдог мессежийн хугацаа дууссан — хоёр талаас ба серверээс алга (AC-92). */
        public boolean expired(Instant now) {
            return expiresAt != null && !expiresAt.isAfter(now);
        }
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final UserRefs users;
    private final MediaRefs media;
    private final ObjectMapper mapper;
    private final TimeProvider time;

    public ChatMessageAssembler(NamedParameterJdbcTemplate jdbc, UserRefs users, MediaRefs media, ObjectMapper mapper,
                                TimeProvider time) {
        this.jdbc = jdbc;
        this.users = users;
        this.media = media;
        this.mapper = mapper;
        this.time = time;
    }

    static Row map(ResultSet rs) throws SQLException {
        Object disappear = rs.getObject("disappear_seconds");
        return new Row(rs.getObject("id", UUID.class), rs.getLong("seq"), rs.getObject("space_id", UUID.class),
                rs.getObject("sender_id", UUID.class), rs.getObject("client_message_id", UUID.class), rs.getString("kind"),
                rs.getString("text"), rs.getObject("media_id", UUID.class), rs.getString("location"),
                rs.getObject("reply_to_id", UUID.class), instant(rs, "edited_at"), instant(rs, "deleted_at"),
                disappear == null ? null : ((Number) disappear).intValue(), instant(rs, "expires_at"),
                instant(rs, "delivered_at"), instant(rs, "read_at"), instant(rs, "pinned_at"), instant(rs, "created_at"));
    }

    /** Space доторх мөрүүдийг ID-аар (дараалал хадгалагдахгүй). */
    public Map<UUID, Row> rows(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Row> out = new HashMap<>();
        jdbc.query("SELECT " + COLUMNS + " FROM chat_message m WHERE m.id IN (:ids)", new MapSqlParameterSource("ids", ids),
                rs -> {
                    Row r = map(rs);
                    out.put(r.id(), r);
                });
        return out;
    }

    public Message message(Row row, UUID viewer) {
        return messages(List.of(row), viewer).get(0);
    }

    /** Мөрүүдийг ижил дарааллаар нь `Message` болгоно. */
    public List<Message> messages(List<Row> rows, UUID viewer) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Instant now = time.now();
        List<UUID> ids = rows.stream().map(Row::id).toList();
        Map<UUID, UserRef> senders = users.refs(rows.stream().map(Row::senderId).distinct().toList());
        Map<UUID, MediaRef> medias = media.findAll(rows.stream().filter(r -> !r.gone(now)).map(Row::mediaId)
                .filter(Objects::nonNull).distinct().toList());
        Map<UUID, Row> quoted = rows(rows.stream().map(Row::replyToId).filter(Objects::nonNull).distinct().toList());
        Map<UUID, List<ReactionSummary>> reactions = reactions(ids, viewer);
        List<Message> out = new ArrayList<>(rows.size());
        for (Row r : rows) {
            boolean gone = r.gone(now);
            Message m = new Message(r.id(), r.clientMessageId(), senders.get(r.senderId()), MessageKind.fromValue(r.kind()),
                    status(r), gone, gone ? new ArrayList<>() : reactions.getOrDefault(r.id(),
                    new ArrayList<>()), utc(r.createdAt()));
            if (!gone) {
                m.text(r.text());
                m.media(r.mediaId() == null ? null : media.nullable(medias.get(r.mediaId())));
                m.location(place(r.location()));
            }
            Row q = r.replyToId() == null ? null : quoted.get(r.replyToId());
            if (q != null) {
                m.replyTo(quote(q, now));
            }
            m.editedAt(utc(r.editedAt()));
            m.disappearSeconds(r.disappearSeconds() == null ? null
                    : Message.DisappearSecondsEnum.fromValue(r.disappearSeconds()));
            m.expiresAt(utc(r.expiresAt()));
            m.pinnedAt(gone ? null : utc(r.pinnedAt()));
            out.add(m);
        }
        return out;
    }

    /** Мессеж бүрийн реакцын нэгтгэл (хүн тутам нэг). */
    public Map<UUID, List<ReactionSummary>> reactions(Collection<UUID> messageIds, UUID viewer) {
        if (messageIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Map<String, List<UUID>>> byMessage = new HashMap<>();
        jdbc.query("""
                SELECT target_id, emoji, user_id FROM reaction
                 WHERE target_type = 'MESSAGE' AND target_id IN (:ids) ORDER BY created_at, id
                """, new MapSqlParameterSource("ids", messageIds), rs -> {
            byMessage.computeIfAbsent(rs.getObject("target_id", UUID.class), k -> new LinkedHashMap<>())
                    .computeIfAbsent(rs.getString("emoji"), k -> new ArrayList<>()).add(rs.getObject("user_id", UUID.class));
        });
        Map<UUID, List<ReactionSummary>> out = new HashMap<>();
        byMessage.forEach((id, emojis) -> {
            List<ReactionSummary> list = new ArrayList<>();
            emojis.forEach((emoji, userIds) -> list.add(new ReactionSummary(ReactionEmoji.fromValue(emoji), userIds.size(),
                    userIds, userIds.contains(viewer))));
            out.put(id, list);
        });
        return out;
    }

    public List<ReactionSummary> reactions(UUID messageId, UUID viewer) {
        return reactions(List.of(messageId), viewer).getOrDefault(messageId, new ArrayList<>());
    }

    /** `Place` → jsonb. */
    public String locationJson(Place place) {
        if (place == null) {
            return null;
        }
        try {
            return mapper.writeValueAsString(place);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private NullablePlace place(String json) {
        if (json == null) {
            return null;
        }
        try {
            return mapper.readValue(json, NullablePlace.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("chat_message.location задлах боломжгүй", e);
        }
    }

    private static MessageQuote quote(Row q, Instant now) {
        boolean gone = q.gone(now);
        MessageQuote quote = new MessageQuote(q.id(), q.senderId(), MessageKind.fromValue(q.kind()), gone);
        if (!gone && q.text() != null) {
            String t = q.text();
            quote.text(t.length() > QUOTE_MAX ? t.substring(0, QUOTE_MAX - 1) + "…" : t);
        }
        return quote;
    }

    static Message.StatusEnum status(Row r) {
        if (r.readAt() != null) {
            return Message.StatusEnum.READ;
        }
        return r.deliveredAt() != null ? Message.StatusEnum.DELIVERED : Message.StatusEnum.SENT;
    }

    static OffsetDateTime utc(Instant i) {
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
