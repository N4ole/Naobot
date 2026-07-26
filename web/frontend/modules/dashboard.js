/**
 * Page **Tableau de bord** : véritable page d'accueil rassemblant tous les
 * compteurs du bot et son état système, actualisés **en direct** (SSE) sans
 * rechargement de la page.
 */
import { el, replace, api, statTile, card, kv, fmtNumber, fmtDuration, fmtBytes, fmtTime, notice, errorText } from '../lib/ui.js';
import { gauge } from '../lib/charts.js';

/** Définition des tuiles : où lire la valeur dans la charge utile `/api/dashboard`. */
const TILES = [
  { icon: '🖥️', label: 'Serveurs', path: ['discord', 'servers'] },
  { icon: '👥', label: 'Utilisateurs', path: ['discord', 'users'] },
  { icon: '💬', label: 'Salons', path: ['discord', 'channels'] },
  { icon: '🎫', label: 'Tickets ouverts', path: ['tickets', 'open'] },
  { icon: '📁', label: 'Tickets fermés', path: ['tickets', 'closed'] },
  { icon: '⚠️', label: 'Warns', path: ['moderation', 'warns'] },
  { icon: '🛡️', label: 'Sanctions', path: ['moderation', 'sanctions'] },
  { icon: '⏳', label: 'Timeouts', path: ['moderation', 'timeouts'] },
  { icon: '🔨', label: 'Bans', path: ['moderation', 'bans'] },
  { icon: '📣', label: 'Bumps', path: ['engagement', 'bumps'] },
  { icon: '🔊', label: 'Vocaux temporaires', path: ['engagement', 'tempVoiceActive'] },
  { icon: '🧩', label: 'Captchas réalisés', path: ['engagement', 'captchas'] },
  { icon: '🚫', label: 'AntiSpam', path: ['protections', 'antispam'] },
  { icon: '🔗', label: 'AntiLink', path: ['protections', 'antilink'] },
  { icon: '📢', label: 'AntiPub', path: ['protections', 'antipub'] },
  { icon: '🔞', label: 'AntiSensitive', path: ['protections', 'antisensitive'] },
];

const read = (data, path) => path.reduce((node, key) => node?.[key], data);

let containerRef = null;

function render(container, data) {
  const system = data.system ?? {};
  const memory = system.memory ?? {};

  const grid = el('div', { className: 'stat-grid' }, TILES.map((tile) => statTile({ icon: tile.icon, label: tile.label, value: read(data, tile.path) ?? 0 })));

  const health = el('div', { className: 'health-row' }, [
    gauge('CPU', system.cpu?.percent ?? 0, { hint: `${system.cpu?.cores ?? 1} cœur(s)` }),
    gauge('Mémoire (heap)', memory.heapTotalBytes ? (memory.heapUsedBytes / memory.heapTotalBytes) * 100 : 0, { hint: fmtBytes(memory.heapUsedBytes) }),
    el('div', { className: 'health-facts' }, [
      kv([
        ['État', el('span', {}, [el('span', { className: `dot ${system.ready ? 'on' : 'off'}` }), system.ready ? 'En ligne' : 'Hors ligne'])],
        ['Ping Discord', `${system.ping ?? 0} ms`],
        ['Uptime', fmtDuration(system.uptimeMs)],
        ['Mémoire (RSS)', fmtBytes(memory.rssBytes)],
        ['Version du bot', system.version ?? '—'],
        ['Node.js', system.node ?? '—'],
        ['Commandes', fmtNumber(data.discord?.commands ?? 0)],
        ['Actualisé', fmtTime(data.updatedAt)],
      ]),
    ]),
  ]);

  const logs = data.botLogs ?? {};
  const activity = card(
    'Activité interne (journal du bot)',
    kv([
      ['Commandes journalisées', fmtNumber(logs.commands?.total ?? 0)],
      ['dont en erreur', fmtNumber(logs.commands?.errors ?? 0)],
      ['Erreurs internes', fmtNumber(logs.errors ?? 0)],
      ['Événements système', fmtNumber(logs.system ?? 0)],
    ]),
    el('p', { className: 'muted small' }, 'Détail complet dans la section « Logs du bot ».'),
  );

  replace(container, card(null, grid), card('Santé du bot', health), activity);
}

export default {
  id: 'dashboard',
  label: 'Tableau de bord',
  icon: '📊',
  order: 10,

  async render(container) {
    containerRef = container;
    try {
      render(container, await api('/api/dashboard'));
    } catch (error) {
      replace(container, notice(errorText(error)));
    }
  },

  /** Actualisation automatique : le flux SSE pousse le tableau de bord complet. */
  onNotify({ event, payload, isCurrent }) {
    if (event === 'dashboard' && isCurrent && containerRef) render(containerRef, payload);
  },
};
