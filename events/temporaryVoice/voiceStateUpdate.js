/**
 * Écouteur d'activité vocale pour les salons temporaires : à chaque
 * changement d'état vocal, délègue au service (création si entrée dans un
 * générateur, suppression si un salon temporaire devient vide).
 */
const { Events } = require('discord.js');
const tempVoiceService = require('../../services/temporaryVoice/tempVoiceService');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    await tempVoiceService.handleVoiceState(oldState, newState).catch(() => null);
  },
};
