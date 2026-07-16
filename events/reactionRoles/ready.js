/**
 * Au démarrage : confirme que les panneaux de rôles réactions persistés sont
 * opérationnels. Aucun ré-enregistrement n'est nécessaire : les boutons et
 * menus sont routés par le préfixe de leur customId (« reactionrole:… »),
 * donc ils continuent de fonctionner tels quels après un redémarrage.
 */
const { Events } = require('discord.js');
const reactionRoleService = require('../../services/reactionRoles/reactionRoleService');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute() {
    const count = reactionRoleService.getAllPanels().length;
    console.log(`[reactionRoles] ${count} panneau(x) de rôles réactions actif(s).`);
  },
};
