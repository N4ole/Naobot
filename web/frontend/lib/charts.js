/**
 * Moteur de graphiques **SVG maison**, sans aucune dépendance externe
 * (cohérent avec le reste du projet : le serveur web n'a lui-même aucune
 * dépendance).
 *
 * Trois types : `line`, `bar` (séries temporelles) et `hbar` (répartitions).
 * Chaque graphique est :
 *   - **interactif** : survol → infobulle avec la valeur exacte, légende
 *     cliquable pour masquer/afficher une série ;
 *   - **filtrable**  : la légende agit comme un filtre de séries ;
 *   - **exportable** : boutons CSV et SVG.
 *
 * Format d'entrée commun aux services :
 *   série temporelle : { labels: string[], series: [{ name, values: number[] }] }
 *   répartition      : { items: [{ label, value }] }
 */
import { el, download, fmtNumber } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';

/**
 * Palette des séries, **lue depuis les variables CSS** (`--chart-1..8`) plutôt
 * que redéclarée ici : la feuille de style est la source unique côté web, et
 * une couleur de marque modifiée se propage sans toucher à ce fichier.
 *
 * Les huit teintes sont ordonnées par écart de luminance croissant : deux
 * séries voisines restent distinguables en niveaux de gris, donc en vision
 * dichromatique.
 */
const FALLBACK_PALETTE = ['#2569E8', '#46D97F', '#F5C542', '#F0453C', '#68E8F8', '#F2994A', '#9B6DFF', '#FF8FA3'];

const PALETTE = (() => {
  try {
    const styles = getComputedStyle(document.documentElement);
    const read = FALLBACK_PALETTE.map((fallback, i) => styles.getPropertyValue(`--chart-${i + 1}`).trim() || fallback);
    return read.every(Boolean) ? read : FALLBACK_PALETTE;
  } catch {
    return FALLBACK_PALETTE;
  }
})();

const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};

/** Échelle « jolie » : arrondit le maximum à un palier lisible. */
function niceMax(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Convertit les données en CSV (export). */
function toCsv(data) {
  if (data.items) {
    return ['label;valeur', ...data.items.map((item) => `${item.label};${item.value}`)].join('\n');
  }
  const header = ['periode', ...data.series.map((s) => s.name)].join(';');
  const rows = data.labels.map((label, i) => [label, ...data.series.map((s) => s.values[i] ?? 0)].join(';'));
  return [header, ...rows].join('\n');
}

/** Barre d'export (CSV + SVG). */
function exportBar(title, data, getSvg) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'graphique';
  return el('div', { className: 'chart-actions' }, [
    el('button', { className: 'btn btn-ghost btn-xs', onclick: () => download(`${slug}.csv`, toCsv(data), 'text/csv;charset=utf-8') }, 'CSV'),
    el('button', { className: 'btn btn-ghost btn-xs', onclick: () => download(`${slug}.svg`, getSvg().outerHTML, 'image/svg+xml') }, 'SVG'),
  ]);
}

/** Infobulle partagée (une seule instance dans le document). */
function tooltip() {
  let node = document.querySelector('#chart-tooltip');
  if (!node) {
    node = el('div', { id: 'chart-tooltip', className: 'chart-tooltip' });
    document.body.append(node);
  }
  return node;
}

function bindTooltip(target, text) {
  target.addEventListener('mouseenter', (event) => {
    const tip = tooltip();
    tip.textContent = text;
    tip.style.opacity = '1';
    tip.style.left = `${event.clientX + 12}px`;
    tip.style.top = `${event.clientY + 12}px`;
  });
  target.addEventListener('mousemove', (event) => {
    const tip = tooltip();
    tip.style.left = `${event.clientX + 12}px`;
    tip.style.top = `${event.clientY + 12}px`;
  });
  target.addEventListener('mouseleave', () => { tooltip().style.opacity = '0'; });
}

/**
 * Graphique de série temporelle (`line` ou `bar`).
 * @param {{ labels: string[], series: {name: string, values: number[]}[] }} data
 */
