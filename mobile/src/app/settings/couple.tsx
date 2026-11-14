import { router } from 'expo-router';
import { CalendarHeart, HeartCrack, Palette, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ApiRequestError } from '@/api/client';
import { COUPLE_THEMES, type CoupleTheme, isReadOnlySpace, partnerAvatar, useCoupleSettingsMutations } from '@/api/queries/couple';
import { type Couple, mediaThumb, partnerName, useCoupleQuery } from '@/api/queries/pairing';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { FormMessage } from '@/components/FormMessage';
import { Mascot } from '@/components/Mascot';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { UserAvatar } from '@/components/UserAvatar';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { formatDate, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, type MascotColorName, mascotColors, spacing, touchTarget } from '@/theme/tokens';
import { pickAvatar } from '@/upload/avatar';

const MASCOT_COLORS = Object.keys(mascotColors) as MascotColorName[];

/**
 * S-82 Хосын тохиргоо (FR-18.5…18.7, FR-3.7): хамтрагчийн хоч ба зураг — зөвхөн надад (AC-137), сэдвийн
 * санал/зөвшөөрөл/татгалзал — зөвшөөрвөл хоёр апп-ын палитр солигдоно (AC-138), маскотын бүсний өнгө
 * (AC-190), эхэлсэн өдөр (S-11), «Хосоо салгах» (S-86). Зөвхөн харах горим ба offline-д бичих нь идэвхгүй.
 */
export default function CoupleSettingsScreen() {
  const t = useT();
  const couple = useCoupleQuery();

  let body;
  if (couple.isPending) body = <ScreenState kind="loading" rows={4} />;
  else if (couple.isError || !couple.data) body = <ScreenState kind="error" onRetry={() => void couple.refetch()} />;
  else if (couple.data.kind !== 'COUPLE' || !couple.data.partner)
    body = (
      <View style={styles.body}>
        <FormMessage kind="info" text={t('coupleSettings.notPaired')} testID="couple-not-paired" />
      </View>
    );
  else body = <CoupleSettingsBody couple={couple.data} />;

  return (
    <StackScreen title={t('coupleSettings.title')} testID="screen-S-82">
      {body}
    </StackScreen>
  );
}

function CoupleSettingsBody({ couple }: { couple: Couple }) {
  const t = useT();
  const { disabled: offline } = useOnlineOnly();
  const readOnly = isReadOnlySpace(couple);
  const locked = offline || readOnly;
  const partner = partnerName(couple) ?? t('coupleSettings.partnerFallback');
  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {readOnly ? <FormMessage kind="info" text={t('coupleSettings.readOnly')} testID="couple-read-only" /> : null}
      <PartnerSection couple={couple} locked={locked} />
      <ThemeSection couple={couple} partner={partner} locked={locked} />
      <MascotSection couple={couple} locked={locked} />
      <StartDateSection couple={couple} locked={locked} />
      <BreakupSection couple={couple} />
    </ScrollView>
  );
}

