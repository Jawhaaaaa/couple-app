import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import {
  clearDoneListItems,
  deleteListItem,
  enqueueListItem,
  invalidateList,
  type ListItem,
  type ListItemUpdate,
  listItemsPath,
  listKey,
  reorderList,
  replaceListItem,
  setListVote,
  updateListItem,
  useListItems,
  type WishType,
} from '@/api/queries/lists';
import { conflictCurrent } from '@/api/queries/memories';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { ConflictResolutionSheet, type ConflictVersion } from '@/components/ConflictResolutionSheet';
import { FormMessage } from '@/components/FormMessage';
import { useOutboxItems } from '@/components/memories/CommentsSection';
import { ScreenState } from '@/components/ScreenState';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { ListItemRow } from '@/components/together/ListItemRow';
import { emptyStateText } from '@/content/emptyStates';
import {
  applyOrder,
  bucketMemoryDraft,
  groupListItems,
  isListKind,
  LIST_KINDS,
  LIST_TITLE_MAX,
  type ListKind,
  moveWithinGroup,
  parseListDraft,
  WISH_TYPES,
  wishToPlanDraft,
} from '@/domain/lists';
import { useErrorText } from '@/hooks/useErrorText';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { todayIn, useT } from '@/i18n';
import { Confetti } from '@/motion/Confetti';
import { useCouplePeople } from '@/plans/people';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

interface Conflict {
  current: ListItem;
  updatedBy: string | null;
  body: Omit<ListItemUpdate, 'version'>;
  mine: ConflictVersion;
}

/**
 * S-63 хамтын жагсаалт (`?kind&draft`, FR-9.1, 9.2, 9.5, 9.6): Bucket / To-do / Худалдан авалт /
 * Wishlist. Хэн хэзээ тэмдэглэснийг аватараар, дууссан нь доор бүлэглэгдэж «Дууссаныг цэвэрлэх»
 * (AC-107); «Хүсэж байна» санал, хоёулаа хүссэн нь дээр (AC-109); эрэмбэ дээш/доош; bucket дуусахад
 * confetti + «Дурсамж болгох уу?» (AC-106); wishlist → S-54 ноорог (AC-110); чатын ноорог (AC-91);
 * нэмэх нь outbox-оор (offline); зэрэг засварт «миний / түүний хувилбар» (AC-41, AC-131).
 */
