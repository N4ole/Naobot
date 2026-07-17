/**
 * Commande respond : réponse d'un owner du bot à une conversation de contact.
 * Le message signé est transmis au propriétaire via le bot ; les autres
 * owners sont synchronisés. Réservée aux owners (ownerOnly).
 * La logique métier vit dans services/contact.
 */
const contactService = require('../../services/contact/contactService');
const { successEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'respond',
  ownerOnly: true,
  description: 'Répond à une conversation de contact (réservé aux owners du bot)',
  usage: 'respond <identifiant> <message>',
  examples: ['respond CONTACT-000001 Bonjour, merci de votre message…'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'identifiant', type: 'string', required: true, description: 'Identifiant de la conversation (ex. CONTACT-000001)' },
    { name: 'message', type: 'string', required: true, rest: true, description: 'Votre réponse au propriétaire' },
  ],
  async execute(ctx) {
    await ctx.defer();
    const id = ctx.options.identifiant.toUpperCase();
    const result = await contactService.respond(ctx.client, id, ctx.user, ctx.options.message);
    if (!result.ok) {
      return ctx.reply({ embeds: [errorEmbed(t(`contact.errors.${result.code}`, { id }))], ephemeral: true });
    }
    return ctx.reply({ embeds: [successEmbed(t('contact.command.responded', { id }))], ephemeral: true });
  },
};
