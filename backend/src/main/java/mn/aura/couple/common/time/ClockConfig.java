package mn.aura.couple.common.time;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/** Prod/dev-д системийн UTC цаг; `e2e`-д л удирдагдах `MutableClock` (INV-10). */
@Configuration(proxyBeanMethods = false)
public class ClockConfig {

    @Bean
    @Profile("!e2e")
    Clock systemClock() {
        return Clock.systemUTC();
    }

    @Bean
    @Profile("e2e")
    MutableClock mutableClock() {
        return new MutableClock(Clock.systemUTC());
    }
}
