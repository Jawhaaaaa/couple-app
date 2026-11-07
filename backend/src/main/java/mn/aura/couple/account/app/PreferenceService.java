package mn.aura.couple.account.app;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.model.Preferences;
import mn.aura.couple.api.model.PreferencesUpdate;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Апп-ын тохиргоо (FR-18.2, FR-18.3, AC-183, AC-217): theme, огнооны формат, анимаци
 * (Бүгд/Багасгах/Унтраах), haptic, дуу, check-in-ийг автоматаар хуваалцах, маскотын өнгө, танилцуулга,
 * эхний 7 хоногийн даалгавар нуух. Анхдагч: DARK, YMD_DOT, ALL, haptic асаалттай, дуу унтраастай.
 */
@Service
public class PreferenceService {

    public static final String DEFAULT_MASCOT_COLOR = "coral";

    private final JdbcTemplate jdbc;
    private final TimeProvider time;

    public PreferenceService(JdbcTemplate jdbc, TimeProvider time) {
        this.jdbc = jdbc;
        this.time = time;
    }

    @Transactional
    public Preferences get(UUID userId) {
        jdbc.update("INSERT INTO user_preference (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING", userId);
        return jdbc.queryForObject("SELECT * FROM user_preference WHERE user_id = ?", (rs, i) -> new Preferences(
                Preferences.ThemeEnum.fromValue(rs.getString("theme")),
                Preferences.DateFormatEnum.fromValue(rs.getString("date_format")),
                Preferences.AnimationEnum.fromValue(rs.getString("animation")),
                rs.getBoolean("haptics"), rs.getBoolean("sound"), rs.getBoolean("checkin_auto_share"),
                rs.getString("mascot_color") == null ? DEFAULT_MASCOT_COLOR : rs.getString("mascot_color"),
                rs.getBoolean("intro_seen"), rs.getBoolean("first_week_hidden")), userId);
    }

    /** Хэсэгчилсэн засвар — өгсөн талбар л солигдоно. */
    @Transactional
    public Preferences update(UUID userId, PreferencesUpdate in) {
        get(userId);
        List<String> sets = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        if (in.getTheme() != null) {
            add(sets, args, "theme", in.getTheme().getValue());
        }
        if (in.getDateFormat() != null) {
            add(sets, args, "date_format", in.getDateFormat().getValue());
        }
        if (in.getAnimation() != null) {
            add(sets, args, "animation", in.getAnimation().getValue());
        }
        if (in.getHaptics() != null) {
            add(sets, args, "haptics", in.getHaptics());
        }
        if (in.getSound() != null) {
            add(sets, args, "sound", in.getSound());
        }
        if (in.getCheckinAutoShare() != null) {
            add(sets, args, "checkin_auto_share", in.getCheckinAutoShare());
        }
        if (in.getMascotColor() != null) {
            add(sets, args, "mascot_color", in.getMascotColor());
        }
        if (in.getIntroSeen() != null) {
            add(sets, args, "intro_seen", in.getIntroSeen());
        }
        if (in.getFirstWeekHidden() != null) {
            add(sets, args, "first_week_hidden", in.getFirstWeekHidden());
        }
        if (!sets.isEmpty()) {
            sets.add("version = version + 1");
            sets.add("updated_at = ?");
            args.add(Timestamp.from(time.now()));
            args.add(userId);
            jdbc.update("UPDATE user_preference SET " + String.join(", ", sets) + " WHERE user_id = ?", args.toArray());
        }
        return get(userId);
    }

    private static void add(List<String> sets, List<Object> args, String column, Object value) {
        sets.add(column + " = ?");
        args.add(value);
    }
}
