/**
 * Commandes des dossiers membres (notes de modération globales, inter-serveurs) :
 * - `file <utilisateur> <texte>`   : ajoute une note (admin / modérateur / owner).
 * - `fileinfo <utilisateur>`       : dossier complet (infos + notes paginées).
 * - `filelist <utilisateur>`       : liste allégée des notes (id, auteur, date, serveur).
 * - `filedelete <identifiant>`     : supprime une note (avec confirmation).
 *
 * Données sensibles : accès contrôlé (middlewares/memberFiles) et consultations
 * journalisées (services/memberFiles). La logique métier vit dans le service.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const memberFileService = require('../../services/memberFiles/memberFileService');
const { canAddFile, canViewFiles, canDeleteNote } = require('../../middlewares/memberFiles/memberFileAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const NOTES_PER_PAGE = 5;
const MAX_NOTE_LENGTH = 1000;

function noteLine(note) {
  return t('memberFiles.noteEntry', {
    id: note.id,
    content: note.content,
    author: note.authorTag ? `${note.authorTag}` : `<@${note.authorId}>`,
    server: note.guildName ?? note.guildId ?? '—',
    date: Math.floor(Date.parse(note.createdAt) / 1000),
  });
}

/** Embed complet d'un dossier (infos générales + notes de la page). */
function buildInfoPayload(targetUser, page, requesterId) {
  const dossier = memberFileService.getDossier(targetUser.id);
  const pages = Math.max(1, Math.ceil(dossier.notes.length / NOTES_PER_PAGE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const slice = dossier.notes.slice(current * NOTES_PER_PAGE, current * NOTES_PER_PAGE + NOTES_PER_PAGE);

  const embed = infoEmbed(t('memberFiles.info.title', { user: targetUser.tag ?? targetUser.id }), null)
    .setThumbnail(targetUser.displayAvatarURL?.({ size: 128 }) ?? null)
    .addFields(
      { name: t('memberFiles.field.user'), value: `${targetUser.tag ?? '—'} (\`${targetUser.id}\`)`, inline: false },
      { name: t('memberFiles.field.repScore'), value: `${dossier.rep.score}/100`, inline: true },
      { name: t('memberFiles.field.trust'), value: `${dossier.rep.level.emoji} ${dossier.rep.level.label}`, inline: true },
      { name: t('memberFiles.field.warns'), value: String(dossier.totalWarns), inline: true },
      { name: t('memberFiles.field.sanctions'), value: String(dossier.totalSanctions), inline: true },
      { name: t('memberFiles.field.noteCount'), value: String(dossier.noteCount), inline: true },
      { name: t('memberFiles.field.guildsCount'), value: String(dossier.guildsCount), inline: true },
      { name: t('memberFiles.info.notes'), value: slice.length ? slice.map(noteLine).join('\n\n') : t('memberFiles.info.noNotes') },
    )
    .setFooter({ text: t('memberFiles.info.footer', { page: current + 1, pages }) });

  const components =
    pages > 1
      ? [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fileinfo:page:${targetUser.id}:${current - 1}:${requesterId}`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(current === 0),
            new ButtonBuilder().setCustomId(`fileinfo:page:${targetUser.id}:${current + 1}:${requesterId}`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(current >= pages - 1),
          ),
        ]
      : [];
  return { embeds: [embed], components };
}

/** Embed allégé (liste des notes : id, auteur, date, serveur). */
function buildListPayload(targetUser, page, requesterId) {
  const notes = memberFileService.getNotes(targetUser.id);
  if (notes.length === 0) {
    return { embeds: [infoEmbed(t('memberFiles.list.title', { user: targetUser.tag ?? targetUser.id }), t('memberFiles.info.noNotes'))], components: [] };
  }
  const pages = Math.max(1, Math.ceil(notes.length / (NOTES_PER_PAGE * 2)));
  const current = Math.min(Math.max(0, page), pages - 1);
  const slice = notes.slice(current * NOTES_PER_PAGE * 2, current * NOTES_PER_PAGE * 2 + NOTES_PER_PAGE * 2);
  const lines = slice.map((note) =>
    t('memberFiles.listEntry', {
      id: note.id,
      author: note.authorTag ?? `<@${note.authorId}>`,
      server: note.guildName ?? note.guildId ?? '—',
      date: Math.floor(Date.parse(note.createdAt) / 1000),
    }),
  );
  const embed = infoEmbed(t('memberFiles.list.title', { user: targetUser.tag ?? targetUser.id }), lines.join('\n')).setFooter({
    text: t('memberFiles.info.footer', { page: current + 1, pages }),
  });
  const components =
    pages > 1
      ? [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`filelist:page:${targetUser.id}:${current - 1}:${requesterId}`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(current === 0),
            new ButtonBuilder().setCustomId(`filelist:page:${targetUser.id}:${current + 1}:${requesterId}`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(current >= pages - 1),
          ),
        ]
      : [];
  return { embeds: [embed], components };
}

/** Vérifie l'accès en consultation dans un composant (bouton). */
async function guardViewComponent(interaction) {
  if (!canViewFiles(interaction.member)) {
    await interaction.reply({ embeds: [errorEmbed(t('memberFiles.noPermission.view'))], flags: MessageFlags.Ephemeral });
    return false;
  }
  return true;
}

const file = {
  name: 'file',
  description: 'Ajoute une note au dossier global d’un membre',
  usage: 'file <utilisateur> <texte>',
  examples: ['file @Membre A participé à un raid.', 'file @Membre Comportement suspect en vocal.'],
  aliases: ['note', 'addnote'],
  cooldown: 3,
  args: [
    { name: 'utilisateur', type: 'user', required: true, description: 'L’utilisateur concerné' },
    { name: 'texte', type: 'string', required: true, rest: true, description: 'Le contenu de la note' },
  ],
  async execute(ctx) {
    if (!canAddFile(ctx.member)) return ctx.reply({ embeds: [errorEmbed(t('memberFiles.noPermission.add'))], ephemeral: true });
    const content = String(ctx.options.texte ?? '').trim().slice(0, MAX_NOTE_LENGTH);
    if (!content) return ctx.reply({ embeds: [errorEmbed(t('memberFiles.empty'))], ephemeral: true });

    const note = await memberFileService.addNote(ctx.guild, ctx.options.utilisateur, ctx.user, content);
    return ctx.reply({ embeds: [successEmbed(t('memberFiles.added', { user: `${ctx.options.utilisateur}`, id: note.id }))] });
  },
};

const fileinfo = {
  name: 'fileinfo',
  description: 'Consulte le dossier complet d’un membre (infos + notes)',
  usage: 'fileinfo <utilisateur>',
  examples: ['fileinfo @Membre'],
  aliases: ['dossier'],
  cooldown: 3,
  args: [{ name: 'utilisateur', type: 'user', required: true, description: 'L’utilisateur concerné' }],
  async execute(ctx) {
    if (!canViewFiles(ctx.member)) return ctx.reply({ embeds: [errorEmbed(t('memberFiles.noPermission.view'))], ephemeral: true });
    await memberFileService.logConsultation(ctx.guild, ctx.options.utilisateur, ctx.user);
    return ctx.reply({ ...buildInfoPayload(ctx.options.utilisateur, 0, ctx.user.id), ephemeral: true });
  },
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const [, kind, targetId, rawPage, requesterId] = interaction.customId.split(':');
    if (kind !== 'page') return;
    if (!(await guardViewComponent(interaction))) return;
    if (interaction.user.id !== requesterId) return interaction.deferUpdate();
    const target = await interaction.client.users.fetch(targetId).catch(() => null);
    if (!target) return interaction.deferUpdate();
    return interaction.update(buildInfoPayload(target, Number.parseInt(rawPage, 10) || 0, requesterId));
  },
};

const filelist = {
  name: 'filelist',
  description: 'Liste les notes du dossier d’un membre (id, auteur, date, serveur)',
  usage: 'filelist <utilisateur>',
  examples: ['filelist @Membre'],
  aliases: [],
  cooldown: 3,
  args: [{ name: 'utilisateur', type: 'user', required: true, description: 'L’utilisateur concerné' }],
  async execute(ctx) {
    if (!canViewFiles(ctx.member)) return ctx.reply({ embeds: [errorEmbed(t('memberFiles.noPermission.view'))], ephemeral: true });
    await memberFileService.logConsultation(ctx.guild, ctx.options.utilisateur, ctx.user);
    return ctx.reply({ ...buildListPayload(ctx.options.utilisateur, 0, ctx.user.id), ephemeral: true });
  },
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const [, kind, targetId, rawPage, requesterId] = interaction.customId.split(':');
    if (kind !== 'page') return;
    if (!(await guardViewComponent(interaction))) return;
    if (interaction.user.id !== requesterId) return interaction.deferUpdate();
    const target = await interaction.client.users.fetch(targetId).catch(() => null);
    if (!target) return interaction.deferUpdate();
    return interaction.update(buildListPayload(target, Number.parseInt(rawPage, 10) || 0, requesterId));
  },
};

const filedelete = {
  name: 'filedelete',
  description: 'Supprime une note d’un dossier (avec confirmation)',
  usage: 'filedelete <identifiant>',
  examples: ['filedelete a1b2c3d4'],
  aliases: ['fileremove'],
  cooldown: 3,
  args: [{ name: 'identifiant', type: 'string', required: true, description: 'L’identifiant de la note' }],
  async execute(ctx) {
    const found = memberFileService.findNote(ctx.options.identifiant.toLowerCase());
    if (!found) return ctx.reply({ embeds: [errorEmbed(t('memberFiles.notFound', { id: ctx.options.identifiant }))], ephemeral: true });
    if (!canDeleteNote(ctx.member, found.note)) return ctx.reply({ embeds: [errorEmbed(t('memberFiles.noPermission.delete'))], ephemeral: true });

    const embed = infoEmbed(t('memberFiles.delete.title'), t('memberFiles.delete.confirm', { id: found.note.id, content: found.note.content.slice(0, 500) }));
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`filedelete:confirm:${found.note.id}:${ctx.user.id}`).setLabel(t('memberFiles.delete.confirmButton')).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`filedelete:cancel:${found.note.id}:${ctx.user.id}`).setLabel(t('memberFiles.delete.cancelButton')).setStyle(ButtonStyle.Secondary),
    );
    return ctx.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const [, kind, noteId, requesterId] = interaction.customId.split(':');
    if (!['confirm', 'cancel'].includes(kind)) return;
    if (interaction.user.id !== requesterId) {
      return interaction.reply({ embeds: [errorEmbed(t('memberFiles.notYourSession'))], flags: MessageFlags.Ephemeral });
    }
    if (kind === 'cancel') {
      return interaction.update({ embeds: [infoEmbed(t('memberFiles.delete.title'), t('memberFiles.delete.cancelled'))], components: [] });
    }
    // Re-vérifie l'existence et la permission au moment de la confirmation.
    const found = memberFileService.findNote(noteId);
    if (!found) return interaction.update({ embeds: [errorEmbed(t('memberFiles.notFound', { id: noteId }))], components: [] });
    if (!canDeleteNote(interaction.member, found.note)) {
      return interaction.update({ embeds: [errorEmbed(t('memberFiles.noPermission.delete'))], components: [] });
    }
    await memberFileService.deleteNote(interaction.guild, noteId, interaction.user);
    return interaction.update({ embeds: [successEmbed(t('memberFiles.delete.done', { id: noteId }))], components: [] });
  },
};

module.exports = [file, fileinfo, filelist, filedelete];
