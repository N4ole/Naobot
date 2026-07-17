const test = require('node:test');
const assert = require('node:assert/strict');

// --- Bienvenue : interpolation de la carte ---
const welcomeCardService = require('../services/welcome/welcomeCardService');

test('welcome render : interpole {user} {username} {server} {count}', () => {
  const member = {
    toString: () => '<@42>',
    user: { username: 'Alice' },
    guild: { name: 'Mon Serveur', memberCount: 128 },
  };
  const out = welcomeCardService.render('Salut {user} ({username}) sur {server}, membre {count}', member);
  assert.equal(out, 'Salut <@42> (Alice) sur Mon Serveur, membre 128');
});

// --- Sauvegarde : périmètre de configuration capturée ---
const botConfigBackup = require('../services/backup/botConfigBackup');

test('backup : le périmètre couvre les systèmes clés', () => {
  for (const file of ['logSettings.json', 'protections.json', 'welcome.json', 'reactionRoles.json', 'tickets.json']) {
    assert.ok(botConfigBackup.GUILD_KEYED_FILES.includes(file), `manquant : ${file}`);
  }
});

// --- Formulaires : types de questions obligatoires ---
const formQuestionTypes = require('../utils/constants/formQuestionTypes');

test('forms : les 6 types de questions sont présents', () => {
  for (const type of ['short', 'long', 'single', 'multiple', 'number', 'date']) {
    assert.ok(type in formQuestionTypes, `type manquant : ${type}`);
  }
  assert.equal(formQuestionTypes.short.input, 'modal');
  assert.equal(formQuestionTypes.single.input, 'select');
  assert.equal(formQuestionTypes.multiple.multi, true);
});

// --- Mode urgence : permissions verrouillées ---
const emergencyService = require('../services/emergency/emergencyService');

test('emergency : verrouille bien les permissions clés (messages, vocal, fils, réactions)', () => {
  const { PermissionFlagsBits } = require('discord.js');
  const flags = emergencyService.LOCK_FLAGS;
  for (const flag of [PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.AddReactions, PermissionFlagsBits.CreatePublicThreads]) {
    assert.ok(flags.includes(flag), 'permission de verrouillage manquante');
  }
});
