package mn.aura.couple.passkey;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Тестийн программ authenticator: `none` attestation-тэй ES256 (P-256) түлхүүр. Браузерын
 * `navigator.credentials.create/get`-ийн `RegistrationResponseJSON` / `AuthenticationResponseJSON`-ийг
 * гараар бүрдүүлнэ — authenticatorData, COSE түлхүүр, attestationObject нь жижиг CBOR кодлогчоор.
 */
final class SoftAuthenticator {

    static final byte UP = 0x01;
    static final byte UV = 0x04;
    static final byte AT = 0x40;
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    final byte[] credentialId;
    private final KeyPair keys;
    private int signCount;

    SoftAuthenticator() {
        try {
            KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
            g.initialize(new ECGenParameterSpec("secp256r1"));
            keys = g.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        credentialId = new byte[32];
        new java.security.SecureRandom().nextBytes(credentialId);
    }

    String id() {
        return B64.encodeToString(credentialId);
    }

    /** `navigator.credentials.create()`-ийн хариу. */
    Map<String, Object> register(String challenge, String origin, String rpId, byte flags) {
        byte[] clientData = clientData("webauthn.create", challenge, origin);
        ByteArrayOutputStream auth = new ByteArrayOutputStream();
        auth.writeBytes(sha256(rpId.getBytes(StandardCharsets.UTF_8)));
        auth.write(flags | AT);
        auth.writeBytes(ByteBuffer.allocate(4).putInt(signCount).array());
        auth.writeBytes(new byte[16]); // AAGUID
        auth.writeBytes(ByteBuffer.allocate(2).putShort((short) credentialId.length).array());
        auth.writeBytes(credentialId);
        auth.writeBytes(coseKey());

        Cbor att = new Cbor();
        att.map(3);
        att.text("fmt").text("none");
        att.text("attStmt").map(0);
        att.text("authData").bytes(auth.toByteArray());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("clientDataJSON", B64.encodeToString(clientData));
        response.put("attestationObject", B64.encodeToString(att.toByteArray()));
        response.put("transports", List.of("internal"));
        return credential(response);
    }

    /** `navigator.credentials.get()`-ийн хариу (ES256 гарын үсэг, DER). */
    Map<String, Object> assert_(String challenge, String origin, String rpId, byte flags) {
        signCount++;
        byte[] clientData = clientData("webauthn.get", challenge, origin);
        ByteArrayOutputStream auth = new ByteArrayOutputStream();
        auth.writeBytes(sha256(rpId.getBytes(StandardCharsets.UTF_8)));
        auth.write(flags);
        auth.writeBytes(ByteBuffer.allocate(4).putInt(signCount).array());
        byte[] authData = auth.toByteArray();
        byte[] signature;
        try {
            Signature s = Signature.getInstance("SHA256withECDSA");
            s.initSign(keys.getPrivate());
            s.update(authData);
            s.update(sha256(clientData));
            signature = s.sign();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("clientDataJSON", B64.encodeToString(clientData));
        response.put("authenticatorData", B64.encodeToString(authData));
        response.put("signature", B64.encodeToString(signature));
        return credential(response);
    }

    private Map<String, Object> credential(Map<String, Object> response) {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("id", id());
        c.put("rawId", id());
        c.put("type", "public-key");
        c.put("response", response);
        c.put("clientExtensionResults", Map.of());
        c.put("authenticatorAttachment", "platform");
        return c;
    }

    private static byte[] clientData(String type, String challenge, String origin) {
        return ("{\"type\":\"" + type + "\",\"challenge\":\"" + challenge + "\",\"origin\":\"" + origin
                + "\",\"crossOrigin\":false}").getBytes(StandardCharsets.UTF_8);
    }

    /** COSE_Key EC2: {1: 2 (kty EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y}. */
    private byte[] coseKey() {
        ECPublicKey pub = (ECPublicKey) keys.getPublic();
        Cbor c = new Cbor();
        c.map(5);
        c.integer(1).integer(2);
        c.integer(3).integer(-7);
        c.integer(-1).integer(1);
        c.integer(-2).bytes(unsigned32(pub.getW().getAffineX()));
        c.integer(-3).bytes(unsigned32(pub.getW().getAffineY()));
        return c.toByteArray();
    }

    private static byte[] unsigned32(BigInteger v) {
        byte[] raw = v.toByteArray();
        byte[] out = new byte[32];
        int len = Math.min(raw.length, 32);
        System.arraycopy(raw, raw.length - len, out, 32 - len, len);
        return out;
    }

    static byte[] sha256(byte[] b) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(b);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** CBOR-ийн хэрэгтэй хэсэг л: map, int, text, bytes (RFC 8949, тодорхой урттай). */
    static final class Cbor {
        private final ByteArrayOutputStream out = new ByteArrayOutputStream();

        Cbor map(int n) {
            head(5, n);
            return this;
        }

        Cbor integer(long v) {
            if (v >= 0) {
                head(0, v);
            } else {
                head(1, -1 - v);
            }
            return this;
        }

        Cbor text(String s) {
            byte[] b = s.getBytes(StandardCharsets.UTF_8);
            head(3, b.length);
            out.writeBytes(b);
            return this;
        }

        Cbor bytes(byte[] b) {
            head(2, b.length);
            out.writeBytes(b);
            return this;
        }

        private void head(int major, long v) {
            int m = major << 5;
            if (v < 24) {
                out.write(m | (int) v);
            } else if (v < 256) {
                out.write(m | 24);
                out.write((int) v);
            } else if (v < 65536) {
                out.write(m | 25);
                out.writeBytes(ByteBuffer.allocate(2).putShort((short) v).array());
            } else {
                out.write(m | 26);
                out.writeBytes(ByteBuffer.allocate(4).putInt((int) v).array());
            }
        }

        byte[] toByteArray() {
            return out.toByteArray();
        }
    }
}
