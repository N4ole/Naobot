# CLAUDE.md — Guide de référence du projet NaoBot

Ce fichier est la **référence principale** pour tout agent IA (et tout
développeur) intervenant sur ce projet. Le respecter avant, pendant et
après chaque modification.

# Projet

**Description** : bot Discord public multi-serveurs nommé **NaoBot**
(Node.js ≥ 18, discord.js v14, CommonJS).

**Objectif** : créer un bot Discord complet, modulaire, sécurisé et
évolutif pouvant être utilisé par un grand nombre de serveurs.

# Architecture

Toujours respecter :

- architecture **modulaire** ;
- **séparation stricte des responsabilités** (commande = déclaration +
  délégation ; service = logique métier ; middleware = vérification
  transverse ; repository = persistance) ;
- **un fichier = une fonctionnalité** lorsque pertinent ;
- regroupement **uniquement** des fonctionnalités de même famille dans un
  même fichier (ex. : `ban`+`unban`, `mute`+`unmute`, `warn`+`warnings`).

Ne **jamais** placer de logique métier dans le fichier de démarrage
(`index.js`) : il charge la configuration, initialise le client, charge
les modules (loaders) et se connecte — rien d'autre.

# Structure

Respecter l'organisation :

```
commands/      # définitions de commandes, par catégorie (moderation/, utility/, fun/, bump/, tickets/, reactionRoles/, contact/, protections/, emergency/, welcome/, backup/, forms/, reminders/, polls/, watch/, owner/, administration/)
events/        # écouteurs Discord, par famille (client/, guild/, member/, message/, interaction/, watch/, reactionRoles/, contact/, protections/, emergency/, welcome/, backup/, forms/, reminders/, polls/, tickets/)
services/      # logique métier (moderation/, logging/, owners/, reputation/, tracking/, bump/, serverManagement/, tickets/, ticketCategories/, ticketPanels/, watch/, warnings/, reactionRoles/, contact/, protections/, antispam/, antilink/, antibot/, emergency/, welcome/, backup/, forms/, reminders/, polls/)
middlewares/   # permissions/ (Discord + hiérarchie + owners), cooldowns/, moderation/, tickets/, watch/, reactionRoles/, contact/, protections/, emergency/, backup/, forms/, reminders/, polls/
utils/         # constants/, helpers/ (loaders, parseur d'arguments, i18n…), embeds/
config/        # config.js (env), permissions.js (permissions par commande)
database/      # jsonStore.js + repositories ; données dans database/data/*.json (gitignoré)
locales/       # textes utilisateur (fr.json) — tout texte visible passe par t()/tList()
tests/         # tests unitaires node:test (npm test)
```

# Fonctionnement clé : commandes unifiées slash + préfixe

Chaque commande est un objet
`{ name, description, usage, examples, aliases, cooldown, args, execute(ctx), handleComponent?(interaction), ownerOnly? }`.

- Le **schéma `args`** (types : `member`, `user`, `role`, `channel`,
  `string`, `integer`, `duration` ; options : `required`, `rest`, `min`,
  `max`, `choices`) génère automatiquement la définition slash
  (`utils/helpers/slashBuilder.js`) **et** pilote le parseur des commandes
  préfixées (`utils/helpers/argumentParser.js`). Une seule source de vérité.
- Les deux points d'entrée construisent le même `CommandContext`
  (`utils/helpers/commandContext.js` : `ctx.reply`, `ctx.defer`,
  `ctx.options`, `ctx.isSlash`…) puis passent par le pipeline commun
  (`utils/helpers/commandExecutor.js` : owner → permissions → cooldown →
  execute → logs).
- **Composants interactifs** : le préfixe du `customId` (avant `:`)
  désigne la commande propriétaire ; `interactionCreate` route vers son
  `handleComponent(interaction)`. Aucun registre central.
- Les loaders découvrent commandes et événements au démarrage : **ajouter
  une commande = déposer un fichier**, aucun fichier d'infrastructure à
  modifier. Un fichier peut exporter un objet ou un tableau (famille).

# Code

Toujours :

- écrire du code propre ;
- éviter la duplication ;
- créer des fonctions réutilisables (dans `utils/` ou `services/`) ;
- utiliser des noms explicites ;
- documenter les parties complexes ;
- prévoir l'évolution future.

Ne jamais :

- coder une fonctionnalité rapidement sans respecter l'architecture ;
- stocker des données dynamiques dans le `.env`.

Vérifications avant de committer : `npm test` (tests `node:test`) et un
smoke test de chargement (les loaders + `buildSlashCommand` sur toutes les
commandes).

# Configuration

Le `.env` doit **uniquement** contenir :

