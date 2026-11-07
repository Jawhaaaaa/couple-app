package mn.aura.couple.common.web;

import java.util.function.Predicate;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.ClassUtils;
import org.springframework.web.servlet.config.annotation.PathMatchConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Гэрээний `servers: [/api/v1]`. Гэрээнээс үүссэн интерфейс (`mn.aura.couple.api.*Api`) нь
 * замыг `/api/v1`-гүйгээр зарладаг тул түүнийг хэрэгжүүлсэн controller бүрд угтвар нэмнэ.
 */
@Configuration(proxyBeanMethods = false)
public class ApiPathConfig implements WebMvcConfigurer {

    public static final String API_PREFIX = "/api/v1";
    static final String CONTRACT_PACKAGE = "mn.aura.couple.api";

    static final Predicate<Class<?>> IMPLEMENTS_CONTRACT = type ->
            ClassUtils.getAllInterfacesForClassAsSet(type).stream()
                    .anyMatch(i -> CONTRACT_PACKAGE.equals(i.getPackageName()));

    @Override
    public void configurePathMatch(PathMatchConfigurer configurer) {
        configurer.addPathPrefix(API_PREFIX, IMPLEMENTS_CONTRACT);
    }
}
