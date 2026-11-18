package mn.aura.couple.notification.app;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import mn.aura.couple.common.job.TestRunnableJob;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.notification.app.NotificationDispatcher.PushDue;
import mn.aura.couple.notification.app.PushChannel.PushMessage;
import mn.aura.couple.notification.domain.NotificationRepository;
import mn.aura.couple.notification.domain.NotificationRepository.NotificationRow;
import mn.aura.couple.notification.domain.NotificationRepository.OutboxRow;
import mn.aura.couple.notification.domain.NotificationRepository.SettingRow;
import mn.aura.couple.notification.domain.PushSubscriptionRepository;
import mn.aura.couple.notification.domain.PushSubscriptionRepository.SubscriptionRow;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * `push_outbox`-ийг төхөөрөмж бүрийн суваг (`PushChannel`) руу илгээнэ.
 * <ul>
 *   <li>Шинэ мэдэгдэл — commit-ийн дараа даруй (virtual thread)</li>
 *   <li>Хоцорсон/«Бүү саад бол»-оор хойшилсон — 30 с тутам (`pushOutbox` ажил, ShedLock)</li>
 *   <li>DND-ээр хойшилсон хоёр ба түүнээс дээш мэдэгдэл → нэгтгэсэн нэг push (AC-48)</li>
 *   <li>«Агуулга нуух» → нэр, гарчиг, текстгүй ерөнхий бичвэр (AC-49)</li>
 *   <li>Push service 404/410 → subscription устгана (AC-154)</li>
 * </ul>
 */
@Service
public class PushDeliveryService implements TestRunnableJob, DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(PushDeliveryService.class);
    private static final int BATCH = 200;

    private final NotificationRepository repo;
    private final PushSubscriptionRepository subscriptions;
    private final NotificationTexts texts;
    private final NotificationPreferenceService preferences;
    private final Map<String, PushChannel> channels = new LinkedHashMap<>();
    private final TransactionTemplate tx;
    private final TimeProvider time;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public PushDeliveryService(NotificationRepository repo, PushSubscriptionRepository subscriptions,
                               NotificationTexts texts, NotificationPreferenceService preferences,
                               List<PushChannel> channels, TransactionTemplate tx, TimeProvider time) {
        this.repo = repo;
        this.subscriptions = subscriptions;
        this.texts = texts;
        this.preferences = preferences;
        channels.forEach(c -> this.channels.put(c.kind(), c));
        this.tx = tx;
        this.time = time;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onPushDue(PushDue due) {
        executor.submit(() -> {
            try {
                deliver(due.userId());
            } catch (RuntimeException e) {
                // Даруй илгээлт амжилтгүй — мөр PENDING хэвээр, 30 с тутмын ажил дахин оролдоно
                log.warn("Push даруй илгээлт амжилтгүй: user={}", due.userId(), e);
            }
        });
    }

    @Scheduled(fixedDelayString = "${aura.push.outbox-interval:PT30S}")
    @SchedulerLock(name = "pushOutbox", lockAtMostFor = "PT5M")
    public void scheduled() {
        runOnce();
    }

    @Override
    public String name() {
        return "pushOutbox";
    }

    @Override
    public int runOnce() {
        return deliver(null);
    }

    /** Хугацаа нь болсон push-уудыг (`userId` null бол бүх хэрэглэгчийн) илгээнэ. */
    public int deliver(UUID userId) {
        Integer n = tx.execute(status -> {
            Instant now = time.now();
            List<OutboxRow> due = repo.lockDue(now, userId, BATCH);
            Map<UUID, List<OutboxRow>> byUser = new LinkedHashMap<>();
            due.forEach(r -> byUser.computeIfAbsent(r.userId(), k -> new ArrayList<>()).add(r));
            byUser.forEach((user, rows) -> deliverUser(user, rows, now));
            return due.size();
        });
        return n == null ? 0 : n;
    }

    private void deliverUser(UUID userId, List<OutboxRow> rows, Instant now) {
        List<SubscriptionRow> subs = subscriptions.forUser(userId);
        if (subs.isEmpty()) {
            repo.markOutbox(rows.stream().map(OutboxRow::id).toList(), "DROPPED", now);
            return;
        }
        SettingRow settings = preferences.load(userId);
        String locale = repo.locale(userId);
        List<OutboxRow> deferred = rows.stream().filter(OutboxRow::deferred).toList();
        List<OutboxRow> single = new ArrayList<>(rows.stream().filter(r -> !r.deferred()).toList());
        if (deferred.size() >= 2) {
            NotificationTexts.Text merged = NotificationTexts.merged(deferred.size(), locale);
            send(targets(subs, deferred.stream().allMatch(OutboxRow::skipLocal)), new PushMessage(deferred.get(deferred.size() - 1).notificationId(), "MERGED", merged.title(),
                    merged.body(), "/notifications"));
            repo.markOutbox(deferred.stream().map(OutboxRow::id).toList(), "MERGED", now);
        } else {
            single.addAll(deferred);
        }
        for (OutboxRow row : single) {
            NotificationRow n = repo.find(row.notificationId()).orElse(null);
            if (n == null) {
                repo.markOutbox(List.of(row.id()), "DROPPED", now);
                continue;
            }
            NotificationTexts.Text text = settings.hideContent()
                    ? NotificationTexts.hidden(n.type(), locale)
                    : texts.render(n.variantId(), locale, n.params());
            send(targets(subs, row.skipLocal()), new PushMessage(n.id(), n.type(), text.title(), text.body(), n.deepLink()));
            repo.markOutbox(List.of(row.id()), "SENT", now);
        }
    }

    /** Сануулгын push бол native локал сануулгатай subscription-ийг хасна (давхардахгүй, DD-AURA-023). */
    private static List<SubscriptionRow> targets(List<SubscriptionRow> subs, boolean skipLocal) {
        return skipLocal ? subs.stream().filter(s -> !s.localReminders()).toList() : subs;
    }

    private void send(List<SubscriptionRow> subs, PushMessage message) {
        for (SubscriptionRow sub : subs) {
            PushChannel channel = channels.get(sub.kind());
            if (channel == null) {
                continue;
            }
            if (channel.send(sub, message) == PushChannel.Result.GONE) {
                subscriptions.deleteById(sub.id());
            }
        }
    }

    @Override
    public void destroy() {
        executor.shutdown();
    }
}
