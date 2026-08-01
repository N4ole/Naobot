/**
 * Commande help, entièrement dynamique, pilotée par un menu déroulant.
 *
 * - Embed principal : nom du bot, description, nombre de serveurs, nombre de
 *   commandes et quelques statistiques utiles.
 * - Sous l'embed, un **menu déroulant** (String Select Menu) permet de choisir
 *   une catégorie ; sa sélection met à jour l'embed (commandes, description,
 *   permissions requises, exemples).
 * - Les longues catégories sont **paginées** (boutons ◀️/▶️ sous le menu).
 * - Contenu généré depuis les commandes réellement chargées : toute nouvelle
 *   commande (et toute nouvelle catégorie = dossier) apparaît automatiquement.
 * - Seule la personne ayant demandé l'aide peut naviguer (identifiant porté par
 *   le customId) ; les composants sont retirés après expiration.
 * - `help <commande>` : détail (usage, alias, permissions, exemples).
 * - Les commandes réservées aux owners ne sont montrées qu'aux owners.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  PermissionsBitField,
} = require('discord.js');
const permissionsConfig = require('../../config/permissions');
const ownerService = require('../../services/owners/ownerService');
const prefixService = require('../../services/prefix/prefixService');
const categories = require('../../utils/constants/categories');
const categoryEmojis = require('../../config/categoryEmojis');
const permissionLabels = require('../../utils/constants/permissionLabels');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');
const { version: botVersion } = require('../../package.json');

/** Durée de vie des composants avant retrait automatique. */
const COMPONENTS_LIFETIME_MS = 5 * 60 * 1000;
/** Nombre de commandes affichées par page d'une catégorie. */
const PAGE_SIZE = 8;

function categoryMeta(key) {
  return categories[key] ?? { label: key, emoji: '📁' };
}

/**
 * Émoji **logo** d'une catégorie — toujours un émoji Discord standard (Unicode),
 * jamais un émoji personnalisé (règle de marque). Source : `config/categoryEmojis.js`,
 * avec repli sur l'émoji de `categories.js`. Le même Unicode sert pour le texte
 * et pour les composants (les émojis Unicode sont des `setEmoji` valides).
 */
