// Content moderation for social plans
// Blocks inappropriate content: sexual, violent, or harmful

const BLOCKED_WORDS = [
  // Sexual
  'sexo', 'sexual', 'coger', 'garchar', 'pija', 'concha', 'tetas', 'orgia', 'orgía',
  'pete', 'porno', 'xxx', 'nudes', 'pack', 'hot', 'escort', 'trío', 'trio',
  'swinger', 'sugar', 'milf', 'hookup', 'cama', 'hotel',
  'masturbación', 'masturbacion', 'anal', 'oral', 'fetiche',
  // Violence
  'matar', 'pegar', 'pelear', 'pelea', 'golpear', 'cagar a piñas', 'piñas',
  'arma', 'cuchillo', 'navaja', 'robar', 'afanar', 'chorear',
  'droga', 'drogas', 'falopa', 'merca', 'porro', 'faso',
  'daño', 'dañar', 'lastimar', 'venganza',
  // Scams / dangerous
  'negocio fácil', 'plata fácil', 'dinero fácil', 'estafa', 'pyramide',
  'bitcoin fácil', 'inversión segura', 'multinivel',
];

const BLOCKED_PATTERNS = [
  /\b18\+\b/i,
  /\b\+18\b/i,
  /\bmenor(?:es)?\b/i,
  /\bneni?t[ao]s?\b/i,
  /\bpibe de \d+\b/i,
];

export function moderateContent(text: string): { ok: boolean; reason: string } {
  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lowerOriginal = text.toLowerCase();

  for (const word of BLOCKED_WORDS) {
    const normalizedWord = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes(normalizedWord) || lowerOriginal.includes(word)) {
      return {
        ok: false,
        reason: `🚫 Tu plan contiene contenido no permitido. Pintó es para juntadas sanas y divertidas. Revisá el texto y volvé a intentar.`,
      };
    }
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        ok: false,
        reason: `🚫 Tu plan contiene contenido no permitido. Pintó es para juntadas sanas y divertidas.`,
      };
    }
  }

  return { ok: true, reason: '' };
}
