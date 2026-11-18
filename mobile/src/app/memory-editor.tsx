import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { FolderPlus, ImagePlus, type LucideIcon, Tag, X } from 'lucide-react-native';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import {
  conflictCurrent,
  createGroup,
  createMemory,
  GROUPS_KEY,
  invalidateMemoryLists,
  type Memory,
  memoryKey,
  updateMemory,
  useMemory,
  useMemoryGroups,
  useMemoryTags,
} from '@/api/queries/memories';
import { deviceTimezone } from '@/auth/device';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Chip, ChipRow } from '@/components/Chip';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FormMessage } from '@/components/FormMessage';
import { ConflictSheet, type VersionPreview } from '@/components/memories/ConflictSheet';
import { EditorMediaRow } from '@/components/memories/EditorMediaRow';
import { ExifSuggestion } from '@/components/memories/ExifSuggestion';
import { ScreenState } from '@/components/ScreenState';
import { closeSheet, SheetScreen } from '@/components/SheetScreen';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { todayIn, useT } from '@/i18n';
import {
  addTag,
  applyExif,
  applyPrefill,
  buildCreateBody,
  coordinateLabel,
  buildUpdateBody,
  DESCRIPTION_MAX,
  draftFromMemory,
  type DraftError,
  GROUP_NAME_MAX,
  hashKey,
  parseDraftParam,
  PLACE_MAX,
  TAG_MAX,
  TITLE_MAX,
  validateDraft,
} from '@/memories/editorModel';
import { suggestFromAssets } from '@/memories/exif';
import { isLeavingEditor, leaveEditorAfterSave } from '@/memories/leaveEditor';
import { admitPicks, MEDIA_MAX, type Rejection } from '@/memories/limits';
import { assetExif, pickMedia, type PickSource, queueAsset, toCandidate } from '@/memories/pickMedia';
import { outbox } from '@/offline/outboxRuntime';
import { currentCoords } from '@/platform/location';
import { type DraftMedia, emptyDraft, type MemoryDraft, NEW_DRAFT, useDraftsHydrated, useDraftStore } from '@/stores/draftStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';
import { UploadError, type UploadItem } from '@/upload/uploadQueue';
import { uploadQueue, useUploads } from '@/upload/uploadRuntime';

function today(): string {
  return todayIn(deviceTimezone() ?? 'UTC');
}

/**
 * S-32 Дурсамж нэмэх/засах (`modal`, `?id&draft`, FR-5.1, FR-5.2, FR-5.6): зураг/видео
 * (≤ 20, видео ≤ 60 с), GPS-гүй ≤ 2560 px болгож upload дараалалд; EXIF-ийн огноо/байршил
 * «Зурагнаас авсан» тэмдэгтэй (AC-79); гарчиг, тайлбар, шошго, цомог, зураг бүрийн alt.
 * Ноорог `draftStore`-д — гарсан ч алдагдахгүй. Хадгалах нь файл дуусмагц `POST /memories`
 * (`clientId`, сүлжээгүй бол outbox); засвар нь `PATCH` + `version`, зөрчилд сонголт (AC-131).
 */
export default function MemoryEditorScreen() {
  const t = useT();
  const errorText = useErrorText();
  const params = useLocalSearchParams<{ id?: string; draft?: string }>();
  const memoryId = typeof params.id === 'string' && params.id ? params.id : undefined;
  const rawDraft = typeof params.draft === 'string' ? params.draft : undefined;
  const prefill = useMemo(() => parseDraftParam(rawDraft), [rawDraft]);
  const key = memoryId ?? (rawDraft ? `${NEW_DRAFT}:${hashKey(rawDraft)}` : NEW_DRAFT);
  const hydrated = useDraftsHydrated();
  const memory = useMemory(memoryId);
  const draft = useDraftStore((s) => s.drafts[key]);
  const put = useDraftStore((s) => s.put);

  useEffect(() => {
    if (!hydrated || draft) return;
    if (memoryId) {
      if (memory.data) put(key, draftFromMemory(memory.data, uuidv7()));
      return;
    }
    put(key, applyPrefill(emptyDraft(today()), prefill));
  }, [draft, hydrated, key, memory.data, memoryId, prefill, put]);

  const title = memoryId ? t('memories.editor.editTitle') : t('memories.editor.newTitle');
  let body: ReactNode;
  if (draft) body = <EditorForm draftKey={key} draft={draft} memoryId={memoryId} />;
  else if (memoryId && memory.isError) body = <ScreenState kind="error" message={errorText(memory.error)} onRetry={() => void memory.refetch()} />;
  else body = <ScreenState kind="loading" rows={3} />;

  return (
    <SheetScreen title={title} testID="screen-S-32" onClose={closeUnlessLeaving}>
      {body}
    </SheetScreen>
  );
}

