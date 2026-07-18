const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const logService = require('../services/logs/logService');
logService.log = async () => {};
const captchaService = require('../services/captcha/captchaService');
const captchaTypes = require('../utils/constants/captchaTypes');

test('generateChallenge : code texte (6 caractères non ambigus)', () => {
  const challenge = captchaService.generateChallenge('text');
  assert.equal(challenge.answer.length, 6);
  assert.match(challenge.answer, /^[A-HJ-NP-Z2-9]{6}$/); // sans O/0, I/1
  assert.equal(challenge.prompt, challenge.answer);
});

test('generateChallenge : calcul résoluble', () => {
  const challenge = captchaService.generateChallenge('math');
  assert.ok(challenge.prompt.includes('+') || challenge.prompt.includes('×'));
  const [a, op, b] = challenge.prompt.split(' ');
  const expected = op === '+' ? Number(a) + Number(b) : Number(a) * Number(b);
  assert.equal(challenge.answer, String(expected));
});

test('generateChallenge : bouton sans réponse', () => {
  assert.equal(captchaService.generateChallenge('button').answer, null);
});

test('checkAnswer : bouton, texte (insensible casse) et math', () => {
  assert.equal(captchaService.checkAnswer({ type: 'button' }, null), true);
  assert.equal(captchaService.checkAnswer({ type: 'text', answer: 'K7P4X9' }, 'k7p4x9'), true);
  assert.equal(captchaService.checkAnswer({ type: 'text', answer: 'K7P4X9' }, 'ZZZZZZ'), false);
  assert.equal(captchaService.checkAnswer({ type: 'math', answer: '12' }, '  12 '), true);
});

test('captchaTypes : bouton / texte / math avec hasInput correct', () => {
  assert.equal(captchaTypes.button.hasInput, false);
  assert.equal(captchaTypes.text.hasInput, true);
  assert.equal(captchaTypes.math.hasInput, true);
});

// --- Assistant : options bornées ---
const wizard = require('../services/captcha/captchaWizard');

test('captchaWizard.applyOptions : message, délai et tentatives bornés', () => {
  const draft = { message: 'x', timeoutMinutes: 5, maxAttempts: 3 };
  wizard.applyOptions(draft, { getTextInputValue: (id) => ({ message: 'Vérifiez-vous', timeout: '10', attempts: '4' }[id]) });
  assert.equal(draft.message, 'Vérifiez-vous');
  assert.equal(draft.timeoutMinutes, 10);
  assert.equal(draft.maxAttempts, 4);
  wizard.applyOptions(draft, { getTextInputValue: (id) => ({ message: 'ok', timeout: '99999', attempts: '999' }[id]) });
  assert.equal(draft.timeoutMinutes, 1440); // borné
  assert.equal(draft.maxAttempts, 10); // borné
});

// --- Repository : config, pending, stats ---
const repository = require('../database/captchaRepository');
const G = 'test-guild-captcha';

after(() => fs.rmSync(path.join(__dirname, '..', 'database', 'data', 'captcha.json'), { force: true }));

test('captchaRepository : défauts, pending et statistiques', () => {
  const config = repository.getConfig(G);
  assert.equal(config.enabled, false); // désactivé par défaut
  assert.equal(config.type, 'button');

  repository.setPending(G, 'u1', { answer: 'ABC123', type: 'text', expiresAt: Date.now() + 1000, attempts: 0 });
  assert.equal(repository.getPending(G, 'u1').answer, 'ABC123');
  assert.equal(repository.allPending().filter((p) => p.guildId === G).length, 1);
  repository.recordStat(G, 'passed');
  assert.equal(repository.getConfig(G).stats.passed, 1);
  assert.equal(repository.removePending(G, 'u1'), true);
  assert.equal(repository.getPending(G, 'u1'), null);
});
