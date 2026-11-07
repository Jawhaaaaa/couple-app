package mn.aura.couple.memory;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;

/** Дурсамжийн IT-ийн туслах: бэлэн зураг (DB-д шууд) ба дурсамж үүсгэх. */
abstract class AbstractMemoryIT extends AbstractSpaceIT {

    /** Хэрэглэгчийн идэвхтэй space-д READY зураг (S3 объектгүй — URL л үүснэ). */
    protected UUID image(TestUser u) {
        UUID space = jdbc.queryForObject("""
                SELECT sm.space_id FROM space_member sm JOIN space s ON s.id = sm.space_id
                 WHERE sm.user_id = ? AND sm.left_at IS NULL ORDER BY CASE s.kind WHEN 'COUPLE' THEN 0 ELSE 1 END LIMIT 1
                """, UUID.class, u.id());
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, s3_key, status) "
                + "VALUES (?, ?, ?, 'IMAGE', 'image/jpeg', 1000, ?, 'READY')", id, space, u.id(), "spaces/" + space + "/" + id + "/original");
        jdbc.update("UPDATE space SET storage_bytes = storage_bytes + 1000 WHERE id = ?", space);
        return id;
    }

    protected JsonNode memory(TestUser u, String title, String occurredOn, String extraJson) {
        String json = "{\"clientId\":\"" + UUID.randomUUID() + "\",\"title\":\"" + title + "\",\"occurredOn\":\"" + occurredOn
                + "\",\"dateSource\":\"MANUAL\",\"locationSource\":\"NONE\",\"tags\":[],\"groupIds\":[],\"media\":[{\"mediaId\":\""
                + image(u) + "\"}]" + (extraJson == null ? "" : "," + extraJson) + "}";
        return ok(call(u, "POST", "/memories", json), 201);
    }
}
