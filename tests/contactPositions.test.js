const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');

const contactPositionService = require('../services/contact/contactPositionService');
const POSITIONS = require('../utils/constants/contactPositions');
const { checkContactAccess } = require('../middlewares/contact/contactAccess');

const GUILD = { id: 'guild-contact-positions', ownerId: 'owner-1' };

/** Membre factice : `perms` = liste de permissions détenues. */
const member = (id, perms = []) => ({
  id,
  permissions: { has: (permission) => perms.includes(permission) },
});

// ---------------------------------------------------------------------------
// Résolution du poste
// ---------------------------------------------------------------------------

test('resolve : le propriétaire du serveur occupe le poste le plus élevé', () => {
  // Même sans aucune permission explicite (rôle @everyone dépouillé).
  assert.equal(contactPositionService.resolve(GUILD, member('owner-1')).key, 'serverOwner');
});

test('resolve : un administrateur est annoncé comme administrateur', () => {
  const position = contactPositionService.resolve(GUILD, member('u2', [PermissionFlagsBits.Administrator]));
  assert.equal(position.key, 'administrator');
});

test('resolve : une seule permission de modération suffit (OU logique)', () => {
  for (const permission of POSITIONS.moderator.permissions) {
    const position = contactPositionService.resolve(GUILD, member('u3', [permission]));
    assert.equal(position?.key, 'moderator', `permission non reconnue : ${permission}`);
  }
});

test('resolve : le poste le plus élevé l’emporte', () => {
  // Propriétaire ET modérateur → propriétaire ; admin ET modérateur → admin.
  assert.equal(contactPositionService.resolve(GUILD, member('owner-1', [PermissionFlagsBits.BanMembers])).key, 'serverOwner');
  assert.equal(
    contactPositionService.resolve(GUILD, member('u4', [PermissionFlagsBits.Administrator, PermissionFlagsBits.BanMembers])).key,
    'administrator',
  );
});

test('resolve : un simple membre n’occupe aucun poste', () => {
  assert.equal(contactPositionService.resolve(GUILD, member('u5')), null);
  assert.equal(contactPositionService.resolve(GUILD, member('u6', [PermissionFlagsBits.SendMessages])), null);
  // Entrées manquantes : aucune exception.
  assert.equal(contactPositionService.resolve(null, member('u7')), null);
  assert.equal(contactPositionService.resolve(GUILD, null), null);
});

// ---------------------------------------------------------------------------
// Formatage
// ---------------------------------------------------------------------------

test('format : libellés issus des locales, avec émoji', () => {
  assert.equal(contactPositionService.format('serverOwner'), '👑 Propriétaire du serveur');
  assert.equal(contactPositionService.format('administrator'), '🛡️ Administrateur');
  assert.equal(contactPositionService.format('moderator'), '🔨 Modérateur');
});

test('format : poste absent ou inconnu → mention neutre (conversations anciennes)', () => {
  assert.equal(contactPositionService.format(null), 'Poste non précisé');
  assert.equal(contactPositionService.format(undefined), 'Poste non précisé');
  assert.equal(contactPositionService.format('inexistant'), 'Poste non précisé');
});

test('allowedLabels : les trois postes autorisés, du plus élevé au plus faible', () => {
  assert.deepEqual(contactPositionService.allowedLabels(), [
    '👑 Propriétaire du serveur',
    '🛡️ Administrateur',
    '🔨 Modérateur',
  ]);
});

// ---------------------------------------------------------------------------
// Accès à la commande
// ---------------------------------------------------------------------------

const ctx = (m) => ({ guild: GUILD, member: m, user: { id: m?.id } });

test('checkContactAccess : ouvert au propriétaire, aux admins et aux modérateurs', () => {
  assert.equal(checkContactAccess(ctx(member('owner-1'))).position.key, 'serverOwner');
  assert.equal(checkContactAccess(ctx(member('u8', [PermissionFlagsBits.Administrator]))).position.key, 'administrator');
  assert.equal(checkContactAccess(ctx(member('u9', [PermissionFlagsBits.ManageMessages]))).position.key, 'moderator');
});

test('checkContactAccess : refusé à un simple membre', () => {
  const result = checkContactAccess(ctx(member('u10')));
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('modérateurs'));
});
