import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const MOBILE = path.resolve(__dirname, '../../..');

describe('src/api/schema.d.ts нь contracts/openapi.yaml-тай нийцнэ (DD-AURA-002)', () => {
  it('дахин үүсгэхэд зөрүү 0 (`npm run gen:api`)', () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aura-api-')), 'schema.d.ts');
    const bin = path.join(MOBILE, 'node_modules/openapi-typescript/bin/cli.js');
    execFileSync(process.execPath, [bin, path.join(MOBILE, '../contracts/openapi.yaml'), '-o', out], { stdio: 'pipe' });
    const norm = (s: string) => s.replace(/\r\n/g, '\n');
    const fresh = norm(fs.readFileSync(out, 'utf8'));
    const committed = norm(fs.readFileSync(path.join(MOBILE, 'src/api/schema.d.ts'), 'utf8'));
    expect(fresh === committed).toBe(true);
  }, 60_000);
});
