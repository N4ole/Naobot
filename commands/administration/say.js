/**
 * Commande say : fait relayer un message par le bot dans le salon courant.
 *
 * Réservée aux **administrateurs**, au **propriétaire du serveur** et aux
 * **owners du bot** (contrôle dans la commande — indépendant des permissions
 * Discord pour les owners). Le message d'origine est supprimé lorsque c'est
 * possible, puis republié par le bot.
 *
 * Prise en charge : texte, mentions, emojis, liens, images et fichiers joints
 * (en préfixe). Sécurité : les mentions @everyone / @here sont neutralisées
 * (anti-abus), le bot parle en son nom (pas d'usurpation), et chaque usage est
 * journalisé (auteur, salon, contenu, date) dans la catégorie « moderation ».
 */
const { PermissionFlagsBits } = require('discord.js');
const ownerService = require('../../services/owners/ownerService');
const logService = require('../../services/logs/logService');
const { successEmbed, errorEmbed, logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

/** Admin du serveur, propriétaire du serveur, ou owner du bot. */
function canUseSay(member) {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.id === member.guild.ownerId ||
    ownerService.isOwner(member.id)
  );
}

module.exports = {
  name: 'say',
  description: 'Fait relayer un message par le bot (admin / propriétaire / owner)',
  usage: 'say <message>',
  examples: ['say Bienvenue à tous !', 'say Pensez à lire le règlement 📜'],
  aliases: [],
  cooldown: 5,
  args: [
    { name: 'message', type: 'string', required: false, rest: true, description: 'Le message à relayer' },
  ],
  async execute(ctx) {
    if (!canUseSay(ctx.member)) {
      return ctx.reply({ embeds: [errorEmbed(t('say.noPermission'))], ephemeral: true });
    }

    const text = (ctx.options.message ?? '').slice(0, 2000);
    // Pièces jointes (uniquement disponibles en préfixe).
    const attachments = ctx.message ? [...ctx.message.attachments.values()] : [];
    if (!text && attachments.length === 0) {
      return ctx.reply({ embeds: [errorEmbed(t('say.empty'))], ephemeral: true });
    }

    const payload = {
      content: text || undefined,
      files: attachments.map((attachment) => attachment.url),
      // Anti-abus : mentions d'utilisateurs et de rôles autorisées, jamais
      // @everyone / @here.
      allowedMentions: { parse: ['users', 'roles'] },
    };

    // Supprime la commande d'origine (préfixe) lorsque c'est possible.
    if (ctx.message) await ctx.message.delete().catch(() => null);

    await ctx.channel.send(payload).catch(() => null);

    // Journalisation (auteur, salon, contenu, date via l'horodatage de l'embed).
    await logService.log(
      ctx.guild,
      'moderation',
      logEventEmbed({
        title: t('say.logTitle'),
        color: COLORS.LOG_NEUTRAL,
        user: ctx.user,
        fields: [
          { name: t('common.channel'), value: `${ctx.channel}`, inline: true },
          { name: t('say.logContent'), value: (text || t('say.noContent')).slice(0, 1024) },
          ...(attachments.length ? [{ name: t('say.attachments'), value: String(attachments.length), inline: true }] : []),
        ],
      }),
    );

    // En slash, confirmer discrètement (le message d'origine n'existe pas).
    if (ctx.isSlash) return ctx.reply({ embeds: [successEmbed(t('say.sent'))], ephemeral: true });
    return undefined;
  },
};
