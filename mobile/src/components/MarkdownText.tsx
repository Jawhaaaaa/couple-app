import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { type InlineSpan, parseMarkdown } from '@/domain/markdown';
import { useColors } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { TypeVariant } from '@/theme/typography';

import { AppText } from './AppText';

const HEADING_VARIANT: Record<1 | 2 | 3, TypeVariant> = { 1: 'h2', 2: 'h3', 3: 'bodyStrong' };

function Spans({ spans }: { spans: InlineSpan[] }) {
  return spans.map((s, i) =>
    s.bold ? (
      <AppText key={i} variant="bodyStrong">
        {s.text}
      </AppText>
    ) : (
      s.text
    ),
  );
}

/**
 * Энгийн markdown рендэр (бодлого, нөхцөл — S-90, AC-63, AC-130): гарчиг (`header` role), догол мөр,
 * жагсаалт, ишлэл. Задлалт нь `domain/markdown.ts`; native сан ашиглахгүй.
 */
export function MarkdownText({ markdown, testID }: { markdown: string; testID?: string }) {
  const colors = useColors();
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);
  return (
    <View style={styles.root} testID={testID}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return (
              <AppText key={i} variant={HEADING_VARIANT[b.level]} accessibilityRole="header" style={i > 0 && styles.headingGap} testID="md-heading">
                <Spans spans={b.spans} />
              </AppText>
            );
          case 'listItem':
            return (
              <View key={i} style={styles.listItem}>
                <AppText style={styles.marker}>{b.marker}</AppText>
                <AppText style={styles.flex}>
                  <Spans spans={b.spans} />
                </AppText>
              </View>
            );
          case 'quote':
            return (
              <View key={i} style={[styles.quote, { borderColor: colors.primary, backgroundColor: colors.surfaceRaised }]}>
                <AppText color="textMuted">
                  <Spans spans={b.spans} />
                </AppText>
              </View>
            );
          case 'rule':
            return <View key={i} style={[styles.rule, { backgroundColor: colors.border }]} />;
          default:
            return (
              <AppText key={i} testID="md-paragraph">
                <Spans spans={b.spans} />
              </AppText>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  headingGap: { marginTop: spacing.sm },
  listItem: { flexDirection: 'row', gap: spacing.xs, paddingLeft: spacing.xs },
  marker: { minWidth: 16 },
  flex: { flex: 1 },
  quote: { borderLeftWidth: 3, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
});
