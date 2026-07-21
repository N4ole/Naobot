/**
 * Commande captcha : protection à l'arrivée (enable / disable / status / setup).
 * Réservée aux administrateurs pour la configuration.
 *
 * Ce fichier porte aussi TOUS les composants du système (customId
 * « captcha:* ») : l'assistant de configuration (`w*`, admin) et la résolution
 * du captcha par le membre (`solve`, `answer` — vérifiée par identifiant).
 * La logique métier vit dans services/captcha ; l'accès dans
 * middlewares/captcha.
 */
const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const repository = require('../../database/captchaRepository');
const captchaService = require('../../services/captcha/captchaService');
const captchaTypes = require('../../utils/constants/captchaTypes');
const wizard = require('../../services/captcha/captchaWizard');
const { isAdmin } = require('../../middlewares/captcha/captchaAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

function ephemeral(embed) {
  return { embeds: [embed], flags: MessageFlags.Ephemeral };
}

function statusEmbed(guild) {
  const c = repository.getConfig(guild.id);
  const type = captchaTypes[c.type] ?? captchaTypes.button;
  return infoEmbed(t('captcha.status.title'), c.enabled ? t('captcha.status.enabled') : t('captcha.status.disabled')).addFields(
    { name: t('captcha.field.channel'), value: c.channelId ? `<#${c.channelId}>` : '—', inline: true },
    { name: t('captcha.field.tempRole'), value: c.tempRoleId ? `<@&${c.tempRoleId}>` : '—', inline: true },
    { name: t('captcha.field.verifiedRole'), value: c.verifiedRoleId ? `<@&${c.verifiedRoleId}>` : '—', inline: true },
    { name: t('captcha.field.type'), value: `${type.emoji} ${type.label}`, inline: true },
    { name: t('captcha.field.timeout'), value: c.timeoutMinutes > 0 ? t('captcha.wizard.minutes', { count: c.timeoutMinutes }) : t('captcha.wizard.noTimeout'), inline: true },
    { name: t('captcha.field.attempts'), value: String(c.maxAttempts), inline: true },
    { name: t('captcha.field.autoDelete'), value: c.deleteSuccess && c.successDeleteMs > 0 ? t('captcha.field.autoDeleteOn', { seconds: Math.round(c.successDeleteMs / 1000) }) : t('captcha.field.autoDeleteOff'), inline: true },
    { name: t('captcha.status.stats'), value: t('captcha.status.statsValue', { passed: c.stats.passed ?? 0, kicked: c.stats.kicked ?? 0, pending: Object.keys(c.pending ?? {}).length }) },
  );
}

function answerModal(userId) {
  return new ModalBuilder().setCustomId(`captcha:answer:${userId}`).setTitle(t('captcha.modalTitle')).addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('answer').setLabel(t('captcha.modalLabel')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20),
    ),
  );
}

function resultEmbed(result) {
  // Vérification réussie → `party` ; échec avec tentatives → `crying` ;
  // expulsion (sanction) → `angry`.
  if (result.code === 'success') return successEmbed(t('captcha.success'), { emoji: 'party' });
  if (result.code === 'retry') return errorEmbed(t('captcha.retry', { remaining: result.remaining }), { emoji: 'crying' });
  if (result.code === 'kicked') return errorEmbed(t('captcha.kicked'), { emoji: 'angry' });
  return errorEmbed(t('captcha.noPending'));
}

