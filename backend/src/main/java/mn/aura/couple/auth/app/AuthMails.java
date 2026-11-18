package mn.aura.couple.auth.app;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.mail.MailMessage;
import mn.aura.couple.common.mail.MailSender;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

/**
 * Auth-ийн имэйлүүд (mn/en). Холбоос нь вэб апп-ын route (`/verify-email`, `/reset-password`,
 * `/not-me`, LLD §4.3) — `aura.web.base-url`. Код ба холбоосыг логлохгүй (INV-11).
 */
@Component
public class AuthMails {

    private final MailSender sender;
    private final String webBase;

    public AuthMails(MailSender sender, AuraProperties properties) {
        this.sender = sender;
        String base = properties.web().baseUrl();
        this.webBase = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }

    public void verification(String to, String locale, String code, String linkToken) {
        String link = webBase + "/verify-email?token=" + enc(linkToken) + "&email=" + enc(to);
        if (en(locale)) {
            send(to, "Aura — your verification code " + code,
                    "Your Aura verification code is " + code + ".\n\nIt expires in 15 minutes. "
                            + "You can also confirm with this link:\n" + link
                            + "\n\nIf you didn't sign up, ignore this email.", code, link);
        } else {
            send(to, "Aura — баталгаажуулах код " + code,
                    "Таны Aura-гийн баталгаажуулах код: " + code + ".\n\nКод 15 минутын дараа хүчингүй болно. "
                            + "Мөн энэ холбоосоор баталгаажуулж болно:\n" + link
                            + "\n\nТа бүртгүүлээгүй бол энэ имэйлийг үл тоомсорлоорой.", code, link);
        }
    }

    /** DD-AURA-031: бүртгэлтэй имэйлээр дахин бүртгүүлэхэд — API хариу ижил, мэдээлэл зөвхөн имэйлээр. */
    public void alreadyRegistered(String to, String locale) {
        String link = webBase + "/forgot-password?email=" + enc(to);
        if (en(locale)) {
            send(to, "Aura — you already have an account",
                    "Someone (hopefully you) tried to sign up to Aura with this email, but an account already exists.\n\n"
                            + "Log in, or reset your password here:\n" + link
                            + "\n\nIf this wasn't you, no action is needed.", null, link);
        } else {
            send(to, "Aura — та аль хэдийн бүртгэлтэй байна",
                    "Энэ имэйлээр Aura-д дахин бүртгүүлэх оролдлого хийгдлээ. Энэ хаяг аль хэдийн бүртгэлтэй.\n\n"
                            + "Нэвтэрнэ үү, эсвэл нууц үгээ эндээс сэргээгээрэй:\n" + link
                            + "\n\nТа биш бол юу ч хийх шаардлагагүй.", null, link);
        }
    }

    public void passwordReset(String to, String locale, String linkToken) {
        String link = webBase + "/reset-password?token=" + enc(linkToken);
        if (en(locale)) {
            send(to, "Aura — reset your password",
                    "Use this link within 30 minutes to set a new password:\n" + link
                            + "\n\nThe link works once. If you didn't ask for it, ignore this email.", null, link);
        } else {
            send(to, "Aura — нууц үг сэргээх",
                    "Шинэ нууц үг тавихын тулд энэ холбоосыг 30 минутын дотор нээгээрэй:\n" + link
                            + "\n\nХолбоос нэг л удаа ажиллана. Та хүсээгүй бол энэ имэйлийг үл тоомсорлоорой.", null, link);
        }
    }

    public void emailChangeCode(String to, String locale, String code) {
        if (en(locale)) {
            send(to, "Aura — confirm your new email " + code,
                    "Enter this code in Aura to confirm your new email: " + code + "\n\nIt expires in 15 minutes.",
                    code, null);
        } else {
            send(to, "Aura — шинэ имэйлээ баталгаажуулах " + code,
                    "Шинэ имэйлээ баталгаажуулахын тулд Aura-д энэ кодыг оруулна уу: " + code
                            + "\n\nКод 15 минутын дараа хүчингүй болно.", code, null);
        }
    }

    /** AC-136: хуучин хаягт «Имэйл солигдлоо — та биш бол» холбоос (`/auth/not-me`). */
    public void emailChangedNotMe(String oldEmail, String locale, String linkToken) {
        String link = webBase + "/not-me?token=" + enc(linkToken);
        if (en(locale)) {
            send(oldEmail, "Aura — your email was changed",
                    "The email address of your Aura account was just changed.\n\n"
                            + "If this wasn't you, open this link to sign out of every device:\n" + link, null, link);
        } else {
            send(oldEmail, "Aura — имэйл солигдлоо",
                    "Таны Aura акаунтын имэйл хаяг саяхан солигдлоо.\n\n"
                            + "Хэрэв та биш бол энэ холбоосоор бүх төхөөрөмжөөс гаргана уу:\n" + link, null, link);
        }
    }

    /** AC-167: OAuth-ийг байгаа акаунттай холбох код. */
    public void oauthLinkCode(String to, String locale, String code, String provider) {
        if (en(locale)) {
            send(to, "Aura — link your " + provider + " sign-in " + code,
                    "Enter this code in Aura to link " + provider + " sign-in to your account: " + code
                            + "\n\nIt expires in 15 minutes. If this wasn't you, ignore this email.", code, null);
        } else {
            send(to, "Aura — " + provider + " нэвтрэлт холбох " + code,
                    provider + " нэвтрэлтийг акаунттайгаа холбохын тулд Aura-д энэ кодыг оруулна уу: " + code
                            + "\n\nКод 15 минутын дараа хүчингүй болно. Та биш бол үл тоомсорлоорой.", code, null);
        }
    }

    private void send(String to, String subject, String text, String code, String link) {
        String html = "<!doctype html><html><body style=\"font-family:sans-serif\"><p>"
                + HtmlUtils.htmlEscape(text).replace("\n", "<br>") + "</p></body></html>";
        sender.sendAsync(new MailMessage(to, subject, text, html, code, link));
    }

    private static boolean en(String locale) {
        return "en".equalsIgnoreCase(locale);
    }

    private static String enc(String v) {
        return URLEncoder.encode(v, StandardCharsets.UTF_8);
    }
}
