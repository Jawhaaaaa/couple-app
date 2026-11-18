import { MAILPIT_URL } from './env';

interface MailpitSummary {
  ID: string;
  Created: string;
  Subject: string;
  To: { Address: string }[];
}

/** Тухайн хаягт ирсэн хамгийн сүүлийн имэйлийг хүлээнэ (Mailpit API, DEV орчин). */
export async function waitForMail(to: string, { timeoutMs = 15_000, after }: { timeoutMs?: number; after?: Date } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=5`);
    if (res.ok) {
      const { messages } = (await res.json()) as { messages: MailpitSummary[] };
      const hit = messages.find((m) => !after || new Date(m.Created) > after);
      if (hit) {
        const full = await fetch(`${MAILPIT_URL}/api/v1/message/${hit.ID}`);
        const body = (await full.json()) as { Subject: string; Text: string; HTML: string };
        return { subject: body.Subject, text: body.Text, html: body.HTML };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${to} хаягт имэйл ${timeoutMs} мс-д ирсэнгүй`);
}

/** Имэйлээс 6 оронтой баталгаажуулах код (FR-1.2). */
export function extractCode(text: string): string {
  const m = /\b(\d{6})\b/.exec(text);
  if (!m) throw new Error('Имэйлд 6 оронтой код алга');
  return m[1];
}

export async function clearMailbox() {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
}
