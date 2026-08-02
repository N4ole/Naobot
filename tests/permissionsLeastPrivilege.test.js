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
  // Leur effet (rôle, expulsion, suppression, création de salon) est produit
  // plus tard par un écouteur d'événement ou par l'action d'un membre :
  // l'exiger à la configuration serait sur-demander.
  const configCommands = [
    'captcha', 'levelconfig', 'setwelcome', 'reactionrole',
    'antispam', 'antilink', 'antipub', 'antisensitive', 'logs', 'backup',
    // Tickets : le salon est créé quand un membre ouvre un ticket, pas quand
    // un administrateur déclare une catégorie ou publie un panneau.
    'ticketcategory', 'ticketpanel',
    // Vocaux temporaires : ces commandes ne font que **désigner** un salon
    // générateur existant ; rien n'est créé, renommé ni supprimé.
    'voicecreate', 'voiceedit', 'voicedelete',
  ];
  for (const name of configCommands) {
    assert.deepEqual(permissions[name].bot, [], `${name} ne doit exiger aucune permission du bot`);
  }
  // Celles dont le fonctionnement réclame vraiment une permission plus tard la
  // documentent (voiceedit/voicedelete n'agissent jamais sur Discord).
  for (const name of configCommands.filter((n) => !['voiceedit', 'voicedelete'].includes(n))) {
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
    watch: PermissionFlagsBits.ManageChannels,
    renamevoice: PermissionFlagsBits.ManageChannels,
    bump: PermissionFlagsBits.CreateInstantInvite,
    addperm: PermissionFlagsBits.Administrator,
  };
  for (const [name, bit] of Object.entries(expected)) {
    assert.ok(permissions[name].bot.includes(bit), `${name} doit continuer d'exiger sa permission`);
  }
  // Ces commandes restent bloquées si le bot n'a pas la permission.
  const result = checkCommandPermissions(context([PermissionFlagsBits.BanMembers], []), { name: 'ban' });
  assert.equal(result.ok, false, 'ban doit rester bloqué sans BanMembers');
});

test('purge : lire l’historique est indissociable de la suppression en masse', () => {
  // `bulkDelete(n)` récupère les n derniers messages avant de les supprimer.
  assert.ok(permissions.purge.bot.includes(PermissionFlagsBits.ReadMessageHistory));
  assert.ok(permissions.purge.bot.includes(PermissionFlagsBits.ManageMessages));
});

test('urgence : verrouiller un salon relève de « Gérer les rôles », pas des salons', () => {
  // Le mode urgence modifie les permissions des salons existants
  // (`permissionOverwrites.edit`) : l'API Discord exige ManageRoles. Aucun
  // salon n'est créé, modifié ni supprimé.
  assert.deepEqual(permissions.urgence.bot, [PermissionFlagsBits.ManageRoles]);
});

