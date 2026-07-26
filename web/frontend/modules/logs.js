/**
 * Page **Logs du bot** : journal interne du bot, entièrement distinct des logs
 * de modération des serveurs (page « Serveurs »).
 *
 * Trois flux — commandes, erreurs, système — avec recherche, filtres et
 * pagination. Les erreurs exposent leur pile complète, copiable en un clic.
 */
import { el, replace, api, card, table, toolbar, input, button, select, pager, notice, errorText, fmtDate, fmtNumber, copyToClipboard, toast } from '../lib/ui.js';

const PAGE_SIZE = 25;

/** Onglets du journal interne. */
const STREAMS = [
  { id: 'commands', label: 'Commandes', icon: '⌨️' },
  { id: 'errors', label: 'Erreurs', icon: '🐞' },
  { id: 'system', label: 'Système', icon: '⚙️' },
];

const state = { stream: 'commands', page: 1, filters: {}, summary: null };
let containerRef = null;

/** Construit la chaîne de requête à partir des filtres actifs. */
function queryString() {
  const params = new URLSearchParams({ page: String(state.page), pageSize: String(PAGE_SIZE) });
  for (const [key, value] of Object.entries(state.filters)) if (value) params.set(key, value);
  return params.toString();
}

function setFilter(key, value) {
  state.filters[key] = value || undefined;
  state.page = 1;
  refresh();
}

// --- Rendu des lignes, par flux --------------------------------------------

function commandRows(entries) {
  return entries.map((entry) => [
    fmtDate(entry.at),
    entry.user?.name ?? entry.user?.id ?? '—',
    entry.guild?.name ?? '— (MP)',
    entry.channel?.name ? `#${entry.channel.name}` : '—',
    el('span', { className: `tag tag-${entry.type}` }, entry.type === 'slash' ? '/ slash' : '! préfixe'),
    el('code', {}, entry.command),
    `${fmtNumber(entry.durationMs)} ms`,
    entry.ok
      ? el('span', { className: 'ok' }, '✅ succès')
      : el('span', { className: 'ko', title: entry.error ?? '' }, '❌ erreur'),
  ]);
}

/** Ligne d'erreur : détail dépliable avec la pile complète et un bouton de copie. */
function errorRow(entry) {
  const stack = el('pre', { className: 'stack hidden' }, entry.stack ?? '(pile indisponible)');
  const copy = button('📋 Copier la pile', async () => {
    toast((await copyToClipboard(entry.stack ?? '')) ? 'Pile copiée dans le presse-papiers.' : 'Copie impossible.', 'info');
  }, 'btn btn-ghost btn-xs');
  const toggle = button('Détails', () => stack.classList.toggle('hidden'), 'btn btn-ghost btn-xs');
  return {
    cells: [
      fmtDate(entry.at),
      el('span', { className: 'tag tag-error' }, entry.type),
      entry.module ?? '—',
      el('code', {}, entry.file ?? '—'),
      el('span', { title: entry.message ?? '' }, (entry.message ?? '—').slice(0, 70)),
      entry.user?.name ?? '—',
      entry.guild?.name ?? '—',
      entry.command ? el('code', {}, entry.command) : '—',
      el('span', { className: 'row-actions' }, [toggle, copy]),
    ],
    detail: stack,
  };
}

function systemRows(entries) {
  return entries.map((entry) => [
    fmtDate(entry.at),
    el('span', { className: 'tag' }, entry.event),
    entry.message ?? '—',
    Object.keys(entry.meta ?? {}).length ? el('code', {}, JSON.stringify(entry.meta)) : '—',
  ]);
}

// --- Filtres par flux -------------------------------------------------------

