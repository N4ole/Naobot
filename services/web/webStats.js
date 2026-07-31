/**
 * Agrégation des **statistiques globales** du tableau de bord web.
 *
 * Ce module ne contient **aucune logique métier** : il ne fait que lire les
 * repositories et services déjà utilisés par les commandes Discord, puis
 * assembler les compteurs. C'est le sens de l'architecture partagée : les
 * commandes et le site consomment les **mêmes** services, aucune règle n'est
 * dupliquée ici.
 *
 * Performance (bot public, potentiellement des milliers de serveurs) : les
 * agrégats parcourent tous les serveurs, ils sont donc **mis en cache** avec
 * une courte durée de vie. Les métriques système (mémoire, CPU, uptime) sont
 * en revanche instantanées et recalculées à chaque appel.
 */
const os = require('node:os');
const process = require('node:process');

const ticketRepository = require('../../database/ticketRepository');
const warnRepository = require('../../database/warnRepository');
const bumpRepository = require('../../database/bumpRepository');
const protectionRepository = require('../../database/protectionRepository');
const antipubRepository = require('../../database/antipubRepository');
const antisensitiveRepository = require('../../database/antisensitiveRepository');
const captchaRepository = require('../../database/captchaRepository');
const tempVoiceRepository = require('../../database/tempVoiceRepository');
const moderationHistoryRepository = require('../../database/moderationHistoryRepository');
const resources = require('../../config/resources');
const botLogService = require('./botLogService');

