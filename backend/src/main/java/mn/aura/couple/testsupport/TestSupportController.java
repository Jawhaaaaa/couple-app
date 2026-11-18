package mn.aura.couple.testsupport;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import mn.aura.couple.api.TestSupportApi;
import mn.aura.couple.api.model.JobRunResult;
import mn.aura.couple.api.model.PushSinkCreated;
import mn.aura.couple.api.model.PushSinkMessage;
import mn.aura.couple.api.model.PushSinkResponse;
import mn.aura.couple.api.model.SeedRequest;
import mn.aura.couple.api.model.SeedResult;
import mn.aura.couple.api.model.TestClockRequest;
import mn.aura.couple.api.model.TestMail;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.job.TestRunnableJob;
import mn.aura.couple.common.mail.MailCapture;
import mn.aura.couple.common.mail.MailMessage;
import mn.aura.couple.common.time.MutableClock;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * Тестийн хэрэгсэл (DD-AURA-011, TQ-02) — зөвхөн `e2e` profile. Prod-д bean үүсэхгүй ба
 * `SecurityConfig` нь `/api/v1/test/**`-д 404 буцаана (INV-10, `TestSupportAbsentIT`).
 *
 * <p>`/test/seed` одоогоор stub: зөвхөн бүртгэгдсэн `TestSeedScenario` bean-ыг дуудна, суурь
 * `EMPTY` scenario хоосон үр дүн буцаана. Домэйн нэгжүүд (T-16, T-17…) scenario нэмнэ.
 * `/test/mail/last` нь `MailCapture`-аас (T-17 `MailSender` илгээх бүрд бүртгэнэ).
 */
@RestController
@Profile("e2e")
public class TestSupportController implements TestSupportApi {

    static final String EMPTY_SCENARIO = "EMPTY";

    private final MutableClock clock;
    private final TimeProvider time;
    private final Map<String, TestRunnableJob> jobs;
    private final Map<String, TestSeedScenario> scenarios;
    private final PushSinkStore pushSinks;
    private final MailCapture mails;
    private final HttpServletRequest request;

    public TestSupportController(MutableClock clock, TimeProvider time, List<TestRunnableJob> jobs,
                                 List<TestSeedScenario> scenarios, PushSinkStore pushSinks, MailCapture mails,
                                 HttpServletRequest request) {
        this.clock = clock;
        this.time = time;
        this.jobs = jobs.stream().collect(Collectors.toUnmodifiableMap(TestRunnableJob::name, Function.identity()));
        this.scenarios = scenarios.stream().collect(Collectors.toUnmodifiableMap(TestSeedScenario::name, Function.identity()));
        this.pushSinks = pushSinks;
        this.mails = mails;
        this.request = request;
    }

    @Override
    public ResponseEntity<Void> setTestClock(TestClockRequest body) {
        clock.set(body.getNow().toInstant());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> resetTestClock() {
        clock.reset();
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<SeedResult> seedScenario(SeedRequest body) {
        if (EMPTY_SCENARIO.equals(body.getScenario())) {
            return ResponseEntity.ok(new SeedResult(new ArrayList<>(), new ArrayList<>(), new HashMap<>()));
        }
        TestSeedScenario scenario = scenarios.get(body.getScenario());
        if (scenario == null) {
            throw ApiException.validation("scenario", ErrorCode.VALIDATION_FAILED);
        }
        Map<String, Object> params = body.getParams() == null ? Map.of() : body.getParams();
        return ResponseEntity.ok(scenario.seed(params));
    }

    @Override
    public ResponseEntity<JobRunResult> runJob(String jobName) {
        TestRunnableJob job = jobs.get(jobName);
        if (job == null) {
            throw ApiException.notFound();
        }
        return ResponseEntity.ok(new JobRunResult(job.runOnce()));
    }

    @Override
    public ResponseEntity<PushSinkCreated> createPushSink() {
        UUID id = pushSinks.create();
        URI endpoint = ServletUriComponentsBuilder.fromContextPath(request)
                .path("/api/v1/test/push-sink/{id}/receive")
                .buildAndExpand(id)
                .toUri();
        return ResponseEntity.status(HttpStatus.CREATED).body(new PushSinkCreated(id, endpoint));
    }

    @Override
    public ResponseEntity<List<PushSinkMessage>> listPushSinkMessages(UUID sinkId) {
        List<PushSinkMessage> out = pushSinks.messages(sinkId).orElseThrow(ApiException::notFound).stream()
                .map(m -> new PushSinkMessage(m.receivedAt(), m.headers(), Base64.getEncoder().encodeToString(m.body())))
                .toList();
        return ResponseEntity.ok(out);
    }

    @Override
    public ResponseEntity<Void> setPushSinkResponse(UUID sinkId, PushSinkResponse body) {
        if (!pushSinks.respondWith(sinkId, body.getStatus())) {
            throw ApiException.notFound();
        }
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> receivePushSink(UUID sinkId, Resource body) {
        byte[] bytes;
        try (InputStream in = body.getInputStream()) {
            bytes = in.readAllBytes();
        } catch (IOException e) {
            throw ApiException.validation("body", ErrorCode.VALIDATION_FAILED);
        }
        Map<String, String> headers = new LinkedHashMap<>();
        for (String name : Collections.list(request.getHeaderNames())) {
            headers.put(name.toLowerCase(), request.getHeader(name));
        }
        int status = pushSinks.receive(sinkId, new PushSinkStore.Message(time.nowUtc(), headers, bytes))
                .orElseThrow(ApiException::notFound);
        return ResponseEntity.status(status).build();
    }

    /** AC-01: тухайн хаягт сүүлд илгээсэн имэйлийн гарчиг, 6 оронтой код, холбоос (`MailCapture`). */
    @Override
    public ResponseEntity<TestMail> getLastMail(String to) {
        MailMessage mail = mails.last(to).orElseThrow(ApiException::notFound);
        TestMail out = new TestMail(mail.subject());
        out.setCode(mail.code());
        out.setLink(mail.link() == null ? null : URI.create(mail.link()));
        return ResponseEntity.ok(out);
    }
}
