/**
 * **Analyse** du fonctionnement du bot : séries temporelles et répartitions
 * destinées aux graphiques de l'interface web.
 *
 * Comme `webStats`, ce module ne fait que **lire** les données déjà produites
 * par les services métier (historique de modération, tickets, bumps, niveaux,
 * protections, journal interne des commandes). Aucune règle métier n'y est
 * réimplémentée.
 *
 * Toutes les séries partagent le même format, directement consommable par le
 * moteur de graphiques du frontend :
 *   { labels: string[], series: [{ name, values: number[] }] }
 * Les répartitions utilisent :
 *   { items: [{ label, value }] }
 */
const moderationHistoryRepository = require('../../database/moderationHistoryRepository');
const ticketRepository = require('../../database/ticketRepository');
const ticketCategoryRepository = require('../../database/ticketCategoryRepository');
const bumpRepository = require('../../database/bumpRepository');
const levelRepository = require('../../database/levelRepository');
const guildStatsRepository = require('../../database/guildStatsRepository');
const botLogService = require('./botLogService');
const webStats = require('./webStats');

const DAY_MS = 24 * 60 * 60 * 1000;

function safe(fn, fallback) {
  try {
    const value = fn();
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

/** Clé de jour (YYYY-MM-DD) en temps local. */
function dayKey(date) {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Liste des `days` derniers jours (du plus ancien au plus récent). */
function lastDays(days) {
  const out = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i -= 1) out.push(dayKey(now - i * DAY_MS));
  return out;
}

/**
 * Construit une série temporelle journalière à partir d'événements datés.
 * @param {Array} events
 * @param {(e: any) => string|number|Date} getDate
 * @param {number} days
 * @param {(e: any) => string} [getGroup] regroupement optionnel (une série par groupe)
 */
function dailySeries(events, getDate, days, getGroup) {
  const labels = lastDays(days);
  const index = new Map(labels.map((label, i) => [label, i]));
  const groups = new Map();

  for (const event of events) {
    const key = dayKey(getDate(event));
    if (key === null || !index.has(key)) continue;
    const group = getGroup ? getGroup(event) ?? 'autre' : 'total';
    if (!groups.has(group)) groups.set(group, new Array(labels.length).fill(0));
    groups.get(group)[index.get(key)] += 1;
  }

  if (groups.size === 0) groups.set(getGroup ? 'aucun' : 'total', new Array(labels.length).fill(0));
  return { labels, series: [...groups].map(([name, values]) => ({ name, values })) };
}

/** Répartition triée décroissante, limitée aux `limit` premiers. */
function distribution(counts, limit = 10) {
  return {
    items: Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit),
  };
}

// ---------------------------------------------------------------------------
// Activité
// ---------------------------------------------------------------------------

/**
 * Activité des commandes, à partir du **journal interne** (volatile mais
 * précis : durée, type, résultat). Commandes par jour, par heure, serveurs et
 * utilisateurs les plus actifs.
 */
function activity({ days = 14 } = {}) {
  return safe(
    () => {
      const commands = botLogService.all('commands');

      const perHour = new Array(24).fill(0);
      const perGuild = {};
      const perUser = {};
      const perCommand = {};
      for (const entry of commands) {
        const date = new Date(entry.at);
        if (!Number.isNaN(date.getTime())) perHour[date.getHours()] += 1;
        if (entry.guild?.name) perGuild[entry.guild.name] = (perGuild[entry.guild.name] ?? 0) + 1;
        if (entry.user?.name) perUser[entry.user.name] = (perUser[entry.user.name] ?? 0) + 1;
        perCommand[entry.command] = (perCommand[entry.command] ?? 0) + 1;
      }

      return {
        perDay: dailySeries(commands, (e) => e.at, days),
        perHour: { labels: perHour.map((_, h) => `${String(h).padStart(2, '0')}h`), series: [{ name: 'commandes', values: perHour }] },
        topGuilds: distribution(perGuild),
        topUsers: distribution(perUser),
        topCommands: distribution(perCommand),
        // Répartition slash / préfixe et taux de réussite.
        bySource: distribution(commands.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] ?? 0) + 1 }), {})),
        outcome: {
          items: [
            { label: 'succès', value: commands.filter((e) => e.ok).length },
            { label: 'erreur', value: commands.filter((e) => !e.ok).length },
          ],
        },
        // Durée moyenne d'exécution (ms), utile pour repérer les commandes lentes.
        slowest: {
          items: Object.entries(
            commands.reduce((acc, e) => {
              const stat = acc[e.command] ?? { total: 0, count: 0 };
              return { ...acc, [e.command]: { total: stat.total + e.durationMs, count: stat.count + 1 } };
            }, {}),
          )
            .map(([label, { total, count }]) => ({ label, value: Math.round(total / count) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10),
        },
      };
    },
    { perDay: { labels: [], series: [] }, perHour: { labels: [], series: [] }, topGuilds: { items: [] }, topUsers: { items: [] }, topCommands: { items: [] }, bySource: { items: [] }, outcome: { items: [] }, slowest: { items: [] } },
  );
}

