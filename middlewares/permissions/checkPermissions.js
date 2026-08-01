/**
 * Middleware de permissions, appliqué avant chaque commande (slash et préfixe).
 *
 * Deux niveaux de vérification :
 * 1. checkCommandPermissions : permissions Discord de l'auteur et du bot,
 *    définies de façon centralisée dans config/permissions.js.
 * 2. checkTargetHierarchy : hiérarchie des rôles vis-à-vis du membre ciblé
 *    (appelé par les services de modération, une fois la cible connue).
 */
const permissionsConfig = require('../../config/permissions');
const permissionLabels = require('../../utils/constants/permissionLabels');
const { checkOwner } = require('./ownerCheck');
const { t } = require('../../utils/helpers/i18n');

function labelize(permissionNames) {
  return permissionNames.map((name) => permissionLabels[name] ?? name).join(', ');
}

/**
 * Vérifie que l'auteur et le bot disposent des permissions requises
 * pour la commande.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function checkCommandPermissions(ctx, command) {
  // Les commandes ownerOnly relèvent du système d'owners global du bot,
  // totalement indépendant des permissions Discord.
  if (command.ownerOnly) {
    const owner = checkOwner(ctx.user.id);
    if (!owner.ok) return owner;
  }

  const rules = permissionsConfig[command.name];
  if (!rules) return { ok: true };

  if (rules.user?.length) {
    const missing = ctx.member.permissions.missing(rules.user);
    if (missing.length > 0) {
      return { ok: false, error: t('errors.missingUserPerms', { perms: labelize(missing) }) };
    }
  }

  if (rules.bot?.length) {
    const missing = ctx.guild.members.me.permissions.missing(rules.bot);
    if (missing.length > 0) {
      return { ok: false, error: t('errors.missingBotPerms', { perms: labelize(missing) }) };
    }
  }

  return { ok: true };
}

/**
 * Vérifie que le bot possède des permissions **au moment précis d'une action**.
 *
 * Complément indispensable de la règle de moindre privilège : une commande ne
 * déclare dans `bot` que ce qu'elle exécute systématiquement ; tout ce qui est
 * conditionnel (une sous-commande qui crée des salons, une restauration de
 * sauvegarde…) se vérifie ici, juste avant d'agir.
 *
 * @param {import('discord.js').Guild} guild
 * @param {bigint[]} permissions
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function checkBotPermissions(guild, permissions) {
  const me = guild?.members?.me;
  if (!me) return { ok: true };
  const missing = me.permissions.missing(permissions);
  if (missing.length === 0) return { ok: true };
  return { ok: false, error: t('errors.missingBotPerms', { perms: labelize(missing) }) };
}

/**
 * Vérifie la hiérarchie des rôles entre l'auteur, le bot et le membre ciblé.
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @param {import('discord.js').GuildMember} target
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function checkTargetHierarchy(ctx, target) {
  if (target.id === ctx.user.id) return { ok: false, error: t('errors.hierarchySelf') };
  if (target.id === ctx.client.user.id) return { ok: false, error: t('errors.hierarchyBot') };
  if (target.id === ctx.guild.ownerId) return { ok: false, error: t('errors.hierarchyOwner') };

  const authorIsOwner = ctx.member.id === ctx.guild.ownerId;
  if (!authorIsOwner && ctx.member.roles.highest.position <= target.roles.highest.position) {
    return { ok: false, error: t('errors.hierarchyUserAbove') };
  }

  if (ctx.guild.members.me.roles.highest.position <= target.roles.highest.position) {
    return { ok: false, error: t('errors.hierarchyBotAbove') };
  }

  return { ok: true };
}

module.exports = { checkCommandPermissions, checkBotPermissions, checkTargetHierarchy };
