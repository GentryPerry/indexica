import { beforeAll, describe, expect, it } from 'vitest';
import { setMeasurer } from '../src/geometry';
import { loadPresets } from '../src/presetgeom';
import { newSlide } from '../src/slides';
import { sampleChart } from '../src/chart';
import { writePptx } from '../src/pptx-write';
import { unzip, zip, text, crc32, utf8 } from '../src/zip';
import { parseXml, kid, find, textOf } from '../src/xml';
import type { El } from '../src/types';

beforeAll(async () => { setMeasurer((t, size) => t.length * size * 0.5); await loadPresets(); });

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));

export function sampleDeck(): Record<string, El> {
  const els: Record<string, El> = {}; let n = 0;
  const uid = (p: string) => p + ++n, get = (id: string) => els[id];
  for (const e of newSlide(els, get, 'titleBody', 'wide', uid, 1)) els[e.id] = e;
  const f = Object.values(els).find(e => e.type === 'frame')!;
  f.notes = 'Say hello\nThen the plan';
  f.foot = { num: true, text: 'JAM' };
  Object.values(els).find(e => e.ph === 'title')!.text = 'Quarterly plan & goals';
  Object.values(els).find(e => e.ph === 'body')!.text = 'Ship slides\n\tThemes\n\tLayouts\nShip sync';
  const add = (e: Partial<El>) => { const id = uid('x'); els[id] = { id, z: 100 + n, x: f.x + 100, y: f.y + 100, w: 200, h: 100, ...e } as El; return els[id]; };
  add({ type: 'rect', preset: 'rightArrow', adj: { adj2: 70000 }, fill: '#2e6fd8', text: 'Next', x: f.x + 900, y: f.y + 500 });
  add({ type: 'image', src: 'img1', crop: [0.1, 0, 0.1, 0], x: f.x + 50, y: f.y + 400 });
  add({ type: 'table', cells: [['A', 'B'], ['1', '2']], header: true, tstyle: 'medium2', tacc: '#2e6fd8', x: f.x + 300, y: f.y + 400 });
  add({ type: 'chart', chart: sampleChart('stackedColumn'), x: f.x + 600, y: f.y + 200, w: 400, h: 250 });
  add({ type: 'ellipse', fill: '#fde68a', x: f.x + 10, y: f.y + 10, w: 50, h: 50 });
  const b = add({ type: 'sticky', text: 'note', x: f.x + 1000, y: f.y + 100 });
  add({ type: 'conn', a: b.id, b: Object.values(els).find(e => e.type === 'ellipse')!.id, x: 0, y: 0, w: 0, h: 0 });
  add({ type: 'pen', pts: [[0, 0], [20, 10], [40, 0]], x: f.x + 200, y: f.y + 600 });
  return els;
}

describe('zip', () => {
  it('round-trips files, stored and deflated', async () => {
    const big = 'hello world '.repeat(500);
    const z = await zip([['a.txt', 'hi'], ['dir/b.xml', big], ['c.png', PNG]]);
    const back = await unzip(z);
    expect(text(back.get('a.txt')!)).toBe('hi');
    expect(text(back.get('dir/b.xml')!)).toBe(big);
    expect(back.get('c.png')!.length).toBe(PNG.length);
    expect(z.length).toBeLessThan(big.length);
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926);
  });
});

describe('xml', () => {
  it('reads elements, attributes, text, and entities', () => {
    const d = parseXml('<?xml version="1.0"?><a:r x="1 &amp; 2"><a:t>Tom &amp; Jerry &#x41;</a:t><a:br/><a:t>x</a:t></a:r>');
    expect(d.tag).toBe('a:r'); expect(d.at.x).toBe('1 & 2');
    expect(kid(d, 'a:t')!.text).toBe('Tom & Jerry A');
    expect(find(d, 'a:t').length).toBe(2); expect(textOf(d)).toBe('Tom & Jerry Ax');
  });
});

