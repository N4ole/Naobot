const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  auditCommand,
  auditCommands,
  executeShowsModal,
  SEVERITY,
} = require('../services/audit/commandParityService');

/** Commande minimale valide (parité slash + préfixe structurelle). */
function goodCommand(overrides = {}) {
  return {
    name: 'demo',
    description: 'Commande de démonstration',
    usage: 'demo <texte>',
    examples: ['demo bonjour'],
    aliases: [],
    cooldown: 3,
    args: [{ name: 'texte', type: 'string', required: true, rest: true, description: 'Un texte' }],
    execute() {},
    ...overrides,
  };
}

/** Applique les règles unitaires à une commande et renvoie {issues, result}. */
function runOne(command, file) {
  const issues = [];
  const result = auditCommand({ command, category: 'test', file }, (i) => issues.push(i));
  return { issues, result };
}

const codes = (issues) => issues.map((i) => i.code);

test('commande valide : aucune anomalie, parité complète', () => {
  const { issues, result } = runOne(goodCommand());
  assert.deepEqual(issues, []);
  assert.equal(result.slashOk, true);
  assert.equal(result.prefixOk, true);
});

test('argument requis après optionnel : casse le slash', () => {
  const { issues, result } = runOne(
    goodCommand({
      args: [
        { name: 'a', type: 'string', required: false, description: 'A' },
        { name: 'b', type: 'string', required: true, description: 'B' },
      ],
    }),
  );
  assert.ok(codes(issues).includes('arg-order'));
  assert.equal(result.slashOk, false); // sans équivalent slash valide
  assert.equal(result.prefixOk, true);
});

test('nom en majuscules : rejeté par le slash', () => {
  const { issues, result } = runOne(goodCommand({ name: 'Demo' }));
  assert.ok(codes(issues).includes('name-case'));
  assert.equal(result.slashOk, false);
});

test('description manquante : critique (requise en slash)', () => {
  const { issues } = runOne(goodCommand({ description: '' }));
  assert.ok(codes(issues).includes('no-description'));
});

test('argument rest non final : casse le préfixe', () => {
  const { issues, result } = runOne(
    goodCommand({
      args: [
        { name: 'texte', type: 'string', required: true, rest: true, description: 'Texte' },
        { name: 'autre', type: 'string', required: false, description: 'Autre' },
      ],
    }),
  );
  assert.ok(codes(issues).includes('rest-not-last'));
  assert.equal(result.prefixOk, false); // sans équivalent préfixe fiable
});

test('type d’argument inconnu : critique', () => {
  const { issues } = runOne(goodCommand({ args: [{ name: 'x', type: '色', description: 'x' }] }));
  assert.ok(codes(issues).includes('bad-arg-type'));
});

test('usage/examples manquants : avertissements', () => {
  const { issues } = runOne(goodCommand({ usage: undefined, examples: [] }));
  assert.ok(codes(issues).includes('no-usage'));
  assert.ok(codes(issues).includes('no-examples'));
  assert.ok(issues.every((i) => ['no-usage', 'no-examples'].includes(i.code) ? i.severity === SEVERITY.WARNING : true));
});

test('collision alias / nom de commande : critique (agrégat)', () => {
  const report = auditCommands([
    { command: goodCommand({ name: 'servers', aliases: [] }), category: 'a' },
    { command: goodCommand({ name: 'serveurs', aliases: ['servers'] }), category: 'b' },
  ]);
  assert.ok(report.issues.some((i) => i.code === 'alias-name-clash'));
  assert.ok(report.criticalCount >= 1);
});

test('alias partagé par deux commandes : critique (agrégat)', () => {
  const report = auditCommands([
    { command: goodCommand({ name: 'un', aliases: ['x'] }), category: 'a' },
    { command: goodCommand({ name: 'deux', aliases: ['x'] }), category: 'b' },
  ]);
  assert.ok(report.issues.some((i) => i.code === 'alias-clash'));
});

test('nom de commande dupliqué : critique (agrégat)', () => {
  const report = auditCommands([
    { command: goodCommand({ name: 'doublon' }), category: 'a' },
    { command: goodCommand({ name: 'doublon' }), category: 'b' },
  ]);
  assert.ok(report.issues.some((i) => i.code === 'dup-name'));
});

test('détection heuristique du modal ouvert depuis execute', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
  const fromExecute = path.join(dir, 'exec.js');
  const fromComponent = path.join(dir, 'comp.js');
  fs.writeFileSync(
    fromExecute,
    'module.exports = { name: "m", async execute(ctx) { return ctx.interaction.showModal({}); } };',
  );
  fs.writeFileSync(
    fromComponent,
    'module.exports = { name: "m", async execute(ctx) { return ctx.reply({}); }, async handleComponent(i) { return i.showModal({}); } };',
  );
  assert.equal(executeShowsModal(fromExecute), true);
  assert.equal(executeShowsModal(fromComponent), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
