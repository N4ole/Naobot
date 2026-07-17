/**
 * Commandes antispam / antilink / antibot (même famille, même fichier) :
 * activation/désactivation d'une protection sur le serveur. La logique
 * (persistance, logs) vit dans services/protections/protectionService.
 * L'accès est réservé via config/permissions.js (Gérer le serveur).
 */
const config = require('../../config/config');
const protectionService = require('../../services/protections/protectionService');
const protectionTypes = require('../../utils/constants/protectionTypes');
const { successEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const ON = new Set(['on', 'activer', 'enable', 'true', 'oui']);
const OFF = new Set(['off', 'desactiver', 'disable', 'false', 'non']);

/** Fabrique une commande de bascule pour un type de protection donné. */
function makeToggle(type) {
  const def = protectionTypes[type];
  return {
    name: type,
    description: `Active ou désactive la protection ${def.label} du serveur`,
    usage: `${type} <on|off>`,
    examples: [`${type} on`, `${type} off`],
    aliases: [],
    cooldown: 3,
    args: [
      { name: 'etat', type: 'string', required: true, choices: ['on', 'off'], description: 'on : activer ; off : désactiver' },
    ],
    async execute(ctx) {
      const raw = ctx.options.etat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let enabled;
      if (ON.has(raw)) enabled = true;
      else if (OFF.has(raw)) enabled = false;
      else {
        return ctx.reply({
          embeds: [errorEmbed(t('errors.invalidArgs', { usage: `${config.prefix}${type} <on|off>` }))],
          ephemeral: true,
        });
      }

      protectionService.setEnabled(ctx.guild.id, type, enabled, ctx.user.id);
      await protectionService.logProtection(ctx.guild, enabled ? 'enabled' : 'disabled', {
        color: enabled ? protectionService.COLORS.LOG_CREATE : protectionService.COLORS.LOG_DELETE,
        user: ctx.user,
        fields: [{ name: t('protections.field.protection'), value: `${def.emoji} ${def.label}`, inline: true }],
      });
      return ctx.reply({
        embeds: [
          successEmbed(
            t(enabled ? 'protections.command.enabled' : 'protections.command.disabled', { protection: `${def.emoji} ${def.label}` }),
          ),
        ],
      });
    },
  };
}

module.exports = Object.keys(protectionTypes).map(makeToggle);
