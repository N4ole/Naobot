/**
 * Couleurs des embeds du bot, **dérivées de la charte graphique**
 * (`config/designTokens.js` — source unique partagée avec l'interface web).
 * Aucune valeur n'est écrite en dur ici : changer une couleur de marque se
 * fait à un seul endroit et se répercute sur les embeds comme sur le site.
 *
 * Les couleurs LOG_* qualifient la nature d'un événement dans les salons de
 * logs : création (vert), suppression (rouge), modification (ambre),
 * information neutre (neutre 400).
 *
 * Trois changements par rapport à l'ancienne palette Discord générique :
 *   - `INFO` devient le **bleu NaoBot** : l'information neutre est la voix du
 *     bot, donc la couleur de la marque ;
 *   - `MODLOG` quitte le rose Discord (étranger à la palette) pour le **cyan**,
 *     qui distingue toujours l'acte de modération sans introduire de sixième
 *     teinte ;
 *   - `LOG_NEUTRAL` rejoint le **neutre 400** au lieu d'un gris-vert isolé.
 */
const { BRAND, FUNCTIONAL, NEUTRAL, toInt } = require('../../config/designTokens');

module.exports = {
  /** Couleur de marque (embeds système, en-têtes officiels). */
  BRAND: toInt(BRAND.primary),
  SUCCESS: toInt(FUNCTIONAL.success),
  ERROR: toInt(FUNCTIONAL.error),
  WARNING: toInt(FUNCTIONAL.warning),
  INFO: toInt(FUNCTIONAL.info),
  MODLOG: toInt(BRAND.secondary),
  LOG_CREATE: toInt(FUNCTIONAL.success),
  LOG_DELETE: toInt(FUNCTIONAL.error),
  LOG_UPDATE: toInt(FUNCTIONAL.warning),
  LOG_NEUTRAL: toInt(NEUTRAL[400]),
};
