/**
 * Variables de personnalisation des tickets (format des salons et messages
 * d'ouverture). Source unique et **extensible** : ajouter une variable =
 * ajouter une entrée ici, sans toucher aux services ni aux commandes.
 *
 * Chaque variable expose un `resolve(context)` recevant :
 *   { counter, category, member, user, guild, ticketId, date }
 * Toutes les clés ne sont pas pertinentes pour tous les usages ; les
 * variables absentes du contexte sont rendues vides.
 */

/** Variables autorisées dans le format du nom de salon. */
const CHANNEL_VARIABLES = {
  counter: (ctx) => String(ctx.counter ?? 0).padStart(3, '0'),
  category: (ctx) => ctx.category?.name ?? '',
  user: (ctx) => ctx.user?.username ?? '',
  username: (ctx) => ctx.user?.username ?? '',
  userid: (ctx) => ctx.user?.id ?? '',
  date: (ctx) => new Date(ctx.date ?? Date.now()).toISOString().slice(0, 10),
};

/** Variables autorisées dans le message d'ouverture (mentions incluses). */
const MESSAGE_VARIABLES = {
  user: (ctx) => ctx.user?.username ?? '',
  mention: (ctx) => (ctx.user ? `<@${ctx.user.id}>` : ''),
  category: (ctx) => ctx.category?.name ?? '',
  ticketid: (ctx) => ctx.ticketId ?? '',
  date: (ctx) => `<t:${Math.floor((ctx.date ?? Date.now()) / 1000)}:F>`,
};

/** Remplace les `{clé}` d'un modèle selon la table de variables fournie. */
function applyVariables(template, variables, context) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) => {
    const resolver = variables[key.toLowerCase()];
    return resolver ? resolver(context) : match;
  });
}

/** Rend un format de nom de salon puis le nettoie pour Discord. */
function renderChannelName(format, context) {
  const raw = applyVariables(format || 'ticket-{counter}', CHANNEL_VARIABLES, context);
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9à-ÿ_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
  return cleaned || 'ticket';
}

/** Rend un message d'ouverture (mentions résolues). */
function renderMessage(template, context) {
  return applyVariables(template, MESSAGE_VARIABLES, context);
}

module.exports = {
  CHANNEL_VARIABLES,
  MESSAGE_VARIABLES,
  applyVariables,
  renderChannelName,
  renderMessage,
  channelVariableNames: () => Object.keys(CHANNEL_VARIABLES),
  messageVariableNames: () => Object.keys(MESSAGE_VARIABLES),
};
