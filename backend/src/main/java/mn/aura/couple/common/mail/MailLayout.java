package mn.aura.couple.common.mail;

import org.springframework.web.util.HtmlUtils;

/**
 * Aura-гийн брэндтэй HTML имэйлийн загвар (апп-ын цайвар «Коралл» палитр — `mobile/src/theme/tokens.ts`).
 *
 * <p>Имэйлийн клиентүүд (Gmail, iOS Mail, Outlook) `<style>`, flex, вэб фонтыг тогтвортой дэмждэггүй тул
 * хүснэгтэн бүтэц + inline style. Код нь нэг тасралтгүй текст (оронгуудыг тусад нь элемент болгохгүй) —
 * iOS-ийн «Mail-ээс код бөглөх» гарчиг ба plain-text хэсгээс уншдаг, HTML-д ч бүтнээр нь хадгална.
 * Бүх утга escape хийгдэнэ.
 */
public final class MailLayout {

    // Цайвар Коралл палитр (tokens.ts — basePalette.light); onPrimary нь AC-DS-01-ийн дагуу бараан
    private static final String BG = "#FFF8F3";
    private static final String SURFACE = "#FFFFFF";
    private static final String SURFACE_RAISED = "#FBEFE8";
    private static final String TEXT = "#2B2022";
    private static final String TEXT_MUTED = "#6E5A57";
    private static final String BORDER = "#EEDDD5";
    private static final String PRIMARY = "#D46A5F";
    private static final String ON_PRIMARY = "#2A1210";
    private static final String SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
    private static final String SERIF = "Georgia,'Times New Roman',serif";

    /**
     * @param lang        `mn` эсвэл `en`
     * @param heading     гол гарчиг
     * @param intro       гарчгийн доорх тайлбар
     * @param code        том тодотгосон код (байхгүй бол null)
     * @param codeCaption кодын доорх тайлбар (хугацаа г.м.; null байж болно)
     * @param buttonLabel товчны бичиг (link-тэй хамт; null бол товчгүй)
     * @param link        товчны холбоос (null байж болно)
     * @param linkHint    товч ажиллахгүй үед холбоосын өмнөх тайлбар
     * @param note        доод жижиг тайлбар («Та биш бол …»; null байж болно)
     */
    public record Content(String lang, String heading, String intro, String code, String codeCaption,
                          String buttonLabel, String link, String linkHint, String note) {}

    private MailLayout() {}

