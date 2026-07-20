/**
 * Commande owner `commandaudit` (slash + préfixe, comme toute commande).
 *
 * Génère à la demande un audit de parité slash / préfixe de l'intégralité des
 * commandes (voir services/audit/commandParityService) et affiche :
 *   - les statistiques (total, compatibles slash, compatibles préfixe, parité) ;
 *   - les commandes sans équivalent (normalement aucune : la parité est
 *     structurelle) ;
 *   - les incohérences restantes (critiques et avertissements) ;
 *   - la date du dernier audit.
 *
 * La logique métier vit entièrement dans le service : la commande ne fait que
 * la déclencher et présenter le résultat.
 */
const { EmbedBuilder } = require('discord.js');
const { runAudit, SEVERITY } = require('../../services/audit/commandParityService');
const auditRepository = require('../../database/commandAuditRepository');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

/** Nombre maximal d'anomalies détaillées dans l'embed (le reste est résumé). */
const MAX_ISSUES = 12;

module.exports = {
  name: 'commandaudit',
  ownerOnly: true,
  description: 'Audit de parité slash / préfixe de toutes les commandes (réservé aux owners)',
  usage: 'commandaudit',
  examples: ['commandaudit'],
  aliases: ['cmdaudit', 'auditcommands'],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    const report = runAudit();
    auditRepository.saveSummary(report);

    const color = report.criticalCount > 0 ? COLORS.ERROR : report.warningCount > 0 ? COLORS.INFO : COLORS.SUCCESS;
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(t('audit.command.title'))
      .setTimestamp(new Date(report.generatedAt))
      .setFooter({ text: t('audit.command.footer', { date: new Date(report.generatedAt).toLocaleString('fr-FR') }) });

    embed.addFields({
      name: t('audit.command.statsField'),
      value: t('audit.command.stats', {
        total: report.total,
        slash: report.slashCompatible,
        prefix: report.prefixCompatible,
        dual: report.dualParity,
      }),
    });

    // Parité : commandes disponibles dans un seul mode (anomalie de conception).
    let missingValue = t('audit.command.missingNone');
    if (report.missingSlash.length || report.missingPrefix.length) {
      const parts = [];
      if (report.missingSlash.length) parts.push(t('audit.command.missingSlash', { list: report.missingSlash.join(', ') }));
      if (report.missingPrefix.length) parts.push(t('audit.command.missingPrefix', { list: report.missingPrefix.join(', ') }));
      missingValue = parts.join('\n');
    }
    embed.addFields({ name: t('audit.command.missingField'), value: missingValue });

    // Incohérences restantes.
    let issuesValue = t('audit.command.issuesNone');
    if (report.issues.length) {
      const shown = report.issues.slice(0, MAX_ISSUES).map((issue) =>
        t('audit.command.issueLine', {
          severity: issue.severity === SEVERITY.CRITICAL ? t('audit.command.severityCritical') : t('audit.command.severityWarning'),
          command: issue.command,
          message: issue.message,
        }),
      );
      if (report.issues.length > MAX_ISSUES) {
        shown.push(t('audit.command.moreIssues', { count: report.issues.length - MAX_ISSUES }));
      }
      issuesValue = shown.join('\n');
    }
    embed.addFields({
      name: t('audit.command.issuesField', { critical: report.criticalCount, warning: report.warningCount }),
      value: issuesValue.slice(0, 1024),
    });

    // Nouvelles commandes non encore chargées (détection automatique) : écart
    // entre les commandes en mémoire et celles présentes sur le disque.
    const loaded = ctx.client?.commands?.size;
    if (typeof loaded === 'number' && loaded !== report.total) {
      embed.addFields({ name: '​', value: t('audit.command.loadedMismatch', { loaded, onDisk: report.total }) });
    }

    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
};
