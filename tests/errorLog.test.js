const test = require('node:test');
const assert = require('node:assert/strict');
const { Collection, ChannelType } = require('discord.js');

const config = require('../config/config');
const errorLogService = require('../services/errors/errorLogService');

/** Fabrique un salon texte factice avec un espion sur send(). */
function fakeChannel(name, sent) {
  return {
    id: `chan-${name}`,
    name,
    type: ChannelType.GuildText,
    toString() {
      return `#${name}`;
    },
    send: async (payload) => {
      sent.push(payload);
      return {};
    },
  };
}

test('errorLogService.isConfigured : suit ERROR_GUILD_ID', () => {
  const original = config.errorGuildId;
  config.errorGuildId = null;
  assert.equal(errorLogService.isConfigured(), false);
  config.errorGuildId = 'errg';
  assert.equal(errorLogService.isConfigured(), true);
  config.errorGuildId = original;
});

test('errorLogService.report : ne fait rien (sans throw) si non configuré', async () => {
  const original = config.errorGuildId;
  config.errorGuildId = null;
  await assert.doesNotReject(errorLogService.report({ type: 'x', error: new Error('boom') }));
  config.errorGuildId = original;
});

test('errorLogService : réutilise le salon #bot-errors et publie un embed complet', async () => {
  const original = config.errorGuildId;
  config.errorGuildId = 'errg';
  const sent = [];
  const channel = fakeChannel('bot-errors', sent);
  const guild = {
    id: 'errg',
    name: 'Serveur erreurs',
    members: { me: { permissions: { has: () => true } } },
    channels: { cache: new Collection([[channel.id, channel]]) },
  };
  const client = { guilds: { cache: new Collection([['errg', guild]]) }, on: () => {} };

  await errorLogService.init(client);
  await errorLogService.report({
    type: 'commandError',
    error: new Error('échec test'),
    guild: { id: 'g1', name: 'Guilde' },
    channel: { id: 'c1', toString: () => '#salon' },
    user: { id: 'u1', tag: 'User#1' },
    command: 'ban',
    module: 'commandExecutor',
  });

  assert.equal(sent.length, 1, 'un message envoyé');
  const embed = sent[0].embeds[0].data;
  assert.match(embed.title, /commandError/);
  const fieldValues = embed.fields.map((f) => f.value).join(' ');
  assert.match(fieldValues, /commandExecutor/); // module
  assert.match(fieldValues, /ban/); // commande
  assert.match(fieldValues, /échec test/); // pile d'erreurs
  config.errorGuildId = original;
});

test('errorLogService.ensureChannel : null si le serveur d’erreurs est absent', async () => {
  const original = config.errorGuildId;
  config.errorGuildId = 'absent';
  const client = { guilds: { cache: new Collection() }, on: () => {} };
  await errorLogService.init(client);
  assert.equal(await errorLogService.ensureChannel(), null);
  config.errorGuildId = original;
});
