/** Petits utilitaires Discord partagés par les services et les commandes. */
const { MAX_AUDIT_REASON_LENGTH } = require('../constants/limits');
const { successEmbed, errorEmbed } = require('../embeds/embeds');

/**
 * Construit la raison inscrite dans les logs d'audit natifs de Discord,
 * en y incluant le modérateur (l'action étant exécutée par le bot).
 * @param {import('discord.js').User} moderator
 * @param {string} reason
 */
function auditReason(moderator, reason) {
  return `${moderator.tag} : ${reason}`.slice(0, MAX_AUDIT_REASON_LENGTH);
}

/**
 * Tente de prévenir un utilisateur en message privé. Échoue silencieusement
 * (MP fermés, utilisateur bloquant le bot…) : la sanction ne doit jamais
 * être bloquée par un MP impossible.
 * @param {import('discord.js').User} user
 * @param {string} content
 */
async function dmUser(user, content) {
  await user.send(content).catch(() => null);
}

/**
 * Répond à l'utilisateur à partir du résultat { ok, message } retourné par
 * un service. Les échecs sont éphémères en slash pour ne pas polluer le salon.
 * @param {import('./commandContext').CommandContext} ctx
 * @param {{ ok: boolean, message: string }} result
 */
function replyResult(ctx, result) {
  return ctx.reply({
    embeds: [result.ok ? successEmbed(result.message) : errorEmbed(result.message)],
    ephemeral: !result.ok,
  });
}

module.exports = { auditReason, dmUser, replyResult };