export function timeChart(title, data, { type = 'line', height = 220 } = {}) {
  const wrap = el('div', { className: 'chart' });
  const hidden = new Set();
  const width = 720;
  const pad = { top: 16, right: 16, bottom: 34, left: 46 };

  const draw = () => {
    const visible = data.series.filter((s) => !hidden.has(s.name));
    const max = niceMax(Math.max(1, ...visible.flatMap((s) => s.values.map((v) => v || 0))));
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const x = (i) => pad.left + (data.labels.length <= 1 ? innerW / 2 : (i * innerW) / (data.labels.length - 1));
    const y = (v) => pad.top + innerH - ((v || 0) / max) * innerH;

    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', preserveAspectRatio: 'xMidYMid meet' });

    // Grille horizontale + graduations.
    for (let step = 0; step <= 4; step += 1) {
      const value = (max / 4) * step;
      const gy = pad.top + innerH - (step / 4) * innerH;
      svg.append(svgEl('line', { x1: pad.left, y1: gy, x2: width - pad.right, y2: gy, class: 'chart-grid' }));
      const label = svgEl('text', { x: pad.left - 8, y: gy + 4, class: 'chart-axis', 'text-anchor': 'end' });
      label.textContent = fmtNumber(Math.round(value));
      svg.append(label);
    }

    // Étiquettes de l'axe des abscisses (espacées pour rester lisibles).
    const stride = Math.max(1, Math.ceil(data.labels.length / 8));
    data.labels.forEach((label, i) => {
      if (i % stride !== 0 && i !== data.labels.length - 1) return;
      const text = svgEl('text', { x: x(i), y: height - 10, class: 'chart-axis', 'text-anchor': 'middle' });
      text.textContent = label.length > 10 ? label.slice(5) : label;
      svg.append(text);
    });

    visible.forEach((serie, index) => {
      const color = PALETTE[data.series.indexOf(serie) % PALETTE.length];
      if (type === 'bar') {
        const groupWidth = innerW / Math.max(1, data.labels.length);
        const barWidth = Math.max(2, (groupWidth * 0.7) / visible.length);
        serie.values.forEach((value, i) => {
          const bx = pad.left + i * groupWidth + groupWidth * 0.15 + index * barWidth;
          const by = y(value);
          const rect = svgEl('rect', { x: bx, y: by, width: barWidth, height: Math.max(0, pad.top + innerH - by), fill: color, rx: 2, class: 'chart-bar' });
          bindTooltip(rect, `${data.labels[i]} · ${serie.name} : ${fmtNumber(value)}`);
          svg.append(rect);
        });
        return;
      }
      const points = serie.values.map((value, i) => `${x(i)},${y(value)}`).join(' ');
      svg.append(svgEl('polyline', { points, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', class: 'chart-line' }));
      serie.values.forEach((value, i) => {
        const dot = svgEl('circle', { cx: x(i), cy: y(value), r: 3.5, fill: color, class: 'chart-dot' });
        bindTooltip(dot, `${data.labels[i]} · ${serie.name} : ${fmtNumber(value)}`);
        svg.append(dot);
      });
    });

    return svg;
  };

  let svgNode = draw();

  // Légende cliquable = filtre de séries.
  const legend = el('div', { className: 'chart-legend' });
  data.series.forEach((serie, index) => {
    const item = el('button', { className: 'legend-item', type: 'button', 'aria-pressed': 'true' }, [
      el('span', { className: 'legend-dot', style: `background:${PALETTE[index % PALETTE.length]}`, 'aria-hidden': 'true' }),
      serie.name,
    ]);
    item.addEventListener('click', () => {
      if (hidden.has(serie.name)) hidden.delete(serie.name);
      else hidden.add(serie.name);
      const visible = !hidden.has(serie.name);
      item.classList.toggle('off', !visible);
      // L'état ne repose plus sur la seule opacité : il est annoncé.
      item.setAttribute('aria-pressed', String(visible));
      const next = draw();
      svgNode.replaceWith(next);
      svgNode = next;
    });
    legend.append(item);
  });

  wrap.append(
    el('div', { className: 'chart-head' }, [el('h3', {}, title), exportBar(title, data, () => svgNode)]),
    svgNode,
    data.series.length > 1 ? legend : null,
  );
  return wrap;
}

/**
 * Répartition en barres horizontales (classements, catégories).
 * @param {{ items: {label: string, value: number}[] }} data
 */
export function barChart(title, data, { limit = 10 } = {}) {
  const items = (data.items ?? []).slice(0, limit);
  const wrap = el('div', { className: 'chart' });
  const head = el('div', { className: 'chart-head' }, [el('h3', {}, title), exportBar(title, { items }, () => svgNode)]);

  const max = Math.max(1, ...items.map((item) => item.value || 0));
  const rowH = 26;
  const width = 720;
  const labelW = 170;
  const height = Math.max(rowH, items.length * rowH) + 8;
  const svgNode = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', preserveAspectRatio: 'xMidYMid meet' });

  items.forEach((item, i) => {
    const y = i * rowH + 4;
    const barW = ((item.value || 0) / max) * (width - labelW - 70);
    const label = svgEl('text', { x: 0, y: y + 15, class: 'chart-axis' });
    label.textContent = item.label.length > 24 ? `${item.label.slice(0, 23)}…` : item.label;
    const rect = svgEl('rect', { x: labelW, y, width: Math.max(1, barW), height: rowH - 8, rx: 3, fill: PALETTE[i % PALETTE.length], class: 'chart-bar' });
    bindTooltip(rect, `${item.label} : ${fmtNumber(item.value)}`);
    const value = svgEl('text', { x: labelW + Math.max(1, barW) + 8, y: y + 15, class: 'chart-value' });
    value.textContent = fmtNumber(item.value);
    svgNode.append(label, rect, value);
  });

  wrap.append(head, items.length ? svgNode : el('p', { className: 'muted' }, 'Aucune donnée.'));
  return wrap;
}

/** Seuils d'état d'une jauge : le niveau n'est jamais porté par la seule couleur. */
const GAUGE_STATES = [
  { max: 60, key: 'normal', label: 'normal' },
  { max: 85, key: 'high', label: 'élevé' },
  { max: Infinity, key: 'critical', label: 'critique' },
];

/**
 * Indicateur circulaire (jauge) pour une valeur en pourcentage.
 * Un **mot d'état** (« normal / élevé / critique ») accompagne toujours l'arc :
 * en vision dichromatique, le vert et l'orange de l'arc ne se distinguent pas.
 */
export function gauge(title, percent, { hint } = {}) {
  const value = Math.max(0, Math.min(100, percent ?? 0));
  const state = GAUGE_STATES.find((s) => value <= s.max);
  const size = 120;
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, class: 'gauge-svg' });
  svg.append(svgEl('circle', { cx: size / 2, cy: size / 2, r: radius, class: 'gauge-track', fill: 'none', 'stroke-width': 10 }));
  svg.append(
    svgEl('circle', {
      cx: size / 2, cy: size / 2, r: radius, fill: 'none', 'stroke-width': 10, 'stroke-linecap': 'round',
      stroke: `var(--${state.key === 'critical' ? 'error' : state.key === 'high' ? 'warning' : 'success'})`,
      'stroke-dasharray': `${(value / 100) * circumference} ${circumference}`,
      transform: `rotate(-90 ${size / 2} ${size / 2})`,
    }),
  );
  const text = svgEl('text', { x: size / 2, y: size / 2 + 6, 'text-anchor': 'middle', class: 'gauge-text' });
  text.textContent = `${value.toFixed(1)} %`;
  svg.append(text);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${title} : ${value.toFixed(1)} %, ${state.label}`);
  return el('div', { className: 'gauge' }, [
    svg,
    el('span', { className: 'lbl' }, title),
    el('span', { className: `state ${state.key}` }, state.label),
    hint ? el('span', { className: 'hint' }, hint) : null,
  ]);
}

export { PALETTE };
