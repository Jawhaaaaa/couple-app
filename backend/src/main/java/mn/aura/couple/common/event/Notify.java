package mn.aura.couple.common.event;

import java.util.Map;
import java.util.UUID;

/**
 * Мэдэгдэл үүсгэх хүсэлт (DD-AURA-022). Домэйн service транзакц дотор нийтэлнэ; `NotificationDispatcher`
 * ижил транзакцад `notification` мөр (апп доторх, үргэлж) ба push-ийн дарааллыг бичнэ.
 *
 * @param type     `mobile/src/content/notifications.json`-ийн `type` (жишээ `INVITE_USED`)
 * @param params   бичвэрийн орлуулга (`partner`, `title`, `days`) — мессеж/захидлын агуулга оруулахгүй (NFR-06)
 * @param deepLink апп доторх зам (жишээ `/pairing`) — push товшиход нээгдэнэ
 */
public record Notify(UUID recipientId, UUID spaceId, UUID actorId, String type, Map<String, String> params,
                     String deepLink) {

    public Notify {
        params = params == null ? Map.of() : Map.copyOf(params);
    }
}
