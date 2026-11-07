package mn.aura.couple.media;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import mn.aura.couple.media.app.CommandRunner;
import org.testcontainers.containers.Container;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.MountableFile;

/**
 * IT-д ffmpeg/ffprobe-ийг контейнер дотор ажиллуулна (хостод ffmpeg шаардахгүй). Prod-ийн image-д
 * ffmpeg суусан (T-32) тул `LocalCommandRunner` шууд дууддаг — аргументууд ижил.
 * Контейнер эхний дуудлагад л асна.
 */
public final class DockerCommandRunner implements CommandRunner {

    private static GenericContainer<?> container;

    private static synchronized GenericContainer<?> container() {
        if (container == null) {
            container = new GenericContainer<>("jrottenberg/ffmpeg:6.1-alpine")
                    .withCreateContainerCmdModifier(cmd -> cmd.withEntrypoint("sh", "-c", "mkdir -p /work && sleep infinity"));
            container.start();
        }
        return container;
    }

    @Override
    public synchronized Result run(Path workDir, List<String> command) throws IOException, InterruptedException {
        GenericContainer<?> c = container();
        c.execInContainer("sh", "-c", "rm -rf /work && mkdir -p /work");
        try (Stream<Path> files = Files.list(workDir)) {
            for (Path f : files.filter(Files::isRegularFile).toList()) {
                c.copyFileToContainer(MountableFile.forHostPath(f), "/work/" + f.getFileName());
            }
        }
        List<String> argv = new ArrayList<>(List.of("sh", "-c", "cd /work && exec \"$@\"", "sh"));
        argv.addAll(command);
        Container.ExecResult r = c.execInContainer(argv.toArray(String[]::new));
        String listing = c.execInContainer("sh", "-c", "ls -1 /work").getStdout();
        for (String name : listing.split("\\R")) {
            if (!name.isBlank()) {
                c.copyFileFromContainer("/work/" + name.strip(), workDir.resolve(name.strip()).toString());
            }
        }
        return new Result(r.getExitCode(), r.getStdout(), r.getStderr());
    }

    /** Тестийн оролт: lavfi-ээр `seconds` урт, 1920×1080, дуутай видео үүсгэнэ. */
    public byte[] testVideo(int seconds) throws Exception {
        Path dir = Files.createTempDirectory("aura-testvideo-");
        Result r = run(dir, List.of("ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i",
                "testsrc=size=1920x1080:rate=24:duration=" + seconds, "-f", "lavfi", "-i",
                "sine=frequency=440:duration=" + seconds, "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
                "-metadata", "location=+47.9077+106.8832/", "-shortest", "in.mp4"));
        if (!r.ok()) {
            throw new IllegalStateException(r.stderr());
        }
        return Files.readAllBytes(dir.resolve("in.mp4"));
    }
}
