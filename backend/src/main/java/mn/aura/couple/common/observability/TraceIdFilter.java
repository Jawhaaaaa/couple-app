package mn.aura.couple.common.observability;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.HexFormat;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Хүсэлт бүрд `traceId` (32 hex) — W3C `traceparent` ирсэн бол түүнийхийг авна.
 * MDC-д тавьж JSON логт ба `ApiError.traceId`-д орно; хариуны `X-Trace-Id` толгойд буцна.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {

    public static final String MDC_KEY = "traceId";
    public static final String HEADER = "X-Trace-Id";
    private static final Pattern TRACEPARENT = Pattern.compile("^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String traceId = fromTraceparent(request.getHeader("traceparent"));
        if (traceId == null) {
            traceId = newTraceId();
        }
        MDC.put(MDC_KEY, traceId);
        response.setHeader(HEADER, traceId);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }

    /** Одоогийн хүсэлтийн traceId; хүсэлтийн гадна шинийг үүсгэнэ. */
    public static String currentTraceId() {
        String id = MDC.get(MDC_KEY);
        return id != null ? id : newTraceId();
    }

    static String newTraceId() {
        byte[] bytes = new byte[16];
        ThreadLocalRandom.current().nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    private static String fromTraceparent(String header) {
        if (header == null) {
            return null;
        }
        var m = TRACEPARENT.matcher(header.trim());
        return m.matches() ? m.group(1) : null;
    }
}