// ---------------------------------------------------------------------------
// Modération
// ---------------------------------------------------------------------------

/** Warns par jour, sanctions par type, timeouts / bans / kicks dans le temps. */
function moderation({ days = 30 } = {}) {
  return safe(
    () => {
      const events = moderationHistoryRepository.allEvents();
      const byAction = moderationHistoryRepository.countByAction();
      const perGuild = {};
      for (const event of events) {
        if (event.guildId) perGuild[event.guildId] = (perGuild[event.guildId] ?? 0) + 1;
      }
      return {
        warnsPerDay: dailySeries(events.filter((e) => e.action === 'warn'), (e) => e.date, days),
        perDayByAction: dailySeries(events, (e) => e.date, days, (e) => e.action),
        byAction: distribution(byAction, 15),
        byGuild: distribution(perGuild),
        // Part des sanctions appliquées automatiquement (protections) vs manuelles.
        automatic: {
          items: [
            { label: 'automatique', value: events.filter((e) => e.automatic).length },
            { label: 'manuelle', value: events.filter((e) => !e.automatic).length },
          ],
        },
        total: events.length,
      };
    },
    { warnsPerDay: { labels: [], series: [] }, perDayByAction: { labels: [], series: [] }, byAction: { items: [] }, byGuild: { items: [] }, automatic: { items: [] }, total: 0 },
  );
}

// ---------------------------------------------------------------------------
// Protections
// ---------------------------------------------------------------------------

/**
 * Détections des protections : totaux par module, évolution dans le temps
 * (dérivée de l'historique de modération, qui trace les actions automatiques)
 * et répartition par serveur.
 */
