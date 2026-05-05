/**
 * Parseo de importes en formato argentino.
 *
 * El código anterior hacía `parseFloat(priceText.replace(/[^0-9.,]/g,'').replace(',','.'))`.
 * Con "$1.500" eso daba 1.5 en vez de 1500, así que cada vez que un negocio
 * aprobaba una reserva se registraba un ingreso mil veces menor en Finanzas.
 * Y en el alta de gastos, escribir "1.500,50" daba NaN y el insert fallaba
 * porque business_transactions.amount es NOT NULL.
 */
export function parseMoney(input: string | null | undefined): number | null {
  if (input == null) return null;

  // Deja solo dígitos y separadores
  const cleaned = String(input).replace(/[^\d.,-]/g, '').trim();
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  let normalized: string;

  if (lastDot >= 0 && lastComma >= 0) {
    // Están los dos: el que aparece último es el separador decimal.
    // "1.500,50" → decimal ','   |   "1,500.50" → decimal '.'
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = cleaned.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastComma >= 0) {
    // Solo coma: en es-AR siempre es el decimal ("1500,50")
    normalized = cleaned.replace(/,/g, (_m, offset: number) => (offset === lastComma ? '.' : ''));
  } else if (lastDot >= 0) {
    // Solo punto. "1.500" es separador de miles; "1500.50" es decimal.
    const decimals = cleaned.length - lastDot - 1;
    const isThousands = decimals === 3 && cleaned.indexOf('.') === lastDot && lastDot > 0;
    normalized = isThousands ? cleaned.replace('.', '') : cleaned;
  } else {
    normalized = cleaned;
  }

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Formatea un número como pesos argentinos. */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(value);
}
