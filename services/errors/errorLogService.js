/**
 * Journalisation centralisée des erreurs internes du bot.
 *
 * Toutes les erreurs critiques et inattendues (erreurs de commandes, promesses
 * rejetées, exceptions non capturées, erreurs de l'API Discord, erreurs de
 * WebSocket, erreurs de base de données ou de synchronisation) sont envoyées
 * dans un salon privé **#bot-errors** d'un unique serveur dédié, identifié par
 * `ERROR_GUILD_ID` (config/.env). Aucun autre serveur n'y a accès : le salon
 * n'est jamais créé ailleurs et aucune commande n'expose ces logs.
 *
 * Au démarrage, la catégorie et le salon sont créés automatiquement s'ils
 * n'existent pas. La journalisation ne doit JAMAIS provoquer d'erreur en
 * cascade : tout est encapsulé et échoue silencieusement.
 */
const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const CATEGORY_NAME = 'NaoBot — Erreurs';
const CHANNEL_NAME = 'bot-errors';

let client = null;
let cachedChannelId = null;
let handlersRegistered = false;

/** Le système est-il configuré (serveur d'erreurs défini) ? */
function isConfigured() {
  return Boolean(config.errorGuildId);
}

/** Récupère (ou crée) le salon #bot-errors du serveur dédié, ou null. */
async function ensureChannel() {
  if (!isConfigured() || !client) return null;

  const guild = client.guilds.cache.get(config.errorGuildId);
  if (!guild) return null;

  // Salon déjà connu et toujours présent.
  if (cachedChannelId) {
    const known = guild.channels.cache.get(cachedChannelId);
    if (known) return known;
    cachedChannelId = null;
  }

  // Salon existant portant le nom attendu.
  let channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === CHANNEL_NAME);
  if (channel) {
    cachedChannelId = channel.id;
    return channel;
  }

  // Le bot doit pouvoir créer des salons.
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return null;

  // Catégorie dédiée (réutilise l'existante).
  let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME);
  if (!category) {
    category = await guild.channels.create({ name: CATEGORY_NAME, type: ChannelType.GuildCategory, reason: 'Logs internes du bot' }).catch(() => null);
  }

  channel = await guild.channels
    .create({ name: CHANNEL_NAME, type: ChannelType.GuildText, parent: category?.id ?? null, reason: 'Logs internes du bot' })
    .catch(() => null);
  if (channel) cachedChannelId = channel.id;
  return channel;
}

/** Construit l'embed lisible d'une erreur. */
function buildEmbed({ type, error, guild, channel, user, command, module: moduleName }) {
  const stack = error?.stack || (error != null ? String(error) : t('errorLog.noStack'));
  return new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle(`🐞 ${t('errorLog.title', { type: type ?? t('errorLog.unknownType') })}`)
    .setTimestamp()
    .addFields(
      { name: t('errorLog.field.type'), value: `\`${type ?? t('errorLog.unknownType')}\``, inline: true },
      { name: t('errorLog.field.module'), value: moduleName ? `\`${moduleName}\`` : '—', inline: true },
      { name: t('errorLog.field.guild'), value: guild ? `${guild.name} (\`${guild.id}\`)` : '—', inline: true },
      { name: t('errorLog.field.channel'), value: channel ? `${channel} (\`${channel.id}\`)` : '—', inline: true },
      { name: t('errorLog.field.user'), value: user ? `${user.tag ?? user} (\`${user.id ?? ''}\`)` : '—', inline: true },
      { name: t('errorLog.field.command'), value: command ? `\`${command}\`` : '—', inline: true },
      { name: t('errorLog.field.stack'), value: `\`\`\`${String(stack).slice(0, 1000)}\`\`\`` },
    );
}

/**
 * Journalise une erreur dans le salon dédié.
 * @param {{ type?: string, error?: unknown, guild?: object, channel?: object,
 *   user?: object, command?: string, module?: string }} context
 */
async function report(context = {}) {
  try {
    const channel = await ensureChannel();
    if (!channel) return;
    await channel.send({ embeds: [buildEmbed(context)] }).catch(() => null);
  } catch {
    // Ne jamais laisser la journalisation elle-même casser le bot.
  }
}

/** Enregistre les gestionnaires globaux (une seule fois). */
function registerProcessHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;

  process.on('unhandledRejection', (error) => {
    console.error('[process] Promesse rejetée non gérée :', error);
    report({ type: 'unhandledRejection', error, module: 'process' });
  });
  process.on('uncaughtException', (error) => {
    console.error('[process] Exception non capturée :', error);
    report({ type: 'uncaughtException', error, module: 'process' });
  });
}

/**
 * Initialise le service au démarrage : mémorise le client, branche les
 * écouteurs d'erreurs Discord/WebSocket et prépare le salon dédié.
 */
async function init(discordClient) {
  client = discordClient;
  registerProcessHandlers();

  client.on('error', (error) => report({ type: 'discordError', error, module: 'discord.js' }));
  client.on('shardError', (error) => report({ type: 'shardError', error, module: 'discord.js/ws' }));

  if (!isConfigured()) {
    console.log('[errors] ERROR_GUILD_ID non défini : logs d’erreurs internes désactivés.');
    return;
  }
  const channel = await ensureChannel();
  console.log(channel ? `[errors] Salon de logs d’erreurs prêt (#${CHANNEL_NAME}).` : '[errors] Serveur d’erreurs introuvable ou permissions insuffisantes.');
}

module.exports = { init, report, ensureChannel, isConfigured, CHANNEL_NAME, CATEGORY_NAME };
