package mn.aura.couple.admin.api;

import java.time.LocalDate;
import java.util.UUID;
import mn.aura.couple.admin.app.AdminAuthorization;
import mn.aura.couple.admin.app.AdminMetricsService;
import mn.aura.couple.api.AdminApi;
import mn.aura.couple.api.model.AdminMetrics;
import mn.aura.couple.api.model.SuspendRequest;
import mn.aura.couple.auth.app.AccountSuspensionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Admin` tag (`x-aura-scope: admin`, GAP-16): операц бүр эхлээд `AdminAuthorization`. */
@RestController
public class AdminController implements AdminApi {

    private final AdminAuthorization admins;
    private final AdminMetricsService metrics;
    private final AccountSuspensionService suspensions;

    public AdminController(AdminAuthorization admins, AdminMetricsService metrics, AccountSuspensionService suspensions) {
        this.admins = admins;
        this.metrics = metrics;
        this.suspensions = suspensions;
    }

    @Override
    public ResponseEntity<AdminMetrics> getAdminMetrics(LocalDate from, LocalDate to) {
        admins.requireAdmin();
        return ResponseEntity.ok(metrics.compute(from, to));
    }

    @Override
    public ResponseEntity<Void> suspendUser(UUID userId, SuspendRequest body) {
        UUID admin = admins.requireAdmin();
        suspensions.suspend(userId, body.getReason(), admin);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> unsuspendUser(UUID userId, SuspendRequest body) {
        UUID admin = admins.requireAdmin();
        suspensions.unsuspend(userId, body == null ? null : body.getReason(), admin);
        return ResponseEntity.noContent().build();
    }
}
