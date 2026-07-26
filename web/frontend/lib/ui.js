/**
 * Briques d'interface partagées par toutes les pages (aucune dépendance
 * externe). Chaque module de page importe ce fichier plutôt que de
 * réimplémenter ses propres helpers.
 */

/** Sélecteur court. */
export const $ = (selector, root = document) => root.querySelector(selector);

/** Crée un élément : `el('div', { className: 'x' }, ['texte', autreNoeud])`. */
export function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child?.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Vide un nœud puis y ajoute les enfants fournis. */
export function replace(node, ...children) {
  node.innerHTML = '';
  for (const child of children.flat()) if (child) node.append(child);
  return node;
}

/**
 * Appel JSON de l'API. Rejette avec `{ status, error }` : les pages peuvent
 * distinguer 403 (non-owner) d'une erreur réseau.
 */
export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(data?.error ?? 'error'), { status: response.status, error: data?.error });
  return data;
}

// --- Formatage -------------------------------------------------------------

export const fmtNumber = (n) => new Intl.NumberFormat('fr-FR').format(n ?? 0);

export function fmtDuration(ms) {
  const s = Math.floor((ms ?? 0) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && `${d}j`, h && `${h}h`, m && `${m}min`].filter(Boolean).join(' ') || '< 1min';
}

export const fmtBytes = (bytes) => {
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let value = bytes ?? 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

export const fmtDate = (value) => (value ? new Date(value).toLocaleString('fr-FR') : '—');
export const fmtTime = (value) => (value ? new Date(value).toLocaleTimeString('fr-FR') : '—');

// --- Composants ------------------------------------------------------------

/** Carte titrée. */
export function card(title, ...content) {
  return el('div', { className: 'card' }, [title ? el('h2', {}, title) : null, ...content.flat()]);
}

/** Grille clé / valeur. */
export function kv(items) {
  return el(
    'div',
    { className: 'kv' },
    items.filter(Boolean).map(([k, v]) => el('div', { className: 'item' }, [el('div', { className: 'k' }, k), el('div', { className: 'v' }, v)])),
  );
}

/** Tuile de statistique (grand chiffre). */
export function statTile({ icon, label, value, hint }) {
  return el('div', { className: 'stat' }, [
    el('span', { className: 'ico' }, icon),
    el('span', { className: 'val' }, typeof value === 'number' ? fmtNumber(value) : value),
    el('span', { className: 'lbl' }, label),
    hint ? el('span', { className: 'hint' }, hint) : null,
  ]);
}

/** Tableau simple : en-têtes + lignes (chaque ligne = tableau de cellules). */
export function table(headers, rows, { empty = 'Aucune donnée.' } = {}) {
  if (!rows.length) return el('p', { className: 'muted' }, empty);
  const node = el('table', { className: 'table' });
  node.append(el('tr', {}, headers.map((h) => el('th', {}, h))));
  for (const row of rows) node.append(el('tr', {}, row.map((cell) => (cell?.nodeType ? el('td', {}, [cell]) : el('td', {}, cell)))));
  return node;
}

/** Barre d'outils (filtres, boutons). */
export const toolbar = (...children) => el('div', { className: 'toolbar' }, children.flat());

export const input = (props) => el('input', { className: 'input', ...props });
export const button = (label, onClick, className = 'btn') => {
  const node = el('button', { className }, label);
  if (onClick) node.addEventListener('click', onClick);
  return node;
};

/** Menu déroulant : options = [{ value, label }]. */
export function select(options, { value, onChange, className = 'select' } = {}) {
  const node = el('select', { className });
  for (const option of options) node.append(el('option', { value: option.value }, option.label));
  if (value !== undefined) node.value = value;
  if (onChange) node.addEventListener('change', (event) => onChange(event.target.value));
  return node;
}

/** Pagination : rend les contrôles si plus d'une page. */
export function pager({ page, pages, total }, onPage) {
  if (pages <= 1) return el('p', { className: 'muted small' }, `${fmtNumber(total)} entrée(s)`);
  const row = el('div', { className: 'pager' });
  row.append(
    button('◀', () => onPage(page - 1), 'btn btn-ghost'),
    el('span', { className: 'muted' }, `Page ${page} / ${pages} — ${fmtNumber(total)} entrée(s)`),
    button('▶', () => onPage(page + 1), 'btn btn-ghost'),
  );
  row.firstChild.disabled = page <= 1;
  row.lastChild.disabled = page >= pages;
  return row;
}

/** Message d'état (chargement, vide, erreur). */
export const notice = (text, kind = 'muted') => el('p', { className: kind }, text);

/** Traduit une erreur d'API en message lisible. */
export const errorText = (error) =>
  error?.status === 403
    ? 'Accès refusé : cette interface est réservée aux owners du bot.'
    : `Erreur de chargement (${error?.error ?? error?.status ?? error?.message ?? 'inconnue'}).`;

/** Copie un texte dans le presse-papiers, avec repli si l'API est indisponible. */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = el('textarea', { value: text, style: 'position:fixed;opacity:0' });
    document.body.append(area);
    area.select();
    const ok = document.execCommand?.('copy') ?? false;
    area.remove();
    return ok;
  }
}

/** Déclenche le téléchargement d'un contenu généré côté navigateur. */
export function download(filename, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Notification éphémère (coin de l'écran). */
export function toast(message, kind = 'info') {
  let host = $('#toasts');
  if (!host) {
    host = el('div', { id: 'toasts', className: 'toasts' });
    document.body.append(host);
  }
  const node = el('div', { className: `toast toast-${kind}` }, message);
  host.append(node);
  setTimeout(() => node.remove(), 5000);
}
