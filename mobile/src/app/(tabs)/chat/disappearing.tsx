import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { updateChatSettings } from '@/api/queries/chat';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { FormMessage } from '@/components/FormMessage';
import { SheetScreen } from '@/components/SheetScreen';
import { DISAPPEAR_OPTIONS, disappearOptionKey, type DisappearSeconds, useChatPrefsStore } from '@/chat/disappearing';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { screenProtectionSupported } from '@/platform/screenProtection';
import { spacing } from '@/theme/tokens';

/**
 * S-46 Алга болдог мессеж (`formSheet`, FR-6.9, AC-92): Унтраах / 1 мин / 1 цаг / 1 өдөр. Хугацаа нь
 * хамтрагч уншсанаас эхэлж, дуусахад хоёр талаас ба серверээс устна. Вэб хувилбарт дэлгэцийн зургийн
 * хамгаалалт байхгүйг шударгаар бичнэ (GAP-12, зарчим 5).
 */
export default function DisappearingSheet() {
  const t = useT();
  const errorText = useErrorText();
  const { disabled } = useOnlineOnly();
  const current = useChatPrefsStore((s) => s.disappearSeconds);
  const setCurrent = useChatPrefsStore((s) => s.setDisappearSeconds);
  const [saving, setSaving] = useState<DisappearSeconds | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  const choose = async (value: DisappearSeconds) => {
    if (saving !== null || value === current) return;
    setSaving(value);
    setError(null);
    setSaved(false);
    try {
      const res = await updateChatSettings(value);
      setCurrent(res.disappearSeconds);
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(null);
    }
  };

  return (
    <SheetScreen title={t('chat.disappearing.title')} testID="screen-S-46">
      <AppText color="textMuted">{t('chat.disappearing.body')}</AppText>
      <View style={styles.options} accessibilityRole="radiogroup">
        {DISAPPEAR_OPTIONS.map((value) => (
          <Chip
            key={value}
            label={t(`chat.disappearing.option.${disappearOptionKey(value)}`)}
            selected={value === current}
            disabled={disabled || saving !== null}
            onPress={() => void choose(value)}
            testID={`disappear-${value}`}
          />
        ))}
      </View>
      {disabled ? <FormMessage kind="info" text={t('chat.disappearing.offline')} testID="disappear-offline" /> : null}
      {saved ? <FormMessage kind="success" text={t('chat.disappearing.saved')} testID="disappear-saved" /> : null}
      {error ? <FormMessage text={errorText(error)} testID="disappear-error" /> : null}
      <AppText variant="caption" color="textMuted" testID="disappear-protection">
        {screenProtectionSupported() ? t('chat.disappearing.protectionNative') : t('chat.disappearing.protectionWeb')}
      </AppText>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
