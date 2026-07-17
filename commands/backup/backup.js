/**
 * Commande backup : sauvegarde et restauration du serveur
 * (create / load / delete / list). Réservée aux administrateurs.
 * Les actions sensibles (load, delete) demandent une confirmation par
 * boutons. La logique métier vit dans services/backup/backupService.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const backupService = require('../../services/backup/backupService');
const { isBackupAdmin } = require('../../middlewares/backup/backupAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

function summaryLines(summary) {
  return t('backup.summary', summary);
}

function listPayload(guild) {
  const backups = backupService.getBackups(guild.id);
  if (backups.length === 0) {
    return { embeds: [infoEmbed(t('backup.list.title'), t('backup.list.empty'))] };
  }
  const lines = backups
    .slice()
    .reverse()
    .map((backup) =>
      t('backup.list.entry', {
        id: backup.id,
        name: backup.name,
        by: backup.createdBy,
        date: Math.floor(Date.parse(backup.createdAt) / 1000),
        roles: backup.data.roles.length,
        channels: backup.data.channels.length,
      }),
    );
  return {
    embeds: [
      infoEmbed(t('backup.list.title', { count: backups.length }), lines.join('\n\n')).setFooter({
        text: t('backup.list.footer', { max: backupService.MAX_BACKUPS }),
      }),
    ],
  };
}

function confirmRow(action, userId, backupId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`backup:${action}:${userId}:${backupId}`).setLabel(t(`backup.${action}.confirmButton`)).setStyle(action === 'load' ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`backup:cancel:${userId}:${backupId}`).setLabel(t('backup.cancel')).setStyle(ButtonStyle.Secondary),
  );
}

module.exports = {
  name: 'backup',
  description: 'Sauvegarde et restaure le serveur (structure, permissions, configuration du bot)',
  usage: 'backup <create|load|delete|list> [identifiant] [nom]',
  examples: ['backup create Sauvegarde du 1er juin', 'backup list', 'backup load a1b2c3d4', 'backup delete a1b2c3d4'],
  aliases: [],
  cooldown: 10,
  args: [
    { name: 'action', type: 'string', required: true, choices: ['create', 'load', 'delete', 'list'], description: 'Action à effectuer' },
    { name: 'valeur', type: 'string', required: false, rest: true, description: 'Identifiant (load/delete) ou nom (create)' },
  ],
  async execute(ctx) {
    const action = ctx.options.action.toLowerCase();
    const value = ctx.options.valeur?.trim();

    if (action === 'list') {
      return ctx.reply(listPayload(ctx.guild));
    }

    if (action === 'create') {
      await ctx.defer();
      const { backup, evicted } = await backupService.createBackup(ctx.guild, value, ctx.user);
      const summary = backupService.summarize(backup);
      const lines = [t('backup.create.done', { id: backup.id, name: backup.name }), summaryLines(summary)];
      if (evicted) lines.push(t('backup.create.evicted', { id: evicted.id }));
      return ctx.reply({ embeds: [successEmbed(lines.join('\n'))] });
    }

    // load / delete : requièrent un identifiant + confirmation.
    if (!value) {
      return ctx.reply({ embeds: [errorEmbed(t('backup.errors.idRequired'))], ephemeral: true });
    }
    const backup = backupService.getBackup(ctx.guild.id, value);
    if (!backup) {
      return ctx.reply({ embeds: [errorEmbed(t('backup.errors.notFound', { id: value }))], ephemeral: true });
    }

    if (action === 'delete') {
      return ctx.reply({
        embeds: [infoEmbed(t('backup.delete.title'), t('backup.delete.confirm', { id: backup.id, name: backup.name }))],
        components: [confirmRow('delete', ctx.user.id, backup.id)],
        ephemeral: true,
      });
    }

    // load
    const summary = backupService.summarize(backup);
    return ctx.reply({
      embeds: [infoEmbed(t('backup.load.title'), `${t('backup.load.confirm', { id: backup.id, name: backup.name })}\n\n${summaryLines(summary)}`)],
      components: [confirmRow('load', ctx.user.id, backup.id)],
      ephemeral: true,
    });
  },

  /** Confirmations (customId "backup:<action>:<userId>:<backupId>"). */
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const [, action, requesterId, backupId] = interaction.customId.split(':');

    if (!isBackupAdmin(interaction.member) || interaction.user.id !== requesterId) {
      return interaction.reply({ embeds: [errorEmbed(t('backup.errors.noPermission'))], flags: MessageFlags.Ephemeral });
    }

    if (action === 'cancel') {
      return interaction.update({ embeds: [infoEmbed(t('backup.cancelledTitle'), t('backup.cancelled'))], components: [] });
    }

    const backup = backupService.getBackup(interaction.guild.id, backupId);
    if (!backup) {
      return interaction.update({ embeds: [errorEmbed(t('backup.errors.notFound', { id: backupId }))], components: [] });
    }

    if (action === 'delete') {
      await backupService.deleteBackup(interaction.guild, backupId, interaction.user);
      return interaction.update({ embeds: [successEmbed(t('backup.delete.done', { id: backupId }))], components: [] });
    }

    if (action === 'load') {
      await interaction.update({ embeds: [infoEmbed(t('backup.load.title'), t('backup.load.inProgress'))], components: [] });
      const result = await backupService.restoreBackup(interaction.guild, backup, interaction.user);
      return interaction.editReply({
        embeds: [successEmbed(t('backup.load.done', { roles: result.rolesCreated, channels: result.channelsCreated, config: result.configRestored }))],
      });
    }
    return undefined;
  },
};
