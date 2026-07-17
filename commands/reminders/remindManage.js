/**
 * Commandes remindlist / reminddelete / remindedit (même famille, même
 * fichier) : consultation (paginée), suppression (confirmation par boutons)
 * et modification des rappels personnels. La logique métier vit dans
 * services/reminders ; l'appartenance est vérifiée par
 * middlewares/reminders/reminderAccess.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const reminderService = require('../../services/reminders/reminderService');
const { requireOwnReminder } = require('../../middlewares/reminders/reminderAccess');
const { parseWhen } = require('../../utils/helpers/whenParser');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const PAGE_SIZE = 5;
const KEEP = new Set(['garder', 'keep', '=', '-']);

function listPayload(userId, page) {
  const reminders = reminderService.getUserReminders(userId);
  if (reminders.length === 0) {
    return { embeds: [infoEmbed(t('reminders.list.title', { count: 0 }), t('reminders.list.empty'))], components: [] };
  }
  const pageCount = Math.ceil(reminders.length / PAGE_SIZE);
  const current = Math.min(Math.max(page, 0), pageCount - 1);
  const lines = reminders.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((reminder) =>
    t('reminders.list.entry', {
      id: reminder.id,
      when: Math.floor(reminder.executeAt / 1000),
      message: reminder.message.slice(0, 120),
    }),
  );
  const embed = infoEmbed(t('reminders.list.title', { count: reminders.length }), lines.join('\n\n')).setFooter({ text: `Page ${current + 1}/${pageCount}` });
  const components = pageCount > 1
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`remindlist:prev:${userId}:${current}`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(current === 0),
        new ButtonBuilder().setCustomId(`remindlist:next:${userId}:${current}`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(current >= pageCount - 1),
      )]
    : [];
  return { embeds: [embed], components };
}

const remindlist = {
  name: 'remindlist',
  description: 'Liste vos rappels actifs',
  usage: 'remindlist',
  examples: ['remindlist'],
  aliases: ['reminders', 'rappels'],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    return ctx.reply({ ...listPayload(ctx.user.id, 0), ephemeral: true });
  },
  async handleComponent(interaction) {
    if (!interaction.isButton()) return;
    const [, direction, requesterId, rawPage] = interaction.customId.split(':');
    if (interaction.user.id !== requesterId) return interaction.deferUpdate();
    const current = Number.parseInt(rawPage, 10) || 0;
    return interaction.update(listPayload(requesterId, direction === 'prev' ? current - 1 : current + 1));
  },
};

const reminddelete = {
  name: 'reminddelete',
  description: 'Supprime un de vos rappels (avec confirmation)',
  usage: 'reminddelete <identifiant>',
  examples: ['reminddelete a1b2c3'],
  aliases: ['remindremove'],
  cooldown: 3,
  args: [{ name: 'identifiant', type: 'string', required: true, description: "L'identifiant du rappel" }],
  async execute(ctx) {
    const guard = requireOwnReminder(ctx.options.identifiant.toLowerCase(), ctx.user.id);
    if (!guard.ok) return ctx.reply({ embeds: [errorEmbed(guard.error)], ephemeral: true });
    return ctx.reply({
      embeds: [infoEmbed(t('reminders.delete.title'), t('reminders.delete.confirm', { id: guard.reminder.id, message: guard.reminder.message.slice(0, 100) }))],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`reminddelete:confirm:${ctx.user.id}:${guard.reminder.id}`).setLabel(t('reminders.delete.confirmButton')).setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`reminddelete:cancel:${ctx.user.id}:${guard.reminder.id}`).setLabel(t('reminders.delete.cancelButton')).setStyle(ButtonStyle.Secondary),
        ),
      ],
      ephemeral: true,
    });
  },
  async handleComponent(interaction) {
    if (!interaction.isButton()) return;
    const [, action, requesterId, reminderId] = interaction.customId.split(':');
    if (interaction.user.id !== requesterId) {
      return interaction.reply({ embeds: [errorEmbed(t('reminders.errors.notYours'))], flags: MessageFlags.Ephemeral });
    }
    if (action === 'cancel') {
      return interaction.update({ embeds: [infoEmbed(t('reminders.delete.title'), t('reminders.delete.cancelled'))], components: [] });
    }
    const result = await reminderService.deleteReminder(reminderId, requesterId, interaction.guild);
    return interaction.update({
      embeds: [result.ok ? successEmbed(t('reminders.delete.done', { id: reminderId })) : errorEmbed(t('reminders.errors.notFound', { id: reminderId }))],
      components: [],
    });
  },
};

const remindedit = {
  name: 'remindedit',
  description: 'Modifie le texte et/ou la date d’un rappel',
  usage: 'remindedit <identifiant> <échéance|garder> [nouveau message]',
  examples: ['remindedit a1b2c3 1h', 'remindedit a1b2c3 garder Nouveau texte', 'remindedit a1b2c3 25/12/2026 09:00 Cadeaux'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'identifiant', type: 'string', required: true, description: "L'identifiant du rappel" },
    { name: 'echeance', type: 'string', required: true, description: 'Nouvelle échéance (durée/date) ou « garder »' },
    { name: 'message', type: 'string', required: false, rest: true, description: 'Nouveau message (optionnel)' },
  ],
  async execute(ctx) {
    const guard = requireOwnReminder(ctx.options.identifiant.toLowerCase(), ctx.user.id);
    if (!guard.ok) return ctx.reply({ embeds: [errorEmbed(guard.error)], ephemeral: true });

    const changes = {};
    const echeance = ctx.options.echeance;
    let messagePart = ctx.options.message;

    if (!KEEP.has(echeance.toLowerCase())) {
      const parsed = parseWhen(echeance, messagePart ?? '');
      if (parsed.error) return ctx.reply({ embeds: [errorEmbed(t(`reminders.errors.${parsed.error}`))], ephemeral: true });
      changes.executeAt = parsed.at;
      messagePart = parsed.message; // une heure éventuelle a pu être consommée
    }
    if (messagePart) changes.message = messagePart;
    if (changes.executeAt === undefined && changes.message === undefined) {
      return ctx.reply({ embeds: [errorEmbed(t('reminders.edit.nothing'))], ephemeral: true });
    }

    const result = await reminderService.editReminder(guard.reminder.id, ctx.user.id, changes, ctx.guild);
    if (!result.ok) return ctx.reply({ embeds: [errorEmbed(t('reminders.errors.notFound', { id: guard.reminder.id }))], ephemeral: true });
    return ctx.reply({
      embeds: [successEmbed(t('reminders.edit.done', { id: result.reminder.id, when: `<t:${Math.floor(result.reminder.executeAt / 1000)}:F>` }))],
      ephemeral: true,
    });
  },
};

module.exports = [remindlist, reminddelete, remindedit];
