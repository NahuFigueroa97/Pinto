// QR Code generator — pure SVG, no dependencies
export function generateQRSvg(data: string, size: number = 200): string {
  // Simple QR-like visual using the data as encoded text
  // For production use a proper QR lib, this creates a scannable-looking display
  const encoded = btoa(data);
  const cells = 21; // QR version 1 size
  const cellSize = size / cells;
  
  let rects = '';
  // Generate deterministic pattern from data
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      // Finder patterns (corners)
      const isFinderTL = x < 7 && y < 7;
      const isFinderTR = x >= cells - 7 && y < 7;
      const isFinderBL = x < 7 && y >= cells - 7;
      
      let fill = false;
      
      if (isFinderTL || isFinderTR || isFinderBL) {
        const fx = isFinderTR ? x - (cells - 7) : x;
        const fy = isFinderBL ? y - (cells - 7) : y;
        // Outer border
        if (fx === 0 || fx === 6 || fy === 0 || fy === 6) fill = true;
        // Inner square
        else if (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4) fill = true;
        else fill = false;
      } else {
        // Data area - use hash of encoded data
        const charIdx = ((y * cells + x) % encoded.length);
        const charCode = encoded.charCodeAt(charIdx);
        fill = (charCode + x * 7 + y * 13) % 3 !== 0;
      }
      
      if (fill) {
        rects += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
      }
    }
  }
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="white"/>
    ${rects}
  </svg>`;
}

export function encodeReservationQR(reservationId: string, userId: string): string {
  return JSON.stringify({ r: reservationId, u: userId, t: Date.now() });
}
