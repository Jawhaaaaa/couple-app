package mn.aura.couple.question.api;

import mn.aura.couple.api.QuestionsApi;
import mn.aura.couple.api.model.AnswerRequest;
import mn.aura.couple.api.model.DailyQuestion;
import mn.aura.couple.api.model.DailyQuestionPage;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.question.app.DailyQuestionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Questions` tag (T-29) — хос шаардана (SOLO → 409 `NOT_PAIRED`). */
@RestController
public class QuestionsController implements QuestionsApi {

    private final SpaceAccessGuard guard;
    private final DailyQuestionService questions;

    public QuestionsController(SpaceAccessGuard guard, DailyQuestionService questions) {
        this.guard = guard;
        this.questions = questions;
    }

    @Override
    public ResponseEntity<DailyQuestion> getTodayQuestion() {
        return ResponseEntity.ok(questions.today(guard.requireCouple()));
    }

    @Override
    public ResponseEntity<DailyQuestion> answerTodayQuestion(AnswerRequest body) {
        return ResponseEntity.ok(questions.answer(guard.requireWritableCouple(), body.getText()));
    }

    @Override
    public ResponseEntity<DailyQuestionPage> listQuestionHistory(String cursor, Integer limit) {
        return ResponseEntity.ok(questions.history(guard.requireCouple(), cursor, limit));
    }
}
