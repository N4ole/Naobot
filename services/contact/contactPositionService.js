/**
 * Résolution du **poste** occupé par un membre sur son serveur
 * (propriétaire, administrateur, modérateur).
 *
 * Deux consommateurs, une seule règle :
 * - `middlewares/contact/contactAccess` : qui a le droit d'écrire aux owners ;
 * - `services/contact/contactService` : à quel titre le membre écrit, affiché
 *   aux owners (embed, logs, interface web).
 *
 * Les postes eux-mêmes sont déclarés dans
 * `utils/constants/contactPositions.js` ; ce service ne fait que les résoudre
 * et les formater.
 */
const POSITIONS = require('../../utils/constants/contactPositions');
const { t } = require('../../utils/helpers/i18n');

/**
 * Le membre possède-t-il **au moins une** des permissions du poste ?
 * @param {import('discord.js').GuildMember} member
 * @param {bigint[]} permissions
 */
function hasAny(member, permissions) {
  return permissions.some((permission) => member.permissions?.has(permission) === true);
}

/**
 * Poste occupé par un membre, ou `null` s'il n'en occupe aucun (simple membre).
 * Le poste le plus élevé l'emporte.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember} member
 * @returns {{ key: string, emoji: string, permissions: bigint[]|null } | null}
 */
function resolve(guild, member) {
  if (!guild || !member) return null;
  for (const key of POSITIONS.ORDER) {
    const position = POSITIONS[key];
    if (position.permissions === null) {
      // Poste déduit de l'identité, non des permissions (propriétaire).
      if (member.id === guild.ownerId) return position;
      continue;
    }
    if (hasAny(member, position.permissions)) return position;
  }
  return null;
}

/**
 * Libellé lisible d'un poste (« 👑 Propriétaire du serveur »).
 * Tolère une clé absente : les conversations ouvertes avant l'ouverture de la
 * commande aux modérateurs n'ont pas de poste enregistré.
 * @param {string|null|undefined} key
 * @returns {string}
 */
function format(key) {
  const position = key ? POSITIONS[key] : null;
  if (!position) return t('contact.position.unknown');
  return `${position.emoji} ${t(`contact.position.${position.key}`)}`;
}

/** Liste des postes autorisés à contacter les owners, pour l'affichage. */
function allowedLabels() {
  return POSITIONS.ORDER.map((key) => format(key));
}

module.exports = { resolve, format, allowedLabels };
