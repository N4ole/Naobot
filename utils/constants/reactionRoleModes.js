/**
 * Modes de fonctionnement d'un panneau de rôles réactions.
 *
 * - multiple : autant de rôles que souhaité ;
 * - unique   : un seul rôle du panneau à la fois (les autres sont retirés) ;
 * - limited  : nombre maximal de rôles sélectionnables (champ `limit`).
 *
 * Ajouter un mode = une entrée ici ; le service en tient compte pour la
 * construction des composants et l'application des rôles.
 */
module.exports = {
  multiple: { key: 'multiple', label: 'Multiple', emoji: '☑️', description: 'Autant de rôles que souhaité' },
  unique: { key: 'unique', label: 'Unique', emoji: '🔘', description: 'Un seul rôle à la fois' },
  limited: { key: 'limited', label: 'Limité', emoji: '🔢', description: 'Nombre maximal de rôles' },
};
