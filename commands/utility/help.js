/**
 * Commande help : liste des commandes par catégorie, ou détail d'une commande
 * (utilisation, alias, exemples, permissions requises).
 * Construite dynamiquement depuis les commandes chargées : elle reste à jour
 * automatiquement quand une commande est ajoutée.
 */
const config = require('../../config/config');
const permissionsConfig = require('../../config/permissions');
const ownerService = require('../../services/owners/ownerService');
const categories = require('../../utils/constants/categories');
const permissionLabels = require('../../utils/constants/permissionLabels');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');
const { PermissionsBitField } = require('discord.js');

function commandDetailEmbed(command) {
  const userPerms = permissionsConfig[command.name]?.user ?? [];
  const permNames = new PermissionsBitField(userPerms)
    .toArray()
    .map((name) => permissionLabels[name] ?? name);
  if (command.ownerOnly) permNames.unshift(t('help.ownerOnly'));

  const embed = infoEmbed(`${config.prefix}${command.name}`, command.description).addFields(
    { name: t('help.usage'), value: `\`${config.prefix}${command.usage}\` ou \`/${command.name}\`` },
    {
      name: t('help.aliases'),
      value: command.aliases?.length ? command.aliases.map((a) => `\`${a}\``).join(', ') : t('help.none'),
      inline: true,
    },
    {
      name: t('help.permissions'),
      value: permNames.length ? permNames.join(', ') : t('help.none'),
      inline: true,
    },
  );
  if (command.examples?.length) {
    embed.addFields({
      name: t('help.examples'),
      value: command.examples.map((e) => `\`${config.prefix}${e}\``).join('\n'),
    });
  }
  return embed;
}

function commandListEmbed(ctx) {
  const embed = infoEmbed(
    t('help.title', { bot: ctx.client.user.username }),
    t('help.description', { prefix: config.prefix }),
  );

  const grouped = new Map();
  for (const command of ctx.client.commands.values()) {
    // Les commandes réservées aux owners du bot ne sont listées qu'aux owners.
    if (command.ownerOnly && !ownerService.isOwner(ctx.user.id)) continue;
    if (!grouped.has(command.category)) grouped.set(command.category, []);
    grouped.get(command.category).push(command.name);
  }

  for (const [category, names] of grouped) {
    const meta = categories[category] ?? { label: category, emoji: '📁' };
    embed.addFields({
      name: `${meta.emoji} ${meta.label}`,
      value: names.sort().map((n) => `\`${n}\``).join(' • '),
    });
  }
  return embed;
}

module.exports = {
  name: 'help',
  description: "Affiche la liste des commandes ou l'aide d'une commande",
  usage: 'help [commande]',
  examples: ['help', 'help ban'],
  aliases: ['aide'],
  cooldown: 3,
  args: [
    { name: 'commande', type: 'string', required: false, description: 'La commande dont afficher le détail' },
  ],
  async execute(ctx) {
    const name = ctx.options.commande?.toLowerCase();
    if (!name) {
      return ctx.reply({ embeds: [commandListEmbed(ctx)] });
    }

    const command =
      ctx.client.commands.get(name) ?? ctx.client.commands.get(ctx.client.commandAliases.get(name));
    if (!command) {
      return ctx.reply({
        embeds: [errorEmbed(t('help.unknownCommand', { command: name }))],
        ephemeral: true,
      });
    }
    return ctx.reply({ embeds: [commandDetailEmbed(command)] });
  },
};
