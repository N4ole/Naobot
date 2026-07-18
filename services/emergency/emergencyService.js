/**
 * Mode urgence : verrouillage d'urgence de tous les salons d'un serveur.
 *
 * À l'activation, les permissions @everyone de chaque salon sont d'abord
 * **mémorisées** (pour une restauration fidèle), puis restreintes : plus
 * d'envoi de messages, de réactions, de création de fils, de connexion ni
 * de prise de parole vocale. À la désactivation, les permissions d'origine
 * sont restaurées exactement.
 *
 * Sécurité : jamais de verrouillage irréversible (les overwrites d'origine
 * sont sauvegardés et restaurés), salons critiques ignorables
 * (exemptChannelIds, extensible), et état persistant (résiste au
 * redémarrage). Toute la logique vit ici.
 */
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const repository = require('../../database/emergencyRepository');
const logService = require('../logs/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

/** Permissions verrouillées pour @everyone pendant l'urgence. */
const LOCK_FLAGS = [
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.CreatePrivateThreads,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
];

/** Salons dont les overwrites @everyone sont pertinents à verrouiller. */
function lockableChannels(guild, exemptChannelIds) {
  return guild.channels.cache.filter(
    (channel) =>
      !exemptChannelIds.includes(channel.id) &&
      [ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildForum, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice].includes(channel.type) &&
      channel.manageable,
  );
}

function isActive(guildId) {
  return repository.getState(guildId).active === true;
}

function getState(guildId) {
  return repository.getState(guildId);
}

/**
 * Active le mode urgence : mémorise puis verrouille les salons.
 * @returns {Promise<{ ok: boolean, locked: number, code?: string }>}
 */
async function activate(guild, byUser) {
  const state = repository.getState(guild.id);
  if (state.active) return { ok: false, code: 'alreadyActive' };

  const everyone = guild.roles.everyone;
  const savedOverwrites = {};
  let locked = 0;

  for (const channel of lockableChannels(guild, state.exemptChannelIds).values()) {
    const current = channel.permissionOverwrites.cache.get(everyone.id);
    savedOverwrites[channel.id] = {
      allow: current ? current.allow.bitfield.toString() : '0',
      deny: current ? current.deny.bitfield.toString() : '0',
      existed: Boolean(current),
    };
    const denyMap = Object.fromEntries(LOCK_FLAGS.map((flag) => [flag, false]));
    const ok = await channel.permissionOverwrites
      .edit(everyone, denyMap, { reason: `Mode urgence activé par ${byUser.tag}` })
      .then(() => true)
      .catch(() => false);
    if (ok) locked += 1;
  }

  state.active = true;
  state.activatedBy = byUser.id;
  state.activatedAt = new Date().toISOString();
  state.savedOverwrites = savedOverwrites;
  repository.saveState(guild.id, state);

  await logService.log(
    guild,
    'urgence',
    logEventEmbed({
      title: `🚨 ${t('emergency.logs.activated')}`,
      color: COLORS.ERROR,
      user: byUser,
      fields: [{ name: t('emergency.field.locked'), value: String(locked), inline: true }],
    }),
  );
  return { ok: true, locked };
}

/**
 * Désactive le mode urgence : restaure les permissions d'origine.
 * @returns {Promise<{ ok: boolean, restored: number, code?: string }>}
 */
async function deactivate(guild, byUser) {
  const state = repository.getState(guild.id);
  if (!state.active) return { ok: false, code: 'notActive' };

  const everyone = guild.roles.everyone;
  let restored = 0;

  for (const [channelId, saved] of Object.entries(state.savedOverwrites)) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.manageable) continue;
    const ok = await (saved.existed
      ? channel.permissionOverwrites.edit(
          everyone,
          { allow: BigInt(saved.allow), deny: BigInt(saved.deny) },
          { reason: `Mode urgence désactivé par ${byUser.tag}` },
        )
      : channel.permissionOverwrites.delete(everyone, `Mode urgence désactivé par ${byUser.tag}`))
      .then(() => true)
      .catch(() => false);
    if (ok) restored += 1;
  }

  state.active = false;
  state.savedOverwrites = {};
  state.activatedBy = null;
  state.activatedAt = null;
  repository.saveState(guild.id, state);

  await logService.log(
    guild,
    'urgence',
    logEventEmbed({
      title: `🟢 ${t('emergency.logs.deactivated')}`,
      color: COLORS.LOG_CREATE,
      user: byUser,
      fields: [{ name: t('emergency.field.restored'), value: String(restored), inline: true }],
    }),
  );
  return { ok: true, restored };
}

module.exports = { isActive, getState, activate, deactivate, LOCK_FLAGS };
