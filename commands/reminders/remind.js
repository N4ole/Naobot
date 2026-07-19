/**
 * Commande remind : crée un rappel personnel à une échéance (durée relative
 * ou date absolue). Le rappel est envoyé en message privé à l'échéance.
 * La logique métier vit dans services/reminders.
 */
const reminderService = require('../../services/reminders/reminderService');
const { parseWhen } = require('../../utils/helpers/whenParser');
const { successEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'remind',
  description: 'Crée un rappel personnel (durée ou date), envoyé en MP à l’échéance',
  usage: 'remind <durée|date> <message>',
  examples: ['remind 10m Aller chercher le colis', 'remind 2h Préparer la réunion', 'remind 3j Anniversaire', 'remind 25/12/2026 18:00 Repas'],
  aliases: ['rappel', 'remindme'],
  cooldown: 3,
  dm: 'direct',
  args: [
    { name: 'echeance', type: 'string', required: true, description: 'Durée (30s, 15m, 2h, 3j, 1w) ou date (JJ/MM/AAAA [HH:mm])' },
    { name: 'message', type: 'string', required: true, rest: true, description: 'Le message du rappel' },
  ],
  async execute(ctx) {
    const parsed = parseWhen(ctx.options.echeance, ctx.options.message);
    if (parsed.error) {
      return ctx.reply({ embeds: [errorEmbed(t(`reminders.errors.${parsed.error}`))], ephemeral: true });
    }
    if (!parsed.message) {
      return ctx.reply({ embeds: [errorEmbed(t('reminders.errors.noMessage'))], ephemeral: true });
    }

    const reminder = await reminderService.createReminder(
      { user: ctx.user, guild: ctx.guild, channel: ctx.channel, messageUrl: ctx.message?.url ?? null },
      parsed.at,
      parsed.message,
    );
    return ctx.reply({
      embeds: [
        successEmbed(t('reminders.command.created', { id: reminder.id, when: `<t:${Math.floor(parsed.at / 1000)}:F>`, relative: `<t:${Math.floor(parsed.at / 1000)}:R>` })),
      ],
      ephemeral: true,
    });
  },
};