function protections({ days = 30 } = {}) {
  return safe(
    () => {
      const totals = webStats.protectionCounts();
      const captcha = webStats.captchaCounts();
      const events = moderationHistoryRepository.allEvents();
      const automatic = new Set(['antispam', 'antilink', 'antibot', 'captcha']);
      const auto = events.filter((e) => automatic.has(e.action));
      const perGuild = {};
      for (const event of auto) {
        if (event.guildId) perGuild[event.guildId] = (perGuild[event.guildId] ?? 0) + 1;
      }
      return {
        totals: {
          items: [
            { label: 'AntiSpam', value: totals.antispam },
            { label: 'AntiLink', value: totals.antilink },
            { label: 'AntiPub', value: totals.antipub },
            { label: 'AntiSensitive', value: totals.antisensitive },
            { label: 'Captcha', value: captcha.passed + captcha.failed },
          ],
        },
        perDay: dailySeries(auto, (e) => e.date, days, (e) => e.action),
        byGuild: distribution(perGuild),
        captcha: { items: [
          { label: 'réussis', value: captcha.passed },
          { label: 'échoués', value: captcha.failed },
          { label: 'expulsés', value: captcha.kicked },
        ] },
      };
    },
    { totals: { items: [] }, perDay: { labels: [], series: [] }, byGuild: { items: [] }, captcha: { items: [] } },
  );
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

/** Tickets ouverts, temps moyen avant fermeture, catégories les plus utilisées. */
function tickets() {
  return safe(
    () => {
      const counts = webStats.ticketCounts();
      const perCategory = {};
      let totalHandlingMs = 0;
      let closedWithTime = 0;

      for (const [guildId, data] of Object.entries(ticketRepository.allGuildData())) {
        for (const [categoryId, stat] of Object.entries(data?.stats ?? {})) {
          const category = safe(() => ticketCategoryRepository.getCategory(guildId, categoryId), null);
          const label = category?.name ?? categoryId;
          perCategory[label] = (perCategory[label] ?? 0) + (stat?.total ?? 0);
          totalHandlingMs += stat?.totalHandlingMs ?? 0;
          closedWithTime += stat?.closed ?? 0;
        }
      }

      return {
        counts,
        byCategory: distribution(perCategory),
        averageHandlingMs: closedWithTime > 0 ? Math.round(totalHandlingMs / closedWithTime) : 0,
        state: { items: [{ label: 'ouverts', value: counts.open }, { label: 'fermés', value: counts.closed }] },
      };
    },
    { counts: { open: 0, closed: 0, total: 0 }, byCategory: { items: [] }, averageHandlingMs: 0, state: { items: [] } },
  );
}

// ---------------------------------------------------------------------------
// Bump
// ---------------------------------------------------------------------------

/** Bumps : total, serveurs et utilisateurs les plus actifs, évolution. */
function bumps({ days = 30 } = {}) {
  return safe(
    () => {
      const guilds = bumpRepository.getAllGuildBumps();
      const perGuild = {};
      const history = [];
      for (const [guildId, data] of Object.entries(guilds)) {
        perGuild[data?.name ?? guildId] = data?.bumpCount ?? 0;
        for (const entry of data?.history ?? []) history.push(entry);
      }
      const users = safe(() => bumpRepository.getAllUserBumps(), {});
      const perUser = Object.fromEntries(Object.entries(users).map(([userId, u]) => [userId, u?.count ?? 0]));

      return {
        total: Object.values(perGuild).reduce((sum, n) => sum + n, 0),
        byGuild: distribution(perGuild),
        byUser: distribution(perUser),
        perDay: dailySeries(history, (e) => e.at ?? e.date, days),
      };
    },
    { total: 0, byGuild: { items: [] }, byUser: { items: [] }, perDay: { labels: [], series: [] } },
  );
}

// ---------------------------------------------------------------------------
// Niveaux
// ---------------------------------------------------------------------------

/** Répartition des niveaux, XP moyenne, activité textuelle et vocale. */
function levels() {
  return safe(
    () => {
      const perLevel = {};
      let totalXp = 0;
      let totalMessages = 0;
      let totalVoiceMs = 0;
      let members = 0;

      for (const data of Object.values(levelRepository.allGuildData())) {
        for (const user of Object.values(data?.users ?? {})) {
          members += 1;
          totalXp += user?.xp ?? 0;
          totalMessages += user?.messages ?? 0;
          totalVoiceMs += user?.voiceMs ?? 0;
          const level = user?.level ?? 0;
          perLevel[level] = (perLevel[level] ?? 0) + 1;
        }
      }

      return {
        members,
        averageXp: members > 0 ? Math.round(totalXp / members) : 0,
        totalMessages,
        totalVoiceMinutes: Math.round(totalVoiceMs / 60000),
        // Répartition par niveau, ordonnée par niveau croissant (histogramme).
        byLevel: {
          labels: Object.keys(perLevel).map(Number).sort((a, b) => a - b).map(String),
          series: [{ name: 'membres', values: Object.keys(perLevel).map(Number).sort((a, b) => a - b).map((l) => perLevel[l]) }],
        },
        activity: {
          items: [
            { label: 'messages', value: totalMessages },
            { label: 'minutes vocales', value: Math.round(totalVoiceMs / 60000) },
          ],
        },
      };
    },
    { members: 0, averageXp: 0, totalMessages: 0, totalVoiceMinutes: 0, byLevel: { labels: [], series: [] }, activity: { items: [] } },
  );
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

/**
 * Historique glissant des métriques de performance (RAM, CPU, latence,
 * serveurs, utilisateurs). Échantillonné par `sample()` depuis la boucle temps
 * réel : conservé en mémoire, borné.
 */
const PERF_SAMPLES = 120;
const perfHistory = [];

/** Ajoute un point de mesure à l'historique de performance. */
function samplePerformance(client) {
  const metrics = webStats.systemMetrics(client);
  perfHistory.push({
    at: new Date().toISOString(),
    rssMb: Math.round(metrics.memory.rssBytes / 1048576),
    heapMb: Math.round(metrics.memory.heapUsedBytes / 1048576),
    cpu: metrics.cpu.percent,
    ping: metrics.ping,
    servers: client?.guilds?.cache?.size ?? 0,
    users: safe(() => client?.guilds?.cache?.reduce((sum, g) => sum + (g.memberCount ?? 0), 0), 0),
  });
  if (perfHistory.length > PERF_SAMPLES) perfHistory.shift();
  return perfHistory[perfHistory.length - 1];
}

/** Séries de performance prêtes pour les graphiques. */
function performance() {
  const labels = perfHistory.map((p) => new Date(p.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const serie = (key, name) => ({ name, values: perfHistory.map((p) => p[key]) });
  return {
    memory: { labels, series: [serie('rssMb', 'RSS (Mo)'), serie('heapMb', 'Heap (Mo)')] },
    cpu: { labels, series: [serie('cpu', 'CPU (%)')] },
    ping: { labels, series: [serie('ping', 'Latence (ms)')] },
    reach: { labels, series: [serie('servers', 'Serveurs'), serie('users', 'Utilisateurs')] },
    samples: perfHistory.length,
  };
}

/** Serveurs les plus actifs d'après les compteurs persistants de commandes. */
function topGuildsByCommands(limit = 10) {
  return safe(() => {
    const counts = {};
    for (const [guildId, stats] of Object.entries(guildStatsRepository.getAllStats())) {
      counts[stats?.name ?? guildId] = stats?.commandCount ?? 0;
    }
    return distribution(counts, limit);
  }, { items: [] });
}

/** Vue complète (une requête = toute la page Analyse). */
function overview(options = {}) {
  return {
    activity: { ...activity(options), topGuildsAllTime: topGuildsByCommands() },
    moderation: moderation(options),
    protections: protections(options),
    tickets: tickets(),
    bumps: bumps(options),
    levels: levels(),
    performance: performance(),
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  overview,
  activity,
  moderation,
  protections,
  tickets,
  bumps,
  levels,
  performance,
  samplePerformance,
  topGuildsByCommands,
  dailySeries,
  distribution,
  lastDays,
};
