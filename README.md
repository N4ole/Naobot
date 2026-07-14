# Naobot

Bot Discord multi-tâche : modération, administration et utilitaires.
Construit avec [discord.js](https://discord.js.org) v14, selon une architecture
modulaire stricte pensée pour être maintenue et étendue facilement.

## Fonctionnalités

- **Double système de commandes** : chaque commande existe à la fois en
  commande slash (`/ban`) et en commande préfixée (`!ban`), avec exactement la
  même logique métier (aucune duplication de code).
- **Modération complète** : ban, unban, kick, mute, unmute, timeout,
  untimeout, warn, warnings, purge.
- **Permissions centralisées** : permissions de l'auteur, permissions du bot
  et hiérarchie des rôles vérifiées avant chaque action.
- **Intégration Discord native** : timeouts natifs, bans natifs, suppression
  en masse native, raisons inscrites dans les logs d'audit Discord,
  `default_member_permissions` sur les commandes slash.
- **Logs de modération** : chaque sanction est consignée dans un salon dédié.
- **Notification par MP** : le membre sanctionné est prévenu en message privé
  (silencieusement ignoré si ses MP sont fermés).
- **Cooldowns** anti-spam par commande et par utilisateur.
- **Textes centralisés** dans `locales/fr.json` (traduction facile).

## Installation

### Prérequis

- Node.js ≥ 18
- Une application Discord ([Developer Portal](https://discord.com/developers/applications))
  avec un bot dont les **intents privilégiés** `Server Members` et
  `Message Content` sont activés (onglet *Bot*).

### Étapes

```bash
git clone https://github.com/N4ole/Naobot.git
cd Naobot
npm install
cp .env.example .env   # puis renseigner DISCORD_TOKEN (et les options)
npm start
```

### Variables d'environnement (`.env`)

| Variable | Obligatoire | Description |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Jeton du bot |
| `CLIENT_ID` | — | Identifiant de l'application |
| `GUILD_ID` | — | Si défini, les commandes slash sont enregistrées sur ce serveur uniquement (instantané, idéal en développement). Sinon, enregistrement global (~1 h de propagation). |
| `PREFIX` | — | Préfixe des commandes textuelles (défaut : `!`) |
| `LOCALE` | — | Langue des messages (défaut : `fr`) |
| `MODLOG_CHANNEL_ID` | — | Salon des logs de modération. À défaut, un salon nommé `mod-logs` est utilisé s'il existe. |
| `MUTED_ROLE_NAME` | — | Nom du rôle de mute (défaut : `Muted`) |

### Invitation du bot

Inviter le bot avec le scope `applications.commands` et les permissions :
*Bannir des membres*, *Expulser des membres*, *Modérer les membres*,
*Gérer les rôles*, *Gérer les messages*, *Envoyer des messages*.

## Commandes

Chaque commande est utilisable en slash (`/commande`) **ou** avec le préfixe
(`!commande`). Le résultat est identique.

### 🛡️ Modération

| Commande | Description | Permission requise (auteur) | Exemple |
|---|---|---|---|
| `ban <membre> [raison]` | Bannit un utilisateur (même hors serveur, via son ID) | Bannir des membres | `!ban @Utilisateur Spam répété` |
| `unban <identifiant> [raison]` | Révoque un bannissement | Bannir des membres | `!unban 123456789012345678` |
| `kick <membre> [raison]` | Expulse un membre | Expulser des membres | `!kick @Utilisateur Non-respect du règlement` |
| `mute <membre> [raison]` | Rend un membre muet (rôle, sans limite de durée) | Modérer les membres | `!mute @Utilisateur Insultes` |
| `unmute <membre> [raison]` | Redonne la parole à un membre muet | Modérer les membres | `!unmute @Utilisateur` |
| `timeout <membre> <durée> [raison]` (alias `to`) | Exclusion temporaire native Discord (28 j max). Durées : `30s`, `10m`, `1h30m`, `2d`… | Modérer les membres | `!timeout @Utilisateur 10m Flood` |
| `untimeout <membre> [raison]` (alias `unto`) | Lève une exclusion temporaire | Modérer les membres | `!untimeout @Utilisateur` |
| `warn <membre> <raison>` | Ajoute un avertissement (persisté) | Modérer les membres | `!warn @Utilisateur Langage inapproprié` |
| `warnings <membre>` (alias `warns`) | Liste les avertissements d'un membre | Modérer les membres | `!warnings @Utilisateur` |
| `purge <nombre>` (alias `clear`) | Supprime les 1 à 100 derniers messages du salon (moins de 14 jours, limite Discord) | Gérer les messages | `!purge 20` |

> **mute vs timeout** : `mute` applique un rôle et dure jusqu'à `unmute` ;
> `timeout` utilise l'exclusion temporaire **native** de Discord (plafonnée à
> 28 jours par l'API). Pour une sanction temporaire, préférer `timeout`.

### 🧰 Utilitaire

| Commande | Description | Exemple |
|---|---|---|
| `help [commande]` (alias `aide`) | Liste des commandes, ou détail d'une commande (usage, alias, permissions, exemples) | `!help ban` |
| `ping` | Latence du bot | `!ping` |

## Permissions et sécurité

Avant chaque commande, le middleware central (`middlewares/permissions`) vérifie :

1. **Les permissions Discord de l'auteur** (définies dans `config/permissions.js`,
   également appliquées nativement aux commandes slash via
   `default_member_permissions`) ;
2. **Les permissions du bot** ;
3. **La hiérarchie des rôles** : impossible de sanctionner soi-même, le bot,
   le propriétaire du serveur, ou un membre de rang supérieur ou égal (que ce
   soit vis-à-vis de l'auteur ou du bot).

Chaque refus produit un message d'erreur explicite. Chaque sanction inscrit
le modérateur et la raison dans les **logs d'audit natifs de Discord**.

## Architecture

```
/
├── commands/            # Définition des commandes (1 fichier = 1 fonctionnalité,
│   ├── moderation/      # les familles proches partagent un fichier : ban+unban…)
│   └── utility/
├── events/              # Écouteurs d'événements Discord
│   ├── client/          #   ready (enregistrement des commandes slash)
│   ├── interaction/     #   interactionCreate (entrée des commandes slash)
│   └── message/         #   messageCreate (entrée des commandes préfixées)
├── services/            # Logique métier, partagée par slash et préfixe
│   ├── moderation/      #   banService, kickService, muteService, timeoutService…
│   └── logging/         #   modLogService (salon de logs)
├── middlewares/
│   ├── permissions/     # Permissions auteur/bot + hiérarchie des rôles
│   └── cooldowns/       # Anti-spam par utilisateur et par commande
├── utils/
│   ├── constants/       # Couleurs, limites, catégories, libellés de permissions
│   ├── helpers/         # Contexte unifié, parseur d'arguments, loaders, i18n…
│   └── embeds/          # Constructeurs d'embeds homogènes
├── config/              # Configuration (env) et permissions par commande
├── database/            # Persistance (JSON) : avertissements
├── locales/             # Textes utilisateur (fr.json)
├── tests/               # Tests unitaires (node:test)
└── index.js             # Point d'entrée : client, loaders, login
```

### Comment slash et préfixe partagent la même logique

1. Chaque commande déclare un **schéma d'arguments** (`args`) unique.
2. Ce schéma génère automatiquement la définition slash
   (`utils/helpers/slashBuilder.js`) **et** pilote le parseur des commandes
   préfixées (`utils/helpers/argumentParser.js`).
3. Les deux points d'entrée construisent un **`CommandContext`** identique
   (`utils/helpers/commandContext.js`) puis passent par le **même pipeline**
   (`utils/helpers/commandExecutor.js` : permissions → cooldown → `execute`).
4. La commande n'écrit qu'une seule méthode `execute(ctx)`, qui délègue au
   service métier concerné.

### Ajouter une commande

1. Créer un fichier dans `commands/<catégorie>/` exportant
   `{ name, description, usage, examples, aliases, cooldown, args, execute }`
   (ou un tableau de commandes de la même famille).
2. Si l'action a une vraie logique métier, la placer dans un service
   (`services/…`) pour rester testable et réutilisable.
3. Déclarer les permissions requises dans `config/permissions.js`.
4. Ajouter les textes dans `locales/fr.json`.
5. Documenter la commande dans ce README — la commande `help` se met à jour
   automatiquement.

Aucun fichier existant d'infrastructure n'a besoin d'être modifié : les
loaders découvrent les nouveaux fichiers au démarrage.

## Tests

```bash
npm test
```

Tests unitaires avec le runner natif de Node (`node:test`) : parseur de
durées, stockage JSON, i18n.
