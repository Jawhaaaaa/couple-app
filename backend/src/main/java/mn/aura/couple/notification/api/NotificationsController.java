package mn.aura.couple.notification.api;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import mn.aura.couple.api.NotificationsApi;
import mn.aura.couple.api.model.NotificationPage;
import mn.aura.couple.api.model.NotificationSettings;
import mn.aura.couple.api.model.QuietModeRequest;
import mn.aura.couple.api.model.QuietModeState;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.notification.app.NotificationPreferenceService;
import mn.aura.couple.notification.app.NotificationService;
import mn.aura.couple.notification.app.QuietModeService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Notifications` tag — апп доторх жагсаалт, тохиргоо, «Түр тайван байх». */
@RestController
public class NotificationsController implements NotificationsApi {

    private final NotificationService notifications;
    private final NotificationPreferenceService preferences;
    private final QuietModeService quiet;

    public NotificationsController(NotificationService notifications, NotificationPreferenceService preferences,
                                   QuietModeService quiet) {
        this.notifications = notifications;
        this.preferences = preferences;
        this.quiet = quiet;
    }

    @Override
    public ResponseEntity<NotificationPage> listNotifications(String cursor, Integer limit) {
        return ResponseEntity.ok(notifications.list(me(), cursor, limit));
    }

    @Override
    public ResponseEntity<Void> markNotificationRead(UUID notificationId) {
        notifications.markRead(me(), notificationId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> markAllNotificationsRead() {
        notifications.markAllRead(me());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<NotificationSettings> getNotificationSettings() {
        return ResponseEntity.ok(preferences.get(me()));
    }

    @Override
    public ResponseEntity<NotificationSettings> putNotificationSettings(NotificationSettings body) {
        return ResponseEntity.ok(preferences.put(me(), body));
    }

    @Override
    public ResponseEntity<QuietModeState> enableQuietMode(QuietModeRequest body) {
        var until = quiet.enable(me(), body.getDurationMinutes());
        return ResponseEntity.ok(new QuietModeState(OffsetDateTime.ofInstant(until, ZoneOffset.UTC)));
    }

    @Override
    public ResponseEntity<Void> disableQuietMode() {
        quiet.disable(me());
        return ResponseEntity.noContent().build();
    }

    private static UUID me() {
        return SpaceAccessGuard.currentUserId();
    }
}
