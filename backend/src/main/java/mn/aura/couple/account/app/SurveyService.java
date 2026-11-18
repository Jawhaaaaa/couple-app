package mn.aura.couple.account.app;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import mn.aura.couple.api.model.Dashboard;
import mn.aura.couple.api.model.SurveyPrompt;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.dashboard.app.DashboardContributor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Нэг асуулттай санал асуулга (E1 §7, AC-207, GAP-17 анхдагч: 1–5 оноо). Хэрэглэгч тутамд 30 хоногт ≤ 1:
 * сүүлийн хариулт (алгассан ч мөн) 30 хоногоос өмнө эсвэл огт байхгүй бол `due`. Хугацаанаас өмнө дахин
 * хариулахад 409 `SURVEY_NOT_DUE`. `score = null` нь алгасах — хэмжүүрт тоологдохгүй ч 30 хоногийн цонхыг эхлүүлнэ.
 * Нүүрэнд (`Dashboard.survey`) зөвхөн `due` үед гарна.
 */
@Service
public class SurveyService implements DashboardContributor {

    static final Duration INTERVAL = Duration.ofDays(30);

    private final JdbcTemplate jdbc;
    private final TimeProvider time;

    public SurveyService(JdbcTemplate jdbc, TimeProvider time) {
        this.jdbc = jdbc;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public SurveyPrompt prompt(UUID userId) {
        return new SurveyPrompt(due(userId, time.now()));
    }

    @Transactional
    public void answer(UUID userId, Integer score) {
        if (score != null && (score < 1 || score > 5)) {
            throw ApiException.validation("score", ErrorCode.VALIDATION_FAILED);
        }
        // Хоёр төхөөрөмжөөс зэрэг илгээхэд нэг л мөр (хэрэглэгчийн мөрийг түгжинэ)
        jdbc.queryForList("SELECT id FROM users WHERE id = ? FOR UPDATE", UUID.class, userId);
        Instant now = time.now();
        if (!due(userId, now)) {
            throw new ApiException(ErrorCode.SURVEY_NOT_DUE, HttpStatus.CONFLICT);
        }
        jdbc.update("INSERT INTO survey_response (id, user_id, score, created_at) VALUES (?, ?, ?, ?)",
                Ids.newId(), userId, score, Timestamp.from(now));
    }

    private boolean due(UUID userId, Instant now) {
        Integer recent = jdbc.queryForObject(
                "SELECT count(*) FROM survey_response WHERE user_id = ? AND created_at > ?",
                Integer.class, userId, Timestamp.from(now.minus(INTERVAL)));
        return recent == null || recent == 0;
    }

    @Override
    public void contribute(Context ctx, Dashboard dashboard) {
        if (due(ctx.userId(), time.now())) {
            dashboard.survey(new SurveyPrompt(true));
        }
    }
}
