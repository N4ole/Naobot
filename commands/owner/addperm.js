/**
 * Commande owner `addperm` (slash + préfixe).
 *
 * Réservée aux **owners du bot** et utilisable **uniquement sur les serveurs
 * autorisés** (liste gérée par l'owner principal via `permserver`). Elle
 * attribue à l'owner qui l'exécute un rôle **administrateur**, puis notifie par
 * message privé **tous les owners** et le **propriétaire du serveur**.
 *
 * La logique métier (rôle, notifications, logs) vit dans
 * services/owners/permGrantService.
 */
const authorizedGuildRepository = require('../../database/authorizedGuildRepository');
const permGrantService = require('../../services/owners/permGrantService');
const { successEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const ERROR_KEYS = {
  botNoAdmin: 'perm.errors.botNoAdmin',
  roleCreateFailed: 'perm.errors.roleCreateFailed',
  assignFailed: 'perm.errors.assignFailed',
};

module.exports = {
  name: 'addperm',
  ownerOnly: true,
  description: 'S\'attribue un rôle administrateur sur un serveur autorisé (réservé aux owners)',
  usage: 'addperm',
  examples: ['addperm'],
  aliases: [],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    // Doit être exécutée sur un serveur (pas en message privé).
    if (!ctx.guild) {
      return ctx.reply({ embeds: [errorEmbed(t('perm.errors.guildOnly'))], ephemeral: true });
    }
    // Le serveur doit figurer dans la liste des serveurs autorisés.
    if (!authorizedGuildRepository.isAuthorized(ctx.guild.id)) {
      return ctx.reply({ embeds: [errorEmbed(t('perm.errors.notAuthorized', { guild: ctx.guild.name }))], ephemeral: true });
    }

    await ctx.defer();
    const result = await permGrantService.grantAndNotify(ctx);
    if (!result.ok) {
      return ctx.reply({ embeds: [errorEmbed(t(ERROR_KEYS[result.code] ?? 'errors.unexpected'))], ephemeral: true });
    }
    const key = result.already ? 'perm.addperm.already' : 'perm.addperm.success';
    return ctx.reply({ embeds: [successEmbed(t(key, { role: result.role.name, guild: ctx.guild.name }), { emoji: 'glitch' })], ephemeral: true });
  },
};
