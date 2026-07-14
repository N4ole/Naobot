/**
 * Commande say : fait répéter un message par le bot, dans un embed.
 * Réservée à « Gérer les messages » (anti-abus) ; l'embed neutralise
 * toute mention (@everyone, rôles, membres) et l'auteur reste identifié.
 */
const { successEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'say',
  description: 'Fait répéter un message par le bot (Gérer les messages requis)',
  usage: 'say <message>',
  examples: ['say Bienvenue à tous !'],
  aliases: [],
  cooldown: 5,
  args: [
    { name: 'message', type: 'string', required: true, rest: true, description: 'Le message à répéter' },
  ],
  async execute(ctx) {
    const embed = infoEmbed(null, ctx.options.message.slice(0, 4000)).setFooter({
      text: t('fun.say.footer', { user: ctx.user.tag }),
    });

    if (ctx.isSlash) {
      await ctx.channel.send({ embeds: [embed] });
      return ctx.reply({ embeds: [successEmbed(t('fun.say.sent'))], ephemeral: true });
    }
    // En préfixe : le message d'origine est supprimé, le bot parle « seul ».
    await ctx.message.delete().catch(() => null);
    return ctx.channel.send({ embeds: [embed] });
  },
};
