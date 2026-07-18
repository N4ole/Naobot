/**
 * Captcha à l'arrivée : protège le serveur contre les raids, comptes
 * automatisés, bots malveillants, créations massives de comptes et spams.
 *
 * À l'arrivée d'un membre (si activé) : attribution d'un rôle temporaire,
 * restriction d'accès (le membre ne voit que le salon de captcha), envoi du
 * défi. À la validation : rôle vérifié attribué, rôle temporaire retiré. En
 * cas d'échec répété ou d'expiration : expulsion (anti-raid).
 *
 * Extensible : les types de défi (bouton, code, calcul…) vivent dans
 * utils/constants/captchaTypes + generateChallenge ; le schéma accepte de
 * nouveaux champs (captcha image, réaction…) sans refonte.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const crypto = require('node:crypto');
const repository = require('../../database/captchaRepository');
const captchaTypes = require('../../utils/constants/captchaTypes');
const globalReputationService = require('../reputation/globalReputationService');
const logService = require('../logging/logService');
const { infoEmbed, successEmbed, logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans caractères ambigus (O/0, I/1)

function typeOf(config) {
  return captchaTypes[config.type] ?? captchaTypes.button;
}

async function logCaptcha(guild, action, fields = [], color) {
  await logService.log(
    guild,
    'captcha',
    logEventEmbed({ title: `🛂 ${t(`captcha.logs.${action}`)}`, color: color ?? COLORS.LOG_NEUTRAL, fields }),
  ).catch(() => null);
}

/** Génère un défi selon le type ; retourne { answer, prompt } (answer null pour le bouton). */
function generateChallenge(type) {
  if (type === 'text') {
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
    return { answer: code, prompt: code };
  }
  if (type === 'math') {
    const a = crypto.randomInt(2, 10);
    const b = crypto.randomInt(2, 10);
    const add = crypto.randomInt(2) === 0;
    return { answer: String(add ? a + b : a * b), prompt: add ? `${a} + ${b}` : `${a} × ${b}` };
  }
  return { answer: null, prompt: null }; // bouton
}

function challengeEmbed(config, member, pending) {
  const type = typeOf(config);
  const embed = infoEmbed(t('captcha.title'), config.message).addFields({ name: t('captcha.field.type'), value: `${type.emoji} ${type.label}`, inline: true });
  if (config.timeoutMinutes > 0) {
    embed.addFields({ name: t('captcha.field.timeout'), value: `<t:${Math.floor(pending.expiresAt / 1000)}:R>`, inline: true });
  }
  if (pending.type === 'text') embed.addFields({ name: t('captcha.field.code'), value: `\`\`\`\n${pending.prompt}\n\`\`\`` });
  if (pending.type === 'math') embed.addFields({ name: t('captcha.field.math'), value: `\`${pending.prompt} = ?\`` });
  return embed;
}

function challengeComponents(config, member) {
  const type = typeOf(config);
  const label = type.hasInput ? t('captcha.button.solve') : t('captcha.button.verify');
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`captcha:solve:${member.id}`).setLabel(label).setEmoji('🛂').setStyle(ButtonStyle.Success),
    ),
  ];
}

/** Restreint le membre au seul salon de captcha (accès visible garanti). */
async function applyRestriction(guild, member, config) {
  if (config.tempRoleId && guild.roles.cache.has(config.tempRoleId)) {
    await member.roles.add(config.tempRoleId, 'Captcha : rôle temporaire').catch(() => null);
  }
  const channel = guild.channels.cache.get(config.channelId);
  if (channel) {
    await channel.permissionOverwrites
      .edit(member.id, { ViewChannel: true, ReadMessageHistory: true, SendMessages: false })
      .catch(() => null);
  }
}

/** Lève la restriction et attribue le rôle vérifié. */
async function grantAccess(guild, member, config) {
  if (config.verifiedRoleId && guild.roles.cache.has(config.verifiedRoleId)) {
    await member.roles.add(config.verifiedRoleId, 'Captcha validé').catch(() => null);
  }
  if (config.tempRoleId && member.roles.cache.has(config.tempRoleId)) {
    await member.roles.remove(config.tempRoleId, 'Captcha validé').catch(() => null);
  }
  const channel = guild.channels.cache.get(config.channelId);
  await channel?.permissionOverwrites.delete(member.id, 'Captcha validé').catch(() => null);
}

