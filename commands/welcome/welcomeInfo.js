/**
 * Commandes welcomestatus / welcomepreview (même famille, même fichier) :
 * état de la configuration de bienvenue et aperçu de la carte telle qu'elle
 * apparaîtra. La logique métier vit dans services/welcome.
 */
const welcomeService = require('../../services/welcome/welcomeService');
const welcomeCardService = require('../../services/welcome/welcomeCardService');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const welcomestatus = {
  name: 'welcomestatus',
  description: 'Affiche la configuration de bienvenue du serveur',
  usage: 'welcomestatus',
  examples: ['welcomestatus'],
  aliases: [],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    const config = welcomeService.getConfig(ctx.guild.id);
    const embed = infoEmbed(t('welcome.status.title'), null).addFields(
      { name: t('welcome.field.state'), value: config.enabled ? t('welcome.status.on') : t('welcome.status.off'), inline: true },
      { name: t('common.channel'), value: config.channelId ? `<#${config.channelId}>` : t('welcome.panel.notSet'), inline: true },
      { name: t('welcome.field.template'), value: config.template, inline: true },
      { name: t('welcome.field.autoRoles'), value: config.autoRoleIds.length ? config.autoRoleIds.map((id) => `<@&${id}>`).join(' ') : t('help.none') },
      { name: t('welcome.field.dm'), value: config.dmEnabled ? '🟢' : '🔴', inline: true },
      { name: t('welcome.field.questions'), value: config.questions.length ? config.questions.map((q, i) => `${i + 1}. ${q}`).join('\n') : t('help.none') },
    );
    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
};

const welcomepreview = {
  name: 'welcomepreview',
  description: 'Aperçu de la carte de bienvenue (telle qu’un nouvel arrivant la verrait)',
  usage: 'welcomepreview',
  examples: ['welcomepreview'],
  aliases: [],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    const config = welcomeService.getConfig(ctx.guild.id);
    const card = welcomeCardService.buildCard(ctx.member, config);
    return ctx.reply({ content: t('welcome.preview.note'), embeds: [card], ephemeral: true });
  },
};

module.exports = [welcomestatus, welcomepreview];
