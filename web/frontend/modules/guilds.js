/**
 * Page **Serveurs** : vue par serveur (configuration, modération, tickets,
 * vocaux, niveaux, protections) et journal de modération du serveur.
 *
 * À ne pas confondre avec la page « Logs du bot » : ici il s'agit des logs
 * **des serveurs** (modération), pas du journal interne du bot.
 */
import { el, replace, api, card, kv, table, toolbar, input, button, select, notice, errorText, fmtDate, fmtNumber } from '../lib/ui.js';

const state = { guildId: null, section: 'overview', logFilters: {} };
let containerRef = null;
let guilds = [];

const SECTIONS = [
  { id: 'overview', label: "Vue d'ensemble", icon: '🧭' },
  { id: 'moderation', label: 'Modération', icon: '🛡️' },
  { id: 'tickets', label: 'Tickets', icon: '🎫' },
  { id: 'tempvoice', label: 'Vocaux', icon: '🔊' },
  { id: 'levels', label: 'Niveaux', icon: '⭐' },
  { id: 'antipub', label: 'Anti-pub', icon: '📢' },
  { id: 'antisensitive', label: 'Anti-sensible', icon: '🔞' },
  { id: 'captcha', label: 'Captcha', icon: '🧩' },
  { id: 'logs', label: 'Logs du serveur', icon: '📄' },
];

const onOff = (enabled) => (enabled ? '🟢 activé' : '🔴 désactivé');

// --- Rendus par section -----------------------------------------------------

