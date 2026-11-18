package mn.aura.couple.memory.app;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import mn.aura.couple.export.app.ExportGenerator;
import mn.aura.couple.media.app.MediaStorageService;
import org.springframework.stereotype.Component;

/**
 * Зургийн цомог (FR-5.12, AC-85): бүлэг/хугацааны дурсамжийн бүх анхны файл ZIP-д
 * `YYYY-MM-DD_гарчиг_N.jpg` нэртэй (нэр UTF-8, файлын системд хориотой тэмдэгтгүй).
 */
@Component
public class MemoryAlbumZipService implements ExportGenerator {

    private final MemoryExportData data;
    private final MediaStorageService storage;

    public MemoryAlbumZipService(MemoryExportData data, MediaStorageService storage) {
        this.data = data;
        this.storage = storage;
    }

    @Override
    public String kind() {
        return "ALBUM_ZIP";
    }

    @Override
    public Output generate(Request r, Path dir) throws Exception {
        Path file = dir.resolve("album.zip");
        Set<String> used = new HashSet<>();
        try (OutputStream os = Files.newOutputStream(file); ZipOutputStream zip = new ZipOutputStream(os, StandardCharsets.UTF_8)) {
            for (MemoryExportData.Entry e : data.load(r)) {
                int n = 1;
                for (MemoryExportData.Item item : e.media()) {
                    String name = unique(entryName(e.occurredOn().toString(), e.title(), n++, item.mime()), used);
                    zip.putNextEntry(new ZipEntry(name));
                    zip.write(storage.get(item.s3Key()));
                    zip.closeEntry();
                }
            }
        }
        return new Output(file, ("en".equals(r.locale()) ? "Our album" : "Бидний цомог") + ".zip", "application/zip");
    }

    static String entryName(String date, String title, int n, String mime) {
        String clean = title.strip().replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "").replaceAll("\\s+", " ");
        if (clean.length() > 80) {
            clean = clean.substring(0, 80).strip();
        }
        return date + "_" + clean + "_" + n + extension(mime);
    }

    static String extension(String mime) {
        return switch (mime == null ? "" : mime.toLowerCase(Locale.ROOT)) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "image/gif" -> ".gif";
            case "video/mp4" -> ".mp4";
            case "video/quicktime" -> ".mov";
            default -> ".bin";
        };
    }

    private static String unique(String name, Set<String> used) {
        String candidate = name;
        int i = 2;
        while (!used.add(candidate)) {
            int dot = name.lastIndexOf('.');
            candidate = name.substring(0, dot) + "-" + i++ + name.substring(dot);
        }
        return candidate;
    }
}
