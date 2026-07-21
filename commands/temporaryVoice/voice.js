/**
 * Commandes de configuration des salons vocaux temporaires (même famille) :
 * voicecreate, voiceedit, voicelist, voicedelete. Réservées aux
 * administrateurs.
 *
 * voicecreate porte l'assistant interactif (customId « voicecreate:* »),
 * partagé par voiceedit (édition). La logique métier vit dans
 * services/temporaryVoice ; l'accès dans middlewares/temporaryVoice.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');
const repository = require('../../database/tempVoiceRepository');
const wizard = require('../../services/temporaryVoice/tempVoiceWizard');
const tempVoiceService = require('../../services/temporaryVoice/tempVoiceService');
const { isAdmin } = require('../../middlewares/temporaryVoice/tempVoiceAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

function ephemeral(embed) {
  return { embeds: [embed], flags: MessageFlags.Ephemeral };
}

function generatorLine(guild, generator) {
  const active = repository.listTemps(guild.id).filter((temp) => temp.generatorId === generator.channelId).length;
  return t('tempVoice.list.entry', {
    channel: `<#${generator.channelId}>`,
    category: generator.categoryId ? `<#${generator.categoryId}>` : '—',
    format: generator.nameFormat,
    limit: generator.userLimit > 0 ? generator.userLimit : '∞',
    active,
  });
}

// --- voicecreate (+ assistant partagé) ---

const voicecreate = {
  name: 'voicecreate',
  description: 'Crée un générateur de salons vocaux temporaires (assistant)',
  usage: 'voicecreate',
  examples: ['voicecreate'],
  aliases: ['voiceadd'],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    wizard.startCreate(ctx.user.id, ctx.guild.id);
    return ctx.reply({ ...wizard.buildMainView(wizard.getDraft(ctx.user.id)), ephemeral: true });
  },

  async handleComponent(interaction) {
    if (!interaction.inCachedGuild()) return undefined;
    if (!isAdmin(interaction.member)) return interaction.reply(ephemeral(errorEmbed(t('tempVoice.errors.noPermission'))));
    const [, action] = interaction.customId.split(':');
    const draft = wizard.getDraft(interaction.user.id);
    if (!draft) return interaction.reply(ephemeral(errorEmbed(t('tempVoice.wizard.expired'))));

    switch (action) {
      case 'wchannel': {
        const channelId = interaction.channels.first()?.id;
        if (channelId && repository.isTemp(interaction.guild.id, channelId)) {
          return interaction.reply(ephemeral(errorEmbed(t('tempVoice.errors.channelIsTemp'))));
        }
        draft.channelId = channelId ?? draft.channelId;
        return interaction.update(wizard.buildMainView(draft));
      }
      case 'wcategory':
        draft.categoryId = interaction.channels.first()?.id ?? null;
        return interaction.update(wizard.buildMainView(draft));
      case 'wroles':
        draft.extraRoleIds = [...interaction.roles.keys()];
        return interaction.update(wizard.buildMainView(draft));
      case 'wformat':
        return interaction.showModal(wizard.formatModal(draft));
      case 'wformatmodal':
        wizard.applyFormat(draft, interaction.fields);
        return interaction.update(wizard.buildMainView(draft));
      case 'wcancel':
        wizard.clearDraft(interaction.user.id);
        return interaction.update({ embeds: [infoEmbed(t('tempVoice.wizard.cancelledTitle'), t('tempVoice.wizard.cancelled'))], components: [] });
      case 'wsave':
        return this._save(interaction, draft);
      default:
        return undefined;
    }
  },

  async _save(interaction, draft) {
    if (!draft.channelId) return interaction.reply(ephemeral(errorEmbed(t('tempVoice.wizard.needChannel'))));
    const channel = interaction.guild.channels.cache.get(draft.channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      return interaction.reply(ephemeral(errorEmbed(t('tempVoice.errors.notVoice'))));
    }
    const generator = {
      channelId: draft.channelId,
      guildId: interaction.guild.id,
      categoryId: draft.categoryId,
      nameFormat: draft.nameFormat,
      userLimit: draft.userLimit,
      extraRoleIds: draft.extraRoleIds,
      counter: draft.counter ?? 0,
      createdAt: draft.createdAt ?? new Date().toISOString(),
    };
    repository.saveGenerator(generator);
    wizard.clearDraft(interaction.user.id);
    await tempVoiceService.logVoice(
      interaction.guild,
      'config',
      [
        { name: t('tempVoice.field.generator'), value: `<#${generator.channelId}>`, inline: true },
        { name: t('common.moderator'), value: `${interaction.user.tag}`, inline: true },
      ],
      COLORS.LOG_UPDATE,
    );
    return interaction.update({
      // Création d'un générateur → `party` (l'édition reste un succès `thumb`).
      embeds: [successEmbed(t(draft.editing ? 'tempVoice.wizard.saved' : 'tempVoice.wizard.created', { channel: `<#${generator.channelId}>` }), draft.editing ? undefined : { emoji: 'party' })],
      components: [],
    });
  },
};

// --- voiceedit ---

const voiceedit = {
  name: 'voiceedit',
  description: 'Modifie un générateur de salons vocaux temporaires (assistant)',
  usage: 'voiceedit <salon générateur>',
  examples: ['voiceedit #Créer un salon'],
  aliases: [],
  cooldown: 3,
  args: [{ name: 'salon', type: 'channel', required: true, description: 'Le salon générateur à modifier' }],
  async execute(ctx) {
    const generator = repository.getGenerator(ctx.guild.id, ctx.options.salon.id);
    if (!generator) return ctx.reply({ embeds: [errorEmbed(t('tempVoice.errors.notGenerator'))], ephemeral: true });
    wizard.startEdit(ctx.user.id, generator);
    return ctx.reply({ ...wizard.buildMainView(wizard.getDraft(ctx.user.id)), ephemeral: true });
  },
};

// --- voicelist ---

const voicelist = {
  name: 'voicelist',
  description: 'Liste les générateurs et salons vocaux temporaires actifs',
  usage: 'voicelist',
  examples: ['voicelist'],
  aliases: [],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    const generators = repository.listGenerators(ctx.guild.id);
    const stats = repository.getStats(ctx.guild.id);
    const active = repository.listTemps(ctx.guild.id);
    if (generators.length === 0) {
      return ctx.reply({ embeds: [infoEmbed(t('tempVoice.list.title'), t('tempVoice.list.empty'))], ephemeral: true });
    }
    const embed = infoEmbed(t('tempVoice.list.title'), generators.map((generator) => generatorLine(ctx.guild, generator)).join('\n\n')).addFields(
      { name: t('tempVoice.list.active'), value: String(active.length), inline: true },
      { name: t('tempVoice.list.stats'), value: t('tempVoice.list.statsValue', { created: stats.created ?? 0, deleted: stats.deleted ?? 0 }), inline: true },
    );
    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
};

// --- voicedelete ---

const voicedelete = {
  name: 'voicedelete',
  description: 'Supprime un générateur de salons vocaux temporaires',
  usage: 'voicedelete <salon générateur>',
  examples: ['voicedelete #Créer un salon'],
  aliases: ['voiceremove'],
  cooldown: 3,
  args: [{ name: 'salon', type: 'channel', required: true, description: 'Le salon générateur à supprimer' }],
  async execute(ctx) {
    const generator = repository.getGenerator(ctx.guild.id, ctx.options.salon.id);
    if (!generator) return ctx.reply({ embeds: [errorEmbed(t('tempVoice.errors.notGenerator'))], ephemeral: true });
    return ctx.reply({
      embeds: [infoEmbed(t('tempVoice.delete.title'), t('tempVoice.delete.confirm', { channel: `<#${generator.channelId}>` }))],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`voicedelete:confirm:${ctx.user.id}:${generator.channelId}`).setLabel(t('tempVoice.delete.confirmButton')).setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`voicedelete:cancel:${ctx.user.id}:${generator.channelId}`).setLabel(t('tempVoice.delete.cancelButton')).setStyle(ButtonStyle.Secondary),
        ),
      ],
      ephemeral: true,
    });
  },
  async handleComponent(interaction) {
    if (!interaction.inCachedGuild() || !interaction.isButton()) return undefined;
    if (!isAdmin(interaction.member)) return interaction.reply(ephemeral(errorEmbed(t('tempVoice.errors.noPermission'))));
    const [, decision, requesterId, channelId] = interaction.customId.split(':');
    if (interaction.user.id !== requesterId) return interaction.reply(ephemeral(errorEmbed(t('tempVoice.errors.notYourSession'))));
    if (decision === 'cancel') {
      return interaction.update({ embeds: [infoEmbed(t('tempVoice.delete.title'), t('tempVoice.delete.cancelled'))], components: [] });
    }
    const removed = repository.deleteGenerator(interaction.guild.id, channelId);
    if (removed) {
      await tempVoiceService.logVoice(interaction.guild, 'config', [{ name: t('tempVoice.delete.title'), value: `<#${channelId}>`, inline: true }], COLORS.LOG_DELETE);
    }
    return interaction.update({
      // Suppression d'un générateur → `sleepy`.
      embeds: [removed ? successEmbed(t('tempVoice.delete.done'), { emoji: 'sleepy' }) : errorEmbed(t('tempVoice.errors.notGenerator'))],
      components: [],
    });
  },
};

module.exports = [voicecreate, voiceedit, voicelist, voicedelete];