function filterBar() {
  const search = input({ placeholder: 'Recherche…', value: state.filters.q ?? '' });
  search.addEventListener('change', (e) => setFilter('q', e.target.value.trim()));

  const since = input({ type: 'date', title: 'Depuis', value: state.filters.since ?? '' });
  since.addEventListener('change', (e) => setFilter('since', e.target.value));
  const until = input({ type: 'date', title: "Jusqu'à", value: state.filters.until ? state.filters.until.slice(0, 10) : '' });
  until.addEventListener('change', (e) => setFilter('until', e.target.value ? `${e.target.value}T23:59:59` : ''));

  const controls = [search, since, until];

  if (state.stream === 'commands') {
    const commands = state.summary?.filters?.commands ?? [];
    controls.push(
      select([{ value: '', label: 'Toutes les commandes' }, ...commands.map((c) => ({ value: c, label: c }))], {
        value: state.filters.command ?? '',
        onChange: (value) => setFilter('command', value),
      }),
      select([{ value: '', label: 'Tous les résultats' }, { value: 'ok', label: 'Succès' }, { value: 'error', label: 'Erreurs' }], {
        value: state.filters.status ?? '',
        onChange: (value) => setFilter('status', value),
      }),
    );
  }
  if (state.stream === 'errors') {
    const types = state.summary?.filters?.errorTypes ?? [];
    controls.push(
      select([{ value: '', label: "Tous les types d'erreur" }, ...types.map((t) => ({ value: t, label: t }))], {
        value: state.filters.type ?? '',
        onChange: (value) => setFilter('type', value),
      }),
    );
  }
  if (state.stream === 'system') {
    const events = state.summary?.filters?.systemEvents ?? [];
    controls.push(
      select([{ value: '', label: 'Tous les événements' }, ...events.map((e) => ({ value: e, label: e }))], {
        value: state.filters.event ?? '',
        onChange: (value) => setFilter('event', value),
      }),
    );
  }

  controls.push(button('Réinitialiser', () => { state.filters = {}; state.page = 1; refresh(); }, 'btn btn-ghost'));
  return toolbar(...controls);
}

function streamTabs() {
  return el(
    'div',
    { className: 'subtabs' },
    STREAMS.map((stream) => {
      const count = stream.id === 'commands' ? state.summary?.commands?.total : state.summary?.[stream.id];
      const tab = el('button', { className: `subtab${state.stream === stream.id ? ' active' : ''}`, type: 'button' }, `${stream.icon} ${stream.label}${count !== undefined ? ` (${fmtNumber(count)})` : ''}`);
      tab.addEventListener('click', () => {
        state.stream = stream.id;
        state.page = 1;
        state.filters = {};
        refresh();
      });
      return tab;
    }),
  );
}

// --- Chargement -------------------------------------------------------------

async function refresh() {
  if (!containerRef) return;
  try {
    state.summary = await api('/api/logs/summary');
    const data = await api(`/api/logs/${state.stream}?${queryString()}`);

    let body;
    if (state.stream === 'errors') {
      const rows = data.entries.map(errorRow);
      const node = el('table', { className: 'table' });
      node.append(el('tr', {}, ['Date', 'Type', 'Module', 'Fichier', 'Message', 'Utilisateur', 'Serveur', 'Commande', ''].map((h) => el('th', {}, h))));
      for (const row of rows) {
        node.append(el('tr', {}, row.cells.map((cell) => (cell?.nodeType ? el('td', {}, [cell]) : el('td', {}, cell)))));
        node.append(el('tr', {}, [el('td', { colSpan: 9 }, [row.detail])]));
      }
      body = data.entries.length ? node : notice('Aucune erreur pour ces filtres. 🎉');
    } else if (state.stream === 'commands') {
      body = table(['Date', 'Utilisateur', 'Serveur', 'Salon', 'Type', 'Commande', 'Durée', 'Résultat'], commandRows(data.entries), { empty: 'Aucune commande pour ces filtres.' });
    } else {
      body = table(['Date', 'Événement', 'Message', 'Détails'], systemRows(data.entries), { empty: 'Aucun événement système.' });
    }

    replace(
      containerRef,
      card(null, streamTabs(), filterBar()),
      card(null, body, pager(data, (page) => { state.page = page; refresh(); })),
      el('p', { className: 'muted small' }, `Journal interne borné en mémoire (${fmtNumber(state.summary.limits?.[state.stream] ?? 0)} entrées max pour ce flux) : il reflète l'exécution depuis le dernier démarrage du bot.`),
    );
  } catch (error) {
    replace(containerRef, notice(errorText(error)));
  }
}

export default {
  id: 'logs',
  label: 'Logs du bot',
  icon: '📜',
  order: 30,

  async render(container) {
    containerRef = container;
    await refresh();
  },

  /** Nouvelle entrée en direct : rafraîchit si l'on est sur la première page. */
  onNotify({ event, payload, isCurrent }) {
    if (event !== 'notify' || !isCurrent) return;
    if (!['command', 'error', 'system'].includes(payload.type)) return;
    if (state.page === 1) refresh();
  },
};
