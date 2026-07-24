const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const logService = require('../services/logs/logService');
logService.log = async () => {};

const antisensitiveService = require('../services/antisensitive/antisensitiveService');
const matcher = require('../services/antisensitive/sensitiveMatcher');
const repository = require('../database/antisensitiveRepository');

const user = (id) => ({ id, tag: `${id}#0001`, displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png' });
const G = 'test-guild-antisensitive';
after(() => fs.rmSync(path.join(__dirname, '..', 'database', 'data', 'antisensitive.json'), { force: true }));

const cfg = () => ({ categories: { porn: true, gore: true, violence: true, danger: true } });

test('matcher : domaines sensibles et sous-domaines (par catégorie)', () => {
  assert.equal(matcher.analyze('lien xvideos.com/abc', cfg()).category, 'porn');
  assert.equal(matcher.analyze('va sur m.xhamster.com', cfg()).category, 'porn');
  assert.equal(matcher.analyze('gore bestgore.fun/x', cfg()).category, 'gore');
  assert.equal(matcher.analyze('liveleak.com/watch', cfg()).category, 'violence');
});

test('matcher : contournements (leet, espaces, points, www)', () => {
  assert.ok(matcher.analyze('regarde xvideos . com', cfg()));
  assert.ok(matcher.analyze('xvideos(dot)com', cfg()));
  assert.equal(matcher.analyze('du p0rn ici', cfg()).method, 'keyword'); // leet
  assert.equal(matcher.analyze('pr0n gratuit', cfg()).category, 'porn'); // pr0n → pron
  assert.ok(matcher.analyze('p o r n h u b .com', cfg())); // condensé
  assert.equal(matcher.analyze('https://www.pornhub.com/x', cfg()).category, 'porn'); // www.
});

test('matcher : redirections / paramètres d’URL', () => {
  const r = matcher.analyze('safe https://safe.com/r?url=https%3A%2F%2Fpornhub.com', cfg());
  assert.equal(r.category, 'porn');
  assert.equal(r.method, 'domain');
});

test('matcher : expressions (arnaques, défis dangereux)', () => {
  assert.equal(matcher.analyze('free discord nitro ici', cfg()).category, 'danger');
  assert.equal(matcher.analyze('blackout challenge tuto', cfg()).category, 'danger');
});

test('matcher : ignore les contenus ordinaires (pas de faux positif)', () => {
  assert.equal(matcher.analyze('coucou example.com', cfg()), null);
  assert.equal(matcher.analyze('https://github.com/x', cfg()), null);
  assert.equal(matcher.analyze('go read the book before class', cfg()), null);
  assert.equal(matcher.analyze('', cfg()), null);
});

test('matcher : catégories désactivées, domaines/mots autorisés et bloqués', () => {
  assert.equal(matcher.analyze('xvideos.com', { categories: { porn: false } }), null);
  assert.equal(matcher.analyze('https://pornhub.com/x', { ...cfg(), allowedDomains: ['pornhub.com'] }), null);
  assert.equal(matcher.analyze('badsite.net/x', { ...cfg(), blockedDomains: ['badsite.net'] }).category, 'custom');
  assert.equal(matcher.analyze('un motinterdit ici', { ...cfg(), blockedKeywords: ['motinterdit'] }).category, 'custom');
  assert.equal(matcher.analyze('nsfw art', { ...cfg(), allowedKeywords: ['nsfw'] }), null); // faux positif supprimé
});

test('setEnabled / catégorie / action / exemptions : persistants', async () => {
  const guild = { id: G, name: 'T' };
  assert.equal(antisensitiveService.isEnabled(G), false);
  await antisensitiveService.setEnabled(guild, true, user('admin1'));
  assert.equal(antisensitiveService.isEnabled(G), true);
  assert.equal(repository.getConfig(G).lastModifiedBy, 'admin1');

  await antisensitiveService.setCategory(guild, 'gore', false, user('admin1'));
  assert.equal(repository.getConfig(G).categories.gore, false);

  await antisensitiveService.setAction(guild, 'notify', user('admin1'));
  assert.equal(repository.getConfig(G).action, 'notify');

  const addRole = await antisensitiveService.exemptRoles.add(guild, 'role1', user('admin1'));
  assert.equal(addRole.added, true);
  assert.deepEqual(repository.getConfig(G).exemptRoles, ['role1']);
  const addDom = await antisensitiveService.blockedDomains.add(guild, 'BadSite.NET', user('admin1'));
  assert.equal(addDom.added, true);
  assert.deepEqual(repository.getConfig(G).blockedDomains, ['badsite.net']); // normalisé
  const rmDom = await antisensitiveService.blockedDomains.remove(guild, 'badsite.net', user('admin1'));
  assert.equal(rmDom.removed, true);
});

test('checkOutgoing : bloque selon l’état et les exemptions', async () => {
  const guild = { id: G, name: 'T' };
  await antisensitiveService.setEnabled(guild, false, user('admin1'));
  assert.equal(antisensitiveService.checkOutgoing(guild, { id: 'c' }, 'xvideos.com'), null);
  await antisensitiveService.setEnabled(guild, true, user('admin1'));
  assert.ok(antisensitiveService.checkOutgoing(guild, { id: 'c' }, 'xvideos.com'));
});

test('matcher : un domaine autorisé neutralise le mot-clé de sa marque', () => {
  // « pornhub » est un mot-clé de la base ; autoriser « pornhub.com » ne doit
  // bloquer ni le domaine ni le mot-clé correspondant.
  assert.equal(matcher.analyze('pornhub best videos', { ...cfg(), allowedDomains: ['pornhub.com'] }), null);
  // Le mot-clé générique reste bloqué (l’autorisation ne porte que sur la marque).
  assert.equal(matcher.analyze('du porn ici', { ...cfg(), allowedDomains: ['pornhub.com'] }).category, 'porn');
});

test('handleMessage : une détection est journalisée en protections ET modération', async () => {
  const GL = 'test-guild-antisensitive-logcat';
  const saved = logService.log;
  const categories = [];
  logService.log = async (_guild, category) => { categories.push(category); };
  try {
    const me = { permissionsIn: () => ({ has: () => true }) };
    const guild = { id: GL, name: 'T', members: { me } };
    await antisensitiveService.setEnabled(guild, true, user('admin1'));
    categories.length = 0; // ignore le log d'activation
    const message = {
      id: 'msg-log', guild, content: 'xvideos.com', embeds: [], member: null,
      author: { id: 'u1', tag: 'U#1', bot: false, displayAvatarURL: () => 'https://cdn/x.png' },
      channel: { id: 'c1', toString: () => '#c', permissionsFor: () => ({ has: () => true }), send: async () => ({ delete: async () => {} }) },
      client: { user: { id: 'bot' } },
      delete: async () => {},
    };
    const handled = await antisensitiveService.handleMessage(message);
    assert.equal(handled, true);
    assert.ok(categories.includes('protections'), 'catégorie protections attendue');
    assert.ok(categories.includes('moderation'), 'catégorie modération attendue');
  } finally {
    logService.log = saved;
    fs.rmSync(path.join(__dirname, '..', 'database', 'data', 'antisensitive.json'), { force: true });
  }
});
