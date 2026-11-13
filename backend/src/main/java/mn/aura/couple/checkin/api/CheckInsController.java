package mn.aura.couple.checkin.api;

import java.time.LocalDate;
import mn.aura.couple.api.CheckInsApi;
import mn.aura.couple.api.model.CheckIn;
import mn.aura.couple.api.model.CheckInInput;
import mn.aura.couple.api.model.CheckInSeries;
import mn.aura.couple.checkin.app.CheckInService;
import mn.aura.couple.common.space.SpaceAccessGuard;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `CheckIns` tag (T-63, FR-11.1…11.3). */
@RestController
public class CheckInsController implements CheckInsApi {

    private final SpaceAccessGuard guard;
    private final CheckInService checkIns;

    public CheckInsController(SpaceAccessGuard guard, CheckInService checkIns) {
        this.guard = guard;
        this.checkIns = checkIns;
    }

    @Override
    public ResponseEntity<CheckInSeries> listCheckIns(LocalDate from, LocalDate to) {
        return ResponseEntity.ok(checkIns.list(guard.current(), from, to));
    }

    @Override
    public ResponseEntity<CheckIn> putTodayCheckIn(CheckInInput body) {
        return ResponseEntity.ok(checkIns.putToday(guard.requireWritable(), body));
    }

    @Override
    public ResponseEntity<CheckIn> updateCheckIn(LocalDate localDate, CheckInInput body) {
        return ResponseEntity.ok(checkIns.update(guard.requireWritable(), localDate, body));
    }
}
