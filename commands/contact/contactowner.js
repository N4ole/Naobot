/**
 * Commande contactowner : permet au **propriétaire du serveur** de contacter
 * les owners du bot. Le message transite par le bot (aucun compte Discord
 * d'owner n'est exposé). La logique métier vit dans services/contact.
 */
const contactService = require('../../services/contact/contactService');
const { checkServerOwner } = require('../../middlewares/contact/contactAccess');
const { successEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'contactowner',
  description: 'Contacte les owners du bot (réservé au propriétaire du serveur)',
  usage: 'contactowner <message>',
  examples: ['contactowner Bonjour, une question sur le bot…'],
  aliases: [],
  cooldown: 60,
  args: [
    { name: 'message', type: 'string', required: true, rest: true, description: 'Votre message aux owners du bot' },
  ],
  async execute(ctx) {
    const access = checkServerOwner(ctx);
    if (!access.ok) {
      return ctx.reply({ embeds: [errorEmbed(access.error)], ephemeral: true });
    }

    await ctx.defer();
    const result = await contactService.openConversation(ctx, ctx.options.message);
    if (!result.ok) {
      return ctx.reply({ embeds: [errorEmbed(t(`contact.errors.${result.code}`))], ephemeral: true });
    }
    return ctx.reply({
      embeds: [successEmbed(t('contact.command.sent', { id: result.conversation.id, count: result.delivered }))],
      ephemeral: true,
    });
  },
};
