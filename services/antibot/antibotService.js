/**
 * Moteur de protection anti-bot.
 *
 * À l'arrivée d'un bot (quand la protection est activée) : enregistre
 * l'événement, tente d'identifier l'utilisateur ayant ajouté le bot (via
 * les logs d'audit natifs, si le bot dispose de « Voir les logs d'audit »),
 * et notifie les modérateurs (logs). Détecte les ajouts massifs (raid de
 * bots) à l'aide d'une fenêtre glissante par serveur.
 *
 * Options futures prévues par l'architecture (non destructif par défaut) :
 * validation manuelle, liste blanche, liste noire, approbation automatique.
 */
const { AuditLogEvent } = require('discord.js');
const protectionService = require('../protections/protectionService');
const globalReputationService = require('../reputation/globalReputationService');
const { t } = require('../../utils/helpers/i18n');

const RAID_WINDOW_MS = 30000; // fenêtre de détection d'ajouts massifs
const RAID_THRESHOLD = 3; // bots ajoutés dans la fenêtre → raid

/** Horodatages des arrivées de bots par serveur. */
const botJoinTracker = new Map();

function pruneWindow(timestamps, now) {
  return (timestamps ?? []).filter((at) => now - at < RAID_WINDOW_MS);
}

/**
 * Identifie l'utilisateur ayant ajouté un bot via les logs d'audit.
 * @returns {Promise<import('discord.js').User|null>}
 */
async function findBotAdder(guild, botId) {
  const me = guild.members.me;
  if (!me?.permissions.has('ViewAuditLog')) return null;
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 }).catch(() => null);
  const entry = logs?.entries.find((auditEntry) => auditEntry.target?.id === botId);
  return entry?.executor ?? null;
}

/**
 * Point d'entrée appelé à l'arrivée d'un membre (GuildMemberAdd).
 * @returns {Promise<boolean>} true si un bot a été traité
 */
async function handleMemberAdd(member) {
  if (!member.user.bot) return false;
  if (!protectionService.isEnabled(member.guild.id, 'antibot')) return false;

  const now = Date.now();
  const stamps = pruneWindow(botJoinTracker.get(member.guild.id), now);
  stamps.push(now);
  botJoinTracker.set(member.guild.id, stamps);

  protectionService.bumpStat(member.guild.id, 'botsJoined');
  const adder = await findBotAdder(member.guild, member.id);
  const isRaid = stamps.length >= RAID_THRESHOLD;
  if (isRaid) protectionService.bumpStat(member.guild.id, 'raidsBlocked');

  await protectionService.logProtection(member.guild, isRaid ? 'botRaid' : 'botJoin', {
    color: isRaid ? protectionService.COLORS.ERROR : protectionService.COLORS.WARNING,
    user: member.user,
    fields: [
      { name: t('protections.field.bot'), value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
      { name: t('protections.field.addedBy'), value: adder ? `${adder.tag} (\`${adder.id}\`)` : t('protections.field.unknownAdder'), inline: true },
      ...(isRaid ? [{ name: t('protections.field.reason'), value: t('protections.bot.raid', { count: stamps.length }) }] : []),
    ],
  });
  // Réputation globale : impute l'ajout d'un bot malveillant au membre qui l'a ajouté.
  if (adder && !adder.bot) {
    globalReputationService.record({ guild: member.guild, user: adder, action: 'antibot', reason: isRaid ? 'raid de bots' : 'ajout de bot', automatic: true }).catch(() => null);
  }
  return true;
}

module.exports = { handleMemberAdd, findBotAdder };
