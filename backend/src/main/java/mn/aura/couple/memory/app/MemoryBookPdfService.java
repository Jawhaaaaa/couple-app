package mn.aura.couple.memory.app;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import mn.aura.couple.export.app.ExportGenerator;
import mn.aura.couple.media.app.MediaStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Дурсамжийн PDF ном (FR-5.12, DD-AURA-024, SD-05): серверт HTML → OpenHTMLtoPDF, Монгол (кирилл Ө Ү)
 * фонт embed — Nunito (бие), Playfair Display (гарчиг). Бүтэц: нүүр (хоёр нэр, хугацаа), сар бүрийн
 * толгой, дурсамж бүр — гарчиг, огноо, газар, тайлбар, зургууд (md хувилбар) ба тайлбар (alt).
 */
@Component
public class MemoryBookPdfService implements ExportGenerator {

    private static final Logger log = LoggerFactory.getLogger(MemoryBookPdfService.class);

    private final MemoryExportData data;
    private final MediaStorageService storage;

    public MemoryBookPdfService(MemoryExportData data, MediaStorageService storage) {
        this.data = data;
        this.storage = storage;
    }

    @Override
    public String kind() {
        return "BOOK_PDF";
    }

    @Override
    public Output generate(Request r, Path dir) throws Exception {
        Path file = dir.resolve("book.pdf");
        render(html(r), file);
        return new Output(file, ("en".equals(r.locale()) ? "Our memories" : "Бидний дурсамж") + ".pdf", "application/pdf");
    }

    void render(String html, Path file) throws Exception {
        try (OutputStream out = Files.newOutputStream(file)) {
            PdfRendererBuilder b = new PdfRendererBuilder();
            b.useFastMode();
            font(b, "fonts/Nunito_400Regular.ttf", "Nunito", 400, false);
            font(b, "fonts/Nunito_700Bold.ttf", "Nunito", 700, false);
            font(b, "fonts/PlayfairDisplay_400Regular.ttf", "Playfair", 400, false);
            font(b, "fonts/PlayfairDisplay_400Regular_Italic.ttf", "Playfair", 400, true);
            b.withHtmlContent(html, null);
            b.toStream(out);
            b.run();
        }
    }

    String html(Request r) {
        boolean en = "en".equals(r.locale());
        List<MemoryExportData.Entry> entries = data.load(r);
        List<String> names = data.coupleNames(r.spaceId());
        StringBuilder h = new StringBuilder("""
                <!DOCTYPE html><html><head><meta charset="utf-8"/><style>
                @page { size: A5; margin: 18mm 14mm; }
                body { font-family: 'Nunito'; font-size: 10.5pt; color: #2B2022; }
                h1, h2, h3 { font-family: 'Playfair'; font-weight: 400; }
                .cover { text-align: center; padding-top: 50mm; page-break-after: always; }
                .cover h1 { font-size: 30pt; font-style: italic; margin: 0 0 6mm; }
                .month { page-break-before: always; font-size: 18pt; border-bottom: 1px solid #EEDDD5; }
                .memory { margin: 6mm 0; page-break-inside: avoid; }
                .meta { color: #6E5A57; font-size: 9pt; }
                img { width: 100%; margin-top: 3mm; border-radius: 4mm; }
                .alt { color: #6E5A57; font-size: 8.5pt; font-style: italic; }
                </style></head><body>
                """);
        h.append("<div class=\"cover\"><h1>").append(esc(en ? "Our memories" : "Бидний дурсамж")).append("</h1><p>")
                .append(esc(String.join(" & ", names))).append("</p>");
        if (!entries.isEmpty()) {
            h.append("<p class=\"meta\">").append(esc(date(entries.get(0).occurredOn(), en))).append(" — ")
                    .append(esc(date(entries.get(entries.size() - 1).occurredOn(), en))).append("</p>");
        }
        h.append("</div>");
        YearMonth month = null;
        for (MemoryExportData.Entry e : entries) {
            YearMonth ym = YearMonth.from(e.occurredOn());
            if (!ym.equals(month)) {
                month = ym;
                h.append("<h2 class=\"month\">").append(esc(monthLabel(ym, en))).append("</h2>");
            }
            h.append("<div class=\"memory\"><h3>").append(esc(e.title())).append("</h3><p class=\"meta\">")
                    .append(esc(date(e.occurredOn(), en)));
            if (e.place() != null) {
                h.append(" · ").append(esc(e.place()));
            }
            h.append(" · ").append(esc(e.author())).append("</p>");
            if (e.description() != null) {
                h.append("<p>").append(esc(e.description()).replace("\n", "<br/>")).append("</p>");
            }
            for (MemoryExportData.Item item : e.media()) {
                if (!"IMAGE".equals(item.kind())) {
                    continue;
                }
                String src = image(item);
                if (src != null) {
                    h.append("<img src=\"").append(src).append("\"/>");
                    if (item.altText() != null) {
                        h.append("<p class=\"alt\">").append(esc(item.altText())).append("</p>");
                    }
                }
            }
            h.append("</div>");
        }
        return h.append("</body></html>").toString();
    }

    /** md хувилбар (≤ 960 px) data URI; байхгүй бол анхны файл. */
    private String image(MemoryExportData.Item item) {
        String key = item.mdKey() != null ? item.mdKey() : item.s3Key();
        try {
            return "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(storage.get(key));
        } catch (software.amazon.awssdk.core.exception.SdkException ex) {
            // Файл storage-д алга (устгагдсан) — номыг зураггүйгээр үргэлжлүүлнэ, хэрэглэгчийн бусад агуулга алдагдахгүй
            log.warn("PDF-д зураг уншигдсангүй: media={}", item.mediaId(), ex);
            return null;
        }
    }

    private static void font(PdfRendererBuilder b, String resource, String family, int weight, boolean italic) {
        b.useFont(() -> {
            try {
                return new ClassPathResource(resource).getInputStream();
            } catch (java.io.IOException e) {
                throw new java.io.UncheckedIOException(e);
            }
        }, family, weight, italic ? PdfRendererBuilder.FontStyle.ITALIC : PdfRendererBuilder.FontStyle.NORMAL, true);
    }

    static String monthLabel(YearMonth ym, boolean en) {
        return en ? ym.getMonth().getDisplayName(java.time.format.TextStyle.FULL, Locale.ENGLISH) + " " + ym.getYear()
                : ym.getYear() + " оны " + ym.getMonthValue() + " сар";
    }

    static String date(LocalDate d, boolean en) {
        return en ? d.getMonth().getDisplayName(java.time.format.TextStyle.SHORT, Locale.ENGLISH) + " " + d.getDayOfMonth()
                + ", " + d.getYear() : d.getYear() + " оны " + d.getMonthValue() + " сарын " + d.getDayOfMonth();
    }

    static String esc(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
