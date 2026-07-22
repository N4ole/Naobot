/**
 * Logs d'activité vocale : arrivée, départ, déplacement entre salons vocaux.
 * Affiche l'heure d'entrée/sortie (horodatage de l'embed), la **durée** de la
 * session et le **nombre de membres** présents. Les changements internes
 * (mute/sourdine, main levée…) sont ignorés : seul un changement de salon
 * produit un log. Catégorie « vocaux » → « Arrivées et départs ».
 *
 * Note : la création/suppression/renommage des salons **temporaires** est déjà
 * journalisée par le système de salons vocaux temporaires ; ici on trace les
 * mouvements des membres.
 */
const { Events } = require('discord.js');
const logService = require('../../services/logs/logService');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

/** Début de session vocale par membre : `guildId:userId` → timestamp. */
const sessionStart = new Map();

function sessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const guild = newState.guild;
    const member = newState.member ?? oldState.member;
    if (!guild || member?.user?.bot) return;
    // Seul un changement de salon compte (ignore mute/sourdine/…).
    if (oldState.channelId === newState.channelId) return;
    if (!logService.isEnabled(guild.id, 'vocaux')) return;

    const key = sessionKey(guild.id, member.id);

    // Arrivée.
    if (!oldState.channelId && newState.channelId) {
      sessionStart.set(key, Date.now());
      await logService.record(guild, 'vocaux', {
        title: t('logs.events.voiceJoined'),
        emoji: 'happy',
        color: COLORS.LOG_CREATE,
        user: member.user,
        fields: [
          { name: t('logs.events.voiceChannel'), value: `${newState.channel} (\`${newState.channelId}\`)`, inline: true },
          { name: t('logs.events.voiceMembers'), value: String(newState.channel?.members.size ?? 0), inline: true },
        ],
        signature: `${guild.id}:voicejoin:${member.id}:${newState.channelId}`,
      });
      return;
    }

    // Départ.
    if (oldState.channelId && !newState.channelId) {
      const start = sessionStart.get(key);
      sessionStart.delete(key);
      const fields = [
        { name: t('logs.events.voiceChannel'), value: `${oldState.channel ?? `\`${oldState.channelId}\``}`, inline: true },
      ];
      if (start) fields.push({ name: t('logs.events.voiceDuration'), value: formatDuration(Date.now() - start), inline: true });
      await logService.record(guild, 'vocaux', {
        title: t('logs.events.voiceLeft'),
        emoji: 'sleepy',
        color: COLORS.LOG_DELETE,
        user: member.user,
        fields,
        signature: `${guild.id}:voiceleave:${member.id}:${oldState.channelId}`,
      });
      return;
    }

    // Déplacement.
    await logService.record(guild, 'vocaux', {
      title: t('logs.events.voiceMoved'),
      emoji: 'doubt',
      color: COLORS.LOG_UPDATE,
      user: member.user,
      fields: [
        { name: t('logs.events.voiceFrom'), value: `${oldState.channel ?? `\`${oldState.channelId}\``}`, inline: true },
        { name: t('logs.events.voiceTo'), value: `${newState.channel ?? `\`${newState.channelId}\``}`, inline: true },
      ],
      signature: `${guild.id}:voicemove:${member.id}:${oldState.channelId}:${newState.channelId}`,
    });
  },
};
