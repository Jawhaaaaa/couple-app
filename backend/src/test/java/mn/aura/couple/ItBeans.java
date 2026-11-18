package mn.aura.couple;

import mn.aura.couple.media.DockerCommandRunner;
import mn.aura.couple.media.app.CommandRunner;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** IT-ийн нийтлэг орлуулагч bean-ууд (бүх `AbstractAuthIT` нэг context хуваалцана). */
@TestConfiguration(proxyBeanMethods = false)
public class ItBeans {

    /** ffmpeg хостод байхгүй — контейнер дотор (`DockerCommandRunner`). */
    @Bean
    @Primary
    CommandRunner dockerCommandRunner() {
        return new DockerCommandRunner();
    }
}
