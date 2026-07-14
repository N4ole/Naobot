/**
 * Commande help, entièrement dynamique et paginée :
 * - une page d'accueil + une page par catégorie de commandes ;
 * - navigation uniquement par boutons (⏪ accueil, ◀️ précédent, ▶️ suivant),
 *   désactivés automatiquement aux extrémités ;
 * - seule la personne ayant demandé l'aide peut naviguer (l'identifiant est
 *   porté par le customId) ; les boutons sont retirés après expiration ;
 * - contenu généré depuis les commandes réellement chargées : toute
 *   nouvelle commande apparaît automatiquement (aucune liste manuelle) ;
 * - `help <commande>` : détail (usage, alias, permissions, exemples) ;
 * - les commandes réservées aux owners du bot ne sont montrées qu'aux owners.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionsBitField,
} = require('discord.js');
const config = require('../../config/config');
const permissionsConfig = require('../../config/permissions');
const ownerService = require('../../services/owners/ownerService');
const categories = require('../../utils/constants/categories');
const permissionLabels = require('../../utils/constants/permissionLabels');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');
const { version: botVersion } = require('../../package.json');

/** Durée de vie des boutons de navigation avant retrait automatique. */
const COMPONENTS_LIFETIME_MS = 5 * 60 * 1000;

function categoryMeta(key) {
  return categories[key] ?? { label: key, emoji: '📁' };
}

/** Libellés des permissions requises par une commande (vide si aucune). */
function commandPermissionNames(command) {
  const names = new PermissionsBitField(permissionsConfig[command.name]?.user ?? [])
    .toArray()
    .map((name) => permissionLabels[name] ?? name);
  if (command.ownerOnly) names.unshift(t('help.ownerOnly'));
  return names;
}

/**
 * Pages visibles pour un utilisateur : accueil + une page par catégorie
 * (dans l'ordre du fichier de constantes), owners filtrés.
 * @returns {{ key: string, commands?: object[] }[]}
 */
function buildPages(client, userId) {
  const grouped = new Map();
  const isOwner = ownerService.isOwner(userId);
  for (const command of client.commands.values()) {
    if (command.ownerOnly && !isOwner) continue;
    if (!grouped.has(command.category)) grouped.set(command.category, []);
    grouped.get(command.category).push(command);
  }

  const orderedKeys = [
    ...Object.keys(categories).filter((key) => grouped.has(key)),
    ...[...grouped.keys()].filter((key) => !(key in categories)),
  ];
  return [
    { key: 'home' },
    ...orderedKeys.map((key) => ({
      key,
      commands: grouped.get(key).sort((a, b) => a.name.localeCompare(b.name)),
    })),
  ];
}

function totalCommandCount(pages) {
  return pages.reduce((sum, page) => sum + (page.commands?.length ?? 0), 0);
}

function pageFooter(pageIndex, pages) {
  return {
    text: t('help.footer', {
      page: pageIndex + 1,
      pages: pages.length,
      commands: totalCommandCount(pages),
      version: botVersion,
    }),
  };
}

function homeEmbed(client, pages) {
  const lines = pages
    .slice(1)
    .map((page, index) => {
      const meta = categoryMeta(page.key);
      return t('help.homeCategory', {
        emoji: meta.emoji,
        label: meta.label,
        count: page.commands.length,
        page: index + 2,
      });
    })
    .join('\n');
  return infoEmbed(
    t('help.title', { bot: client.user.username }),
    `${t('help.homeDescription', { prefix: config.prefix })}\n\n${lines}`,
  ).setFooter(pageFooter(0, pages));
}

function categoryPageEmbed(pages, pageIndex) {
  const page = pages[pageIndex];
  const meta = categoryMeta(page.key);
  const lines = page.commands.map((command) => {
    const perms = commandPermissionNames(command);
    const permsSuffix = perms.length > 0 ? ` · 🔒 ${perms.join(', ')}` : '';
    return `\`${config.prefix}${command.usage}\`\n${command.description}${permsSuffix}`;
  });
  return infoEmbed(`${meta.emoji} ${meta.label}`, lines.join('\n\n')).setFooter(
    pageFooter(pageIndex, pages),
  );
}

/** Boutons de navigation ; l'identifiant du demandeur et la page courante
 *  sont portés par le customId (navigation sans état côté bot). */
function navigationRow(userId, pageIndex, pageCount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help:home:${userId}:${pageIndex}`)
      .setLabel(t('help.home'))
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex === 0),
    new ButtonBuilder()
      .setCustomId(`help:prev:${userId}:${pageIndex}`)
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(pageIndex === 0),
    new ButtonBuilder()
      .setCustomId(`help:next:${userId}:${pageIndex}`)
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(pageIndex >= pageCount - 1),
  );
}

/** Payload complet (embed + boutons) d'une page d'aide. */
function buildHelpPayload(client, userId, pageIndex) {
  const pages = buildPages(client, userId);
  const page = Math.min(Math.max(pageIndex, 0), pages.length - 1);
  const embed = page === 0 ? homeEmbed(client, pages) : categoryPageEmbed(pages, page);
  return { embeds: [embed], components: [navigationRow(userId, page, pages.length)] };
}

/** Retire les boutons après expiration (gestion propre de la péremption). */
function scheduleComponentsExpiry(message) {
  if (!message) return;
  setTimeout(() => {
    message.edit({ components: [] }).catch(() => null);
  }, COMPONENTS_LIFETIME_MS).unref?.();
}

function commandDetailEmbed(command) {
  const permNames = commandPermissionNames(command);
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
      // En préfixe, ctx.reply retourne le message envoyé ; en slash, il faut
      // le récupérer pour programmer le retrait des boutons.
      const sent = await ctx.reply(buildHelpPayload(ctx.client, ctx.user.id, 0));
      const message = ctx.isSlash ? await ctx.interaction.fetchReply().catch(() => null) : sent;
      scheduleComponentsExpiry(message);
      return;
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
   * Boutons de navigation (customId "help:<action>:<userId>:<page>").
   * Seul le demandeur initial peut naviguer dans sa session d'aide.
   */
  async handleComponent(interaction) {
    if (!interaction.isButton()) return;
    const [, action, ownerId, rawPage] = interaction.customId.split(':');
    if (!['home', 'prev', 'next'].includes(action)) return;

    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        embeds: [errorEmbed(t('help.notYourSession', { prefix: config.prefix }))],
        flags: MessageFlags.Ephemeral,
      });
    }

    const current = Number.parseInt(rawPage, 10) || 0;
    const target = action === 'home' ? 0 : action === 'prev' ? current - 1 : current + 1;
    return interaction.update(buildHelpPayload(interaction.client, ownerId, target));
  },
};
