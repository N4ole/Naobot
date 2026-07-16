/**
 * Écouteurs alimentant le système de surveillance (même famille, même
 * fichier) : messages, modifications, suppressions et activité vocale des
 * utilisateurs sous surveillance active. Toute la logique (filtrage,
 * expiration, embeds) vit dans services/watch/watchService.
 */
const { Events } = require('discord.js');
const watchService = require('../../services/watch/watchService');

const messageWatch = {
  name: Events.MessageCreate,
  async execute(message) {
    await watchService.recordMessage(message).catch(() => null);
  },
};

const editWatch = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    await watchService.recordEdit(oldMessage, newMessage).catch(() => null);
  },
};

const deleteWatch = {
  name: Events.MessageDelete,
  async execute(message) {
    await watchService.recordDelete(message).catch(() => null);
  },
};

const voiceWatch = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    await watchService.recordVoice(oldState, newState).catch(() => null);
  },
};

module.exports = [messageWatch, editWatch, deleteWatch, voiceWatch];
