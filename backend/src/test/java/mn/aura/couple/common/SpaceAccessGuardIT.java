package mn.aura.couple.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import mn.aura.couple.AbstractIntegrationTest;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.common.space.SpaceContext;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;

/** DD-AURA-004 ба V1 суурь схем: идэвхтэй гишүүнчлэл, INV-02. */
@DisplayName("SpaceAccessGuard")
class SpaceAccessGuardIT extends AbstractIntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    SpaceAccessGuard guard;

    private UUID user(String email) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id, email) VALUES (?, ?)", id, email);
        return id;
    }

    private UUID space(String kind) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO space (id, kind) VALUES (?, ?)", id, kind);
        return id;
    }

    private void join(UUID space, UUID user, String kind) {
        jdbc.update("INSERT INTO space_member (space_id, user_id, space_kind) VALUES (?, ?, ?)", space, user, kind);
    }

    @Test
    @DisplayName("AC-55 идэвхтэй COUPLE байвал түүнийг, үгүй бол SOLO-г сонгоно")
    void prefersCouple() {
        UUID bat = user("bat-" + UUID.randomUUID() + "@example.mn");
        UUID solo = space("SOLO");
        join(solo, bat, "SOLO");
        assertThat(guard.resolve(bat)).contains(new SpaceContext(bat, solo, SpaceContext.Kind.SOLO));

        UUID couple = space("COUPLE");
        join(couple, bat, "COUPLE");
        assertThat(guard.resolve(bat)).contains(new SpaceContext(bat, couple, SpaceContext.Kind.COUPLE));

        jdbc.update("UPDATE space_member SET left_at = now() WHERE space_id = ?", couple);
        assertThat(guard.resolve(bat).orElseThrow().spaceId()).isEqualTo(solo);
    }

    @Test
    @DisplayName("AC-66 INV-02 нэг хэрэглэгч хоёр идэвхтэй COUPLE-д орж чадахгүй")
    void oneActiveCouple() {
        UUID bat = user("bat2-" + UUID.randomUUID() + "@example.mn");
        join(space("COUPLE"), bat, "COUPLE");
        assertThatThrownBy(() -> join(space("COUPLE"), bat, "COUPLE")).isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    @DisplayName("AC-22 өөр space-ийн объект → 404 NOT_FOUND")
    void otherSpaceIsNotFound() {
        SpaceContext ctx = new SpaceContext(UUID.randomUUID(), UUID.randomUUID(), SpaceContext.Kind.COUPLE);
        assertThatThrownBy(() -> guard.requireSameSpace(ctx, UUID.randomUUID()))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    @DisplayName("Имэйл citext — том жижиг үсгээс үл хамааран давхцахгүй")
    void emailCaseInsensitiveUnique() {
        String email = "Case-" + UUID.randomUUID() + "@Example.mn";
        user(email);
        assertThatThrownBy(() -> user(email.toLowerCase())).isInstanceOf(DuplicateKeyException.class);
    }
}
