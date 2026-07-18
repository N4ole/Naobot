/**
 * Au démarrage : nettoie les salons vocaux temporaires devenus vides ou
 * disparus pendant que le bot était hors ligne, et purge les enregistrements
 * orphelins. Les générateurs et leurs paramètres sont persistés.
 */
const { Events } = require('discord.js');
const tempVoiceService = require('../../services/temporaryVoice/tempVoiceService');
const tempVoiceRepository = require('../../database/tempVoiceRepository');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await tempVoiceService.cleanupOnStart(client).catch(() => null);
    const generators = client.guilds.cache.reduce((sum, guild) => sum + tempVoiceRepository.listGenerators(guild.id).length, 0);
    console.log(`[tempVoice] ${generators} générateur(s) de salons vocaux temporaires.`);
  },
};
