/**
 * Dossiers membres : notes de modération **globales et inter-serveurs** sur un
 * utilisateur, intégrées au système de réputation (lecture seule : les notes
 * **ne modifient jamais** le score).
 *
 * Responsabilités : ajout/consultation/suppression de notes, agrégation des
 * données du dossier (réputation + statistiques de notes) et **journalisation
 * dans la catégorie de logs « surveillance » (watch)** de chaque événement
 * (création, suppression, consultation) — les données étant sensibles.
 *
 * Le contrôle d'accès vit dans middlewares/memberFiles ; la persistance
 * (globale) dans database/memberFileRepository.
 */
const repository = require('../../database/memberFileRepository');
const globalReputationService = require('../reputation/globalReputationService');
const logService = require('../logs/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

/** Nombre total de sanctions enregistrées (somme des compteurs de réputation). */
function totalSanctions(stats) {
  return Object.values(stats ?? {}).reduce((sum, n) => sum + (n || 0), 0);
}

function getNotes(userId) {
  return repository.getNotes(userId);
}

function fileStats(userId) {
  return repository.stats(userId);
}

function findNote(noteId) {
  return repository.findNote(noteId);
}

/**
 * Données complètes d'un dossier (réputation + notes), pour l'affichage.
 * Les notes n'altèrent pas le score de réputation.
 */
function getDossier(userId) {
  const rep = globalReputationService.getProfile(userId);
  const stats = repository.stats(userId);
  return {
    rep,
    totalWarns: rep.stats?.warns ?? 0,
    totalSanctions: totalSanctions(rep.stats),
    noteCount: stats.noteCount,
    guildsCount: stats.guildsCount,
    notes: repository.getNotes(userId),
  };
}

/** Ajoute une note et la journalise (watch du serveur d'origine). */
async function addNote(guild, targetUser, author, content) {
  const note = repository.addNote(targetUser.id, {
    content,
    authorId: author.id,
    authorTag: author.tag,
    guildId: guild.id,
    guildName: guild.name,
  });
  await logFile(guild, 'created', author, targetUser, [
    { name: t('memberFiles.field.id'), value: `\`${note.id}\``, inline: true },
    { name: t('memberFiles.field.content'), value: content.slice(0, 1024) },
  ]).catch(() => null);
  return note;
}

/** Supprime une note (déjà autorisée) et la journalise. */
async function deleteNote(guild, noteId, byUser) {
  const removed = repository.deleteNote(noteId);
  if (!removed) return null;
  await logFile(guild, 'deleted', byUser, { id: removed.userId }, [
    { name: t('memberFiles.field.id'), value: `\`${removed.note.id}\``, inline: true },
    { name: t('memberFiles.field.author'), value: removed.note.authorTag ? `${removed.note.authorTag}` : `<@${removed.note.authorId}>`, inline: true },
  ]).catch(() => null);
  return removed;
}

/** Journalise une consultation de dossier (donnée sensible). */
function logConsultation(guild, targetUser, byUser) {
  return logFile(guild, 'consulted', byUser, targetUser, []).catch(() => null);
}

function logFile(guild, action, byUser, targetUser, extraFields = []) {
  return logService.log(
    guild,
    'watch',
    logEventEmbed({
      title: `🗂️ ${t(`memberFiles.logs.${action}`)}`,
      color: action === 'deleted' ? COLORS.LOG_DELETE : action === 'created' ? COLORS.LOG_CREATE : COLORS.LOG_NEUTRAL,
      user: byUser,
      fields: [
        { name: t('memberFiles.field.target'), value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: true },
        ...extraFields,
      ],
    }),
  );
}

module.exports = { getNotes, fileStats, findNote, getDossier, addNote, deleteNote, logConsultation, totalSanctions };
