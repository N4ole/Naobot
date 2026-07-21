/**
 * Commande renamevoice : permet au propriétaire d'un salon vocal temporaire
 * de le renommer. Le renommage est arbitré par le bot (le propriétaire ne
 * reçoit aucune permission de gestion Discord), ce qui restreint son pouvoir
 * au seul nom du salon. La logique vit dans services/temporaryVoice.
 */
const tempVoiceService = require('../../services/temporaryVoice/tempVoiceService');
const { successEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const ERROR_KEYS = {
  notInVoice: 'tempVoice.rename.notInVoice',
  notTemp: 'tempVoice.rename.notTemp',
  notOwner: 'tempVoice.rename.notOwner',
  invalidName: 'tempVoice.rename.invalidName',
  renameFailed: 'tempVoice.rename.failed',
};

module.exports = {
  name: 'renamevoice',
  description: 'Renomme votre salon vocal temporaire (propriétaire uniquement)',
  usage: 'renamevoice <nom>',
  examples: ['renamevoice Squad tryhard', 'renamevoice 🎮 Détente'],
  aliases: ['vcrename'],
  cooldown: 10,
  args: [{ name: 'nom', type: 'string', required: true, rest: true, description: 'Le nouveau nom du salon' }],
  async execute(ctx) {
    const result = await tempVoiceService.renameOwnChannel(ctx.guild, ctx.member, ctx.options.nom);
    if (!result.ok) {
      return ctx.reply({ embeds: [errorEmbed(t(ERROR_KEYS[result.code] ?? 'tempVoice.rename.failed'))], ephemeral: true });
    }
    return ctx.reply({ embeds: [successEmbed(t('tempVoice.rename.done', { name: result.name }), { emoji: 'happy' })], ephemeral: true });
  },
};
