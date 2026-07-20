/**
 * Au démarrage : audit automatique de parité slash / préfixe.
 *
 * Rejoue l'audit sur les commandes réellement présentes (détection automatique
 * de toute nouvelle commande) et émet des **avertissements en console** pour
 * chaque incohérence, afin qu'elles soient traitées pendant le développement.
 * Une incohérence critique au démarrage signale une commande qui ne
 * fonctionnerait que dans un seul mode (slash ou préfixe).
 *
 * Le démarrage n'est pas interrompu : le blocage strict est du ressort du hook
 * pre-commit (scripts/checkCommandParity.js). Le résumé est persisté pour la
 * commande owner `commandaudit` (« date du dernier audit »).
 */
const { Events } = require('discord.js');
const { runAudit, SEVERITY } = require('../../services/audit/commandParityService');
const auditRepository = require('../../database/commandAuditRepository');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    const report = runAudit();
    auditRepository.saveSummary(report);

    if (report.criticalCount === 0 && report.warningCount === 0) {
      console.log(`[audit] Parité slash/préfixe OK (${report.total} commandes).`);
    } else {
      console.warn(
        `[audit] Parité slash/préfixe : ${report.criticalCount} critique(s), ${report.warningCount} avertissement(s) sur ${report.total} commandes.`,
      );
      for (const issue of report.issues) {
        const tag = issue.severity === SEVERITY.CRITICAL ? 'CRITIQUE' : 'AVERT.';
        console.warn(`[audit] [${tag}] ${issue.command} (${issue.code}) : ${issue.message}`);
      }
    }

    // Détection d'un écart entre les commandes chargées et celles sur disque
    // (ex. : fichier ignoré faute de name/execute).
    const loaded = client?.commands?.size;
    if (typeof loaded === 'number' && loaded !== report.total) {
      console.warn(`[audit] ${loaded} commande(s) chargée(s) en mémoire mais ${report.total} déclarée(s) sur disque.`);
    }
  },
};
