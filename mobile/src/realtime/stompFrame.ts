/**
 * STOMP 1.2 фрейм (https://stomp.github.io/stomp-specification-1.2.html) — гадны сан нэмэхгүйн тулд
 * (Expo Go-нийцтэй, жижиг) өөрсдөө кодлоно. Толгойн утгын escape: `\\`, `\n`, `\r`, `:`.
 */
export interface StompFrame {
  command: string;
  headers: Record<string, string>;
  body: string;
}

const NULL = '\u0000';

function escapeHeader(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/:/g, '\\c');
}

function unescapeHeader(v: string): string {
  return v.replace(/\\(\\|r|n|c)/g, (_, c: string) => (c === '\\' ? '\\' : c === 'r' ? '\r' : c === 'n' ? '\n' : ':'));
}

export function encodeFrame(command: string, headers: Record<string, string> = {}, body = ''): string {
  const lines = [command];
  for (const [k, v] of Object.entries(headers)) {
    // CONNECT фреймд escape хийхгүй (спек)
    lines.push(command === 'CONNECT' ? `${k}:${v}` : `${escapeHeader(k)}:${escapeHeader(v)}`);
  }
  return `${lines.join('\n')}\n\n${body}${NULL}`;
}

/**
 * Нэг WebSocket мессеж дэх фреймүүд (heartbeat — хоосон мөр — алгасна). Бүрэн бус үлдэгдэл
 * буцаагдана: дараагийн мессежтэй залгана.
 */
export function parseFrames(data: string): { frames: StompFrame[]; rest: string } {
  const frames: StompFrame[] = [];
  let buf = data;
  for (;;) {
    buf = buf.replace(/^[\r\n]+/, '');
    const end = buf.indexOf(NULL);
    if (end < 0) break;
    const raw = buf.slice(0, end);
    buf = buf.slice(end + 1);
    const sep = raw.search(/\r?\n\r?\n/);
    const head = sep < 0 ? raw : raw.slice(0, sep);
    const body = sep < 0 ? '' : raw.slice(sep).replace(/^\r?\n\r?\n/, '');
    const [command, ...headerLines] = head.split(/\r?\n/);
    const headers: Record<string, string> = {};
    for (const line of headerLines) {
      const i = line.indexOf(':');
      if (i <= 0) continue;
      const key = unescapeHeader(line.slice(0, i));
      // Давхардсан толгойд эхнийх нь хүчинтэй (спек)
      if (!(key in headers)) headers[key] = unescapeHeader(line.slice(i + 1));
    }
    frames.push({ command, headers, body });
  }
  return { frames, rest: buf };
}
