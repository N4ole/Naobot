/**
 * Commande urgence : verrouillage d'urgence du serveur (on / off / status).
 * Réservée aux administrateurs, au propriétaire du serveur et aux owners du
 * bot (middlewares/emergency/emergencyAccess). La logique métier vit dans
 * services/emergency/emergencyService.
 */
const config = require('../../config/config');
const emergencyService = require('../../services/emergency/emergencyService');
const { checkEmergencyAccess } = require('../../middlewares/emergency/emergencyAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'urgence',
  description: "Active/désactive le verrouillage d'urgence du serveur",
  usage: 'urgence <on|off|status>',
  examples: ['urgence on', 'urgence off', 'urgence status'],
  aliases: ['emergency', 'lockdown'],
  cooldown: 5,
  args: [
    { name: 'action', type: 'string', required: true, choices: ['on', 'off', 'status'], description: 'on : verrouiller ; off : déverrouiller ; status : état' },
  ],
  async execute(ctx) {
    const access = checkEmergencyAccess(ctx);
    if (!access.ok) {
      return ctx.reply({ embeds: [errorEmbed(access.error)], ephemeral: true });
    }
    const action = ctx.options.action.toLowerCase();

    if (action === 'status') {
      const state = emergencyService.getState(ctx.guild.id);
      const embed = infoEmbed(
        t('emergency.status.title'),
        state.active ? t('emergency.status.active') : t('emergency.status.inactive'),
      ).setColor(state.active ? COLORS.ERROR : COLORS.LOG_CREATE);
      if (state.active) {
        embed.addFields(
          { name: t('emergency.field.by'), value: `<@${state.activatedBy}>`, inline: true },
          { name: t('emergency.field.since'), value: `<t:${Math.floor(Date.parse(state.activatedAt) / 1000)}:R>`, inline: true },
        );
      }
      return ctx.reply({ embeds: [embed], ephemeral: true });
    }

    if (!['on', 'off'].includes(action)) {
      return ctx.reply({ embeds: [errorEmbed(t('errors.invalidArgs', { usage: `${config.prefix}${this.usage}` }))], ephemeral: true });
    }

    await ctx.defer();
    if (action === 'on') {
      const result = await emergencyService.activate(ctx.guild, ctx.user);
      if (!result.ok) {
        return ctx.reply({ embeds: [errorEmbed(t(`emergency.errors.${result.code}`))], ephemeral: true });
      }
      // Embed d'alerte visible dans le salon courant.
      return ctx.reply({
        embeds: [
          infoEmbed(t('emergency.activated.title'), t('emergency.activated.body', { user: `${ctx.user}`, locked: result.locked })).setColor(COLORS.ERROR),
        ],
      });
    }

    const result = await emergencyService.deactivate(ctx.guild, ctx.user);
    if (!result.ok) {
      return ctx.reply({ embeds: [errorEmbed(t(`emergency.errors.${result.code}`))], ephemeral: true });
    }
    return ctx.reply({
      embeds: [successEmbed(t('emergency.deactivated.body', { user: `${ctx.user}`, restored: result.restored }))],
    });
  },
};
