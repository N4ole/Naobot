/**
 * Moteur de détection des contenus sensibles — **fonctions pures**, sans état,
 * sans requête réseau, testables isolément. Le service
 * (`antisensitiveService`) orchestre configuration, réaction et logs ; ici on
 * ne fait qu'**analyser un texte**.
 *
 * Trois méthodes combinées, par catégorie activée :
 *   1. **Domaines** : hôtes (et sous-domaines) trouvés dans le texte, y compris
 *      dans les **paramètres d'URL** (redirections) et après dé-obfuscation ;
 *      `www.` retiré, minuscules.
 *   2. **Mots-clés** : mots entiers, après normalisation **anti-contournement**
 *      (leet-speak `p0rn`, homoglyphes, accents, répétitions `pooorn`).
 *   3. **Expressions** : formulations en plusieurs mots / arnaques (regex), plus
 *      un passage « condensé » (séparateurs retirés) pour `p o r n h u b`.
 *
 * Les structures lourdes (regex de mots-clés) sont **précompilées** une seule
 * fois au chargement du module (performance : plusieurs milliers de serveurs).
 */
const {
  CATEGORIES, CONTENT_CATEGORIES, DB, EXPRESSIONS, OBFUSCATION_TERMS, SHORTENERS, HOMOGLYPHS, LEET, domainCategoryMap,
} = require('../../utils/constants/sensitiveContent');

const STATIC_DOMAINS = domainCategoryMap();

/** Échappe une chaîne pour un usage regex. */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const INVISIBLES = /[​-‍﻿⁠]/g;
const ACCENTS = /[̀-ͯ]/g;

/** Normalise pour révéler les URLs dissimulées (espaces, « (dot) », invisibles). */
function normalizeForDomains(content) {
  return content
    .toLowerCase()
    .normalize('NFKC')
    .replace(INVISIBLES, '')
    .replace(/[[({]\s*\.\s*[\])}]/g, '.')
    .replace(/\s*\(?\[?\s*(?:dot|point|d0t)\s*\)?\]?\s*/gi, '.')
    .replace(/\s*\.\s*/g, '.');
}

/**
 * Normalise le texte contre les contournements (leet, homoglyphes, accents).
 * On ne « collapse » **pas** les répétitions : cela transformerait des mots-clés
 * légitimes comme « xxx » en « x » (faux positifs). Les espacements sont gérés
 * par le passage *condensé* (voir `condense`).
 */
function normalizeForText(content) {
  let s = content.toLowerCase().normalize('NFKC').replace(INVISIBLES, '');
  s = [...s].map((ch) => HOMOGLYPHS[ch] ?? ch).join('');
  s = [...s].map((ch) => LEET[ch] ?? ch).join('');
  s = s.normalize('NFD').replace(ACCENTS, ''); // accents
  return s;
}

/**
 * Regex de mots-clés précompilée par catégorie. Les mots-clés sont **normalisés**
 * (comme le texte analysé) pour que « porn », « pr0n », « pörn »… se comparent
 * sur la même base canonique.
 */
const KEYWORD_REGEX = {};
for (const cat of CONTENT_CATEGORIES) {
  const kws = [...new Set(DB[cat].keywords.map((k) => normalizeForText(k)).filter(Boolean))];
  KEYWORD_REGEX[cat] = kws.length ? new RegExp(`\\b(?:${kws.map(escapeRegex).join('|')})\\b`, 'iu') : null;
}

/** Terme d'obfuscation → catégorie (dérivé de la base). */
const OBF_TERM_CATEGORY = new Map();
for (const term of OBFUSCATION_TERMS) {
  for (const [domain, cat] of STATIC_DOMAINS) {
    if (domain.startsWith(`${term}.`) || domain === term) { OBF_TERM_CATEGORY.set(term, cat); break; }
  }
}

/** Version condensée (séparateurs retirés) : « p o r n h u b » → « pornhub ». */
function condense(text) {
  return text.replace(/[\s._\-|]+/g, '');
}

