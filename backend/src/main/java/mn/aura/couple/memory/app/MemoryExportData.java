package mn.aura.couple.memory.app;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.export.app.ExportGenerator;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** Экспортод (PDF ном, ZIP цомог) орох дурсамжууд — хуваалцсан, устгаагүй, бүлэг/хугацаагаар, огноогоор. */
@Component
public class MemoryExportData {

    public record Item(UUID mediaId, String kind, String mime, String s3Key, String mdKey, String altText) {
    }

    public record Entry(UUID id, String title, String description, LocalDate occurredOn, String place, String author,
                        List<Item> media) {
    }

    private final NamedParameterJdbcTemplate jdbc;

    public MemoryExportData(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Entry> load(ExportGenerator.Request r) {
        MapSqlParameterSource p = new MapSqlParameterSource("s", r.spaceId()).addValue("from", r.from()).addValue("to", r.to())
                .addValue("g", r.groupId());
        // Text block-ийн мөрийн төгсгөлийн зай хасагддаг тул эхэнд зай
        StringBuilder where = new StringBuilder(" m.space_id = :s AND m.deleted_at IS NULL");
        if (r.from() != null) {
            where.append(" AND m.occurred_on >= :from");
        }
        if (r.to() != null) {
            where.append(" AND m.occurred_on <= :to");
        }
        if (r.groupId() != null) {
            where.append(" AND EXISTS (SELECT 1 FROM memory_group_item gi WHERE gi.memory_id = m.id AND gi.group_id = :g)");
        }
        Map<UUID, Entry> out = new LinkedHashMap<>();
        jdbc.query("""
                SELECT m.id, m.title, m.description, m.occurred_on, m.location_name,
                       coalesce(nullif(u.call_name, ''), u.display_name) AS author
                  FROM memory m JOIN users u ON u.id = m.author_id
                 WHERE """ + where + " ORDER BY m.occurred_on, m.created_at", p, rs -> {
            UUID id = rs.getObject("id", UUID.class);
            out.put(id, new Entry(id, rs.getString("title"), rs.getString("description"),
                    rs.getDate("occurred_on").toLocalDate(), rs.getString("location_name"), rs.getString("author"),
                    new ArrayList<>()));
        });
        if (!out.isEmpty()) {
            jdbc.query("""
                    SELECT mm.memory_id, x.id, x.kind, x.mime, x.s3_key, x.variants ->> 'md' AS md, mm.alt_text
                      FROM memory_media mm JOIN media x ON x.id = mm.media_id
                     WHERE mm.memory_id IN (:ids) AND x.status = 'READY' ORDER BY mm.memory_id, mm.position
                    """, new MapSqlParameterSource("ids", out.keySet()), rs -> {
                out.get(rs.getObject("memory_id", UUID.class)).media().add(new Item(rs.getObject("id", UUID.class),
                        rs.getString("kind"), rs.getString("mime"), rs.getString("s3_key"), rs.getString("md"),
                        rs.getString("alt_text")));
            });
        }
        return new ArrayList<>(out.values());
    }

    /** Хосын хоёр гишүүний нэр (номын нүүрт). */
    public List<String> coupleNames(UUID spaceId) {
        return jdbc.queryForList("""
                SELECT coalesce(nullif(u.call_name, ''), u.display_name) FROM space_member sm JOIN users u ON u.id = sm.user_id
                 WHERE sm.space_id = :s AND sm.left_at IS NULL ORDER BY sm.joined_at, u.id
                """, new MapSqlParameterSource("s", spaceId), String.class);
    }
}
