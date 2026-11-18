package mn.aura.couple.couple.app;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.couple.domain.SpaceRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Ганцаараа үед (SOLO space) хэрэглэгчийн оруулсан, хамтрагчтай хуваалцаж болох зүйлс (FR-2.5):
 * дурсамж, болзооны санаа, жагсаалт, зорилго, ой, захидлын ноорог. Хүснэгт бүр өөрийн нэгжийн
 * migration-оор үүснэ — үүсээгүй хүснэгтийг (`to_regclass` null) алгасна.
 * Хувийн зүйл (check-in, нууц бэлгийн санаа) хуваалцагдахгүй тул энд байхгүй.
 */
@Component
public class SoloContentCounter {

    /** `space_id`-г COUPLE болгож шилжүүлэх хүснэгт ба зохиогчийн багана (DD-AURA-003). */
    public record SoloTable(String table, String authorColumn, String extraCondition) {
    }

    public static final List<SoloTable> TABLES = List.of(
            new SoloTable("memory", "author_id", "deleted_at IS NULL"),
            new SoloTable("date_idea", "author_id", null),
            new SoloTable("list_item", "created_by", null),
            new SoloTable("goal", "created_by", null),
            new SoloTable("anniversary", "author_id", null),
            new SoloTable("letter", "author_id", "status = 'DRAFT'"));

    private final JdbcTemplate jdbc;
    private final SpaceRepository spaces;

    public SoloContentCounter(JdbcTemplate jdbc, SpaceRepository spaces) {
        this.jdbc = jdbc;
        this.spaces = spaces;
    }

    public int count(UUID userId) {
        Optional<UUID> solo = spaces.soloSpaceOf(userId);
        if (solo.isEmpty()) {
            return 0;
        }
        int total = 0;
        for (SoloTable t : existingTables()) {
            Integer n = jdbc.queryForObject("SELECT count(*) FROM " + t.table() + " WHERE space_id = ? AND "
                    + t.authorColumn() + " = ?" + (t.extraCondition() == null ? "" : " AND " + t.extraCondition()),
                    Integer.class, solo.get(), userId);
            total += n == null ? 0 : n;
        }
        return total;
    }

    /** Migration-оор үүссэн хүснэгтүүд л (нэрс нь тогтмол жагсаалтаас — SQL injection-гүй). */
    public List<SoloTable> existingTables() {
        return TABLES.stream()
                .filter(t -> jdbc.queryForObject("SELECT to_regclass(?) IS NOT NULL", Boolean.class, "public." + t.table()))
                .toList();
    }
}
