package mn.aura.couple.media.app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import mn.aura.couple.AbstractIntegrationTest;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/** AC-200: 80%-д анхааруулга, 10 GiB-д upload зогсоно (`aura.storage.*`). */
@DisplayName("StorageQuota")
class StorageQuotaIT extends AbstractIntegrationTest {

    private static final long GIB = 1024L * 1024 * 1024;
    private static final long MIB = 1024L * 1024;

    @Autowired
    StorageQuota quota;

    @Autowired
    JdbcTemplate jdbc;

    private UUID spaceWithUsage(long bytes) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO space (id, kind, storage_bytes) VALUES (?, 'COUPLE', ?)", id, bytes);
        return id;
    }

    private long stored(UUID spaceId) {
        return jdbc.queryForObject("SELECT storage_bytes FROM space WHERE id = ?", Long.class, spaceId);
    }

    @Test
    @DisplayName("AC-200 квот анхдагч 10 GiB")
    void defaultQuota() {
        assertThat(quota.quotaBytes()).isEqualTo(10 * GIB);
    }

    @Test
    @DisplayName("AC-200 8 GiB хүрэхэд анхааруулга, түүнээс доош анхааруулгагүй")
    void warningAtEightyPercent() {
        UUID below = spaceWithUsage(7 * GIB);
        StorageQuota.Usage under = quota.reserve(below, 500 * MIB);
        assertThat(under.warning()).isFalse();

        StorageQuota.Usage at = quota.reserve(below, 524 * MIB);
        assertThat(at.usedBytes()).isEqualTo(8 * GIB);
        assertThat(at.warning()).isTrue();
        assertThat(quota.usage(spaceWithUsage(8 * GIB)).warning()).isTrue();
    }

    @Test
    @DisplayName("AC-200 10 GiB хэтрэх upload → 507 STORAGE_QUOTA_EXCEEDED, хэрэглээ өөрчлөгдөхгүй")
    void exceedingQuotaRejected() {
        UUID space = spaceWithUsage(9 * GIB + 900 * MIB);
        assertThatThrownBy(() -> quota.reserve(space, 200 * MIB))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.code()).isEqualTo(ErrorCode.STORAGE_QUOTA_EXCEEDED);
                    assertThat(e.status()).isEqualTo(HttpStatus.INSUFFICIENT_STORAGE);
                    assertThat(e.details()).containsEntry("quotaBytes", 10 * GIB);
                });
        assertThat(stored(space)).isEqualTo(9 * GIB + 900 * MIB);

        StorageQuota.Usage full = quota.reserve(space, 124 * MIB);
        assertThat(full.usedBytes()).isEqualTo(10 * GIB);
        assertThatThrownBy(() -> quota.reserve(space, 1)).isInstanceOf(ApiException.class);
    }

    @Test
    @DisplayName("AC-200 устгасны дараа квот чөлөөлөгдөнө (0-ээс доош орохгүй)")
    void release() {
        UUID space = spaceWithUsage(10 * GIB);
        assertThat(quota.release(space, GIB).usedBytes()).isEqualTo(9 * GIB);
        assertThat(quota.reserve(space, 512 * MIB).usedBytes()).isEqualTo(9 * GIB + 512 * MIB);
        assertThat(quota.release(space, 20 * GIB).usedBytes()).isZero();
    }
}
