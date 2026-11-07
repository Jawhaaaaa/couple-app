import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { lookupInvite } from '@/api/queries/pairing';
import { firstParam } from '@/auth/validation';
import { AppButton } from '@/components/AppButton';
import { AuthScreen } from '@/components/AuthScreen';
import { FormMessage } from '@/components/FormMessage';
import { QrScanner, qrScannerAvailable } from '@/components/pairing/QrScanner';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { extractInviteCode, normalizeInviteCode } from '@/pairing/inviteCode';
import { useLinkedRedirect } from '@/pairing/useLinkedRedirect';

/**
 * S-09 Урилга оруулах (FR-2.1, FR-2.2): кодыг гараар (угтвар, зураасгүй ч болно),
 * QR-аар (native — `expo-camera`; вэбд зөвхөн гараар), эсвэл `?code` холбоосоор.
 * `GET /invites/lookup` амжилттай бол S-10 руу. Камерын зөвшөөрөлгүй бол гараар.
 */
export default function InviteEnterScreen() {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const params = useLocalSearchParams<{ code?: string }>();
  const initial = firstParam(params.code) ?? '';
  const [code, setCode] = useState(() => normalizeInviteCode(initial) ?? initial.toUpperCase());
  const [formatError, setFormatError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  useLinkedRedirect({ poll: false });

  const lookup = useMutation({
    mutationFn: lookupInvite,
    onSuccess: (preview, normalized) => {
      queryClient.setQueryData(['invite-lookup', normalized], preview);
      router.push({ pathname: '/join-confirm', params: { code: normalized } });
    },
  });

  const submit = (raw: string) => {
    const normalized = normalizeInviteCode(raw);
    if (!normalized) {
      setFormatError(t('pairing.enter.invalid'));
      return;
    }
    setFormatError(null);
    setCode(normalized);
    lookup.mutate(normalized);
  };

  // Холбоос (`/i/AURA-XXXX` → `?code`) — шууд шалгана (AC-12)
  const autoSubmitted = useRef(false);
  const { mutate: lookupNow } = lookup;
  const prefilled = normalizeInviteCode(initial);
  useEffect(() => {
    if (!prefilled || autoSubmitted.current || offline) return;
    autoSubmitted.current = true;
    lookupNow(prefilled);
  }, [prefilled, offline, lookupNow]);

  const onScanned = (data: string) => {
    setScanning(false);
    const scanned = extractInviteCode(data);
    if (!scanned) {
      setFormatError(t('pairing.enter.scannedInvalid'));
      return;
    }
    submit(scanned);
  };

  return (
    <AuthScreen title={t('pairing.enter.title')} subtitle={t('pairing.enter.subtitle')} testID="screen-S-09">
      {qrScannerAvailable && scanning ? <QrScanner onScanned={onScanned} onClose={() => setScanning(false)} /> : null}
      <TextField
        label={t('pairing.enter.codeLabel')}
        placeholder={t('pairing.enter.placeholder')}
        value={code}
        onChangeText={(value) => {
          setCode(value.toUpperCase());
          setFormatError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        maxLength={12}
        error={formatError}
        returnKeyType="go"
        onSubmitEditing={() => submit(code)}
        testID="invite-enter-code"
      />
      {lookup.error ? <FormMessage text={errorText(lookup.error)} testID="invite-enter-error" /> : null}
      <AppButton
        label={t('pairing.enter.submit')}
        onPress={() => submit(code)}
        disabled={offline || !code.trim()}
        loading={lookup.isPending}
        testID="invite-enter-submit"
      />
      {qrScannerAvailable && !scanning ? (
        <AppButton variant="secondary" label={t('pairing.enter.scan')} onPress={() => setScanning(true)} testID="invite-enter-scan" />
      ) : null}
      <AppButton variant="ghost" label={t('common.back')} onPress={() => router.replace('/waiting')} testID="invite-enter-back" />
    </AuthScreen>
  );
}
