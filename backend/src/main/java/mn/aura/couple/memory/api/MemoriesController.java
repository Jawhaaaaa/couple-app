package mn.aura.couple.memory.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.MemoriesApi;
import mn.aura.couple.api.MemoryGroupsApi;
import mn.aura.couple.api.model.Comment;
import mn.aura.couple.api.model.CommentCreate;
import mn.aura.couple.api.model.CommentPage;
import mn.aura.couple.api.model.CommentUpdate;
import mn.aura.couple.api.model.DeletePreview;
import mn.aura.couple.api.model.Memory;
import mn.aura.couple.api.model.MemoryCreate;
import mn.aura.couple.api.model.MemoryGroup;
import mn.aura.couple.api.model.MemoryGroupDetail;
import mn.aura.couple.api.model.MemoryGroupInput;
import mn.aura.couple.api.model.MemoryGroupUpdate;
import mn.aura.couple.api.model.MemoryPage;
import mn.aura.couple.api.model.MemoryPlace;
import mn.aura.couple.api.model.MemoryUpdate;
import mn.aura.couple.api.model.MonthCount;
import mn.aura.couple.api.model.OnThisDayGroup;
import mn.aura.couple.api.model.Perspective;
import mn.aura.couple.api.model.PerspectiveInput;
import mn.aura.couple.api.model.ReactionInput;
import mn.aura.couple.api.model.ReactionSummary;
import mn.aura.couple.api.model.TrashEntry;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.memory.app.MemoryGroupService;
import mn.aura.couple.memory.app.MemorySearchService;
import mn.aura.couple.memory.app.MemoryService;
import mn.aura.couple.memory.app.MemoryTrashService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/**
 * Гэрээний `Memories` ба `MemoryGroups` tag (T-35…T-37). Унших нь тасалж буй хосод ч (зөвхөн харах/экспорт),
 * бичих нь `requireWritable` (423).
 */
@RestController
public class MemoriesController implements MemoriesApi, MemoryGroupsApi {

    private final SpaceAccessGuard guard;
    private final MemoryService memories;
    private final MemoryTrashService trash;
    private final MemorySearchService search;
    private final MemoryGroupService groups;

    public MemoriesController(SpaceAccessGuard guard, MemoryService memories, MemoryTrashService trash,
                              MemorySearchService search, MemoryGroupService groups) {
        this.guard = guard;
        this.memories = memories;
        this.trash = trash;
        this.search = search;
        this.groups = groups;
    }

    @Override
    public ResponseEntity<MemoryPage> listMemories(String cursor, Integer limit, String q, LocalDate from, LocalDate to,
                                                   String tag, UUID groupId, String author, Boolean favorite,
                                                   Boolean hasLocation, String scope, String place) {
        return ResponseEntity.ok(search.search(guard.current(), new MemorySearchService.Filter(q, from, to, tag, groupId,
                author, favorite, hasLocation, scope, place), cursor, limit));
    }

    @Override
    public ResponseEntity<List<MonthCount>> listMemoryMonths(String scope) {
        return ResponseEntity.ok(search.months(guard.current(), scope));
    }

    @Override
    public ResponseEntity<List<String>> listMemoryTags() {
        return ResponseEntity.ok(search.tags(guard.current()));
    }

    @Override
    public ResponseEntity<List<MemoryPlace>> listMemoryPlaces(String bbox) {
        return ResponseEntity.ok(search.places(guard.current(), bbox));
    }

    @Override
    public ResponseEntity<List<OnThisDayGroup>> listOnThisDay(LocalDate date) {
        return ResponseEntity.ok(search.onThisDay(guard.current(), date));
    }

    @Override
    public ResponseEntity<Memory> createMemory(MemoryCreate body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(memories.create(guard.requireWritable(), body));
    }

    @Override
    public ResponseEntity<Memory> getMemory(UUID memoryId) {
        return ResponseEntity.ok(memories.get(guard.current(), memoryId));
    }

    @Override
    public ResponseEntity<Memory> updateMemory(UUID memoryId, MemoryUpdate body) {
        return ResponseEntity.ok(memories.update(guard.requireWritable(), memoryId, body));
    }

