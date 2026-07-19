/**
 * Types de sanctions et échelle progressive par défaut du système de warns.
 *
 * Chaque palier (= nombre de warns) déclenche automatiquement une sanction.
 * Le palier 1 est **toujours** un simple avertissement (imposé par le
 * service, non modifiable). L'échelle est configurable par serveur
 * (setwarnsanction) et extensible : ajouter un type = une entrée dans
 * SANCTION_TYPES ; ajouter un palier = une entrée dans la config du serveur.
 */

/** Types de sanction disponibles. `duration` : un délai est requis. */
const SANCTION_TYPES = {
  warn: { key: 'warn', label: 'Avertissement', emoji: '⚠️', duration: false, punitive: false },
  timeout: { key: 'timeout', label: 'Exclusion temporaire', emoji: '⏳', duration: true, punitive: true },
  mute: { key: 'mute', label: 'Mute (rôle)', emoji: '🔇', duration: false, punitive: true },
  kick: { key: 'kick', label: 'Expulsion', emoji: '👢', duration: false, punitive: true },
  ban: { key: 'ban', label: 'Bannissement', emoji: '🔨', duration: false, punitive: true },
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * Échelle par défaut : { "<nbWarns>": { type, durationMs?, enabled } }.
 * 1 → avertissement, 2 → timeout 5 min, 3 → timeout 15 min, 4 → timeout 1 h,
 * 5 → timeout 1 j, 6 → timeout 1 semaine, 7 → bannissement définitif.
 * Le palier 1 reste toujours un simple avertissement (imposé par le service).
 */
const DEFAULT_LADDER = {
  1: { type: 'warn', enabled: true },
  2: { type: 'timeout', durationMs: 5 * MINUTE_MS, enabled: true },
  3: { type: 'timeout', durationMs: 15 * MINUTE_MS, enabled: true },
  4: { type: 'timeout', durationMs: HOUR_MS, enabled: true },
  5: { type: 'timeout', durationMs: DAY_MS, enabled: true },
  6: { type: 'timeout', durationMs: WEEK_MS, enabled: true },
  7: { type: 'ban', enabled: true },
};

module.exports = { SANCTION_TYPES, DEFAULT_LADDER, MINUTE_MS, HOUR_MS, DAY_MS, WEEK_MS };
