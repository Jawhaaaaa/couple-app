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
