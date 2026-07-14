/**
 * Persistance de l'historique et des statistiques par serveur
 * (database/data/guildStats.json). Utilisé par le suivi des serveurs
 * (arrivées/départs du bot) et par le système de réputation.
 *
 * Structure par serveur :
 * {
 *   name,                     // dernier nom connu (utile après un départ)
 *   firstJoinedAt,            // date du premier ajout du bot
 *   lastJoinedAt, lastLeftAt, // dernières arrivée / départ
 *   joinCount, leaveCount,    // nombre d'arrivées / de départs du bot
 *   shortStayCount,           // séjours de moins de 24 h (invite → départ rapide)
 *   commandCount,             // commandes exécutées sur ce serveur
 *   sanctionCount,            // sanctions réalisées via le bot
 *   lastActivityAt,           // dernière activité connue (commande/sanction)
 *   channelDeletions: [ts],   // suppressions de salons récentes (fenêtre 24 h)
 *   banEvents: [ts],          // bannissements récents (fenêtre 24 h)
 *   reputation                // { score, level, manual, history, updatedAt }
 * }
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'guildStats.json'));

function defaultStats() {
  return {
    name: null,
    firstJoinedAt: null,
    lastJoinedAt: null,
    lastLeftAt: null,
    joinCount: 0,
    leaveCount: 0,
    shortStayCount: 0,
    commandCount: 0,
    sanctionCount: 0,
    lastActivityAt: null,
    channelDeletions: [],
    banEvents: [],
    reputation: null,
  };
}

function getStats(guildId) {
  return { ...defaultStats(), ...store.get(guildId, {}) };
}

function saveStats(guildId, stats) {
  store.set(guildId, stats);
}

/** @returns {Record<string, object>} statistiques de tous les serveurs connus */
function getAllStats() {
  return store.all();
}

module.exports = { getStats, saveStats, getAllStats };
