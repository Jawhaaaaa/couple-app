package mn.aura.couple;

import java.time.Duration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.containers.wait.strategy.WaitAllStrategy;
import org.testcontainers.lifecycle.Startables;
import org.testcontainers.utility.MountableFile;

/**
 * Integration тестийн суурь: Postgres, SeaweedFS (S3), Mailpit — JVM-д нэг удаа асна (singleton),
 * бүх Spring context хуваалцана. Profile `test`; дэд анги `@ActiveProfiles("e2e")` нэмж болно
 * (`inheritProfiles` анхдагчаар `test`-тэй нийлнэ).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
// Context бүр нэг DB хуваалцаж фон JobRunner нь бусад тестийн ажлыг (VIDEO_TRANSCODE г.м.) авч болно.
// ItBeans-гүй context хостын ffprobe-оор унагаад backoff-д оруулдаг байсан (VideoTranscodeIT-ийн тогтворгүй уналт).
@Import(ItBeans.class)
public abstract class AbstractIntegrationTest {

    public static final String S3_ACCESS_KEY = "aura-dev-access";
    public static final String S3_SECRET_KEY = "aura-dev-secret-change-me";

    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("aura")
            .withUsername("aura")
            .withPassword("aura");

    static final GenericContainer<?> SEAWEEDFS = new GenericContainer<>("chrislusf/seaweedfs:3.97")
            .withCommand("server", "-s3", "-s3.config=/etc/seaweedfs/s3.json", "-dir=/data")
            .withCopyFileToContainer(MountableFile.forClasspathResource("seaweedfs-s3.json"), "/etc/seaweedfs/s3.json")
            .withExposedPorts(8333, 9333)
            // Master (9333) ба S3 gateway (8333) хоёулаа бэлэн болтол (compose-ийн healthcheck-тэй ижил)
            .waitingFor(new WaitAllStrategy()
                    .withStrategy(Wait.forHttp("/cluster/status").forPort(9333).forStatusCode(200))
                    .withStrategy(Wait.forHttp("/status").forPort(8333).forStatusCode(200))
                    .withStartupTimeout(Duration.ofMinutes(2)));

    static final GenericContainer<?> MAILPIT = new GenericContainer<>("axllent/mailpit:v1.27")
            .withExposedPorts(1025, 8025)
            .withEnv("MP_SMTP_AUTH_ACCEPT_ANY", "1")
            .withEnv("MP_SMTP_AUTH_ALLOW_INSECURE", "1")
            .waitingFor(Wait.forHttp("/readyz").forPort(8025).forStatusCode(200));

    static {
        Startables.deepStart(POSTGRES, SEAWEEDFS, MAILPIT).join();
    }

    @LocalServerPort
    protected int port;

    @DynamicPropertySource
    static void containerProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("aura.s3.endpoint", AbstractIntegrationTest::s3Endpoint);
        registry.add("aura.s3.public-endpoint", AbstractIntegrationTest::s3Endpoint);
        registry.add("aura.s3.access-key", () -> S3_ACCESS_KEY);
        registry.add("aura.s3.secret-key", () -> S3_SECRET_KEY);
        registry.add("aura.s3.bucket", () -> "aura-media-test");
        registry.add("spring.mail.host", MAILPIT::getHost);
        registry.add("spring.mail.port", () -> MAILPIT.getMappedPort(1025));
    }

    public static String s3Endpoint() {
        return "http://" + SEAWEEDFS.getHost() + ":" + SEAWEEDFS.getMappedPort(8333);
    }

    public static String mailpitApi() {
        return "http://" + MAILPIT.getHost() + ":" + MAILPIT.getMappedPort(8025);
    }

    protected String url(String path) {
        return "http://localhost:" + port + path;
    }
}
