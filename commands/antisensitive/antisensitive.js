/**
 * Commande antisensitive : configuration de la protection anti-contenus
 * sensibles (adultes, gore, violence, danger), indépendante des autres
 * protections. Slash + préfixe (schéma `args` unique).
 *
 * Sous-commandes :
 *   on | off | status
 *   whitelist add|remove|list <salon>        — salons ignorés
 *   category  add|remove|list <catégorie>    — catégories de salons ignorées
 *   role      add|remove|list <rôle>         — rôles ignorés
 *   user      add|remove|list <utilisateur>  — utilisateurs ignorés
 *   blacklist add|remove|list <domaine>      — domaines interdits personnalisés
 *   allow     add|remove|list <domaine>      — domaines autorisés (whitelist)
 *   keyword   add|remove|list <mot>          — mots-clés personnalisés
 *   filter    <porn|gore|violence|danger> <on|off> — catégories de contenu
 *   reaction  <delete|notify|log>            — réaction du bot
 *   warn      <message|reset>                — message d'avertissement
 *   test      <texte>                        — teste la détection sur un texte
 *
 * Accès : Administrateur (config/permissions.js). Logique métier :
 * services/antisensitive/antisensitiveService.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const config = require('../../config/config');
const antisensitiveService = require('../../services/antisensitive/antisensitiveService');
const { canConfigure } = require('../../middlewares/antisensitive/antisensitiveAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { CATEGORIES } = require('../../utils/constants/sensitiveContent');
const { CONTENT_CATEGORIES, ACTIONS } = require('../../database/antisensitiveRepository');
const { t } = require('../../utils/helpers/i18n');

const ON = new Set(['on', 'activer', 'enable', 'true', 'oui']);
const OFF = new Set(['off', 'desactiver', 'disable', 'false', 'non']);
const RECENT_PER_PAGE = 5;

function normalizeWord(input) {
  return (input ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Extrait un identifiant Discord d'une mention (#salon, @rôle, @membre) ou d'un ID brut. */
