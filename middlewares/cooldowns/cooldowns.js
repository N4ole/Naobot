/**
 * Middleware de cooldown : limite la fréquence d'utilisation de chaque
 * commande par utilisateur (anti-spam). La durée est définie par la
 * propriété `cooldown` de la commande (en secondes), avec une valeur
 * par défaut centralisée dans utils/constants/limits.js.
 */
const { DEFAULT_COOLDOWN_SECONDS } = require('../../utils/constants/limits');

/** Map<commandName, Map<userId, expiresAtMs>> */
const cooldowns = new Map();

/**
 * Vérifie et enregistre le cooldown d'un utilisateur pour une commande.
 * @param {string} userId
 * @param {object} command
 * @returns {number} secondes restantes (0 si la commande peut s'exécuter)
 */
function checkCooldown(userId, command) {
  const durationMs = (command.cooldown ?? DEFAULT_COOLDOWN_SECONDS) * 1000;
  if (durationMs <= 0) return 0;

  if (!cooldowns.has(command.name)) cooldowns.set(command.name, new Map());
  const commandCooldowns = cooldowns.get(command.name);

  const now = Date.now();
  const expiresAt = commandCooldowns.get(userId);
  if (expiresAt !== undefined && expiresAt > now) {
    return Math.ceil((expiresAt - now) / 1000);
  }

  commandCooldowns.set(userId, now + durationMs);
  // Nettoyage automatique pour éviter une croissance infinie de la Map.
  setTimeout(() => commandCooldowns.delete(userId), durationMs).unref?.();
  return 0;
}

module.exports = { checkCooldown };
