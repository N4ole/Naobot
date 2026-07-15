/**
 * Chargeur de commandes : parcourt récursivement commands/<catégorie>/ et
 * enregistre chaque commande dans client.commands (et ses alias dans
 * client.commandAliases). Un fichier peut exporter une commande ou un
 * tableau de commandes de la même famille (ex. : ban + unban).
 *
 * Ajouter une commande = déposer un fichier dans le bon dossier ;
 * aucun autre fichier n'a besoin d'être modifié.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');

const COMMANDS_DIR = path.join(__dirname, '..', '..', 'commands');

function loadCommands(client) {
  client.commands = new Collection();
  client.commandAliases = new Collection();

  if (!fs.existsSync(COMMANDS_DIR)) return;

  for (const category of fs.readdirSync(COMMANDS_DIR)) {
    const categoryDir = path.join(COMMANDS_DIR, category);
    if (!fs.statSync(categoryDir).isDirectory()) continue;

    for (const file of fs.readdirSync(categoryDir).filter((f) => f.endsWith('.js'))) {
      const exported = require(path.join(categoryDir, file));
      const definitions = Array.isArray(exported) ? exported : [exported];

      for (const command of definitions) {
        if (!command?.name || typeof command.execute !== 'function') {
          console.warn(`[commands] Fichier ignoré (name/execute manquant) : ${category}/${file}`);
          continue;
        }
        command.category = category;
        client.commands.set(command.name, command);
        for (const alias of command.aliases ?? []) {
          client.commandAliases.set(alias, command.name);
        }
      }
    }
  }

  console.log(`[commands] ${client.commands.size} commande(s) chargée(s).`);
}

module.exports = { loadCommands };
