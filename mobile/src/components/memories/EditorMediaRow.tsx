import { Image } from 'expo-image';
import { Film, Images, X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { TextField } from '@/components/TextField';
import { errorMessage } from '@/content/errors';
import { useT } from '@/i18n';
import { ALT_MAX } from '@/memories/editorModel';
import { usePrefsStore } from '@/stores/prefsStore';
import type { DraftMedia } from '@/stores/draftStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';
import { sentBytesOf, type UploadItem } from '@/upload/uploadQueue';

/** Upload-ын явц 0–100 (серверт хүрсэн chunk-аар). */
export function uploadPercent(item: UploadItem | undefined): number {
  if (!item) return 0;
  if (item.status === 'done') return 100;
  if (!item.totalBytes) return 0;
  return Math.min(100, Math.round((sentBytesOf(item) / item.totalBytes) * 100));
}

interface Props {
  media: DraftMedia;
  upload: UploadItem | undefined;
  index: number;
  onAltChange: (alt: string) => void;
  onRemove: () => void;
}

/**
 * S-32-ийн нэг файл: жижиг зураг, нэр, upload-ын явц (%), алдааны шалтгаан (413/415 г.м.),
 * хасах товч, зурагт alt тайлбар (NFR-07, AC-197).
 */
export function EditorMediaRow({ media, upload, index, onAltChange, onRemove }: Props) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const percent = media.mediaId ? 100 : uploadPercent(upload);
  const failed = upload?.status === 'failed';
  const failure = failed
    ? (errorMessage(upload?.failure, locale) ?? (upload?.failure === 'SOURCE_MISSING' ? t('memories.editor.sourceMissing') : t('memories.editor.uploadFailed')))
    : null;
  const status = media.mediaId
    ? t('memories.editor.uploaded')
    : failed
      ? failure
      : upload?.status === 'done'
        ? t('memories.editor.uploaded')
        : upload?.status === 'uploading'
          ? t('memories.editor.progress', { percent })
          : t('memories.editor.waiting');
  const Icon = media.kind === 'video' ? Film : Images;

  return (
    <View style={[styles.root, { borderColor: failed ? colors.danger : colors.border, backgroundColor: colors.surface }]} testID={`editor-media-${index}`}>
      <View style={styles.row}>
        <View style={[styles.thumb, { backgroundColor: colors.surfaceRaised }]}>
          {media.previewUri ? (
            <Image source={{ uri: media.previewUri }} style={styles.thumbImage} contentFit="cover" accessible={false} />
          ) : (
            <Icon size={24} color={colors.textMuted} strokeWidth={iconStroke} />
          )}
        </View>
        <View style={styles.flex}>
          <AppText variant="label" numberOfLines={1}>
            {media.name || t(media.kind === 'video' ? 'memories.editor.video' : 'memories.editor.photo', { index: index + 1 })}
          </AppText>
          <AppText variant="caption" color={failed ? 'danger' : 'textMuted'} accessibilityLiveRegion="polite" testID={`editor-media-${index}-status`}>
            {status}
          </AppText>
          {!failed && percent < 100 ? (
            <View
              style={[styles.bar, { backgroundColor: colors.surfaceRaised }]}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: percent }}
              accessibilityLabel={t('memories.editor.progressA11y', { name: media.name, percent })}
            >
              <View style={[styles.fill, { width: `${percent}%`, backgroundColor: colors.primary }]} />
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={t('memories.editor.removeMedia', { name: media.name || String(index + 1) })}
          style={styles.remove}
          testID={`editor-media-${index}-remove`}
        >
          <X size={20} color={colors.text} strokeWidth={iconStroke} />
        </Pressable>
      </View>
      {media.kind === 'image' ? (
        <TextField
          label={t('memories.editor.altLabel')}
          placeholder={t('memories.editor.altPlaceholder')}
          value={media.altText}
          onChangeText={(v) => onAltChange(v.slice(0, ALT_MAX))}
          maxLength={ALT_MAX}
          testID={`editor-media-${index}-alt`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderWidth: 1, borderRadius: radius.input, padding: spacing.sm, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thumb: { width: 64, height: 64, borderRadius: radius.input, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbImage: { width: '100%', height: '100%' },
  flex: { flex: 1, gap: spacing.xxs },
  bar: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%' },
  remove: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
