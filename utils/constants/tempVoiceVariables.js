/**
 * Variables de personnalisation du nom des salons vocaux temporaires.
 * Source unique et **extensible** : ajouter une variable = ajouter une entrée
 * ici, sans toucher au service ni aux commandes.
 *
 * Contrairement aux salons textuels, les noms de salons vocaux acceptent les
 * espaces, majuscules et emojis : le nettoyage est donc minimal (trim + limite
 * Discord de 100 caractères).
 */

/** Chaque variable expose resolve({ member, user, counter }). */
const NAME_VARIABLES = {
  user: (ctx) => ctx.member?.displayName ?? ctx.user?.username ?? '',
  username: (ctx) => ctx.user?.username ?? '',
  displayname: (ctx) => ctx.member?.displayName ?? ctx.user?.username ?? '',
  counter: (ctx) => String(ctx.counter ?? 1),
};

function applyVariables(template, context) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) => {
    const resolver = NAME_VARIABLES[key.toLowerCase()];
    return resolver ? resolver(context) : match;
  });
}

/** Rend et nettoie un nom de salon vocal (1 à 100 caractères). */
function renderChannelName(format, context) {
  const rendered = applyVariables(format || 'Salon de {user}', context).replace(/\s+/g, ' ').trim().slice(0, 100);
  return rendered || 'Salon temporaire';
}

module.exports = {
  NAME_VARIABLES,
  applyVariables,
  renderChannelName,
  variableNames: () => Object.keys(NAME_VARIABLES),
};
