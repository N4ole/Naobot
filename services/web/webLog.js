/**
 * Journalisation de l'interface web.
 *
 * - Événements globaux (connexions, authentifications, erreurs) : conservés
 *   dans un tampon circulaire en mémoire (consultable via l'API et diffusé en
 *   temps réel) et affichés en console. Ils ne sont pas rattachés à un serveur
 *   Discord précis.
 * - Actions rattachées à un serveur (modifications via le site) : journalisées
 *   dans la catégorie de logs Discord dédiée « web » du serveur concerné.
 *
 * Séparé de la logique Discord : ce module ne dépend que du logService
 * (catégories) et n'importe aucun client.
 */
const logService = require('../logs/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const BUFFER_SIZE = 200;
const buffer = [];
const listeners = new Set();

/** Enregistre un événement global et notifie les abonnés (temps réel). */
function record(type, message, meta = {}) {
  const entry = { type, message, meta, at: new Date().toISOString() };
  buffer.push(entry);
  if (buffer.length > BUFFER_SIZE) buffer.shift();
  console.log(`[web:${type}] ${message}`);
  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
      /* un abonné défaillant ne doit pas casser la journalisation */
    }
  }
  return entry;
}

const connection = (userTag) => record('connexion', t('web.log.connection', { user: userTag }));
const authentication = (userTag, ok) => record('authentification', t(ok ? 'web.log.authOk' : 'web.log.authFail', { user: userTag }));
const error = (message) => record('erreur', message);

/** Action rattachée à un serveur → catégorie de logs Discord « web ». */
function guildAction(guild, actor, detail) {
  record('modification', `${actor?.tag ?? actor} @ ${guild?.name ?? guild?.id}: ${detail}`);
  if (!guild) return Promise.resolve();
  return logService.log(
    guild,
    'web',
    logEventEmbed({
      title: `🌐 ${t('web.log.guildAction')}`,
      color: COLORS.LOG_UPDATE,
      user: actor ?? null,
      fields: [{ name: t('web.log.detail'), value: detail }],
    }),
  );
}

/** Derniers événements globaux (les plus récents en premier). */
function recent(limit = 50) {
  return buffer.slice(-limit).reverse();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

module.exports = { record, connection, authentication, error, guildAction, recent, subscribe };
