import { EVENTS_DESTINATION, isRealtimeEnvelope, type RealtimeEnvelope } from './events';
import { encodeFrame, parseFrames } from './stompFrame';

/** WebSocket-ийн шаардлагатай хэсэг (тестэд хуурамчаар солино). */
export interface SocketLike {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

export type SocketFactory = (url: string, protocols: string[]) => SocketLike;

export interface RealtimeClientOptions {
  url: string;
  /** Одоогийн access token (байхгүй бол холбогдохгүй, дараа дахин оролдоно). */
  getToken: () => string | null | Promise<string | null>;
  onEvent: (event: RealtimeEnvelope) => void;
  /** Тасарч дахин холбогдсон бүрд (эхний холболтод биш) — query-г шинэчлэх (DD-AURA-009). */
  onReconnect?: () => void;
  onStatus?: (connected: boolean) => void;
  socketFactory?: SocketFactory;
  heartbeatMs?: number;
}

const OPEN = 1;
export const BACKOFF_MIN_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

/** Дахин холбогдох хүлээлт: 1 → 2 → 4 … 30 с (DD-AURA-008). */
export function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, attempt));
}

/**
 * STOMP 1.2 client (`/ws`, CONNECT-д `Authorization: Bearer`). Зөвхөн `/user/queue/events`-д
 * subscribe хийнэ (AC-31). Тасрахад exponential backoff-оор дахин холбогдоно.
 */
export class RealtimeClient {
  private socket: SocketLike | null = null;
  private buffer = '';
  private attempt = 0;
  private everConnected = false;
  private connected = false;
  private stopped = true;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: RealtimeClientOptions) {}

  get isConnected(): boolean {
    return this.connected;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.open();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const s = this.socket;
    this.socket = null;
    if (s) {
      if (s.readyState === OPEN) s.send(encodeFrame('DISCONNECT'));
      s.close();
    }
    this.setConnected(false);
  }

  /** Токен солигдсон (refresh) үед шинэ токеноор дахин холбогдоно. */
  restart(): void {
    this.stop();
    this.start();
  }

  send(destination: string, body: unknown): boolean {
    if (!this.connected || !this.socket) return false;
    this.socket.send(encodeFrame('SEND', { destination, 'content-type': 'application/json' }, JSON.stringify(body)));
    return true;
  }

  private async open(): Promise<void> {
    if (this.stopped) return;
    const token = await this.opts.getToken();
    if (this.stopped) return;
    if (!token) {
      this.scheduleRetry();
      return;
    }
    const factory = this.opts.socketFactory ?? defaultFactory;
    let socket: SocketLike;
    try {
      socket = factory(this.opts.url, ['v12.stomp']);
    } catch {
      // Хаяг буруу эсвэл платформ WebSocket-гүй — дахин оролдоно
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    this.buffer = '';
    socket.onopen = () => {
      const hb = this.opts.heartbeatMs ?? 10_000;
      socket.send(
        encodeFrame('CONNECT', {
          'accept-version': '1.2',
          host: 'aura',
          'heart-beat': `${hb},${hb}`,
          Authorization: `Bearer ${token}`,
        }),
      );
    };
    socket.onmessage = (ev) => this.onData(typeof ev.data === 'string' ? ev.data : String(ev.data));
    socket.onerror = () => {
      // onclose дараа нь дуудагдана — дахин холболтыг тэнд товлоно
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearTimers();
      this.setConnected(false);
      this.scheduleRetry();
    };
  }

  private onData(data: string): void {
    const { frames, rest } = parseFrames(this.buffer + data);
    this.buffer = rest;
    for (const f of frames) {
      if (f.command === 'CONNECTED') {
        this.onConnected();
      } else if (f.command === 'MESSAGE') {
        let parsed: unknown;
        try {
          parsed = JSON.parse(f.body);
        } catch {
          continue; // гэрээнд нийцэхгүй фрейм — алгасна
        }
        if (isRealtimeEnvelope(parsed)) this.opts.onEvent(parsed);
      } else if (f.command === 'ERROR') {
        // Сервер холболтыг хаана (токен хүчингүй г.м.) — onclose дахин холбогдоно
        this.socket?.close();
      }
    }
  }

  private onConnected(): void {
    const s = this.socket;
    if (!s) return;
    s.send(encodeFrame('SUBSCRIBE', { id: 'events', destination: EVENTS_DESTINATION }));
    const reconnect = this.everConnected;
    this.everConnected = true;
    this.attempt = 0;
    this.setConnected(true);
    const hb = this.opts.heartbeatMs ?? 10_000;
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.readyState === OPEN) this.socket.send('\n');
    }, hb);
    if (reconnect) this.opts.onReconnect?.();
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer) return;
    const delay = backoffDelay(this.attempt++);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.open();
    }, delay);
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.retryTimer = null;
    this.heartbeatTimer = null;
  }

  private setConnected(v: boolean): void {
    if (this.connected === v) return;
    this.connected = v;
    this.opts.onStatus?.(v);
  }
}

const defaultFactory: SocketFactory = (url, protocols) => new WebSocket(url, protocols) as unknown as SocketLike;
