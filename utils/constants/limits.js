/** Limites et valeurs par défaut, alignées sur les limites de l'API Discord. */
module.exports = {
  // Durée maximale d'un timeout Discord natif : 28 jours.
  MAX_TIMEOUT_MS: 28 * 24 * 60 * 60 * 1000,
  // bulkDelete accepte entre 1 et 100 messages (de moins de 14 jours).
  MIN_PURGE: 1,
  MAX_PURGE: 100,
  // Longueur maximale d'une raison dans les logs d'audit Discord.
  MAX_AUDIT_REASON_LENGTH: 512,
  // Cooldown par défaut (en secondes) si la commande n'en définit pas.
  DEFAULT_COOLDOWN_SECONDS: 3,
};
