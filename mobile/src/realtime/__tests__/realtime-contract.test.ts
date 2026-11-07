import fs from 'fs';
import { load } from 'js-yaml';
import path from 'path';

import { INVALIDATIONS } from '../eventRouter';
import { EVENTS_DESTINATION, REALTIME_EVENT_TYPES, SEND_DESTINATIONS } from '../events';

const ASYNCAPI = path.resolve(__dirname, '../../../../contracts/asyncapi.yaml');

interface AsyncApiDoc {
  channels: Record<string, { address: string }>;
  components: { schemas: Record<string, { enum?: string[] }> };
}

describe('src/realtime нь contracts/asyncapi.yaml-тай нийцнэ', () => {
  const doc = load(fs.readFileSync(ASYNCAPI, 'utf8')) as AsyncApiDoc;

  it('EventType enum яг тэнцүү', () => {
    expect([...REALTIME_EVENT_TYPES].sort()).toEqual([...(doc.components.schemas.EventType.enum ?? [])].sort());
  });

  it('төрөл бүрд кэш шинэчлэх дүрэм бий', () => {
    expect(Object.keys(INVALIDATIONS).sort()).toEqual([...REALTIME_EVENT_TYPES].sort());
  });

  it('AC-31 subscribe ба send-ийн destination гэрээнийх', () => {
    expect(doc.channels.userEvents.address).toBe(EVENTS_DESTINATION);
    expect(doc.channels.typing.address).toBe(SEND_DESTINATIONS.typing);
    expect(doc.channels.presence.address).toBe(SEND_DESTINATIONS.presence);
    expect(doc.channels.chatDelivered.address).toBe(SEND_DESTINATIONS.chatDelivered);
  });
});
