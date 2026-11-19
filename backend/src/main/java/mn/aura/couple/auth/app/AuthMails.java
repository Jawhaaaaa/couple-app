package mn.aura.couple.auth.app;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.mail.MailLayout;
import mn.aura.couple.common.mail.MailLayout.Content;
import mn.aura.couple.common.mail.MailMessage;
import mn.aura.couple.common.mail.MailSender;
import org.springframework.stereotype.Component;

/**
 * Auth-ийн имэйлүүд (mn/en). Холбоос нь вэб апп-ын route (`/verify-email`, `/reset-password`,
 * `/not-me`, LLD §4.3) — `aura.web.base-url`. Код ба холбоосыг логлохгүй (INV-11).
 *
 * <p>HTML хэсэг нь брэндтэй загвар ({@link MailLayout}); гарчиг ба plain-text хэсэг өөрчлөгдөөгүй — iOS-ийн
 * «Mail-ээс код бөглөх» болон E2E-ийн код задлалт тэднээс уншдаг.
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
                            + "\n\nIf you didn't sign up, ignore this email.", code, link,
                    new Content("en", "Your verification code", "Enter this code in Aura to finish signing up.", code,
                            "Expires in 15 minutes", "Confirm email", link, "Or open this link:",
                            "If you didn't sign up, ignore this email."));
        } else {
            send(to, "Aura — баталгаажуулах код " + code,
                    "Таны Aura-гийн баталгаажуулах код: " + code + ".\n\nКод 15 минутын дараа хүчингүй болно. "
                            + "Мөн энэ холбоосоор баталгаажуулж болно:\n" + link
                            + "\n\nТа бүртгүүлээгүй бол энэ имэйлийг үл тоомсорлоорой.", code, link,
                    new Content("mn", "Баталгаажуулах код", "Бүртгэлээ дуусгахын тулд энэ кодыг Aura-д оруулна уу.", code,
                            "15 минутын дотор хүчинтэй", "Имэйл баталгаажуулах", link, "Эсвэл энэ холбоосыг нээнэ үү:",
                            "Та бүртгүүлээгүй бол энэ имэйлийг үл тоомсорлоорой."));
        }
    }

    /** DD-AURA-031: бүртгэлтэй имэйлээр дахин бүртгүүлэхэд — API хариу ижил, мэдээлэл зөвхөн имэйлээр. */
    public void alreadyRegistered(String to, String locale) {
        String link = webBase + "/forgot-password?email=" + enc(to);
        if (en(locale)) {
            send(to, "Aura — you already have an account",
                    "Someone (hopefully you) tried to sign up to Aura with this email, but an account already exists.\n\n"
                            + "Log in, or reset your password here:\n" + link
                            + "\n\nIf this wasn't you, no action is needed.", null, link,
                    new Content("en", "You already have an account",
                            "Someone (hopefully you) tried to sign up to Aura with this email, but an account already exists.",
                            null, null, "Reset password", link, "Or open this link:", "If this wasn't you, no action is needed."));
        } else {
            send(to, "Aura — та аль хэдийн бүртгэлтэй байна",
                    "Энэ имэйлээр Aura-д дахин бүртгүүлэх оролдлого хийгдлээ. Энэ хаяг аль хэдийн бүртгэлтэй.\n\n"
                            + "Нэвтэрнэ үү, эсвэл нууц үгээ эндээс сэргээгээрэй:\n" + link
                            + "\n\nТа биш бол юу ч хийх шаардлагагүй.", null, link,
                    new Content("mn", "Та аль хэдийн бүртгэлтэй байна",
                            "Энэ имэйлээр Aura-д дахин бүртгүүлэх оролдлого хийгдлээ. Нэвтэрнэ үү, эсвэл нууц үгээ сэргээгээрэй.",
                            null, null, "Нууц үг сэргээх", link, "Эсвэл энэ холбоосыг нээнэ үү:", "Та биш бол юу ч хийх шаардлагагүй."));
        }
    }

    public void passwordReset(String to, String locale, String linkToken) {
        String link = webBase + "/reset-password?token=" + enc(linkToken);
        if (en(locale)) {
            send(to, "Aura — reset your password",
                    "Use this link within 30 minutes to set a new password:\n" + link
                            + "\n\nThe link works once. If you didn't ask for it, ignore this email.", null, link,
                    new Content("en", "Reset your password", "Use the button below within 30 minutes to set a new password.",
                            null, null, "Set new password", link, "Or open this link:",
                            "The link works once. If you didn't ask for it, ignore this email."));
        } else {
            send(to, "Aura — нууц үг сэргээх",
                    "Шинэ нууц үг тавихын тулд энэ холбоосыг 30 минутын дотор нээгээрэй:\n" + link
                            + "\n\nХолбоос нэг л удаа ажиллана. Та хүсээгүй бол энэ имэйлийг үл тоомсорлоорой.", null, link,
                    new Content("mn", "Нууц үг сэргээх", "Шинэ нууц үг тавихын тулд доорх товчийг 30 минутын дотор дарна уу.",
                            null, null, "Шинэ нууц үг тавих", link, "Эсвэл энэ холбоосыг нээнэ үү:",
                            "Холбоос нэг л удаа ажиллана. Та хүсээгүй бол энэ имэйлийг үл тоомсорлоорой."));
        }
    }

    public void emailChangeCode(String to, String locale, String code) {
        if (en(locale)) {
            send(to, "Aura — confirm your new email " + code,
                    "Enter this code in Aura to confirm your new email: " + code + "\n\nIt expires in 15 minutes.",
                    code, null, new Content("en", "Confirm your new email", "Enter this code in Aura to confirm your new email.",
                            code, "Expires in 15 minutes", null, null, null, null));
        } else {
            send(to, "Aura — шинэ имэйлээ баталгаажуулах " + code,
                    "Шинэ имэйлээ баталгаажуулахын тулд Aura-д энэ кодыг оруулна уу: " + code
                            + "\n\nКод 15 минутын дараа хүчингүй болно.", code, null,
                    new Content("mn", "Шинэ имэйлээ баталгаажуулах", "Шинэ имэйлээ баталгаажуулахын тулд энэ кодыг Aura-д оруулна уу.",
                            code, "15 минутын дотор хүчинтэй", null, null, null, null));
        }
    }

    /** AC-136: хуучин хаягт «Имэйл солигдлоо — та биш бол» холбоос (`/auth/not-me`). */
    public void emailChangedNotMe(String oldEmail, String locale, String linkToken) {
        String link = webBase + "/not-me?token=" + enc(linkToken);
        if (en(locale)) {
            send(oldEmail, "Aura — your email was changed",
                    "The email address of your Aura account was just changed.\n\n"
                            + "If this wasn't you, open this link to sign out of every device:\n" + link, null, link,
                    new Content("en", "Your email was changed", "The email address of your Aura account was just changed.",
                            null, null, "This wasn't me", link, "Or open this link:",
                            "If this wasn't you, the button signs you out of every device."));
        } else {
            send(oldEmail, "Aura — имэйл солигдлоо",
                    "Таны Aura акаунтын имэйл хаяг саяхан солигдлоо.\n\n"
                            + "Хэрэв та биш бол энэ холбоосоор бүх төхөөрөмжөөс гаргана уу:\n" + link, null, link,
                    new Content("mn", "Имэйл солигдлоо", "Таны Aura акаунтын имэйл хаяг саяхан солигдлоо.",
                            null, null, "Энэ би биш", link, "Эсвэл энэ холбоосыг нээнэ үү:",
                            "Хэрэв та биш бол товчийг дарж бүх төхөөрөмжөөс гаргана уу."));
        }
    }

    /** AC-167: OAuth-ийг байгаа акаунттай холбох код. */
    public void oauthLinkCode(String to, String locale, String code, String provider) {
        if (en(locale)) {
            send(to, "Aura — link your " + provider + " sign-in " + code,
                    "Enter this code in Aura to link " + provider + " sign-in to your account: " + code
                            + "\n\nIt expires in 15 minutes. If this wasn't you, ignore this email.", code, null,
                    new Content("en", "Link your " + provider + " sign-in",
                            "Enter this code in Aura to link " + provider + " sign-in to your account.", code,
                            "Expires in 15 minutes", null, null, null, "If this wasn't you, ignore this email."));
        } else {
            send(to, "Aura — " + provider + " нэвтрэлт холбох " + code,
                    provider + " нэвтрэлтийг акаунттайгаа холбохын тулд Aura-д энэ кодыг оруулна уу: " + code
                            + "\n\nКод 15 минутын дараа хүчингүй болно. Та биш бол үл тоомсорлоорой.", code, null,
                    new Content("mn", provider + " нэвтрэлт холбох",
                            provider + " нэвтрэлтийг акаунттайгаа холбохын тулд энэ кодыг Aura-д оруулна уу.", code,
                            "15 минутын дотор хүчинтэй", null, null, null, "Та биш бол энэ имэйлийг үл тоомсорлоорой."));
        }
    }

    private void send(String to, String subject, String text, String code, String link, Content content) {
        sender.sendAsync(new MailMessage(to, subject, text, MailLayout.render(webBase, content), code, link));
    }

    private static boolean en(String locale) {
        return "en".equalsIgnoreCase(locale);
    }

    private static String enc(String v) {
        return URLEncoder.encode(v, StandardCharsets.UTF_8);
    }
}
