/**
 * error-codes-coverage (AC-145, Б.3): backend-ийн `ErrorCode` enum-ийн код бүрд
 * errors.json-д mn + en мессеж байна. Илүү (enum-д байхгүй) код ч байх ёсгүй.
 */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

import { readContent } from '../content-lint';

const OPENAPI = path.resolve(__dirname, '../../../../contracts/openapi.yaml');

function errorCodes(): string[] {
  const doc = yaml.load(fs.readFileSync(OPENAPI, 'utf8')) as {
    components: { schemas: { ErrorCode: { enum: string[] } } };
  };
  return doc.components.schemas.ErrorCode.enum;
}

describe('AC-145 error-codes-coverage', () => {
  const codes = errorCodes();
  const errors = readContent('errors.json').items;
  const byId = new Map(errors.map((e) => [e.id, e]));

  it('openapi.yaml-аас ErrorCode enum уншигдана', () => {
    expect(codes.length).toBeGreaterThan(0);
  });

  it('ErrorCode бүрд mn ба en мессеж байна', () => {
    const missing = codes.filter((c) => {
      const e = byId.get(c);
      return !e || typeof e.mn !== 'string' || !e.mn.trim() || typeof e.en !== 'string' || !e.en.trim();
    });
    expect(missing).toEqual([]);
  });

  it('errors.json-д enum-д байхгүй код алга', () => {
    const known = new Set(codes);
    expect(errors.map((e) => e.id).filter((id) => !known.has(id))).toEqual([]);
  });
});
