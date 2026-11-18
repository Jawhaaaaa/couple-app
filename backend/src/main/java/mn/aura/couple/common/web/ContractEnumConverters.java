package mn.aura.couple.common.web;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.core.convert.converter.ConverterFactory;
import org.springframework.format.FormatterRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Гэрээнээс үүссэн enum (`mn.aura.couple.api.model.*`) нь утгаараа (`en`, `bucket`, `upcoming`)
 * query/path параметрт ирдэг; Spring-ийн анхдагч хөрвүүлэлт тогтмолын нэрээр (`EN`) хайдаг тул
 * үүсгэсэн `fromValue`-г ашиглана. Таарахгүй утга → 400 `VALIDATION_FAILED`.
 */
@Configuration(proxyBeanMethods = false)
public class ContractEnumConverters implements WebMvcConfigurer {

    static final String MODEL_PACKAGE = "mn.aura.couple.api.model";

    @Override
    public void addFormatters(FormatterRegistry registry) {
        registry.addConverterFactory(new FromValueFactory());
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    static final class FromValueFactory implements ConverterFactory<String, Enum> {

        @Override
        public <T extends Enum> Converter<String, T> getConverter(Class<T> type) {
            Method fromValue = fromValue(type);
            if (fromValue == null) {
                return source -> source == null || source.isBlank() ? null : (T) Enum.valueOf(type, source.strip());
            }
            return source -> {
                if (source == null || source.isBlank()) {
                    return null;
                }
                try {
                    return (T) fromValue.invoke(null, source.strip());
                } catch (InvocationTargetException e) {
                    throw new IllegalArgumentException("Буруу утга: " + source, e.getCause());
                } catch (IllegalAccessException e) {
                    throw new IllegalStateException(e);
                }
            };
        }

        private static Method fromValue(Class<?> type) {
            Class<?> declaring = type.isMemberClass() ? type.getEnclosingClass() : type;
            if (declaring == null || !MODEL_PACKAGE.equals(type.getPackageName())) {
                return null;
            }
            try {
                return type.getMethod("fromValue", String.class);
            } catch (NoSuchMethodException e) {
                return null;
            }
        }
    }
}