function SectionTitle({ icon: Icon, text }: { icon: typeof Palette; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Icon size={20} color={colors.primary} strokeWidth={iconStroke} />
      <AppText variant="h3" accessibilityRole="header" style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

function PartnerSection({ couple, locked }: { couple: Couple; locked: boolean }) {
  const t = useT();
  const errorText = useErrorText();
  const { myView, partnerAvatar: avatarMutation } = useCoupleSettingsMutations();
  const [nickname, setNickname] = useState(couple.myView.partnerNickname ?? '');
  const [tooLarge, setTooLarge] = useState(false);
  const trimmed = nickname.trim();
  const unchanged = trimmed === (couple.myView.partnerNickname ?? '');

  const pick = async () => {
    setTooLarge(false);
    const outcome = await pickAvatar();
    if (outcome.status === 'tooLarge') setTooLarge(true);
    if (outcome.status === 'picked') avatarMutation.mutate(outcome.avatar.uri);
  };

  return (
    <Card testID="couple-partner">
      <SectionTitle icon={UserRound} text={t('coupleSettings.partnerTitle')} />
      <AppText color="textMuted">{t('coupleSettings.privateNote')}</AppText>
      <View style={styles.row}>
        <UserAvatar uri={mediaThumb(partnerAvatar(couple))} label={t('coupleSettings.avatarLabel')} size={72} testID="couple-partner-avatar" />
        <View style={styles.flex}>
          <AppButton
            variant="secondary"
            label={t('coupleSettings.avatarPick')}
            onPress={() => void pick()}
            loading={avatarMutation.isPending}
            disabled={locked}
            testID="couple-avatar-pick"
          />
        </View>
      </View>
      {tooLarge ? <FormMessage text={t('coupleSettings.avatarTooLarge')} testID="couple-avatar-too-large" /> : null}
      {avatarMutation.isSuccess ? <FormMessage kind="success" text={t('coupleSettings.avatarSaved')} testID="couple-avatar-saved" /> : null}
      {avatarMutation.error ? <FormMessage text={errorText(avatarMutation.error)} testID="couple-avatar-error" /> : null}
      <TextField
        label={t('coupleSettings.nickname')}
        value={nickname}
        onChangeText={setNickname}
        maxLength={40}
        hint={t('coupleSettings.nicknameHint')}
        editable={!locked}
        testID="couple-nickname"
      />
      <AppButton
        label={t('coupleSettings.nicknameSave')}
        onPress={() => myView.mutate({ partnerNickname: trimmed || null })}
        loading={myView.isPending && myView.variables?.partnerNickname !== undefined}
        disabled={locked || unchanged}
        testID="couple-nickname-save"
      />
      {myView.isSuccess && myView.variables?.partnerNickname !== undefined ? (
        <FormMessage kind="success" text={t('coupleSettings.nicknameSaved')} testID="couple-nickname-saved" />
      ) : null}
      {myView.error && myView.variables?.partnerNickname !== undefined ? <FormMessage text={errorText(myView.error)} testID="couple-nickname-error" /> : null}
    </Card>
  );
}

function ThemeSection({ couple, partner, locked }: { couple: Couple; partner: string; locked: boolean }) {
  const t = useT();
  const errorText = useErrorText();
  const userId = couple.partner?.id;
  const { propose, accept, decline } = useCoupleSettingsMutations();
  const [choice, setChoice] = useState<CoupleTheme>(couple.theme);
  const pending = couple.pendingThemeProposal?.status === 'PENDING' ? couple.pendingThemeProposal : null;
  const fromPartner = !!pending && pending.proposer.id === userId;
  const themeName = (theme: CoupleTheme) => t(`theme.palette.${theme}`);
  const busy = propose.error instanceof ApiRequestError && propose.error.status === 409;
  const error = propose.error ?? accept.error ?? decline.error;

  return (
    <Card testID="couple-theme">
      <SectionTitle icon={Palette} text={t('coupleSettings.themeTitle')} />
      <AppText color="textMuted">{t('coupleSettings.themeNote')}</AppText>
      <AppText testID="couple-theme-current">{t('coupleSettings.themeCurrent', { theme: themeName(couple.theme) })}</AppText>
      <ChipRow wrap>
        {COUPLE_THEMES.map((theme) => (
          <Chip
            key={theme}
            label={themeName(theme)}
            selected={choice === theme}
            onPress={() => setChoice(theme)}
            disabled={locked || !!pending}
            testID={`couple-theme-${theme}`}
          />
        ))}
      </ChipRow>
      {pending && fromPartner ? (
        <>
          <FormMessage kind="info" text={t('coupleSettings.themePendingPartner', { partner, theme: themeName(pending.theme) })} testID="couple-theme-pending-partner" />
          <View style={styles.actions}>
            <AppButton
              variant="secondary"
              label={t('coupleSettings.themeDecline')}
              onPress={() => decline.mutate(pending.id)}
              loading={decline.isPending}
              disabled={locked || accept.isPending}
              testID="couple-theme-decline"
            />
            <AppButton
              label={t('coupleSettings.themeAccept')}
              onPress={() => accept.mutate(pending.id)}
              loading={accept.isPending}
              disabled={locked || decline.isPending}
              testID="couple-theme-accept"
            />
          </View>
        </>
      ) : pending ? (
        <FormMessage kind="info" text={t('coupleSettings.themePendingMine', { partner, theme: themeName(pending.theme) })} testID="couple-theme-pending-mine" />
      ) : (
        <AppButton
          label={t('coupleSettings.themePropose', { theme: themeName(choice) })}
          onPress={() => propose.mutate(choice)}
          loading={propose.isPending}
          disabled={locked || choice === couple.theme}
          testID="couple-theme-propose"
        />
      )}
      {error ? <FormMessage text={busy ? t('coupleSettings.themeBusy') : errorText(error)} testID="couple-theme-error" /> : null}
    </Card>
  );
}

function MascotSection({ couple, locked }: { couple: Couple; locked: boolean }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const { myView } = useCoupleSettingsMutations();
  const setPrefs = usePrefsStore((s) => s.set);
  const current = (couple.myView.mascotColor in mascotColors ? couple.myView.mascotColor : 'coral') as MascotColorName;

  const choose = (color: MascotColorName) => {
    const previous = current;
    setPrefs({ mascotColor: color });
    myView.mutate({ mascotColor: color }, { onError: () => setPrefs({ mascotColor: previous }) });
  };

  return (
    <Card testID="couple-mascot">
      <SectionTitle icon={Palette} text={t('coupleSettings.mascotTitle')} />
      <AppText color="textMuted">{t('coupleSettings.mascotNote')}</AppText>
      <View style={styles.mascots}>
        <Mascot size={72} testID="couple-mascot-preview" />
        <Mascot name="bombii" size={72} />
      </View>
      <View style={styles.swatches}>
        {MASCOT_COLORS.map((color) => {
          const selected = current === color;
          return (
            <Pressable
              key={color}
              onPress={() => choose(color)}
              disabled={locked}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: locked }}
              accessibilityLabel={t(`coupleSettings.mascotColor.${color}`)}
              testID={`couple-mascot-${color}`}
              style={[styles.swatchHit, { opacity: locked ? 0.5 : 1 }]}
            >
              <View style={[styles.swatch, { backgroundColor: mascotColors[color], borderColor: selected ? colors.text : colors.border, borderWidth: selected ? 3 : 1 }]} />
            </Pressable>
          );
        })}
      </View>
      {myView.error && myView.variables?.mascotColor ? <FormMessage text={errorText(myView.error)} testID="couple-mascot-error" /> : null}
    </Card>
  );
}

