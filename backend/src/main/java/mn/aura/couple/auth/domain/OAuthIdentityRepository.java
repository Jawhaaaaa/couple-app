package mn.aura.couple.auth.domain;

import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.common.id.Ids;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** `oauth_identity` — UNIQUE(provider, subject), хэрэглэгчид provider тутам нэг. */
@Repository
public class OAuthIdentityRepository {

    private final JdbcTemplate jdbc;

    public OAuthIdentityRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<UUID> findUser(String provider, String subject) {
        return jdbc.queryForList("SELECT user_id FROM oauth_identity WHERE provider = ? AND subject = ?",
                UUID.class, provider, subject).stream().findFirst();
    }

    /** Холбоно; тухайн хэрэглэгчид энэ provider-ийн өөр subject байсан бол солино. */
    public void link(UUID userId, String provider, String subject, String email) {
        jdbc.update("DELETE FROM oauth_identity WHERE user_id = ? AND provider = ?", userId, provider);
        jdbc.update("INSERT INTO oauth_identity (id, user_id, provider, subject, email) VALUES (?, ?, ?, ?, ?)",
                Ids.newId(), userId, provider, subject, email);
    }
}
