/**
 * Moindre privilège des permissions du bot.
 *
 * La vérification Discord refuse qu'une commande **exige** une permission dont
 * elle n'a pas besoin pour fonctionner. Ce test verrouille la règle : `bot` ne
 * contient que ce que la commande exécute réellement et systématiquement ; ce
 * qui est conditionnel ou différé vit dans `FEATURE_PERMISSIONS`, documenté
 * mais jamais bloquant.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionsBitField, PermissionFlagsBits } = require('discord.js');

const permissions = require('../config/permissions');
const { checkCommandPermissions, checkBotPermissions } = require('../middlewares/permissions/checkPermissions');
const warn = require('../commands/moderation/warn');

/** Contexte minimal : permissions de l'auteur et du bot. */
function context(userBits, botBits) {
  return {
    user: { id: 'u1', tag: 'Mod#1' },
    member: { permissions: new PermissionsBitField(userBits) },
    guild: { id: 'g1', members: { me: { permissions: new PermissionsBitField(botBits) } } },
  };
}

test('warn : le bot n’exige aucune permission (signalé par la vérification Discord)', () => {
  assert.deepEqual(permissions.warn.bot, [], 'un avertissement est un enregistrement + un MP + un log');
  // Un modérateur peut avertir même si le bot n'a aucune permission de sanction.
  const result = checkCommandPermissions(context([PermissionFlagsBits.ModerateMembers], []), warn);
  assert.equal(result.ok, true, 'la commande warn ne doit plus être bloquée');
});

test('warn : les permissions de la sanction restent documentées, sans bloquer', () => {
  const feature = permissions.FEATURE_PERMISSIONS.warn;
  // L'escalade peut réclamer l'une ou l'autre selon le palier configuré.
  for (const bit of [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers]) {
    assert.ok(feature.includes(bit), 'la permission de sanction doit rester documentée');
  }
});

test('les commandes de configuration n’exigent rien du bot', () => {
  // Leur effet (rôle, expulsion, suppression) est produit plus tard par un
  // écouteur d'événement : l'exiger à la configuration serait sur-demander.
  for (const name of ['captcha', 'levelconfig', 'setwelcome', 'reactionrole', 'antispam', 'antilink', 'antipub', 'antisensitive', 'logs', 'backup']) {
    assert.deepEqual(permissions[name].bot, [], `${name} ne doit exiger aucune permission du bot`);
    assert.ok(permissions.FEATURE_PERMISSIONS[name]?.length, `${name} doit documenter ses permissions de fonctionnement`);
  }
});

test('les commandes qui agissent vraiment gardent leurs permissions', () => {
  const expected = {
    ban: PermissionFlagsBits.BanMembers,
    kick: PermissionFlagsBits.KickMembers,
    timeout: PermissionFlagsBits.ModerateMembers,
    mute: PermissionFlagsBits.ManageRoles,
    purge: PermissionFlagsBits.ManageMessages,
    voicecreate: PermissionFlagsBits.ManageChannels,
    addperm: PermissionFlagsBits.Administrator,
  };
  for (const [name, bit] of Object.entries(expected)) {
    assert.ok(permissions[name].bot.includes(bit), `${name} doit continuer d'exiger sa permission`);
  }
  // Ces commandes restent bloquées si le bot n'a pas la permission.
  const result = checkCommandPermissions(context([PermissionFlagsBits.BanMembers], []), { name: 'ban' });
  assert.equal(result.ok, false, 'ban doit rester bloqué sans BanMembers');
});

test('voicecreate : « Déplacer les membres » n’est plus exigée (usage différé)', () => {
  assert.ok(!permissions.voicecreate.bot.includes(PermissionFlagsBits.MoveMembers));
  assert.ok(permissions.FEATURE_PERMISSIONS.voicecreate.includes(PermissionFlagsBits.MoveMembers));
});

test('checkBotPermissions : vérification au moment de l’action', () => {
  const guild = { members: { me: { permissions: new PermissionsBitField([PermissionFlagsBits.ManageChannels]) } } };
  assert.equal(checkBotPermissions(guild, [PermissionFlagsBits.ManageChannels]).ok, true);
  const denied = checkBotPermissions(guild, [PermissionFlagsBits.ManageRoles]);
  assert.equal(denied.ok, false);
  assert.match(denied.error, /rôles/i, 'le message doit nommer la permission manquante');
  // Sans serveur (message privé), la vérification ne bloque jamais.
  assert.equal(checkBotPermissions(null, [PermissionFlagsBits.ManageRoles]).ok, true);
});

test('FEATURE_PERMISSIONS n’est pas confondue avec une commande', () => {
  assert.ok(!Object.keys(permissions).includes('FEATURE_PERMISSIONS'), 'doit être non énumérable');
  assert.ok(permissions.FEATURE_PERMISSIONS, 'mais rester accessible');
  // Toute entrée documentée doit correspondre à une commande déclarée.
  for (const name of Object.keys(permissions.FEATURE_PERMISSIONS)) {
    assert.ok(permissions[name], `FEATURE_PERMISSIONS déclare "${name}" sans entrée de commande`);
  }
});

test('aucune commande n’exige une permission absente de son exécution (garde-fou)', () => {
  // Liste blanche : commandes dont l'exécution mute réellement Discord.
  const legitimate = new Set([
    'ban', 'unban', 'kick', 'mute', 'unmute', 'timeout', 'untimeout', 'purge',
    'bump', 'watch', 'urgence', 'ticketcategory', 'ticketpanel', 'voicecreate',
    'voiceedit', 'voicedelete', 'renamevoice', 'addperm',
  ]);
  for (const [name, rules] of Object.entries(permissions)) {
    if (rules.bot?.length && !legitimate.has(name)) {
      assert.fail(`${name} exige ${rules.bot.length} permission(s) du bot sans être dans la liste des commandes qui mutent Discord`);
    }
  }
});
