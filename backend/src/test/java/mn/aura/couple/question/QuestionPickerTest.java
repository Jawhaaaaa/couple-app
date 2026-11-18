package mn.aura.couple.question;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.question.app.QuestionPicker;
import mn.aura.couple.question.app.QuestionPicker.Question;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class QuestionPickerTest {

    private final QuestionPicker picker = new QuestionPicker(new ObjectMapper());

    @Test
    @DisplayName("AC-75 нэг хосын өдөр бүрийн асуулт тогтвортой (хоёр хүнд ижил), хос бүрд өөр дараалал")
    void deterministicPerCouple() {
        UUID space = UUID.fromString("0192f3a4-0000-7000-8000-0000000000c1");
        assertThat(picker.pick(space, 5)).isEqualTo(picker.pick(space, 5));
        assertThat(new QuestionPicker(new ObjectMapper()).pick(space, 5)).isEqualTo(picker.pick(space, 5));
        List<Question> a = picker.order(space);
        List<Question> b = picker.order(UUID.fromString("0192f3a4-0000-7000-8000-0000000000c2"));
        assertThat(a).isNotEqualTo(b);
    }

    @Test
    @DisplayName("Б.1 эхний 30 хоногт 1-р түвшин ≥ 70%, сан бүхэлдээ давтагдалгүй")
    void warmupDepth() {
        List<Question> order = picker.order(UUID.randomUUID());
        long shallow = order.subList(0, 30).stream().filter(q -> q.depth() == 1).count();
        assertThat(shallow).isGreaterThanOrEqualTo(21);
        assertThat(new HashSet<>(order)).hasSize(order.size());
        assertThat(order.size()).isGreaterThanOrEqualTo(365);
    }
}
