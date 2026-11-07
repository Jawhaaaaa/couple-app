package mn.aura.couple.media.app;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import org.apache.tika.Tika;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Upload-ын агуулгын MIME шалгалт (AC-129, DD-AURA-012). Өргөтгөл ба client-ийн `Content-Type`-д
 * итгэхгүй — эхний байтуудаар (Tika magic) тодорхойлж allowlist-тэй тулгана. Гүйцэтгэх файл,
 * apk, js, html, svg г.м. бүгд 415 `MEDIA_TYPE_FORBIDDEN`.
 */
@Component
public class MediaInspector {

    /** Шалгахад хангалттай эхний байт (resumable upload-ын эхний chunk). */
    public static final int HEAD_BYTES = 64 * 1024;

    public enum Kind { IMAGE, VIDEO, AUDIO, FILE }

    public record Inspection(String mime, Kind kind) {
    }

    static final Map<String, Kind> ALLOWED = Map.ofEntries(
            Map.entry("image/jpeg", Kind.IMAGE),
            Map.entry("image/png", Kind.IMAGE),
            Map.entry("image/heic", Kind.IMAGE),
            Map.entry("image/heif", Kind.IMAGE),
            Map.entry("image/webp", Kind.IMAGE),
            Map.entry("image/gif", Kind.IMAGE),
            Map.entry("video/mp4", Kind.VIDEO),
            Map.entry("video/quicktime", Kind.VIDEO),
            Map.entry("video/webm", Kind.VIDEO),
            Map.entry("audio/mp4", Kind.AUDIO),
            Map.entry("audio/x-m4a", Kind.AUDIO),
            Map.entry("audio/aac", Kind.AUDIO),
            Map.entry("audio/x-aac", Kind.AUDIO),
            Map.entry("audio/webm", Kind.AUDIO),
            Map.entry("audio/ogg", Kind.AUDIO),
            Map.entry("audio/opus", Kind.AUDIO),
            Map.entry("audio/vorbis", Kind.AUDIO),
            Map.entry("audio/mpeg", Kind.AUDIO),
            Map.entry("application/pdf", Kind.FILE),
            Map.entry("application/vnd.openxmlformats-officedocument.wordprocessingml.document", Kind.FILE),
            Map.entry("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Kind.FILE),
            Map.entry("application/vnd.openxmlformats-officedocument.presentationml.presentation", Kind.FILE),
            Map.entry("text/plain", Kind.FILE));

    private static final Set<String> TEXT_EXTENSIONS = Set.of("txt", "text", "md", "csv", "log");
    private static final String[] SCRIPT_MARKERS = {
            "<script", "<html", "<!doctype", "<?php", "<svg", "<iframe", "javascript:", "#!/", "<?xml"};

    private final Tika tika = new Tika();

    public Inspection inspect(byte[] content, String fileName, String declaredMime) {
        return inspect(new ByteArrayInputStream(content), fileName, declaredMime);
    }

    /** `head` нь файлын эхлэл (≥ {@link #HEAD_BYTES} байх нь хангалттай). */
    public Inspection inspect(InputStream head, String fileName, String declaredMime) {
        byte[] bytes;
        String detected;
        try {
            bytes = head.readNBytes(HEAD_BYTES);
            // Зөвхөн агуулгаар — нэрийг Tika-д өгөхгүй (өргөтгөлөөр хуурахаас сэргийлнэ)
            detected = tika.detect(bytes);
        } catch (IOException e) {
            throw forbidden();
        }
        String mime = normalize(detected, bytes, extension(fileName), declaredMime);
        Kind kind = ALLOWED.get(mime);
        if (kind == null) {
            throw forbidden();
        }
        if ("text/plain".equals(mime)) {
            checkPlainText(bytes, extension(fileName));
        }
        return new Inspection(mime, kind);
    }

    private static String normalize(String detected, byte[] bytes, String ext, String declaredMime) {
        String mime = detected.toLowerCase(Locale.ROOT);
        int semi = mime.indexOf(';');
        if (semi >= 0) {
            mime = mime.substring(0, semi).trim();
        }
        return switch (mime) {
            case "application/zip", "application/x-tika-ooxml" -> ooxmlType(bytes, ext);
            case "audio/x-m4a" -> "audio/mp4";
            case "application/ogg", "audio/vorbis", "audio/opus" -> "audio/ogg";
            // Tika нь `isom` брэндтэй MP4-ийг (Android-ийн ихэнх бичлэг) quicktime гэж таньдаг
            case "video/quicktime" -> isQuickTimeBrand(bytes) ? "video/quicktime" : "video/mp4";
            // Tika нь хөтчийн MediaRecorder-ийн webm-ийг matroska гэж таньдаг — DocType-оор ялгана
            case "application/x-matroska", "video/x-matroska", "audio/x-matroska", "video/webm", "audio/webm" ->
                    !hasWebmDocType(bytes) ? "video/x-matroska"
                            : declaredMime != null && declaredMime.toLowerCase(Locale.ROOT).startsWith("audio/")
                            ? "audio/webm" : "video/webm";
            case "image/heif-sequence", "image/heic-sequence" -> "image/heic";
            default -> mime;
        };
    }

    /** ISO BMFF-ийн major brand (`ftyp` box, 8–11 байт) нь `qt  ` эсэх. */
    private static boolean isQuickTimeBrand(byte[] bytes) {
        return bytes.length >= 12
                && new String(bytes, 4, 4, StandardCharsets.US_ASCII).equals("ftyp")
                && new String(bytes, 8, 4, StandardCharsets.US_ASCII).equals("qt  ");
    }

    /** EBML толгойн DocType = "webm" (эхний 64 байтад). */
    private static boolean hasWebmDocType(byte[] bytes) {
        int len = Math.min(bytes.length, 64);
        return new String(bytes, 0, len, StandardCharsets.ISO_8859_1).contains("webm");
    }

    /**
     * tika-core нь OOXML-ийг zip гэж л таньдаг. Zip дотор `[Content_Types].xml` ба `word/`, `xl/`,
     * `ppt/`-ийн аль нэг байвал Office баримт; бусад zip (apk, jar г.м.) хориотой.
     */
    private static String ooxmlType(byte[] bytes, String ext) {
        boolean contentTypes = false;
        String family = null;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry e;
            int seen = 0;
            while ((e = zip.getNextEntry()) != null && seen++ < 64) {
                String name = e.getName();
                if (name.equals("[Content_Types].xml")) {
                    contentTypes = true;
                } else if (name.startsWith("word/")) {
                    family = "word";
                } else if (name.startsWith("xl/")) {
                    family = "xl";
                } else if (name.startsWith("ppt/")) {
                    family = "ppt";
                } else if (name.equals("AndroidManifest.xml") || name.startsWith("META-INF/MANIFEST")
                        || name.endsWith(".dex") || name.endsWith(".class")) {
                    return "application/zip";
                }
            }
        } catch (IOException | IllegalArgumentException ignored) {
            // Эхний chunk-д zip таслагдсан байж болно — олдсоноороо шийднэ
        }
        if (family == null && contentTypes) {
            // `[Content_Types].xml` эхэнд, хавтас нь дараагийн chunk-д — өргөтгөлөөр төрлийг сонгоно
            family = switch (ext) {
                case "docx" -> "word";
                case "xlsx" -> "xl";
                case "pptx" -> "ppt";
                default -> null;
            };
        }
        if (!contentTypes || family == null) {
            return "application/zip";
        }
        return switch (family) {
            case "word" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "xl" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            default -> "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        };
    }

    /**
     * Энгийн текст: зөвхөн текстийн өргөтгөлтэй үед (`.jpg` нэртэй скрипт → татгалзана) ба
     * HTML/скриптийн тэмдэггүй байх ёстой (хөтөч sniff хийж ажиллуулахаас сэргийлнэ).
     */
    private static void checkPlainText(byte[] bytes, String ext) {
        if (!TEXT_EXTENSIONS.contains(ext)) {
            throw forbidden();
        }
        String text = new String(bytes, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
        for (String marker : SCRIPT_MARKERS) {
            if (text.contains(marker)) {
                throw forbidden();
            }
        }
    }

    private static String extension(String fileName) {
        if (fileName == null) {
            return "";
        }
        int dot = fileName.lastIndexOf('.');
        return dot < 0 ? "" : fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static ApiException forbidden() {
        return new ApiException(ErrorCode.MEDIA_TYPE_FORBIDDEN, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }
}
