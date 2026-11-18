package mn.aura.couple.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import mn.aura.couple.common.ApiErrorWriter;
import mn.aura.couple.common.ErrorCode;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Stateless API хамгаалалт. Нийтийн: health, prometheus, auth, policies, version.
 * `/api/v1/test/**` нь зөвхөн `e2e` profile-д нээлттэй; бусад үед 404 `NOT_FOUND` (INV-10) —
 * 401 ч биш, тийм зам байгааг ч ил гаргахгүй.
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
public class SecurityConfig {

    static final String TEST_PATHS = "/api/v1/test/**";
    static final String AUTH_PATH_PREFIX = "/api/v1/auth/";
    static final String LOGOUT_PATH = "/api/v1/auth/logout";
    static final String[] PUBLIC_PATHS = {
            "/actuator/health/**",
            "/actuator/prometheus",
            "/api/v1/auth/**",
            "/api/v1/policies/**",
            "/api/v1/version",
            // STOMP CONNECT-ийн `Authorization`-оор нэвтэрнэ (CoupleChannelInterceptor)
            "/ws",
            "/error"
    };

    @Bean
    @Order(1)
    SecurityFilterChain testSupportChain(HttpSecurity http, Environment env, ApiErrorWriter writer) throws Exception {
        stateless(http.securityMatcher(TEST_PATHS));
        if (env.acceptsProfiles(Profiles.of("e2e"))) {
            http.authorizeHttpRequests(a -> a.anyRequest().permitAll());
        } else {
            http.authorizeHttpRequests(a -> a.anyRequest().denyAll())
                    .exceptionHandling(e -> e
                            .authenticationEntryPoint((req, res, ex) -> writer.write(req, res, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND))
                            .accessDeniedHandler((req, res, ex) -> writer.write(req, res, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND)));
        }
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain apiChain(HttpSecurity http, ApiErrorWriter writer,
                                 ObjectProvider<BearerTokenAuthenticator> authenticator) throws Exception {
        AuthenticationEntryPoint entryPoint = (req, res, ex) -> writer.write(req, res, HttpStatus.UNAUTHORIZED,
                ex instanceof ApiAuthenticationException api ? api.code() : ErrorCode.TOKEN_INVALID);
        AccessDeniedHandler denied = (req, res, ex) -> writer.write(req, res, HttpStatus.FORBIDDEN, ErrorCode.NOT_OWNER);
        stateless(http)
                .authorizeHttpRequests(a -> a
                        .requestMatchers(PUBLIC_PATHS).permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(e -> e.authenticationEntryPoint(entryPoint).accessDeniedHandler(denied))
                .addFilterBefore(new BearerTokenFilter(authenticator, entryPoint), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private static HttpSecurity stateless(HttpSecurity http) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
    }

    /**
     * `Authorization: Bearer …`-г `BearerTokenAuthenticator`-оор шалгана. Bean биш (servlet filter
     * болж давхар бүртгэгдэхгүйн тулд) — зөвхөн security chain дотор.
     */
    static final class BearerTokenFilter extends OncePerRequestFilter {

        private final ObjectProvider<BearerTokenAuthenticator> authenticator;
        private final AuthenticationEntryPoint entryPoint;

        BearerTokenFilter(ObjectProvider<BearerTokenAuthenticator> authenticator, AuthenticationEntryPoint entryPoint) {
            this.authenticator = authenticator;
            this.entryPoint = entryPoint;
        }

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            String header = request.getHeader(HttpHeaders.AUTHORIZATION);
            BearerTokenAuthenticator auth = authenticator.getIfAvailable();
            if (auth != null && header != null && header.regionMatches(true, 0, "Bearer ", 0, 7)) {
                try {
                    Optional<Authentication> result = auth.authenticate(header.substring(7).trim());
                    result.ifPresent(a -> SecurityContextHolder.getContext().setAuthentication(a));
                } catch (AuthenticationException ex) {
                    SecurityContextHolder.clearContext();
                    if (!ignoresBearerFailure(request)) {
                        entryPoint.commence(request, response, ex);
                        return;
                    }
                }
            }
            chain.doFilter(request, response);
        }

        /**
         * Нийтийн auth замууд (`/auth/refresh`, `/auth/login` …) хугацаа дууссан access-тэй хүсэлтийг
         * анонимоор хүлээн авна — client бүх хүсэлтэд Bearer хавсаргасан ч refresh ажиллана.
         * `/auth/logout` нь session-ээ таних ёстой тул хамаарахгүй.
         */
        static boolean ignoresBearerFailure(HttpServletRequest request) {
            String path = request.getRequestURI().substring(request.getContextPath().length());
            return path.startsWith(AUTH_PATH_PREFIX) && !path.equals(LOGOUT_PATH);
        }
    }
}
