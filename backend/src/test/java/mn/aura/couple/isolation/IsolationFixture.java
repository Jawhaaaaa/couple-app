package mn.aura.couple.isolation;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * DD-AURA-028: C1-д resource төрөл бүрээс нэг объект (JDBC-ээр — бизнесийн дүрэм, хугацааны хязгаараас үл
 * хамааран) үүсгэж, гэрээний path параметрийн нэр → C1-ийн утга. `itemId` нь хоёр өөр resource тул path-ын
 * угтвараар ялгагдана. Шинэ path параметр нэмэгдээд энд утгагүй бол `CoupleIsolationIT` унана.
 */
final class IsolationFixture {

    final Map<String, String> values = new LinkedHashMap<>();
    String listItemId;
    String checklistItemId;

    private final JdbcTemplate jdbc;

    IsolationFixture(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** `a`, `b` нь C1-ийн хэрэглэгчид, `space` нь тэдний COUPLE space. */
    IsolationFixture seed(UUID a, UUID b, UUID space) {
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        Timestamp ts = Timestamp.from(now);
        LocalDate today = LocalDate.now();

        UUID media = id("mediaId");
        jdbc.update("INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, s3_key, status) "
                + "VALUES (?, ?, ?, 'IMAGE', 'image/jpeg', 3, ?, 'READY')", media, space, a, "spaces/" + space + "/media/" + media);
        UUID memory = id("memoryId");
        jdbc.update("INSERT INTO memory (id, space_id, author_id, client_id, title, occurred_on) VALUES (?, ?, ?, ?, ?, ?)",
                memory, space, a, UUID.randomUUID(), "C1-ийн нууц дурсамж", today);
        jdbc.update("INSERT INTO memory_media (memory_id, media_id, position) VALUES (?, ?, 0)", memory, media);
        UUID comment = id("commentId");
        jdbc.update("INSERT INTO memory_comment (id, space_id, memory_id, author_id, client_id, text) VALUES (?, ?, ?, ?, ?, ?)",
                comment, space, memory, b, UUID.randomUUID(), "C1-ийн сэтгэгдэл");
        UUID group = id("groupId");
        jdbc.update("INSERT INTO memory_group (id, space_id, name) VALUES (?, ?, ?)", group, space, "C1-ийн бүлэг");
        UUID recap = id("recapId");
        jdbc.update("INSERT INTO memory_recap (id, space_id, anniversary_on, year_number, memory_ids) VALUES (?, ?, ?, 1, ARRAY[?]::uuid[])",
                recap, space, today, memory);
        UUID message = id("messageId");
        jdbc.update("INSERT INTO chat_message (id, space_id, sender_id, client_message_id, kind, text, created_at) "
                + "VALUES (?, ?, ?, ?, 'TEXT', ?, ?)", message, space, a, UUID.randomUUID(), "C1-ийн мессеж", ts);
        UUID upload = id("uploadId");
        jdbc.update("INSERT INTO upload_session (id, owner_id, space_id, media_id, purpose, file_name, declared_mime, total_bytes, "
                + "chunk_size, total_chunks, s3_key, s3_upload_id, expires_at) VALUES (?, ?, ?, ?, 'MEMORY', 'a.jpg', 'image/jpeg', "
                + "10, 5242880, 1, ?, 'iso-upload', ?)", upload, a, space, media, "spaces/" + space + "/media/" + media,
                Timestamp.from(now.plus(1, ChronoUnit.DAYS)));
        UUID promise = id("promiseId");
        jdbc.update("INSERT INTO shared_promise (id, space_id, proposer_id, text) VALUES (?, ?, ?, ?)",
                promise, space, a, "C1-ийн амлалт");
        UUID idea = id("ideaId");
        jdbc.update("INSERT INTO date_idea (id, space_id, author_id, client_id, title, category) VALUES (?, ?, ?, ?, ?, 'FOOD')",
                idea, space, a, UUID.randomUUID(), "C1-ийн санаа");
        UUID plan = id("planId");
        jdbc.update("INSERT INTO date_plan (id, space_id, proposer_id, title, starts_at, timezone) VALUES (?, ?, ?, ?, ?, 'Asia/Ulaanbaatar')",
                plan, space, a, "C1-ийн болзоо", Timestamp.from(now.plus(3, ChronoUnit.DAYS)));
        UUID checklist = UUID.randomUUID();
        checklistItemId = checklist.toString();
        jdbc.update("INSERT INTO checklist_item (id, plan_id, text, created_by) VALUES (?, ?, ?, ?)", checklist, plan, "C1 checklist", a);
        UUID expense = id("expenseId");
        jdbc.update("INSERT INTO expense (id, plan_id, space_id, payer_id, created_by, amount_mnt, spent_on) VALUES (?, ?, ?, ?, ?, 1000, ?)",
                expense, plan, space, a, a, today);
        UUID anniversary = id("anniversaryId");
        jdbc.update("INSERT INTO anniversary (id, space_id, author_id, title, date, kind, recurring) VALUES (?, ?, ?, ?, ?, 'OTHER', true)",
                anniversary, space, a, "C1-ийн ой", today.minusYears(1));
        values.put("occasionKey", "custom:" + anniversary);
        UUID gift = id("giftIdeaId");
        jdbc.update("INSERT INTO gift_idea (id, space_id, owner_id, occasion_key, text) VALUES (?, ?, ?, ?, ?)",
                gift, space, a, "birthday:" + b, "C1-ийн нууц бэлэг");
        UUID listItem = UUID.randomUUID();
        listItemId = listItem.toString();
        jdbc.update("INSERT INTO list_item (id, space_id, list_kind, client_id, title, created_by) VALUES (?, ?, 'BUCKET', ?, ?, ?)",
                listItem, space, UUID.randomUUID(), "C1 bucket", a);
        UUID goal = id("goalId");
        jdbc.update("INSERT INTO goal (id, space_id, title, created_by) VALUES (?, ?, ?, ?)", goal, space, "C1-ийн зорилго", a);
        UUID step = id("stepId");
        jdbc.update("INSERT INTO goal_step (id, goal_id, title) VALUES (?, ?, ?)", step, goal, "C1 алхам");
        UUID contribution = id("contributionId");
        jdbc.update("INSERT INTO goal_contribution (id, goal_id, user_id, amount_mnt) VALUES (?, ?, ?, 500)", contribution, goal, a);
        UUID letter = id("letterId");
        jdbc.update("INSERT INTO letter (id, space_id, author_id, recipient_id, template, body, status, delivered_at) "
                + "VALUES (?, ?, ?, ?, 'PAPER_1', ?, 'DELIVERED', ?)", letter, space, a, b, "C1-ийн захидал", ts);
        UUID capsule = id("capsuleId");
        jdbc.update("INSERT INTO capsule (id, space_id, creator_id, title, open_on) VALUES (?, ?, ?, ?, ?)",
                capsule, space, a, "C1 capsule", today.plusYears(1));
        UUID proposal = id("proposalId");
        jdbc.update("INSERT INTO theme_proposal (id, space_id, proposer_id, theme) VALUES (?, ?, ?, 'OCEAN')", proposal, space, a);
        UUID export = id("exportId");
        jdbc.update("INSERT INTO data_export (id, user_id, space_id, kind, status, s3_key, file_name, size_bytes, ready_at, expires_at) "
                + "VALUES (?, ?, ?, 'FULL', 'READY', ?, 'aura.zip', 3, ?, ?)", export, a, space, "exports/" + export + ".zip", ts,
                Timestamp.from(now.plus(7, ChronoUnit.DAYS)));
        UUID notification = id("notificationId");
        jdbc.update("INSERT INTO notification (id, user_id, space_id, type, variant_id, deep_link) VALUES (?, ?, ?, 'HEART', 'v1', '/')",
                notification, a, space);
        UUID subscription = id("subscriptionId");
        jdbc.update("INSERT INTO push_subscription (id, user_id, kind, expo_token) VALUES (?, ?, 'EXPO', ?)",
                subscription, a, "ExponentPushToken[iso-" + subscription + "]");
        String credential = "iso-" + UUID.randomUUID();
        values.put("credentialId", credential);
        jdbc.update("INSERT INTO webauthn_credential (id, user_id, credential_id, attested_credential_data, created_at) "
                + "VALUES (?, ?, ?, ?, ?)", UUID.randomUUID(), a, credential, new byte[] {1}, ts);

        List<UUID> sessions = jdbc.queryForList("SELECT id FROM device_session WHERE user_id = ? AND revoked_at IS NULL", UUID.class, a);
        values.put("sessionId", sessions.get(0).toString());
        Map<String, Object> pairing = jdbc.queryForMap("SELECT id, invite_id FROM pairing WHERE space_id = ?", space);
        values.put("pairingId", pairing.get("id").toString());
        values.put("inviteId", pairing.get("invite_id").toString());
        return this;
    }

    /** Path параметрийн C1 утга. Олдохгүй бол null (тест «fixture-гүй параметр» гэж унана). */
    String value(String path, String param) {
        if ("itemId".equals(param)) {
            return path.startsWith("/checklist-items/") ? checklistItemId : listItemId;
        }
        return values.get(param);
    }

    /** C2-ийн хариунд гарч болохгүй C1-ийн бүх ID. */
    List<String> ids() {
        List<String> out = new java.util.ArrayList<>(values.values());
        out.add(listItemId);
        out.add(checklistItemId);
        return out;
    }

    private UUID id(String param) {
        UUID id = UUID.randomUUID();
        values.put(param, id.toString());
        return id;
    }
}
