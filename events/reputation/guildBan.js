/**
 * Capture des bannissements (via NaoBot ou manuels) pour la réputation
 * globale. GuildBanAdd couvre les deux cas ; l'audit log fournit le modérateur
 * et la raison quand ils sont disponibles. Le service applique ses propres
 * garde-fous anti-abus.
 */
const { Events, AuditLogEvent } = require('discord.js');
const globalReputationService = require('../../services/reputation/globalReputationService');

module.exports = {
  name: Events.GuildBanAdd,
  async execute(ban) {
    const guild = ban.guild;
    let moderator = null;
    let reason = ban.reason ?? null;
    // Recherche best-effort de l'auteur dans les logs d'audit.
    const audit = await guild
      .fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 5 })
      .catch(() => null);
    const entry = audit?.entries.find((e) => e.target?.id === ban.user.id);
    if (entry) {
      moderator = entry.executor ?? null;
      reason = reason ?? entry.reason ?? null;
    }
    await globalReputationService
      .record({ guild, user: ban.user, moderator, action: 'ban', reason, automatic: !entry })
      .catch(() => null);
  },
};
