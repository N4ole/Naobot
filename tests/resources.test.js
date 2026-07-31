/**
 * Tests des ressources allouées au processus (config/resources.js).
 *
 * Règle centrale vérifiée ici : une configuration ne doit **jamais réduire**
 * les ressources par rapport au défaut de V8, ni réclamer plus que la part
 * sûre de la RAM.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const v8 = require('node:v8');

const resources = require('../config/resources');

/** Exécute un scénario avec une valeur de `heapMb`, puis restaure. */
function withHeap(value, fn) {
  const saved = resources.SETTINGS.heapMb;
  resources.SETTINGS.heapMb = value;
  try {
    return fn();
  } finally {
    resources.SETTINGS.heapMb = saved;
  }
}

const defaultHeapMb = () => Math.round(v8.getHeapStatistics().heap_size_limit / 1048576);
const ceilingMb = () => Math.floor((os.totalmem() * resources.MAX_SYSTEM_SHARE) / 1048576);

test('heapMb « auto » : aucun drapeau, V8 dimensionne selon la RAM', () => {
  withHeap('auto', () => {
    assert.deepEqual(resources.nodeFlags(), [], 'aucun drapeau ne doit être passé');
    assert.deepEqual(resources.warnings(), []);
    assert.equal(resources.resolveHeap().reason, 'auto');
  });
});

test('heapMb explicite supérieur au défaut : le drapeau augmente la limite', () => {
  const requested = defaultHeapMb() + 512;
  withHeap(requested, () => {
    // Reste sous le plafond sûr, sinon le scénario testerait l'écrêtage.
    if (requested > ceilingMb()) return;
    assert.deepEqual(resources.nodeFlags(), [`--max-old-space-size=${requested}`]);
    assert.equal(resources.resolveHeap().reason, 'explicite');
  });
});

test('heapMb inférieur au défaut : refusé, les ressources ne sont jamais réduites', () => {
  withHeap(Math.max(1, defaultHeapMb() - 1024), () => {
    assert.deepEqual(resources.nodeFlags(), [], 'aucun drapeau : le défaut, plus généreux, est conservé');
    assert.equal(resources.resolveHeap().reason, 'inférieur au défaut');
    assert.match(resources.warnings().join(' '), /inférieur au défaut/);
  });
});

test('heapMb démesuré : écrêté à la part sûre de la RAM (anti-OOM)', () => {
  withHeap(99_999_999, () => {
    const flags = resources.nodeFlags();
    assert.equal(flags.length, 1);
    const applied = Number(flags[0].split('=')[1]);
    assert.equal(applied, ceilingMb());
    assert.ok(applied * 1048576 <= os.totalmem() * resources.MAX_SYSTEM_SHARE);
    assert.match(resources.warnings().join(' '), /plafonné/);
  });
});

test('heapMb invalide : ignoré sans casser le démarrage', () => {
  for (const value of ['nimportequoi', 0, -5, null]) {
    withHeap(value, () => {
      assert.deepEqual(resources.nodeFlags(), [], `valeur ${JSON.stringify(value)} : aucun drapeau`);
      assert.match(resources.warnings().join(' '), /invalide/);
    });
  }
});

test('pool de threads : au moins le défaut de libuv, borné, jamais moins', () => {
  const size = resources.resolveThreadPoolSize();
  assert.ok(size >= 4, 'jamais en dessous du défaut libuv (4)');
  assert.ok(size <= 16, 'borné pour éviter des threads inutiles');
  assert.equal(resources.environment().UV_THREADPOOL_SIZE, String(size));
});

test('applyRuntimeLimits : positionne UV_THREADPOOL_SIZE et respecte une valeur déjà fournie', () => {
  const saved = process.env.UV_THREADPOOL_SIZE;
  try {
    delete process.env.UV_THREADPOOL_SIZE;
    resources.applyRuntimeLimits();
    assert.equal(process.env.UV_THREADPOOL_SIZE, String(resources.resolveThreadPoolSize()));

    // Une valeur imposée par l'hébergeur (systemd, Docker…) doit primer.
    process.env.UV_THREADPOOL_SIZE = '12';
    resources.applyRuntimeLimits();
    assert.equal(process.env.UV_THREADPOOL_SIZE, '12');
  } finally {
    if (saved === undefined) delete process.env.UV_THREADPOOL_SIZE;
    else process.env.UV_THREADPOOL_SIZE = saved;
  }
});

test('effective / summaryLine : état exploitable par l’interface web', () => {
  const state = resources.effective();
  assert.ok(state.heapLimitMb > 0);
  assert.ok(state.cores >= 1);
  assert.ok(state.systemMemoryMb > 0);
  assert.ok(state.threadPoolSize >= 4);
  assert.match(resources.summaryLine(), /Tas V8 .* pool E\/S .* cœur/);
});

test('webStats expose les ressources allouées au tableau de bord', () => {
  const webStats = require('../services/web/webStats');
  const metrics = webStats.systemMetrics(null);
  assert.ok(metrics.memory.heapLimitBytes > 0, 'le plafond alloué doit être exposé');
  assert.ok(metrics.memory.heapUsedBytes <= metrics.memory.heapLimitBytes);
  assert.equal(metrics.allocation.threadPoolSize, resources.effective().threadPoolSize);
  assert.equal(metrics.allocation.cores, resources.effective().cores);
});
