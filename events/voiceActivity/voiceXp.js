/**
 * Attribution d'XP selon le temps vocal (système de niveaux).
 *
 * Chaque présence vocale qualifiante ouvre une **session** persistée
 * ({ channelId, since }) : le calcul survit donc aux redémarrages du bot. Une
 * session accumule tant que l'état reste qualifiant (salon vocal hors AFK, non
 * sourd — « temps réellement actif » —, membre éligible, et pas seul si
 * `excludeAloneVoice`). L'XP est attribuée par **minute entière**.
 *
 * - `voiceStateUpdate` : réévalue le membre qui bouge et les membres des salons
 *   concernés (l'arrivée/départ d'un tiers modifie la condition « seul »).
 * - un **flush périodique** attribue l'XP des sessions en cours (borne la perte
 *   en cas d'arrêt) ; au `ready`, les sessions persistées sont reprises.
 */
const { Events } = require('discord.js');
const levelService = require('../../services/levels/levelService');
const repository = require('../../database/levelRepository');
const { isCountableVoiceState } = require('../../middlewares/levels/levelAccess');

const FLUSH_INTERVAL_MS = 5 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Attribue l'XP des minutes entières écoulées d'une session ; avance `since`. */
async function awardSession(guild, member, config, session) {
  const elapsed = Date.now() - session.since;
  const minutes = Math.floor(elapsed / MINUTE_MS);
  if (minutes <= 0) return session;
  await levelService
    .addXp(guild, member, config.xpPerVoiceMinute * minutes, { incVoiceMs: minutes * MINUTE_MS })
    .catch(() => null);
  return { ...session, since: session.since + minutes * MINUTE_MS };
}

/** Ouvre/ferme/actualise la session vocale d'un membre selon son état. */
async function reevaluateMember(guild, member, config) {
  if (!member) return;
  const voiceState = member.voice;
  const countable = isCountableVoiceState(config, member, voiceState);
  const session = repository.getSession(guild.id, member.id);

  if (session) {
    const updated = await awardSession(guild, member, config, session);
    if (countable) repository.setSession(guild.id, member.id, { channelId: voiceState.channelId, since: updated.since });
    else repository.clearSession(guild.id, member.id);
    return;
  }
  if (countable) repository.setSession(guild.id, member.id, { channelId: voiceState.channelId, since: Date.now() });
}

const voiceStateUpdate = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const guild = newState.guild ?? oldState.guild;
    const config = repository.getConfig(guild.id);
    if (!config.enabled) return;

    // Membre qui bouge, puis membres des salons concernés (condition « seul »).
    await reevaluateMember(guild, newState.member ?? oldState.member, config).catch(() => null);
    const channels = new Set([oldState.channel, newState.channel].filter(Boolean));
    for (const channel of channels) {
      for (const member of channel.members.values()) {
        await reevaluateMember(guild, member, config).catch(() => null);
      }
    }
  },
};

/** Flush périodique : attribue l'XP des sessions en cours. */
async function flush(client) {
  for (const { guildId, userId, ...session } of repository.allSessions()) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    const config = repository.getConfig(guildId);
    if (!config.enabled) continue;
    const member = guild.members.cache.get(userId);
    if (!member) continue;
    const updated = await awardSession(guild, member, config, session).catch(() => session);
    repository.setSession(guildId, userId, { channelId: session.channelId, since: updated.since });
  }
}

const ready = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    // Reprise après redémarrage : les sessions persistées repartent de « maintenant »
    // (le temps hors ligne n'est pas compté), et les membres déjà connectés sont
    // réévalués pour ouvrir leur session.
    for (const { guildId, userId } of repository.allSessions()) {
      const guild = client.guilds.cache.get(guildId);
      const member = guild?.members.cache.get(userId);
      if (member?.voice?.channelId) repository.setSession(guildId, userId, { channelId: member.voice.channelId, since: Date.now() });
      else repository.clearSession(guildId, userId);
    }
    for (const guild of client.guilds.cache.values()) {
      const config = repository.getConfig(guild.id);
      if (!config.enabled) continue;
      for (const [, state] of guild.voiceStates.cache) {
        if (state.member) await reevaluateMember(guild, state.member, config).catch(() => null);
      }
    }

    const timer = setInterval(() => flush(client).catch(() => null), FLUSH_INTERVAL_MS);
    timer.unref?.();
    console.log('[levels] Suivi du temps vocal démarré.');
  },
};

module.exports = [voiceStateUpdate, ready];
