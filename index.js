/**
 * Point d'entrée du bot.
 * Crée le client Discord, charge dynamiquement les commandes et les
 * événements, puis se connecte. Toute la logique vit dans les modules
 * dédiés (commands/, events/, services/, middlewares/, utils/).
 */
// Ressources d'exécution : doit rester la TOUTE PREMIÈRE instruction, car
// libuv crée son pool de threads à la première E/S asynchrone — après quoi la
// taille du pool n'est plus modifiable.
require('./config/resources').applyRuntimeLimits();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config/config');
const resources = require('./config/resources');
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
    // Activité vocale (surveillance de modération + logs d'activité vocale).
    GatewayIntentBits.GuildVoiceStates,
    // Invitations créées/supprimées (logs des invitations).
    GatewayIntentBits.GuildInvites,
    // Nécessaire aux commandes préfixées (lecture du contenu des messages).
    // Doit aussi être activé dans le Discord Developer Portal (onglet Bot).
    GatewayIntentBits.MessageContent,
    // Messages privés : permet aux commandes compatibles de fonctionner en DM.
    GatewayIntentBits.DirectMessages,
  ],
  // Partials.Message : messages non mis en cache (logs). Partials.Channel :
  // indispensable pour recevoir les messages privés (salon DM non caché).
  partials: [Partials.Message, Partials.Channel],
});

console.log(resources.summaryLine());

loadCommands(client);
loadEvents(client);

client.login(config.token);
