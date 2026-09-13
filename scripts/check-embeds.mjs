#!/usr/bin/env node
/**
 * Detecta embeds ambiguos de PostgREST antes de que lleguen al teléfono.
 *
 * PostgREST resuelve `.select('*, creator:profiles(...)')` buscando la
 * relación entre las dos tablas. Si encuentra más de una, falla con:
 *
 *   PGRST201: could not embed because more than one relationship was found
 *
 * Y no solo cuentan las claves foráneas directas: una tabla puente con dos
 * FKs y unicidad sobre ambas columnas (social_plan_members, plan_chat_reads,
 * plan_photo_views…) cuenta como una relación muchos-a-muchos más.
 *
 * Eso hizo que /planes no mostrara NUNCA un plan: el error venía desde el
 * primer día y quedaba tapado por `data ?? []`. La forma de desambiguar es
 * el hint: `creator:profiles!creator_id(...)`.
 *
 * Uso:  npm run check:embeds
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const listFiles = (dir, exts) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, exts));
    else if (exts.some(e => entry.endsWith(e))) out.push(p);
  }
  return out;
};

// ── 1. Esquema: claves foráneas y tablas puente ──
const sql = listFiles('supabase/migrations', ['.sql'])
  .sort().map(f => readFileSync(f, 'utf8')).join('\n');

const fks = new Map();     // tabla -> [{ col, target }]
const tables = new Map();  // tabla -> cuerpo
const addFk = (t, col, target) => {
  if (!fks.has(t)) fks.set(t, []);
  fks.get(t).push({ col, target });
};

for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
  const [, table, body] = m;
  tables.set(table, body);
  for (const c of body.matchAll(/(\w+)\s+uuid[^,\n]*REFERENCES\s+(?:public\.)?(\w+)/gi)) {
    addFk(table, c[1], c[2]);
  }
}
for (const m of sql.matchAll(/ALTER TABLE public\.(\w+)\s+ADD CONSTRAINT \w+\s+FOREIGN KEY \((\w+)\) REFERENCES public\.(\w+)/gi)) {
  addFk(m[1], m[2], m[3]);
}

// Una tabla es "puente" si tiene dos FKs y una restricción de unicidad que
// cubre exactamente esas dos columnas.
const paths = new Map();  // "origen|destino" -> [descripción]
const addPath = (a, b, why) => {
  const k = `${a}|${b}`;
  if (!paths.has(k)) paths.set(k, []);
  paths.get(k).push(why);
};

for (const [table, cols] of fks) {
  for (const { col, target } of cols) addPath(table, target, `FK ${table}.${col}`);
}

const junctions = [];
for (const [table, body] of tables) {
  const cols = fks.get(table) ?? [];
  if (cols.length < 2) continue;
  for (const u of body.matchAll(/(?:UNIQUE|PRIMARY KEY)\s*\(([^)]*)\)/gi)) {
    const parts = u[1].split(',').map(s => s.trim());
    const targets = cols.filter(c => parts.includes(c.col)).map(c => c.target);
    if (targets.length === 2) {
      junctions.push([table, targets[0], targets[1]]);
      addPath(targets[0], targets[1], `M2M vía ${table}`);
      addPath(targets[1], targets[0], `M2M vía ${table}`);
    }
  }
}

// ── 2. Embeds en el código ──
const problems = [];
for (const file of listFiles('src', ['.ts', '.tsx'])) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\.from\(\s*'(\w+)'\s*\)([\s\S]{0,900}?)(?=\n\s*(?:const|return|\}|if|await|;))/g)) {
    const base = m[1];
    for (const e of m[2].matchAll(/(\w+):(\w+)(!?\w*)\(/g)) {
      const [, , target, hint] = e;
      if (!tables.has(target)) continue;
      const ways = paths.get(`${base}|${target}`) ?? [];
      if (ways.length > 1 && !hint.startsWith('!')) {
        problems.push({
          file,
          line: src.slice(0, m.index).split('\n').length,
          base, target, ways,
        });
      }
    }
  }
}

if (problems.length === 0) {
  console.log(`✓ Sin embeds ambiguos (${tables.size} tablas, ${junctions.length} puentes)`);
  process.exit(0);
}

console.error('\n✗ Embeds ambiguos: PostgREST va a fallar con PGRST201\n');
for (const p of problems) {
  console.error(`  ${p.file}:${p.line}`);
  console.error(`    ${p.base} → ${p.target} tiene ${p.ways.length} caminos:`);
  for (const w of p.ways) console.error(`      · ${w}`);
  console.error(`    Solución: ${p.target}!<columna>(...)  — por ejemplo ${p.target}!creator_id(...)\n`);
}
process.exit(1);
