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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Échelle par défaut : { "<nbWarns>": { type, durationMs?, enabled } }.
 * 1 → avertissement, 2 → timeout 1 h, 3 → timeout 1 j, 4 → mute,
 * 5 → kick, 6 → ban.
 */
const DEFAULT_LADDER = {
  1: { type: 'warn', enabled: true },
  2: { type: 'timeout', durationMs: HOUR_MS, enabled: true },
  3: { type: 'timeout', durationMs: DAY_MS, enabled: true },
  4: { type: 'mute', enabled: true },
  5: { type: 'kick', enabled: true },
  6: { type: 'ban', enabled: true },
};

module.exports = { SANCTION_TYPES, DEFAULT_LADDER, HOUR_MS, DAY_MS };
