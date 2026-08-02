/**
 * Service de présence : **source unique** du statut affiché par le bot.
 *
 * Le statut met en avant la commande `contactowner`, seul point de contact
 * officiel entre les propriétaires de serveurs et les owners du bot : il doit
 * donc être visible sans avoir à ouvrir `help`.
 *
 * Deux points d'application, complémentaires :
 * - `initialPresence()` est passé aux options du client (`index.js`) : la
 *   présence part alors dans **chaque** IDENTIFY, y compris après une
 *   reconnexion complète de la passerelle ;
 * - `apply(client)` est rappelé au démarrage (`events/client/presence.js`)
 *   pour garantir le statut même si le client a été créé sans options.
 *
 * Aucune autre partie du code ne doit appeler `setPresence` directement.
 */
const { ActivityType } = require('discord.js');
const { t } = require('../../utils/helpers/i18n');

/**
 * Commande mise en avant dans le statut.
 * Affichée sous sa forme **slash** : la présence est globale alors que le
 * préfixe est personnalisable par serveur (`services/prefix/prefixService`) —
 * afficher `!contactowner` serait faux sur tout serveur ayant changé de préfixe.
 */
const FEATURED_COMMAND = 'contactowner';

/** Longueur maximale d'un statut personnalisé côté Discord. */
const MAX_STATE_LENGTH = 128;

/** Statut de connexion affiché (en ligne). */
const STATUS = 'online';

/** Texte du statut, tronqué proprement si la limite Discord est dépassée. */
function statusText() {
  const text = t('presence.status', { command: `/${FEATURED_COMMAND}` });
  return text.length > MAX_STATE_LENGTH ? `${text.slice(0, MAX_STATE_LENGTH - 1)}…` : text;
}

/**
 * Construit la présence complète.
 * `ActivityType.Custom` affiche le texte tel quel (sans préfixe « Joue à »,
 * « Écoute »…) ; Discord ignore le `name`, mais la passerelle l'exige.
 * @returns {{ status: string, activities: Array<object> }}
 */
function buildPresence() {
  return {
    status: STATUS,
    activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: statusText() }],
  };
}

/**
 * Présence envoyée dès l'IDENTIFY (options du client).
 * @returns {{ status: string, activities: Array<object> }}
 */
function initialPresence() {
  return buildPresence();
}

/**
 * Applique le statut sur un client connecté.
 * Ne provoque jamais d'erreur : un statut est cosmétique, son échec ne doit
 * pas interrompre le démarrage.
 * @param {import('discord.js').Client} client
 * @returns {boolean} true si le statut a été appliqué
 */
function apply(client) {
  if (!client?.user) return false;
  try {
    client.user.setPresence(buildPresence());
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  FEATURED_COMMAND,
  MAX_STATE_LENGTH,
  statusText,
  buildPresence,
  initialPresence,
  apply,
};
