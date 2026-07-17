/**
 * Types de questions d'un formulaire.
 *
 * `modal` : la question est posée dans une modal Discord (saisie texte) ;
 * `select` : la question est posée via un menu déroulant (choix). Ajouter un
 * type = une entrée ici (+ sa collecte dans le service de soumission).
 */
module.exports = {
  short: { key: 'short', label: 'Texte court', input: 'modal', style: 'short' },
  long: { key: 'long', label: 'Texte long', input: 'modal', style: 'paragraph' },
  number: { key: 'number', label: 'Nombre', input: 'modal', style: 'short', validate: 'number' },
  date: { key: 'date', label: 'Date', input: 'modal', style: 'short', validate: 'date' },
  single: { key: 'single', label: 'Choix unique', input: 'select', multi: false },
  multiple: { key: 'multiple', label: 'Choix multiple', input: 'select', multi: true },
};
