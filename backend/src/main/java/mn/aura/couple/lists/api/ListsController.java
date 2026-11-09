package mn.aura.couple.lists.api;

import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.ListsApi;
import mn.aura.couple.api.model.ClearDoneResult;
import mn.aura.couple.api.model.ListItem;
import mn.aura.couple.api.model.ListItemInput;
import mn.aura.couple.api.model.ListItemUpdate;
import mn.aura.couple.api.model.ListOrder;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.lists.app.SharedListService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Lists` tag (T-58, FR-9.1, 9.2, 9.5, 9.6). Унших нь `current`, бичих нь `requireWritable` (423). */
@RestController
public class ListsController implements ListsApi {

    private final SpaceAccessGuard guard;
    private final SharedListService lists;

    public ListsController(SpaceAccessGuard guard, SharedListService lists) {
        this.guard = guard;
        this.lists = lists;
    }

    @Override
    public ResponseEntity<List<ListItem>> listListItems(String listKind) {
        return ResponseEntity.ok(lists.list(guard.current(), listKind));
    }

    @Override
    public ResponseEntity<ListItem> createListItem(String listKind, ListItemInput body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(lists.create(guard.requireWritable(), listKind, body));
    }

    @Override
    public ResponseEntity<ListItem> updateListItem(UUID itemId, ListItemUpdate body) {
        return ResponseEntity.ok(lists.update(guard.requireWritable(), itemId, body));
    }

    @Override
    public ResponseEntity<Void> deleteListItem(UUID itemId) {
        lists.delete(guard.requireWritable(), itemId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ListItem> voteListItem(UUID itemId) {
        return ResponseEntity.ok(lists.vote(guard.requireWritable(), itemId, true));
    }

    @Override
    public ResponseEntity<ListItem> unvoteListItem(UUID itemId) {
        return ResponseEntity.ok(lists.vote(guard.requireWritable(), itemId, false));
    }

    @Override
    public ResponseEntity<List<ListItem>> reorderList(String listKind, ListOrder body) {
        return ResponseEntity.ok(lists.reorder(guard.requireWritable(), listKind, body.getItemIds()));
    }

    @Override
    public ResponseEntity<ClearDoneResult> clearDoneListItems(String listKind) {
        return ResponseEntity.ok(new ClearDoneResult(lists.clearDone(guard.requireWritable(), listKind)));
    }
}
