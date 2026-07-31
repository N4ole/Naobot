/**
 * Bus de notifications de l'interface web.
 *
 * Les services métier **publient** ici des événements applicatifs ; la couche
 * transport (SSE, `web/websocket/realtime`) s'y **abonne**. Ce découplage évite
 * que les services connaissent le web : aucun service n'importe le serveur
 * HTTP, et l'interface reste optionnelle (si le web est désactivé, personne
 * n'écoute et la publication ne coûte rien).
 *
 * Événements publiés :
 *   - `error`            nouvelle erreur interne du bot
 *   - `ticket`           nouveau ticket
 *   - `contactMessage`   nouveau message d'un propriétaire de serveur
 *   - `protection`       nouvelle détection d'une protection
 *   - `guildJoin`        serveur rejoint
 *   - `guildLeave`       serveur quitté
 *   - `command`          commande exécutée (flux du journal interne)
 *   - `system`           événement de cycle de vie
 *
 * Jamais bloquant : une erreur d'abonné n'interrompt jamais le publieur.
 */
const { EventEmitter } = require('node:events');

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

/** Types d'événements connus (documentation + validation souple). */
const EVENTS = ['error', 'ticket', 'contactMessage', 'protection', 'guildJoin', 'guildLeave', 'command', 'system'];

/**
 * Publie une notification. Encapsulé : un abonné défaillant n'affecte jamais
 * l'appelant (un service métier ne doit pas échouer à cause de l'interface).
 * @param {string} type
 * @param {object} payload
 */
function publish(type, payload = {}) {
  try {
    emitter.emit('notification', { type, at: new Date().toISOString(), ...payload });
  } catch {
    /* l'interface web ne doit jamais casser la logique métier */
  }
}

/**
 * S'abonne à toutes les notifications.
 * @param {(notification: { type: string, at: string }) => void} listener
 * @returns {() => void} fonction de désabonnement
 */
function subscribe(listener) {
  emitter.on('notification', listener);
  return () => emitter.off('notification', listener);
}

module.exports = { publish, subscribe, EVENTS };
