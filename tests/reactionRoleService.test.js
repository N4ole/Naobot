const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../services/reactionRoles/reactionRoleService');
const wizard = require('../services/reactionRoles/reactionRoleWizard');

/** Panneau factice pour tester le choix du composant et le rendu. */
function panel(roleCount, mode = 'multiple', limit = 3) {
  return {
    id: 'test',
    title: 'Titre',
    description: 'Desc',
    color: 0x5865f2,
    mode,
    limit,
    roles: Array.from({ length: roleCount }, (_, i) => ({
      roleId: String(100000000000000000 + i),
      emoji: null,
      label: `Rôle ${i + 1}`,
      description: null,
    })),
  };
}

test('buildComponents : boutons quand ≤ 5 rôles', () => {
  const components = service.buildComponents(panel(3));
  assert.equal(components.length, 1);
  const json = components[0].toJSON();
  assert.equal(json.components.length, 3);
  assert.equal(json.components[0].type, 2); // bouton
});

test('buildComponents : menu déroulant quand > 5 rôles', () => {
  const components = service.buildComponents(panel(8));
  const json = components[0].toJSON();
  assert.equal(json.components[0].type, 3); // select menu
});

test('buildComponents : mode unique → maxValues 1 (menu)', () => {
  const json = service.buildComponents(panel(8, 'unique'))[0].toJSON();
  assert.equal(json.components[0].max_values, 1);
});

test('buildComponents : mode limité → maxValues = limite (menu)', () => {
  const json = service.buildComponents(panel(8, 'limited', 3))[0].toJSON();
  assert.equal(json.components[0].max_values, 3);
});

test('buildComponents : aucun rôle → aucun composant', () => {
  assert.deepEqual(service.buildComponents(panel(0)), []);
});

test('buildEmbed : titre, couleur et rôles présents', () => {
  const json = service.buildEmbed(panel(2)).toJSON();
  assert.equal(json.title, 'Titre');
  assert.equal(json.color, 0x5865f2);
  assert.ok(json.fields.some((field) => field.value.includes('<@&')));
});

test('wizard.parseColor : hexadécimal valide / invalide', () => {
  assert.equal(wizard.parseColor('#5865F2'), 0x5865f2);
  assert.equal(wizard.parseColor('5865f2'), 0x5865f2);
  assert.equal(wizard.parseColor('rouge'), null);
  assert.equal(wizard.parseColor(''), null);
});

test('wizard.parseEmoji : Unicode et personnalisé acceptés, texte rejeté', () => {
  assert.equal(wizard.parseEmoji('🎮'), '🎮');
  assert.equal(wizard.parseEmoji('<:dev:123456789012345678>'), '<:dev:123456789012345678>');
  assert.equal(wizard.parseEmoji('<a:spin:123456789012345678>'), '<a:spin:123456789012345678>');
  assert.equal(wizard.parseEmoji('abc'), null);
  assert.equal(wizard.parseEmoji(''), null);
});
