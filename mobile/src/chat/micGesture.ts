import { PanResponder, type PanResponderInstance } from 'react-native';

import { CANCEL_DX, LOCK_DY } from './voice';

/** Товшилт ба удаан даралтын ялгаа (мс). */
export const TAP_MS = 250;

export interface MicHandlers {
  start: (mode: 'hold' | 'locked') => void;
  cancel: () => void;
  finish: () => void;
  lock: () => void;
}

/**
 * S-45 микрофоны gesture (React-ийн render-ээс гадуур): дарахад `hold` бичлэг эхэлнэ, зүүн тийш
 * `CANCEL_DX`-ээс илүү гулсвал цуцална, дээш `LOCK_DY`-ээс илүү түлхвэл түгжинэ, суллахад илгээнэ.
 * Богино товшилт — түгжсэн горим. `handlers`-ийг эцэг нь effect-ээр шинэчилнэ.
 */
export class MicGesture {
  private handlers: MicHandlers | null = null;
  private startedAt = 0;
  private done = false;
  readonly responder: PanResponderInstance;

  constructor(private readonly now: () => number = Date.now) {
    this.responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => this.grant(),
      onPanResponderMove: (_e, g) => this.move(g.dx, g.dy),
      onPanResponderRelease: () => this.release(),
      onPanResponderTerminate: () => this.terminate(),
    });
  }

  setHandlers(handlers: MicHandlers) {
    this.handlers = handlers;
  }

  grant() {
    this.startedAt = this.now();
    this.done = false;
    this.handlers?.start('hold');
  }

  move(dx: number, dy: number) {
    if (this.done) return;
    if (dx < CANCEL_DX) {
      this.done = true;
      this.handlers?.cancel();
    } else if (dy < LOCK_DY) {
      this.done = true;
      this.handlers?.lock();
    }
  }

  release() {
    if (this.done) return;
    this.done = true;
    if (this.now() - this.startedAt < TAP_MS) this.handlers?.lock();
    else this.handlers?.finish();
  }

  terminate() {
    if (this.done) return;
    this.done = true;
    this.handlers?.cancel();
  }
}

/** Overlay-г зүүн тийш гулсуулж цуцлах (түгжсэн горим). */
export class SwipeToCancel {
  private onCancel: (() => void) | null = null;
  private fired = false;

  setOnCancel(fn: () => void) {
    this.onCancel = fn;
  }

  readonly responder: PanResponderInstance = PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: () => {
      this.fired = false;
    },
    onPanResponderMove: (_e, g) => {
      if (!this.fired && g.dx < CANCEL_DX) {
        this.fired = true;
        this.onCancel?.();
      }
    },
  });
}