const RENDERERS = {
  overview: (o) =>
    kv([
      ['Membres', fmtNumber(o.members)], ['Salons', fmtNumber(o.channels)], ['Rôles', fmtNumber(o.roles)],
      ['Préfixe', `${o.prefix?.prefix ?? '!'}${o.prefix?.isCustom ? '' : ' (défaut)'}`],
      ['Tickets ouverts', fmtNumber(o.tickets?.open ?? 0)], ['Tickets fermés', fmtNumber(o.tickets?.closed ?? 0)],
      ['Rôles réactions', fmtNumber(o.reactionRoles)], ['Formulaires', fmtNumber(o.forms)], ['Sauvegardes', fmtNumber(o.backups)],
      ['Vocaux (générateurs)', fmtNumber(o.tempVoice?.generators ?? 0)], ['Vocaux actifs', fmtNumber(o.tempVoice?.active ?? 0)],
      ['Captcha', o.captcha?.enabled ? `activé (${o.captcha.type})` : 'désactivé'],
      ['Anti-pub', onOff(o.antipub?.enabled)],
      ['Anti-sensible', o.antisensitive?.enabled ? `activé (${fmtNumber(o.antisensitive.stats?.detections ?? 0)} détection(s))` : 'désactivé'],
      ['Niveaux', o.levels?.enabled ? `activé (${fmtNumber(o.levels.ranked)} membre(s))` : 'désactivé'],
      ['Logs actifs', `${Object.values(o.logs || {}).filter((l) => l && l.enabled).length}/7`],
      ['Réputation', o.reputation?.level ?? o.reputation?.score ?? '—'],
    ]),

  moderation: (m) => [
    kv([['Warns (total)', fmtNumber(m.totalWarns)], ['Membres avertis', fmtNumber(m.warnedUsers)]]),
    el('h3', {}, 'Derniers warns'),
    table(['Utilisateur', 'Raison', 'Sanction', 'Date'], (m.recent ?? []).map((w) => [w.userId, w.reason || '—', w.sanction || '—', fmtDate(w.createdAt)])),
  ],

  tickets: (t) => [
    kv([['Ouverts', fmtNumber(t.open.length)], ['Fermés', fmtNumber(t.closed)], ['Catégories', fmtNumber(t.categories.length)]]),
    el('h3', {}, 'Catégories'),
    table(['Catégorie', 'Compteur'], t.categories.map((c) => [`${c.emoji || '🎫'} ${c.name}`, fmtNumber(c.counter)])),
  ],

  tempvoice: (v) => [
    kv([['Générateurs', fmtNumber(v.generators.length)], ['Salons actifs', fmtNumber(v.active.length)], ['Créés', fmtNumber(v.stats?.created ?? 0)], ['Supprimés', fmtNumber(v.stats?.deleted ?? 0)]]),
    el('h3', {}, 'Salons actifs'),
    table(['Salon', 'Propriétaire', 'Créé'], v.active.map((a) => [a.name, a.ownerId, fmtDate(a.createdAt)])),
  ],

  levels: (l) => [
    kv([
      ['État', onOff(l.config?.enabled)], ['XP / message', l.config?.xpPerMessage ?? '—'], ['XP / min vocale', l.config?.xpPerVoiceMinute ?? '—'],
      ['Membres classés', fmtNumber(l.leaderboard.length)], ['Récompenses', fmtNumber(l.rewards.length)],
    ]),
    el('h3', {}, 'Classement'),
    table(['#', 'Membre', 'Niveau', 'XP', 'Messages', 'Vocal (min)'], l.leaderboard.map((e) => [e.rank, e.userId, e.level, fmtNumber(e.xp), fmtNumber(e.messages), fmtNumber(Math.round((e.voiceMs || 0) / 60000))])),
  ],

  antipub: (a) => [
    kv([['État', onOff(a.enabled)], ['Salons exemptés', fmtNumber(a.exemptChannels.length)], ['Détections', fmtNumber(a.stats?.detections ?? 0)], ['Supprimés', fmtNumber(a.stats?.deleted ?? 0)], ['Dernière modification', fmtDate(a.lastModifiedAt)]]),
    el('h3', {}, 'Dernières détections'),
    table(['Utilisateur', 'Salon', 'Invitation', 'Supprimé', 'Date'], (a.recentDetections ?? []).map((d) => [d.userId, `#${d.channelId}`, d.match, d.deleted ? '✅' : '❌', fmtDate(d.at)])),
  ],

  antisensitive: (a) => [
    kv([
      ['État', onOff(a.enabled)],
      ['Timeout automatique', a.autoTimeout?.enabled ? `activé (${Math.round((a.autoTimeout.durationMs ?? 0) / 60000)} min)` : 'désactivé'],
      ['Détections', fmtNumber(a.stats?.detections ?? 0)], ['Supprimés', fmtNumber(a.stats?.deleted ?? 0)],
      ['Timeouts appliqués', fmtNumber(a.stats?.timeouts ?? 0)], ['Échecs de timeout', fmtNumber(a.stats?.timeoutErrors ?? 0)],
    ]),
    el('h3', {}, 'Dernières détections'),
    table(['Utilisateur', 'Catégorie', 'Méthode', 'Détecté', 'Timeout', 'Date'], (a.recentDetections ?? []).map((d) => [d.userId, d.category, d.method, d.match, d.timedOut ? '✅' : '—', fmtDate(d.at)])),
  ],

  captcha: (c) => kv([
    ['État', onOff(c.enabled)], ['Type', c.type ?? '—'],
    ['Réussis', fmtNumber(c.stats?.passed ?? 0)], ['Échoués', fmtNumber(c.stats?.failed ?? 0)], ['Expulsés', fmtNumber(c.stats?.kicked ?? 0)],
  ]),
};

// --- Journal de modération du serveur (filtres) -----------------------------

