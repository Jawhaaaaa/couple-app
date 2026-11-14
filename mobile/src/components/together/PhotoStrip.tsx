import { Image } from 'expo-image';
import { ImagePlus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { admitLetterPhotos, LETTER_MEDIA_MAX } from '@/domain/letters';
import { useT } from '@/i18n';
import { assetKind, pickMedia, queueAsset } from '@/memories/pickMedia';
import type { DraftMedia } from '@/stores/draftStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';
import { uploadQueue } from '@/upload/uploadRuntime';

/** Сонгосон зургуудын серверийн id — upload дуусахыг хүлээнэ (зураг тус бүр нэг удаа). */
export async function resolveMediaIds(media: DraftMedia[]): Promise<string[]> {
  return Promise.all(media.map(async (m) => m.mediaId ?? (await uploadQueue.wait(m.localId ?? '')).id));
}

interface Props {
  media: DraftMedia[];
  onChange: (media: DraftMedia[]) => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * Захидал, капсулын зураг (FR-10.3, AC-111): ≤ 5, 6 дахь нь татгалзаж шалтгааныг хэлнэ. Зураг
 * GPS-гүй болж (AC-21) upload дараалалд `LETTER` зорилготой орно.
 */
export function PhotoStrip({ media, onChange, disabled, testID = 'photo-strip' }: Props) {
  const t = useT();
  const colors = useColors();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setNotice(null);
    const picked = await pickMedia('library', 0);
    if (picked.status === 'denied') {
      setNotice(t('states.permission.photos'));
      return;
    }
    if (picked.status !== 'picked') return;
    const images = picked.assets.filter((a) => assetKind(a) === 'image');
    const { accepted, rejected } = admitLetterPhotos(media.length, images);
    if (rejected > 0) setNotice(t('letters.photoLimit', { max: LETTER_MEDIA_MAX }));
    setBusy(true);
    try {
      const queued = await Promise.all(accepted.map((a, i) => queueAsset(a, media.length + i, 'LETTER')));
      onChange([...media, ...queued]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.row}>
        {media.map((m) => (
          <View key={m.key} style={[styles.thumb, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]} testID={`${testID}-item`}>
            {m.previewUri ? <Image source={{ uri: m.previewUri }} style={styles.image} contentFit="cover" accessible={false} /> : null}
            {!disabled ? (
              <Pressable
                onPress={() => onChange(media.filter((x) => x.key !== m.key))}
                accessibilityRole="button"
                accessibilityLabel={t('letters.removePhoto')}
                hitSlop={10}
                style={[styles.remove, { backgroundColor: colors.scrim }]}
                testID={`${testID}-remove-${m.key}`}
              >
                <X size={14} color={colors.text} strokeWidth={iconStroke} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {media.length < LETTER_MEDIA_MAX && !disabled ? (
          <Pressable
            onPress={() => void add()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('letters.addPhoto')}
            style={[styles.thumb, styles.add, { borderColor: colors.border }]}
            testID={`${testID}-add`}
          >
            <ImagePlus size={22} color={colors.primary} strokeWidth={iconStroke} />
          </Pressable>
        ) : null}
      </View>
      <AppText variant="caption" color="textMuted">
        {t('letters.photoCount', { count: media.length, max: LETTER_MEDIA_MAX })}
      </AppText>
      {notice ? <FormMessage kind="info" text={notice} testID={`${testID}-notice`} /> : null}
    </View>
  );
}

const SIZE = 64;
const styles = StyleSheet.create({
  root: { gap: spacing.xxs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  thumb: { width: SIZE, height: SIZE, borderRadius: radius.input, borderWidth: 1, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  add: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', minWidth: touchTarget },
  remove: { position: 'absolute', top: 2, right: 2, width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
