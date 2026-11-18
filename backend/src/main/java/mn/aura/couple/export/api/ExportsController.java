package mn.aura.couple.export.api;

import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.ExportsApi;
import mn.aura.couple.api.model.DataExport;
import mn.aura.couple.api.model.ExportRequest;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.export.app.DataExportService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Exports` tag (T-42, T-72). Тасалж буй хосод ч экспорт хийнэ (зөвхөн харах/экспорт — AC-127). */
@RestController
public class ExportsController implements ExportsApi {

    private final SpaceAccessGuard guard;
    private final DataExportService exports;

    public ExportsController(SpaceAccessGuard guard, DataExportService exports) {
        this.guard = guard;
        this.exports = exports;
    }

    @Override
    public ResponseEntity<DataExport> createExport(ExportRequest body) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(exports.request(guard.current(), body));
    }

    @Override
    public ResponseEntity<List<DataExport>> listExports() {
        return ResponseEntity.ok(exports.list(SpaceAccessGuard.currentUserId()));
    }

    @Override
    public ResponseEntity<DataExport> getExport(UUID exportId) {
        return ResponseEntity.ok(exports.get(SpaceAccessGuard.currentUserId(), exportId));
    }

    @Override
    public ResponseEntity<Void> downloadExport(UUID exportId) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(exports.downloadUrl(SpaceAccessGuard.currentUserId(), exportId)).build();
    }
}
