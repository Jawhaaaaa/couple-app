import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { PolicyDocument } from '@/api/queries/auth';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing, touchTarget } from '@/theme/tokens';

import { AppButton } from '../AppButton';
import { AppText } from '../AppText';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  policy: PolicyDocument | undefined;
}

/**
 * Нууцлалын бодлого ба нөхцөлийн зөвшөөрөл (FR-1.1, FR-14.9, AC-63). Бодлого
 * ачаалагдаагүй бол сонгох боломжгүй — зөвшөөрсөн хувилбарыг илгээх ёстой.
 */
export function PolicyCheckbox({ checked, onChange, policy }: Props) {
  const colors = useColors();
  const t = useT();
  const [open, setOpen] = useState(false);
  const disabled = !policy;
  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => onChange(!checked)}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityLabel={t('auth.register.policyLabel')}
        accessibilityState={{ checked, disabled }}
        style={[styles.row, { opacity: disabled ? 0.5 : 1 }]}
        testID="policy-checkbox"
      >
        <View
          style={[
            styles.box,
            { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : colors.surface },
          ]}
        >
          {checked ? <Check size={18} color={colors.onPrimary} strokeWidth={2.5} /> : null}
        </View>
        <AppText style={styles.label}>{t('auth.register.policyLabel')}</AppText>
      </Pressable>
      {policy ? (
        <AppButton
          variant="ghost"
          label={open ? t('auth.register.policyHide') : t('auth.register.policyRead')}
          onPress={() => setOpen((o) => !o)}
          testID="policy-read"
        />
      ) : null}
      {policy && open ? <PolicyText policy={policy} /> : null}
    </View>
  );
}

/** Бодлого ба нөхцөлийн бичвэр (markdown-ыг энгийн бичвэрээр). */
export function PolicyText({ policy, maxHeight = 280 }: { policy: PolicyDocument; maxHeight?: number }) {
  const colors = useColors();
  const t = useT();
  return (
    <ScrollView
      style={[styles.doc, { maxHeight, borderColor: colors.border, backgroundColor: colors.surface }]}
      contentContainerStyle={styles.docContent}
      nestedScrollEnabled
      testID="policy-text"
    >
      <AppText variant="caption" color="textMuted">
        {t('auth.policyUpdate.version', { version: policy.version })}
      </AppText>
      <AppText variant="h3">{t('auth.policyUpdate.privacy')}</AppText>
      <AppText>{policy.privacyMarkdown}</AppText>
      <AppText variant="h3">{t('auth.policyUpdate.terms')}</AppText>
      <AppText>{policy.termsMarkdown}</AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget },
  box: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderRadius: radius.input / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1 },
  doc: { borderWidth: 1, borderRadius: radius.input },
  docContent: { padding: spacing.md, gap: spacing.xs },
});
