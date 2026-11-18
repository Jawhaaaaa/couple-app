package mn.aura.couple.notification.api;

import java.time.OffsetDateTime;
import java.util.List;
import mn.aura.couple.api.RemindersApi;
import mn.aura.couple.api.model.Reminder;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.notification.app.ReminderScheduler;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Reminders` tag (T-68, DD-AURA-023, AC-180) — native `LocalNotificationScheduler`-ийн эх. */
@RestController
public class RemindersController implements RemindersApi {

    private final ReminderScheduler reminders;

    public RemindersController(ReminderScheduler reminders) {
        this.reminders = reminders;
    }

    @Override
    public ResponseEntity<List<Reminder>> listReminders(OffsetDateTime from, OffsetDateTime to) {
        return ResponseEntity.ok(reminders.list(SpaceAccessGuard.currentUserId(), from, to));
    }
}
