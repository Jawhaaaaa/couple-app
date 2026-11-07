package mn.aura.couple.media.app;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Хост/контейнерийн процесс (`ProcessBuilder`). Хугацаа хэтэрвэл (10 мин) зогсооно. IT нь `@Primary` орлуулагчтай. */
@Configuration(proxyBeanMethods = false)
public class LocalCommandRunner {

    @Bean
    CommandRunner processCommandRunner() {
        return LocalCommandRunner::run;
    }

    static CommandRunner.Result run(Path workDir, List<String> command) throws IOException, InterruptedException {
        Path out = Files.createTempFile(workDir, "out", ".log");
        Path err = Files.createTempFile(workDir, "err", ".log");
        Process p = new ProcessBuilder(command).directory(workDir.toFile())
                .redirectOutput(out.toFile()).redirectError(err.toFile()).start();
        if (!p.waitFor(10, TimeUnit.MINUTES)) {
            p.destroyForcibly();
            throw new IOException("Хугацаа хэтэрсэн: " + command.get(0));
        }
        return new CommandRunner.Result(p.exitValue(), Files.readString(out, StandardCharsets.UTF_8),
                Files.readString(err, StandardCharsets.UTF_8));
    }
}