test('vocaux temporaires : création, permissions et déplacement sont différés', () => {
  const feature = permissions.FEATURE_PERMISSIONS.voicecreate;
  for (const bit of [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.MoveMembers]) {
    assert.ok(feature.includes(bit), 'la permission différée doit rester documentée');
    assert.ok(!permissions.voicecreate.bot.includes(bit), 'mais ne jamais bloquer la configuration');
  }
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

// ---------------------------------------------------------------------------
// Moindre privilège côté utilisateur
// ---------------------------------------------------------------------------

test('Administrateur n’est exigé de l’utilisateur que par backup', () => {
  // Une restauration réécrit la structure entière du serveur : c'est la seule
  // commande assez destructrice pour justifier Administrateur. Partout
  // ailleurs, exiger la permission qui gouverne la ressource touchée.
  const admins = Object.entries(permissions)
    .filter(([, rules]) => (rules.user ?? []).includes(PermissionFlagsBits.Administrator))
    .map(([name]) => name);
  assert.deepEqual(admins, ['backup']);
});

test('les familles de commandes restent cohérentes entre elles', () => {
  // Même panneau, même nature de configuration → même exigence.
  const protections = ['antispam', 'antilink', 'antibot', 'protections', 'antipub', 'antisensitive'];
  for (const name of protections) {
    assert.deepEqual(permissions[name].user, [PermissionFlagsBits.ManageGuild], `${name} doit exiger « Gérer le serveur »`);
  }
  for (const name of ['ticketcategory', 'ticketpanel', 'ticketstats']) {
    assert.deepEqual(permissions[name].user, [PermissionFlagsBits.ManageGuild], `${name} doit exiger « Gérer le serveur »`);
  }
  // Configuration portant sur des salons → « Gérer les salons ».
  for (const name of ['voicecreate', 'voiceedit', 'voicelist', 'voicedelete']) {
    assert.deepEqual(permissions[name].user, [PermissionFlagsBits.ManageChannels], `${name} doit exiger « Gérer les salons »`);
  }
});

// ---------------------------------------------------------------------------
// Lien d'invitation : ni plus, ni moins
// ---------------------------------------------------------------------------

/** Permissions du socle : lire, répondre, joindre — jamais liées à une commande. */
const BASELINE = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
];

/** Union de tout ce que les commandes exigent ou documentent. */
function declaredPermissions() {
  const all = new Set();
  for (const rules of Object.values(permissions)) for (const bit of rules.bot ?? []) all.add(bit);
  for (const bits of Object.values(permissions.FEATURE_PERMISSIONS)) for (const bit of bits) all.add(bit);
  return all;
}

test('le lien d’invitation ne demande rien d’inutile', () => {
  // Toute permission cochée doit être soit du socle, soit réclamée par une
  // commande ou une fonctionnalité. Sinon, on fait cocher une case pour rien.
  const declared = declaredPermissions();
  for (const bit of permissions.INVITE_PERMISSIONS) {
    if (BASELINE.includes(bit)) continue;
    // ViewAuditLog : utilisée par auditLogService/antibotService, jamais par
    // une commande — elle n'a donc pas d'entrée, mais reste indispensable.
    if (bit === PermissionFlagsBits.ViewAuditLog) continue;
    assert.ok(declared.has(bit), `le lien d'invitation demande une permission que rien n'utilise : ${bit}`);
  }
});

test('le lien d’invitation ne manque de rien', () => {
  // Une permission exigée ou documentée mais absente du lien rend la
  // fonctionnalité inopérante sans que personne comprenne pourquoi.
  for (const bit of declaredPermissions()) {
    // Administrateur (addperm) n'est jamais demandé à l'invitation : il se
    // donne manuellement, en connaissance de cause.
    if (bit === PermissionFlagsBits.Administrator) continue;
    assert.ok(permissions.INVITE_PERMISSIONS.includes(bit), `permission utilisée mais absente du lien d'invitation : ${bit}`);
  }
});

test('le lien d’invitation couvre aussi les besoins des services partagés', () => {
  // Ces deux-là n'appartiennent à aucune commande — donc aucune entrée ne les
  // déclare — mais leur absence casse silencieusement une fonctionnalité :
  //  - ViewAuditLog : résolution du modérateur responsable dans les logs
  //    (auditLogService), détection des ajouts de bots (antibotService),
  //    capture des bans pour la réputation globale ;
  //  - AttachFiles : transcripts de tickets et pièces jointes de `say`.
  for (const bit of [PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.AttachFiles]) {
    assert.ok(permissions.INVITE_PERMISSIONS.includes(bit), 'permission de service absente du lien');
  }
});

test('la commande invite lit la source unique', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'commands', 'utility', 'invite.js'), 'utf8');
  assert.ok(source.includes('permissionsConfig.INVITE_PERMISSIONS'), 'aucune liste de permissions en dur dans la commande');
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
  // Chaque entrée a été vérifiée en lisant le service appelé — une commande
  // qui n'écrit que dans les repositories n'a rien à faire ici.
  const legitimate = new Set([
    'ban', 'unban', 'kick', 'mute', 'unmute', 'timeout', 'untimeout', 'purge',
    'bump', 'watch', 'urgence', 'renamevoice', 'addperm',
  ]);
  for (const [name, rules] of Object.entries(permissions)) {
    if (rules.bot?.length && !legitimate.has(name)) {
      assert.fail(`${name} exige ${rules.bot.length} permission(s) du bot sans être dans la liste des commandes qui mutent Discord`);
    }
  }
});
