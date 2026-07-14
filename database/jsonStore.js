/**
 * Stockage clé/valeur persisté en JSON sur disque.
 * Implémentation volontairement simple et sans dépendance : suffisante pour
 * les besoins actuels (avertissements). Le jour où le volume l'exige, seul
 * ce fichier (et les repositories qui l'utilisent) sera à remplacer par une
 * vraie base de données, sans toucher aux commandes ni aux services.
 */
const fs = require('node:fs');
const path = require('node:path');

class JsonStore {
  /** @param {string} filePath - Chemin absolu du fichier JSON. */
  constructor(filePath) {
    this.filePath = filePath;
    this.data = null;
  }

  load() {
    if (this.data !== null) return;
    try {
      this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      this.data = {};
    }
  }

  /**
   * @param {string} key
   * @param {*} [fallback]
   */
  get(key, fallback = undefined) {
    this.load();
    return key in this.data ? this.data[key] : fallback;
  }

  /**
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    this.load();
    this.data[key] = value;
    this.save();
  }

  save() {
    // Écriture atomique : fichier temporaire puis renommage, pour ne jamais
    // corrompre les données en cas d'arrêt brutal.
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempFile = `${this.filePath}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2));
    fs.renameSync(tempFile, this.filePath);
  }
}

module.exports = { JsonStore };
