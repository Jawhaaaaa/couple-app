package mn.aura.couple.passkey.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.webauthn4j.WebAuthnManager;
import com.webauthn4j.converter.AttestedCredentialDataConverter;
import com.webauthn4j.converter.util.ObjectConverter;
import com.webauthn4j.credential.CredentialRecord;
import com.webauthn4j.credential.CredentialRecordImpl;
import com.webauthn4j.data.AuthenticationData;
import com.webauthn4j.data.AuthenticationParameters;
import com.webauthn4j.data.AuthenticatorTransport;
import com.webauthn4j.data.PublicKeyCredentialParameters;
import com.webauthn4j.data.PublicKeyCredentialType;
import com.webauthn4j.data.RegistrationData;
import com.webauthn4j.data.RegistrationParameters;
import com.webauthn4j.data.attestation.authenticator.AttestedCredentialData;
import com.webauthn4j.data.attestation.authenticator.AuthenticatorData;
import com.webauthn4j.data.attestation.statement.COSEAlgorithmIdentifier;
import com.webauthn4j.data.attestation.statement.NoneAttestationStatement;
import com.webauthn4j.data.client.Origin;
import com.webauthn4j.data.client.challenge.DefaultChallenge;
import com.webauthn4j.server.ServerProperty;
import java.net.URI;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import mn.aura.couple.api.model.PublicKeyCredentialCreationOptions;
import mn.aura.couple.api.model.PublicKeyCredentialRequestOptions;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.time.TimeProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Вэбийн passkey (FR-19.6, DD-AURA-033, AC-157): platform authenticator-ийг бүртгэж, апп-ын түгжээг
 * серверээр баталгаажуулж тайлна (`webauthn4j`). Нэвтрэлт биш — хэрэглэгч аль хэдийн access JWT-тэй.
 *
 * <ul>
 *   <li>Challenge 32 байт, серверт `webauthn_challenge`-д 5 минут, нэг удаагийн (баталгаажуулахад устгана);</li>
 *   <li>RP ID ба зөвшөөрөгдсөн origin нь `aura.passkey.rp-id` / `aura.passkey.origins`, хоосон бол
 *       `aura.web.base-url`-ээс (host ба origin);</li>
 *   <li>Attestation `none` (хувийн апп — төхөөрөмжийн гэрчилгээ шаардахгүй), алгоритм ES256 ба RS256,
 *       хэрэглэгчийн баталгаажуулалт (UV) заавал;</li>
 *   <li>Өөр хэрэглэгчийн credential устгах/ашиглах → 404 / 400 (хос тусгаарлалт — хамтрагчийнх ч мөн).</li>
 * </ul>
 */
@Service
public class PasskeyService {

