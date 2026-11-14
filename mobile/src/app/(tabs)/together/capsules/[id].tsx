import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { CheckCircle2, Clock, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { type Capsule, capsuleKey, type CapsulePart, invalidateCapsules, putMyCapsulePart, sealCapsule, useCapsule } from '@/api/queries/capsules';
import { mediaUrl } from '@/api/queries/memories';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { PhotoStrip, resolveMediaIds } from '@/components/together/PhotoStrip';
import { capsuleView, LETTER_BODY_MAX } from '@/domain/letters';
import { useErrorText } from '@/hooks/useErrorText';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDateLong, todayIn, useT } from '@/i18n';
import { CelebrationOverlay } from '@/motion/CelebrationOverlay';
import { useCouplePeople } from '@/plans/people';
import type { DraftMedia } from '@/stores/draftStore';
import { useLetterDraftStore } from '@/stores/letterDraftStore';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
/** ANIM-21 нь капсул тутамд нэг удаа (энэ ажиллалтад) — дахин нээхэд тоглохгүй (AC-MO-02). */
const celebrated = new Set<string>();

/**
 * S-68 цагийн капсул (FR-10.5, GAP-15, AC-45): өөрийн хэсгийг (бичвэр, ≤ 5 зураг) бичиж
 * битүүмжилнэ; хоёулаа битүүмжилсний дараа огноо болтол хэнд ч агуулга 0 (түгжээтэй); нээгдэхэд
 * ANIM-21-тэй хоёр хэсэг харагдана.
 */
export default function CapsuleScreen() {
  const t = useT();
  const errorText = useErrorText();
  const id = first(useLocalSearchParams<{ id?: string }>().id);
  const capsule = useCapsule(id);
  let body;
  if (capsule.isError && !capsule.data) body = <ScreenState kind="error" message={errorText(capsule.error)} onRetry={() => void capsule.refetch()} />;
  else if (capsule.isPending || !capsule.data) body = <ScreenState kind="loading" rows={4} />;
  else body = <CapsuleBody capsule={capsule.data} />;
  return (
    <StackScreen title={capsule.data?.title ?? t('capsule.title')} testID="screen-S-68">
      {body}
    </StackScreen>
  );
}

