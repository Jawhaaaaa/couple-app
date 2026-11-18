import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import type { Me } from '@/api/queries/auth';
import { useErrorText } from '@/hooks/useErrorText';
import { useT } from '@/i18n';
import { AvatarTooLargeError, pickAvatar, type PreparedAvatar, uploadAvatar } from '@/upload/avatar';
import { spacing } from '@/theme/tokens';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { FormMessage } from './FormMessage';
import { UserAvatar } from './UserAvatar';

interface Props {
  currentUri: string | null;
  disabled?: boolean;
  onSaved: (me: Me) => void;
}

type Notice = { kind: 'tooLarge' } | { kind: 'denied'; canAskAgain: boolean } | { kind: 'saved' } | null;

/**
 * Профайл зураг (S-81, AC-62): сонгох → дугуй тайралтын урьдчилсан харагдац →
 * хадгалах (chunk upload + `PUT /me/avatar`). 10 MB-аас их зургийг тайлбартай
 * татгалзана; зургийн сангийн зөвшөөрөлгүй бол «Тохиргоо нээх».
 */
export function AvatarCropper({ currentUri, disabled, onSaved }: Props) {
  const t = useT();
  const errorText = useErrorText();
  const [preview, setPreview] = useState<PreparedAvatar | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [progress, setProgress] = useState(0);

  const pick = useMutation({
    mutationFn: pickAvatar,
    onMutate: () => setNotice(null),
    onSuccess: (outcome) => {
      if (outcome.status === 'picked') setPreview(outcome.avatar);
      else if (outcome.status === 'tooLarge') setNotice({ kind: 'tooLarge' });
      else if (outcome.status === 'denied') setNotice({ kind: 'denied', canAskAgain: outcome.canAskAgain });
    },
  });

  const upload = useMutation({
    mutationFn: (avatar: PreparedAvatar) => uploadAvatar(avatar, setProgress),
    onMutate: () => setProgress(0),
    onSuccess: (me) => {
      setPreview(null);
      setNotice({ kind: 'saved' });
      onSaved(me);
    },
    onError: (error) => {
      if (error instanceof AvatarTooLargeError) setNotice({ kind: 'tooLarge' });
    },
  });

  const uploadError = upload.error && !(upload.error instanceof AvatarTooLargeError) ? upload.error : null;
  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <UserAvatar
          uri={preview?.uri ?? currentUri}
          label={preview ? t('profileSettings.avatar.preview') : t('profileSettings.avatar.current')}
          size={112}
          testID={preview ? 'avatar-preview' : 'avatar-current'}
        />
        <View style={styles.actions}>
          {preview ? (
            <>
              <AppButton
                label={t('profileSettings.avatar.save')}
                onPress={() => upload.mutate(preview)}
                disabled={disabled}
                loading={upload.isPending}
                testID="avatar-save"
              />
              <AppButton
                variant="ghost"
                label={t('profileSettings.avatar.discard')}
                onPress={() => setPreview(null)}
                disabled={upload.isPending}
                testID="avatar-discard"
              />
            </>
          ) : (
            <AppButton
              variant="secondary"
              label={t('profileSettings.avatar.pick')}
              onPress={() => pick.mutate()}
              loading={pick.isPending}
              testID="avatar-pick"
            />
          )}
        </View>
      </View>
      {upload.isPending ? (
        <AppText variant="caption" color="textMuted" testID="avatar-progress">
          {t('profileSettings.avatar.uploading', { percent: Math.round(progress * 100) })}
        </AppText>
      ) : null}
      {notice?.kind === 'tooLarge' ? <FormMessage text={t('profileSettings.avatar.tooLarge')} testID="avatar-too-large" /> : null}
      {notice?.kind === 'saved' ? <FormMessage kind="success" text={t('profileSettings.avatar.saved')} testID="avatar-saved" /> : null}
      {notice?.kind === 'denied' ? (
        <>
          <FormMessage kind="info" text={t('profileSettings.avatar.permission')} testID="avatar-permission" />
          {!notice.canAskAgain ? (
            <AppButton
              variant="ghost"
              label={t('common.openSettings')}
              // Тохиргоо нээгдэхгүй (ховор) бол тайлбар бичвэр харагдсаар байна
              onPress={() => void Linking.openSettings().catch(() => undefined)}
              testID="avatar-open-settings"
            />
          ) : null}
        </>
      ) : null}
      {pick.error ? <FormMessage text={errorText(pick.error)} testID="avatar-pick-error" /> : null}
      {uploadError ? <FormMessage text={errorText(uploadError)} testID="avatar-upload-error" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flex: 1, gap: spacing.xs },
});
