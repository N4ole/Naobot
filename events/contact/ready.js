/**
 * Au démarrage : indique le nombre de conversations de contact non fermées.
 * Les conversations sont persistées (database/data/contact.json) et restent
 * accessibles via contactlist/contactinfo/respond après un redémarrage.
 */
const { Events } = require('discord.js');
const contactService = require('../../services/contact/contactService');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute() {
    const open = contactService.getAllConversations().filter((conversation) => conversation.status !== 'closed').length;
    console.log(`[contact] ${open} conversation(s) de contact non fermée(s).`);
  },
};