describe('pptx export', () => {
  it('writes a package PowerPoint can read', async () => {
    const els = sampleDeck();
    const bytes = await writePptx(els, id => els[id], { image: src => src === 'img1' ? { bytes: PNG, ext: 'png' } : undefined, today: 'November 18, 2026', title: 'Test' });
    const files = await unzip(bytes);
    for (const p of ['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/slides/slide1.xml', 'ppt/theme/theme1.xml', 'ppt/charts/chart1.xml', 'ppt/media/image1.png', 'ppt/notesSlides/notesSlide1.xml'])
      expect(files.has(p), p).toBe(true);
    // Every part parses, and every relationship target exists.
    for (const [name, b] of files) if (/\.(xml|rels)$/.test(name)) expect(() => parseXml(text(b)), name).not.toThrow();
    for (const [name, b] of files) if (name.endsWith('.rels')) {
      const base = name.replace('_rels/', '').replace(/\.rels$/, '').split('/').slice(0, -1);
      for (const r of find(parseXml(text(b)), 'Relationship')) {
        const parts = [...base]; for (const seg of r.at.Target.split('/')) { if (seg === '..') parts.pop(); else parts.push(seg); }
        expect(files.has(parts.join('/')), `${name} -> ${r.at.Target}`).toBe(true);
      }
    }
    const slide = parseXml(text(files.get('ppt/slides/slide1.xml')!));
    const words = find(slide, 'a:t').map(t => t.text);
    expect(words).toContain('Quarterly plan & goals');
    expect(words).toContain('Themes');
    expect(find(slide, 'a:prstGeom').some(g => g.at.prst === 'rightArrow')).toBe(true);
    expect(find(slide, 'a:gd').some(g => g.at.name === 'adj2' && g.at.fmla === 'val 70000')).toBe(true);
    expect(find(slide, 'a:pPr').some(p => p.at.lvl === '1')).toBe(true);
    expect(find(slide, 'a:srcRect')[0].at.l).toBe('10000');
    expect(find(slide, 'a:tbl').length).toBe(1);
    const sz = parseXml(text(files.get('ppt/presentation.xml')!));
    expect(kid(sz, 'p:sldSz')!.at).toEqual({ cx: '12192000', cy: '6858000' });
    const chart = text(files.get('ppt/charts/chart1.xml')!);
    expect(chart).toContain('<c:grouping val="stacked"/>');
    expect(text(files.get('ppt/notesSlides/notesSlide1.xml')!)).toContain('Then the plan');
    const fs = await import('node:fs' as string);
    fs.writeFileSync('/tmp/jam-test.pptx', bytes);
  });
});

