/**
 * Commande purge : suppression en masse des derniers messages du salon.
 * La logique métier vit dans services/moderation/purgeService.
 */
const purgeService = require('../../services/moderation/purgeService');
const { successEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { MIN_PURGE, MAX_PURGE } = require('../../utils/constants/limits');

module.exports = {
  name: 'purge',
  description: `Supprime les derniers messages du salon (${MIN_PURGE} à ${MAX_PURGE})`,
  usage: 'purge <nombre>',
  examples: ['purge 10', 'purge 100'],
  aliases: ['clear'],
  cooldown: 5,
  args: [
    {
      name: 'nombre',
      type: 'integer',
      required: true,
      min: MIN_PURGE,
      max: MAX_PURGE,
      description: `Nombre de messages à supprimer (${MIN_PURGE}-${MAX_PURGE})`,
    },
  ],
  async execute(ctx) {
    // En préfixe, le message de commande est supprimé d'abord pour qu'il ne
    // soit pas compté dans la purge demandée.
    if (!ctx.isSlash) await ctx.message.delete().catch(() => null);

    const result = await purgeService.purgeMessages(ctx, ctx.options.nombre);
    if (!result.ok) {
      // En préfixe, le message d'origine vient d'être supprimé : impossible
      // d'y répondre, on envoie directement dans le salon.
      if (ctx.isSlash) {
        return ctx.reply({ embeds: [errorEmbed(result.message)], ephemeral: true });
      }
      return ctx.channel.send({ embeds: [errorEmbed(result.message)] });
    }

    // Confirmation éphémère en slash ; en préfixe, confirmation auto-supprimée
    // pour ne pas re-remplir le salon que l'on vient de nettoyer.
    if (ctx.isSlash) {
      return ctx.reply({ embeds: [successEmbed(result.message)], ephemeral: true });
    }
    const confirmation = await ctx.channel.send({ embeds: [successEmbed(result.message)] });
    setTimeout(() => confirmation.delete().catch(() => null), 5000);
  },
};
