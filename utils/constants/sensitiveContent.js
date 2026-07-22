/**
 * Métadonnées de la protection anti-contenus sensibles.
 *
 * La **base locale** (domaines + mots-clés par catégorie) est chargée depuis
 * `data/protections/sensitiveBlacklist.json` (fichier versionné, éditable sans
 * toucher au code). Les éléments qui ne peuvent pas vivre dans un JSON —
 * **expressions régulières**, tables d'obfuscation — sont déclarés ici.
 *
 * Catégories : `porn`, `gore`, `violence`, `danger` (+ `custom` pour les
 * domaines/mots-clés ajoutés par un serveur). Volontairement fermé et
 * extensible : ajouter une catégorie = une entrée dans `CATEGORIES` + le JSON.
 *
 * Détection **hors ligne** (aucune requête réseau) : voir
 * `services/antisensitive/sensitiveMatcher`.
 */
const fs = require('node:fs');
const path = require('node:path');

const BLACKLIST_PATH = path.join(__dirname, '..', '..', 'data', 'protections', 'sensitiveBlacklist.json');

/** Catégories (libellé + émoji + gravité 1-4). */
const CATEGORIES = {
  porn: { key: 'porn', label: 'Contenu pour adultes', emoji: '🔞', severity: 3 },
  gore: { key: 'gore', label: 'Gore / violence extrême', emoji: '🩸', severity: 4 },
  violence: { key: 'violence', label: 'Contenu violent / choquant', emoji: '⚔️', severity: 3 },
  danger: { key: 'danger', label: 'Contenu dangereux', emoji: '🚨', severity: 4 },
  custom: { key: 'custom', label: 'Bloqué (personnalisé)', emoji: '⛔', severity: 2 },
};

const CONTENT_CATEGORIES = ['porn', 'gore', 'violence', 'danger'];

/** Charge la base locale (domaines + mots-clés). Robuste : jamais bloquant. */
function loadBlacklist() {
  const db = { porn: { domains: [], keywords: [] }, gore: { domains: [], keywords: [] }, violence: { domains: [], keywords: [] }, danger: { domains: [], keywords: [] } };
  try {
    const raw = JSON.parse(fs.readFileSync(BLACKLIST_PATH, 'utf8'));
    for (const cat of CONTENT_CATEGORIES) {
      db[cat] = {
        domains: Array.isArray(raw[cat]?.domains) ? raw[cat].domains.map((d) => String(d).toLowerCase()) : [],
        keywords: Array.isArray(raw[cat]?.keywords) ? raw[cat].keywords.map((k) => String(k).toLowerCase()) : [],
      };
    }
  } catch {
    // Fichier absent/corrompu : on continue avec une base vide (jamais planter).
  }
  return db;
}

const DB = loadBlacklist();

/**
 * Expressions régulières par catégorie (formulations en plusieurs mots,
 * arnaques typiques…). Appliquées au texte normalisé.
 */
const EXPRESSIONS = {
  porn: [/\bonly[\s.-]?fans\b/iu, /\bcontenu[s]?\s+(?:pour\s+)?adulte[s]?\b/iu],
  gore: [/\bwatch\s+people\s+die\b/iu, /\breal\s+(?:death|killing)\s+videos?\b/iu],
  violence: [/\bvid[eé]os?\s+choquantes?\b/iu, /\bextreme\s+violence\b/iu],
  danger: [
    /\bblackout\s+challenge\b/iu,
    /\bchoking\s+challenge\b/iu,
    /\b(?:suicide|self[\s-]?harm)\s+(?:challenge|method)\b/iu,
    /\bfree\s+(?:discord\s+)?nitro\b/iu,
    /\bsteam\s*community\.com\/(?:gift|trade)\b/iu,
    /\bfree\s+(?:robux|v-?bucks|steam\s+gift)\b/iu,
  ],
};

/**
 * Termes « anti-obfuscation » : tokens **longs et non ambigus** recherchés dans
 * la version *condensée* du texte (séparateurs retirés), pour attraper
 * « p o r n h u b », « x.v.i.d.e.o.s ». Volontairement limité aux termes qui
 * n'apparaissent pas dans une prose normale une fois condensée (évite les faux
 * positifs — on n'y met jamais de mot court comme « gore » ou « porn »).
 */
const OBFUSCATION_TERMS = ['pornhub', 'xvideos', 'xhamster', 'chaturbate', 'bestgore', 'onlyfans', 'stripchat', 'redtube', 'brazzers'];

/** Raccourcisseurs d'URL connus (signalés ; jamais résolus par le réseau). */
const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd', 'buff.ly',
  'cutt.ly', 'rebrand.ly', 'shorturl.at', 'rb.gy', 'tiny.cc', 'shorte.st',
]);

/** Homoglyphes fréquents → lettre latine (dé-obfuscation Unicode). */
const HOMOGLYPHS = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', к: 'k', і: 'i', ѕ: 's',
  ａ: 'a', ｅ: 'e', ｏ: 'o', '𝗉': 'p', ᴏ: 'o', ᴀ: 'a',
};

/** Substitutions leet-speak → lettre. */
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '|': 'i' };

/** Aplatit les domaines de la base en une table domaine → catégorie. */
function domainCategoryMap() {
  const map = new Map();
  for (const cat of CONTENT_CATEGORIES) {
    for (const domain of DB[cat].domains) map.set(domain, cat);
  }
  return map;
}

module.exports = {
  CATEGORIES,
  CONTENT_CATEGORIES,
  DB,
  EXPRESSIONS,
  OBFUSCATION_TERMS,
  SHORTENERS,
  HOMOGLYPHS,
  LEET,
  domainCategoryMap,
  BLACKLIST_PATH,
};