function parseId(token) {
  if (!token) return null;
  const m = String(token).match(/^<[@#&!]{1,2}(\d{17,20})>$/) || String(token).match(/^(\d{17,20})$/);
  return m ? m[1] : null;
}

/** Configuration des sous-commandes de listes (mutateur + rendu). */
const LISTS = {
  whitelist: { mut: 'exemptChannels', field: 'exemptChannels', kind: 'channel', title: 'antisensitive.whitelist.listTitle' },
  category: { mut: 'exemptCategories', field: 'exemptCategories', kind: 'category', title: 'antisensitive.category.listTitle' },
  role: { mut: 'exemptRoles', field: 'exemptRoles', kind: 'role', title: 'antisensitive.role.listTitle' },
  user: { mut: 'exemptUsers', field: 'exemptUsers', kind: 'user', title: 'antisensitive.user.listTitle' },
  blacklist: { mut: 'blockedDomains', field: 'blockedDomains', kind: 'domain', title: 'antisensitive.blacklist.listTitle' },
  allow: { mut: 'allowedDomains', field: 'allowedDomains', kind: 'domain', title: 'antisensitive.allow.listTitle' },
  keyword: { mut: 'blockedKeywords', field: 'blockedKeywords', kind: 'keyword', title: 'antisensitive.keyword.listTitle' },
};

function renderEntry(kind, value) {
  if (kind === 'channel') return `• <#${value}>`;
  if (kind === 'category') return `• <#${value}>`;
  if (kind === 'role') return `• <@&${value}>`;
  if (kind === 'user') return `• <@${value}>`;
  return `• \`${value}\``;
}

/** Cible attendue (ID Discord pour les listes de mentions, texte pour les autres). */
function resolveTarget(kind, raw) {
  if (['channel', 'category', 'role', 'user'].includes(kind)) return parseId(raw);
  return raw ? String(raw).trim() : null;
}

function indicator(enabled) {
  return enabled ? '🟢' : '🔴';
}

// --- Statut (embed enrichi + pagination des événements récents + boutons) ---

function buildStatusPayload(guild, page = 0) {
  const conf = antisensitiveService.getConfig(guild.id);
  const recent = conf.recentDetections;
  const pages = Math.max(1, Math.ceil(recent.length / RECENT_PER_PAGE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const slice = recent.slice(current * RECENT_PER_PAGE, current * RECENT_PER_PAGE + RECENT_PER_PAGE);

  const catLine = CONTENT_CATEGORIES.map((key) => `${CATEGORIES[key].emoji} ${conf.categories[key] !== false ? '✅' : '❌'}`).join('  ');
  const recentText = recent.length
    ? slice.map((d) => {
        const cat = CATEGORIES[d.category];
        return `${cat?.emoji ?? '•'} <@${d.userId}> · \`${d.match}\` · ${t(`antisensitive.method.${d.method}`)} · <t:${Math.floor(Date.parse(d.at) / 1000)}:R>`;
      }).join('\n')
    : t('antisensitive.status.noDetections');

  const embed = infoEmbed(
    t('antisensitive.status.title', { guild: guild.name }),
    t('antisensitive.status.state', { indicator: indicator(conf.enabled), state: conf.enabled ? t('antisensitive.on') : t('antisensitive.off') }),
  ).addFields(
    { name: t('antisensitive.status.categories'), value: catLine, inline: false },
    { name: t('antisensitive.status.action'), value: t(`antisensitive.action.${conf.action}`), inline: true },
    { name: t('antisensitive.status.stats'), value: t('antisensitive.status.statsValue', { detections: conf.stats.detections, deleted: conf.stats.deleted, errors: conf.stats.errors }), inline: true },
    {
      name: t('antisensitive.status.exemptions'),
      value: t('antisensitive.status.exemptionsValue', {
        channels: conf.exemptChannels.length,
        categories: conf.exemptCategories.length,
        roles: conf.exemptRoles.length,
        users: conf.exemptUsers.length,
      }),
      inline: false,
    },
    {
      name: t('antisensitive.status.customLists'),
      value: t('antisensitive.status.customListsValue', { blocked: conf.blockedDomains.length, allowed: conf.allowedDomains.length, keywords: conf.blockedKeywords.length }),
      inline: false,
    },
    { name: t('antisensitive.status.recent', { page: current + 1, pages }), value: recentText.slice(0, 1024), inline: false },
    {
      name: t('antisensitive.status.lastModified'),
      value: conf.lastModifiedAt ? `<t:${Math.floor(Date.parse(conf.lastModifiedAt) / 1000)}:f>${conf.lastModifiedBy ? ` — <@${conf.lastModifiedBy}>` : ''}` : t('antisensitive.status.never'),
      inline: false,
    },
  );

  const toggle = conf.enabled
    ? new ButtonBuilder().setCustomId('antisensitive:toggle:off').setLabel(t('antisensitive.button.disable')).setStyle(ButtonStyle.Danger)
    : new ButtonBuilder().setCustomId('antisensitive:toggle:on').setLabel(t('antisensitive.button.enable')).setStyle(ButtonStyle.Success);
  const rows = [
    new ActionRowBuilder().addComponents(
      toggle,
      new ButtonBuilder().setCustomId(`antisensitive:page:${current}`).setLabel(t('antisensitive.button.refresh')).setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    ),
  ];
  if (pages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`antisensitive:page:${current - 1}`).setLabel(t('antisensitive.button.prev')).setStyle(ButtonStyle.Primary).setDisabled(current === 0),
      new ButtonBuilder().setCustomId(`antisensitive:page:${current + 1}`).setLabel(t('antisensitive.button.next')).setStyle(ButtonStyle.Primary).setDisabled(current >= pages - 1),
    ));
  }
  return { embeds: [embed], components: rows };
}

// --- Handlers de sous-commandes ---

async function handleList(ctx, action) {
  const meta = LISTS[action];
  const sub = normalizeWord(ctx.options.sousaction);
  const conf = antisensitiveService.getConfig(ctx.guild.id);

  if (!sub || sub === 'list' || sub === 'liste') {
    const list = conf[meta.field];
    const value = list.length ? list.map((v) => renderEntry(meta.kind, v)).join('\n').slice(0, 4000) : t('antisensitive.list.empty');
    return ctx.reply({ embeds: [infoEmbed(t(meta.title), value)] });
  }

  const target = resolveTarget(meta.kind, ctx.options.cible);
  if (!target) return ctx.reply({ embeds: [errorEmbed(t('antisensitive.list.needTarget'))], ephemeral: true });

  const service = antisensitiveService[meta.mut];
  if (sub === 'add' || sub === 'ajouter') {
    const { added } = await service.add(ctx.guild, target, ctx.user);
    return ctx.reply({ embeds: [successEmbed(t(added ? 'antisensitive.list.added' : 'antisensitive.list.alreadyAdded', { value: renderEntry(meta.kind, target).slice(2) }))] });
  }
  if (['remove', 'retirer', 'delete', 'supprimer'].includes(sub)) {
    const { removed } = await service.remove(ctx.guild, target, ctx.user);
    return ctx.reply({ embeds: [successEmbed(t(removed ? 'antisensitive.list.removed' : 'antisensitive.list.notFound', { value: renderEntry(meta.kind, target).slice(2) }))] });
  }
  return ctx.reply({ embeds: [errorEmbed(t('errors.invalidArgs', { usage: `${config.prefix}antisensitive ${action} <add|remove|list> …` }))], ephemeral: true });
}

async function handleFilter(ctx) {
  const category = normalizeWord(ctx.options.sousaction);
  const value = normalizeWord((ctx.options.cible ?? '').trim());
  if (!CONTENT_CATEGORIES.includes(category)) {
    return ctx.reply({ embeds: [errorEmbed(t('antisensitive.filter.unknown', { categories: CONTENT_CATEGORIES.join(', ') }))], ephemeral: true });
  }
  const enabled = ON.has(value) ? true : OFF.has(value) ? false : null;
  if (enabled === null) return ctx.reply({ embeds: [errorEmbed(t('antisensitive.filter.needState'))], ephemeral: true });
  await antisensitiveService.setCategory(ctx.guild, category, enabled, ctx.user);
  return ctx.reply({ embeds: [successEmbed(t('antisensitive.filter.set', { category: CATEGORIES[category].label, state: enabled ? t('antisensitive.on') : t('antisensitive.off') }))] });
}

async function handleReaction(ctx) {
  const mode = normalizeWord(ctx.options.sousaction);
  if (!ACTIONS.includes(mode)) return ctx.reply({ embeds: [errorEmbed(t('antisensitive.reaction.unknown', { actions: ACTIONS.join(', ') }))], ephemeral: true });
  await antisensitiveService.setAction(ctx.guild, mode, ctx.user);
  return ctx.reply({ embeds: [successEmbed(t('antisensitive.reaction.set', { action: t(`antisensitive.action.${mode}`) }))] });
}

async function handleWarn(ctx) {
  const text = [ctx.options.sousaction, ctx.options.cible].filter(Boolean).join(' ').trim();
  if (!text || normalizeWord(text) === 'reset' || normalizeWord(text) === 'defaut') {
    await antisensitiveService.setWarnMessage(ctx.guild, null, ctx.user);
    return ctx.reply({ embeds: [successEmbed(t('antisensitive.warn.reset'))] });
  }
  await antisensitiveService.setWarnMessage(ctx.guild, text, ctx.user);
  return ctx.reply({ embeds: [successEmbed(t('antisensitive.warn.set'))] });
}

function handleTest(ctx) {
  const text = [ctx.options.sousaction, ctx.options.cible].filter(Boolean).join(' ').trim();
  if (!text) return ctx.reply({ embeds: [errorEmbed(t('antisensitive.test.needText'))], ephemeral: true });
  const conf = antisensitiveService.getConfig(ctx.guild.id);
  const detection = antisensitiveService.analyze(text, conf);
  if (!detection) return ctx.reply({ embeds: [infoEmbed(t('antisensitive.test.title'), t('antisensitive.test.clean'))], ephemeral: true });
  const cat = CATEGORIES[detection.category];
  return ctx.reply({
    embeds: [infoEmbed(t('antisensitive.test.title'), t('antisensitive.test.detected', {
      category: cat ? `${cat.emoji} ${cat.label}` : detection.category,
      method: t(`antisensitive.method.${detection.method}`),
      match: detection.match,
    }))],
    ephemeral: true,
  });
}

module.exports = {
  name: 'antisensitive',
  description: 'Configure la protection anti-contenus sensibles (adultes/gore/violence/danger)',
  usage: 'antisensitive <on|off|status|whitelist|category|role|user|blacklist|allow|keyword|filter|reaction|warn|test> …',
  examples: [
    'antisensitive on',
    'antisensitive status',
    'antisensitive whitelist add #nsfw',
    'antisensitive role add @Mods',
    'antisensitive blacklist add badsite.net',
    'antisensitive filter gore off',
    'antisensitive reaction notify',
    'antisensitive test regarde xvideos.com',
  ],
  aliases: ['antinsfw', 'antichoc'],
  cooldown: 3,
  args: [
    { name: 'action', type: 'string', required: true, choices: ['on', 'off', 'status', 'whitelist', 'category', 'role', 'user', 'blacklist', 'allow', 'keyword', 'filter', 'reaction', 'warn', 'test'], description: 'Sous-commande' },
    { name: 'sousaction', type: 'string', required: false, description: 'add/remove/list, catégorie, mode, ou texte selon la sous-commande' },
    { name: 'cible', type: 'string', required: false, rest: true, description: 'Cible : salon/rôle/membre/domaine/mot/texte' },
  ],

  async execute(ctx) {
    const action = normalizeWord(ctx.options.action);
    if (action === 'status' || action === 'statut') return ctx.reply(buildStatusPayload(ctx.guild, 0));
    if (action in LISTS) return handleList(ctx, action);
    if (action === 'filter') return handleFilter(ctx);
    if (action === 'reaction') return handleReaction(ctx);
    if (action === 'warn') return handleWarn(ctx);
    if (action === 'test') return handleTest(ctx);

    if (ON.has(action)) {
      await antisensitiveService.setEnabled(ctx.guild, true, ctx.user);
      return ctx.reply({ embeds: [successEmbed(t('antisensitive.command.enabled'))] });
    }
    if (OFF.has(action)) {
      await antisensitiveService.setEnabled(ctx.guild, false, ctx.user);
      return ctx.reply({ embeds: [successEmbed(t('antisensitive.command.disabled'))] });
    }
    return ctx.reply({ embeds: [errorEmbed(t('errors.invalidArgs', { usage: `${config.prefix}${this.usage}` }))], ephemeral: true });
  },

  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    if (!canConfigure(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed(t('antisensitive.noPermission'))], flags: MessageFlags.Ephemeral });
    }
    const [, kind, arg] = interaction.customId.split(':');
    if (kind === 'toggle') {
      await antisensitiveService.setEnabled(interaction.guild, arg === 'on', interaction.user);
      return interaction.update(buildStatusPayload(interaction.guild, 0));
    }
    if (kind === 'page') return interaction.update(buildStatusPayload(interaction.guild, Number.parseInt(arg, 10) || 0));
    return undefined;
  },
};