    @Override
    public ResponseEntity<DeletePreview> previewMemoryDeletion(UUID memoryId) {
        return ResponseEntity.ok(trash.preview(guard.current(), memoryId));
    }

    @Override
    public ResponseEntity<TrashEntry> deleteMemory(UUID memoryId) {
        return ResponseEntity.ok(trash.delete(guard.requireWritable(), memoryId));
    }

    @Override
    public ResponseEntity<List<TrashEntry>> listMemoryTrash() {
        return ResponseEntity.ok(trash.list(guard.current()));
    }

    @Override
    public ResponseEntity<Memory> restoreMemory(UUID memoryId) {
        return ResponseEntity.ok(trash.restore(guard.requireWritable(), memoryId));
    }

    @Override
    public ResponseEntity<Void> purgeMemory(UUID memoryId) {
        trash.purgeNow(guard.requireWritable(), memoryId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> addMemoryFavorite(UUID memoryId) {
        memories.favorite(guard.current(), memoryId, true);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> removeMemoryFavorite(UUID memoryId) {
        memories.favorite(guard.current(), memoryId, false);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Perspective> upsertPerspective(UUID memoryId, PerspectiveInput body) {
        return ResponseEntity.ok(memories.upsertPerspective(guard.requireWritable(), memoryId, body));
    }

    @Override
    public ResponseEntity<Void> deletePerspective(UUID memoryId) {
        memories.deletePerspective(guard.requireWritable(), memoryId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<CommentPage> listComments(UUID memoryId, String cursor, Integer limit) {
        return ResponseEntity.ok(memories.comments(guard.current(), memoryId, cursor, limit));
    }

    @Override
    public ResponseEntity<Comment> createComment(UUID memoryId, CommentCreate body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(memories.comment(guard.requireWritable(), memoryId, body.getText(), body.getClientId()));
    }

    @Override
    public ResponseEntity<Comment> updateComment(UUID commentId, CommentUpdate body) {
        return ResponseEntity.ok(memories.updateComment(guard.requireWritable(), commentId, body.getText(), body.getVersion()));
    }

    @Override
    public ResponseEntity<Void> deleteComment(UUID commentId) {
        memories.deleteComment(guard.requireWritable(), commentId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<List<ReactionSummary>> setMemoryReaction(UUID memoryId, ReactionInput body) {
        return ResponseEntity.ok(memories.react(guard.requireWritable(), memoryId, body.getEmoji().getValue()));
    }

    @Override
    public ResponseEntity<List<ReactionSummary>> removeMemoryReaction(UUID memoryId) {
        return ResponseEntity.ok(memories.unreact(guard.requireWritable(), memoryId));
    }

    // --- Бүлэг (AC-81) ---

    @Override
    public ResponseEntity<List<MemoryGroup>> listMemoryGroups() {
        return ResponseEntity.ok(groups.list(guard.current()));
    }

    @Override
    public ResponseEntity<MemoryGroup> createMemoryGroup(MemoryGroupInput body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(groups.create(guard.requireWritable(), body.getName(), body.getCoverMediaId()));
    }

    @Override
    public ResponseEntity<MemoryGroupDetail> getMemoryGroup(UUID groupId) {
        return ResponseEntity.ok(groups.detail(guard.current(), groupId));
    }

    @Override
    public ResponseEntity<MemoryGroup> updateMemoryGroup(UUID groupId, MemoryGroupUpdate body) {
        return ResponseEntity.ok(groups.update(guard.requireWritable(), groupId, body.getName(), body.getCoverMediaId(),
                body.getCoverMediaId() != null, body.getVersion()));
    }

    @Override
    public ResponseEntity<Void> deleteMemoryGroup(UUID groupId) {
        groups.delete(guard.requireWritable(), groupId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> addMemoryToGroup(UUID groupId, UUID memoryId) {
        groups.add(guard.requireWritable(), groupId, memoryId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> removeMemoryFromGroup(UUID groupId, UUID memoryId) {
        groups.remove(guard.requireWritable(), groupId, memoryId);
        return ResponseEntity.noContent().build();
    }
}
