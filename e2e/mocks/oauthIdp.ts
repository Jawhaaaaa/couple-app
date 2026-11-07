import { createHmac, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';

/**
 * Google OAuth-ийн тестийн IdP (GAP-18, DD-AURA-032). `e2e` profile-д backend-ийн
 * `aura.oauth.google.issuer` энэ сервер рүү заана. Бодит Google нэвтрэлт — ГАР (AC-06).
 *
 * - `GET /authorize?redirect_uri&state` → тохируулсан хэрэглэгчээр шууд `302 redirect_uri?code&state`
 * - `POST /token` → `{ access_token, id_token }` (HS256, `client_secret`-ээр гарын үсэг)
 * - `GET /userinfo` → `{ sub, email, email_verified, name }`
 */
export interface IdpUser {
  sub: string;
  email: string;
  name: string;
  emailVerified?: boolean;
}

export interface OAuthIdpMock {
  issuer: string;
  setUser(user: IdpUser): void;
  close(): Promise<void>;
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString('base64url');

export async function startOAuthIdp({ port = 0, clientSecret = 'e2e-google-secret' } = {}): Promise<OAuthIdpMock> {
  let user: IdpUser = { sub: 'google-e2e-1', email: 'google.e2e@aura.test', name: 'Google Хэрэглэгч', emailVerified: true };
  const codes = new Map<string, IdpUser>();
  let issuer = '';

  const idToken = (u: IdpUser, aud: string) => {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const now = Math.floor(Date.now() / 1000);
    const payload = b64url(
      JSON.stringify({ iss: issuer, aud, sub: u.sub, email: u.email, email_verified: u.emailVerified ?? true, name: u.name, iat: now, exp: now + 600 }),
    );
    const sig = b64url(createHmac('sha256', clientSecret).update(`${header}.${payload}`).digest());
    return `${header}.${payload}.${sig}`;
  };

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/authorize') {
      const code = randomBytes(12).toString('hex');
      codes.set(code, user);
      const target = new URL(url.searchParams.get('redirect_uri') ?? '');
      target.searchParams.set('code', code);
      const state = url.searchParams.get('state');
      if (state) target.searchParams.set('state', state);
      res.writeHead(302, { Location: target.toString() });
      return res.end();
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      const u = codes.get(form.get('code') ?? '');
      res.setHeader('Content-Type', 'application/json');
      if (!u) {
        res.statusCode = 400;
        return res.end('{"error":"invalid_grant"}');
      }
      codes.delete(form.get('code') ?? '');
      return res.end(JSON.stringify({ access_token: `at-${u.sub}`, token_type: 'Bearer', expires_in: 600, id_token: idToken(u, form.get('client_id') ?? '') }));
    }
    if (url.pathname === '/userinfo') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ sub: user.sub, email: user.email, email_verified: user.emailVerified ?? true, name: user.name }));
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(port, r));
  const address = server.address();
  issuer = `http://localhost:${typeof address === 'object' && address ? address.port : port}`;
  return {
    issuer,
    setUser: (u) => {
      user = u;
    },
    close: () => new Promise((r) => server.close(() => r())),
  };
}
