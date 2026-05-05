// Moderación de contenido para planes sociales, mensajes y perfiles.
// Bloquea contenido sexual, violento o dañino.
//
// El filtro anterior usaba `lower.includes(word)`, o sea coincidencia por
// subcadena. Con términos como "arma", "hotel", "cama", "oral", "anal",
// "pete" o "hot" eso bloqueaba muchísimo texto legítimo:
//   "armamos una juntada"  → "arma"
//   "en el Hotel Ancasti"  → "hotel"
//   "competencia de pádel" → "pete"
//   "análisis de laboratorio" → "anal" y "oral"
//   "salimos del canal"    → "anal"
// Ahora se compara por palabra completa con límites tipo \b, y las frases
// de varias palabras se buscan como frase.

const BLOCKED_WORDS = [
  // Sexual
  'sexo', 'sexual', 'coger', 'garchar', 'pija', 'concha', 'tetas', 'orgia',
  'pete', 'porno', 'xxx', 'nudes', 'escort', 'trio',
  'swinger', 'milf', 'hookup',
  'masturbacion', 'fetiche',
  // Violencia
  'matar', 'golpear', 'apuñalar',
  'cuchillo', 'navaja', 'afanar', 'chorear',
  'falopa', 'merca', 'porro', 'faso', 'cocaina', 'paco',
  'lastimar', 'venganza',
  // Estafas
  'estafa', 'piramide', 'multinivel',
];

// Frases: acá sí tiene sentido buscar la secuencia completa
const BLOCKED_PHRASES = [
  'cagar a pinas',
  'plata facil',
  'dinero facil',
  'negocio facil',
  'inversion segura',
  'pack de fotos',
  'sugar daddy',
  'sugar baby',
  'arma de fuego',
];

// Patrones de riesgo para menores
const BLOCKED_PATTERNS: RegExp[] = [
  /(^|\s)\+?18\s*\+/i,
  /\bmenor(?:es)?\s+de\s+edad\b/i,
  /\bnen[ai]t[oa]s?\b/i,
  /\bpibe?[as]?\s+de\s+1[0-7]\b/i,
  /\bsolo\s+chic[ao]s?\s+de\s+1[0-7]\b/i,
];

const GENERIC_REASON =
  '🚫 El texto tiene contenido que no permitimos. Pintó es para juntadas sanas y divertidas. Revisalo y volvé a intentar.';

/** Quita tildes y pasa a minúsculas para comparar sin depender de la escritura. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Se compilan una sola vez: construir el RegExp en cada llamada era
// trabajo repetido en cada tecla del formulario.
const WORD_REGEXPS = BLOCKED_WORDS.map(
  (w) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(normalize(w))}(s|es)?([^\\p{L}\\p{N}]|$)`, 'iu'),
);

const PHRASE_REGEXPS = BLOCKED_PHRASES.map(
  (p) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(normalize(p)).replace(/\s+/g, '\\s+')}([^\\p{L}\\p{N}]|$)`, 'iu'),
);

export interface ModerationResult {
  ok: boolean;
  reason: string;
}

export function moderateContent(text: string): ModerationResult {
  if (!text || !text.trim()) return { ok: true, reason: '' };

  const normalized = normalize(text);

  for (const re of PHRASE_REGEXPS) {
    if (re.test(normalized)) return { ok: false, reason: GENERIC_REASON };
  }
  for (const re of WORD_REGEXPS) {
    if (re.test(normalized)) return { ok: false, reason: GENERIC_REASON };
  }
  for (const re of BLOCKED_PATTERNS) {
    if (re.test(normalized) || re.test(text)) return { ok: false, reason: GENERIC_REASON };
  }

  return { ok: true, reason: '' };
}

/**
 * Valida varios campos de una sola vez.
 * Antes la moderación solo corría en el título y la descripción del plan;
 * el bio del perfil, los mensajes del chat y los mensajes a negocios pasaban
 * sin ningún filtro.
 */
export function moderateAll(...texts: (string | null | undefined)[]): ModerationResult {
  for (const t of texts) {
    if (!t) continue;
    const r = moderateContent(t);
    if (!r.ok) return r;
  }
  return { ok: true, reason: '' };
}
