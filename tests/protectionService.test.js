const test = require('node:test');
const assert = require('node:assert/strict');
const antispam = require('../services/antispam/antispamService');
const antilink = require('../services/antilink/antilinkService');

// --- Anti-link ---

test('antilink : détecte un lien externe', () => {
  assert.equal(antilink.analyze('Regarde https://example.com/page').reason, 'link');
  assert.equal(antilink.analyze('va sur example.com maintenant').reason, 'link');
});

test('antilink : détecte une invitation Discord', () => {
  assert.equal(antilink.analyze('rejoins discord.gg/abcdef').reason, 'invite');
  assert.equal(antilink.analyze('https://discord.com/invite/xyz').reason, 'invite');
});

test('antilink : détecte un raccourcisseur', () => {
  assert.equal(antilink.analyze('clique bit.ly/abcd').reason, 'shortener');
});

test('antilink : détecte un domaine suspect', () => {
  assert.equal(antilink.analyze('http://free-nitro.tk/claim').reason, 'suspicious');
});

test('antilink : message sans lien = null', () => {
  assert.equal(antilink.analyze('Bonjour tout le monde !'), null);
  assert.equal(antilink.analyze(''), null);
});

// --- Anti-spam : normalisation anti-contournement ---

test('antispam : normalise contournements (invisibles, ponctuation, casse)', () => {
  // Casse, ponctuation et espaces neutralisés : « SPAM!!! » ≡ « s p a m ».
  assert.equal(antispam.normalizeContent('SPAM!!!'), antispam.normalizeContent('s p a m'));
  // Les répétitions sont compressées à 2 caractères : deux variantes
  // gonflées d'un même mot deviennent identiques (défère le « aaaa »-spam).
  assert.equal(antispam.normalizeContent('spaaaam'), antispam.normalizeContent('spaaam'));
});

test('antispam : analyze détecte le flood', () => {
  const base = { guild: { id: 'g-flood' }, author: { id: 'u1', bot: false, createdTimestamp: 0 }, channel: { id: 'c1' }, mentions: { users: new Map(), roles: new Map(), everyone: false } };
  let detection = null;
  for (let i = 0; i < 6; i += 1) {
    detection = antispam.analyze({ ...base, content: `message ${i} unique ${Math.random()}` });
  }
  assert.equal(detection?.reason, 'flood');
});

test('antispam : analyze détecte les mentions abusives (@everyone)', () => {
  const message = {
    guild: { id: 'g-mentions' },
    author: { id: 'u2', bot: false, createdTimestamp: Date.now() },
    channel: { id: 'c1' },
    content: 'coucou',
    mentions: { users: new Map(), roles: new Map(), everyone: true },
  };
  assert.equal(antispam.analyze(message).reason, 'mentions');
});
