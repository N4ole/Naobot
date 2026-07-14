/**
 * Commandes addowner / rmowner (même famille, même fichier).
 * Gestion des owners secondaires du bot — réservées aux owners.
 * La logique métier (validation, persistance, rôle décoratif) vit dans
 * services/owners/ownerService.
 */
const ownerService = require('../../services/owners/ownerService');
const { successEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const ADD_ERROR_KEYS = {
  primary: 'owners.errors.primaryAdd',
  duplicate: 'owners.errors.duplicate',
};

const REMOVE_ERROR_KEYS = {
  primary: 'owners.errors.primaryRemove',
  notOwner: 'owners.errors.notInList',
  last: 'owners.errors.lastOwner',
};

const addowner = {
  name: 'addowner',
  ownerOnly: true,
  description: 'Ajoute un owner du bot (réservé aux owners)',
  usage: 'addowner <utilisateur>',
  examples: ['addowner @Utilisateur', 'addowner 123456789012345678'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'utilisateur', type: 'user', required: true, description: "L'utilisateur à promouvoir owner du bot" },
  ],
  async execute(ctx) {
    const user = ctx.options.utilisateur;
    const result = ownerService.addOwner(user.id);
    if (!result.ok) {
      return ctx.reply({
        embeds: [errorEmbed(t(ADD_ERROR_KEYS[result.code], { user: user.tag }))],
        ephemeral: true,
      });
    }

    // Attribution du rôle décoratif sur tous les serveurs où il est présent.
    await ctx.defer();
    await ownerService.assignRoleEverywhere(ctx.client, user.id);
    return ctx.reply({ embeds: [successEmbed(t('owners.add.success', { user: user.tag }))] });
  },
};

const rmowner = {
  name: 'rmowner',
  ownerOnly: true,
  description: 'Retire un owner du bot (réservé aux owners)',
  usage: 'rmowner <utilisateur>',
  examples: ['rmowner @Utilisateur', 'rmowner 123456789012345678'],
  aliases: ['removeowner'],
  cooldown: 3,
  args: [
    { name: 'utilisateur', type: 'user', required: true, description: "L'owner à retirer" },
  ],
  async execute(ctx) {
    const user = ctx.options.utilisateur;
    const result = ownerService.removeOwner(user.id);
    if (!result.ok) {
      return ctx.reply({
        embeds: [errorEmbed(t(REMOVE_ERROR_KEYS[result.code], { user: user.tag }))],
        ephemeral: true,
      });
    }

    await ctx.defer();
    await ownerService.removeRoleEverywhere(ctx.client, user.id);
    return ctx.reply({ embeds: [successEmbed(t('owners.remove.success', { user: user.tag }))] });
  },
};

module.exports = [addowner, rmowner];
