import { useMeQuery } from '@/api/queries/bootstrap';
import { mediaThumb, partnerName, useCoupleQuery } from '@/api/queries/pairing';
import { useSessionStore } from '@/stores/sessionStore';

export interface Person {
  id: string;
  name: string;
  avatarUri: string | null;
}

/**
 * Хосын хоёр хүн (checklist-ийн аватар AC-96, зардал төлсөн хүн AC-97, ANIM-12): `['me']` ба
 * `['couple']`-оос. Хамтрагчийн аватар нь миний өгсөн зураг → түүний зураг.
 */
export function useCouplePeople(): { me: Person | null; partner: Person | null; byId: (id: string | null | undefined) => Person | null } {
  const myId = useSessionStore((s) => s.userId);
  const meQuery = useMeQuery();
  const couple = useCoupleQuery();
  const meData = meQuery.data;
  const me: Person | null = meData
    ? { id: meData.id, name: meData.callName ?? meData.displayName, avatarUri: mediaThumb(meData.avatar) }
    : myId
      ? { id: myId, name: '', avatarUri: null }
      : null;
  const p = couple.data?.partner;
  const partner: Person | null = p
    ? { id: p.id, name: partnerName(couple.data) ?? p.displayName, avatarUri: mediaThumb(couple.data?.myView.partnerAvatar ?? p.avatar) }
    : null;
  const byId = (id: string | null | undefined) => (!id ? null : id === me?.id ? me : id === partner?.id ? partner : null);
  return { me, partner, byId };
}
