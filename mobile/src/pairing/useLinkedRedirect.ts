import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { useMeQuery } from '@/api/queries/bootstrap';
import { PAIRING_POLL_MS } from '@/api/queries/pairing';
import { onRealtime } from '@/realtime';

/**
 * Хос холбогдмогц (AC-11) хоёр талыг S-12 руу шилжүүлнэ: `couple.linked` realtime
 * үйл явдал эсвэл (realtime тасарсан үед) `['me']`-ийн `space.kind` SOLO → COUPLE
 * болсныг тогтмол шалгалтаар мэдэх. Нэг дэлгэцээс нэг л удаа шилжинэ.
 */
export function useLinkedRedirect({ poll = true }: { poll?: boolean } = {}) {
  const kind = useMeQuery({ refetchInterval: poll ? PAIRING_POLL_MS : false }).data?.space.kind;
  const previous = useRef(kind);
  const done = useRef(false);

  const goLinked = useCallback(() => {
    if (done.current) return;
    done.current = true;
    router.replace('/linked');
  }, []);

  useEffect(() => onRealtime('couple.linked', goLinked), [goLinked]);

  useEffect(() => {
    if (previous.current === 'SOLO' && kind === 'COUPLE') goLinked();
    previous.current = kind;
  }, [kind, goLinked]);

  return goLinked;
}