/** Хадгалсны дараах шилжилтийн үеэр хаах/хаях нь өөр `back()` нэмж S-31-ийг дарахгүй (AC-198). */
function closeUnlessLeaving() {
  if (!isLeavingEditor()) closeSheet();
}

function toPreview(v: { title: string; occurredOn: string; description?: string | null; location?: { name: string } | null }): VersionPreview {
  return { title: v.title, occurredOn: v.occurredOn, description: v.description ?? null, placeName: v.location?.name ?? null };
}

function EditorForm({ draftKey, draft, memoryId }: { draftKey: string; draft: MemoryDraft; memoryId: string | undefined }) {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const patch = useDraftStore((s) => s.patch);
  const clear = useDraftStore((s) => s.clear);
  const uploads = useUploads();
  const byLocal = useMemo(() => new Map<string, UploadItem>(uploads.map((u) => [u.localId, u])), [uploads]);
  // AC-200: хосын хадгалах сан ≥ 80% бол сервер upload-ын хариунд тэмдэглэнэ
  const quotaWarning = draft.media.some((m) => !!m.localId && byLocal.get(m.localId)?.quotaWarning === true);
  const groups = useMemoryGroups();
  const tagSuggestions = useMemoryTags();

  const [showErrors, setShowErrors] = useState(false);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [pickError, setPickError] = useState<unknown>(null);
  const [denied, setDenied] = useState(false);
  const [picking, setPicking] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<'denied' | 'failed' | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupError, setGroupError] = useState<unknown>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'saving'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [conflict, setConflict] = useState<{ current: Memory; updatedBy: string | null; mediaIds: string[] } | null>(null);
  const [discarding, setDiscarding] = useState(false);

  const update = (p: Partial<MemoryDraft>) => patch(draftKey, p);
  const latest = () => useDraftStore.getState().drafts[draftKey] ?? draft;
  const errors = showErrors ? validateDraft(draft) : [];
  const has = (e: DraftError) => errors.includes(e);

  // Одоогийн байршил (S-32, FR-5.2): вэбэд navigator.geolocation (AC-158), native-д expo-location
  const locate = async () => {
    setLocationNotice(null);
    setLocating(true);
    try {
      const out = await currentCoords();
      if (out.status !== 'ok') {
        setLocationNotice(out.status);
        return;
      }
      const current = latest();
      update({
        lat: String(out.lat),
        lon: String(out.lon),
        placeName: current.placeName.trim() || coordinateLabel(out.lat, out.lon),
        locationSource: 'MANUAL',
        locationTouched: true,
      });
    } finally {
      setLocating(false);
    }
  };

  const pick = async (source: PickSource) => {
    setPickError(null);
    setDenied(false);
    setPicking(true);
    try {
      const result = await pickMedia(source, draft.media.length);
      if (result.status === 'denied') {
        setDenied(true);
        return;
      }
      if (result.status !== 'picked') return;
      const candidates = result.assets.map(toCandidate);
      const { accepted, rejected } = admitPicks(latest().media.length, candidates);
      setRejections(rejected);
      // EXIF-ийн санал (AC-79) — зөвхөн хүлээн авсан зурагнаас
      const images = accepted.filter((c) => c.kind === 'image');
      const suggestion = suggestFromAssets(await Promise.all(images.map(async (c) => ({ exif: await assetExif(c.asset) }))));
      patch(draftKey, applyExif(latest(), suggestion));
      const queuedMedia: DraftMedia[] = [];
      for (const [i, c] of accepted.entries()) queuedMedia.push(await queueAsset(c.asset, latest().media.length + i));
      update({ media: [...latest().media, ...queuedMedia] });
    } catch (error) {
      setPickError(error);
    } finally {
      setPicking(false);
    }
  };

  const removeMedia = (m: DraftMedia) => {
    update({ media: latest().media.filter((x) => x.key !== m.key) });
    // Дуусаагүй upload-ыг цуцална (серверийн session ч) — алдаа нь дарааллын төлөвт үлдэнэ
    if (m.localId) void uploadQueue.remove(m.localId).catch(() => undefined);
  };

  const dropUploads = (media: DraftMedia[]) => {
    // Дараалал цэвэрлэх нь хэрэглэгчид харагдах алдаа биш — серверийн session 24 цагт өөрөө устна
    for (const m of media) if (m.localId) void uploadQueue.remove(m.localId).catch(() => undefined);
  };

  const finish = (saved: Memory | null) => {
    if (saved) queryClient.setQueryData(memoryKey(saved.id), saved);
    invalidateMemoryLists(queryClient);
    dropUploads(latest().media);
    // Болзооноос (AC-95) үүссэн бол S-54 руу л буцна — тэнд «Дурсамжийг үзэх» холбоос гарна. Вэбэд
    // `back()` нь history-ээр асинхрон тул араас нь `push()` хийвэл уралдаж, S-54 inert үлддэг байв.
    const fromPlan = !!latest().datePlanId;
    clear(draftKey);
    // AC-198: шилжилтийн дараалал ба вэбийн history-ийн уралдааны тайлбар — `leaveEditorAfterSave`
    void leaveEditorAfterSave(saved && !memoryId && !fromPlan ? saved.id : null);
  };

  const save = async () => {
    setShowErrors(true);
    setSaveError(null);
    const current = latest();
    if (validateDraft(current).length > 0) return;
    let mediaIds: string[];
    try {
      setPhase('uploading');
      mediaIds = await Promise.all(current.media.map((m) => (m.mediaId ? Promise.resolve(m.mediaId) : uploadQueue.wait(m.localId ?? '').then((r) => r.id))));
    } catch (error) {
      setPhase('idle');
      setSaveError(error instanceof UploadError ? t('memories.editor.someFailed') : errorText(error));
      return;
    }
    setPhase('saving');
    try {
      if (memoryId) {
        finish(await updateMemory(memoryId, buildUpdateBody(current, mediaIds, current.baseVersion ?? 0)));
        return;
      }
      const body = buildCreateBody(current, mediaIds);
      try {
        finish(await createMemory(body));
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        // Сүлжээгүй — ижил `clientId`-тай outbox-оор; сервер давхар үүсгэхгүй
        await outbox.enqueue({ method: 'POST', path: '/memories', body: { ...body }, clientId: body.clientId });
        setQueued(true);
        finish(null);
      }
    } catch (error) {
      const c = conflictCurrent<Memory>(error);
      if (c) setConflict({ ...c, mediaIds });
      else setSaveError(errorText(error));
    } finally {
      setPhase('idle');
    }
  };

  const keepMine = async () => {
    if (!conflict || !memoryId) return;
    setPhase('saving');
    try {
      const saved = await updateMemory(memoryId, buildUpdateBody(latest(), conflict.mediaIds, conflict.current.version));
      setConflict(null);
      finish(saved);
    } catch (error) {
      const c = conflictCurrent<Memory>(error);
      if (c) setConflict({ ...c, mediaIds: conflict.mediaIds });
      else {
        setConflict(null);
        setSaveError(errorText(error));
      }
    } finally {
      setPhase('idle');
    }
  };

  const keepTheirs = () => {
    if (!conflict) return;
    queryClient.setQueryData(memoryKey(conflict.current.id), conflict.current);
    setConflict(null);
    finish(null);
  };

  const create = async () => {
    const name = groupName.trim();
    if (!name) return;
    setGroupError(null);
    try {
      const group = await createGroup(name.slice(0, GROUP_NAME_MAX));
      setGroupName('');
      update({ groupIds: [...latest().groupIds, group.id] });
      void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    } catch (error) {
      setGroupError(error);
    }
  };

  const suggestions = (tagSuggestions.data ?? []).filter((s) => !draft.tags.some((x) => x.toLowerCase() === s.toLowerCase())).slice(0, 8);
  const canAddMore = draft.media.length < MEDIA_MAX;
  const saving = phase !== 'idle';

  return (
    <>
      <Section title={t('memories.editor.mediaTitle')}>
        <AppText variant="caption" color="textMuted" testID="editor-limits">
          {t('memories.editor.limits', { max: MEDIA_MAX })}
        </AppText>
        {draft.media.map((m, i) => (
          <EditorMediaRow
            key={m.key}
            media={m}
            index={i}
            upload={m.localId ? byLocal.get(m.localId) : undefined}
            onAltChange={(altText) => update({ media: latest().media.map((x) => (x.key === m.key ? { ...x, altText } : x)) })}
            onRemove={() => removeMedia(m)}
          />
        ))}
        <View style={styles.row}>
          <AppButton
            variant="secondary"
            label={t('memories.editor.pick')}
            onPress={() => void pick('library')}
            disabled={!canAddMore}
            loading={picking}
            testID="editor-pick"
          />
          <AppButton variant="secondary" label={t('memories.editor.camera')} onPress={() => void pick('camera')} disabled={!canAddMore || picking} testID="editor-camera" />
        </View>
        <IconHint icon={ImagePlus} text={t('memories.editor.count', { count: draft.media.length, max: MEDIA_MAX })} />
        {rejections.map((r, i) => (
          <FormMessage key={`${r.name}-${i}`} text={t(`memories.editor.reject.${r.reason}`, { name: r.name, max: MEDIA_MAX })} testID="editor-reject" />
        ))}
        {has('MEDIA') ? <FormMessage text={t('memories.editor.needMedia')} testID="editor-error-media" /> : null}
        {denied ? (
          <>
            <FormMessage text={t('states.permission.photos')} testID="editor-denied" />
            <AppButton
              variant="ghost"
              label={t('common.openSettings')}
              // Тохиргоо нээгдэхгүй төхөөрөмжид тайлбар нь дээр харагдсаар байна
              onPress={() => void Linking.openSettings().catch(() => undefined)}
            />
          </>
        ) : null}
        {pickError ? <FormMessage text={errorText(pickError)} testID="editor-pick-error" /> : null}
      </Section>

      <Section title={t('memories.editor.detailsTitle')}>
        <TextField
          label={t('memories.editor.title')}
          placeholder={t('memories.editor.titlePlaceholder')}
          value={draft.title}
          onChangeText={(v) => update({ title: v.slice(0, TITLE_MAX) })}
          maxLength={TITLE_MAX}
          error={has('TITLE') ? t('memories.editor.titleRequired') : null}
          testID="editor-title"
        />
        <TextField
          label={t('memories.editor.date')}
          placeholder={t('memories.editor.datePlaceholder')}
          value={draft.occurredOn}
          onChangeText={(v) => update({ occurredOn: v.trim().slice(0, 10), dateSource: 'MANUAL', dateTouched: true })}
          maxLength={10}
          keyboardType="numbers-and-punctuation"
          error={has('DATE') ? t('memories.editor.dateInvalid') : null}
          testID="editor-date"
        />
        <ExifSuggestion source={draft.dateSource} testID="editor-date-exif" />
        <TextField
          label={t('memories.editor.description')}
          placeholder={t('memories.editor.descriptionPlaceholder')}
          value={draft.description}
          onChangeText={(v) => update({ description: v.slice(0, DESCRIPTION_MAX) })}
          maxLength={DESCRIPTION_MAX}
          multiline
          testID="editor-description"
        />
      </Section>

      <Section title={t('memories.editor.locationTitle')}>
        <TextField
          label={t('memories.editor.placeName')}
          placeholder={t('memories.editor.placePlaceholder')}
          value={draft.placeName}
          onChangeText={(v) =>
            // Нэрийг засахад EXIF-ийн координат хэвээр — эх нь «Зурагнаас авсан» хэвээр үлдэнэ
            update({ placeName: v.slice(0, PLACE_MAX), locationSource: draft.locationSource === 'EXIF' ? 'EXIF' : 'MANUAL', locationTouched: true })
          }
          maxLength={PLACE_MAX}
          testID="editor-place"
        />
        <ExifSuggestion source={draft.locationSource} testID="editor-place-exif" />
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField
              label={t('memories.editor.lat')}
              value={draft.lat}
              onChangeText={(v) => update({ lat: v, locationSource: 'MANUAL', locationTouched: true })}
              keyboardType="numbers-and-punctuation"
              testID="editor-lat"
            />
          </View>
          <View style={styles.flex}>
            <TextField
              label={t('memories.editor.lon')}
              value={draft.lon}
              onChangeText={(v) => update({ lon: v, locationSource: 'MANUAL', locationTouched: true })}
              keyboardType="numbers-and-punctuation"
              testID="editor-lon"
            />
          </View>
        </View>
        <AppText variant="caption" color={has('LOCATION') ? 'danger' : 'textMuted'} testID="editor-location-hint">
          {has('LOCATION') ? t('memories.editor.locationInvalid') : t('memories.editor.locationHint')}
        </AppText>
        <AppButton variant="secondary" label={t('memories.editor.useMyLocation')} onPress={() => void locate()} loading={locating} testID="editor-location-current" />
        {locationNotice ? (
          <FormMessage
            kind="info"
            text={locationNotice === 'denied' ? t('memories.editor.locationDenied') : t('memories.editor.locationFailed')}
            testID="editor-location-notice"
          />
        ) : null}
        {draft.placeName || draft.lat || draft.lon ? (
          <AppButton
            variant="ghost"
            label={t('memories.editor.clearLocation')}
            onPress={() => update({ placeName: '', lat: '', lon: '', locationSource: 'NONE', locationTouched: true })}
            testID="editor-location-clear"
          />
        ) : null}
      </Section>

      <Section title={t('memories.editor.tagsTitle')}>
        {draft.tags.length > 0 ? (
          <ChipRow wrap testID="editor-tags">
            {draft.tags.map((tag) => (
              <Chip
                key={tag}
                icon={X}
                label={tag}
                selected
                accessibilityLabel={t('memories.editor.removeTag', { tag })}
                onPress={() => update({ tags: latest().tags.filter((x) => x !== tag) })}
              />
            ))}
          </ChipRow>
        ) : null}
        <View style={styles.inline}>
          <View style={styles.flex}>
            <TextField
              label={t('memories.editor.tag')}
              placeholder={t('memories.editor.tagPlaceholder')}
              value={tagInput}
              onChangeText={(v) => setTagInput(v.slice(0, TAG_MAX))}
              onSubmitEditing={() => {
                update({ tags: addTag(latest().tags, tagInput) });
                setTagInput('');
              }}
              maxLength={TAG_MAX}
              testID="editor-tag-input"
            />
          </View>
          <AppButton
            variant="secondary"
            label={t('memories.editor.addTag')}
            onPress={() => {
              update({ tags: addTag(latest().tags, tagInput) });
              setTagInput('');
            }}
            disabled={!tagInput.trim()}
            testID="editor-tag-add"
          />
        </View>
        {suggestions.length > 0 ? (
          <ChipRow testID="editor-tag-suggestions">
            {suggestions.map((s) => (
              <Chip key={s} icon={Tag} label={s} accessibilityLabel={t('memories.editor.addTagA11y', { tag: s })} onPress={() => update({ tags: addTag(latest().tags, s) })} />
            ))}
          </ChipRow>
        ) : null}
      </Section>

      <Section title={t('memories.editor.groupsTitle')}>
        {groups.data && groups.data.length > 0 ? (
          <ChipRow wrap testID="editor-groups">
            {groups.data.map((g) => {
              const selected = draft.groupIds.includes(g.id);
              return (
                <Chip
                  key={g.id}
                  label={g.name}
                  selected={selected}
                  onPress={() => update({ groupIds: selected ? latest().groupIds.filter((x) => x !== g.id) : [...latest().groupIds, g.id] })}
                  testID={`editor-group-${g.id}`}
                />
              );
            })}
          </ChipRow>
        ) : null}
        <View style={styles.inline}>
          <View style={styles.flex}>
            <TextField
              label={t('memories.groups.newLabel')}
              placeholder={t('memories.groups.newPlaceholder')}
              value={groupName}
              onChangeText={(v) => setGroupName(v.slice(0, GROUP_NAME_MAX))}
              maxLength={GROUP_NAME_MAX}
              editable={!offline}
              testID="editor-group-name"
            />
          </View>
          <AppButton variant="secondary" label={t('memories.groups.create')} onPress={() => void create()} disabled={offline || !groupName.trim()} testID="editor-group-create" />
        </View>
        {groupError ? <FormMessage text={errorText(groupError)} /> : null}
        <IconHint icon={FolderPlus} text={t('memories.editor.groupsHint')} />
      </Section>

      {quotaWarning ? <FormMessage kind="info" text={t('dataSettings.warning')} testID="editor-quota-warning" /> : null}
      {offline ? <FormMessage kind="info" text={t('memories.editor.offline')} testID="editor-offline" /> : null}
      {queued ? <FormMessage kind="info" text={t('memories.editor.queued')} testID="editor-queued" /> : null}
      {saveError ? <FormMessage text={saveError} testID="editor-save-error" /> : null}
      <AppButton
        label={phase === 'uploading' ? t('memories.editor.uploading') : t('common.save')}
        onPress={() => void save()}
        loading={saving}
        // Сонгосон файл дараалалд орж дуустал хадгалахгүй — эс бол «медиа алга» шалгалтаар чимээгүй буцна
        disabled={picking}
        testID="editor-save"
      />
      <AppButton variant="ghost" label={t('memories.editor.discard')} onPress={() => setDiscarding(true)} disabled={saving} testID="editor-discard" />
      <AppText variant="caption" color="textMuted" style={styles.center}>
        {t('memories.editor.draftNote')}
      </AppText>

      <ConfirmSheet
        visible={discarding}
        title={t('memories.editor.discardTitle')}
        body={t('memories.editor.discardBody')}
        confirmLabel={t('memories.editor.discard')}
        onConfirm={() => {
          setDiscarding(false);
          dropUploads(latest().media.filter((m) => !m.mediaId));
          clear(draftKey);
          closeUnlessLeaving();
        }}
        onCancel={() => setDiscarding(false)}
        testID="editor-discard-confirm"
      />
      {conflict ? (
        <ConflictSheet
          visible
          mine={toPreview({ ...draft, location: draft.placeName ? { name: draft.placeName } : null })}
          theirs={toPreview(conflict.current)}
          updatedBy={conflict.updatedBy}
          onKeepMine={() => void keepMine()}
          onKeepTheirs={keepTheirs}
          onDismiss={() => setConflict(null)}
          loading={phase === 'saving'}
        />
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppText variant="h3" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

function IconHint({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.hint}>
      <Icon size={16} color={colors.textMuted} strokeWidth={iconStroke} />
      <AppText variant="caption" color="textMuted" style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  inline: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  flex: { flex: 1 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  center: { textAlign: 'center' },
});
