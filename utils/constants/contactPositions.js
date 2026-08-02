/**
 * Postes reconnus par le système de contact (`contactowner`).
 *
 * Ces postes servent à **deux** choses, d'où leur centralisation ici :
 * - l'**accès** à la commande (seul un membre occupant un poste peut écrire
 *   aux owners du bot) ;
 * - l'**affichage** : les owners voient immédiatement à quel titre le membre
 *   écrit (propriétaire, administrateur ou modérateur).
 *
 * L'ordre du tableau `ORDER` va du poste le plus élevé au plus faible : le
 * **premier** poste correspondant l'emporte (un administrateur est annoncé
 * comme administrateur, pas comme modérateur).
 *
 * `permissions` est une liste **OU** : une seule permission suffit à occuper
 * le poste. C'est volontaire — chaque serveur répartit la modération à sa
 * façon (certains modérateurs ne peuvent que supprimer des messages).
 * `permissions: null` = poste déduit autrement (propriétaire du serveur).
 *
 * Les libellés vivent dans `locales/fr.json` (`contact.position.<clé>`).
 * Ajouter un poste = une entrée ici : accès, embed, logs et interface web le
 * prennent en compte automatiquement.
 */
const { PermissionFlagsBits } = require('discord.js');

const POSITIONS = {
  serverOwner: { key: 'serverOwner', emoji: '👑', permissions: null },
  administrator: { key: 'administrator', emoji: '🛡️', permissions: [PermissionFlagsBits.Administrator] },
  moderator: {
    key: 'moderator',
    emoji: '🔨',
    permissions: [
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageChannels,
    ],
  },
};

/** Postes du plus élevé au plus faible (le premier qui correspond gagne). */
const ORDER = ['serverOwner', 'administrator', 'moderator'];

module.exports = POSITIONS;
Object.defineProperty(module.exports, 'ORDER', { value: ORDER, enumerable: false });
