/**
 * Page **Archives** : serveurs que le bot a quittés, dont les données restent
 * consultables.
 *
 * Même présentation que la page « Serveurs » (liste + sections), afin qu'un
 * serveur archivé se consulte exactement comme un serveur actif — seule
 * l'origine des données change.
 */
import { el, replace, api, card, kv, table, toolbar, input, button, select, pager, notice, errorText, fmtDate, fmtNumber } from '../lib/ui.js';

const state = { guildId: null, section: 'overview', query: '', sort: 'recent', page: 1, logFilters: {} };
let containerRef = null;
let archives = [];

const SECTIONS = [
  { id: 'overview', label: 'Séjour', icon: '🧭' },
  { id: 'moderation', label: 'Modération', icon: '🛡️' },
  { id: 'tickets', label: 'Tickets', icon: '🎫' },
  { id: 'levels', label: 'Niveaux', icon: '⭐' },
  { id: 'protections', label: 'Protections', icon: '🚫' },
  { id: 'conversations', label: 'Messagerie', icon: '✉️' },
  { id: 'logs', label: 'Journal', icon: '📄' },
];

const onOff = (enabled) => (enabled ? '🟢 activé' : '🔴 désactivé');

/** Cache du détail courant : évite de recharger à chaque changement d'onglet. */
let detailCache = null;

// --- Rendu des sections -----------------------------------------------------

const RENDERERS = {
  overview: (d) => [
    kv([
      ['Identifiant', d.id],
      ['Nom conservé', d.name ?? '— (inconnu)'],
      ['Première arrivée', fmtDate(d.stay.firstJoinedAt)],
      ['Dernière arrivée', fmtDate(d.stay.lastJoinedAt)],
      ['Départ', fmtDate(d.stay.lastLeftAt)],
      ['Arrivées / départs', `${fmtNumber(d.stay.joinCount)} / ${fmtNumber(d.stay.leaveCount)}`],
      ['Séjours courts', fmtNumber(d.stay.shortStayCount)],
      ['Commandes exécutées', fmtNumber(d.stay.commandCount)],
      ['Sanctions', fmtNumber(d.stay.sanctionCount)],
      ['Dernière activité', fmtDate(d.stay.lastActivityAt)],
      ['Réputation', d.reputation ? `${d.reputation.score}/100 — ${d.reputation.level?.label ?? ''}` : '—'],
      ['Liste noire', d.banned ? `⛔ oui — ${d.banned.reason ?? 'sans motif'}` : 'non'],
    ]),
    el('h3', {}, 'Données conservées'),
    kv([
      ['Warns', fmtNumber(d.retained.warns)],
      ['Tickets', fmtNumber(d.retained.tickets)],
      ['Membres suivis (niveaux)', fmtNumber(d.retained.members)],
      ['Entrées de journal', fmtNumber(d.retained.logEntries)],
      ['Conversations', fmtNumber(d.retained.conversations)],
    ]),
  ],

  moderation: (d) =>
    d.moderation
      ? [
          kv([['Warns (total)', fmtNumber(d.moderation.totalWarns)], ['Membres avertis', fmtNumber(d.moderation.warnedUsers)]]),
          el('h3', {}, 'Derniers warns'),
          table(['Utilisateur', 'Raison', 'Sanction', 'Date'], (d.moderation.recent ?? []).map((w) => [w.userId, w.reason || '—', w.sanction || '—', fmtDate(w.createdAt)])),
        ]
      : [notice('Aucune donnée de modération conservée.')],

  tickets: (d) =>
    d.tickets
      ? [
          kv([['Ouverts à la sortie', fmtNumber(d.tickets.open.length)], ['Fermés', fmtNumber(d.tickets.closed)], ['Catégories', fmtNumber(d.tickets.categories.length)]]),
          table(['Catégorie', 'Compteur'], d.tickets.categories.map((c) => [`${c.emoji || '🎫'} ${c.name}`, fmtNumber(c.counter)])),
        ]
      : [notice('Aucun ticket conservé.')],

  levels: (d) =>
    d.levels
      ? [
          kv([['État à la sortie', onOff(d.levels.config?.enabled)], ['Membres classés', fmtNumber(d.levels.leaderboard.length)], ['Récompenses', fmtNumber(d.levels.rewards.length)]]),
          table(['#', 'Membre', 'Niveau', 'XP', 'Messages'], d.levels.leaderboard.map((e) => [e.rank, e.userId, e.level, fmtNumber(e.xp), fmtNumber(e.messages)])),
        ]
      : [notice('Aucune donnée de niveaux conservée.')],

  protections: (d) => [
    el('h3', {}, 'Anti-publicité'),
    d.antipub ? kv([['État', onOff(d.antipub.enabled)], ['Détections', fmtNumber(d.antipub.stats?.detections ?? 0)], ['Supprimés', fmtNumber(d.antipub.stats?.deleted ?? 0)]]) : notice('—'),
    el('h3', {}, 'Anti-contenus sensibles'),
    d.antisensitive
      ? kv([
          ['État', onOff(d.antisensitive.enabled)],
          ['Détections', fmtNumber(d.antisensitive.stats?.detections ?? 0)],
          ['Timeouts appliqués', fmtNumber(d.antisensitive.stats?.timeouts ?? 0)],
        ])
      : notice('—'),
    el('h3', {}, 'Captcha'),
    d.captcha ? kv([['État', onOff(d.captcha.enabled)], ['Réussis', fmtNumber(d.captcha.stats?.passed ?? 0)], ['Échoués', fmtNumber(d.captcha.stats?.failed ?? 0)]]) : notice('—'),
    el('h3', {}, 'Salons vocaux temporaires'),
    d.tempVoice ? kv([['Générateurs', fmtNumber(d.tempVoice.generators.length)], ['Créés', fmtNumber(d.tempVoice.stats?.created ?? 0)]]) : notice('—'),
  ],

  conversations: (d) =>
    d.conversations.length
      ? [table(['Conversation', 'Propriétaire', 'Statut', 'Messages', 'Dernière activité'], d.conversations.map((c) => [c.id, c.ownerName, c.status, fmtNumber(c.messageCount), fmtDate(c.lastActivityAt)]))]
      : [notice('Aucune conversation avec le propriétaire de ce serveur.')],
};

