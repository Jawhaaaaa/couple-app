package mn.aura.couple.media.api;

import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;
import mn.aura.couple.api.MediaApi;
import mn.aura.couple.api.UploadsApi;
import mn.aura.couple.api.model.MediaRef;
import mn.aura.couple.api.model.StorageUsage;
import mn.aura.couple.api.model.UploadCreate;
import mn.aura.couple.api.model.UploadSession;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.media.app.MediaRefs;
import mn.aura.couple.media.app.StorageQuota;
import mn.aura.couple.media.app.UploadSessionService;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.RestController;

/**
 * Гэрээний `Uploads` ба `Media` tag (T-33). Профайлын зураг SOLO space-д хадгалагдана — хос тасарч
 * устахад (INV-16) алга болохгүй; бусад зорилго нь идэвхтэй space-д. Бичих үйлдэл тасалж буй хосод 423.
 */
@RestController
public class MediaController implements UploadsApi, MediaApi {

    private final SpaceAccessGuard guard;
    private final UploadSessionService uploads;
    private final MediaRefs refs;
    private final StorageQuota quota;
    private final JdbcTemplate jdbc;

    public MediaController(SpaceAccessGuard guard, UploadSessionService uploads, MediaRefs refs, StorageQuota quota,
                           JdbcTemplate jdbc) {
        this.guard = guard;
        this.uploads = uploads;
        this.refs = refs;
        this.quota = quota;
        this.jdbc = jdbc;
    }

    @Override
    public ResponseEntity<UploadSession> createUpload(UploadCreate body) {
        UUID user = SpaceAccessGuard.currentUserId();
        UUID spaceId;
        if (body.getPurpose() == UploadCreate.PurposeEnum.AVATAR) {
            spaceId = jdbc.queryForList("SELECT space_id FROM space_member WHERE user_id = ? AND space_kind = 'SOLO' "
                    + "AND left_at IS NULL", UUID.class, user).stream().findFirst().orElseThrow(ApiException::notFound);
        } else {
            spaceId = guard.requireWritable().spaceId();
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(uploads.create(user, spaceId, body));
    }

    @Override
    public ResponseEntity<UploadSession> getUpload(UUID uploadId) {
        return ResponseEntity.ok(uploads.get(SpaceAccessGuard.currentUserId(), uploadId));
    }

    @Override
    public ResponseEntity<UploadSession> uploadChunk(UUID uploadId, Integer index, Resource body) {
        byte[] bytes;
        try (InputStream in = body.getInputStream()) {
            bytes = in.readNBytes(UploadSessionService.CHUNK_SIZE + 1);
        } catch (IOException e) {
            throw ApiException.validation("body", ErrorCode.VALIDATION_FAILED);
        }
        return ResponseEntity.ok(uploads.putChunk(SpaceAccessGuard.currentUserId(), uploadId, index, bytes));
    }

    @Override
    public ResponseEntity<MediaRef> completeUpload(UUID uploadId) {
        return ResponseEntity.ok(uploads.complete(SpaceAccessGuard.currentUserId(), uploadId));
    }

    @Override
    public ResponseEntity<Void> abortUpload(UUID uploadId) {
        uploads.cancel(SpaceAccessGuard.currentUserId(), uploadId);
        return ResponseEntity.noContent().build();
    }

    /** Шинэ 15 минутын URL (DD-AURA-013). Өөр space-ийнх эсвэл өөрийн SOLO-гийн биш → 404. */
    @Override
    public ResponseEntity<MediaRef> getMedia(UUID mediaId) {
        SpaceContext ctx = guard.current();
        UUID user = ctx.userId();
        boolean visible = !jdbc.queryForList("""
                SELECT 1 FROM media m JOIN space_member sm ON sm.space_id = m.space_id AND sm.user_id = ? AND sm.left_at IS NULL
                 WHERE m.id = ?
                UNION ALL
                SELECT 1 FROM users u JOIN space_member sm ON sm.user_id = u.id AND sm.space_id = ? AND sm.left_at IS NULL
                 WHERE u.avatar_media_id = ?
                """, Integer.class, user, mediaId, ctx.spaceId(), mediaId).isEmpty();
        if (!visible) {
            throw ApiException.notFound();
        }
        return ResponseEntity.ok(refs.find(mediaId).orElseThrow(ApiException::notFound));
    }

    @Override
    public ResponseEntity<StorageUsage> getStorageUsage() {
        StorageQuota.Usage u = quota.usage(guard.current().spaceId());
        return ResponseEntity.ok(new StorageUsage(u.usedBytes(), u.quotaBytes(), java.math.BigDecimal.valueOf(u.ratio()),
                u.warning()));
    }
}
