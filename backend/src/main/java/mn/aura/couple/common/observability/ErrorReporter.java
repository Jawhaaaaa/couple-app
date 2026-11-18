package mn.aura.couple.common.observability;

import io.sentry.Sentry;
import io.sentry.SentryOptions;
import java.time.Duration;
import mn.aura.couple.common.config.AuraProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Алдааны тайлан (DD-AURA-037, AC-201). `aura.sentry.dsn` хоосон бол Sentry init хийгдэхгүй —
 * гадагш илгээлт 0. PII илгээхгүй (`sendDefaultPii=false`), request body Sentry-д хэзээ ч орохгүй.
 */
@Component
public class ErrorReporter implements DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(ErrorReporter.class);

    private final boolean enabled;

    public ErrorReporter(AuraProperties properties) {
        AuraProperties.Sentry cfg = properties.sentry();
        this.enabled = StringUtils.hasText(cfg.dsn());
        if (enabled) {
            Sentry.init(options -> configure(options, cfg));
            log.info("Sentry идэвхтэй (environment={})", cfg.environment());
        } else {
            log.info("Sentry DSN хоосон — алдааны тайлан гадагш илгээгдэхгүй");
        }
    }

    private static void configure(SentryOptions options, AuraProperties.Sentry cfg) {
        options.setDsn(cfg.dsn());
        options.setEnvironment(cfg.environment());
        if (StringUtils.hasText(cfg.release())) {
            options.setRelease(cfg.release());
        }
        options.setSendDefaultPii(false);
        options.setAttachStacktrace(true);
        options.setEnableAutoSessionTracking(false);
        options.setSendClientReports(false);
        options.setTracesSampleRate(null);
        // Хэрэглэгчийн текст breadcrumb-аар (лог) дамжиж гарахгүй
        options.setMaxBreadcrumbs(0);
    }

    public boolean isEnabled() {
        return enabled;
    }

    /** Боловсруулаагүй алдааг илгээнэ (DSN хоосон бол юу ч хийхгүй). */
    public void report(Throwable error) {
        if (enabled) {
            Sentry.captureException(error);
        }
    }

    /** Илгээгээгүй үйл явдлыг хүлээж дуусгана (тест ба унтрах үед). */
    public void flush(Duration timeout) {
        if (enabled) {
            Sentry.flush(timeout.toMillis());
        }
    }

    @Override
    public void destroy() {
        if (enabled) {
            Sentry.close();
        }
    }
}