// --- Journal conservé -------------------------------------------------------

async function renderLogs(pane) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state.logFilters)) if (value) params.set(key, value);
  const data = await api(`/api/archives/${state.guildId}/logs?${params.toString()}`);
  const categories = data.categories ?? {};

  const setFilter = (key, value) => { state.logFilters[key] = value || undefined; renderSection(); };
  const search = input({ placeholder: 'Recherche…', value: state.logFilters.q ?? '' });
  search.addEventListener('change', (e) => setFilter('q', e.target.value.trim()));
  const user = input({ placeholder: 'Identifiant utilisateur', value: state.logFilters.userId ?? '' });
  user.addEventListener('change', (e) => setFilter('userId', e.target.value.trim()));

  replace(
    pane,
    card(
      null,
      toolbar(
        select([{ value: '', label: 'Toutes catégories' }, ...Object.entries(categories).map(([value, label]) => ({ value, label }))], {
          value: state.logFilters.category ?? '',
          onChange: (value) => setFilter('category', value),
        }),
        user,
        search,
        button('Réinitialiser', () => { state.logFilters = {}; renderSection(); }, 'btn btn-ghost'),
      ),
      kv(Object.entries(data.stats ?? {}).map(([key, value]) => [categories[key] ?? key, fmtNumber(value)])),
    ),
    card(
      null,
      table(
        ['Date', 'Catégorie', 'Événement', 'Membre', 'Responsable'],
        (data.entries ?? []).map((e) => [fmtDate(e.at), categories[e.category] ?? e.category, `${e.title}${e.summary ? ` — ${e.summary}` : ''}`, e.userTag ?? e.userId ?? '—', e.moderatorTag ?? '—']),
        { empty: 'Aucune entrée conservée pour ces filtres.' },
      ),
    ),
  );
}

// --- Assemblage -------------------------------------------------------------

function sectionTabs() {
  return el(
    'div',
    { className: 'subtabs' },
    SECTIONS.map((section) => {
      const tab = el('button', { className: `subtab${state.section === section.id ? ' active' : ''}`, type: 'button' }, `${section.icon} ${section.label}`);
      tab.addEventListener('click', () => { state.section = section.id; renderSection(); });
      return tab;
    }),
  );
}