    public static String render(String webBase, Content c) {
        boolean en = "en".equalsIgnoreCase(c.lang());
        String tagline = en ? "Your space for two" : "Хоёулангийн тань орон зай";
        String footer = en ? "This email was sent automatically by Aura." : "Энэ имэйлийг Aura автоматаар илгээв.";
        String preheader = c.code() != null ? c.heading() + ": " + c.code() : c.intro();

        StringBuilder b = new StringBuilder(4096);
        b.append("<!doctype html><html lang=\"").append(en ? "en" : "mn").append("\"><head>")
                .append("<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">")
                .append("<meta name=\"color-scheme\" content=\"light\"><meta name=\"supported-color-schemes\" content=\"light\">")
                .append("<title>").append(esc(c.heading())).append("</title></head>")
                .append("<body style=\"margin:0;padding:0;background:").append(BG).append(";\">")
                // Ирсэн имэйлийн жагсаалтад харагдах урьдчилсан мөр
                .append("<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;\">")
                .append(esc(preheader)).append("</div>")
                .append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:")
                .append(BG).append(";\"><tr><td align=\"center\" style=\"padding:32px 16px;\">")
                .append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:480px;\">");

        // Толгой: апп-ын дүрс + «Aura» (splash-тай ижил serif italic)
        b.append("<tr><td align=\"center\" style=\"padding-bottom:20px;\">")
                .append("<img src=\"").append(esc(webBase)).append("/icons/icon-192.png\" width=\"64\" height=\"64\" alt=\"Aura\"")
                .append(" style=\"display:block;border:0;border-radius:16px;\">")
                .append("<div style=\"font-family:").append(SERIF).append(";font-style:italic;font-size:32px;line-height:40px;color:")
                .append(TEXT).append(";padding-top:8px;\">Aura</div>")
                .append("<div style=\"font-family:").append(SANS).append(";font-size:13px;color:").append(TEXT_MUTED).append(";\">")
                .append(esc(tagline)).append("</div></td></tr>");

        // Карт
        b.append("<tr><td style=\"background:").append(SURFACE).append(";border:1px solid ").append(BORDER)
                .append(";border-radius:24px;padding:32px 28px;font-family:").append(SANS).append(";color:").append(TEXT).append(";\">")
                .append("<h1 style=\"margin:0 0 12px;font-size:22px;line-height:28px;font-weight:700;color:").append(TEXT).append(";\">")
                .append(esc(c.heading())).append("</h1>")
                .append("<p style=\"margin:0 0 24px;font-size:15px;line-height:22px;color:").append(TEXT_MUTED).append(";\">")
                .append(esc(c.intro())).append("</p>");

        if (c.code() != null) {
            b.append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr>")
                    .append("<td align=\"center\" style=\"background:").append(SURFACE_RAISED).append(";border-radius:16px;padding:20px 12px;\">")
                    .append("<div style=\"font-family:'SF Mono',Menlo,Consolas,monospace;font-size:36px;line-height:44px;")
                    .append("font-weight:700;letter-spacing:8px;padding-left:8px;color:").append(TEXT).append(";\">")
                    .append(esc(c.code())).append("</div></td></tr></table>");
            if (c.codeCaption() != null) {
                b.append("<p style=\"margin:12px 0 0;font-size:13px;line-height:18px;text-align:center;color:").append(TEXT_MUTED)
                        .append(";\">").append(esc(c.codeCaption())).append("</p>");
            }
        }

        if (c.link() != null && c.buttonLabel() != null) {
            b.append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-top:24px;\"><tr>")
                    .append("<td align=\"center\"><a href=\"").append(esc(c.link())).append("\" target=\"_blank\"")
                    .append(" style=\"display:inline-block;background:").append(PRIMARY).append(";color:").append(ON_PRIMARY)
                    .append(";text-decoration:none;font-size:16px;font-weight:700;line-height:20px;padding:14px 28px;border-radius:999px;\">")
                    .append(esc(c.buttonLabel())).append("</a></td></tr></table>");
            if (c.linkHint() != null) {
                b.append("<p style=\"margin:20px 0 0;font-size:12px;line-height:18px;color:").append(TEXT_MUTED)
                        .append(";word-break:break-all;\">").append(esc(c.linkHint())).append("<br>")
                        .append("<a href=\"").append(esc(c.link())).append("\" style=\"color:").append(TEXT_MUTED).append(";\">")
                        .append(esc(c.link())).append("</a></p>");
            }
        }

        if (c.note() != null) {
            b.append("<p style=\"margin:24px 0 0;padding-top:16px;border-top:1px solid ").append(BORDER)
                    .append(";font-size:13px;line-height:19px;color:").append(TEXT_MUTED).append(";\">")
                    .append(esc(c.note())).append("</p>");
        }
        b.append("</td></tr>");

        // Хөл
        b.append("<tr><td align=\"center\" style=\"padding-top:20px;font-family:").append(SANS)
                .append(";font-size:12px;line-height:18px;color:").append(TEXT_MUTED).append(";\">")
                .append(esc(footer)).append("<br><a href=\"").append(esc(webBase)).append("\" style=\"color:").append(TEXT_MUTED)
                .append(";\">").append(esc(webBase.replaceFirst("^https?://", ""))).append("</a></td></tr>");

        b.append("</table></td></tr></table></body></html>");
        return b.toString();
    }

    private static String esc(String v) {
        return v == null ? "" : HtmlUtils.htmlEscape(v);
    }
}