describe('pptx import', () => {
  it('reads a PowerPoint file made elsewhere', async () => {
    const { readPptx } = await import('../src/pptx-read');
    const fs = await import('node:fs' as string);
    const deck = await readPptx(new Uint8Array(fs.readFileSync(new URL('./fixtures/sample.pptx', import.meta.url))));
    expect(deck.slides.length).toBe(3);
    expect(Math.round(deck.w)).toBe(1280); expect(Math.round(deck.h)).toBe(720);
    const [s1, s2, s3] = deck.slides;
    const title = s1.els.find(e => e.ph === 'title')!;
    expect(title.text).toBe('Fixture deck');
    expect(title.size).toBeGreaterThan(40);
    const body = s2.els.find(e => e.ph === 'body')!;
    expect(body.text).toBe('First point\n\tSub point\nSecond point');
    expect(body.bullets).toBe('disc');
    expect(s2.notes).toBe('Remember the demo');
    const arrow = s3.els.find(e => e.preset === 'rightArrow')!;
    expect(arrow).toMatchObject({ fill: '#2e6fd8', text: 'Go' });
    expect(arrow.adj!.adj1).toBe(40000);
    expect(s3.els.some(e => e.type === 'ellipse')).toBe(true);
    const pic = s3.els.find(e => e.type === 'image')!;
    expect(deck.images.get(pic.src!)!.mime).toBe('image/png');
    const tbl = s3.els.find(e => e.type === 'table')!;
    expect(tbl.cells).toEqual([['r0c0', 'r0c1', 'r0c2'], ['r1c0', 'r1c1', 'r1c2']]);
    const ch = s3.els.find(e => e.type === 'chart')!.chart!;
    expect(ch.kind).toBe('lineMarkers'); expect(ch.cats).toEqual(['A', 'B', 'C']);
    expect(ch.series.map(s => s.name)).toEqual(['Sales', 'Cost']); expect(ch.series[0].vals).toEqual([1, 3, 2]);
    const line = s3.els.find(e => e.type === 'conn')!;
    expect(line).toMatchObject({ ax: 96, bx: 480 });
    const star = s3.els.find(e => e.preset === 'star5')!;
    expect(star.g).toBeTruthy(); expect(star.x).toBe(960);
    expect(s1.fill).toBe('#ffffff');
  });
  it('round-trips a JAM deck through PowerPoint format', async () => {
    const { readPptx } = await import('../src/pptx-read');
    const els = sampleDeck();
    const bytes = await writePptx(els, id => els[id], { image: () => ({ bytes: PNG, ext: 'png' }), today: 'Today' });
    const deck = await readPptx(bytes);
    const s = deck.slides[0];
    expect(s.notes).toBe('Say hello\nThen the plan');
    expect(s.els.find(e => e.text === 'Quarterly plan & goals')).toBeTruthy();
    expect(s.els.find(e => e.text && e.text.includes('\tThemes'))!.bullets).toBe('disc');
    expect(s.els.find(e => e.preset === 'rightArrow')!.adj).toEqual({ adj2: 70000 });
    expect(s.els.find(e => e.type === 'chart')!.chart!.kind).toBe('stackedColumn');
    expect(s.els.find(e => e.type === 'image')!.crop).toEqual([0.1, 0, 0.1, 0]);
  });
  it('keeps formatting on part of a line both ways', async () => {
    const { readPptx } = await import('../src/pptx-read');
    const els = sampleDeck(), f = Object.values(els).find(e => e.type === 'frame')!;
    const str = 'Plain bold red\n\tBig under strike serif';
    els.rt = { id: 'rt', type: 'text', z: 500, x: f.x + 40, y: f.y + 300, w: 600, h: 80, text: str, size: 20,
      runs: [{ s: 6, e: 10, w: 700 }, { s: 11, e: 14, c: '#e5484d' }, { s: 16, e: 19, z: 40 }, { s: 20, e: 25, u: true }, { s: 26, e: 32, x: true, i: true }, { s: 33, e: 38, f: 'serif' }] };
    const bytes = await writePptx(els, id => els[id], { image: () => ({ bytes: PNG, ext: 'png' }), today: 'Today' });
    const files = await unzip(bytes), xml = text(files.get('ppt/slides/slide1.xml')!);
    expect(xml).toContain('<a:t>bold</a:t>');
    expect(xml).toMatch(/b="1"[^>]*>(?:(?!<\/a:r>).)*<a:t>bold<\/a:t>/);
    expect(xml).toMatch(/u="sng"/); expect(xml).toMatch(/strike="sngStrike"/);
    const back = (await readPptx(bytes)).slides[0].els.find(e => e.text === str)!;
    expect(back.size).toBe(20);
    const at = (word: string) => back.runs!.find(r => str.slice(r.s, r.e) === word);
    expect(at('bold')).toMatchObject({ w: 700 });
    expect(at('red')).toMatchObject({ c: '#e5484d' });
    expect(at('Big')).toMatchObject({ z: 40 });
    expect(at('under')).toMatchObject({ u: true });
    expect(at('strike')).toMatchObject({ x: true, i: true });
    expect(at('serif')).toMatchObject({ f: 'serif' });
    expect(back.runs!.some(r => str.slice(r.s, r.e).includes('Plain'))).toBe(false);
    // A big first word stays a run instead of setting the piece's size.
    els.rt.text = 'Huge then normal words here'; els.rt.runs = [{ s: 0, e: 4, z: 48 }];
    const big = (await readPptx(await writePptx(els, id => els[id], { image: () => ({ bytes: PNG, ext: 'png' }), today: 'Today' }))).slides[0].els.find(e => e.text === els.rt.text)!;
    expect(big.size).toBe(20); expect(big.runs).toEqual([{ s: 0, e: 4, z: 48 }]);
    // Shapes and table cells write their styled words too, and shapes read them back.
    els.sh = { id: 'sh', type: 'rect', preset: 'rect', z: 501, x: f.x + 700, y: f.y + 300, w: 200, h: 100, fill: '#ffffff', text: 'Go now', runs: [{ s: 3, e: 6, w: 700 }] };
    els.tb = { id: 'tb', type: 'table', z: 502, x: f.x + 40, y: f.y + 420, w: 400, h: 80, cells: [['Owner name', 'B'], ['1', '2']], cruns: [[[{ s: 6, e: 10, c: '#2f6fed' }], null], [null, null]] };
    const b3 = await writePptx(els, id => els[id], { image: () => ({ bytes: PNG, ext: 'png' }), today: 'Today' });
    const x3 = text((await unzip(b3)).get('ppt/slides/slide1.xml')!);
    expect(x3).toMatch(/2F6FED[^]*?<a:t>name<\/a:t>/i);
    const shape = (await readPptx(b3)).slides[0].els.find(e => e.text === 'Go now')!;
    expect(shape.runs).toEqual([{ s: 3, e: 6, w: 700 }]);
  });
});
