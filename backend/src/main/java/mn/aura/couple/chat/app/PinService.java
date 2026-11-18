package mn.aura.couple.chat.app;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.Message;
import mn.aura.couple.chat.app.ChatMessageAssembler.Row;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Мессеж pin хийх (FR-6.7, AC-90). Тэнцүү эрх (INV-03): хэн ч pin хийж, хэн ч хасна — хамтрагчийн pin-ийг ч.
 * Устгасан/дууссан мессежийн pin нь `erase`-ээр арилна. Хоёр талд `chat.pinned {messageId, pinned}`.
 */
@Service
public class PinService {

    private final NamedParameterJdbcTemplate jdbc;
    private final ChatMessageService messages;
    private final ChatMessageAssembler assembler;
    private final CoupleMembers couples;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public PinService(NamedParameterJdbcTemplate jdbc, ChatMessageService messages, ChatMessageAssembler assembler,
                      CoupleMembers couples, ApplicationEventPublisher events, TimeProvider time) {
        this.jdbc = jdbc;
        this.messages = messages;
        this.assembler = assembler;
        this.couples = couples;
        this.events = events;
        this.time = time;
    }

    /** Давтан pin хийвэл анхны цаг хэвээр (idempotent). */
    @Transactional
    public void pin(SpaceContext ctx, UUID messageId) {
        Row row = messages.live(ctx, messageId);
        int changed = jdbc.update("UPDATE chat_message SET pinned_at = :now, pinned_by = :me WHERE id = :id AND pinned_at IS NULL",
                new MapSqlParameterSource("now", Timestamp.from(time.now())).addValue("me", ctx.userId())
                        .addValue("id", row.id()));
        if (changed > 0) {
            publish(ctx, messageId, true);
        }
    }

    @Transactional
    public void unpin(SpaceContext ctx, UUID messageId) {
        Row row = messages.inSpace(ctx.spaceId(), messageId);
        int changed = jdbc.update("UPDATE chat_message SET pinned_at = NULL, pinned_by = NULL WHERE id = :id AND pinned_at IS NOT NULL",
                new MapSqlParameterSource("id", row.id()));
        if (changed > 0) {
            publish(ctx, messageId, false);
        }
    }

    /** S-42: сүүлд pin хийснээс эхлэн; устгасан, дууссан мессеж орохгүй. */
    @Transactional(readOnly = true)
    public List<Message> pinned(SpaceContext ctx) {
        List<Row> rows = jdbc.query("SELECT " + ChatMessageAssembler.COLUMNS + " FROM chat_message m WHERE m.space_id = :space "
                        + "AND m.pinned_at IS NOT NULL AND m.deleted_at IS NULL AND (m.expires_at IS NULL OR m.expires_at > :now) "
                        + "ORDER BY m.pinned_at DESC, m.seq DESC",
                new MapSqlParameterSource("space", ctx.spaceId()).addValue("now", Timestamp.from(time.now())),
                (rs, i) -> ChatMessageAssembler.map(rs));
        return new ArrayList<>(assembler.messages(rows, ctx.userId()));
    }

    private void publish(SpaceContext ctx, UUID messageId, boolean pinned) {
        events.publishEvent(RealtimeEvent.of("chat.pinned", ctx.userId(), couples.members(ctx.spaceId()),
                Map.of("messageId", messageId, "pinned", pinned)));
    }
}
