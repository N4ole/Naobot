/**
 * Salons vocaux temporaires (« Join to Create »).
 *
 * Un salon générateur, configuré par un administrateur, crée automatiquement
 * un salon vocal temporaire quand un membre le rejoint, y déplace le membre,
 * puis le supprime dès qu'il est vide.
 *
 * Sécurité : un seul salon temporaire actif par (générateur, membre) — pas de
 * doublon ; les salons temporaires ne sont jamais traités comme des
 * générateurs — pas de boucle.
 *
 * Permissions : le salon temporaire **hérite intégralement des permissions de
 * sa catégorie Discord** (synchronisation native via `lockPermissions`) —
 * aucune permission n'est copiée manuellement, et le salon reste aligné sur sa
 * catégorie. Le propriétaire ne reçoit AUCUNE permission de gestion Discord :
 * sa seule capacité est de **renommer** son salon via la commande renamevoice
 * (arbitrée par le bot). Il ne peut donc ni modifier les permissions, ni
 * changer la catégorie, ni supprimer le salon, ni déplacer des membres, ni
 * modifier d'autres paramètres.
 *
 * Extensible sans refonte : salons privés, mots de passe, limite ajustable,
 * verrouillage, transfert de propriété, salons permanents… (le schéma des
 * générateurs/temps accepte de nouveaux champs).
 */
