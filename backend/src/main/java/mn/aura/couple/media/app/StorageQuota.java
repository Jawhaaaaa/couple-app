package mn.aura.couple.media.app;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.config.AuraProperties;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Хосын хадгалах сангийн квот (NFR-11, AC-200, DD-AURA-038). Хэрэглээ нь `space.storage_bytes`;
 * хязгаар `aura.storage.quota-bytes` (10 GiB), анхааруулга `aura.storage.warn-ratio` (0.8).
 * Нөөцлөлт нь нэг атомик UPDATE — зэрэг upload квотыг давж чадахгүй.
 */
@Service
public class StorageQuota {

    public record Usage(long usedBytes, long quotaBytes, boolean warning) {
        public double ratio() {
            return quotaBytes == 0 ? 1 : (double) usedBytes / quotaBytes;
        }
    }

    private final JdbcTemplate jdbc;
    private final long quotaBytes;
    private final double warnRatio;

    public StorageQuota(JdbcTemplate jdbc, AuraProperties properties) {
        this.jdbc = jdbc;
        this.quotaBytes = properties.storage().quotaBytes();
        this.warnRatio = properties.storage().warnRatio();
    }

    public long quotaBytes() {
        return quotaBytes;
    }

    public Usage usage(UUID spaceId) {
        List<Long> used = jdbc.queryForList("SELECT storage_bytes FROM space WHERE id = ?", Long.class, spaceId);
        if (used.isEmpty()) {
            throw ApiException.notFound();
        }
        return usageOf(used.get(0));
    }

    /**
     * `bytes`-ийг нөөцөлнө. Квот хэтэрвэл 507 `STORAGE_QUOTA_EXCEEDED` (гэрээ: `InsufficientStorage`),
     * `details`-д `usedBytes`, `quotaBytes`. Буцаах утгын `warning` нь ≥ 80%.
     */
    public Usage reserve(UUID spaceId, long bytes) {
        if (bytes < 0) {
            throw new IllegalArgumentException("bytes < 0");
        }
        List<Long> updated = jdbc.queryForList("""
                UPDATE space SET storage_bytes = storage_bytes + ?
                 WHERE id = ? AND storage_bytes + ? <= ?
                RETURNING storage_bytes
                """, Long.class, bytes, spaceId, bytes, quotaBytes);
        if (!updated.isEmpty()) {
            return usageOf(updated.get(0));
        }
        Usage current = usage(spaceId);
        throw new ApiException(ErrorCode.STORAGE_QUOTA_EXCEEDED, HttpStatus.INSUFFICIENT_STORAGE,
                Map.of("usedBytes", current.usedBytes(), "quotaBytes", quotaBytes));
    }

    /** Устгасан эсвэл амжилтгүй upload-ын байтыг буцаана (0-ээс доош орохгүй). */
    public Usage release(UUID spaceId, long bytes) {
        List<Long> updated = jdbc.queryForList("""
                UPDATE space SET storage_bytes = GREATEST(0, storage_bytes - ?)
                 WHERE id = ?
                RETURNING storage_bytes
                """, Long.class, bytes, spaceId);
        if (updated.isEmpty()) {
            throw ApiException.notFound();
        }
        return usageOf(updated.get(0));
    }

    /**
     * Нөөцөлсөн хэмжээг бодит хадгалсан хэмжээгээр засна (жишээ нь зураг дахин кодлогдож багассан) —
     * квот шалгахгүй: файл аль хэдийн хадгалагдсан, хэрэглэгчийн оруулсныг алдахгүй (INV-07).
     */
    public void adjust(UUID spaceId, long deltaBytes) {
        jdbc.update("UPDATE space SET storage_bytes = GREATEST(0, storage_bytes + ?) WHERE id = ?", deltaBytes, spaceId);
    }

    private Usage usageOf(long used) {
        return new Usage(used, quotaBytes, used >= (long) Math.ceil(quotaBytes * warnRatio));
    }
}
