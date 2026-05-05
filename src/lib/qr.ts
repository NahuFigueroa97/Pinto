import QRCode from 'qrcode';

/**
 * Generación de QR de verdad.
 *
 * La implementación anterior dibujaba un patrón "con pinta de QR": los tres
 * cuadrados de las esquinas y el resto de los módulos rellenados con
 * `(charCode + x*7 + y*13) % 3 !== 0`. No tenía datos codificados, ni bits de
 * formato, ni corrección de errores, ni patrón de sincronización: ningún
 * lector del mundo podía leerlo. El comentario del archivo lo admitía
 * ("creates a scannable-looking display"), pero la pantalla /reservas/qr le
 * decía al usuario "el negocio escaneará tu QR".
 */

/** Prefijo del payload, para distinguir un QR de Pintó de cualquier otro. */
export const QR_PREFIX = 'PINTO:';

/** Lo que se codifica en el QR de una reserva. */
export function encodeReservationQR(checkinCode: string): string {
  return `${QR_PREFIX}${checkinCode}`;
}

/** Extrae el código de check-in de lo que devolvió el lector. */
export function decodeReservationQR(raw: string): string | null {
  const value = (raw ?? '').trim().toUpperCase();
  const code = value.startsWith(QR_PREFIX) ? value.slice(QR_PREFIX.length) : value;
  // Los códigos son 8 caracteres del alfabeto de gen_checkin_code()
  return /^[2-9A-HJKMNP-Z]{8}$/.test(code) ? code : null;
}

/** Devuelve el SVG del QR como string, listo para inyectar. */
export async function generateQRSvg(data: string, size = 240): Promise<string> {
  return QRCode.toString(data, {
    type: 'svg',
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1A1A2E', light: '#FFFFFF' },
  });
}
