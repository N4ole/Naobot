/**
 * Attribution d'XP à l'envoi de messages (système de niveaux).
 *
 * Anti-abus : cooldown par membre, longueur minimale du message, et
 * anti-répétition (un message identique au précédent ne rapporte pas d'XP).
 * Les bots, salons exclus et rôles exclus sont ignorés. Ne fait rien si le
 * système est désactivé sur le serveur.
 */
const crypto = require('node:crypto');
const { Events } = require('discord.js');
const levelService = require('../../services/levels/levelService');
const levelRepository = require('../../database/levelRepository');
const { isExcludedChannel, isEligibleMember } = require('../../middlewares/levels/levelAccess');

function hashContent(content) {
  return crypto.createHash('sha1').update(content.trim().toLowerCase()).digest('hex').slice(0, 12);
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author?.bot || !message.member) return;
    const config = levelService.getConfig(message.guild.id);
    if (!config.enabled) return;
    if (isExcludedChannel(config, message.channel?.id)) return;
    if (!isEligibleMember(config, message.member)) return;

    const content = message.content ?? '';
    if (content.trim().length < config.minMessageLength) return; // messages trop courts

    const user = levelRepository.getUser(message.guild.id, message.author.id);
    // Cooldown anti-spam : un seul gain d'XP par intervalle.
    if (Date.now() - (user.lastMessageAt ?? 0) < config.messageCooldownMs) return;
    // Anti-répétition : message identique au précédent ignoré.
    const hash = hashContent(content);
    if (hash === user.lastHash) return;

    await levelService
      .addXp(message.guild, message.member, config.xpPerMessage, { channel: message.channel, incMessages: 1, hash })
      .catch(() => null);
  },
};