export default function ListsScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const locale = usePrefsStore((s) => s.locale);
  const tz = useUserTimezone();
  const params = useLocalSearchParams<{ kind?: string; draft?: string }>();
  const initialKind = first(params.kind);
  const [kind, setKind] = useState<ListKind>(isListKind(initialKind) ? initialKind : 'bucket');
  const [draft] = useState(() => parseListDraft(params.draft));
  const [title, setTitle] = useState(draft?.title ?? '');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [wishType, setWishType] = useState<WishType>('MOVIE');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ item: ListItem; title: string } | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [resolving, setResolving] = useState(false);
  const [celebrate, setCelebrate] = useState<ListItem | null>(null);
  const [clearing, setClearing] = useState(false);
  const { me, byId } = useCouplePeople();
  const items = useListItems(kind);
  const pending = useOutboxItems(listItemsPath(kind));
  const empty = emptyStateText('S-63', locale);

  const add = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError(t('lists.titleRequired'));
      return;
    }
    setTitleError(null);
    setTitle('');
    setDescription('');
    await enqueueListItem(kind, {
      title: trimmed.slice(0, LIST_TITLE_MAX),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(kind === 'wishlist' ? { wishType } : {}),
      clientId: uuidv7(),
    });
    void invalidateList(queryClient, kind);
  };

  /** PATCH + `version`; 409 бол сонголтын цонх (AC-41, AC-131). */
  const patch = async (item: ListItem, body: Omit<ListItemUpdate, 'version'>, mine: ConflictVersion): Promise<ListItem | null> => {
    setBusyId(item.id);
    setError(null);
    try {
      const saved = await updateListItem(item.id, { ...body, version: item.version });
      replaceListItem(queryClient, kind, saved);
      void invalidateList(queryClient, kind);
      return saved;
    } catch (e) {
      const c = conflictCurrent<ListItem>(e);
      if (c) setConflict({ ...c, body, mine });
      else setError(errorText(e));
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const versionOf = (item: Pick<ListItem, 'title' | 'doneAt' | 'description'>, done = !!item.doneAt): ConflictVersion => ({
    title: item.title,
    meta: done ? t('lists.stateDone') : t('lists.stateOpen'),
    body: item.description,
  });

  const toggleDone = async (item: ListItem) => {
    const done = !item.doneAt;
    const saved = await patch(item, { done }, versionOf(item, done));
    if (saved && done && kind === 'bucket') setCelebrate(saved);
  };

  const vote = async (item: ListItem) => {
    const voted = !!me && item.votes.includes(me.id);
    setBusyId(item.id);
    setError(null);
    try {
      replaceListItem(queryClient, kind, await setListVote(item.id, !voted));
      void invalidateList(queryClient, kind);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const move = async (all: ListItem[], id: string, delta: -1 | 1) => {
    const ids = moveWithinGroup(groupListItems(all), id, delta);
    if (!ids) return;
    setError(null);
    queryClient.setQueryData<ListItem[]>(listKey(kind), (data) => (data ? applyOrder(data, ids) : data));
    try {
      queryClient.setQueryData(listKey(kind), await reorderList(kind, ids));
    } catch (e) {
      // 409 — өөр төхөөрөмжөөс зүйл нэмэгдсэн/хасагдсан: шинэ жагсаалтаар дахин эрэмбэлнэ
      setError(conflictCurrent(e) ? t('lists.reorderConflict') : errorText(e));
      void invalidateList(queryClient, kind);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const trimmed = editing.title.trim();
    if (!trimmed) return;
    const saved = await patch(editing.item, { title: trimmed }, { ...versionOf(editing.item), title: trimmed });
    if (saved) setEditing(null);
  };

  const remove = async (item: ListItem) => {
    setBusyId(item.id);
    try {
      await deleteListItem(item.id);
      setEditing(null);
      void invalidateList(queryClient, kind);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const keepMine = async () => {
    if (!conflict) return;
    setResolving(true);
    try {
      const saved = await updateListItem(conflict.current.id, { ...conflict.body, version: conflict.current.version });
      replaceListItem(queryClient, kind, saved);
      setConflict(null);
      setEditing(null);
    } catch (e) {
      const c = conflictCurrent<ListItem>(e);
      if (c) setConflict({ ...conflict, ...c });
      else {
        setConflict(null);
        setError(errorText(e));
      }
    } finally {
      setResolving(false);
    }
  };

  const keepTheirs = () => {
    if (!conflict) return;
    replaceListItem(queryClient, kind, conflict.current);
    setConflict(null);
    setEditing(null);
  };

  const clearDone = async () => {
    setClearing(true);
    setError(null);
    try {
      await clearDoneListItems(kind);
      void invalidateList(queryClient, kind);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setClearing(false);
    }
  };

  const renderRow = (item: ListItem, group: ListItem[], index: number, all: ListItem[]) => {
    if (editing?.item.id === item.id) {
      return (
        <View key={item.id} style={[styles.edit, { backgroundColor: colors.surface, borderColor: colors.primary }]} testID={`list-editing-${item.id}`}>
          <TextField
            label={t('lists.titleLabel')}
            value={editing.title}
            onChangeText={(v) => setEditing({ ...editing, title: v })}
            maxLength={LIST_TITLE_MAX}
            testID="list-edit-title"
          />
          <View style={styles.editActions}>
            <AppButton variant="ghost" label={t('lists.delete')} onPress={() => void remove(item)} disabled={busyId === item.id} testID="list-edit-delete" />
            <AppButton variant="secondary" label={t('common.cancel')} onPress={() => setEditing(null)} testID="list-edit-cancel" />
            <AppButton label={t('common.save')} onPress={() => void saveEdit()} loading={busyId === item.id} disabled={!editing.title.trim()} testID="list-edit-save" />
          </View>
        </View>
      );
    }
    const done = !!item.doneAt;
    return (
      <ListItemRow
        key={item.id}
        item={item}
        myId={me?.id ?? null}
        person={byId}
        busy={busyId === item.id}
        onToggleDone={() => void toggleDone(item)}
        onVote={() => void vote(item)}
        onEdit={() => setEditing({ item, title: item.title })}
        onMoveUp={!done && index > 0 ? () => void move(all, item.id, -1) : undefined}
        onMoveDown={!done && index < group.length - 1 ? () => void move(all, item.id, 1) : undefined}
        onMakePlan={kind === 'wishlist' ? () => router.push({ pathname: '/plans/new', params: { draft: JSON.stringify(wishToPlanDraft(item)) } }) : undefined}
      />
    );
  };

  let body;
  if (items.isError && !items.data) body = <ScreenState kind="error" message={errorText(items.error)} onRetry={() => void items.refetch()} />;
  else if (items.isPending) body = <ScreenState kind="loading" rows={4} />;
  else if (items.data.length === 0 && pending.length === 0) {
    body = <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => void add()} />;
  } else {
    const all = items.data;
    const groups = groupListItems(all);
    body = (
      <>
        {groups.wanted.length > 0 ? (
          <View style={styles.section} testID="list-section-wanted">
            <AppText variant="label" color="primary">
              {t('lists.bothWant')}
            </AppText>
            {groups.wanted.map((item, i) => renderRow(item, groups.wanted, i, all))}
          </View>
        ) : null}
        <View style={styles.section} testID="list-section-open">
          {groups.open.map((item, i) => renderRow(item, groups.open, i, all))}
          {pending.map((p) => (
            <View key={p.clientId} style={[styles.pending, { borderColor: colors.border }]} testID={`list-pending-${p.clientId}`}>
              <AppText variant="bodyStrong">{(p.body as { title?: string } | undefined)?.title ?? ''}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('lists.pending')}
              </AppText>
            </View>
          ))}
        </View>
        {groups.done.length > 0 ? (
          <View style={styles.section} testID="list-section-done">
            <View style={styles.doneHeader}>
              <AppText variant="h3" accessibilityRole="header">
                {t('lists.doneSection', { count: groups.done.length })}
              </AppText>
              <AppButton variant="ghost" label={t('lists.clearDone')} onPress={() => void clearDone()} loading={clearing} testID="list-clear-done" />
            </View>
            {groups.done.map((item, i) => renderRow(item, groups.done, i, all))}
          </View>
        ) : null}
      </>
    );
  }

  return (
    <StackScreen title={t('lists.title')} testID="screen-S-63">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <SegmentedTabs options={LIST_KINDS.map((k) => ({ key: k, label: t(`lists.kind.${k}`) }))} value={kind} onChange={setKind} testID="list-kinds" />
        {draft ? <FormMessage kind="info" text={t('lists.fromChat')} testID="list-from-chat" /> : null}
        <View style={[styles.addBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextField
            label={t('lists.newItem')}
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              if (titleError) setTitleError(null);
            }}
            placeholder={t(`lists.placeholder.${kind}`)}
            maxLength={LIST_TITLE_MAX}
            error={titleError}
            onSubmitEditing={() => void add()}
            testID="list-new-title"
          />
          {description || draft?.description ? (
            <TextField label={t('lists.description')} value={description} onChangeText={setDescription} multiline testID="list-new-description" />
          ) : null}
          {kind === 'wishlist' ? (
            <View style={styles.chips}>
              {WISH_TYPES.map((w) => (
                <Chip key={w} label={t(`lists.wishType.${w}`)} selected={wishType === w} onPress={() => setWishType(w)} testID={`list-wish-${w}`} />
              ))}
            </View>
          ) : null}
          <Pressable
            onPress={() => void add()}
            accessibilityRole="button"
            accessibilityLabel={t('lists.add')}
            testID="list-add"
            style={({ pressed }) => [styles.add, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Plus size={18} color={colors.onPrimary} strokeWidth={iconStroke} />
            <AppText variant="label" color="onPrimary">
              {t('lists.add')}
            </AppText>
          </Pressable>
        </View>
        {error ? <FormMessage text={error} testID="list-error" /> : null}
        {body}
      </ScrollView>
      {celebrate ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Confetti />
        </View>
      ) : null}
      <ConfirmSheet
        visible={!!celebrate}
        title={t('lists.bucketDoneTitle')}
        body={celebrate ? t('lists.bucketDoneBody', { title: celebrate.title }) : null}
        confirmLabel={t('lists.toMemory')}
        cancelLabel={t('lists.notNow')}
        onConfirm={() => {
          const item = celebrate;
          setCelebrate(null);
          if (item) router.push({ pathname: '/memory-editor', params: { draft: JSON.stringify(bucketMemoryDraft(item, todayIn(tz))) } });
        }}
        onCancel={() => setCelebrate(null)}
        testID="bucket-memory-sheet"
      />
      {conflict ? (
        <ConflictResolutionSheet
          visible
          title={t('together.conflict.titleBy', { name: byId(conflict.updatedBy)?.name ?? t('together.conflict.partner') })}
          mine={conflict.mine}
          theirs={versionOf(conflict.current)}
          onKeepMine={() => void keepMine()}
          onKeepTheirs={keepTheirs}
          onDismiss={() => setConflict(null)}
          loading={resolving}
        />
      ) : null}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
  addBox: { borderWidth: 1, borderRadius: radius.card, padding: spacing.sm, gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  add: { alignSelf: 'flex-end', minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.md, borderRadius: radius.pill },
  section: { gap: spacing.xs },
  doneHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  pending: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.card, padding: spacing.sm, gap: 2 },
  edit: { borderWidth: 2, borderRadius: radius.card, padding: spacing.sm, gap: spacing.xs },
  editActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.xs },
});
