/**
 * Commande help, entièrement dynamique :
 * - construite depuis les commandes réellement chargées (client.commands) —
 *   toute nouvelle commande apparaît automatiquement ;
 * - navigation par menu déroulant entre les catégories ;
 * - `help <commande>` : détail (usage, alias, permissions, exemples) ;
 * - les commandes réservées aux owners du bot ne sont montrées qu'aux owners.
 */
const {
  ActionRowBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder,
} = require('discord.js');
const config = require('../../config/config');
const permissionsConfig = require('../../config/permissions');
const ownerService = require('../../services/owners/ownerService');
const categories = require('../../utils/constants/categories');
const permissionLabels = require('../../utils/constants/permissionLabels');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

/** Commandes visibles pour un utilisateur, groupées par catégorie. */
function groupedCommands(client, userId) {
  const grouped = new Map();
  const isOwner = ownerService.isOwner(userId);
  for (const command of client.commands.values()) {
    if (command.ownerOnly && !isOwner) continue;
    if (!grouped.has(command.category)) grouped.set(command.category, []);
    grouped.get(command.category).push(command);
  }
  return grouped;
}

function categoryMeta(key) {
  return categories[key] ?? { label: key, emoji: '📁' };
}

/** Menu déroulant de navigation entre les catégories visibles. */
function categoryMenuRow(client, userId, selectedKey = null) {
  const options = [...groupedCommands(client, userId).keys()].map((key) => {
    const meta = categoryMeta(key);
    return {
      label: meta.label,
      value: key,
      emoji: meta.emoji,
      default: key === selectedKey,
    };
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId('help:category')
    .setPlaceholder(t('help.menuPlaceholder'))
    .addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

/** Page d'accueil : catégories et nombre de commandes. */
function overviewEmbed(client, userId) {
  const embed = infoEmbed(
    t('help.title', { bot: client.user.username }),
    t('help.description', { prefix: config.prefix }),
  );
  for (const [key, commands] of groupedCommands(client, userId)) {
    const meta = categoryMeta(key);
    embed.addFields({
      name: `${meta.emoji} ${meta.label} (${commands.length})`,
      value: commands
        .map((command) => command.name)
        .sort()
        .map((name) => `\`${name}\``)
        .join(' • '),
    });
  }
  return embed;
}

/** Page d'une catégorie : chaque commande avec sa description. */
function categoryEmbed(client, userId, categoryKey) {
  const commands = groupedCommands(client, userId).get(categoryKey) ?? [];
  const meta = categoryMeta(categoryKey);
  const lines = commands
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((command) => `\`${config.prefix}${command.usage}\`\n${command.description}`);
  return infoEmbed(
    `${meta.emoji} ${meta.label}`,
    lines.join('\n\n') || t('help.none'),
  ).setFooter({ text: t('help.categoryFooter', { prefix: config.prefix }) });
}

/** Détail d'une commande : usage, alias, permissions, exemples. */
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
      return ctx.reply({
        embeds: [overviewEmbed(ctx.client, ctx.user.id)],
        components: [categoryMenuRow(ctx.client, ctx.user.id)],
      });
    }

    const command =
      ctx.client.commands.get(name) ?? ctx.client.commands.get(ctx.client.commandAliases.get(name));
    if (!command || (command.ownerOnly && !ownerService.isOwner(ctx.user.id))) {
      return ctx.reply({
        embeds: [errorEmbed(t('help.unknownCommand', { command: name }))],
        ephemeral: true,
      });
    }
    return ctx.reply({ embeds: [commandDetailEmbed(command)] });
  },

  /**
   * Menu de navigation (customId "help:category") : affiche la catégorie
   * choisie. Le filtrage owner s'applique à l'utilisateur qui clique.
   */
  async handleComponent(interaction) {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'help:category') return;

    const categoryKey = interaction.values[0];
    const { client, user } = interaction;
    if (!groupedCommands(client, user.id).has(categoryKey)) return interaction.deferUpdate();

    return interaction.update({
      embeds: [categoryEmbed(client, user.id, categoryKey)],
      components: [categoryMenuRow(client, user.id, categoryKey)],
    });
  },
};
