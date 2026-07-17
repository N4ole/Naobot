/**
 * Statuts d'une conversation de contact propriétaire ↔ owners.
 *
 * Ajouter un statut = une entrée ici ; le menu de changement de statut et
 * les affichages le prennent en compte automatiquement.
 */
module.exports = {
  open: { key: 'open', label: 'Ouverte', emoji: '🟢' },
  pending: { key: 'pending', label: 'En attente', emoji: '🟡' },
  handled: { key: 'handled', label: 'Traitée', emoji: '🔵' },
  closed: { key: 'closed', label: 'Fermée', emoji: '🔴' },
};
