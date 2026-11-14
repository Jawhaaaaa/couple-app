package mn.aura.couple.chat.app;

import mn.aura.couple.api.model.Dashboard;
import mn.aura.couple.dashboard.app.DashboardContributor;
import org.springframework.stereotype.Component;

/** Нүүрний «N уншаагүй мессеж» (FR-3.4, AC-72) — хамтрагчийн уншаагүй мессежийн тоо. */
@Component
public class UnreadMessages implements DashboardContributor {

    private final ChatMessageService messages;

    public UnreadMessages(ChatMessageService messages) {
        this.messages = messages;
    }

    @Override
    public void contribute(Context ctx, Dashboard dashboard) {
        if (ctx.partnerId().isEmpty()) {
            return;
        }
        dashboard.unreadMessages(messages.unreadCount(ctx.spaceId(), ctx.userId()));
    }
}
