/**
 * Logique de la commande owner `addperm` : attribue à l'owner qui l'exécute un
 * rôle **administrateur** sur un serveur **autorisé**, puis notifie par message
 * privé **tous les owners** du bot ainsi que le **propriétaire du serveur**
 * (transparence et traçabilité).
 *
 * La logique métier vit ici ; la commande ne fait que déléguer et présenter le
 * résultat. Jamais bloquant : les échecs de MP sont silencieux, l'action reste
 * effective.
 */
const { PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config');
const ownerService = require('./ownerService');
const logService = require('../logs/logService');
const emojis = require('../../config/emojis');
const COLORS = require('../../utils/constants/colors');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const { dmUser } = require('../../utils/helpers/discordUtils');
const { t } = require('../../utils/helpers/i18n');

/**
 * Crée (ou réutilise) le rôle administrateur et l'attribue au membre.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember} member
 * @returns {Promise<{ ok: boolean, role?: import('discord.js').Role, already?: boolean, code?: string }>}
 */
async function grantAdminRole(guild, member) {
  const me = guild.members.me;
  // Discord interdit d'accorder une permission que le bot ne possède pas.
  if (!me?.permissions.has(PermissionFlagsBits.Administrator)) return { ok: false, code: 'botNoAdmin' };

  let role = guild.roles.cache.find((r) => r.name === config.adminRoleName);
  if (!role) {
    role = await guild.roles
      .create({ name: config.adminRoleName, permissions: [PermissionFlagsBits.Administrator], reason: 'addperm — rôle administrateur pour un owner du bot' })
      .catch(() => null);
    if (!role) return { ok: false, code: 'roleCreateFailed' };
  }
  if (member.roles.cache.has(role.id)) return { ok: true, role, already: true };

  const assigned = await member.roles.add(role, `addperm par ${member.user.tag}`).then(() => true).catch(() => false);
  if (!assigned) return { ok: false, code: 'assignFailed' };
  return { ok: true, role };
}

/** Notifie tous les owners (sauf l'auteur) et le propriétaire du serveur. */
async function notify(client, guild, invoker, role) {
  const at = `<t:${Math.floor(Date.now() / 1000)}:F>`;

  for (const ownerId of ownerService.getAllOwnerIds()) {
    if (ownerId === invoker.id) continue;
    const user = await client.users.fetch(ownerId).catch(() => null);
    if (user) {
      await dmUser(user, t('perm.dm.owner', { invoker: invoker.tag, invokerId: invoker.id, guild: guild.name, guildId: guild.id, role: role.name, at }));
    }
  }

  const guildOwner = await guild.fetchOwner().catch(() => null);
  if (guildOwner) {
    await dmUser(guildOwner.user, t('perm.dm.guildOwner', { bot: client.user.username, invoker: invoker.tag, guild: guild.name, role: role.name, at }));
  }
}

/**
 * Attribue le rôle admin à l'auteur puis notifie. Journalise l'action dans les
 * logs du serveur (catégorie modération) pour la transparence côté serveur.
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @returns {Promise<{ ok: boolean, role?: object, already?: boolean, code?: string }>}
 */
async function grantAndNotify(ctx) {
  const result = await grantAdminRole(ctx.guild, ctx.member);
  if (!result.ok) return result;

  await notify(ctx.client, ctx.guild, ctx.user, result.role).catch(() => null);
  await logService
    .log(
      ctx.guild,
      'moderation',
      logEventEmbed({
        title: `${emojis.get('glitch')} ${t('perm.log.granted')}`,
        color: COLORS.WARNING,
        user: ctx.user,
        fields: [
          { name: t('common.member'), value: `${ctx.user.tag} (\`${ctx.user.id}\`)`, inline: true },
          { name: t('perm.log.role'), value: result.role.name, inline: true },
        ],
      }),
    )
    .catch(() => null);
  return result;
}

module.exports = { grantAdminRole, grantAndNotify };
