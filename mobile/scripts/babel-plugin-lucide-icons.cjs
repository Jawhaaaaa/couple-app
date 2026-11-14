/**
 * Babel plugin (FR-19.10, AC-160): `import { Heart, X as Close } from 'lucide-react-native'`-ийг
 * дүрс тус бүрийн файл руу (`lucide-react-native/icons/heart`) задлана.
 *
 * Яагаад: Metro tree-shaking хийдэггүй тул barrel import нь ~1700 дүрсийг бүгдийг (вэбийн
 * эхний ачаалалд ~2.5 MB minified) bundle-д оруулдаг. Эх кодын import хэвээр, TS төрөл хэвээр.
 *
 * Нэр → файлын жагсаалтыг сангийн өөрийнх нь `dist/esm/lucide-react-native.mjs`-ээс уншина
 * (`Heart`, `HeartIcon`, `LucideHeart` гэх мэт alias бүгд). Жагсаалтад байхгүй export
 * (`createLucideIcon`, `Icon`, `LucideProvider`, төрөл) нь эх import-д үлдэнэ.
 */
const fs = require('fs');
const path = require('path');

const SOURCE = 'lucide-react-native';
let cached = null;

function iconFiles() {
  if (cached) return cached;
  // package.json нь exports-д алга — cjs entry (dist/cjs/…) -ээс dist/esm руу
  const cjsEntry = require.resolve(SOURCE, { paths: [process.cwd(), __dirname] });
  const barrel = fs.readFileSync(path.join(path.dirname(cjsEntry), '..', 'esm', 'lucide-react-native.mjs'), 'utf8');
  const map = new Map();
  const line = /export \{([^}]+)\} from '\.\/icons\/([a-z0-9-]+)\.mjs';/g;
  for (const m of barrel.matchAll(line)) {
    for (const part of m[1].split(',')) {
      const alias = /default as (\w+)/.exec(part.trim());
      if (alias) map.set(alias[1], m[2]);
    }
  }
  cached = map;
  return map;
}

module.exports = function lucideIcons({ types: t }) {
  return {
    name: 'aura-lucide-icons',
    visitor: {
      ImportDeclaration(p) {
        const node = p.node;
        if (node.source.value !== SOURCE || node.importKind === 'type') return;
        const files = iconFiles();
        const keep = [];
        const split = [];
        for (const spec of node.specifiers) {
          const imported = t.isImportSpecifier(spec) ? (t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value) : null;
          const file = imported && spec.importKind !== 'type' ? files.get(imported) : undefined;
          if (file) split.push(t.importDeclaration([t.importDefaultSpecifier(t.identifier(spec.local.name))], t.stringLiteral(`${SOURCE}/icons/${file}`)));
          else keep.push(spec);
        }
        if (split.length === 0) return;
        if (keep.length > 0) {
          node.specifiers = keep;
          p.insertAfter(split);
        } else {
          p.replaceWithMultiple(split);
        }
      },
    },
  };
};

module.exports.iconFiles = iconFiles;
