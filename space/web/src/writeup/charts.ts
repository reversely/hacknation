// Hand-written SVG charts for the evaluation write-up. Bars and numbers start at zero and animate
// to their values when the chart scrolls into view (`.in` on the chart, set by the page).

const NS = 'http://www.w3.org/2000/svg';

export function svg(tag: string, attrs: Record<string, string | number> = {}, ...children: (SVGElement | string)[]): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

export type Bar = { label: string; value: number; of?: number; tone: 'base' | 'mid' | 'good' };

// Horizontal bars, one per row, with the value at the bar's end.
export function barChart(rows: Bar[], max: number, unit = '', labelWidth = 178): SVGElement {
  const rowH = 44;
  const labelW = labelWidth;
  const width = 480 + (labelWidth - 178);
  const plotW = width - labelW - 76;
  const chart = svg('svg', { viewBox: `0 0 ${width} ${rows.length * rowH + 8}`, class: 'chart bars-h', role: 'img' });
  rows.forEach((r, i) => {
    const y = i * rowH + 8;
    const w = Math.max(2, (r.value / max) * plotW);
    chart.append(
      svg('text', { x: 0, y: y + 22, class: 'row-label' }, r.label),
      svg('rect', { x: labelW, y: y + 6, width: plotW, height: 24, rx: 5, class: 'track' }),
      svg('rect', { x: labelW, y: y + 6, width: w, height: 24, rx: 5, class: `fill ${r.tone}`, style: `--w:${w}px; --delay:${i * 120}ms` }),
      svg('text', { x: labelW + w + 10, y: y + 23, class: 'row-value', 'data-count': r.value, style: `--delay:${i * 120}ms` }, `${r.value}${unit}${r.of ? ` of ${r.of}` : ''}`),
    );
  });
  return chart;
}

// Stacked columns: development and held-out hallucinations per configuration.
export function stackedColumns(groups: { label: string; parts: { value: number; key: string }[] }[], max: number): SVGElement {
  const width = 640;
  const height = 300;
  const base = height - 48;
  const colW = 92;
  const gap = (width - groups.length * colW) / (groups.length + 1);
  const scale = (base - 64) / max;
  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart columns', role: 'img' });
  chart.append(svg('line', { x1: 0, x2: width, y1: base, y2: base, class: 'axis' }));
  groups.forEach((g, i) => {
    const x = gap + i * (colW + gap);
    let top = base;
    g.parts.forEach((p, j) => {
      const h = p.value * scale;
      top -= h;
      chart.append(svg('rect', { x, y: top, width: colW, height: Math.max(h, 0.01), class: `col ${p.key}`, style: `--delay:${i * 160 + j * 80}ms` }));
    });
    const total = g.parts.reduce((s, p) => s + p.value, 0);
    chart.append(
      svg('text', { x: x + colW / 2, y: top - 10, class: 'col-total', 'text-anchor': 'middle', 'data-count': total, style: `--delay:${i * 160}ms` }, String(total)),
      svg('text', { x: x + colW / 2, y: base + 26, class: 'col-label', 'text-anchor': 'middle' }, g.label),
    );
  });
  return chart;
}

// A small line chart of the strict pipeline across runs: two series.
export function runLines(runs: { run: string; a: number; b: number }[], labels: [string, string]): SVGElement {
  const width = 640;
  const height = 240;
  const left = 40;
  const right = width - 30;
  const base = height - 50;
  const max = Math.max(...runs.flatMap((r) => [r.a, r.b]), 1);
  const x = (i: number) => left + (i * (right - left)) / (runs.length - 1);
  const y = (v: number) => base - (v / max) * (base - 40);
  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart lines', role: 'img' });
  chart.append(svg('line', { x1: left, x2: right, y1: base, y2: base, class: 'axis' }));
  (['a', 'b'] as const).forEach((key, k) => {
    const d = runs.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${y(r[key])}`).join(' ');
    chart.append(svg('path', { d, class: `line s${k}`, pathLength: 1 }));
    runs.forEach((r, i) => chart.append(svg('circle', { cx: x(i), cy: y(r[key]), r: 5, class: `dot s${k}`, style: `--delay:${300 + i * 200}ms` }), svg('text', { x: x(i) + (k ? 10 : -10), y: y(r[key]) - 10, class: `dot-label s${k}`, 'text-anchor': k ? 'start' : 'end' }, String(r[key]))));
  });
  runs.forEach((r, i) => chart.append(svg('text', { x: x(i), y: base + 26, class: 'col-label', 'text-anchor': 'middle' }, r.run)));

  return chart;
}

// Counts each [data-count] text up from zero once its chart is visible.
export function countUp(root: Element): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const el of root.querySelectorAll<SVGTextElement | HTMLElement>('[data-count]')) {
    const raw = el.getAttribute('data-count') ?? '0';
    const target = Number(raw);
    const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
    const suffix = (el.textContent ?? '').replace(/^[\d.]+/, '');
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      el.textContent = `${(target * (1 - Math.pow(1 - t, 3))).toFixed(decimals)}${suffix}`;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
