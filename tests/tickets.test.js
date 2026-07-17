const test = require('node:test');
const assert = require('node:assert/strict');

// --- Variables de personnalisation (format des salons et messages) ---
const ticketVariables = require('../utils/constants/ticketVariables');

test('ticketVariables : format du nom de salon (compteur paddé, nettoyage)', () => {
  const category = { name: 'Support' };
  const user = { id: '42', username: 'Alice' };
  assert.equal(ticketVariables.renderChannelName('support-{counter}', { counter: 3, category, user }), 'support-003');
  assert.equal(ticketVariables.renderChannelName('{category}-{username}', { counter: 1, category, user }), 'support-alice');
  assert.equal(ticketVariables.renderChannelName('plainte-{userid}', { counter: 1, category, user }), 'plainte-42');
  // Caractères interdits retirés, espaces → tirets.
  assert.equal(ticketVariables.renderChannelName('Ticket #{counter} !!', { counter: 7, category, user }), 'ticket-007');
  // Format vide → repli.
  assert.equal(ticketVariables.renderChannelName('', { counter: 1, category, user }), 'ticket-001');
});

test('ticketVariables : message d’ouverture (mention et catégorie)', () => {
  const out = ticketVariables.renderMessage('Bonjour {mention}, catégorie {category} — {ticketid}', {
    user: { id: '99', username: 'Bob' },
    category: { name: 'VIP' },
    ticketId: 'vip-001',
  });
  assert.equal(out, 'Bonjour <@99>, catégorie VIP — vip-001');
});

// --- Analyse des champs de configuration ---
const categoryService = require('../services/ticketCategories/ticketCategoryService');

test('ticketCategoryService : parsing couleur / emoji / entier borné', () => {
  assert.equal(categoryService.parseColor('#5865f2'), 0x5865f2);
  assert.equal(categoryService.parseColor('abcdef'), 0xabcdef);
  assert.equal(categoryService.parseColor('nope'), null);
  assert.equal(categoryService.parseEmoji('🎫'), '🎫');
  assert.equal(categoryService.parseEmoji('texte'), null);
  assert.equal(categoryService.parseBoundedInt('3', { min: 0, max: 10, fallback: 1 }), 3);
  assert.equal(categoryService.parseBoundedInt('999', { min: 0, max: 10, fallback: 1 }), 10);
  assert.equal(categoryService.parseBoundedInt('abc', { min: 0, max: 10, fallback: 1 }), 1);
});

// --- Transcripts : formats texte et HTML ---
const transcriptService = require('../services/tickets/transcriptService');

test('transcriptService : rendus texte et HTML (avec échappement)', () => {
  const ticket = { userId: '1', createdAt: new Date('2026-01-01T00:00:00Z').toISOString() };
  const header = { channelName: 'support-001', categoryName: 'Support', creatorTag: 'Alice#0' };
  const messages = [{ author: 'Alice#0', bot: false, timestamp: Date.now(), content: '<b>bonjour</b>', attachments: [], embeds: 0 }];
  const txt = transcriptService.FORMATTERS.txt.render(ticket, header, messages);
  assert.ok(txt.includes('Transcript — support-001'));
  assert.ok(txt.includes('Alice#0: <b>bonjour</b>'));
  const html = transcriptService.FORMATTERS.html.render(ticket, header, messages);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('&lt;b&gt;bonjour&lt;/b&gt;')); // échappement
});

// --- Panneaux : composants (boutons vs menu déroulant) ---
const panelService = require('../services/ticketPanels/ticketPanelService');

function customIds(rows) {
  return rows.flatMap((row) => row.toJSON().components.map((component) => component.custom_id));
}

test('ticketPanelService : boutons pour peu de catégories', () => {
  const panel = { id: 'p1', guildId: 'g', categoryIds: ['a', 'b'], displayMode: 'buttons' };
  const categories = [{ id: 'a', name: 'Support' }, { id: 'b', name: 'Bug' }];
  const rows = panelService.buildComponents(panel, categories);
  assert.equal(rows.length, 1);
  assert.deepEqual(customIds(rows), ['ticket:open:a', 'ticket:open:b']);
});

test('ticketPanelService : menu déroulant en mode select', () => {
  const panel = { id: 'p2', guildId: 'g', categoryIds: ['a'], displayMode: 'select' };
  const categories = [{ id: 'a', name: 'Support' }];
  const rows = panelService.buildComponents(panel, categories);
  assert.deepEqual(customIds(rows), ['ticket:openselect:p2']);
});

test('ticketPanelService : repli automatique en menu au-delà de 25 catégories', () => {
  const categories = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, name: `Cat ${i}` }));
  const panel = { id: 'p3', guildId: 'g', categoryIds: categories.map((c) => c.id), displayMode: 'buttons' };
  const rows = panelService.buildComponents(panel, categories);
  assert.deepEqual(customIds(rows), ['ticket:openselect:p3']);
});