    private static final Logger log = LoggerFactory.getLogger(PasskeyService.class);
    static final Duration CHALLENGE_TTL = Duration.ofMinutes(5);
    static final int TIMEOUT_MS = 60_000;
    static final String REGISTER = "REGISTER";
    static final String ASSERT = "ASSERT";
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();
    private static final List<PublicKeyCredentialParameters> ALGORITHMS = List.of(
            new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, COSEAlgorithmIdentifier.ES256),
            new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, COSEAlgorithmIdentifier.RS256));

    private final JdbcTemplate jdbc;
    private final TimeProvider time;
    private final ObjectMapper mapper;
    private final String rpId;
    private final Set<Origin> origins;
    private final WebAuthnManager webAuthn;
    private final AttestedCredentialDataConverter credentialData;
    private final SecureRandom random = new SecureRandom();

    public PasskeyService(JdbcTemplate jdbc, TimeProvider time, ObjectMapper mapper,
                          @Value("${aura.passkey.rp-id:}") String rpId,
                          @Value("${aura.passkey.origins:}") String origins,
                          @Value("${aura.web.base-url:http://localhost:8090}") String webBaseUrl) {
        this.jdbc = jdbc;
        this.time = time;
        this.mapper = mapper;
        this.rpId = rpId == null || rpId.isBlank() ? URI.create(webBaseUrl.strip()).getHost() : rpId.strip();
        String originList = origins == null || origins.isBlank() ? webBaseUrl : origins;
        this.origins = Arrays.stream(originList.split(","))
                .map(String::strip)
                .filter(s -> !s.isEmpty())
                .map(s -> s.endsWith("/") ? s.substring(0, s.length() - 1) : s)
                .map(Origin::new)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        ObjectConverter converter = new ObjectConverter();
        this.webAuthn = WebAuthnManager.createNonStrictWebAuthnManager(converter);
        this.credentialData = new AttestedCredentialDataConverter(converter);
    }

    @Transactional
    public PublicKeyCredentialCreationOptions registrationOptions(UUID userId) {
        Map<String, Object> user = jdbc.queryForMap(
                "SELECT email::text AS email, coalesce(display_name, email::text) AS display_name FROM users WHERE id = ?",
                userId);
        PublicKeyCredentialCreationOptions options = new PublicKeyCredentialCreationOptions();
        options.setChallenge(newChallenge(userId, REGISTER));
        options.setRp(new LinkedHashMap<>(Map.of("id", rpId, "name", "Aura")));
        options.setUser(new LinkedHashMap<>(Map.of(
                "id", B64.encodeToString(uuidBytes(userId)),
                "name", user.get("email"),
                "displayName", user.get("display_name"))));
        List<Map<String, Object>> params = new ArrayList<>();
        for (PublicKeyCredentialParameters p : ALGORITHMS) {
            params.add(new LinkedHashMap<>(Map.of("type", "public-key", "alg", p.getAlg().getValue())));
        }
        options.setPubKeyCredParams(params);
        options.setTimeout(TIMEOUT_MS);
        options.putAdditionalProperty("attestation", "none");
        options.putAdditionalProperty("authenticatorSelection", Map.of(
                "authenticatorAttachment", "platform",
                "residentKey", "preferred",
                "requireResidentKey", false,
                "userVerification", "required"));
        options.putAdditionalProperty("excludeCredentials", descriptors(userId));
        return options;
    }

    @Transactional(noRollbackFor = ApiException.class)
    public void register(UUID userId, Map<String, Object> credential) {
        String body = json(credential);
        RegistrationData data;
        String challenge;
        try {
            data = webAuthn.parseRegistrationResponseJSON(body);
            challenge = B64.encodeToString(data.getCollectedClientData().getChallenge().getValue());
        } catch (RuntimeException e) {
            // webauthn4j нь буруу бүтэцтэй JSON-д WebAuthnException-аас гадна NPE г.м. шиддэг
            throw invalid("бүртгэлийн хариу задрахгүй", e);
        }
        consume(userId, REGISTER, challenge);
        try {
            webAuthn.verify(data, new RegistrationParameters(serverProperty(challenge), ALGORITHMS, true, true));
        } catch (RuntimeException e) {
            throw invalid("бүртгэл баталгаажсангүй", e);
        }
        AuthenticatorData<?> auth = data.getAttestationObject().getAuthenticatorData();
        AttestedCredentialData acd = auth.getAttestedCredentialData();
        String credentialId = B64.encodeToString(acd.getCredentialId());
        String transports = data.getTransports() == null ? null
                : data.getTransports().stream().map(AuthenticatorTransport::getValue).collect(Collectors.joining(","));
        int inserted = jdbc.update("""
                INSERT INTO webauthn_credential (id, user_id, credential_id, attested_credential_data, sign_count,
                                                 uv_initialized, backup_eligible, backup_state, transports, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (credential_id) DO NOTHING
                """, Ids.newId(), userId, credentialId, credentialData.convert(acd), auth.getSignCount(),
                auth.isFlagUV(), auth.isFlagBE(), auth.isFlagBS(), transports, Timestamp.from(time.now()));
        if (inserted == 0) {
            throw invalid("credential аль хэдийн бүртгэлтэй", null);
        }
    }

    @Transactional
    public PublicKeyCredentialRequestOptions assertionOptions(UUID userId) {
        PublicKeyCredentialRequestOptions options = new PublicKeyCredentialRequestOptions();
        options.setChallenge(newChallenge(userId, ASSERT));
        options.setRpId(rpId);
        options.setAllowCredentials(descriptors(userId));
        options.setTimeout(TIMEOUT_MS);
        options.putAdditionalProperty("userVerification", "required");
        return options;
    }

    @Transactional(noRollbackFor = ApiException.class)
    public void verifyAssertion(UUID userId, Map<String, Object> credential) {
        String body = json(credential);
        AuthenticationData data;
        String challenge;
        String credentialId;
        try {
            data = webAuthn.parseAuthenticationResponseJSON(body);
            challenge = B64.encodeToString(data.getCollectedClientData().getChallenge().getValue());
            credentialId = B64.encodeToString(data.getCredentialId());
        } catch (RuntimeException e) {
            // webauthn4j нь буруу бүтэцтэй JSON-д WebAuthnException-аас гадна NPE г.м. шиддэг
            throw invalid("баталгаажуулалтын хариу задрахгүй", e);
        }
        consume(userId, ASSERT, challenge);
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, attested_credential_data, sign_count, uv_initialized, backup_eligible, backup_state
                  FROM webauthn_credential WHERE user_id = ? AND credential_id = ? FOR UPDATE
                """, userId, credentialId);
        if (rows.isEmpty()) {
            throw invalid("энэ хэрэглэгчийн credential биш", null);
        }
        Map<String, Object> row = rows.get(0);
        CredentialRecord record = new CredentialRecordImpl(new NoneAttestationStatement(),
                (Boolean) row.get("uv_initialized"), (Boolean) row.get("backup_eligible"), (Boolean) row.get("backup_state"),
                ((Number) row.get("sign_count")).longValue(),
                credentialData.convert((byte[]) row.get("attested_credential_data")), null, null, null, null);
        try {
            webAuthn.verify(data, new AuthenticationParameters(serverProperty(challenge), record,
                    List.of(data.getCredentialId()), true, true));
        } catch (RuntimeException e) {
            throw invalid("баталгаажуулалт амжилтгүй", e);
        }
        jdbc.update("UPDATE webauthn_credential SET sign_count = ?, uv_initialized = true, backup_state = ?, last_used_at = ? WHERE id = ?",
                data.getAuthenticatorData().getSignCount(), data.getAuthenticatorData().isFlagBS(),
                Timestamp.from(time.now()), row.get("id"));
    }

    /** Өөрийн credential-ийг устгана; өөр хэрэглэгчийнх эсвэл байхгүй → 404. */
    @Transactional
    public void delete(UUID userId, String credentialId) {
        if (jdbc.update("DELETE FROM webauthn_credential WHERE user_id = ? AND credential_id = ?", userId, credentialId) == 0) {
            throw ApiException.notFound();
        }
    }

    private List<Map<String, Object>> descriptors(UUID userId) {
        List<Map<String, Object>> out = new ArrayList<>();
        jdbc.query("SELECT credential_id, transports FROM webauthn_credential WHERE user_id = ? ORDER BY created_at", rs -> {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("type", "public-key");
            d.put("id", rs.getString(1));
            String transports = rs.getString(2);
            if (transports != null && !transports.isBlank()) {
                d.put("transports", List.of(transports.split(",")));
            }
            out.add(d);
        }, userId);
        return out;
    }

    private String newChallenge(UUID userId, String kind) {
        Instant now = time.now();
        jdbc.update("DELETE FROM webauthn_challenge WHERE user_id = ? AND expires_at <= ?", userId, Timestamp.from(now));
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String challenge = B64.encodeToString(bytes);
        jdbc.update("INSERT INTO webauthn_challenge (id, user_id, kind, challenge, expires_at) VALUES (?, ?, ?, ?, ?)",
                Ids.newId(), userId, kind, challenge, Timestamp.from(now.plus(CHALLENGE_TTL)));
        return challenge;
    }

    /** Нэг удаагийн: тохирох, хугацаа дуусаагүй challenge-ийг устгана; олдохгүй бол 400. */
    private void consume(UUID userId, String kind, String challenge) {
        if (challenge == null) {
            throw invalid("challenge алга", null);
        }
        int n = jdbc.update("DELETE FROM webauthn_challenge WHERE user_id = ? AND kind = ? AND challenge = ? AND expires_at > ?",
                userId, kind, challenge, Timestamp.from(time.now()));
        if (n == 0) {
            throw invalid("challenge хүчингүй эсвэл ашиглагдсан", null);
        }
    }

    private ServerProperty serverProperty(String challenge) {
        return ServerProperty.builder()
                .origins(origins)
                .rpId(rpId)
                .challenge(new DefaultChallenge(B64D.decode(challenge)))
                .build();
    }

    private String json(Map<String, Object> credential) {
        if (credential == null || credential.isEmpty()) {
            throw invalid("credential хоосон", null);
        }
        try {
            return mapper.writeValueAsString(credential);
        } catch (JsonProcessingException e) {
            throw invalid("credential JSON биш", e);
        }
    }

    private static byte[] uuidBytes(UUID id) {
        return java.nio.ByteBuffer.allocate(16).putLong(id.getMostSignificantBits()).putLong(id.getLeastSignificantBits())
                .array();
    }

    private static ApiException invalid(String why, Exception cause) {
        log.info("Passkey татгалзлаа: {}{}", why, cause == null ? "" : " (" + cause.getClass().getSimpleName() + ")");
        return new ApiException(ErrorCode.PASSKEY_INVALID, HttpStatus.BAD_REQUEST);
    }
}
