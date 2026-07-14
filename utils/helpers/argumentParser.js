/**
 * Résolution des arguments de commande vers un objet de valeurs unique,
 * quel que soit le point d'entrée (slash ou préfixe).
 *
 * Chaque commande déclare un schéma `args` :
 *   { name, type: 'member'|'user'|'string'|'integer'|'duration',
 *     required, rest?, min?, max?, description }
 *
 * - Pour les commandes slash, les options portent le même nom et sont lues
 *   depuis l'interaction.
 * - Pour les commandes préfixées, les tokens du message sont résolus
 *   positionnellement (mentions et identifiants acceptés).
 *
 * Les deux fonctions retournent { values } en cas de succès, { error } sinon.
 */
const config = require('../../config/config');
const { t } = require('./i18n');
const { parseDuration } = require('./durationParser');

/** Extrait un identifiant Discord d'une mention `<@id>` / `<@!id>` ou d'un ID brut. */
function extractId(token) {
  const match = token.match(/^(?:<@!?(\d{17,20})>|(\d{17,20}))$/);
  return match ? (match[1] ?? match[2]) : null;
}

function usageError(command) {
  return { error: t('errors.invalidArgs', { usage: `${config.prefix}${command.usage}` }) };
}

/**
 * Résout les options d'une interaction slash selon le schéma de la commande.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} command
 */
function resolveSlashOptions(interaction, command) {
  const values = {};
  for (const arg of command.args ?? []) {
    switch (arg.type) {
      case 'member': {
        const user = interaction.options.getUser(arg.name);
        if (!user) break;
        const member = interaction.options.getMember(arg.name);
        if (!member) return { error: t('errors.memberNotFound') };
        values[arg.name] = member;
        break;
      }
      case 'user': {
        const user = interaction.options.getUser(arg.name);
        if (user) values[arg.name] = user;
        break;
      }
      case 'duration': {
        const raw = interaction.options.getString(arg.name);
        if (raw === null) break;
        const ms = parseDuration(raw);
        if (ms === null) return { error: t('errors.invalidDuration') };
        values[arg.name] = ms;
        break;
      }
      case 'integer': {
        const value = interaction.options.getInteger(arg.name);
        if (value !== null) values[arg.name] = value;
        break;
      }
      default: {
        const value = interaction.options.getString(arg.name);
        if (value !== null) values[arg.name] = value;
      }
    }
  }
  return { values };
}

/**
 * Résout les tokens d'un message préfixé selon le schéma de la commande.
 * @param {{ guild: import('discord.js').Guild, client: import('discord.js').Client }} context
 * @param {object} command
 * @param {string[]} tokens
 */
async function resolvePrefixArgs({ guild, client }, command, tokens) {
  const values = {};
  const queue = [...tokens];

  for (const arg of command.args ?? []) {
    // Un argument `rest` consomme tout le reste du message (ex. : raison).
    if (arg.rest) {
      const rest = queue.join(' ').trim();
      queue.length = 0;
      if (rest) values[arg.name] = rest;
      else if (arg.required) return usageError(command);
      continue;
    }

    const token = queue.shift();
    if (token === undefined) {
      if (arg.required) return usageError(command);
      continue;
    }

    switch (arg.type) {
      case 'member': {
        const id = extractId(token);
        if (!id) return usageError(command);
        const member = await guild.members.fetch(id).catch(() => null);
        if (!member) return { error: t('errors.memberNotFound') };
        values[arg.name] = member;
        break;
      }
      case 'user': {
        const id = extractId(token);
        if (!id) return usageError(command);
        const user = await client.users.fetch(id).catch(() => null);
        if (!user) return { error: t('errors.userNotFound') };
        values[arg.name] = user;
        break;
      }
      case 'duration': {
        const ms = parseDuration(token);
        if (ms === null) return { error: t('errors.invalidDuration') };
        values[arg.name] = ms;
        break;
      }
      case 'integer': {
        const value = Number.parseInt(token, 10);
        if (Number.isNaN(value)) return usageError(command);
        if ((arg.min !== undefined && value < arg.min) || (arg.max !== undefined && value > arg.max)) {
          return usageError(command);
        }
        values[arg.name] = value;
        break;
      }
      default:
        values[arg.name] = token;
    }
  }
  return { values };
}

module.exports = { resolveSlashOptions, resolvePrefixArgs, extractId };
