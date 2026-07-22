/**
 * Émojis officiels de NaoBot — source **unique** et centralisée.
 *
 * Aucun identifiant d'émoji ne doit être écrit ailleurs dans le code : tout
 * module qui veut afficher un émoji de marque importe ce fichier. Ajouter un
 * émoji = une entrée dans `DEFS` (aucune commande existante à modifier).
 *
 * ── Secours automatique ──────────────────────────────────────────────────
 * Chaque émoji déclare un `fallback` Unicode. Au démarrage, `syncAvailability`
 * (events/emoji/ready.js) vérifie quels émojis personnalisés existent réellement
 * (émojis d'application du bot + émojis des serveurs en cache) : si un émoji a
 * été supprimé, toutes les résolutions basculent **automatiquement** sur son
 * secours Unicode. Tant que la vérification n'a pas eu lieu (scripts, tests,
 * avant `ready`), on renvoie l'émoji personnalisé (rendu par Discord s'il
 * existe) — optimiste et sans identifiant en dur ailleurs.
 *
 * ── Formes d'utilisation ─────────────────────────────────────────────────
 * - `emojis.thumb` (ou `emojis.get('thumb')`) → chaîne à insérer dans un texte
 *   ou une description d'embed (`<:pouce:...>` ou secours Unicode).
 * - `emojis.component('thumb')` → valeur pour `ButtonBuilder#setEmoji` /
 *   `StringSelectMenuOptionBuilder#setEmoji` (`{ id, name }` ou Unicode).
 * - `emojis.fallback('thumb')` → uniquement le secours Unicode.
 */

/** Définitions officielles (id + nom Discord + secours Unicode). */
const DEFS = {
  basic: { id: '1528863420189904966', name: 'basique', fallback: '🤖' },
  thumb: { id: '1528866409856372736', name: 'pouce', fallback: '👍' },
  party: { id: '1528866402985967627', name: 'party', fallback: '🎉' },
  sleepy: { id: '1528866396086210641', name: 'sleepy', fallback: '😴' },
  glitch: { id: '1528866389006221373', name: 'glitch', fallback: '⚠️' },
  crying: { id: '1528864632863981761', name: 'crying', fallback: '😢' },
  angry: { id: '1528864625758834738', name: 'angry', fallback: '😠' },
  love: { id: '1528864619068784781', name: 'love', fallback: '❤️' },
  doubt: { id: '1528864611150069970', name: 'doute', fallback: '🤔' },
  happy: { id: '1528863410479956148', name: 'content', fallback: '😄' },
  wink: { id: '1528863400971731114', name: 'wink', fallback: '😉' },
  shocked: { id: '1528863387092783185', name: 'choque', fallback: '😲' },
};

// NB : les **logos de catégories** ne sont volontairement plus définis ici.
// Les émojis personnalisés servent uniquement à la personnalité des *messages*
// du bot ; les logos de catégories (help, menus, web, onglets) restent des
// émojis Discord standards, centralisés dans `config/categoryEmojis.js`.

/** Clés résolues comme disponibles après vérification au démarrage. */
const available = new Set();
let checked = false;

function mention(def) {
  return `<:${def.name}:${def.id}>`;
}

/** true si l'émoji personnalisé doit être utilisé (sinon : secours Unicode). */
function isAvailable(key) {
  if (!checked) return true; // optimiste avant la vérification (ou hors ligne)
  return available.has(key);
}

/**
 * Chaîne à insérer dans un texte/description : émoji personnalisé si disponible,
 * secours Unicode sinon.
 * @param {string} key
 * @returns {string}
 */
function get(key) {
  const def = DEFS[key];
  if (!def) return '';
  return isAvailable(key) ? mention(def) : def.fallback;
}

/**
 * Valeur d'émoji pour un composant (`setEmoji`) : objet `{ id, name }` pour un
 * émoji personnalisé, chaîne Unicode pour le secours.
 * @param {string} key
 * @returns {{ id: string, name: string } | string}
 */
function component(key) {
  const def = DEFS[key];
  if (!def) return undefined;
  return isAvailable(key) ? { id: def.id, name: def.name } : def.fallback;
}

/** Secours Unicode seul. */
function fallback(key) {
  return DEFS[key]?.fallback ?? '';
}

/**
 * Vérifie la disponibilité réelle des émojis personnalisés et bascule au besoin
 * sur les secours Unicode. Appelée une fois au démarrage.
 * @param {import('discord.js').Client} client
 */
async function syncAvailability(client) {
  const present = new Set();
  let enumerated = false;
  try {
    const appEmojis = await client.application.emojis.fetch();
    for (const id of appEmojis.keys()) present.add(id);
    enumerated = true;
  } catch {
    // Émojis d'application inaccessibles : on reste optimiste (voir plus bas).
  }
  for (const id of client.emojis?.cache?.keys?.() ?? []) present.add(id);

  available.clear();
  for (const [key, def] of Object.entries(DEFS)) {
    // Si l'énumération a échoué, on ne dégrade pas : l'émoji personnalisé est
    // conservé (Discord le rend s'il existe). Le secours ne s'applique qu'aux
    // émojis explicitement absents d'une énumération réussie.
    if (present.has(def.id) || !enumerated) available.add(key);
  }
  checked = true;
  return { checked, available: [...available], missing: Object.keys(DEFS).filter((k) => !available.has(k)) };
}

/** Réinitialise l'état de disponibilité (tests uniquement). */
function _resetAvailability() {
  available.clear();
  checked = false;
}

// Accès direct par propriété : `emojis.thumb` renvoie la chaîne résolue.
const emojis = {};
for (const key of Object.keys(DEFS)) {
  Object.defineProperty(emojis, key, { enumerable: true, get: () => get(key) });
}
for (const [name, fn] of Object.entries({
  get,
  component,
  fallback,
  syncAvailability,
  _resetAvailability,
})) {
  Object.defineProperty(emojis, name, { enumerable: false, value: fn });
}
Object.defineProperty(emojis, 'keys', { enumerable: false, value: () => Object.keys(DEFS) });
Object.defineProperty(emojis, 'DEFS', { enumerable: false, value: DEFS });

module.exports = emojis;
