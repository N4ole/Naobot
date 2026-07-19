/**
 * Commandes prefix / setprefix (même famille, même fichier).
 *
 * - `prefix` : affiche le préfixe actuel, le préfixe par défaut, l'auteur et la
 *   date de la dernière modification.
 * - `setprefix <nouveau>` : change le préfixe du serveur courant (validé,
 *   persistant, pris en compte immédiatement) ; `setprefix reset` restaure le
 *   préfixe par défaut.
 *
 * Accès : administrateurs, propriétaire du serveur ou owners du bot (contrôlé
 * dans la commande — indépendant des permissions Discord pour les owners). La
 * logique métier vit dans services/prefix/prefixService.
 */
const { PermissionFlagsBits } = require('discord.js');
const ownerService = require('../../services/owners/ownerService');
const prefixService = require('../../services/prefix/prefixService');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const RESET = new Set(['reset', 'default', 'defaut', 'reinitialiser', 'par-defaut']);

/** Admin du serveur, propriétaire du serveur, ou owner du bot. */
function canManagePrefix(member) {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.id === member.guild.ownerId ||
    ownerService.isOwner(member.id)
  );
}

function normalize(input) {
  return (input ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Embed d'affichage de l'état du préfixe. */
function prefixEmbed(guild) {
  const conf = prefixService.getConfig(guild.id);
  return infoEmbed(t('prefix.command.title', { guild: guild.name }), null).addFields(
    { name: t('prefix.command.current'), value: `\`${conf.prefix}\``, inline: true },
    { name: t('prefix.command.default'), value: `\`${conf.default}\``, inline: true },
    {
      name: t('prefix.command.lastModified'),
      value: conf.updatedAt ? `<t:${Math.floor(Date.parse(conf.updatedAt) / 1000)}:f>` : t('prefix.command.never'),
      inline: false,
    },
    { name: t('prefix.command.lastModifiedBy'), value: conf.updatedBy ? `<@${conf.updatedBy}>` : t('help.none'), inline: true },
  );
}

const prefix = {
  name: 'prefix',
  description: 'Affiche le préfixe des commandes textuelles du serveur',
  usage: 'prefix',
  examples: ['prefix'],
  aliases: ['prefixe'],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    return ctx.reply({ embeds: [prefixEmbed(ctx.guild)] });
  },
};

const setprefix = {
  name: 'setprefix',
  description: 'Change le préfixe des commandes textuelles du serveur (ou reset)',
  usage: 'setprefix <nouveau|reset>',
  examples: ['setprefix ?', 'setprefix nao!', 'setprefix reset'],
  aliases: ['changeprefix'],
  cooldown: 3,
  args: [{ name: 'nouveau', type: 'string', required: true, description: 'Le nouveau préfixe, ou « reset » pour revenir au défaut' }],
  async execute(ctx) {
    if (!canManagePrefix(ctx.member)) {
      return ctx.reply({ embeds: [errorEmbed(t('prefix.noPermission'))], ephemeral: true });
    }

    const raw = ctx.options.nouveau;
    if (RESET.has(normalize(raw))) {
      const { prefix: value } = await prefixService.resetPrefix(ctx.guild, ctx.user);
      return ctx.reply({ embeds: [successEmbed(t('prefix.command.reset', { prefix: value })), prefixEmbed(ctx.guild)] });
    }

    const result = await prefixService.setPrefix(ctx.guild, raw, ctx.user);
    if (!result.ok) {
      return ctx.reply({
        embeds: [errorEmbed(t(`prefix.error.${result.code}`, { max: prefixService.MAX_LENGTH }))],
        ephemeral: true,
      });
    }
    return ctx.reply({
      embeds: [successEmbed(t('prefix.command.changed', { before: result.before, after: result.prefix })), prefixEmbed(ctx.guild)],
    });
  },
};

module.exports = [prefix, setprefix];