async function renderSection() {
  const pane = document.querySelector('#archive-pane');
  if (!pane) return;
  const tabs = document.querySelector('#archive-tabs');
  if (!state.guildId) {
    if (tabs) replace(tabs);
    return replace(pane, notice('Sélectionnez un serveur archivé.'));
  }
  if (tabs) replace(tabs, sectionTabs());
  replace(pane, notice('Chargement…'));

  try {
    if (state.section === 'logs') return await renderLogs(pane);
    if (!detailCache || detailCache.id !== state.guildId) detailCache = await api(`/api/archives/${state.guildId}`);
    return replace(pane, card(null, [].concat(RENDERERS[state.section](detailCache))));
  } catch (error) {
    return replace(pane, notice(errorText(error)));
  }
}

function archiveItem(archive) {
  const total = Object.values(archive.retained).reduce((sum, n) => sum + n, 0);
  const item = el('div', { className: `guild-item${state.guildId === archive.id ? ' active' : ''}` }, [
    el('span', { className: 'avatar' }, (archive.name || '?').slice(0, 1).toUpperCase()),
    el('span', {}, [
      el('div', {}, archive.name ?? archive.id),
      el('div', { className: 'muted small' }, `${archive.lastLeftAt ? `parti le ${fmtDate(archive.lastLeftAt)}` : 'date inconnue'} · ${fmtNumber(total)} donnée(s)`),
      archive.banned ? el('div', { className: 'muted small' }, '⛔ liste noire') : null,
    ]),
  ]);
  item.addEventListener('click', () => {
    state.guildId = archive.id;
    state.logFilters = {};
    detailCache = null;
    document.querySelectorAll('.guild-item').forEach((node) => node.classList.remove('active'));
    item.classList.add('active');
    renderSection();
  });
  return item;
}

async function refresh() {
  if (!containerRef) return;
  try {
    const params = new URLSearchParams({ page: String(state.page), sort: state.sort });
    if (state.query) params.set('q', state.query);
    const data = await api(`/api/archives?${params.toString()}`);
    archives = data.archives;

    if (!data.ready) {
      return replace(containerRef, notice('Le bot n’est pas encore connecté à Discord : la liste des serveurs archivés sera disponible dès qu’il sera prêt.'));
    }

    const search = input({ placeholder: 'Rechercher un serveur archivé…', value: state.query });
    search.addEventListener('change', (e) => { state.query = e.target.value.trim(); state.page = 1; refresh(); });

    const list = el('aside', { className: 'guild-list' }, [
      ...(archives.length ? archives.map(archiveItem) : [notice('Aucun serveur archivé : le bot est présent sur tous les serveurs qu’il connaît.')]),
      pager(data, (page) => { state.page = page; refresh(); }),
    ]);

    replace(
      containerRef,
      card(
        null,
        toolbar(
          search,
          select(
            [{ value: 'recent', label: 'Départ le plus récent' }, { value: 'name', label: 'Nom' }, { value: 'data', label: 'Volume de données' }],
            { value: state.sort, onChange: (value) => { state.sort = value; refresh(); } },
          ),
        ),
        el('p', { className: 'muted small' }, `${fmtNumber(data.total)} serveur(s) archivé(s). Les données d’un serveur quitté sont conservées et restent consultables ici.`),
      ),
      el('div', { className: 'split' }, [
        list,
        el('div', { className: 'guild-detail' }, [el('div', { id: 'archive-tabs' }), el('div', { id: 'archive-pane' })]),
      ]),
    );

    // Restaure la sélection si elle est toujours archivée.
    if (state.guildId && !archives.some((a) => a.id === state.guildId)) state.guildId = null;
    await renderSection();
  } catch (error) {
    replace(containerRef, notice(errorText(error)));
  }
}

export default {
  id: 'archives',
  label: 'Archives',
  icon: '🗄️',
  order: 25,

  async render(container) {
    containerRef = container;
    await refresh();
  },

  /** Un serveur quitté apparaît immédiatement dans les archives. */
  onNotify({ event, payload, isCurrent }) {
    if (event === 'notify' && payload.type === 'guildLeave' && isCurrent) refresh();
  },
};