function categoryEmoji(key) {
  return categoryEmojis[key] ?? categoryMeta(key).emoji;
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
 * Permissions dont le **bot** a besoin : celles exigées pour exécuter la
 * commande, et celles dont la **fonctionnalité** aura besoin plus tard
 * (attribution d'un rôle au level-up, expulsion au captcha, suppression d'un
 * message par une protection…).
 *
 * Ces dernières ne bloquent aucune commande — mais un administrateur doit
 * savoir ce qu'il devra accorder pour que la fonctionnalité opère réellement.
 */
function botPermissionNames(command) {
  const required = permissionsConfig[command.name]?.bot ?? [];
  const feature = permissionsConfig.FEATURE_PERMISSIONS?.[command.name] ?? [];
  const label = (bits) => new PermissionsBitField(bits).toArray().map((name) => permissionLabels[name] ?? name);
  return { required: label(required), feature: label(feature.filter((bit) => !required.includes(bit))) };
}

/**
 * Catégories visibles pour un utilisateur (owners filtrés), dans l'ordre du
 * fichier de constantes puis les dossiers non listés.
 * @returns {{ key: string, commands: object[] }[]}
 */
function buildCategories(client, userId) {
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
  return orderedKeys.map((key) => ({
    key,
    commands: grouped.get(key).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

function totalCommandCount(cats) {
  return cats.reduce((sum, cat) => sum + cat.commands.length, 0);
}

/** Embed d'accueil : identité du bot + statistiques utiles. */
function homeEmbed(client, cats, prefix) {
  const commands = totalCommandCount(cats);
  const lines = cats.map((cat) => {
    const meta = categoryMeta(cat.key);
    return t('help.homeCategory', { emoji: categoryEmoji(cat.key), label: meta.label, count: cat.commands.length });
  });
  const embed = infoEmbed(
    `📖 ${t('help.title', { bot: client.user.username })}`,
    `${t('help.mainDescription', { prefix })}\n\n${lines.join('\n')}`,
  ).addFields(
    { name: t('help.stats.servers'), value: String(client.guilds.cache.size), inline: true },
    { name: t('help.stats.commands'), value: String(commands), inline: true },
    { name: t('help.stats.categories'), value: String(cats.length), inline: true },
  );
  embed.setFooter({ text: t('help.mainFooter', { version: botVersion }) });
  if (client.user.displayAvatarURL) embed.setThumbnail(client.user.displayAvatarURL());
  return embed;
}

/** Embed d'une catégorie (page donnée) : commandes détaillées. */
function categoryEmbed(cat, page, pageCount, prefix) {
  const meta = categoryMeta(cat.key);
  const slice = cat.commands.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const blocks = slice.map((command) => {
    const perms = commandPermissionNames(command);
    const parts = [`**\`${prefix}${command.usage}\`**`, command.description];
    if (perms.length > 0) parts.push(`🔒 ${t('help.permissions')} : ${perms.join(', ')}`);
    if (command.examples?.length) parts.push(`💡 ${command.examples.map((e) => `\`${prefix}${e}\``).join(' · ')}`);
    return parts.join('\n');
  });
  return infoEmbed(`${categoryEmoji(cat.key)} ${meta.label}`, blocks.join('\n\n')).setFooter({
    text: t('help.categoryFooter', { page: page + 1, pages: pageCount, count: cat.commands.length }),
  });
}

/** Nombre maximal d'options par menu déroulant (limite Discord). */
const SELECT_MAX_OPTIONS = 25;
/**
 * Nombre maximal de menus déroulants de catégories. Un message accepte 5 lignes
 * de composants ; on en réserve une pour la pagination → 4 menus = jusqu'à
 * 100 catégories. Au-delà (improbable), les dernières seraient masquées.
 */
const SELECT_MAX_MENUS = 4;

/**
 * Lignes des menus déroulants de catégories. Comme un menu Discord est limité à
 * 25 options et qu'il peut y avoir davantage de catégories (l'accueil + toutes
 * les catégories), les options sont **réparties sur plusieurs menus** pour que
 * **toutes** les catégories restent accessibles (correctif : les dernières
 * catégories — utilitaire, fun, owner — n'étaient plus atteignables).
 * @returns {ActionRowBuilder[]}
 */
function selectRows(userId, cats, selectedKey) {
  const options = [
    { label: t('help.home'), value: 'home', emoji: '🏠', description: t('help.homeOptionDescription').slice(0, 100), default: !selectedKey },
    ...cats.map((cat) => ({
      label: categoryMeta(cat.key).label,
      value: cat.key,
      emoji: categoryEmoji(cat.key),
      description: t('help.categoryOption', { count: cat.commands.length }).slice(0, 100),
      default: cat.key === selectedKey,
    })),
  ];

  const rows = [];
  for (let i = 0; i < options.length && rows.length < SELECT_MAX_MENUS; i += SELECT_MAX_OPTIONS) {
    const chunk = options.slice(i, i + SELECT_MAX_OPTIONS);
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`help:cat:${userId}:${rows.length}`)
      .setPlaceholder(t('help.selectPlaceholder'))
      .addOptions(chunk);
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  return rows;
}

/** Ligne de pagination (affichée uniquement pour les longues catégories). */
function navRow(userId, catKey, page, pageCount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help:page:${userId}:${catKey}:${page - 1}`)
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`help:page:${userId}:${catKey}:${page + 1}`)
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= pageCount - 1),
  );
}

/**
 * Payload complet (embed + composants) de l'aide.
 * @param {?string} catKey  null → accueil ; sinon la catégorie affichée
 * @param {number} page     page courante de la catégorie
 */
function buildHelpPayload(client, userId, prefix, catKey = null, page = 0) {
  const cats = buildCategories(client, userId);
  const selected = catKey && cats.find((cat) => cat.key === catKey);

  if (!selected) {
    return { embeds: [homeEmbed(client, cats, prefix)], components: selectRows(userId, cats, null) };
  }

  const pageCount = Math.max(1, Math.ceil(selected.commands.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, page), pageCount - 1);
  const components = selectRows(userId, cats, selected.key);
  if (pageCount > 1) components.push(navRow(userId, selected.key, current, pageCount));
  return { embeds: [categoryEmbed(selected, current, pageCount, prefix)], components };
}

/** Retire les composants après expiration (gestion propre de la péremption). */
function scheduleComponentsExpiry(message) {
  if (!message) return;
  setTimeout(() => {
    message.edit({ components: [] }).catch(() => null);
  }, COMPONENTS_LIFETIME_MS).unref?.();
}

function commandDetailEmbed(command, prefix) {
  const permNames = commandPermissionNames(command);
  const embed = infoEmbed(`${prefix}${command.name}`, command.description).addFields(
    { name: t('help.usage'), value: `\`${prefix}${command.usage}\` ou \`/${command.name}\`` },
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

  // Permissions du bot : exigées, puis nécessaires au fonctionnement.
  const botPerms = botPermissionNames(command);
  if (botPerms.required.length) {
    embed.addFields({ name: t('help.botPermissions'), value: botPerms.required.join(', '), inline: true });
  }
  if (botPerms.feature.length) {
    embed.addFields({ name: t('help.featurePermissions'), value: t('help.featurePermissionsValue', { perms: botPerms.feature.join(', ') }) });
  }
  if (command.examples?.length) {
    embed.addFields({
      name: t('help.examples'),
      value: command.examples.map((e) => `\`${prefix}${e}\``).join('\n'),
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
  dm: 'direct',
  async execute(ctx) {
    const prefix = ctx.guild ? prefixService.getPrefix(ctx.guild.id) : prefixService.DEFAULT_PREFIX;
    const name = ctx.options.commande?.toLowerCase();
    if (!name) {
      // En préfixe, ctx.reply retourne le message envoyé ; en slash, il faut
      // le récupérer pour programmer le retrait des composants.
      const sent = await ctx.reply(buildHelpPayload(ctx.client, ctx.user.id, prefix, null, 0));
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
    return ctx.reply({ embeds: [commandDetailEmbed(command, prefix)] });
  },

  /**
   * Composants du menu d'aide :
   * - menu déroulant  : customId "help:cat:<userId>", valeur = clé de catégorie ou "home" ;
   * - pagination      : customId "help:page:<userId>:<catKey>:<page>".
   * Seul le demandeur initial peut naviguer dans sa session d'aide.
   */
  async handleComponent(interaction) {
    const parts = interaction.customId.split(':');
    const [, kind, ownerId] = parts;
    if (!['cat', 'page'].includes(kind)) return;

    const prefix = interaction.guild ? prefixService.getPrefix(interaction.guild.id) : prefixService.DEFAULT_PREFIX;
    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        embeds: [errorEmbed(t('help.notYourSession', { prefix }))],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (kind === 'cat' && interaction.isStringSelectMenu()) {
      const value = interaction.values[0];
      const catKey = value === 'home' ? null : value;
      return interaction.update(buildHelpPayload(interaction.client, ownerId, prefix, catKey, 0));
    }
    if (kind === 'page' && interaction.isButton()) {
      const catKey = parts[3];
      const page = Number.parseInt(parts[4], 10) || 0;
      return interaction.update(buildHelpPayload(interaction.client, ownerId, prefix, catKey, page));
    }
    return undefined;
  },
};
