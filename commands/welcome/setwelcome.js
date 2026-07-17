/**
 * Commande setwelcome : panneau interactif de configuration de la
 * bienvenue (salon, message, couleur, modèle de carte, rôles automatiques,
 * MP optionnel, questions d'accueil). La logique métier vit dans
 * services/welcome. Ce fichier porte aussi le flux public de réponses aux
 * questions d'accueil (bouton « setwelcome:answer » + modal).
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');
const welcomeService = require('../../services/welcome/welcomeService');
const welcomeCardService = require('../../services/welcome/welcomeCardService');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const MAX_QUESTIONS = 5;
const TEMPLATES = ['classic', 'banner'];

function panelEmbed(guild, config) {
  return infoEmbed(t('welcome.panel.title'), t('welcome.panel.help')).addFields(
    { name: t('welcome.field.state'), value: config.enabled ? '🟢' : '🔴', inline: true },
    { name: t('common.channel'), value: config.channelId ? `<#${config.channelId}>` : t('welcome.panel.notSet'), inline: true },
    { name: t('welcome.field.template'), value: config.template, inline: true },
    { name: t('welcome.field.autoRoles'), value: config.autoRoleIds.length ? config.autoRoleIds.map((id) => `<@&${id}>`).join(' ') : t('help.none') },
    { name: t('welcome.field.dm'), value: config.dmEnabled ? '🟢' : '🔴', inline: true },
    { name: t('welcome.field.questions'), value: String(config.questions.length), inline: true },
    { name: t('welcome.field.message'), value: config.message.slice(0, 200) },
  );
}

function panelComponents(config) {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('setwelcome:channel').setPlaceholder(t('welcome.panel.pickChannel')).addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('setwelcome:roles').setPlaceholder(t('welcome.panel.pickRoles')).setMinValues(0).setMaxValues(10),
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('setwelcome:template').setPlaceholder(t('welcome.panel.pickTemplate')).addOptions(
        TEMPLATES.map((key) => ({ label: t(`welcome.template.${key}`), value: key, default: config.template === key })),
      ),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setwelcome:message').setLabel(t('welcome.panel.editMessage')).setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setwelcome:questions').setLabel(t('welcome.panel.editQuestions')).setEmoji('❓').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setwelcome:dmtoggle').setLabel(config.dmEnabled ? t('welcome.panel.dmOff') : t('welcome.panel.dmOn')).setEmoji('📩').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setwelcome:toggle').setLabel(config.enabled ? t('welcome.panel.disable') : t('welcome.panel.enable')).setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    ),
  ];
}

function buildPanel(guild) {
  const config = welcomeService.getConfig(guild.id);
  return { embeds: [panelEmbed(guild, config)], components: panelComponents(config) };
}

function messageModal(config) {
  const field = (id, label, style, value) => {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(false);
    if (value) input.setValue(String(value));
    return new ActionRowBuilder().addComponents(input);
  };
  return new ModalBuilder().setCustomId('setwelcome:messagemodal').setTitle(t('welcome.panel.editMessage')).addComponents(
    field('message', t('welcome.field.message'), TextInputStyle.Paragraph, config.message),
    field('color', t('welcome.field.color'), TextInputStyle.Short, config.color != null ? `#${config.color.toString(16).padStart(6, '0')}` : ''),
    field('dm', t('welcome.field.dmMessage'), TextInputStyle.Paragraph, config.dmMessage),
  );
}

function questionsModal(config) {
  const modal = new ModalBuilder().setCustomId('setwelcome:questionsmodal').setTitle(t('welcome.panel.editQuestions'));
  for (let i = 0; i < MAX_QUESTIONS; i += 1) {
    const input = new TextInputBuilder().setCustomId(`q${i}`).setLabel(t('welcome.panel.questionN', { n: i + 1 })).setStyle(TextInputStyle.Short).setRequired(false);
    if (config.questions[i]) input.setValue(config.questions[i]);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

function answerModal(config) {
  const modal = new ModalBuilder().setCustomId('setwelcome:answermodal').setTitle(t('welcome.questions.title'));
  config.questions.slice(0, MAX_QUESTIONS).forEach((question, index) => {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(`a${index}`).setLabel(question.slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(false),
      ),
    );
  });
  return modal;
}

module.exports = {
  name: 'setwelcome',
  description: 'Configure le système de bienvenue (panneau interactif)',
  usage: 'setwelcome',
  examples: ['setwelcome'],
  aliases: [],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    return ctx.reply({ ...buildPanel(ctx.guild), ephemeral: true });
  },

  async handleComponent(interaction) {
    if (!interaction.inCachedGuild()) return;
    const action = interaction.customId.split(':')[1];

    // Flux public : un membre répond aux questions d'accueil.
    if (action === 'answer') {
      const config = welcomeService.getConfig(interaction.guild.id);
      if (!config.questions.length) return interaction.reply({ embeds: [errorEmbed(t('welcome.questions.none'))], flags: MessageFlags.Ephemeral });
      return interaction.showModal(answerModal(config));
    }
    if (action === 'answermodal') {
      const config = welcomeService.getConfig(interaction.guild.id);
      const responses = config.questions.slice(0, MAX_QUESTIONS).map((question, index) => ({
        question,
        answer: interaction.fields.getTextInputValue(`a${index}`).trim() || '—',
      }));
      welcomeService.saveAnswers(interaction.guild.id, interaction.user.id, responses);
      return interaction.reply({ embeds: [successEmbed(t('welcome.questions.saved'))], flags: MessageFlags.Ephemeral });
    }

    // Configuration : réservée à « Gérer le serveur ».
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ embeds: [errorEmbed(t('welcome.errors.noPermission'))], flags: MessageFlags.Ephemeral });
    }
    const config = welcomeService.getConfig(interaction.guild.id);

    switch (action) {
      case 'channel':
        config.channelId = interaction.channels.first()?.id ?? config.channelId;
        break;
      case 'roles':
        config.autoRoleIds = interaction.roles.map((role) => role.id);
        break;
      case 'template':
        config.template = interaction.values[0];
        break;
      case 'toggle':
        config.enabled = !config.enabled;
        break;
      case 'dmtoggle':
        config.dmEnabled = !config.dmEnabled;
        break;
      case 'message':
        return interaction.showModal(messageModal(config));
      case 'questions':
        return interaction.showModal(questionsModal(config));
      case 'messagemodal': {
        config.message = interaction.fields.getTextInputValue('message').trim() || config.message;
        const raw = interaction.fields.getTextInputValue('color').trim().replace(/^#/, '');
        config.color = /^[0-9a-f]{6}$/i.test(raw) ? Number.parseInt(raw, 16) : null;
        config.dmMessage = interaction.fields.getTextInputValue('dm').trim() || config.dmMessage;
        break;
      }
      case 'questionsmodal':
        config.questions = Array.from({ length: MAX_QUESTIONS }, (_, i) => interaction.fields.getTextInputValue(`q${i}`).trim()).filter(Boolean);
        break;
      default:
        return undefined;
    }
    welcomeService.saveConfig(interaction.guild.id, config);
    return interaction.update(buildPanel(interaction.guild));
  },
};
