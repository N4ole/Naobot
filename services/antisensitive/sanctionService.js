/**
 * Sanctions **automatiques** de la protection anti-contenus sensibles.
 *
 * Module **dédié et indépendant de la détection** (`sensitiveMatcher`) et de
 * l'orchestration (`antisensitiveService`) : la détection ne sanctionne jamais
 * directement, elle délègue ici. Cette séparation permet d'ajouter facilement
 * de nouvelles sanctions à l'avenir (warn, kick, ban…) sans toucher au moteur
 * de détection : il suffira d'ajouter une fonction et de la brancher dans
 * `applyAutoSanctions`.
 *
 * Sanction actuelle : **timeout natif Discord** (permission « Modérer les
 * membres »), jamais un rôle/mute personnalisé. Jamais bloquant : chaque échec
 * renvoie un code exploitable par l'appelant (suppression + log malgré tout).
 */
const { PermissionFlagsBits } = require('discord.js');
const ownerService = require('../owners/ownerService');
const { auditReason } = require('../../utils/helpers/discordUtils');

/** Raison standardisée inscrite dans les logs d'audit Discord. */
const TIMEOUT_REASON = "Détection automatique d'un contenu sensible (AntiSensitive).";

/**
 * true si le membre est exempté de **sanction automatique** :
 * webhook (pas de membre), autre bot, propriétaire du serveur, owner du bot,
 * ou porteur d'un rôle exempté configuré.
 */
function isSanctionExempt(member, config, guild) {
  if (!member) return true; // message de webhook : aucun membre à sanctionner
  if (member.user?.bot) return true;
  if (member.id === guild.ownerId) return true; // propriétaire du serveur
  if (ownerService.isOwner(member.id)) return true; // owner du bot
  const exemptRoles = config.exemptRoles ?? [];
  if (member.roles?.cache && exemptRoles.some((roleId) => member.roles.cache.has(roleId))) return true;
  return false;
}

/**
 * Applique un timeout natif au membre, après vérifications.
 * @returns {Promise<{ attempted: boolean, applied: boolean, failed: boolean, code: string, durationMs?: number }>}
 *   Codes : `disabled` (option off), `exempt`, `alreadyTimedOut`,
 *   `botNoPermission`, `notModeratable` (hiérarchie), `error`, `applied`.
 */
async function applyTimeout(guild, member, config, client) {
  const skip = (code) => ({ attempted: false, applied: false, failed: false, code });

  if (!config.autoTimeout?.enabled) return skip('disabled');
  if (isSanctionExempt(member, config, guild)) return skip('exempt');
  if (member.isCommunicationDisabled?.()) return skip('alreadyTimedOut');

  const me = guild.members.me;
  const fail = (code, durationMs) => ({ attempted: true, applied: false, failed: true, code, durationMs });
  // Le bot doit posséder « Modérer les membres » et être plus haut que le membre.
  if (!me?.permissions.has(PermissionFlagsBits.ModerateMembers)) return fail('botNoPermission');
  if (!member.moderatable) return fail('notModeratable');

  const durationMs = config.autoTimeout.durationMs;
  try {
    await member.timeout(durationMs, auditReason(client.user, TIMEOUT_REASON));
  } catch {
    return fail('error', durationMs);
  }
  return { attempted: true, applied: true, failed: false, code: 'applied', durationMs };
}

/**
 * Applique **toutes** les sanctions automatiques configurées pour une détection.
 * Point d'extension unique : ajouter ici les futures sanctions (warn/kick/ban).
 * @param {{ guild: import('discord.js').Guild, member: import('discord.js').GuildMember|null, config: object, client: import('discord.js').Client }} params
 * @returns {Promise<{ timeout: Awaited<ReturnType<typeof applyTimeout>> }>}
 */
async function applyAutoSanctions({ guild, member, config, client }) {
  const timeout = await applyTimeout(guild, member, config, client);
  return { timeout };
}

module.exports = { applyAutoSanctions, applyTimeout, isSanctionExempt, TIMEOUT_REASON };
