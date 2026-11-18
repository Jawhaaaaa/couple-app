/** E2E орчны хаягууд (playwright.config.ts-ийн тайлбарыг үз). */
export const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');
export const API_BASE = `${API_URL}/api/v1`;
export const MAILPIT_URL = (process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025').replace(/\/$/, '');