function StartDateSection({ couple, locked }: { couple: Couple; locked: boolean }) {
  const t = useT();
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const confirmed = couple.startDateStatus === 'CONFIRMED' && couple.startDate;
  return (
    <Card testID="couple-start-date">
      <SectionTitle icon={CalendarHeart} text={t('coupleSettings.startTitle')} />
      <AppText variant="h2" testID="couple-start-date-value">
        {confirmed && couple.startDate ? formatDate(couple.startDate, dateFormat) : t('coupleSettings.startPending')}
      </AppText>
      <AppButton variant="secondary" label={t('coupleSettings.startEdit')} onPress={() => router.push('/start-date')} disabled={locked} testID="couple-start-date-edit" />
    </Card>
  );
}

function BreakupSection({ couple }: { couple: Couple }) {
  const t = useT();
  const colors = useColors();
  const breaking = couple.status === 'BREAKING';
  if (couple.status === 'ORPHANED') return null;
  return (
    <Card testID="couple-breakup">
      <View style={styles.row}>
        <HeartCrack size={20} color={colors.danger} strokeWidth={iconStroke} />
        <AppText variant="h3" accessibilityRole="header" style={styles.flex}>
          {t('coupleSettings.breakupTitle')}
        </AppText>
      </View>
      {breaking ? null : <AppText color="textMuted">{t('coupleSettings.breakupNote')}</AppText>}
      <AppButton
        variant={breaking ? 'primary' : 'ghost'}
        label={breaking ? t('coupleSettings.breakupState') : t('coupleSettings.breakupOpen')}
        onPress={() => router.push('/settings/breakup')}
        testID="couple-breakup-open"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' },
  mascots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.xs },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  swatchHit: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 32, height: 32, borderRadius: 16 },
});
