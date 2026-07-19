/**
 * Listes de domaines à contenu sensible, par catégorie, pour la protection
 * anti-contenus sensibles (services/antisensitive).
 *
 * Volontairement **fermé et extensible** : ajouter une catégorie = une entrée
 * ici ; ajouter un domaine = une entrée dans la liste concernée. L'architecture
 * du service permet en outre de brancher plus tard des sources externes
 * (API de réputation, listes noires distantes, modèles d'analyse) et une
 * liste configurable par serveur.
 *
 * Les correspondances se font sur le **domaine et ses sous-domaines** (ex.
 * `m.example.com` correspond à `example.com`).
 */

/** Catégories de contenus sensibles (libellés pour les logs/status). */
const CATEGORIES = {
  adult: { key: 'adult', label: 'Contenu pour adultes', emoji: '🔞' },
  gore: { key: 'gore', label: 'Contenu violent / gore', emoji: '🩸' },
  shock: { key: 'shock', label: 'Contenu choquant', emoji: '⚠️' },
};

/** Domaines connus par catégorie (liste non exhaustive, extensible). */
const DOMAINS = {
  adult: [
    'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com',
    'youporn.com', 'youjizz.com', 'brazzers.com', 'onlyfans.com', 'spankbang.com',
    'chaturbate.com', 'stripchat.com', 'rule34.xxx', 'e-hentai.org', 'nhentai.net',
    'fansly.com', 'motherless.com', 'tnaflix.com', 'eporner.com',
  ],
  gore: [
    'bestgore.com', 'bestgore.fun', 'theync.com', 'documentingreality.com',
    'watchpeopledie.tv', 'seegore.com', 'goregrish.com', 'kaotic.com', 'deathaddict.com',
  ],
  shock: [
    'liveleak.com', 'ogrish.com', 'rotten.com', 'shockgore.com',
  ],
};

/** Aplatit les domaines en une table domaine → catégorie. */
function domainCategoryMap() {
  const map = new Map();
  for (const [category, list] of Object.entries(DOMAINS)) {
    for (const domain of list) map.set(domain.toLowerCase(), category);
  }
  return map;
}

module.exports = { CATEGORIES, DOMAINS, domainCategoryMap };
