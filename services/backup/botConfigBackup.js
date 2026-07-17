/**
 * Capture et restauration de la configuration propre au serveur (systèmes
 * du bot) pour les sauvegardes.
 *
 * Les fichiers de données du bot sont indexés par guildId : on capture donc
 * la « tranche » du serveur dans chacun d'eux, et on la réécrit à la
 * restauration. Approche générique et découplée : ajouter un système au
 * périmètre = ajouter son fichier à GUILD_KEYED_FILES (ou au traitement
 * imbriqué pour les fichiers structurés autrement, comme bumps.json).
 */
const path = require('node:path');
const { JsonStore } = require('../../database/jsonStore');

const DATA_DIR = path.join(__dirname, '..', '..', 'database', 'data');

/** Fichiers dont les entrées sont directement indexées par guildId. */
const GUILD_KEYED_FILES = [
  'logSettings.json', // système de logs
  'protections.json', // protections automatiques
  'welcome.json', // bienvenue
  'warnConfig.json', // échelle des sanctions
  'reactionRoles.json', // panneaux de rôles réactions
  'tickets.json', // tickets
  'guildStats.json', // réputation + statistiques
  'emergency.json', // mode urgence
];

function storeFor(fileName) {
  return new JsonStore(path.join(DATA_DIR, fileName));
}

/** Capture la configuration du serveur (tranche de chaque fichier). */
function capture(guildId) {
  const config = {};
  for (const file of GUILD_KEYED_FILES) {
    const value = storeFor(file).get(guildId, null);
    if (value !== null) config[file] = value;
  }
  // bumps.json : structure { guilds: { [guildId]: … }, users: … }
  const bumpGuilds = storeFor('bumps.json').get('guilds', {});
  if (bumpGuilds[guildId]) config['bumps.json'] = bumpGuilds[guildId];
  return config;
}

/**
 * Restaure la configuration du serveur à partir d'une capture.
 * @returns {number} nombre de systèmes restaurés
 */
function restore(guildId, config) {
  let restored = 0;
  for (const file of GUILD_KEYED_FILES) {
    if (!(file in config)) continue;
    storeFor(file).set(guildId, config[file]);
    restored += 1;
  }
  if ('bumps.json' in config) {
    const store = storeFor('bumps.json');
    const guilds = store.get('guilds', {});
    guilds[guildId] = config['bumps.json'];
    store.set('guilds', guilds);
    restored += 1;
  }
  return restored;
}

module.exports = { GUILD_KEYED_FILES, capture, restore };
