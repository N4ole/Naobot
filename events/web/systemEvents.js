/**
 * Alimente le **journal système** du bot (section « Logs du bot » de
 * l'interface web) et les **notifications temps réel** liées au cycle de vie.
 *
 * Module volontairement **indépendant** : il n'ajoute aucune ligne aux
 * écouteurs Discord existants, il branche ses propres écouteurs sur le client.
 * Si l'interface web est désactivée, le journal reste simplement en mémoire
 * sans consommateur.
 *
 * Couvre : démarrage, arrêt, reconnexion (shards), mise à jour des commandes,
 * synchronisation, serveurs rejoints/quittés.
 */
const { Events } = require('discord.js');
const botLogService = require('../../services/web/botLogService');
const webNotifier = require('../../services/web/webNotifier');

/** Enregistre l'arrêt du bot (une seule fois, quel que soit le signal). */
function registerShutdownHooks() {
  let done = false;
  const shutdown = (reason) => {
    if (done) return;
    done = true;
    botLogService.recordSystem('shutdown', `Arrêt du bot (${reason}).`);
    webNotifier.publish('system', { event: 'shutdown', message: reason });
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => shutdown(signal));
  process.once('beforeExit', () => shutdown('beforeExit'));
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    botLogService.recordSystem('startup', `Bot connecté en tant que ${client.user.tag}.`, {
      guilds: client.guilds.cache.size,
      commands: client.commands?.size ?? 0,
    });
    // Les commandes slash sont (ré)enregistrées au ready par events/client/ready.
    botLogService.recordSystem('commandsSync', `${client.commands?.size ?? 0} commande(s) synchronisée(s).`);

    client.on(Events.ShardDisconnect, (_event, shardId) => {
      botLogService.recordSystem('reconnect', `Shard ${shardId} déconnecté.`, { shardId });
    });
    client.on(Events.ShardReconnecting, (shardId) => {
      botLogService.recordSystem('reconnect', `Shard ${shardId} en reconnexion…`, { shardId });
    });
    client.on(Events.ShardResume, (shardId) => {
      botLogService.recordSystem('reconnect', `Shard ${shardId} reconnecté.`, { shardId });
    });

    client.on(Events.GuildCreate, (guild) => {
      botLogService.recordSystem('guildJoin', `Serveur rejoint : ${guild.name}.`, { guildId: guild.id });
      webNotifier.publish('guildJoin', { guild: { id: guild.id, name: guild.name }, members: guild.memberCount ?? 0 });
    });
    client.on(Events.GuildDelete, (guild) => {
      botLogService.recordSystem('guildLeave', `Serveur quitté : ${guild.name}.`, { guildId: guild.id });
      webNotifier.publish('guildLeave', { guild: { id: guild.id, name: guild.name } });
    });

    registerShutdownHooks();
  },
};