/** Retire un `www.` de tête et le point final. */
function cleanHost(host) {
  return host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

/**
 * Extrait les hôtes (domaines) d'un texte. On ne consomme **pas** le chemin :
 * chaque suite ressemblant à un domaine est capturée indépendamment, ce qui
 * révèle aussi les domaines cachés dans un **paramètre d'URL** (redirection),
 * ex. `safe.com/r?url=pornhub.com`.
 */
function extractHosts(text) {
  const hosts = new Set();
  const regex = /([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const host = cleanHost(match[1]);
    if (host.includes('.')) hosts.add(host);
  }
  return [...hosts];
}

/** true si l'hôte correspond au domaine ou à l'un de ses sous-domaines. */
function hostMatchesDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Catégorie d'un hôte (base statique + domaines bloqués/autorisés du serveur). */
function categoryForHost(host, config, enabled) {
  if ((config.allowedDomains ?? []).some((d) => hostMatchesDomain(host, d.toLowerCase()))) return null;
  const staticCat = STATIC_DOMAINS.get(host) ?? [...STATIC_DOMAINS].find(([d]) => hostMatchesDomain(host, d))?.[1] ?? null;
  if (staticCat && enabled.has(staticCat)) return staticCat;
  if ((config.blockedDomains ?? []).some((d) => hostMatchesDomain(host, d.toLowerCase()))) return 'custom';
  return null;
}

/** Décode au mieux les paramètres d'URL (pour révéler une redirection). */
function decodeParams(text) {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

/** Ensemble des catégories de contenu activées d'après la config. */
function enabledCategories(config) {
  const flags = config?.categories ?? {};
  return new Set(CONTENT_CATEGORIES.filter((cat) => flags[cat] !== false));
}

/**
 * Analyse un contenu et renvoie la première correspondance sensible, ou null.
 * @param {string} content
 * @param {object} [config]
 * @returns {{ category: string, method: 'domain'|'keyword'|'expression', match: string, host?: string } | null}
 */
function analyze(content, config = {}) {
  if (!content || typeof content !== 'string') return null;
  const enabled = enabledCategories(config);
  // Mots-clés explicitement autorisés + **noms de marque des domaines autorisés** :
  // autoriser un domaine (« pornhub.com ») doit aussi neutraliser le mot-clé
  // correspondant (« pornhub »), sans quoi le message serait bloqué malgré la
  // liste blanche. On ajoute chaque étiquette (>= 3 caractères) du domaine.
  const allowedKeywords = new Set((config.allowedKeywords ?? []).map((k) => k.toLowerCase()));
  for (const domain of config.allowedDomains ?? []) {
    for (const label of String(domain).toLowerCase().split('.')) {
      if (label.length >= 3) allowedKeywords.add(label);
    }
  }

  // 1. Domaines (texte brut, dé-obfusqué, et paramètres d'URL décodés).
  const domainTexts = [content, normalizeForDomains(content), decodeParams(content)];
  for (const text of domainTexts) {
    for (const host of extractHosts(text)) {
      const category = categoryForHost(host, config, enabled);
      if (category) return { category, method: 'domain', match: host.slice(0, 100), host };
    }
  }

  const normalized = normalizeForText(content);

  // 2. Expressions (formulations multi-mots / arnaques).
  for (const cat of CONTENT_CATEGORIES) {
    if (!enabled.has(cat)) continue;
    for (const re of EXPRESSIONS[cat] ?? []) {
      const m = re.exec(normalized);
      if (m) return { category: cat, method: 'expression', match: m[0].slice(0, 100) };
    }
  }

  // 3. Anti-obfuscation condensée (« p o r n h u b »). On respecte la liste
  //    des domaines autorisés : un terme dont le domaine est autorisé est ignoré.
  const allowedDomains = (config.allowedDomains ?? []).map((d) => d.toLowerCase());
  const condensed = condense(normalized);
  for (const [term, cat] of OBF_TERM_CATEGORY) {
    if (!enabled.has(cat) || !condensed.includes(term)) continue;
    if (allowedDomains.some((d) => d === term || d.startsWith(`${term}.`))) continue;
    return { category: cat, method: 'keyword', match: term };
  }

  // 4. Mots-clés (mots entiers, texte normalisé).
  for (const cat of CONTENT_CATEGORIES) {
    if (!enabled.has(cat) || !KEYWORD_REGEX[cat]) continue;
    const m = KEYWORD_REGEX[cat].exec(normalized);
    if (m && !allowedKeywords.has(m[0].toLowerCase())) return { category: cat, method: 'keyword', match: m[0].slice(0, 100) };
  }

  // 5. Mots-clés personnalisés du serveur → catégorie « custom » (normalisés).
  const custom = [...new Set((config.blockedKeywords ?? []).map((k) => normalizeForText(k)).filter(Boolean))];
  if (custom.length) {
    const re = new RegExp(`\\b(?:${custom.map(escapeRegex).join('|')})\\b`, 'iu');
    const m = re.exec(normalized);
    if (m && !allowedKeywords.has(m[0].toLowerCase())) return { category: 'custom', method: 'keyword', match: m[0].slice(0, 100) };
  }

  return null;
}

/** true si l'hôte est un raccourcisseur d'URL connu (signalé, jamais résolu). */
function isShortener(host) {
  return SHORTENERS.has(cleanHost(host));
}

module.exports = {
  analyze,
  normalizeForDomains,
  normalizeForText,
  condense,
  extractHosts,
  cleanHost,
  isShortener,
  CATEGORIES,
};
