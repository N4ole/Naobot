/**
 * Chargeur d'événements : parcourt récursivement events/<famille>/ et
 * enregistre chaque écouteur sur le client. Chaque fichier exporte
 * { name, once?, execute } ou un tableau d'écouteurs de la même famille
 * (ex. : channelCreate + channelUpdate + channelDelete).
 */
const fs = require('node:fs');
const path = require('node:path');

const EVENTS_DIR = path.join(__dirname, '..', '..', 'events');

function loadEvents(client) {
  if (!fs.existsSync(EVENTS_DIR)) return;
  let count = 0;

  for (const family of fs.readdirSync(EVENTS_DIR)) {
    const familyDir = path.join(EVENTS_DIR, family);
    if (!fs.statSync(familyDir).isDirectory()) continue;

    for (const file of fs.readdirSync(familyDir).filter((f) => f.endsWith('.js'))) {
      const exported = require(path.join(familyDir, file));
      const definitions = Array.isArray(exported) ? exported : [exported];

      for (const event of definitions) {
        if (!event?.name || typeof event.execute !== 'function') {
          console.warn(`[events] Fichier ignoré (name/execute manquant) : ${family}/${file}`);
          continue;
        }
        client[event.once ? 'once' : 'on'](event.name, (...args) => event.execute(...args));
        count += 1;
      }
    }
  }

  console.log(`[events] ${count} événement(s) chargé(s).`);
}

module.exports = { loadEvents };
