const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Neutralise la journalisation (aucun salon Discord réel en test).
const logService = require('../services/logs/logService');
logService.log = async () => {};

const antipubService = require('../services/antipub/antipubService');
const repository = require('../database/antipubRepository');

const user = (id) => ({ id, tag: id + '#0001', displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png' });

const G = 'test-guild-antipub';
after(() => fs.rmSync(path.join(__dirname, '..', 'database', 'data', 'antipub.json'), { force: true }));

test('analyze : détecte les invitations Discord (formats variés)', () => {
  assert.equal(antipubService.analyze('rejoins discord.gg/abcd1234').code, 'abcd1234');
  assert.equal(antipubService.analyze('https://discord.com/invite/xyz').code, 'xyz');
  assert.equal(antipubService.analyze('discordapp.com/invite/legacy').code, 'legacy');
  assert.equal(antipubService.analyze('ptb.discord.com/invite/test').code, 'test');
  assert.equal(antipubService.analyze('https://dsc.gg/promo').code, 'promo');
});

test('analyze : révèle les invitations dissimulées', () => {
  assert.ok(antipubService.analyze('viens sur discord . gg / hidden'));
  assert.ok(antipubService.analyze('lien : discord(dot)gg/obf'));
  assert.ok(antipubService.analyze('discord​.gg/zero'));
});

test('analyze : ignore le texte et les liens ordinaires', () => {
  assert.equal(antipubService.analyze('coucou ça va ?'), null);
  assert.equal(antipubService.analyze('va sur https://example.com'), null);
  assert.equal(antipubService.analyze(''), null);
});

test('analyzeMessage : détecte une invitation dans un embed', () => {
  const message = { content: 'regardez', embeds: [{ description: 'serveur : discord.gg/embedcode' }] };
  const found = antipubService.analyzeMessage(message);
  assert.equal(found.code, 'embedcode');
});

test('setEnabled : persistant et journalisé (activation/désactivation)', async () => {
  assert.equal(antipubService.isEnabled(G), false); // désactivé par défaut
  await antipubService.setEnabled({ id: G, name: 'T' }, true, user('admin1'));
  assert.equal(antipubService.isEnabled(G), true);
  const conf = repository.getConfig(G);
  assert.equal(conf.lastModifiedBy, 'admin1');
  assert.ok(conf.lastModifiedAt);
  await antipubService.setEnabled({ id: G, name: 'T' }, false, user('admin1'));
  assert.equal(antipubService.isEnabled(G), false);
});

test('whitelist : ajout/retrait de salons exemptés (persistant)', async () => {
  const guild = { id: G, name: 'T' };
  const add = await antipubService.addExemptChannel(guild, { id: 'chan1' }, user('admin1'));
  assert.equal(add.added, true);
  const again = await antipubService.addExemptChannel(guild, { id: 'chan1' }, user('admin1'));
  assert.equal(again.added, false); // idempotent
  assert.deepEqual(antipubService.listExemptChannels(G), ['chan1']);

  const remove = await antipubService.removeExemptChannel(guild, 'chan1', user('admin1'));
  assert.equal(remove.removed, true);
  assert.deepEqual(antipubService.listExemptChannels(G), []);
});

test('checkOutgoing : bloque les invitations selon l\'état et les exemptions', async () => {
  const guild = { id: G, name: 'T' };
  // Désactivé : rien n'est bloqué.
  await antipubService.setEnabled(guild, false, user('admin1'));
  assert.equal(antipubService.checkOutgoing(guild, { id: 'c' }, 'discord.gg/abc'), null);

  // Activé : une invitation dans un salon ordinaire est détectée.
  await antipubService.setEnabled(guild, true, user('admin1'));
  assert.ok(antipubService.checkOutgoing(guild, { id: 'c' }, 'discord.gg/abc'));
  assert.equal(antipubService.checkOutgoing(guild, { id: 'c' }, 'juste du texte'), null);

  // Salon exempté : autorisé.
  await antipubService.addExemptChannel(guild, { id: 'partner' }, user('admin1'));
  assert.equal(antipubService.checkOutgoing(guild, { id: 'partner' }, 'discord.gg/abc'), null);
});
