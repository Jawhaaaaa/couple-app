package mn.aura.couple.media.app;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

/**
 * Гадны хэрэгсэл (ffmpeg, ffprobe) ажиллуулагч. Аргумент дахь файлууд `workDir`-ийн харьцангуй нэрээр.
 * Prod-д `LocalCommandRunner` (image дотор ffmpeg — T-32); IT-д ffmpeg-тэй контейнер.
 */
public interface CommandRunner {

    record Result(int exitCode, String stdout, String stderr) {

        public boolean ok() {
            return exitCode == 0;
        }
    }

    Result run(Path workDir, List<String> command) throws IOException, InterruptedException;
}
