const test = require('node:test');
const { after, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PermissionFlagsBits } = require('discord.js');

const logService = require('../services/logs/logService');
logService.log = async () => {};

const FILE = path.join(__dirname, '..', 'database', 'data', 'memberFiles.json');
before(() => fs.rmSync(FILE, { force: true }));
after(() => fs.rmSync(FILE, { force: true }));

const memberFileService = require('../services/memberFiles/memberFileService');
const access = require('../middlewares/memberFiles/memberFileAccess');

const U = (id, tag) => ({ id, tag, displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png' });
const TARGET = 'target-user';

test('addNote + getDossier : notes globales agrégées avec la réputation', async () => {
  await memberFileService.addNote({ id: 'g1', name: 'Serveur A' }, U(TARGET, 'Cible#1'), U('mod1', 'Mod#1'), 'Note 1');
  await memberFileService.addNote({ id: 'g2', name: 'Serveur B' }, U(TARGET, 'Cible#1'), U('mod2', 'Mod#2'), 'Note 2');

  const dossier = memberFileService.getDossier(TARGET);
  assert.equal(dossier.noteCount, 2);
  assert.equal(dossier.guildsCount, 2); // deux serveurs d'origine distincts
  assert.equal(typeof dossier.rep.score, 'number'); // réputation intégrée
  assert.equal(dossier.notes[0].content, 'Note 1');
  assert.equal(dossier.notes[0].guildName, 'Serveur A');
});

test('findNote / deleteNote : recherche globale et suppression', async () => {
  const note = await memberFileService.addNote({ id: 'g1', name: 'Serveur A' }, U('t2', 't2#0'), U('mod1', 'Mod#1'), 'À supprimer');
  const found = memberFileService.findNote(note.id);
  assert.ok(found && found.userId === 't2');

  const removed = await memberFileService.deleteNote({ id: 'g1', name: 'Serveur A' }, note.id, U('mod1', 'Mod#1'));
  assert.ok(removed && removed.note.id === note.id);
  assert.equal(memberFileService.findNote(note.id), null);
});

test('permissions : ajout, consultation, suppression', () => {
  const owner = { id: 'owner', permissions: { any: () => false, has: () => false } };
  // ownerService.isOwner('owner') → false par défaut en test ; on teste via admin/mod.
  const admin = { id: 'a', guild: { id: 'g1' }, permissions: { has: (p) => p === PermissionFlagsBits.Administrator, any: (list) => list.includes(PermissionFlagsBits.Administrator) } };
  const mod = { id: 'm', permissions: { has: () => false, any: (list) => list.includes(PermissionFlagsBits.ModerateMembers) } };
  const stranger = { id: 's', permissions: { has: () => false, any: () => false } };

  assert.equal(access.canAddFile(admin), true);
  assert.equal(access.canAddFile(mod), true);
  assert.equal(access.canAddFile(stranger), false);

  assert.equal(access.canViewFiles(admin), true);
  assert.equal(access.canViewFiles(mod), false); // modérateur ne peut pas consulter
  assert.equal(access.canViewFiles(stranger), false);

  const note = { authorId: 'author1', guildId: 'g1' };
  assert.equal(access.canDeleteNote({ id: 'author1', guild: { id: 'gX' }, permissions: { has: () => false } }, note), true); // auteur
  assert.equal(access.canDeleteNote(admin, note), true); // admin du serveur d'origine (g1)
  assert.equal(access.canDeleteNote({ id: 'a2', guild: { id: 'g2' }, permissions: { has: () => true } }, note), false); // admin d'un autre serveur
  assert.equal(access.canDeleteNote(stranger, note), false);
  void owner;
});
