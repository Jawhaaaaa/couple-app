package mn.aura.couple.chat.app;

import java.sql.Timestamp;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import mn.aura.couple.chat.app.ChatMessageAssembler.Row;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.UserRefs;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Алга болдог мессежийн тохиргоо ба дэлгэцийн зургийн мэдэгдэл (FR-6.9, AC-92, S-46):
 * <ul>
 *   <li>`PUT /chat/settings` — хосын анхдагч хугацаа (0 = унтраастай); мессеж бүр өөрөө `disappearSeconds`-ээр
 *       дарж болно. Өмнө илгээсэн мессежид нөлөөлөхгүй.</li>
 *   <li>`POST /messages/{id}/screenshot` — хүлээн авагчийн апп дэлгэцийн зураг илрүүлбэл (iOS) илгээгчид нэг удаа
 *       мэдэгдэнэ. Вэб хувилбарт илрүүлэлт байхгүй (GAP-12).</li>
 * </ul>
 */
@Service
public class DisappearingSettingsService {

    static final Set<Integer> ALLOWED = Set.of(0, 60, 3600, 86400);

    private final NamedParameterJdbcTemplate jdbc;
    private final ChatMessageService messages;
    private final UserRefs users;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public DisappearingSettingsService(NamedParameterJdbcTemplate jdbc, ChatMessageService messages, UserRefs users,
                                       ApplicationEventPublisher events, TimeProvider time) {
        this.jdbc = jdbc;
        this.messages = messages;
        this.users = users;
        this.events = events;
        this.time = time;
    }

    @Transactional
    public int update(SpaceContext ctx, Integer seconds) {
        if (seconds == null || !ALLOWED.contains(seconds)) {
            throw ApiException.validation("disappearSeconds", ErrorCode.VALIDATION_FAILED);
        }
        jdbc.update("UPDATE space SET chat_disappear_seconds = :v WHERE id = :s",
                new MapSqlParameterSource("v", seconds == 0 ? null : seconds).addValue("s", ctx.spaceId()));
        return seconds;
    }

    /** Хамтрагчийн мессежийн зургийг авсан — илгээгчид нэг удаа (давтан дуудлага 204, дахин мэдэгдэхгүй). */
    @Transactional
    public void screenshot(SpaceContext ctx, UUID messageId) {
        Row row = messages.live(ctx, messageId);
        if (row.senderId().equals(ctx.userId())) {
            return; // өөрийн мессежийн зураг — мэдэгдэх хүн алга
        }
        int marked = jdbc.update("UPDATE chat_message SET screenshot_at = :now WHERE id = :id AND screenshot_at IS NULL",
                new MapSqlParameterSource("now", Timestamp.from(time.now())).addValue("id", messageId));
        if (marked == 1) {
            events.publishEvent(new Notify(row.senderId(), ctx.spaceId(), ctx.userId(), "SCREENSHOT_TAKEN",
                    Map.of("partner", users.ref(ctx.userId()).getDisplayName()), "/chat?around=" + messageId));
        }
    }
}
