#!/usr/bin/env node
/**
 * Guarda contra spinners sin salida.
 *
 * El bug que más veces volvió en Pintó no fue uno solo: fue la forma
 * `if (isLoading) return <spinner/>`. Cuando una consulta no resuelve —lock
 * de auth, petición colgada, fallback de <Suspense> que no hidrata— esa
 * pantalla queda girando sin error, sin reintento y sin forma de salir.
 *
 * Arreglarlas de a una no sirve: la siguiente pantalla que alguien escriba
 * repite el patrón. Este chequeo lo hace fallar en `npm run verify`.
 *
 * Regla: toda rueda de carga pasa por <PageSpinner> o <QueryState>, que a
 * los 10 s ofrecen reintentar / volver / diagnóstico.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const EXENTOS = new Set(['src/components/shared/PageSpinner.tsx']);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

const problemas = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  if (EXENTOS.has(rel)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;

    // Rueda cruda de pantalla. `spinner-sm` queda exento a propósito: es el
    // indicador chico que va DENTRO de contenido ya dibujado (una sublista
    // que se recarga), no un gate que tape la pantalla entera.
    if (/className="[^"]*\bspinner\b(?!-)[^"]*"/.test(line) && !line.includes('PageSpinner')) {
      problemas.push([at, 'rueda cruda; usá <PageSpinner /> o <QueryState>']);
    }

    // Íconos girando como estado de carga de pantalla (no dentro de un botón).
    if (/Loader2[^>]*animate-spin/.test(line) && /Suspense fallback|return\s*\(?\s*</.test(line)) {
      problemas.push([at, 'carga con Loader2; usá <PageSpinner />']);
    }

    // Fallback de Suspense que no es PageSpinner.
    if (line.includes('Suspense fallback=') && !line.includes('PageSpinner')) {
      problemas.push([at, 'fallback de <Suspense> sin salida; usá <PageSpinner />']);
    }
  });
}

if (problemas.length) {
  console.error(`\n✖ ${problemas.length} spinner(s) sin salida de emergencia:\n`);
  for (const [at, msg] of problemas) console.error(`  ${at}\n    ${msg}`);
  console.error('\nToda pantalla que carga tiene que poder reintentarse o abandonarse.\n');
  process.exit(1);
}

console.log('✓ Ningún spinner sin salida');
