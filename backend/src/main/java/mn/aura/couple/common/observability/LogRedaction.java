package mn.aura.couple.common.observability;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.MDC;

/**
 * `@Sensitive` талбарыг логоос хасах хэрэгсэл (DD-AURA-037, AC-196).
 *
 * <ul>
 *   <li>DTO-ийн `toString()` нь `LogRedaction.toString(this)`-г буцаана — Spring-ийн DEBUG лог
 *       (`Read "application/json" to [...]`) ч мөн `toString`-оор бичдэг.</li>
 *   <li>MDC-д утга тавихдаа `putMdc` — `@Sensitive` бол `***`.</li>
 *   <li>Request body-г логлох filter (`CommonsRequestLoggingFilter`) бүртгэхгүй, `spring.mvc.log-request-details=false`.</li>
 * </ul>
 */
public final class LogRedaction {

    public static final String MASK = "***";

    private LogRedaction() {
    }

    /** `Type[a=1, secret=***]` хэлбэрийн мөр — `@Sensitive` талбарын утгыг хэзээ ч оруулахгүй. */
    public static String toString(Object dto) {
        if (dto == null) {
            return "null";
        }
        StringBuilder sb = new StringBuilder(dto.getClass().getSimpleName()).append('[');
        List<String> parts = new ArrayList<>();
        redact(dto).forEach((k, v) -> parts.add(k + "=" + v));
        return sb.append(String.join(", ", parts)).append(']').toString();
    }

    /** Талбарын нэр → утга (`@Sensitive` бол `***`). Бүтэцтэй лог (StructuredArguments)-д. */
    public static Map<String, Object> redact(Object dto) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (dto == null) {
            return out;
        }
        Class<?> type = dto.getClass();
        if (type.isRecord()) {
            for (RecordComponent rc : type.getRecordComponents()) {
                boolean sensitive = rc.isAnnotationPresent(Sensitive.class) || fieldIsSensitive(type, rc.getName());
                out.put(rc.getName(), sensitive ? MASK : read(rc, dto));
            }
            return out;
        }
        for (Class<?> c = type; c != null && c != Object.class; c = c.getSuperclass()) {
            for (Field f : c.getDeclaredFields()) {
                if (Modifier.isStatic(f.getModifiers()) || f.isSynthetic()) {
                    continue;
                }
                out.putIfAbsent(f.getName(), f.isAnnotationPresent(Sensitive.class) ? MASK : read(f, dto));
            }
        }
        return out;
    }

    /** MDC-д утга тавина; `sensitive` бол `***`. */
    public static void putMdc(String key, Object value, boolean sensitive) {
        MDC.put(key, sensitive ? MASK : String.valueOf(value));
    }

    /** Мөрийн утгыг бүхэлд нь далдална (урт нь ч ил гарахгүй). */
    public static String mask(Object value) {
        return value == null ? "null" : MASK;
    }

    private static boolean fieldIsSensitive(Class<?> type, String name) {
        try {
            return type.getDeclaredField(name).isAnnotationPresent(Sensitive.class);
        } catch (NoSuchFieldException e) {
            return false;
        }
    }

    private static Object read(RecordComponent rc, Object dto) {
        try {
            var accessor = rc.getAccessor();
            accessor.trySetAccessible();
            return accessor.invoke(dto);
        } catch (ReflectiveOperationException | RuntimeException e) {
            return "?";
        }
    }

    private static Object read(Field f, Object dto) {
        try {
            if (!f.trySetAccessible()) {
                return "?";
            }
            return f.get(dto);
        } catch (IllegalAccessException | RuntimeException e) {
            return "?";
        }
    }
}
