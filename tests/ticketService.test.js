const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatTicketChannelName,
  sanitizeChannelName,
  isValidType,
} = require('../services/tickets/ticketService');
const ticketTypes = require('../utils/constants/ticketTypes');

test('formatTicketChannelName : format ticket-nXXX', () => {
  assert.equal(formatTicketChannelName(1), 'ticket-n001');
  assert.equal(formatTicketChannelName(42), 'ticket-n042');
  assert.equal(formatTicketChannelName(1234), 'ticket-n1234');
});

test('sanitizeChannelName : nettoyage des noms', () => {
  assert.equal(sanitizeChannelName('Mon Ticket Support'), 'mon-ticket-support');
  assert.equal(sanitizeChannelName('  déjà-valide  '), 'déjà-valide');
  assert.equal(sanitizeChannelName('nom!!avec$$symboles'), 'nomavecsymboles');
  assert.equal(sanitizeChannelName('@#$%'), '');
  assert.ok(sanitizeChannelName('a'.repeat(200)).length <= 100);
});

test('isValidType : types obligatoires présents', () => {
  for (const type of ['assistance', 'questions', 'report', 'signalement']) {
    assert.ok(isValidType(type), `type manquant : ${type}`);
    assert.ok(ticketTypes[type].label && ticketTypes[type].description && ticketTypes[type].rules);
  }
  assert.equal(isValidType('inexistant'), false);
});
