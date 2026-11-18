package mn.aura.couple.common.observability;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Логт хэзээ ч гарах ёсгүй талбар (INV-11, AC-196): мессеж, захидал, асуултын хариулт,
 * нууц үг, токен, код. `LogRedaction` нь `toString`/MDC-д утгыг `***` болгоно.
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.FIELD, ElementType.RECORD_COMPONENT, ElementType.METHOD, ElementType.PARAMETER})
public @interface Sensitive {
}
