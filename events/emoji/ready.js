/**
 * Au démarrage : vérifie la disponibilité réelle des émojis officiels de NaoBot
 * et active, le cas échéant, le secours Unicode automatique (config/emojis.js).
 *
 * Les émojis personnalisés sont des émojis d'application du bot (disponibles sur
 * tous les serveurs). Si l'un d'eux a été supprimé, toutes les résolutions
 * basculent automatiquement sur son équivalent Unicode, sans toucher au code
 * des commandes.
 */
const { Events } = require('discord.js');
const emojis = require('../../config/emojis');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    const result = await emojis.syncAvailability(client);
    if (result.missing.length) {
      console.warn(`[emojis] ${result.missing.length} émoji(s) indisponible(s), secours Unicode : ${result.missing.join(', ')}.`);
    } else {
      console.log(`[emojis] ${result.available.length} émoji(s) officiel(s) disponibles.`);
    }
  },
};