/** Version du bot (package.json) — lue une seule fois. */
const VERSION = (() => {
  try {
    return require('../../package.json').version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

function safe(fn, fallback) {
  try {
    const value = fn();
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Cache court (agrégats coûteux)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 10_000;
const cache = new Map();

/** Mémorise le résultat d'un agrégat coûteux pendant `CACHE_TTL_MS`. */
function cached(key, compute) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = compute();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Vide le cache (tests, ou après une action qui invalide les agrégats). */
function invalidate() {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Compteurs métier (agrégés sur tous les serveurs)
// ---------------------------------------------------------------------------

/**
 * Tickets ouverts / fermés, tous serveurs confondus.
 * Les tickets **ouverts** sont les tickets vivants (`tickets`) ; les **fermés**
 * viennent des compteurs persistants par catégorie (`stats[].closed`), seule
 * source exhaustive — l'archive est bornée et perdrait les plus anciens.
 */
function ticketCounts() {
  return cached('tickets', () =>
    safe(
      () => {
        let open = 0;
        let closed = 0;
        for (const data of Object.values(ticketRepository.allGuildData())) {
          open += Object.keys(data?.tickets ?? {}).length;
          for (const stat of Object.values(data?.stats ?? {})) closed += stat?.closed ?? 0;
        }
        return { open, closed, total: open + closed };
      },
      { open: 0, closed: 0, total: 0 },
    ),
  );
}

/** Warns actifs, tous serveurs confondus. */
function warnCount() {
  return cached('warns', () =>
    safe(
      () =>
        Object.values(warnRepository.getAllGuildWarns()).reduce(
          (sum, guildWarns) => sum + Object.values(guildWarns ?? {}).reduce((s, list) => s + (list?.length ?? 0), 0),
          0,
        ),
      0,
    ),
  );
}

/**
 * Sanctions par type, dérivées de l'historique **global** de modération
 * (source unique déjà alimentée par les commandes de modération et les
 * protections automatiques).
 */
function sanctionCounts() {
  return cached('sanctions', () =>
    safe(
      () => {
        const byAction = moderationHistoryRepository.countByAction();
        const total = Object.values(byAction).reduce((sum, n) => sum + n, 0);
        return {
          total,
          timeouts: byAction.timeout ?? 0,
          bans: byAction.ban ?? 0,
          kicks: byAction.kick ?? 0,
          mutes: byAction.mute ?? 0,
          warns: byAction.warn ?? 0,
          byAction,
        };
      },
      { total: 0, timeouts: 0, bans: 0, kicks: 0, mutes: 0, warns: 0, byAction: {} },
    ),
  );
}

/** Total de bumps, tous serveurs confondus. */
function bumpCount() {
  return cached('bumps', () =>
    safe(() => Object.values(bumpRepository.getAllGuildBumps()).reduce((sum, g) => sum + (g.bumpCount ?? g.count ?? 0), 0), 0),
  );
}

/** Salons vocaux temporaires actuellement actifs. */
function activeTempVoice() {
  return cached('tempVoice', () => safe(() => tempVoiceRepository.allTemps().length, 0));
}

/** Captchas réalisés (réussis) et échecs, tous serveurs confondus. */
function captchaCounts() {
  return cached('captcha', () =>
    safe(
      () => {
        const totals = { passed: 0, failed: 0, kicked: 0 };
        for (const config of Object.values(captchaRepository.allConfigs())) {
          const stats = config?.stats ?? {};
          totals.passed += stats.passed ?? 0;
          totals.failed += stats.failed ?? 0;
          totals.kicked += stats.kicked ?? 0;
        }
        return totals;
      },
      { passed: 0, failed: 0, kicked: 0 },
    ),
  );
}

/**
 * Détections des quatre protections, tous serveurs confondus.
 * Anti-spam / anti-lien viennent des protections « classiques », anti-pub et
 * anti-contenus sensibles de leurs modules indépendants.
 */
function protectionCounts() {
  return cached('protections', () =>
    safe(
      () => {
        const totals = { antispam: 0, antilink: 0, antipub: 0, antisensitive: 0 };
        for (const config of Object.values(protectionRepository.allConfigs())) {
          totals.antispam += config?.stats?.spamDetections ?? 0;
          totals.antilink += config?.stats?.linksRemoved ?? 0;
        }
        for (const config of Object.values(antipubRepository.allConfigs())) {
          totals.antipub += config?.stats?.detections ?? 0;
        }
        for (const config of Object.values(antisensitiveRepository.allConfigs())) {
          totals.antisensitive += config?.stats?.detections ?? 0;
        }
        return totals;
      },
      { antispam: 0, antilink: 0, antipub: 0, antisensitive: 0 },
    ),
  );
}

// ---------------------------------------------------------------------------
// Métriques système (instantanées)
// ---------------------------------------------------------------------------

let lastCpu = { usage: process.cpuUsage(), at: Date.now() };

/**
 * Part de CPU consommée par le processus depuis le dernier appel, en
 * pourcentage d'un cœur logique (0-100, normalisé sur le nombre de cœurs).
 */
function cpuPercent() {
  const now = Date.now();
  const usage = process.cpuUsage(lastCpu.usage);
  const elapsedMs = Math.max(1, now - lastCpu.at);
  lastCpu = { usage: process.cpuUsage(), at: now };
  const usedMs = (usage.user + usage.system) / 1000;
  const cores = Math.max(1, os.cpus()?.length ?? 1);
  return Math.min(100, Math.round((usedMs / (elapsedMs * cores)) * 1000) / 10);
}

/** Mémoire, CPU, uptime, version — état du processus et du bot. */
function systemMetrics(client) {
  const memory = process.memoryUsage();
  const limits = resources.effective();
  return {
    version: VERSION,
    node: process.version,
    uptimeMs: client?.uptime ?? 0,
    processUptimeMs: Math.round(process.uptime() * 1000),
    ping: Math.max(0, Math.round(client?.ws?.ping ?? 0)),
    ready: Boolean(client?.isReady?.()),
    memory: {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      // Plafond réellement alloué au processus : c'est lui qui donne du sens
      // au taux d'occupation (heapTotal n'est que le tas déjà réservé).
      heapLimitBytes: limits.heapLimitMb * 1048576,
      systemTotalBytes: os.totalmem(),
    },
    cpu: { percent: cpuPercent(), cores: limits.cores, loadAvg1: os.loadavg?.()[0] ?? 0 },
    // Ressources allouées au processus (config/resources.js).
    allocation: {
      heapLimitMb: limits.heapLimitMb,
      heapConfigured: limits.heapConfigured,
      heapCeilingMb: limits.heapCeilingMb,
      threadPoolSize: limits.threadPoolSize,
      cores: limits.cores,
      systemMemoryMb: limits.systemMemoryMb,
    },
  };
}

// ---------------------------------------------------------------------------
// Vue d'ensemble
// ---------------------------------------------------------------------------

/**
 * Toutes les statistiques du tableau de bord, en un seul appel (une seule
 * requête réseau côté frontend, rafraîchie en direct par SSE).
 */
function dashboard(client) {
  const guilds = client?.guilds?.cache;
  const tickets = ticketCounts();
  const sanctions = sanctionCounts();
  const protections = protectionCounts();
  const captcha = captchaCounts();

  return {
    discord: {
      servers: guilds?.size ?? 0,
      users: safe(() => guilds?.reduce((sum, g) => sum + (g.memberCount ?? 0), 0), 0),
      channels: safe(() => guilds?.reduce((sum, g) => sum + (g.channels?.cache?.size ?? 0), 0), 0),
      commands: client?.commands?.size ?? 0,
    },
    tickets,
    moderation: {
      warns: warnCount(),
      sanctions: sanctions.total,
      timeouts: sanctions.timeouts,
      bans: sanctions.bans,
      kicks: sanctions.kicks,
      mutes: sanctions.mutes,
    },
    engagement: {
      bumps: bumpCount(),
      tempVoiceActive: activeTempVoice(),
      captchas: captcha.passed,
      captchaFailed: captcha.failed,
    },
    protections,
    system: systemMetrics(client),
    botLogs: botLogService.summary(),
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  dashboard,
  systemMetrics,
  ticketCounts,
  warnCount,
  sanctionCounts,
  bumpCount,
  activeTempVoice,
  captchaCounts,
  protectionCounts,
  invalidate,
  VERSION,
  CACHE_TTL_MS,
};
