/**
 * Point d'entrée du bot.
 * Crée le client Discord, charge dynamiquement les commandes et les
 * événements, puis se connecte. Toute la logique vit dans les modules
 * dédiés (commands/, events/, services/, middlewares/, utils/).
 */
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config/config');
const { loadCommands } = require('./utils/helpers/commandLoader');
const { loadEvents } = require('./utils/helpers/eventLoader');

if (!config.token) {
  console.error(
    'BOT_TOKEN manquant. Copiez .env.example vers .env et renseignez le jeton du bot.',
  );
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    // Événements liés aux émojis (catégorie de logs « serveur »).
    GatewayIntentBits.GuildExpressions,
    // Nécessaire aux commandes préfixées (lecture du contenu des messages).
    // Doit aussi être activé dans le Discord Developer Portal (onglet Bot).
    GatewayIntentBits.MessageContent,
  ],
  // Permet de recevoir les suppressions/modifications de messages qui ne
  // sont pas en cache (le contenu reste alors indisponible dans les logs).
  partials: [Partials.Message],
});

loadCommands(client);
loadEvents(client);

process.on('unhandledRejection', (error) => {
  console.error('[process] Promesse rejetée non gérée :', error);
});

client.login(config.token);
