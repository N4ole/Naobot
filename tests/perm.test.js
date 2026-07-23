const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PermissionFlagsBits, Collection } = require('discord.js');

const logService = require('../services/logs/logService');
logService.log = async () => {};

const authorizedGuildRepository = require('../database/authorizedGuildRepository');
const ownerService = require('../services/owners/ownerService');
const ownerRepository = require('../database/ownerRepository');
const permGrantService = require('../services/owners/permGrantService');
const config = require('../config/config');

const FILE = path.join(__dirname, '..', 'database', 'data', 'authorizedGuilds.json');
before(() => fs.rmSync(FILE, { force: true }));
after(() => fs.rmSync(FILE, { force: true }));

test('authorizedGuildRepository : add / isAuthorized / remove (persistant)', () => {
  assert.equal(authorizedGuildRepository.isAuthorized('g1'), false);
  assert.equal(authorizedGuildRepository.add('g1', 'owner1').added, true);
  assert.equal(authorizedGuildRepository.add('g1', 'owner1').added, false); // doublon
  assert.equal(authorizedGuildRepository.isAuthorized('g1'), true);
  assert.deepEqual(authorizedGuildRepository.getIds(), ['g1']);
  assert.equal(authorizedGuildRepository.getAll()[0].addedBy, 'owner1');
  assert.equal(authorizedGuildRepository.remove('g1').removed, true);
  assert.equal(authorizedGuildRepository.remove('g1').removed, false);
  assert.equal(authorizedGuildRepository.isAuthorized('g1'), false);
});

test('ownerService.isPrimaryOwner : uniquement OWNER_ID', () => {
  const saved = config.ownerId;
  config.ownerId = 'PRIMARY';
  assert.equal(ownerService.isPrimaryOwner('PRIMARY'), true);
  assert.equal(ownerService.isPrimaryOwner('OTHER'), false);
  config.ownerId = null;
  assert.equal(ownerService.isPrimaryOwner('PRIMARY'), false); // sans owner principal
  config.ownerId = saved;
});

test('grantAdminRole : crée un rôle admin et l’attribue', async () => {
  const created = [];
  const added = [];
  const guild = {
    id: 'g1', name: 'T',
    members: { me: { permissions: { has: (p) => p === PermissionFlagsBits.Administrator } } },
    roles: { cache: new Collection(), create: async (o) => { created.push(o); return { id: 'r1', name: o.name }; } },
  };
  const member = { id: 'u1', user: { id: 'u1', tag: 'U#1' }, roles: { cache: new Collection(), add: async (r) => added.push(r.id) } };

  const res = await permGrantService.grantAdminRole(guild, member);
  assert.equal(res.ok, true);
  assert.equal(res.role.name, config.adminRoleName);
  assert.ok(created[0].permissions.includes(PermissionFlagsBits.Administrator)); // rôle avec Administrateur
  assert.deepEqual(added, ['r1']); // attribué au membre
});

test('grantAndNotify : tous les owners (auteur inclus) + le propriétaire sont notifiés', async () => {
  const savedOwner = config.ownerId;
  config.ownerId = 'INV'; // l'auteur est aussi owner principal
  const addedSecondary = ownerRepository.addOwner('OWNER2');

  const dmd = [];
  const mkUser = (id) => ({ id, tag: `${id}#1`, displayAvatarURL: () => 'https://x/a.png', send: async () => dmd.push(id) });
  const invoker = mkUser('INV');
  const guild = {
    id: 'g1', name: 'T',
    members: { me: { permissions: { has: (p) => p === PermissionFlagsBits.Administrator } } },
    roles: { cache: new Collection(), create: async (o) => ({ id: 'r1', name: o.name }) },
    fetchOwner: async () => ({ user: mkUser('GUILDOWNER') }),
  };
  const member = { id: 'INV', user: invoker, roles: { cache: new Collection(), add: async () => {} } };
  const ctx = { guild, member, user: invoker, client: { user: { username: 'NaoBot' }, users: { fetch: async (id) => mkUser(id) } } };

  await permGrantService.grantAndNotify(ctx);
  assert.ok(dmd.includes('INV'), 'l’auteur (owner) doit être notifié');
  assert.ok(dmd.includes('OWNER2'), 'les owners secondaires doivent être notifiés');
  assert.ok(dmd.includes('GUILDOWNER'), 'le propriétaire du serveur doit être notifié');

  if (addedSecondary) ownerRepository.removeOwner('OWNER2');
  config.ownerId = savedOwner;
});

test('grantAdminRole : échoue proprement si le bot n’a pas Administrateur', async () => {
  const guild = {
    id: 'g1', name: 'T',
    members: { me: { permissions: { has: () => false } } },
    roles: { cache: new Collection(), create: async () => { throw new Error('should not create'); } },
  };
  const member = { id: 'u1', user: { id: 'u1', tag: 'U#1' }, roles: { cache: new Collection(), add: async () => {} } };
  const res = await permGrantService.grantAdminRole(guild, member);
  assert.deepEqual(res, { ok: false, code: 'botNoAdmin' });
});
