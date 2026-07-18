/**
 * Types de captcha disponibles. Source unique et **extensible** : ajouter un
 * type = une entrée ici + un cas dans captchaService.generateChallenge, sans
 * toucher aux commandes ni à l'assistant.
 *
 * `hasInput` : true si la résolution passe par une saisie (modal), false si un
 * simple clic suffit (bouton).
 */
module.exports = {
  button: {
    key: 'button',
    label: 'Bouton simple',
    emoji: '🔘',
    description: 'Cliquer sur un bouton de vérification',
    hasInput: false,
  },
  text: {
    key: 'text',
    label: 'Code aléatoire',
    emoji: '🔤',
    description: 'Recopier un code aléatoire (ex. K7P4X9)',
    hasInput: true,
  },
  math: {
    key: 'math',
    label: 'Calcul',
    emoji: '➗',
    description: 'Résoudre une opération simple',
    hasInput: true,
  },
};
