/**
 * Commande owner `emojiaudit` (slash + préfixe).
 *
 * Génère à la demande l'audit d'usage des émojis officiels
 * (services/audit/emojiAuditService) et affiche :
 *   - le nombre total d'embeds (modules construisant des embeds) ;
 *   - le nombre utilisant les émojis officiels + la couverture ;
 *   - les modules non conformes ;
 *   - les identifiants d'émoji écrits en dur (interdits) ;
 *   - la date du dernier audit.
 */
const { EmbedBuilder } = require('discord.js');
const { runEmojiAudit } = require('../../services/audit/emojiAuditService');
const auditRepository = require('../../database/emojiAuditRepository');
const emojis = require('../../config/emojis');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

/** Nombre maximal de modules non conformes détaillés dans l'embed. */
const MAX_LISTED = 15;

module.exports = {
  name: 'emojiaudit',
  ownerOnly: true,
  description: 'Audit d\'usage des émojis officiels dans les embeds (réservé aux owners)',
  usage: 'emojiaudit',
  examples: ['emojiaudit'],
  aliases: ['auditemojis'],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    const report = runEmojiAudit();
    auditRepository.saveSummary(report);

    const hasViolation = report.hardcodedEmojiFiles.length || report.categoryLogoViolations.length;
    const color = hasViolation ? COLORS.ERROR : COLORS.SUCCESS;
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${emojis.get('basic')} ${t('emojiAudit.title')}`)
      .setTimestamp(new Date(report.generatedAt))
      .setFooter({ text: t('emojiAudit.footer', { date: new Date(report.generatedAt).toLocaleString('fr-FR') }) });

    embed.addFields({
      name: t('emojiAudit.statsField'),
      value: t('emojiAudit.stats', {
        total: report.totalEmbedModules,
        official: report.officialUsageModules,
        coverage: report.coverage,
      }),
    });

    // Identifiants d'émoji en dur (interdits hors config/emojis.js).
    embed.addFields({
      name: t('emojiAudit.hardcodedField'),
      value: report.hardcodedEmojiFiles.length
        ? report.hardcodedEmojiFiles.map((f) => `\`${f}\``).join(', ').slice(0, 1024)
        : t('emojiAudit.hardcodedNone'),
    });

    // Émojis personnalisés réutilisés comme logos de catégories (interdit).
    embed.addFields({
      name: t('emojiAudit.categoryLogoField'),
      value: report.categoryLogoViolations.length
        ? report.categoryLogoViolations.map((f) => `\`${f}\``).join(', ').slice(0, 1024)
        : t('emojiAudit.categoryLogoNone'),
    });

    // Modules non conformes (embeds sans émoji officiel).
    let nonCompliant = t('emojiAudit.nonCompliantNone');
    if (report.nonCompliantModules.length) {
      const shown = report.nonCompliantModules.slice(0, MAX_LISTED).map((f) => `\`${f}\``);
      if (report.nonCompliantModules.length > MAX_LISTED) {
        shown.push(t('emojiAudit.more', { count: report.nonCompliantModules.length - MAX_LISTED }));
      }
      nonCompliant = shown.join('\n');
    }
    embed.addFields({
      name: t('emojiAudit.nonCompliantField', { count: report.nonCompliantModules.length }),
      value: nonCompliant.slice(0, 1024),
    });

    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
};
