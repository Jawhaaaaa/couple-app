package mn.aura.couple.dashboard.api;

import mn.aura.couple.api.DashboardApi;
import mn.aura.couple.api.model.Dashboard;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.dashboard.app.DashboardService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Dashboard` tag (T-31, S-20). SOLO үед ч хариулна (тоолуургүй, хамтрагчийн картгүй). */
@RestController
public class DashboardController implements DashboardApi {

    private final SpaceAccessGuard guard;
    private final DashboardService dashboard;

    public DashboardController(SpaceAccessGuard guard, DashboardService dashboard) {
        this.guard = guard;
        this.dashboard = dashboard;
    }

    @Override
    public ResponseEntity<Dashboard> getDashboard(String tz) {
        return ResponseEntity.ok(dashboard.build(guard.current(), tz));
    }
}
