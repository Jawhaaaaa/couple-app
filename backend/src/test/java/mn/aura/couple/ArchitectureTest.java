package mn.aura.couple;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import java.util.Set;

/**
 * DD-AURA-001: `mn.aura.couple.<домэйн>.{api,app,domain}`. Домэйн хоорондын дуудлага зөвхөн
 * нөгөө домэйны `app` давхаргын public service-ээр — өөр домэйны `api` (controller) ба
 * `domain` (entity, repository)-д шууд хүрэхгүй. `common` нь домэйноос хамаарахгүй.
 * Гэрээнээс үүссэн `mn.aura.couple.api(.model)` бүх домэйнд нийтлэг.
 */
@AnalyzeClasses(packages = "mn.aura.couple", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    private static final String ROOT = "mn.aura.couple.";
    private static final Set<String> LAYERS = Set.of("api", "app", "domain");
    private static final Set<String> SHARED = Set.of("common", "testsupport");

    /** `mn.aura.couple.<домэйн>.<давхарга>…` → домэйн; бусад үед null. */
    static String domainOf(JavaClass c) {
        String pkg = c.getPackageName();
        if (!pkg.startsWith(ROOT)) {
            return null;
        }
        String[] parts = pkg.substring(ROOT.length()).split("\\.");
        return parts.length >= 2 && LAYERS.contains(parts[1]) ? parts[0] : null;
    }

    static String layerOf(JavaClass c) {
        String[] parts = c.getPackageName().substring(ROOT.length()).split("\\.");
        return parts[1];
    }

    static String topPackageOf(JavaClass c) {
        String pkg = c.getPackageName();
        if (!pkg.startsWith(ROOT)) {
            return null;
        }
        return pkg.substring(ROOT.length()).split("\\.")[0];
    }

    private static final ArchCondition<JavaClass> ONLY_APP_OF_OTHER_DOMAINS =
            new ArchCondition<>("өөр домэйны зөвхөн app давхаргад хандана") {
                @Override
                public void check(JavaClass origin, ConditionEvents events) {
                    String own = topPackageOf(origin);
                    if ("testsupport".equals(own)) {
                        return; // e2e seed нь бүх домэйны repository-г ашиглаж болно (prod-д bean-гүй)
                    }
                    for (Dependency d : origin.getDirectDependenciesFromSelf()) {
                        JavaClass target = d.getTargetClass();
                        String targetDomain = domainOf(target);
                        if (targetDomain == null || targetDomain.equals(own) || SHARED.contains(targetDomain)) {
                            continue;
                        }
                        if (!"app".equals(layerOf(target))) {
                            events.add(SimpleConditionEvent.violated(d, d.getDescription()));
                        }
                    }
                }
            };

    @ArchTest
    static final ArchRule domainsTalkThroughApp = classes()
            .that().resideInAPackage("mn.aura.couple..")
            .should(ONLY_APP_OF_OTHER_DOMAINS)
            .because("DD-AURA-001: багц хоорондын дуудлага зөвхөн app давхаргын public service-ээр");

    @ArchTest
    static final ArchRule commonIsIndependent = noClasses()
            .that().resideInAPackage("mn.aura.couple.common..")
            .should().dependOnClassesThat(new com.tngtech.archunit.base.DescribedPredicate<JavaClass>("домэйны багц") {
                @Override
                public boolean test(JavaClass c) {
                    String d = domainOf(c);
                    return d != null && !SHARED.contains(d);
                }
            })
            .because("common нь бүх домэйны суурь — домэйноос хамаарвал цикл үүснэ");

    @ArchTest
    static final ArchRule testSupportNotUsedByProduction = noClasses()
            .that().resideOutsideOfPackage("mn.aura.couple.testsupport..")
            .should().dependOnClassesThat().resideInAPackage("mn.aura.couple.testsupport..")
            .because("INV-10: тестийн хэрэгсэл prod кодоос хамааралгүй");
}
