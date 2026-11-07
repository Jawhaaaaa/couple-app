package mn.aura.couple.auth.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.Enumeration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Web client `POST /auth/refresh`-ийг биегүй (зөвхөн `aura_rt` cookie + `X-Aura-Client: web`) илгээдэг.
 * Үүсгэсэн `AuthApi` нь `consumes = application/json` зарладаг бөгөөд интерфейсийн
 * `@RequestBody(required = false)`-ийг Spring-ийн consumes нөхцөл хардаггүй тул Content-Type-гүй
 * хүсэлт 415 болно. Энэ замд л Content-Type байхгүй бол `application/json` гэж үзнэ (бие нь хоосон → null).
 */
@Component
public class RefreshContentTypeFilter extends OncePerRequestFilter {

    static final String REFRESH_PATH = "/api/v1/auth/refresh";

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod()) || request.getContentType() != null
                || !REFRESH_PATH.equals(request.getRequestURI().substring(request.getContextPath().length()));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        chain.doFilter(new HttpServletRequestWrapper(request) {
            @Override
            public String getContentType() {
                return MediaType.APPLICATION_JSON_VALUE;
            }

            @Override
            public String getHeader(String name) {
                return HttpHeaders.CONTENT_TYPE.equalsIgnoreCase(name) ? MediaType.APPLICATION_JSON_VALUE : super.getHeader(name);
            }

            @Override
            public Enumeration<String> getHeaders(String name) {
                return HttpHeaders.CONTENT_TYPE.equalsIgnoreCase(name)
                        ? Collections.enumeration(java.util.List.of(MediaType.APPLICATION_JSON_VALUE))
                        : super.getHeaders(name);
            }

            @Override
            public Enumeration<String> getHeaderNames() {
                java.util.List<String> names = Collections.list(super.getHeaderNames());
                names.add(HttpHeaders.CONTENT_TYPE);
                return Collections.enumeration(names);
            }
        }, response);
    }
}
