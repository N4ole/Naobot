/**
 * Mini système de traduction.
 * Les textes affichés aux utilisateurs sont centralisés dans locales/<langue>.json ;
 * la langue est choisie via la variable d'environnement LOCALE (défaut : fr).
 */
const fs = require('node:fs');
const path = require('node:path');
const config = require('../../config/config');

const LOCALES_DIR = path.join(__dirname, '..', '..', 'locales');

function loadLocale(locale) {
  const file = path.join(LOCALES_DIR, `${locale}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const messages = loadLocale(config.locale) ?? loadLocale('fr') ?? {};

/**
 * Traduit une clé au format pointé ("moderation.ban.success") et interpole
 * les variables `{nom}`. Retourne la clé telle quelle si elle est absente,
 * pour faciliter le repérage des traductions manquantes.
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
function t(key, vars = {}) {
  const value = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), messages);
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/**
 * Variante de t() pour les clés contenant un tableau de chaînes
 * (ex. : les réponses de la commande 8ball). Retourne [] si absent.
 * @param {string} key
 * @returns {string[]}
 */
function tList(key) {
  const value = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), messages);
  return Array.isArray(value) ? value : [];
}

module.exports = { t, tList };
