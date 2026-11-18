import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CalendarHeart, Copy, FolderOpen, Handshake, Lightbulb, ListPlus, MapPin, Pin, PinOff, Search, Sparkles, Timer } from 'lucide-react-native';
import { type ComponentRef, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, type TextInput, View } from 'react-native';

import {
  deleteMessage,
  editMessage,
  fetchCurrentPromise,
  fetchMessages,
  jumpToDate,
  listPinned,
  PINNED_KEY,
  setPinned,
  markMessagesRead,
  type Message,
  MESSAGES_KEY,
  reactToMessage,
  reportScreenshot,
} from '@/api/queries/chat';
import { useDashboard } from '@/api/queries/dashboard';
import { partnerName as partnerNameOf, useCoupleQuery } from '@/api/queries/pairing';
import { AppText } from '@/components/AppText';
import { type AttachKind, ChatComposer } from '@/components/chat/ChatComposer';
import { type MessageAction, MessageActions } from '@/components/chat/MessageActions';
import { type BubbleModel, MessageBubble } from '@/components/chat/MessageBubble';
import { TypingHearts } from '@/components/chat/TypingHearts';
import { VoiceMessagePlayer } from '@/components/chat/VoiceMessagePlayer';
import { VoiceRecorderOverlay } from '@/components/chat/VoiceRecorderOverlay';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { TabScreen } from '@/components/TabScreen';
import { currentPlace, ideaPrefillFrom, mapUrl, memoryPrefillFrom, pickAndUploadFile } from '@/chat/attachments';
import { type ChatWindow, lastUnreadFromPartner, startsNewDay } from '@/chat/chatCache';
import { type NewMessage, type PendingMessage, sendMessage, usePendingMessages } from '@/chat/sendMessage';
import { useChatWindow } from '@/chat/useChatWindow';
import { type VoiceClip, useVoiceRecording } from '@/chat/useVoiceRecording';
import { voiceFileName } from '@/chat/voice';
import { emptyStateText } from '@/content/emptyStates';
import { useErrorText } from '@/hooks/useErrorText';
import { useNow } from '@/hooks/useNow';
import { listPrefillFrom } from '@/domain/lists';
import { localClock } from '@/domain/partnerTime';
import { formatDateLong, useT } from '@/i18n';
import { pickMedia, queueAsset } from '@/memories/pickMedia';
import { MEDIA_MAX } from '@/memories/limits';
import { playHaptic } from '@/motion/haptics';
import { useScreenProtection } from '@/platform/screenProtection';
import { onRealtime, sendDelivered } from '@/realtime';
import { usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';
import { blobFromUri } from '@/upload/simpleUpload';
import { uploadQueue } from '@/upload/uploadRuntime';

/** «Бичиж байна» дохио ирээгүй бол 6 с-ийн дараа нуух (сүлжээ тасарсан ч гацахгүй). */
const TYPING_TIMEOUT_MS = 6000;
const QUOTE_SEARCH_PAGES = 5;

function pendingToMessage(p: PendingMessage, me: string, myName: string): Message {
  return {
    id: `pending-${p.clientMessageId}`,
    clientMessageId: p.clientMessageId,
    sender: { id: me, displayName: myName },
    kind: p.body.kind,
    text: p.body.text ?? null,
    media: null,
    location: p.body.location ?? null,
    replyTo: null,
    status: 'SENT',
    deleted: false,
    reactions: [],
    createdAt: p.createdAt,
  } as Message;
}

function HeaderButton({ label, onPress, children, testID }: { label: string; onPress: () => void; children: ReactNode; testID: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={styles.headerButton}>
      {children}
    </Pressable>
  );
}

/**
 * S-40 Чат (FR-6.1…6.4, 6.6, 6.10, 6.11): мессежийн цонх (realtime, хуучныг ачаалах), outbox-оор
 * илгээх (offline-д ч, AC-28), 4 төлөв (AC-176), уншсан (AC-29), reply/засвар/устгал (AC-88),
 * реакц (ANIM-07), «Бичиж байна» (ANIM-08, AC-177), «Хайртай» (AC-178), толгойд хамтрагч, дараагийн
 * болзоо ба амлалт. Алга болдог мессеж харагдаж байхад дэлгэцийн хамгаалалт (FR-6.9).
 */
export function ChatScreenView() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const me = useSessionStore((s) => s.userId) ?? '';
  const now = useNow(1000);
  const couple = useCoupleQuery();
  const dashboard = useDashboard();
  const promise = useQuery({ queryKey: ['promise'], queryFn: fetchCurrentPromise });
  const params = useLocalSearchParams<{ around?: string; date?: string }>();
  const focusId = typeof params.around === 'string' && params.around ? params.around : null;
  const focusDate = typeof params.date === 'string' && params.date ? params.date : null;
  const history = useQuery({
    queryKey: ['messages', 'focus', focusId ?? focusDate],
    queryFn: () => (focusId ? fetchMessages({ around: focusId, limit: 40 }) : jumpToDate(focusDate ?? '')),
    enabled: !!(focusId || focusDate),
  });
  const inHistory = !!(focusId || focusDate);
  const pinned = useQuery({ queryKey: PINNED_KEY, queryFn: listPinned });
  const chat = useChatWindow();
  const pending = usePendingMessages();
  const listRef = useRef<FlatList<BubbleModel>>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const queryClient = useQueryClient();

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Message | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const readSent = useRef<string | null>(null);

  const partner = partnerNameOf(couple.data) ?? t('chat.partnerFallback');
  const myName = t('chat.me');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // ANIM-08: хамтрагч бичиж байна (тэгш нуултыг сервер хийнэ, INV-06)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onRealtime('chat.typing', (event) => {
      const typing = !!(event.payload as { typing?: boolean }).typing;
      setPartnerTyping(typing);
      if (timer) clearTimeout(timer);
      if (typing) timer = setTimeout(() => setPartnerTyping(false), TYPING_TIMEOUT_MS);
    });
    const offMessage = onRealtime('chat.message.created', (event) => {
      const m = event.payload as Message;
      if (m.sender?.id !== me) setPartnerTyping(false);
    });
    return () => {
      off();
      offMessage();
      if (timer) clearTimeout(timer);
    };
  }, [me]);

  const items = chat.window.items;

  // Хүргэгдсэн/уншсан (AC-29, AC-176): дэлгэц нээлттэй, апп урд бол хамгийн сүүлийн хамтрагчийн мессеж хүртэл
  useEffect(() => {
    const target = lastUnreadFromPartner(items, me);
    if (!target) return;
    if (target.status === 'SENT') sendDelivered(target.id);
    const appState = AppState.currentState;
    if (!focused || appState === 'background' || appState === 'inactive' || readSent.current === target.id) return;
    readSent.current = target.id;
    markMessagesRead(target.id).catch(() => {
      readSent.current = null;
    });
  }, [items, me, focused]);

  const rows = useMemo<BubbleModel[]>(() => {
    if (inHistory) return (history.data?.items ?? []).map((m) => ({ key: m.id, message: m }));
    const known = new Set(items.map((m) => m.clientMessageId));
    const server = items.map((m) => ({ key: m.id, message: m }));
    const local = pending
      .filter((p) => !known.has(p.clientMessageId))
      .map((p) => ({ key: `pending-${p.clientMessageId}`, message: pendingToMessage(p, me, myName), sending: true }));
    return [...server, ...local];
  }, [items, pending, me, myName, inHistory, history.data]);
  const inverted = useMemo(() => [...rows].reverse(), [rows]);

  // Алга болдог мессеж харагдаж байх үеийн хамгаалалт (Android FLAG_SECURE, iOS мэдэгдэл; вэб — GAP-12)
  const disappearing = items.filter((m) => m.disappearSeconds && !m.deleted);
  const lastPartnerDisappearing = [...disappearing].reverse().find((m) => m.sender.id !== me);
  useScreenProtection(focused && disappearing.length > 0, () => {
    if (lastPartnerDisappearing) reportScreenshot(lastPartnerDisappearing.id).catch(() => undefined);
  });

  const send = async (text: string) => {
    setActionError(null);
    if (editing) {
      const target = editing;
      setEditing(null);
      try {
        await editMessage(target.id, text);
        void chat.refetch();
      } catch (e) {
        setActionError(e);
      }
      return;
    }
    const input: NewMessage = { kind: 'TEXT', text, ...(replyTo ? { replyToId: replyTo.id } : {}) };
    setReplyTo(null);
    await sendMessage(input);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const attach = async (kind: AttachKind) => {
    setActionError(null);
    setNotice(null);
    if (kind === 'file') {
      setAttaching(true);
      try {
        const out = await pickAndUploadFile();
        if (out.status === 'rejected') setNotice(out.reason === 'TOO_LARGE' ? t('chat.attach.tooLarge') : t('chat.attach.forbidden'));
        if (out.status === 'uploaded') await sendMessage({ kind: 'FILE', mediaId: out.mediaId, ...(replyTo ? { replyToId: replyTo.id } : {}) });
      } catch (e) {
        setActionError(e);
      } finally {
        setAttaching(false);
      }
      return;
    }
    if (kind === 'location') {
      const out = await currentPlace(t('chat.attach.myLocation'));
      if (out.status === 'denied') setNotice(t('chat.attach.locationDenied'));
      else if (out.status === 'failed') setNotice(t('chat.attach.locationFailed'));
      else await sendMessage({ kind: 'LOCATION', location: out.place, ...(replyTo ? { replyToId: replyTo.id } : {}) });
      return;
    }
    const picked = await pickMedia('library', MEDIA_MAX - 1);
    if (picked.status !== 'picked') return;
    const asset = picked.assets[0];
    const isVideo = asset.type === 'video';
    setAttaching(true);
    try {
      const draft = await queueAsset(asset, 0, isVideo ? 'FILE' : 'CHAT');
      const media = await uploadQueue.wait(draft.localId ?? '');
      await sendMessage({ kind: isVideo ? 'FILE' : 'IMAGE', mediaId: media.id, ...(replyTo ? { replyToId: replyTo.id } : {}) });
      setReplyTo(null);
    } catch (e) {
      setActionError(e);
    } finally {
      setAttaching(false);
    }
  };

  /** S-45 бичлэг дууссан — upload (`purpose: VOICE`, сервер нэг формат руу хөрвүүлнэ) → VOICE мессеж. */
  const sendVoice = async (clip: VoiceClip) => {
    setActionError(null);
    setAttaching(true);
    try {
      const blob = await blobFromUri(clip.uri);
      const media = await uploadQueue.upload({
        purpose: 'VOICE',
        fileName: voiceFileName(clip.mime),
        mime: clip.mime,
        durationMs: clip.durationMs,
        totalBytes: blob.size,
        ...(Platform.OS === 'web' ? { data: blob } : { uri: clip.uri }),
      });
      await sendMessage({ kind: 'VOICE', mediaId: media.id, ...(replyTo ? { replyToId: replyTo.id } : {}) });
      setReplyTo(null);
    } catch (e) {
      setActionError(e);
    } finally {
      setAttaching(false);
    }
  };
  const voice = useVoiceRecording((clip) => void sendVoice(clip));
  const recordingVoice = voice.phase === 'recording' || voice.phase === 'starting';

  const react = async (m: Message, emoji: Parameters<typeof reactToMessage>[1]) => {
    setSelected(null);
    playHaptic('ANIM-07');
    try {
      await reactToMessage(m.id, emoji);
      void chat.refetch();
    } catch (e) {
      setActionError(e);
    }
  };

  const remove = async (m: Message) => {
    setConfirmDelete(null);
    try {
      await deleteMessage(m.id);
      void chat.refetch();
    } catch (e) {
      setActionError(e);
    }
  };

  /** Ишлэлийг товшвол эх рүү (AC-88): цонхонд байхгүй бол хуучныг ачаалж хайна. */
  const jumpTo = async (id: string) => {
    for (let i = 0; i <= QUOTE_SEARCH_PAGES; i += 1) {
      const data = queryClient.getQueryData<ChatWindow>(MESSAGES_KEY);
      const at = data?.items.findIndex((m) => m.id === id) ?? -1;
      if (data && at >= 0) {
        // Урвуу жагсаалтад: хамгийн шинэ (outbox-ынх ч) 0-д
        const index = rows.length - data.items.length + (data.items.length - 1 - at);
        setHighlight(id);
        setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 }), 50);
        setTimeout(() => setHighlight(null), 2500);
        return;
      }
      if (!data?.hasMoreBefore) return;
      await chat.loadOlder();
    }
  };

  /** S-41-ийн нэмэлт үйлдэл (FR-6.7, FR-6.8): pin (хоёулаа хасаж болно), хуулах, газрын зураг, дурсамж болгох. */
  const menuActions = (m: Message): MessageAction[] => {
    const close = () => setSelected(null);
    const list: MessageAction[] = [
      {
        key: m.pinnedAt ? 'unpin' : 'pin',
        label: m.pinnedAt ? t('chat.actions.unpin') : t('chat.actions.pin'),
        icon: m.pinnedAt ? PinOff : Pin,
        onPress: () => {
          close();
          setPinned(m.id, !m.pinnedAt)
            .then(() => {
              void pinned.refetch();
              void chat.refetch();
            })
            .catch(setActionError);
        },
      },
    ];
    if (m.text) {
      list.push({
        key: 'copy',
        label: t('chat.actions.copy'),
        icon: Copy,
        onPress: () => {
          close();
          void Clipboard.setStringAsync(m.text ?? '').then(() => setNotice(t('chat.actions.copied')));
        },
      });
    }
    if (m.kind === 'LOCATION' && m.location) {
      const place = m.location;
      list.push({
        key: 'map',
        label: t('chat.actions.openMap'),
        icon: MapPin,
        onPress: () => {
          close();
          void Linking.openURL(mapUrl(place));
        },
      });
    }
    if (m.kind === 'TEXT' || m.kind === 'IMAGE' || m.kind === 'LOCATION') {
      list.push({
        key: 'memory',
        label: t('chat.actions.toMemory'),
        icon: Sparkles,
        onPress: () => {
          close();
          router.push({ pathname: '/memory-editor', params: { draft: JSON.stringify(memoryPrefillFrom(m, tz)) } });
        },
      });
    }
    if (m.kind === 'TEXT' || m.kind === 'LOCATION') {
      list.push({
        key: 'idea',
        label: t('chat.actions.toIdea'),
        icon: Lightbulb,
        onPress: () => {
          close();
          router.push({ pathname: '/plans/idea-editor', params: { draft: JSON.stringify(ideaPrefillFrom(m)) } });
        },
      });
      list.push({
        key: 'list',
        label: t('chat.actions.toList'),
        icon: ListPlus,
        onPress: () => {
          close();
          // «Жагсаалтад нэмэх» (AC-91) — S-63-ийн нэмэх талбар ноорогоор бөглөгдөнө
          router.push({ pathname: '/together/lists', params: { kind: 'todo', draft: JSON.stringify(listPrefillFrom(m)) } });
        },
      });
    }
    return list;
  };

  const lastPinned = pinned.data?.[pinned.data.length - 1];
  const historyAnchor = inHistory ? (focusId ?? history.data?.items[0]?.id ?? null) : null;
  const nextDate = dashboard.data?.nextDate;
  const partnerCard = dashboard.data?.partner;
  const header = (
    <View style={[styles.header, { borderBottomColor: colors.border }]} testID="chat-header">
      <View style={styles.headerRow}>
        <View style={styles.headerMain}>
          <AppText variant="h3" numberOfLines={1} testID="chat-partner">
            {partner}
          </AppText>
          {partnerCard ? (
            <AppText variant="caption" color="textMuted">
              {t('chat.localTime', { time: localClock(partnerCard.utcOffsetMinutes, now, locale) })}
              {partnerCard.onlineStatus === 'ONLINE' ? ` · ${t('chat.online')}` : ''}
            </AppText>
          ) : null}
        </View>
        <HeaderButton label={t('chat.search.title')} onPress={() => router.push('/chat/search')} testID="chat-open-search">
          <Search size={22} color={colors.text} strokeWidth={iconStroke} />
        </HeaderButton>
        <HeaderButton label={t('chat.media.title')} onPress={() => router.push('/chat/media')} testID="chat-open-media">
          <FolderOpen size={22} color={colors.text} strokeWidth={iconStroke} />
        </HeaderButton>
        <HeaderButton label={t('chat.disappearing.title')} onPress={() => router.push('/chat/disappearing')} testID="chat-open-disappearing">
          <Timer size={22} color={colors.text} strokeWidth={iconStroke} />
        </HeaderButton>
      </View>
      {nextDate ? (
        <Pressable onPress={() => router.push('/plans')} accessibilityRole="link" style={styles.headerPill} testID="chat-next-date">
          <CalendarHeart size={14} color={colors.secondary} strokeWidth={iconStroke} />
          <AppText variant="caption" color="secondary" numberOfLines={1}>
            {t('chat.nextDate', { title: nextDate.title, date: formatDateLong(new Date(nextDate.startsAt), locale) })}
          </AppText>
        </Pressable>
      ) : null}
      {promise.data && promise.data.status !== 'DECLINED' ? (
        <Pressable
          onPress={() => router.push('/chat/promise')}
          accessibilityRole="button"
          style={[styles.promise, { backgroundColor: colors.surface, borderColor: colors.border }]}
          testID="chat-promise"
        >
          <Handshake size={16} color={colors.primary} strokeWidth={iconStroke} />
          <View style={styles.headerMain}>
            <AppText variant="label" color="primary">
              {promise.data.status === 'PROPOSED' ? t('chat.promise.proposed') : promise.data.status === 'ENDED' ? t('chat.promise.keptQuestion') : t('chat.promise.active')}
            </AppText>
            <AppText variant="caption" numberOfLines={2}>
              {promise.data.text}
            </AppText>
          </View>
        </Pressable>
      ) : null}
      {pinned.data && pinned.data.length > 0 ? (
        <Pressable
          onPress={() => router.push('/chat/pins')}
          accessibilityRole="button"
          accessibilityLabel={t('chat.pins.bannerA11y', { count: pinned.data.length })}
          style={[styles.promise, { backgroundColor: colors.surface, borderColor: colors.border }]}
          testID="chat-pinned-banner"
        >
          <Pin size={16} color={colors.secondary} strokeWidth={iconStroke} />
          <AppText variant="caption" numberOfLines={1} style={styles.headerMain}>
            {lastPinned ? (lastPinned.text ?? t(`chat.kind.${lastPinned.kind}`)) : ''}
          </AppText>
          <AppText variant="label" color="secondary">
            {pinned.data.length}
          </AppText>
        </Pressable>
      ) : null}
      {inHistory ? (
        <Pressable onPress={() => router.replace('/chat')} accessibilityRole="button" style={styles.headerPill} testID="chat-back-to-latest">
          <AppText variant="label" color="primary">
            {t('chat.backToLatest')}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );

  const empty = emptyStateText('S-40', locale);
  let content: ReactNode;
  if (inHistory && history.isLoading) content = <ScreenState kind="loading" rows={6} />;
  else if (inHistory && history.isError) content = <ScreenState kind="error" onRetry={() => void history.refetch()} />;
  else if (chat.isLoading && rows.length === 0) content = <ScreenState kind="loading" rows={6} />;
  else if (chat.isError && rows.length === 0) content = <ScreenState kind="error" onRetry={() => void chat.refetch()} />;
  else if (rows.length === 0)
    content = (
      <>
        <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => inputRef.current?.focus()} />
        {/* ANIM-08: хоосон чатад ч хамтрагч бичиж байгааг харуулна (эхний мессежийн өмнө) */}
        {partnerTyping ? <TypingHearts name={t('chat.typing', { name: partner })} /> : null}
      </>
    );
  else
    content = (
      <FlatList
        ref={listRef}
        inverted
        data={inverted}
        keyExtractor={(r) => r.key}
        testID="chat-list"
        onEndReached={() => {
          if (!inHistory) void chat.loadOlder();
        }}
        onEndReachedThreshold={0.3}
        onScrollToIndexFailed={(info) => {
          // Хэмжээ хараахан тооцогдоогүй мөр — нэг удаа дахин оролдоно
          if (info.index < inverted.length) {
            setTimeout(() => listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true }), 100);
          }
        }}
        ListFooterComponent={chat.loadingOlder ? <ActivityIndicator color={colors.primary} style={styles.older} /> : undefined}
        ListHeaderComponent={partnerTyping ? <TypingHearts name={t('chat.typing', { name: partner })} /> : undefined}
        renderItem={({ item, index }) => {
          const older = inverted[index + 1]?.message;
          return (
            <View>
              {startsNewDay(older, item.message, tz) ? (
                <AppText variant="label" color="textMuted" style={styles.day} testID="chat-day">
                  {formatDateLong(new Date(item.message.createdAt), locale)}
                </AppText>
              ) : null}
              <MessageBubble
                model={item}
                mine={item.message.sender.id === me}
                now={now}
                partnerName={partner}
                highlighted={highlight === item.message.id || item.message.id === historyAnchor}
                onLongPress={setSelected}
                onQuotePress={(id) => void jumpTo(id)}
                onOpen={(m) => {
                  if (m.kind === 'LOCATION' && m.location) void Linking.openURL(mapUrl(m.location));
                  else if (m.media?.urls.original) void Linking.openURL(m.media.urls.original);
                }}
                renderVoice={(m, mine) => <VoiceMessagePlayer message={m} mine={mine} />}
              />
            </View>
          );
        }}
      />
    );

  return (
    <TabScreen title={t('tabs.chat')} testID="screen-S-40">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {header}
        <View style={styles.flex}>{content}</View>
        {actionError ? <FormMessage text={errorText(actionError)} testID="chat-error" /> : null}
        {notice ? <FormMessage kind="info" text={notice} testID="chat-notice" /> : null}
        <ChatComposer
          key={editing ? `edit-${editing.id}` : 'compose'}
          inputRef={inputRef}
          replyTo={replyTo}
          editing={editing}
          partnerName={partner}
          onCancelContext={() => {
            setReplyTo(null);
            setEditing(null);
          }}
          onSend={(text) => void send(text)}
          onAttach={(kind) => void attach(kind)}
          attaching={attaching}
          voice={{
            phase: voice.phase,
            mode: voice.mode,
            start: (mode) => void voice.start(mode),
            cancel: () => void voice.cancel(),
            finish: () => void voice.finish(),
            lock: voice.lock,
          }}
          overlay={
            recordingVoice ? (
              <VoiceRecorderOverlay
                mode={voice.mode}
                durationMs={voice.durationMs}
                levels={voice.levels}
                onCancel={() => void voice.cancel()}
                onSend={() => void voice.finish()}
              />
            ) : undefined
          }
        />
        {voice.phase === 'denied' || voice.phase === 'unsupported' ? (
          <FormMessage
            kind="info"
            text={voice.phase === 'denied' ? t('chat.voice.denied') : t('chat.voice.unsupported')}
            testID="voice-unavailable"
          />
        ) : null}
      </KeyboardAvoidingView>
      <MessageActions
        message={selected}
        mine={selected?.sender.id === me}
        onClose={() => setSelected(null)}
        onReact={(m, e) => void react(m, e)}
        onReply={(m) => {
          setSelected(null);
          setEditing(null);
          setReplyTo(m);
        }}
        onEdit={(m) => {
          setSelected(null);
          setReplyTo(null);
          setEditing(m);
        }}
        onDelete={(m) => {
          setSelected(null);
          setConfirmDelete(m);
        }}
        extra={selected ? menuActions(selected) : []}
      />
      <ConfirmSheet
        visible={!!confirmDelete}
        title={t('chat.deleteConfirm.title')}
        body={t('chat.deleteConfirm.body')}
        confirmLabel={t('chat.actions.delete')}
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
        testID="chat-delete-confirm"
      />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.screen, paddingBottom: spacing.xs, gap: spacing.xs, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headerMain: { flex: 1 },
  headerButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  headerPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  promise: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderRadius: radius.input, padding: spacing.xs },
  day: { textAlign: 'center', marginVertical: spacing.sm },
  older: { marginVertical: spacing.sm },
});
