/**
 * Build үеийн тохиргоо. `EXPO_PUBLIC_*`-д нууц утга байхгүй (INV-10, AC-195) —
 * зөвхөн хаяг ба хувилбарын мэдээлэл.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');
export const API_BASE = `${API_URL}/api/v1`;
export const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? `${API_URL.replace(/^http/, 'ws')}/ws`;
export const APP_VERSION = process.env.EXPO_PUBLIC_APP_VERSION ?? '1.0.0';
export const BUILD_NUMBER = process.env.EXPO_PUBLIC_BUILD ?? 'dev';
export const COMMIT_SHA = process.env.EXPO_PUBLIC_COMMIT_SHA ?? 'local';

/**
 * Google нэвтрэлт backend дээр тохируулагдсан эсэх (`GOOGLE_CLIENT_ID/SECRET`, GAP-18).
 * Нууц биш — зөвхөн товчийг харуулах эсэх. Тохируулаагүй бол S-03-т товч харагдахгүй.
 */
export const GOOGLE_SIGN_IN_ENABLED = /^(1|true)$/i.test(process.env.EXPO_PUBLIC_OAUTH_GOOGLE ?? '');
/** Apple нэвтрэлт энэ гаргалтад идэвхгүй (AC-06, GAP-02 — native iOS build алга). */
export const APPLE_SIGN_IN_ENABLED = false;

/**
 * Web Push-ийн VAPID **нийтийн** түлхүүр (base64url, FR-19.3). Заавал биш: хоосон бол
 * `GET /push/vapid-public-key`-ээс авна (backend-ийн тохиргоо нэг эх).
 */
export const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';
