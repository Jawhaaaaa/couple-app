package mn.aura.couple.dashboard.app;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.Dashboard;

/**
 * Нүүрний хэсгийг өөр домэйн бөглөх цэг (FR-3.4): дараагийн болзоо, ой, сүүлийн дурсамж, уншаагүй
 * мессеж, «Жилийн өмнөх өнөөдөр», захидал, санал асуулга, шинэ хувилбар. Домэйн бүр өөрийн `app`
 * давхаргад bean болгон нэмнэ — `DashboardService` өөрчлөгдөхгүй (DD-AURA-001).
 */
public interface DashboardContributor {

    /** Нэг хүсэлтийн контекст. `partnerId` нь SOLO үед хоосон. */
    record Context(UUID userId, UUID spaceId, Optional<UUID> partnerId, ZoneId viewerZone, ZoneId coupleZone,
                   LocalDate coupleToday) {
    }

    void contribute(Context ctx, Dashboard dashboard);
}
