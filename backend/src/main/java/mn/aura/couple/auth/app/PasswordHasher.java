package mn.aura.couple.auth.app;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Argon2id (DD-AURA-030, AC-195): m = 19 MiB, t = 2, p = 1 (OWASP-ийн доод санал), давс 16 байт,
 * hash 32 байт. Хэрэглэгч олдоогүй үед ч `matchesDummy` нь ижил зардалтай тооцоолол хийнэ
 * (имэйл бүртгэлтэй эсэх нь хугацаагаар ил гарахгүй — DD-AURA-031).
 *
 * <p>`aura.auth.password.hash` тоолуур нь hash/шалгалтын тоо — AC-02-ийн тест хоёр замд ч hash
 * тооцсоныг үүгээр баталдаг.
 */
@Component
public class PasswordHasher {

    public static final String METRIC = "aura.auth.password.hash";

    static final int SALT_LENGTH = 16;
    static final int HASH_LENGTH = 32;
    static final int PARALLELISM = 1;
    static final int MEMORY_KIB = 19 * 1024;
    static final int ITERATIONS = 2;

    private final Argon2PasswordEncoder encoder =
            new Argon2PasswordEncoder(SALT_LENGTH, HASH_LENGTH, PARALLELISM, MEMORY_KIB, ITERATIONS);
    private final String dummyHash;
    private final Counter counter;

    public PasswordHasher(MeterRegistry registry) {
        this.counter = Counter.builder(METRIC).description("Argon2id hash ба шалгалтын тоо").register(registry);
        this.dummyHash = encoder.encode("aura-dummy-password-for-timing");
    }

    public String hash(String rawPassword) {
        counter.increment();
        return encoder.encode(rawPassword);
    }

    public boolean matches(String rawPassword, String hash) {
        counter.increment();
        if (hash == null || hash.isBlank()) {
            encoder.matches(rawPassword, dummyHash);
            return false;
        }
        return encoder.matches(rawPassword, hash);
    }

    /** Хэрэглэгч олдоогүй үеийн ижил зардалтай шалгалт. */
    public void matchesDummy(String rawPassword) {
        counter.increment();
        encoder.matches(rawPassword == null ? "" : rawPassword, dummyHash);
    }
}
