/**
 * Page **Analyse** : visualisation du fonctionnement du bot via des graphiques
 * interactifs (survol, légende filtrante) et exportables (CSV / SVG).
 *
 * Chaque sous-section charge sa propre route d'API : on ne télécharge que ce
 * que l'on affiche.
 */
import { el, replace, api, card, kv, toolbar, select, notice, errorText, fmtNumber, fmtDuration } from '../lib/ui.js';
import { timeChart, barChart } from '../lib/charts.js';

const state = { section: 'activity', days: 30 };
let containerRef = null;

const SECTIONS = [
  { id: 'activity', label: 'Activité', icon: '⚡' },
  { id: 'moderation', label: 'Modération', icon: '🛡️' },
  { id: 'protections', label: 'Protections', icon: '🚫' },
  { id: 'tickets', label: 'Tickets', icon: '🎫' },
  { id: 'bumps', label: 'Bump', icon: '📣' },
  { id: 'levels', label: 'Niveaux', icon: '⭐' },
  { id: 'performance', label: 'Performance', icon: '📈' },
];

/** Sections dont les données dépendent de la fenêtre temporelle. */
const TIME_BASED = new Set(['activity', 'moderation', 'protections', 'bumps']);

// --- Rendu par section ------------------------------------------------------

const RENDERERS = {
  activity: (d) => [
    timeChart('Commandes par jour', d.perDay, { type: 'bar' }),
    timeChart('Commandes par heure', d.perHour, { type: 'bar' }),
    barChart('Serveurs les plus actifs', d.topGuilds),
    barChart('Utilisateurs les plus actifs', d.topUsers),
    barChart('Commandes les plus utilisées', d.topCommands),
    barChart('Commandes les plus lentes (ms)', d.slowest),
    barChart('Répartition slash / préfixe', d.bySource),
    barChart('Résultats', d.outcome),
  ],
  moderation: (d) => [
    kv([['Total des sanctions enregistrées', fmtNumber(d.total)]]),
    timeChart('Warns par jour', d.warnsPerDay, { type: 'bar' }),
    timeChart('Sanctions par jour et par type', d.perDayByAction),
    barChart('Sanctions par type', d.byAction),
    barChart('Sanctions par serveur', d.byGuild),
    barChart('Origine des sanctions', d.automatic),
  ],
  protections: (d) => [
    barChart('Détections par protection', d.totals),
    timeChart('Détections automatiques par jour', d.perDay, { type: 'bar' }),
    barChart('Détections par serveur', d.byGuild),
    barChart('Captcha', d.captcha),
  ],
  tickets: (d) => [
    kv([
      ['Tickets ouverts', fmtNumber(d.counts.open)],
      ['Tickets fermés', fmtNumber(d.counts.closed)],
      ['Temps moyen avant fermeture', d.averageHandlingMs ? fmtDuration(d.averageHandlingMs) : '—'],
    ]),
    barChart('Catégories les plus utilisées', d.byCategory),
    barChart('État des tickets', d.state),
  ],
  bumps: (d) => [
    kv([['Total des bumps', fmtNumber(d.total)]]),
    timeChart('Bumps par jour', d.perDay, { type: 'bar' }),
    barChart('Serveurs les plus actifs', d.byGuild),
    barChart('Utilisateurs les plus actifs', d.byUser),
  ],
  levels: (d) => [
    kv([
      ['Membres suivis', fmtNumber(d.members)],
      ['XP moyenne', fmtNumber(d.averageXp)],
      ['Messages comptabilisés', fmtNumber(d.totalMessages)],
      ['Minutes vocales', fmtNumber(d.totalVoiceMinutes)],
    ]),
    timeChart('Répartition des niveaux', d.byLevel, { type: 'bar' }),
    barChart('Activité textuelle / vocale', d.activity),
  ],
  performance: (d) =>
    d.samples === 0
      ? [notice('Aucun échantillon pour le moment : les mesures sont collectées en continu pendant que le bot tourne.')]
      : [
          timeChart('Mémoire', d.memory),
          timeChart('CPU (%)', d.cpu),
          timeChart('Latence Discord (ms)', d.ping),
          timeChart('Serveurs et utilisateurs', d.reach),
        ],
};

function sectionTabs() {
  return el(
    'div',
    { className: 'subtabs' },
    SECTIONS.map((section) => {
      const tab = el('button', { className: `subtab${state.section === section.id ? ' active' : ''}`, type: 'button' }, `${section.icon} ${section.label}`);
      tab.addEventListener('click', () => { state.section = section.id; refresh(); });
      return tab;
    }),
  );
}

function rangeBar() {
  if (!TIME_BASED.has(state.section)) return null;
  return toolbar(
    el('span', { className: 'muted' }, 'Fenêtre :'),
    select(
      [7, 14, 30, 60, 90].map((d) => ({ value: String(d), label: `${d} jours` })),
      { value: String(state.days), onChange: (value) => { state.days = Number(value); refresh(); } },
    ),
  );
}

async function refresh() {
  if (!containerRef) return;
  replace(containerRef, card(null, sectionTabs()), notice('Chargement…'));
  try {
    const suffix = TIME_BASED.has(state.section) ? `?days=${state.days}` : '';
    const data = await api(`/api/analytics/${state.section}${suffix}`);
    const charts = RENDERERS[state.section](data);
    replace(containerRef, card(null, sectionTabs(), rangeBar()), ...charts.map((chart) => card(null, chart)));
  } catch (error) {
    replace(containerRef, card(null, sectionTabs()), notice(errorText(error)));
  }
}

export default {
  id: 'analytics',
  label: 'Analyse',
  icon: '📈',
  order: 40,

  async render(container) {
    containerRef = container;
    await refresh();
  },

  /** La page Performance se met à jour au rythme des échantillons SSE. */
  onNotify({ event, isCurrent }) {
    if (event === 'dashboard' && isCurrent && state.section === 'performance') refresh();
  },
};