module.exports = {
  name: 'captcha',
  description: 'Protection à l’arrivée : vérification des nouveaux membres',
  usage: 'captcha <enable|disable|status|setup|delete> [secondes|off]',
  examples: ['captcha status', 'captcha setup', 'captcha enable', 'captcha disable', 'captcha delete 15', 'captcha delete off'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'action', type: 'string', required: false, choices: ['enable', 'disable', 'status', 'setup', 'delete'], description: 'Action à effectuer' },
    { name: 'valeur', type: 'string', required: false, description: 'Pour delete : durée en secondes, ou « off » pour désactiver' },
  ],
  async execute(ctx) {
    const action = (ctx.options.action ?? 'status').toLowerCase();

    if (action === 'setup') {
      wizard.startFrom(ctx.user.id, repository.getConfig(ctx.guild.id));
      return ctx.reply({ ...wizard.buildMainView(wizard.getDraft(ctx.user.id)), ephemeral: true });
    }
    if (action === 'enable') {
      const config = repository.getConfig(ctx.guild.id);
      if (!config.channelId || !config.verifiedRoleId) {
        return ctx.reply({ embeds: [errorEmbed(t('captcha.errors.notConfigured'))], ephemeral: true });
      }
      config.enabled = true;
      repository.saveConfig(ctx.guild.id, config);
      await captchaService.logCaptcha(ctx.guild, 'config', [{ name: t('captcha.status.title'), value: t('captcha.status.enabled'), inline: true }], COLORS.LOG_CREATE);
      return ctx.reply({ embeds: [successEmbed(t('captcha.enabled')), statusEmbed(ctx.guild)] });
    }
    if (action === 'disable') {
      const config = repository.getConfig(ctx.guild.id);
      config.enabled = false;
      repository.saveConfig(ctx.guild.id, config);
      await captchaService.logCaptcha(ctx.guild, 'config', [{ name: t('captcha.status.title'), value: t('captcha.status.disabled'), inline: true }], COLORS.LOG_DELETE);
      return ctx.reply({ embeds: [successEmbed(t('captcha.disabled'))] });
    }
    if (action === 'delete') {
      const config = repository.getConfig(ctx.guild.id);
      const raw = (ctx.options.valeur ?? '').toLowerCase();
      if (['off', 'non', 'disable', '0'].includes(raw)) {
        config.deleteSuccess = false;
      } else {
        const seconds = Number.parseInt(raw, 10);
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) {
          return ctx.reply({ embeds: [errorEmbed(t('captcha.delete.usage'))], ephemeral: true });
        }
        config.deleteSuccess = true;
        config.successDeleteMs = seconds * 1000;
      }
      repository.saveConfig(ctx.guild.id, config);
      await captchaService.logCaptcha(ctx.guild, 'config', [{ name: t('captcha.field.autoDelete'), value: config.deleteSuccess ? t('captcha.field.autoDeleteOn', { seconds: Math.round(config.successDeleteMs / 1000) }) : t('captcha.field.autoDeleteOff'), inline: true }], COLORS.LOG_UPDATE);
      return ctx.reply({ embeds: [successEmbed(t(config.deleteSuccess ? 'captcha.delete.set' : 'captcha.delete.off', { seconds: Math.round(config.successDeleteMs / 1000) })), statusEmbed(ctx.guild)] });
    }
    return ctx.reply({ embeds: [statusEmbed(ctx.guild)], ephemeral: true });
  },

  async handleComponent(interaction) {
    if (!interaction.inCachedGuild()) return undefined;
    const parts = interaction.customId.split(':');
    const action = parts[1];

    // --- Résolution du captcha par le membre concerné ---
    if (action === 'solve') return this._handleSolve(interaction, parts[2]);
    if (action === 'answer') return this._handleAnswer(interaction, parts[2]);

    // --- Assistant de configuration : administrateurs uniquement ---
    if (!isAdmin(interaction.member)) return interaction.reply(ephemeral(errorEmbed(t('captcha.errors.noPermission'))));
    return this._handleWizard(interaction, action);
  },

  async _handleSolve(interaction, userId) {
    if (interaction.user.id !== userId) return interaction.reply(ephemeral(errorEmbed(t('captcha.notYours'))));
    const pending = repository.getPending(interaction.guild.id, userId);
    if (!pending) return interaction.reply(ephemeral(errorEmbed(t('captcha.noPending'))));
    if ((captchaTypes[pending.type] ?? captchaTypes.button).hasInput) {
      return interaction.showModal(answerModal(userId));
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await captchaService.verify(interaction.member, null);
    return interaction.editReply({ embeds: [resultEmbed(result)] });
  },

  async _handleAnswer(interaction, userId) {
    if (interaction.user.id !== userId) return interaction.reply(ephemeral(errorEmbed(t('captcha.notYours'))));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await captchaService.verify(interaction.member, interaction.fields.getTextInputValue('answer'));
    return interaction.editReply({ embeds: [resultEmbed(result)] });
  },

  async _handleWizard(interaction, action) {
    const draft = wizard.getDraft(interaction.user.id);
    if (!draft) return interaction.reply(ephemeral(errorEmbed(t('captcha.wizard.expired'))));

    switch (action) {
      case 'wchannel':
        draft.channelId = interaction.channels.first()?.id ?? draft.channelId;
        return interaction.update(wizard.buildMainView(draft));
      case 'wtemprole':
        draft.tempRoleId = interaction.roles.first()?.id ?? null;
        return interaction.update(wizard.buildMainView(draft));
      case 'wverifiedrole':
        draft.verifiedRoleId = interaction.roles.first()?.id ?? draft.verifiedRoleId;
        return interaction.update(wizard.buildMainView(draft));
      case 'wtype':
        draft.type = captchaTypes[interaction.values[0]] ? interaction.values[0] : draft.type;
        return interaction.update(wizard.buildMainView(draft));
      case 'woptions':
        return interaction.showModal(wizard.optionsModal(draft));
      case 'woptionsmodal':
        wizard.applyOptions(draft, interaction.fields);
        return interaction.update(wizard.buildMainView(draft));
      case 'wcancel':
        wizard.clearDraft(interaction.user.id);
        return interaction.update({ embeds: [infoEmbed(t('captcha.wizard.cancelledTitle'), t('captcha.wizard.cancelled'))], components: [] });
      case 'wsave':
        return this._handleSave(interaction, draft);
      default:
        return undefined;
    }
  },

  async _handleSave(interaction, draft) {
    if (!draft.channelId || !draft.verifiedRoleId) {
      return interaction.reply(ephemeral(errorEmbed(t('captcha.wizard.incomplete'))));
    }
    const config = repository.getConfig(interaction.guild.id);
    Object.assign(config, {
      channelId: draft.channelId,
      tempRoleId: draft.tempRoleId,
      verifiedRoleId: draft.verifiedRoleId,
      type: draft.type,
      timeoutMinutes: draft.timeoutMinutes,
      message: draft.message,
      maxAttempts: draft.maxAttempts,
    });
    repository.saveConfig(interaction.guild.id, config);
    wizard.clearDraft(interaction.user.id);
    await captchaService.logCaptcha(interaction.guild, 'config', [{ name: t('common.moderator'), value: `${interaction.user.tag}`, inline: true }], COLORS.LOG_UPDATE);
    return interaction.update({ embeds: [successEmbed(t(config.enabled ? 'captcha.wizard.saved' : 'captcha.wizard.savedDisabled'))], components: [] });
  },
};
