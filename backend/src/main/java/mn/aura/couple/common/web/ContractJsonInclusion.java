package mn.aura.couple.common.web;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.introspect.Annotated;
import com.fasterxml.jackson.databind.introspect.AnnotatedField;
import com.fasterxml.jackson.databind.introspect.AnnotatedMember;
import com.fasterxml.jackson.databind.introspect.AnnotatedMethod;
import com.fasterxml.jackson.databind.introspect.NopAnnotationIntrospector;
import com.fasterxml.jackson.databind.module.SimpleModule;
import java.lang.reflect.AnnotatedElement;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;

/**
 * Гэрээний `required` талбарыг хариунд үргэлж бичнэ — утга нь `null` байсан ч (`required` +
 * `type: [x, 'null']`, жишээ нь `MemoryPage.nextCursor`, `CoupleMyView.partnerNickname`).
 *
 * <p>Глобал анхдагч нь {@code always} (`application.yml`). Харин гэрээнд `required` биш талбар
 * `null` үед хариунаас хасагдана: `nullable` биш optional талбарт `null` бичвэл schema зөрчинө.
 * Үүсгэсэн DTO-д (`mn.aura.couple.api.model`) openapi-generator нь зөвхөн `required` биш талбарын
 * getter/field-д {@link Nullable} тавьдаг тул тэр тэмдгээр л `NON_NULL` хэрэглэнэ — DTO тус бүрд
 * `@JsonInclude(NON_NULL)` бичсэнтэй ижил, гэхдээ үүсгэсэн кодыг гараар засахгүй.
 * Дүрэм гэрээтэй тохирохыг {@code ContractJsonInclusionTest} бүх schema дээр шалгана.
 */
@Component
public class ContractJsonInclusion extends SimpleModule {

    public ContractJsonInclusion() {
        super("aura-contract-inclusion");
    }

    @Override
    public void setupModule(SetupContext context) {
        super.setupModule(context);
        context.insertAnnotationIntrospector(new OptionalFieldIntrospector());
    }

    static final class OptionalFieldIntrospector extends NopAnnotationIntrospector {

        private static final JsonInclude.Value OMIT_NULL = JsonInclude.Value.construct(
                JsonInclude.Include.NON_NULL, JsonInclude.Include.USE_DEFAULTS);

        @Override
        public JsonInclude.Value findPropertyInclusion(Annotated a) {
            if (a instanceof AnnotatedMember member
                    && ContractEnumConverters.MODEL_PACKAGE.equals(member.getDeclaringClass().getPackageName())
                    && isOptional(member)) {
                return OMIT_NULL;
            }
            return JsonInclude.Value.empty();
        }

        private static boolean isOptional(AnnotatedMember member) {
            AnnotatedElement element = switch (member) {
                case AnnotatedMethod method -> method.getAnnotated();
                case AnnotatedField field -> field.getAnnotated();
                default -> null;
            };
            return element != null && element.isAnnotationPresent(Nullable.class);
        }
    }
}
