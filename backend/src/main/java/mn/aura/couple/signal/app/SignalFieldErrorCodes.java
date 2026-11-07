package mn.aura.couple.signal.app;

import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.FieldErrorCodeResolver;
import org.springframework.stereotype.Component;
import org.springframework.validation.FieldError;

/**
 * «Чамайг бодож байна»-гийн `maxLength: 80` (`@Size`) нь service-ээс өмнө ажилладаг тул гэрээний
 * `TEXT_TOO_LONG` (AC-77) болгоно.
 */
@Component
public class SignalFieldErrorCodes implements FieldErrorCodeResolver {

    @Override
    public ErrorCode resolve(FieldError error) {
        if ("signalRequest".equals(error.getObjectName()) && "text".equals(error.getField())
                && error.getRejectedValue() instanceof String s && s.length() > HeartSignalService.TEXT_MAX) {
            return ErrorCode.TEXT_TOO_LONG;
        }
        return null;
    }
}
