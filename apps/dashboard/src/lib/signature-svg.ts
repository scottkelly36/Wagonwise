import {
  SIGNATURE_HEIGHT,
  SIGNATURE_WIDTH,
  type SignatureStrokes,
} from '@wagonwise/contracts/jobs';

/** The SVG path for a receiver's signature: each stroke is a move to its first point and lines through the rest; a stroke
 *  that is one point is drawn as a tiny line so it still shows as a dot. Only whole numbers from the contract go in. */
export function signaturePath(strokes: SignatureStrokes): string {
  return strokes
    .map((stroke) => {
      const [first, ...rest] = stroke;
      if (first === undefined) return '';
      const to = rest.length === 0 ? [[first[0] + 0.1, first[1]]] : rest;
      return `M${first[0]} ${first[1]}${to.map((p) => `L${p[0]} ${p[1]}`).join('')}`;
    })
    .join('');
}

/** The signature as a standalone `<svg>` string for the printed delivery record. Dark ink on white, so it prints well. */
export function signatureSvg(strokes: SignatureStrokes, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIGNATURE_WIDTH} ${SIGNATURE_HEIGHT}" role="img" aria-label="${label.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')}" width="360"><rect width="${SIGNATURE_WIDTH}" height="${SIGNATURE_HEIGHT}" fill="#fff" stroke="#e5e7eb" stroke-width="2"/><path d="${signaturePath(strokes)}" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
