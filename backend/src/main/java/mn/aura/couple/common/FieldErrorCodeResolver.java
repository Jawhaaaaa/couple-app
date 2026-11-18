package mn.aura.couple.common;

import org.springframework.lang.Nullable;
import org.springframework.validation.FieldError;

/**
 * Гэрээнээс үүссэн DTO-ийн Bean Validation алдааг тодорхой код болгох өргөтгөл. Жишээ нь
 * `RegisterRequest.password`-ийн `@Size(min = 8)` → `PASSWORD_WEAK` (AC-164). Домэйн бүр өөрийн
 * bean-ыг нэмнэ; `null` бол дараагийнх, эцэст нь `VALIDATION_FAILED`.
 */
public interface FieldErrorCodeResolver {

    @Nullable
    ErrorCode resolve(FieldError error);
}