function CapsuleBody({ capsule }: { capsule: Capsule }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const locale = usePrefsStore((s) => s.locale);
  const tz = useUserTimezone();
  const { me, partner: partnerPerson, byId } = useCouplePeople();
  const view = capsuleView(capsule, me?.id ?? null, todayIn(tz));
  const draftKey = `capsule:${capsule.id}`;
  const saved = useLetterDraftStore((s) => s.drafts[draftKey]);
  const putDraft = useLetterDraftStore((s) => s.put);
  const clearDraft = useLetterDraftStore((s) => s.clear);
  const [text, setText] = useState(saved?.form.body ?? '');
  const [media, setMedia] = useState<DraftMedia[]>(saved?.media ?? []);
  const [busy, setBusy] = useState<'save' | 'seal' | null>(null);
  const [confirmSeal, setConfirmSeal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(() => capsule.status === 'OPENED' && !celebrated.has(capsule.id));
  const [seenStatus, setSeenStatus] = useState(capsule.status);
  // Дэлгэц нээлттэй байхад огноо болвол (`capsule.opened`) мөн ANIM-21
  if (seenStatus !== capsule.status) {
    setSeenStatus(capsule.status);
    if (capsule.status === 'OPENED' && !celebrated.has(capsule.id)) setCelebrate(true);
  }
  const partnerName = partnerPerson?.name || t('letters.partnerFallback');
  const openDate = formatDateLong(capsule.openOn, locale);

  const remember = (body: string, m: DraftMedia[]) => {
    putDraft(draftKey, { form: { template: 'PAPER_1', body, mode: 'now', date: '', time: '', occasionLabel: '' }, media: m });
  };

  const savePart = async (): Promise<boolean> => {
    setError(null);
    try {
      const mediaIds = await resolveMediaIds(media);
      queryClient.setQueryData(capsuleKey(capsule.id), await putMyCapsulePart(capsule.id, text, mediaIds));
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };

  const save = async () => {
    setBusy('save');
    if (await savePart()) setNotice(t('capsule.saved'));
    setBusy(null);
  };

  const seal = async () => {
    setConfirmSeal(false);
    setBusy('seal');
    try {
      if (!(await savePart())) return;
      queryClient.setQueryData(capsuleKey(capsule.id), await sealCapsule(capsule.id));
      clearDraft(draftKey);
      void invalidateCapsules(queryClient);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const partState = (part: CapsulePart | null) => (part?.sealed ? t('capsule.part.sealed') : part ? t('capsule.part.writing') : t('capsule.part.notStarted'));

  return (
    <>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {error ? <FormMessage text={error} testID="capsule-error" /> : null}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            {view.opened ? <CheckCircle2 size={20} color={colors.success} strokeWidth={iconStroke} /> : <Lock size={20} color={colors.secondary} strokeWidth={iconStroke} />}
            <AppText variant="bodyStrong" style={styles.flex} testID="capsule-status">
              {t(`capsule.status.${capsule.status}`)}
            </AppText>
          </View>
          <AppText color="textMuted" testID="capsule-open-on">
            {view.opened ? t('capsule.openedOn', { date: openDate }) : t('capsule.opensOn', { date: openDate, count: view.daysLeft })}
          </AppText>
          {!view.opened ? (
            <>
              <AppText variant="caption" testID="capsule-part-mine">
                {t('capsule.part.me', { state: partState(view.mine) })}
              </AppText>
              <AppText variant="caption" testID="capsule-part-partner">
                {t('capsule.part.partner', { name: partnerName, state: partState(view.partner) })}
              </AppText>
            </>
          ) : null}
        </View>

        {capsule.status === 'WRITING' && view.canWrite ? (
          <View style={styles.editor} testID="capsule-editor">
            <AppText variant="h3" accessibilityRole="header">
              {t('capsule.myPart')}
            </AppText>
            {view.mine ? <FormMessage kind="info" text={t('capsule.savedHidden')} testID="capsule-saved-hidden" /> : null}
            <TextField
              label={t('capsule.body')}
              value={text}
              onChangeText={(v) => {
                setText(v);
                remember(v, media);
              }}
              multiline
              maxLength={LETTER_BODY_MAX}
              testID="capsule-body"
            />
            <PhotoStrip
              media={media}
              onChange={(m) => {
                setMedia(m);
                remember(text, m);
              }}
              testID="capsule-photos"
            />
            {notice ? <FormMessage kind="success" text={notice} testID="capsule-notice" /> : null}
            <View style={styles.actions}>
              <AppButton variant="secondary" label={t('capsule.save')} onPress={() => void save()} loading={busy === 'save'} disabled={busy !== null || !text.trim()} testID="capsule-save" />
              <AppButton label={t('capsule.seal')} onPress={() => setConfirmSeal(true)} loading={busy === 'seal'} disabled={busy !== null || !text.trim()} testID="capsule-seal" />
            </View>
          </View>
        ) : null}

        {!view.opened && !view.canWrite ? (
          <View style={[styles.locked, { borderColor: colors.secondary }]} testID="capsule-locked">
            <Clock size={28} color={colors.secondary} strokeWidth={iconStroke} />
            <AppText variant="bodyStrong" style={styles.center}>
              {capsule.status === 'SEALED' ? t('capsule.lockedBoth', { date: openDate }) : t('capsule.waitingPartner', { name: partnerName })}
            </AppText>
          </View>
        ) : null}

        {view.opened
          ? capsule.parts.map((p) => {
              const name = byId(p.author.id)?.name || p.author.displayName;
              return (
                <View key={p.author.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`capsule-opened-${p.author.id}`}>
                  <AppText variant="label" color="textMuted">
                    {t('capsule.from', { name })}
                  </AppText>
                  <AppText variant="quote">{p.body ?? ''}</AppText>
                  {(p.media ?? []).map((m) => (
                    <Image key={m.id} source={{ uri: mediaUrl(m, 'lg') ?? undefined }} style={styles.image} contentFit="cover" accessibilityLabel={t('letters.read.photo')} />
                  ))}
                </View>
              );
            })
          : null}
      </ScrollView>
      <CelebrationOverlay
        anim="ANIM-21"
        visible={celebrate}
        onDismiss={() => {
          celebrated.add(capsule.id);
          setCelebrate(false);
        }}
      >
        <AppText variant="display" color="onPrimary" testID="capsule-opened-moment">
          {t('capsule.openedMoment')}
        </AppText>
      </CelebrationOverlay>
      <ConfirmSheet
        visible={confirmSeal}
        title={t('capsule.sealTitle')}
        body={t('capsule.sealBody', { date: openDate })}
        confirmLabel={t('capsule.seal')}
        onConfirm={() => void seal()}
        onCancel={() => setConfirmSeal(false)}
        testID="capsule-seal-sheet"
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
  card: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  editor: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm },
  locked: { borderWidth: 2, borderStyle: 'dashed', borderRadius: radius.card, padding: spacing.lg, alignItems: 'center', gap: spacing.xs },
  center: { textAlign: 'center' },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.image },
});
