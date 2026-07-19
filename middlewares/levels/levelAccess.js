/**
 * Middleware du système de niveaux.
 *
 * - `canConfigure` : configuration (levelconfig) réservée aux administrateurs.
 * - `isExcludedChannel` / `isEligibleMember` : filtres d'attribution d'XP
 *   (salons exclus, rôles exclus, bots exclus).
 * - `isCountableVoiceState` : un état vocal compte-t-il pour l'XP vocal ?
 *   (salon vocal hors AFK, non sourd — temps réellement actif — bot exclu).
 */
const { PermissionFlagsBits } = require('discord.js');

function canConfigure(member) {
  return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));
}

function isExcludedChannel(config, channelId) {
  return Boolean(channelId) && config.excludedChannels.includes(channelId);
}

/** true si le membre peut gagner de l'XP (hors bot exclu, hors rôle exclu). */
function isEligibleMember(config, member) {
  if (!member) return false;
  if (config.excludeBots && member.user?.bot) return false;
  if (member.roles?.cache && config.excludedRoles.some((roleId) => member.roles.cache.has(roleId))) return false;
  return true;
}

/** Nombre de membres humains (non bots) présents dans un salon vocal. */
function humanCount(channel) {
  if (!channel?.members) return 0;
  return [...channel.members.values()].filter((m) => !m.user?.bot).length;
}

/**
 * true si l'état vocal doit accumuler de l'XP :
 * - dans un salon vocal, hors salon AFK ;
 * - non sourd (self/serveur) — « temps réellement actif » ;
 * - membre éligible (bot exclu si configuré) ;
 * - au moins deux humains si `excludeAloneVoice`.
 */
function isCountableVoiceState(config, member, voiceState) {
  if (!isEligibleMember(config, member)) return false;
  const channel = voiceState?.channel;
  if (!channel) return false;
  if (channel.id === voiceState.guild?.afkChannelId) return false;
  if (voiceState.deaf || voiceState.selfDeaf) return false;
  if (config.excludeAloneVoice && humanCount(channel) < 2) return false;
  return true;
}

module.exports = { canConfigure, isExcludedChannel, isEligibleMember, isCountableVoiceState, humanCount };
