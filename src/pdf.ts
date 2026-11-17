/**
 * A minimal PDF writer: one JPEG image per page, scaled to fill the page.
 * Enough for exporting boards; no fonts or vector content.
 */
export interface PdfPage {
  jpeg: Uint8Array;
  /** Image size in pixels. */
  px: number;
  py: number;
  /** Page size in points (1/72 inch). */
  w: number;
  h: number;
}

export function buildPdf(pages: PdfPage[]): Uint8Array {
  const enc = new TextEncoder(), chunks: Uint8Array[] = [], offsets: number[] = [];
  let len = 0;
  const push = (d: Uint8Array | string) => { const b = typeof d === 'string' ? enc.encode(d) : d; chunks.push(b); len += b.length; };
  const obj = (id: number, ...parts: (Uint8Array | string)[]) => { offsets[id] = len; push(`${id} 0 obj\n`); parts.forEach(push); push('\nendobj\n'); };
  push('%PDF-1.4\n'); push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const n = pages.length, total = 3 + 3 * n;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] /Count ${n} >>`);
  pages.forEach((p, i) => {
    const pid = 3 + 3 * i, w = Math.round(p.w * 100) / 100, h = Math.round(p.h * 100) / 100;
    obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${pid + 2} 0 R >> >> /Contents ${pid + 1} 0 R >>`);
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`;
    obj(pid + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    obj(pid + 2, `<< /Type /XObject /Subtype /Image /Width ${p.px} /Height ${p.py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream');
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