const { ChannelType } = require('discord.js');
const repository = require('../../database/tempVoiceRepository');
const logService = require('../logs/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const tempVoiceVariables = require('../../utils/constants/tempVoiceVariables');
const { t } = require('../../utils/helpers/i18n');

async function logVoice(guild, action, fields = [], color) {
  await logService.log(
    guild,
    'vocaux',
    logEventEmbed({
      title: `🔊 ${t(`tempVoice.logs.${action}`)}`,
      color: color ?? COLORS.LOG_NEUTRAL,
      fields,
    }),
  ).catch(() => null);
}

/**
 * Crée un salon temporaire pour un membre entrant dans un générateur, puis l'y
 * déplace. Anti-doublon : si le membre possède déjà un temp pour ce
 * générateur, il y est simplement déplacé.
 */
async function createTempChannel(guild, member, generator) {
  // Anti-doublon : réutilise le salon existant du membre pour ce générateur.
  const existing = repository.findTempByOwner(guild.id, member.id, generator.channelId);
  if (existing) {
    const channel = guild.channels.cache.get(existing.channelId);
    if (channel) {
      await member.voice.setChannel(channel).catch(() => null);
      return { ok: false, code: 'duplicate' };
    }
    repository.removeTemp(guild.id, existing.channelId); // enregistrement orphelin
  }

  const counter = repository.nextCounter(guild.id, generator.channelId);
  const name = tempVoiceVariables.renderChannelName(generator.nameFormat, { member, user: member.user, counter });
  const parent =
    generator.categoryId && guild.channels.cache.get(generator.categoryId)?.type === ChannelType.GuildCategory
      ? generator.categoryId
      : guild.channels.cache.get(generator.channelId)?.parentId ?? null;

  const channel = await guild.channels
    .create({
      name,
      type: ChannelType.GuildVoice,
      parent,
      userLimit: generator.userLimit > 0 ? generator.userLimit : undefined,
      reason: `Salon vocal temporaire de ${member.user.tag}`,
    })
    .catch(() => null);
  if (!channel) {
    await logVoice(guild, 'error', [{ name: t('tempVoice.field.owner'), value: `${member.user.tag}`, inline: true }], COLORS.ERROR);
    return { ok: false, code: 'createFailed' };
  }

  // Synchronise les permissions du salon sur celles de sa catégorie : le salon
  // en hérite intégralement et aucune permission n'est copiée manuellement. Le
  // propriétaire ne reçoit aucune permission de gestion (renommage via commande).
  if (channel.parentId) await channel.lockPermissions().catch(() => null);

  const moved = await member.voice.setChannel(channel).then(() => true).catch(() => false);
  // Si le déplacement échoue (le membre a déjà quitté), on nettoie aussitôt.
  if (!moved && (channel.members?.size ?? 0) === 0) {
    await channel.delete('Déplacement impossible').catch(() => null);
    return { ok: false, code: 'moveFailed' };
  }

  const temp = { channelId: channel.id, guildId: guild.id, generatorId: generator.channelId, ownerId: member.id, name, createdAt: new Date().toISOString() };
  repository.saveTemp(temp);
  repository.recordCreated(guild.id);
  await logVoice(
    guild,
    'created',
    [
      { name: t('tempVoice.field.channel'), value: `${channel}`, inline: true },
      { name: t('tempVoice.field.owner'), value: `<@${member.id}>`, inline: true },
    ],
    COLORS.LOG_CREATE,
  );
  return { ok: true, channel, temp };
}

/** Supprime un salon temporaire devenu vide et nettoie les données. */
async function deleteTempChannel(guild, channel, { reason = 'vide' } = {}) {
  const temp = repository.getTemp(guild.id, channel.id);
  if (!temp) return { ok: false, code: 'notTemp' };

  repository.removeTemp(guild.id, channel.id);
  repository.recordDeleted(guild.id);
  await channel.delete(`Salon vocal temporaire supprimé (${reason})`).catch(() => null);
  await logVoice(
    guild,
    'deleted',
    [
      { name: t('tempVoice.field.channel'), value: `\`${temp.name}\``, inline: true },
      { name: t('tempVoice.field.owner'), value: `<@${temp.ownerId}>`, inline: true },
    ],
    COLORS.LOG_DELETE,
  );
  return { ok: true, temp };
}

/**
 * Point d'entrée de l'événement voiceStateUpdate : gère la création (entrée
 * dans un générateur) et la suppression (salon temporaire devenu vide).
 */
async function handleVoiceState(oldState, newState) {
  const guild = newState.guild ?? oldState.guild;
  const member = newState.member ?? oldState.member;

  // Suppression : un salon temporaire quitté et désormais vide.
  const oldChannel = oldState.channel;
  if (oldChannel && oldChannel.id !== newState.channelId && repository.isTemp(guild.id, oldChannel.id)) {
    if ((oldChannel.members?.size ?? 0) === 0) {
      await deleteTempChannel(guild, oldChannel).catch(() => null);
    }
  }

  // Création : entrée dans un salon générateur.
  const newChannel = newState.channel;
  if (member && newChannel && repository.isGenerator(guild.id, newChannel.id)) {
    const generator = repository.getGenerator(guild.id, newChannel.id);
    await createTempChannel(guild, member, generator).catch(() => null);
  }
}

/**
 * Renomme le salon temporaire du membre (commande renamevoice).
 * Vérifie qu'il est bien propriétaire et présent dans son salon.
 * @returns {Promise<{ ok: true, name } | { ok: false, code }>}
 */
async function renameOwnChannel(guild, member, rawName) {
  const channel = member.voice?.channel;
  if (!channel) return { ok: false, code: 'notInVoice' };
  const temp = repository.getTemp(guild.id, channel.id);
  if (!temp) return { ok: false, code: 'notTemp' };
  if (temp.ownerId !== member.id) return { ok: false, code: 'notOwner' };

  const name = String(rawName ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!name) return { ok: false, code: 'invalidName' };

  const previousName = temp.name;
  const renamed = await channel.setName(name, `Renommé par le propriétaire ${member.user.tag}`).then(() => true).catch(() => false);
  if (!renamed) return { ok: false, code: 'renameFailed' };

  // Persistance : nom courant + date du dernier renommage (l'identifiant, le
  // propriétaire et la date de création sont déjà conservés).
  temp.name = name;
  temp.renamedAt = new Date().toISOString();
  repository.saveTemp(temp);

  await logVoice(
    guild,
    'renamed',
    [
      { name: t('tempVoice.field.channel'), value: `${channel}`, inline: true },
      { name: t('tempVoice.field.owner'), value: `<@${member.id}>`, inline: true },
      { name: t('tempVoice.field.oldName'), value: `\`${previousName}\``, inline: true },
      { name: t('tempVoice.field.newName'), value: `\`${name}\``, inline: true },
      { name: t('tempVoice.field.server'), value: `${guild.name}`, inline: true },
    ],
    COLORS.LOG_UPDATE,
  );
  return { ok: true, name, previousName };
}

/**
 * Nettoyage au démarrage : supprime les salons temporaires disparus ou vides
 * (fermés pendant que le bot était hors ligne) et purge les enregistrements
 * orphelins.
 */
async function cleanupOnStart(client) {
  for (const temp of repository.allTemps()) {
    const guild = client.guilds.cache.get(temp.guildId);
    if (!guild) continue;
    const channel = guild.channels.cache.get(temp.channelId);
    if (!channel) {
      repository.removeTemp(temp.guildId, temp.channelId);
      continue;
    }
    if ((channel.members?.size ?? 0) === 0) {
      await deleteTempChannel(guild, channel, { reason: 'nettoyage au démarrage' }).catch(() => null);
    }
  }
}

module.exports = {
  handleVoiceState,
  createTempChannel,
  deleteTempChannel,
  renameOwnChannel,
  cleanupOnStart,
  logVoice,
};
