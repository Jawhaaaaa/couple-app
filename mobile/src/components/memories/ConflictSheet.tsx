import { ConflictResolutionSheet, type ConflictVersion } from '@/components/ConflictResolutionSheet';
import { formatDateLong, useT } from '@/i18n';
import { type Locale, usePrefsStore } from '@/stores/prefsStore';

export interface VersionPreview {
  title: string;
  occurredOn: string;
  placeName?: string | null;
  description?: string | null;
}

interface Props {
  visible: boolean;
  mine: VersionPreview;
  theirs: VersionPreview;
  /** Сервер дээр сүүлд өөрчилсөн хүний нэр (`details.updatedBy`). */
  updatedBy: string | null;
  onKeepMine: () => void;
  onKeepTheirs: () => void;
  /** Сонголтгүй хаах (Android «буцах») — ноорог хэвээр, дахин хадгалж болно. */
  onDismiss: () => void;
  loading?: boolean;
}

function toVersion(v: VersionPreview, locale: Locale): ConflictVersion {
  return { title: v.title, meta: [formatDateLong(v.occurredOn, locale), v.placeName].filter(Boolean).join(' · '), body: v.description };
}

/**
 * Дурсамжийн зэрэг засварын сонголт (FR-15.1, AC-131, INV-07) — ерөнхий
 * `ConflictResolutionSheet`-ийг дурсамжийн огноо, газраар бөглөнө.
 */
export function ConflictSheet({ visible, mine, theirs, updatedBy, onKeepMine, onKeepTheirs, onDismiss, loading }: Props) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  return (
    <ConflictResolutionSheet
      visible={visible}
      title={updatedBy ? t('memories.conflict.titleBy', { name: updatedBy }) : t('memories.conflict.title')}
      mine={toVersion(mine, locale)}
      theirs={toVersion(theirs, locale)}
      onKeepMine={onKeepMine}
      onKeepTheirs={onKeepTheirs}
      onDismiss={onDismiss}
      loading={loading}
    />
  );
}
