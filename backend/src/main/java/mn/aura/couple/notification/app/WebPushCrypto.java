package mn.aura.couple.notification.app;

import java.math.BigInteger;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Web Push-ийн шифрлэлт (RFC 8291, `aes128gcm`) ба VAPID (RFC 8292, ES256) — зөвхөн JDK-ийн
 * криптограф. Payload нь браузерын push service-ээр дамжихдаа зөвхөн хүлээн авагч төхөөрөмжид
 * уншигдана. Энэ нь push дамжуулалтын шифрлэлт л — апп өөрийгөө бүрэн шифрлэлттэй гэж мэдэгдэхгүй (INV-09).
 */
public final class WebPushCrypto {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int RECORD_SIZE = 4096;
    private static final ECParameterSpec P256 = p256();

    private WebPushCrypto() {
    }

    /** Шифрлэсэн бие: `salt(16) | rs(4) | idlen(1) | keyid(65) | ciphertext`. */
    public static byte[] encrypt(byte[] payload, byte[] uaPublic, byte[] authSecret) {
        try {
            KeyPair ephemeral = generate();
            byte[] asPublic = raw((ECPublicKey) ephemeral.getPublic());
            byte[] salt = new byte[16];
            RANDOM.nextBytes(salt);
            byte[][] keys = deriveKeys(ecdh((ECPrivateKey) ephemeral.getPrivate(), uaPublic), authSecret, uaPublic,
                    asPublic, salt);
            byte[] padded = Arrays.copyOf(payload, payload.length + 1);
            padded[payload.length] = 0x02; // сүүлийн record-ын тэмдэг
            Cipher gcm = Cipher.getInstance("AES/GCM/NoPadding");
            gcm.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(keys[0], "AES"), new GCMParameterSpec(128, keys[1]));
            byte[] ciphertext = gcm.doFinal(padded);
            return ByteBuffer.allocate(16 + 4 + 1 + asPublic.length + ciphertext.length)
                    .put(salt).putInt(RECORD_SIZE).put((byte) asPublic.length).put(asPublic).put(ciphertext).array();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Web Push шифрлэлт амжилтгүй", e);
        }
    }

    /** Хүлээн авагчийн тал (тест ба шалгалтад): `encrypt`-ийн урвуу. */
    public static byte[] decrypt(byte[] body, ECPrivateKey uaPrivate, byte[] uaPublic, byte[] authSecret) {
        try {
            ByteBuffer buf = ByteBuffer.wrap(body);
            byte[] salt = new byte[16];
            buf.get(salt);
            buf.getInt();
            byte[] asPublic = new byte[buf.get() & 0xff];
            buf.get(asPublic);
            byte[] ciphertext = new byte[buf.remaining()];
            buf.get(ciphertext);
            byte[][] keys = deriveKeys(ecdh(uaPrivate, asPublic), authSecret, uaPublic, asPublic, salt);
            Cipher gcm = Cipher.getInstance("AES/GCM/NoPadding");
            gcm.init(Cipher.DECRYPT_MODE, new SecretKeySpec(keys[0], "AES"), new GCMParameterSpec(128, keys[1]));
            byte[] padded = gcm.doFinal(ciphertext);
            int end = padded.length - 1;
            while (end >= 0 && padded[end] == 0) {
                end--;
            }
            return Arrays.copyOf(padded, Math.max(0, end));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Web Push тайлалт амжилтгүй", e);
        }
    }

    /** VAPID `Authorization: vapid t=<jwt>, k=<publicKey>` (RFC 8292), 12 цагийн хугацаатай. */
    public static String vapidAuthorization(URI endpoint, String subject, String publicKeyB64, String privateKeyB64,
                                            Instant now) {
        try {
            String audience = endpoint.getScheme() + "://" + endpoint.getRawAuthority();
            String header = b64(("{\"typ\":\"JWT\",\"alg\":\"ES256\"}").getBytes(StandardCharsets.UTF_8));
            String claims = b64(("{\"aud\":\"" + audience + "\",\"exp\":" + now.plusSeconds(12 * 3600).getEpochSecond()
                    + ",\"sub\":\"" + subject + "\"}").getBytes(StandardCharsets.UTF_8));
            Signature es256 = Signature.getInstance("SHA256withECDSAinP1363Format");
            es256.initSign(privateKey(unb64(privateKeyB64)));
            es256.update((header + "." + claims).getBytes(StandardCharsets.US_ASCII));
            return "vapid t=" + header + "." + claims + "." + b64(es256.sign()) + ", k=" + publicKeyB64;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("VAPID гарын үсэг амжилтгүй", e);
        }
    }

    public static KeyPair generate() throws GeneralSecurityException {
        KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
        g.initialize(new ECGenParameterSpec("secp256r1"), RANDOM);
        return g.generateKeyPair();
    }

    public static byte[] raw(ECPublicKey key) {
        byte[] out = new byte[65];
        out[0] = 0x04;
        copy32(key.getW().getAffineX(), out, 1);
        copy32(key.getW().getAffineY(), out, 33);
        return out;
    }

    public static ECPublicKey publicKey(byte[] raw) throws GeneralSecurityException {
        if (raw.length != 65 || raw[0] != 0x04) {
            throw new GeneralSecurityException("P-256 uncompressed нийтийн түлхүүр биш");
        }
        ECPoint w = new ECPoint(new BigInteger(1, Arrays.copyOfRange(raw, 1, 33)),
                new BigInteger(1, Arrays.copyOfRange(raw, 33, 65)));
        return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(w, P256));
    }

    public static ECPrivateKey privateKey(byte[] d) throws GeneralSecurityException {
        return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(new BigInteger(1, d), P256));
    }

    public static String b64(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static byte[] unb64(String s) {
        return Base64.getUrlDecoder().decode(s.strip().replace('+', '-').replace('/', '_').replace("=", ""));
    }

    private static byte[] ecdh(ECPrivateKey priv, byte[] peerRaw) throws GeneralSecurityException {
        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(priv);
        ka.doPhase(publicKey(peerRaw), true);
        return ka.generateSecret();
    }

    /** RFC 8291 §3.4: [CEK(16), NONCE(12)]. */
    private static byte[][] deriveKeys(byte[] ecdhSecret, byte[] authSecret, byte[] uaPublic, byte[] asPublic,
                                       byte[] salt) throws GeneralSecurityException {
        byte[] keyInfo = concat("WebPush: info\0".getBytes(StandardCharsets.US_ASCII), uaPublic, asPublic);
        byte[] ikm = expand(hmac(authSecret, ecdhSecret), keyInfo, 32);
        byte[] prk = hmac(salt, ikm);
        byte[] cek = expand(prk, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
        byte[] nonce = expand(prk, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);
        return new byte[][] {cek, nonce};
    }

    private static byte[] expand(byte[] prk, byte[] info, int length) throws GeneralSecurityException {
        return Arrays.copyOf(hmac(prk, concat(info, new byte[] {1})), length);
    }

    private static byte[] hmac(byte[] key, byte[] data) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    private static byte[] concat(byte[]... parts) {
        int n = 0;
        for (byte[] p : parts) {
            n += p.length;
        }
        ByteBuffer b = ByteBuffer.allocate(n);
        for (byte[] p : parts) {
            b.put(p);
        }
        return b.array();
    }

    private static void copy32(BigInteger v, byte[] out, int offset) {
        byte[] bytes = v.toByteArray();
        int len = Math.min(bytes.length, 32);
        System.arraycopy(bytes, bytes.length - len, out, offset + 32 - len, len);
    }

    private static ECParameterSpec p256() {
        try {
            AlgorithmParameters params = AlgorithmParameters.getInstance("EC");
            params.init(new ECGenParameterSpec("secp256r1"));
            return params.getParameterSpec(ECParameterSpec.class);
        } catch (GeneralSecurityException e) {
            throw new ExceptionInInitializerError(e);
        }
    }
}
