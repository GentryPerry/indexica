/**
 * A minimal PDF writer: one JPEG image per page, scaled to fill the page, with an optional invisible
 * text layer laid over it so the text can be searched, selected, and copied.
 */
export interface PdfText {
  str: string;
  /** Baseline start in points, measured from the bottom-left of the page. */
  x: number;
  y: number;
  size: number;
  /** Counter-clockwise rotation in radians. */
  angle?: number;
  /** Horizontal stretch in percent, so the invisible text spans the same width as the visible text. */
  scale?: number;
}
export interface PdfPage {
  jpeg: Uint8Array;
  /** Image size in pixels. */
  px: number;
  py: number;
  /** Page size in points (1/72 inch). */
  w: number;
  h: number;
  texts?: PdfText[];
}

// Characters outside Latin-1 that the standard PDF fonts can still show, by their WinAnsi code.
const WIN_ANSI: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
  'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

/** Text as WinAnsi bytes for a PDF string. Characters the standard fonts cannot show become '?'. */
export function winAnsi(str: string): number[] {
  const out: number[] = [];
  for (const ch of str) {
    const c = ch.codePointAt(0)!;
    if (WIN_ANSI[ch] !== undefined) out.push(WIN_ANSI[ch]);
    else if (c >= 0x20 && c <= 0x7e) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else if (ch === '\t') out.push(0x20);
    else out.push(0x3f);
  }
  return out;
}

/** A PDF literal string, with the characters that need it escaped. */
function literal(bytes: number[]): number[] {
  const out = [0x28];
  for (const b of bytes) { if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c); out.push(b); }
  out.push(0x29);
  return out;
}

const num = (v: number) => String(Math.round(v * 1000) / 1000);
const ascii = (s: string) => Array.from(s, c => c.charCodeAt(0));

/** The drawing instructions for one page: the image, then the invisible text (render mode 3). */
export function pageContent(p: PdfPage, img: string): Uint8Array {
  const out: number[] = ascii(`q ${num(p.w)} 0 0 ${num(p.h)} 0 0 cm /${img} Do Q\n`);
  if (p.texts && p.texts.length) {
    out.push(...ascii('BT 3 Tr\n'));
    for (const t of p.texts) {
      const a = t.angle || 0, c = Math.cos(a), s = Math.sin(a);
      out.push(...ascii(`/F1 ${num(t.size)} Tf ${num(t.scale || 100)} Tz ${num(c)} ${num(s)} ${num(-s)} ${num(c)} ${num(t.x)} ${num(t.y)} Tm `), ...literal(winAnsi(t.str)), ...ascii(' Tj\n'));
    }
    out.push(...ascii('ET\n'));
  }
  return new Uint8Array(out);
}

export function buildPdf(pages: PdfPage[]): Uint8Array {
  const enc = new TextEncoder(), chunks: Uint8Array[] = [], offsets: number[] = [];
  let len = 0;
  const push = (d: Uint8Array | string) => { const b = typeof d === 'string' ? enc.encode(d) : d; chunks.push(b); len += b.length; };
  const obj = (id: number, ...parts: (Uint8Array | string)[]) => { offsets[id] = len; push(`${id} 0 obj\n`); parts.forEach(push); push('\nendobj\n'); };
  push('%PDF-1.4\n'); push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  // 1 catalog, 2 page list, 3 font, then three objects per page: the page, its content, its image.
  const n = pages.length, total = 4 + 3 * n, pid = (i: number) => 4 + 3 * i;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pid(i)} 0 R`).join(' ')}] /Count ${n} >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  pages.forEach((p, i) => {
    const id = pid(i), content = pageContent(p, `Im${i}`);
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(p.w)} ${num(p.h)}] /Resources << /XObject << /Im${i} ${id + 2} 0 R >> /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`);
    obj(id + 1, `<< /Length ${content.length} >>\nstream\n`, content, '\nendstream');
    obj(id + 2, `<< /Type /XObject /Subtype /Image /Width ${p.px} /Height ${p.py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream');
  });
  const xref = len;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let id = 1; id < total; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
