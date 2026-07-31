/**
 * Module d'API **Réglages** : état de l'interface, owners déclarés, sections
 * d'API disponibles et liste noire de serveurs (lecture seule).
 *
 * Volontairement en lecture : la configuration du bot se fait par les commandes
 * Discord et le `.env`. Ce module expose l'état pour l'afficher, sans créer un
 * second chemin de configuration à maintenir.
 */
const config = require('../../../config/config');
const resources = require('../../../config/resources');
const ownerService = require('../../../services/owners/ownerService');
const serverBanRepository = require('../../../database/serverBanRepository');
const webStats = require('../../../services/web/webStats');
const realtime = require('../../websocket/realtime');

module.exports = {
  name: 'settings',
  routes: {
    /** État de l'interface et de la configuration statique (aucun secret exposé). */
    'GET /api/settings': ({ client }) => ({
      bot: {
        version: webStats.VERSION,
        tag: client?.user?.tag ?? null,
        defaultPrefix: config.prefix,
        locale: config.locale,
        commands: client?.commands?.size ?? 0,
      },
      web: {
        enabled: config.web.enabled,
        baseUrl: config.web.baseUrl,
        realtimeClients: realtime.clientCount(),
        // Jamais de secret : uniquement la présence de la configuration OAuth2.
        oauthConfigured: Boolean(config.web.clientId && config.web.clientSecret && config.web.sessionSecret),
      },
      owners: {
        primary: config.ownerId ?? null,
        total: ownerService.getAllOwnerIds().length,
        ids: ownerService.getAllOwnerIds(),
      },
      errorLogging: { configured: Boolean(config.errorGuildId), guildId: config.errorGuildId ?? null },
      // Ressources allouées au processus (config/resources.js) + avertissements
      // éventuels de configuration.
      resources: { ...resources.effective(), warnings: resources.warnings() },
    }),

    /** Sections d'API disponibles (le frontend construit sa navigation dessus). */
    'GET /api/settings/sections': () => ({ sections: require('../router').sections() }),

    /** Serveurs sur liste noire globale (aucune fonctionnalité ne leur est servie). */
    'GET /api/settings/banned-guilds': () => ({ guilds: serverBanRepository.getAll() }),
  },
};
