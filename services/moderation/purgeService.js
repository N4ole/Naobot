/**
 * Logique métier de la purge de messages, partagée par les commandes slash
 * et préfixées. Utilise la suppression en masse native de Discord
 * (bulkDelete), limitée par l'API aux messages de moins de 14 jours.
 */
const { logModAction } = require('../logging/modLogService');
const { modLogEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

/**
 * Supprime les `count` derniers messages du salon courant.
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @param {number} count - Entre 1 et 100 (validé par le schéma d'arguments)
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function purgeMessages(ctx, count) {
  // Le second argument (true) ignore silencieusement les messages de plus
  // de 14 jours au lieu de faire échouer toute la purge.
  const deleted = await ctx.channel.bulkDelete(count, true).catch(() => null);
  if (deleted === null) return { ok: false, message: t('moderation.purge.failed') };

  await logModAction(
    ctx.guild,
    modLogEmbed({
      action: t('moderation.purge.logAction'),
      target: null,
      moderator: ctx.user,
      reason: t('common.noReason'),
      extraFields: [
        { name: t('common.channel'), value: `${ctx.channel}`, inline: true },
        { name: 'Messages', value: String(deleted.size), inline: true },
      ],
    }),
    'moderation',
  );

  const key = deleted.size < count ? 'moderation.purge.partial' : 'moderation.purge.success';
  return { ok: true, message: t(key, { count: deleted.size }) };
}

module.exports = { purgeMessages };
