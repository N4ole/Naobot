/**
 * Types de tickets disponibles.
 *
 * Chaque entrée définit un type indépendant : panneau dédié, compteur
 * commun au serveur, règles affichées. **Ajouter un type = ajouter une
 * entrée ici** — la commande setticket (choix slash inclus), les panneaux,
 * la création de salons et les logs le prennent en compte automatiquement.
 */
module.exports = {
  assistance: {
    label: 'Assistance',
    emoji: '🛟',
    description:
      "Besoin d'aide sur le serveur ? Ouvrez un ticket et l'équipe vous accompagnera dès que possible.",
    rules: "Décrivez votre problème le plus précisément possible. Un seul ticket d'assistance ouvert à la fois.",
  },
  questions: {
    label: 'Questions',
    emoji: '❓',
    description: 'Une question sur le serveur ou son fonctionnement ? Posez-la dans un ticket.',
    rules: "Vérifiez d'abord que la réponse ne se trouve pas dans les salons d'information.",
  },
  report: {
    label: 'Report',
    emoji: '🚨',
    description: "Reportez un bug ou un dysfonctionnement à l'équipe.",
    rules: "Incluez un maximum de détails : captures d'écran, étapes de reproduction…",
  },
  signalement: {
    label: 'Signalement',
    emoji: '⚠️',
    description: "Signalez le comportement d'un membre à la modération, en toute confidentialité.",
    rules: 'Les signalements abusifs pourront être sanctionnés.',
  },
};
