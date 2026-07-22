/**
 * Anti-doublon / anti-spam des logs.
 *
 * Deux événements identiques rapprochés dans le temps (même serveur, même
 * catégorie, même signature) ne produisent qu'un seul log : évite les doublons
 * (ex. un même changement remonté par plusieurs sources) et limite le spam.
 *
 * Volontairement en mémoire (léger, non critique) : au pire, après un
 * redémarrage, un doublon très rapproché pourrait repasser — sans conséquence.
 */

/** Fenêtre par défaut pendant laquelle une signature identique est ignorée (ms). */
const DEFAULT_WINDOW_MS = 4000;
/** Taille max du suivi (purge des entrées les plus anciennes au-delà). */
const MAX_ENTRIES = 500;

/** signature → dernier horodatage. */
const seen = new Map();

function prune(now) {
  if (seen.size <= MAX_ENTRIES) return;
  for (const [key, at] of seen) {
    if (now - at > DEFAULT_WINDOW_MS) seen.delete(key);
    if (seen.size <= MAX_ENTRIES) break;
  }
}

/**
 * @param {string} signature - Identifie l'événement (ex. `guildId:category:title:targetId`).
 * @param {number} [windowMs]
 * @returns {boolean} true si l'événement doit être consigné (non doublon).
 */
function shouldLog(signature, windowMs = DEFAULT_WINDOW_MS) {
  const now = Date.now();
  const last = seen.get(signature);
  if (last !== undefined && now - last < windowMs) return false;
  seen.set(signature, now);
  prune(now);
  return true;
}

/** Réinitialise le suivi (tests). */
function _reset() {
  seen.clear();
}

module.exports = { shouldLog, _reset, DEFAULT_WINDOW_MS };