/** À l'arrivée d'un membre : envoie le captcha si le système est activé. */
async function handleMemberJoin(member) {
  if (member.user.bot) return;
  const guild = member.guild;
  const config = repository.getConfig(guild.id);
  if (!config.enabled || !config.channelId || !config.verifiedRoleId) return;
  const channel = guild.channels.cache.get(config.channelId);
  if (!channel?.isTextBased()) return;

  await applyRestriction(guild, member, config);

  const challenge = generateChallenge(config.type);
  const pending = {
    answer: challenge.answer,
    prompt: challenge.prompt,
    type: config.type,
    attempts: 0,
    expiresAt: config.timeoutMinutes > 0 ? Date.now() + config.timeoutMinutes * 60000 : 0,
    messageId: null,
    createdAt: new Date().toISOString(),
  };

  const message = await channel
    .send({ content: `<@${member.id}>`, embeds: [challengeEmbed(config, member, pending)], components: challengeComponents(config, member) })
    .catch(() => null);
  pending.messageId = message?.id ?? null;
  repository.setPending(guild.id, member.id, pending);
  await logCaptcha(guild, 'sent', [{ name: t('common.member'), value: `${member.user.tag}`, inline: true }, { name: t('captcha.field.type'), value: config.type, inline: true }], COLORS.INFO);
}

/** Valide la réponse (bouton : pas de saisie ; texte/math : comparaison). */
function checkAnswer(pending, input) {
  if (pending.type === 'button') return true;
  return String(input ?? '').trim().toUpperCase() === String(pending.answer ?? '').toUpperCase();
}

/** Vérifie une tentative ; gère succès, échec (avec tentatives) et expulsion. */
async function verify(member, input) {
  const guild = member.guild;
  const config = repository.getConfig(guild.id);
  const pending = repository.getPending(guild.id, member.id);
  if (!pending) return { code: 'noPending' };

  if (checkAnswer(pending, input)) {
    repository.removePending(guild.id, member.id);
    repository.recordStat(guild.id, 'passed');
    await grantAccess(guild, member, config);
    await disableMessage(guild, config, pending, 'success');
    await logCaptcha(guild, 'passed', [{ name: t('common.member'), value: `${member.user.tag}`, inline: true }], COLORS.LOG_CREATE);
    return { code: 'success' };
  }

  pending.attempts += 1;
  const remaining = Math.max(0, config.maxAttempts - pending.attempts);
  if (remaining <= 0) {
    await kick(member, config, pending, 'failed');
    return { code: 'kicked' };
  }
  repository.setPending(guild.id, member.id, pending);
  return { code: 'retry', remaining };
}

async function disableMessage(guild, config, pending, state) {
  if (!pending.messageId) return;
  const channel = guild.channels.cache.get(config.channelId);
  const message = await channel?.messages.fetch(pending.messageId).catch(() => null);
  if (message) {
    const embed = state === 'success' ? successEmbed(t('captcha.done')) : infoEmbed(t('captcha.title'), t('captcha.expiredMessage'));
    await message.edit({ content: '', embeds: [embed], components: [] }).catch(() => null);
  }
}

/** Expulse un membre (échec ou expiration), nettoie et journalise. */
async function kick(member, config, pending, reason) {
  const guild = member.guild;
  repository.removePending(guild.id, member.id);
  repository.recordStat(guild.id, 'kicked');
  await disableMessage(guild, config, pending, 'expired');
  globalReputationService.record({ guild, user: member.user, action: 'captcha', reason: reason === 'failed' ? 'Captcha : trop de tentatives' : 'Captcha : délai dépassé', automatic: true }).catch(() => null);
  await member.kick(reason === 'failed' ? 'Captcha : trop de tentatives' : 'Captcha : délai dépassé').catch(() => null);
  await logCaptcha(
    guild,
    reason === 'failed' ? 'failed' : 'expired',
    [{ name: t('common.member'), value: `${member.user.tag}`, inline: true }],
    COLORS.LOG_DELETE,
  );
}

/** Planificateur : expulse les membres n'ayant pas validé dans le délai. */
async function sweep(client) {
  const now = Date.now();
  for (const entry of repository.allPending()) {
    if (!entry.expiresAt || entry.expiresAt > now) continue;
    const guild = client.guilds.cache.get(entry.guildId);
    if (!guild) {
      repository.removePending(entry.guildId, entry.userId);
      continue;
    }
    const config = repository.getConfig(guild.id);
    const member = await guild.members.fetch(entry.userId).catch(() => null);
    if (!member) {
      repository.removePending(guild.id, entry.userId);
      continue;
    }
    await kick(member, config, entry, 'expired').catch(() => null);
  }
}

function startScheduler(client) {
  sweep(client).catch(() => null);
  const timer = setInterval(() => sweep(client).catch(() => null), 30 * 1000);
  timer.unref?.();
  return timer;
}

module.exports = {
  typeOf,
  generateChallenge,
  challengeEmbed,
  challengeComponents,
  handleMemberJoin,
  verify,
  checkAnswer,
  sweep,
  startScheduler,
  logCaptcha,
};
