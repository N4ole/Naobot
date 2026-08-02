const test = require('node:test');
const assert = require('node:assert/strict');
const contactService = require('../services/contact/contactService');
const contactStatuses = require('../utils/constants/contactStatuses');

test('statusLabel : libellés des statuts', () => {
  assert.ok(contactService.statusLabel('open').includes('Ouverte'));
  assert.ok(contactService.statusLabel('closed').includes('Fermée'));
  // Statut inconnu : retourné tel quel (pas d'exception).
  assert.equal(contactService.statusLabel('inconnu'), 'inconnu');
});

test('statuts obligatoires présents', () => {
  for (const key of ['open', 'pending', 'handled', 'closed']) {
    assert.ok(key in contactStatuses, `statut manquant : ${key}`);
  }
});

test('buildOwnerReplyText : signature encadrée, sans compte Discord de l’owner', () => {
  const text = contactService.buildOwnerReplyText('NomOwner', 'Bonjour ceci est la réponse.');
  assert.ok(text.includes(contactService.SIGNATURE_LINE));
  assert.ok(text.includes("Réponse de l'équipe NaoBot"));
  assert.ok(text.includes('Répondu par : NomOwner'));
  assert.ok(text.includes('Bonjour ceci est la réponse.'));
  // La signature borne le message (au moins deux lignes ━).
  assert.equal(text.split(contactService.SIGNATURE_LINE).length - 1, 2);
});

test('buildOwnerNotificationEmbed : contient serveur, auteur, poste, message', () => {
  const conversation = {
    id: 'CONTACT-000001',
    guildId: '123',
    guildName: 'Mon Serveur',
    ownerId: '456',
    ownerName: 'Proprio#0001',
    authorPosition: 'moderator',
    status: 'open',
  };
  const json = contactService.buildOwnerNotificationEmbed(null, conversation, 'Coucou', true).toJSON();
  assert.ok(json.title.includes('CONTACT-000001'));
  const text = JSON.stringify(json);
  assert.ok(text.includes('Mon Serveur'));
  assert.ok(text.includes('Proprio#0001'));
  assert.ok(text.includes('Coucou'));
  // Le poste occupé est annoncé aux owners.
  assert.ok(text.includes('Poste'));
  assert.ok(text.includes('Modérateur'));
});

test('buildOwnerNotificationEmbed : conversation ancienne (sans poste) reste affichable', () => {
  const conversation = { id: 'CONTACT-000002', guildId: '1', guildName: 'S', ownerId: '2', ownerName: 'A#1', status: 'open' };
  const text = JSON.stringify(contactService.buildOwnerNotificationEmbed(null, conversation, 'Salut', true).toJSON());
  assert.ok(text.includes('Poste non précisé'));
});
