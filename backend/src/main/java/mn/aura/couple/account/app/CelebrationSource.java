package mn.aura.couple.account.app;

import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.model.Celebration;

/**
 * Баярын мөчийн эх (FR-8.6, §3.4): ой, хос холбогдсон, нууц санал нэгдсэн, зорилго, capsule. Домэйн бүр
 * өөрийн `app` давхаргад bean болгон нэмнэ — `CelebrationSeenService` өөрчлөгдөхгүй (DD-AURA-001).
 */
public interface CelebrationSource {

    /** Хэрэглэгчид одоо харуулах ёстой баярууд (үзсэн эсэхээс үл хамааран). `eventKey` тогтвортой байна. */
    List<Celebration> current(UUID userId);
}