- le token Discord (`BOT_TOKEN`) ;
- l'owner principal (`OWNER_ID`) ;
- des données statiques globales (`CLIENT_ID`, `GUILD_ID`, `PREFIX`,
  `LOCALE`, `MUTED_ROLE_NAME`, `OWNER_ROLE_NAME`).

Toutes les données serveur (salons, rôles, options activables,
statistiques, paramètres utilisateurs) sont stockées **séparément**, par
serveur, via les repositories (`database/*.js` → `database/data/*.json`,
écriture atomique via `JsonStore`).

# Discord

Toujours :

- supporter **les commandes slash et les commandes préfixées** (`!`) avec
  la même logique interne (voir le schéma `args` ci-dessus) ;
- utiliser les fonctionnalités **natives** de Discord (timeout natif,
  bans, bulkDelete, raisons d'audit log, `default_member_permissions`,
  sélecteurs de salons/rôles natifs…) plutôt que réinventer ;
- utiliser les **embeds** (constructeurs de `utils/embeds/embeds.js` —
  charte graphique unique : `successEmbed`, `errorEmbed`, `infoEmbed`,
  `modLogEmbed`, `logEventEmbed`, couleurs de `utils/constants/colors.js`) ;
- utiliser les **boutons et composants** quand pertinent.

# Permissions

Avant toute commande sensible :

- vérifier les permissions **utilisateur** ;
- vérifier les permissions du **bot** ;
- vérifier la **hiérarchie** Discord (soi-même / bot / propriétaire /
  rang supérieur ou égal) ;
- utiliser les **middlewares existants**
  (`middlewares/permissions/checkPermissions.js` — déclaratif via
  `config/permissions.js` ; `checkTargetHierarchy` pour les cibles).

Les permissions par commande se déclarent dans `config/permissions.js`
(`user` + `bot`) : le pipeline et les slash (`default_member_permissions`)
les appliquent automatiquement.

# Owners

Respecter le système d'owners (global, **indépendant des permissions
Discord**) :

- owner principal défini dans `.env` (`OWNER_ID`), non supprimable ;
- owners secondaires stockés séparément (`database/data/owners.json`),
  gérés par `addowner`/`rmowner` ;
- commandes owner protégées : déclarer `ownerOnly: true` (le middleware
  `middlewares/permissions/ownerCheck.js` fait le reste, y compris pour
  les composants via `checkOwner(interaction.user.id)`) ;
- rôle décoratif « Owner NaoBot » attribué automatiquement
  (`services/owners/ownerService.js`).

# Logs

Toutes les fonctionnalités importantes doivent intégrer le système de logs
(`services/logging/logService.js`).

Les logs doivent rester :

- configurables (commande `logs`, panneau interactif) ;
- activables/désactivables (par catégorie et en masse, persistant) ;
- séparés par catégories (`utils/constants/logCategories.js`).

Ajouter une catégorie = une entrée dans `logCategories.js` + des appels
`logService.log(guild, '<clé>', logEventEmbed({...}))`. Le panneau, la
persistance et la création automatique des salons suivent tout seuls.

# Multi-serveurs

Toujours considérer que le bot est **public** (potentiellement des
milliers de serveurs).

Chaque serveur doit avoir :

- sa propre configuration ;
- ses propres données ;
- ses propres statistiques.

Ne **jamais** mélanger les données entre serveurs (toutes les structures
persistées sont indexées par `guildId`). Attention aux opérations
coûteuses (fetch de tous les membres) : préférer le cache, les fetchs
bornés dans le temps, et le travail à la demande (ex. : pagination).

**Liste noire globale** : un serveur présent dans
`database/data/serverBans.json` ne doit recevoir **aucune** fonctionnalité.
Le pipeline de commandes et les écouteurs `GuildCreate`/`GuildDelete`
vérifient `serverBanRepository.isBanned(guildId)` — tout nouvel écouteur
d'initialisation par serveur doit faire de même.

# Documentation

Après chaque fonctionnalité :

- mettre à jour `README.md` ;
- mettre à jour la commande `help` (elle est **dynamique** : vérifier que
  `description`, `usage`, `examples` et `config/permissions.js` sont
  renseignés — c'est ce qu'elle affiche) ;
- documenter les nouvelles commandes ;
- documenter les permissions nécessaires.

Tout texte visible par l'utilisateur passe par `locales/fr.json`
(`t()`/`tList()` de `utils/helpers/i18n.js`), jamais en dur.

# Avant de coder

Toujours :

- analyser l'architecture existante ;
- réutiliser les systèmes déjà présents (pipeline de commandes, logs,
  owners, réputation, embeds, i18n, repositories) ;
- éviter de créer une nouvelle logique parallèle ;
- proposer une amélioration si l'architecture actuelle empêche une
  évolution propre, plutôt que de la contourner.