async function renderGuildLogs(pane) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state.logFilters)) if (value) params.set(key, value);

  const data = await api(`/api/guilds/${state.guildId}/logs?${params.toString()}`);
  const categories = data.categories ?? {};

  const setFilter = (key, value) => { state.logFilters[key] = value || undefined; renderSection(); };
  const search = input({ placeholder: 'Recherche…', value: state.logFilters.q ?? '' });
  search.addEventListener('change', (e) => setFilter('q', e.target.value.trim()));
  const user = input({ placeholder: 'Identifiant utilisateur', value: state.logFilters.userId ?? '' });
  user.addEventListener('change', (e) => setFilter('userId', e.target.value.trim()));
  const since = input({ type: 'date', title: 'Depuis', value: state.logFilters.since ?? '' });
  since.addEventListener('change', (e) => setFilter('since', e.target.value));
  const until = input({ type: 'date', title: "Jusqu'à" });
  until.addEventListener('change', (e) => setFilter('until', e.target.value ? `${e.target.value}T23:59:59` : ''));

  replace(
    pane,
    card(
      null,
      toolbar(
        select([{ value: '', label: 'Toutes catégories' }, ...Object.entries(categories).map(([value, label]) => ({ value, label }))], {
          value: state.logFilters.category ?? '',
          onChange: (value) => setFilter('category', value),
        }),
        user, since, until, search,
        button('Réinitialiser', () => { state.logFilters = {}; renderSection(); }, 'btn btn-ghost'),
      ),
      kv(Object.entries(data.stats ?? {}).map(([key, value]) => [categories[key] ?? key, fmtNumber(value)])),
    ),
    card(
      null,
      table(
        ['Date', 'Catégorie', 'Événement', 'Membre', 'Responsable'],
        (data.entries ?? []).map((e) => [fmtDate(e.at), categories[e.category] ?? e.category, `${e.title}${e.summary ? ` — ${e.summary}` : ''}`, e.userTag ?? e.userId ?? '—', e.moderatorTag ?? '—']),
        { empty: 'Aucune entrée pour ces filtres.' },
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
  const pane = document.querySelector('#guild-pane');
  if (!pane) return;
  if (!state.guildId) return replace(pane, notice('Sélectionnez un serveur.'));

  // Les onglets restent visibles pendant le chargement.
  const tabs = document.querySelector('#guild-tabs');
  if (tabs) replace(tabs, sectionTabs());
  replace(pane, notice('Chargement…'));

  try {
    if (state.section === 'logs') return await renderGuildLogs(pane);
    const data = await api(`/api/guilds/${state.guildId}/${state.section}`);
    const rendered = RENDERERS[state.section](data);
    return replace(pane, card(null, [].concat(rendered)));
  } catch (error) {
    return replace(pane, notice(errorText(error)));
  }
}

function guildList() {
  const list = el('aside', { className: 'guild-list' });
  if (!guilds.length) {
    list.append(notice('Aucun serveur.'));
    return list;
  }
  for (const guild of guilds) {
    const item = el('div', { className: `guild-item${state.guildId === guild.id ? ' active' : ''}` }, [
      guild.icon ? el('img', { src: guild.icon, alt: '' }) : el('span', { className: 'avatar' }, (guild.name || '?').slice(0, 1).toUpperCase()),
      el('span', {}, guild.name),
    ]);
    item.addEventListener('click', () => {
      state.guildId = guild.id;
      state.logFilters = {};
      document.querySelectorAll('.guild-item').forEach((node) => node.classList.remove('active'));
      item.classList.add('active');
      renderSection();
    });
    list.append(item);
  }
  return list;
}

export default {
  id: 'guilds',
  label: 'Serveurs',
  icon: '🖥️',
  order: 20,

  async render(container, ctx) {
    containerRef = container;
    guilds = ctx.state.guilds ?? [];
    if (!state.guildId && guilds.length) state.guildId = guilds[0].id;

    replace(
      container,
      el('div', { className: 'split' }, [
        guildList(),
        el('div', { className: 'guild-detail' }, [el('div', { id: 'guild-tabs' }, [sectionTabs()]), el('div', { id: 'guild-pane' })]),
      ]),
    );
    await renderSection();
  },

  /** Nouveau ticket ou détection de protection : rafraîchit la section affichée. */
  onNotify({ event, payload, isCurrent }) {
    if (event !== 'notify' || !isCurrent) return;
    if (!['ticket', 'protection'].includes(payload.type)) return;
    if (payload.guild?.id === state.guildId) renderSection();
  },
};
