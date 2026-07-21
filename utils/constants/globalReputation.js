/**
 * Réputation globale (inter-serveurs) des utilisateurs : métadonnées des
 * actions, pondérations par défaut, niveaux de confiance et badges.
 *
 * Distinct de `reputationLevels.js` (réputation des SERVEURS). Ici le score est
 * global à l'UTILISATEUR (indépendant du serveur) et centralisé au niveau du
 * bot : un serveur ne peut jamais le fixer directement, seulement y contribuer
 * via des événements tracés. Source unique et **extensible** : ajouter une
 * action ou un niveau = une entrée ici ; les pondérations réelles sont
 * configurables (database/reputationConfigRepository), ces valeurs sont les
 * défauts.
 */

const SCORE_MIN = 0;
const SCORE_MAX = 100;
const SCORE_BASE = 100;

/** Pondérations par défaut (points retirés). */
const DEFAULT_WEIGHTS = {
  warn: 3,
  timeoutShort: 5,
  timeoutLong: 10,
  mute: 8,
  kick: 15,
  ban: 30,
  antispam: 4,
  antilink: 4,
  antibot: 15,
  captcha: 6,
};

/** Facteurs positifs par défaut (points ajoutés, plafonnés par SCORE_MAX). */
const DEFAULT_POSITIVE = {
  accountAgePerYear: 2,
  accountAgeMax: 10,
};

/** Limites anti-abus par défaut. */
const DEFAULT_LIMITS = {
  maxEventsPerGuildPerDay: 20,
};

const TIMEOUT_LONG_MS = 24 * 60 * 60 * 1000;

/** Correspondance action → compteur de statistiques. */
const ACTION_STAT = {
  warn: 'warns',
  timeout: 'timeouts',
  mute: 'mutes',
  kick: 'kicks',
  ban: 'bans',
  antispam: 'antispam',
  antilink: 'antilink',
  antibot: 'antibot',
  captcha: 'captcha',
};

/**
 * Niveaux de confiance (du plus haut au plus bas), par seuil minimal.
 * `emojiKey` désigne l'émoji officiel NaoBot associé (config/emojis.js) :
 * bonne réputation → `love`, moyenne → `doubt`, mauvaise → `angry`. `emoji`
 * reste le secours Unicode si l'émoji personnalisé venait à manquer.
 */
const TRUST_LEVELS = [
  { key: 'excellent', min: 90, label: 'Très fiable', emoji: '🟢', emojiKey: 'love' },
  { key: 'good', min: 70, label: 'Fiable', emoji: '🟩', emojiKey: 'love' },
  { key: 'neutral', min: 50, label: 'À surveiller', emoji: '🟡', emojiKey: 'doubt' },
  { key: 'risky', min: 25, label: 'À risque', emoji: '🟠', emojiKey: 'angry' },
  { key: 'critical', min: 0, label: 'Problématique', emoji: '🔴', emojiKey: 'angry' },
];

function trustLevel(score) {
  return TRUST_LEVELS.find((level) => score >= level.min) ?? TRUST_LEVELS[TRUST_LEVELS.length - 1];
}

/** Badges de réputation (extensibles) selon le profil. */
function badgesFor(record, score) {
  const badges = [];
  const stats = record.stats ?? {};
  const totalSanctions = Object.values(stats).reduce((sum, n) => sum + (n || 0), 0);
  if (score >= 95 && totalSanctions === 0) badges.push('🏅 Casier vierge');
  else if (score >= 90) badges.push('🟢 Très fiable');
  if ((stats.bans ?? 0) > 0) badges.push('⛔ Déjà banni');
  if (totalSanctions >= 10) badges.push('⚠️ Récidiviste');
  if ((record.guilds?.length ?? 0) >= 3) badges.push('🌐 Multi-serveurs');
  return badges;
}

module.exports = {
  SCORE_MIN,
  SCORE_MAX,
  SCORE_BASE,
  DEFAULT_WEIGHTS,
  DEFAULT_POSITIVE,
  DEFAULT_LIMITS,
  TIMEOUT_LONG_MS,
  ACTION_STAT,
  TRUST_LEVELS,
  trustLevel,
  badgesFor,
};
