/**
 * Lanceur du bot : applique les ressources déclarées dans `config/resources.js`
 * puis démarre `index.js`.
 *
 * Pourquoi un lanceur ? La taille maximale du tas V8
 * (`--max-old-space-size`) doit être fixée **avant** l'exécution du moindre
 * JavaScript : elle ne peut pas être changée depuis le bot lui-même. Ce
 * fichier lit la configuration, calcule les drapeaux et relance Node avec eux.
 * Il reste volontairement minimal : aucune logique métier, aucune dépendance.
 *
 * Il est **facultatif** : `node index.js` fonctionne toujours (les drapeaux
 * sont alors ceux de l'hébergeur — PM2, systemd, Docker, `NODE_OPTIONS`…).
 * Quand la configuration vaut `'auto'`, aucun drapeau n'est ajouté et le
 * lanceur ne fait que transmettre l'environnement.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const resources = require('../config/resources');

const flags = resources.nodeFlags();
const entry = path.join(__dirname, '..', 'index.js');

for (const message of resources.warnings()) console.warn(`[ressources] ${message}`);

const child = spawn(process.execPath, [...flags, entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ...resources.environment() },
});

// Les signaux doivent atteindre le bot : c'est lui qui journalise son arrêt
// et ferme proprement ses ressources.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  // Reproduit fidèlement la sortie de l'enfant (superviseurs, CI).
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
child.on('error', (error) => {
  console.error('[ressources] Impossible de démarrer le bot :', error.message);
  process.exit(1);
});
