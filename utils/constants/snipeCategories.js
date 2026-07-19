/**
 * Catégories du système de snipe (consultation des événements récents
 * supprimés / modifiés). Elles reprennent la logique de catégorisation des
 * logs, tout en restant **fermées et explicites**.
 *
 * Chaque catégorie associe une **commande** dédiée. Ajouter une catégorie =
 * une entrée ici (+ l'enregistrement des événements concernés via
 * `snipeService.record`) ; la commande générée, les filtres et la pagination
 * suivent automatiquement.
 */
module.exports = {
  deleted: { key: 'deleted', label: 'Messages supprimés', emoji: '🗑️', command: 'snipe', aliases: [] },
  edited: { key: 'edited', label: 'Messages modifiés', emoji: '✏️', command: 'editsnipe', aliases: [] },
  members: { key: 'members', label: 'Arrivées / départs', emoji: '👋', command: 'membersnipe', aliases: [] },
  roles: { key: 'roles', label: 'Changements de rôles', emoji: '🎭', command: 'rolesnipe', aliases: [] },
  sanctions: { key: 'sanctions', label: 'Sanctions', emoji: '📛', command: 'sanctionsnipe', aliases: [] },
  tickets: { key: 'tickets', label: 'Tickets', emoji: '🎫', command: 'ticketsnipe', aliases: [] },
  protections: { key: 'protections', label: 'Protections', emoji: '🛡️', command: 'protectionsnipe', aliases: [] },
};
