/**
 * Commande owner `permserver` (slash + préfixe) : gère la **liste des serveurs
 * autorisés** pour la commande `addperm`.
 *
 * - `permserver list` : liste des serveurs autorisés (tous les owners).
 * - `permserver add <idServeur>` / `permserver remove <idServeur>` : modification
 *   de la liste, réservée à l'**owner principal** uniquement (OWNER_ID).
 *
 * Sans identifiant, `add`/`remove` visent le serveur courant (raccourci).
 */
const ownerService = require('../../services/owners/ownerService');
const authorizedGuildRepository = require('../../database/authorizedGuildRepository');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const ACTIONS = { add: 'add', ajouter: 'add', remove: 'remove', retirer: 'remove', delete: 'remove', supprimer: 'remove', list: 'list', liste: 'list' };

function normalizeAction(input) {
  return ACTIONS[(input ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] ?? null;
}

/** Extrait un identifiant de serveur (ID brut). */
function parseGuildId(raw, ctx) {
  if (raw) {
    const m = String(raw).match(/^(\d{17,20})$/);
    return m ? m[1] : null;
  }
  return ctx.guild?.id ?? null;
}

function buildListEmbed(client) {
  const entries = authorizedGuildRepository.getAll();
  if (entries.length === 0) return infoEmbed(t('perm.server.listTitle'), t('perm.server.listEmpty'));
  const lines = entries.map((e) => {
    const name = client.guilds.cache.get(e.id)?.name ?? t('perm.server.unknownGuild');
    const added = e.addedAt ? `<t:${Math.floor(Date.parse(e.addedAt) / 1000)}:d>` : '—';
    return `• **${name}** (\`${e.id}\`) — ${added}${e.addedBy ? ` · <@${e.addedBy}>` : ''}`;
  });
  return infoEmbed(t('perm.server.listTitle'), lines.join('\n').slice(0, 4000));
}

module.exports = {
  name: 'permserver',
  ownerOnly: true,
  description: 'Gère la liste des serveurs autorisés pour addperm (modification : owner principal)',
  usage: 'permserver <add|remove|list> [idServeur]',
  examples: ['permserver list', 'permserver add 123456789012345678', 'permserver remove 123456789012345678'],
  aliases: ['permserveur'],
  cooldown: 3,
  args: [
    { name: 'action', type: 'string', required: true, choices: ['add', 'remove', 'list'], description: 'add, remove ou list' },
    { name: 'serveur', type: 'string', required: false, description: 'Identifiant du serveur (défaut : serveur courant)' },
  ],
  async execute(ctx) {
    const action = normalizeAction(ctx.options.action);
    if (!action) return ctx.reply({ embeds: [errorEmbed(t('perm.server.badAction'))], ephemeral: true });

    if (action === 'list') {
      return ctx.reply({ embeds: [buildListEmbed(ctx.client)], ephemeral: true });
    }

    // Seul l'owner principal peut modifier la liste.
    if (!ownerService.isPrimaryOwner(ctx.user.id)) {
      return ctx.reply({ embeds: [errorEmbed(t('perm.server.primaryOnly'))], ephemeral: true });
    }

    const guildId = parseGuildId(ctx.options.serveur, ctx);
    if (!guildId) return ctx.reply({ embeds: [errorEmbed(t('perm.server.needId'))], ephemeral: true });
    const guildName = ctx.client.guilds.cache.get(guildId)?.name ?? guildId;

    if (action === 'add') {
      const { added } = authorizedGuildRepository.add(guildId, ctx.user.id);
      return ctx.reply({ embeds: [successEmbed(t(added ? 'perm.server.added' : 'perm.server.alreadyAdded', { guild: guildName, id: guildId }))] });
    }
    const { removed } = authorizedGuildRepository.remove(guildId);
    return ctx.reply({ embeds: [successEmbed(t(removed ? 'perm.server.removed' : 'perm.server.notFound', { guild: guildName, id: guildId }))] });
  },
};
