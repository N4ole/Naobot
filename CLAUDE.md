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
commands/      # définitions de commandes, par catégorie (moderation/, utility/, fun/, logs/, bump/, tickets/, reactionRoles/, contact/, protections/, antipub/, antisensitive/, snipe/, dm/, emergency/, welcome/, backup/, forms/, reminders/, polls/, temporaryVoice/, captcha/, levels/ [rank+level+leaderboard+levelconfig], reputation/, memberFiles/ [dossiers globaux : file+fileinfo+filelist+filedelete], watch/, owner/, administration/)
events/        # écouteurs Discord, par famille (client/, guild/, member/, message/, messageActivity/ [XP messages], voiceActivity/ [XP vocal], dm/ [commandes préfixées en DM], interaction/, logs/, errors/, audit/ [parité slash/préfixe au démarrage], emoji/ [disponibilité des émojis officiels + secours Unicode], snipe/, memberFiles/, watch/, reactionRoles/, contact/, protections/, antipub/, antisensitive/, emergency/, welcome/, backup/, forms/, reminders/, polls/, tickets/, web/, temporaryVoice/, captcha/, reputation/)
services/      # logique métier (moderation/, logs/ [logService + modLogService + migration, 7 catégories], errors/ [logs d'erreurs internes → #bot-errors], audit/ [commandParityService : audit de parité slash/préfixe], snipe/ [événements récents supprimés/modifiés, purge auto], prefix/ [préfixe personnalisable par serveur], directMessages/ [compatibilité DM + sélection de serveur], levels/ [niveaux par activité : XP messages + vocal, courbe configurable, récompenses], memberFiles/ [dossiers membres globaux inter-serveurs, intégrés à la réputation], owners/, reputation/ [serveurs + globale], tracking/, bump/, serverManagement/, tickets/, ticketCategories/, ticketPanels/, watch/, warnings/ [warnService + sanctionService, sans rôles], reactionRoles/, contact/, protections/, antispam/, antilink/, antibot/, antipub/ [invitations Discord, indépendant], antisensitive/ [sites sensibles adultes/violents, indépendant], emergency/, welcome/, backup/, forms/, reminders/, polls/, web/, temporaryVoice/, captcha/)
middlewares/   # permissions/ (Discord + hiérarchie + owners), cooldowns/, moderation/, logs/, tickets/, watch/, snipe/, dm/, levels/, memberFiles/, reactionRoles/, contact/, protections/, antipub/, antisensitive/, emergency/, backup/, forms/, reminders/, polls/, temporaryVoice/, captcha/, reputation/
web/           # interface web séparée de Discord (frontend/, backend/, api/, websocket/)
utils/         # constants/, helpers/ (loaders, parseur d'arguments, i18n…), embeds/
config/        # config.js (env), permissions.js (permissions par commande), emojis.js (émojis officiels + secours Unicode)
database/      # jsonStore.js + repositories ; données dans database/data/*.json (gitignoré)
locales/       # textes utilisateur (fr.json) — tout texte visible passe par t()/tList()
scripts/       # utilitaires hors ligne (checkCommandParity.js → npm run audit)
.githooks/     # hooks Git versionnés (pre-commit : parité slash/préfixe)
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

## Parité slash / préfixe (garantie structurelle)

Comme une commande est un **objet unique** (schéma `args` → slash + préfixe,
même `execute`), la parité slash ⇄ préfixe est **structurelle** : ne **jamais**
créer deux fichiers séparés (`commands/slash/x.js` + `commands/prefix/x.js`) —
ce serait de la duplication interdite. Une commande correctement déclarée
existe automatiquement dans les deux modes, la logique métier restant dans
`services/`.

Deux pièges cassent réellement la parité ; l'audit les détecte :

- **définition slash invalide** (nom non minuscule / avec espace, description
  absente ou > 100 caractères, argument **requis après un optionnel**, > 25
  arguments…) → la commande marche en préfixe mais Discord rejette la slash ;
- **comportement dépendant de l'interaction dans `execute`** — surtout
  `interaction.showModal(...)` : un modal ne s'ouvre que depuis une interaction.
  Les modals sont donc **uniquement** déclenchés depuis `handleComponent`
  (réponse à un bouton/menu, toujours une interaction), **jamais** depuis
  `execute` (qui doit fonctionner aussi en préfixe, où `ctx.interaction` est nul).

**Audit automatisé** (`services/audit/commandParityService.js`) : `runAudit()`
parcourt toutes les commandes et signale les incohérences (nom, description,
arguments, ordre, `rest`, alias en collision, permissions, modal dans
`execute`…). Points d'usage :

- commande owner **`commandaudit`** (`/commandaudit` = `!commandaudit`) :
  statistiques, problèmes restants, date du dernier audit ;
- **avertissements au démarrage** (`events/audit/ready.js`) : détecte toute
  nouvelle commande et journalise les anomalies ;
- **hook pre-commit** (`.githooks/pre-commit` → `npm run audit`) : **bloque le
  commit** en cas d'incohérence critique. Activation : `git config core.hooksPath
  .githooks`. Le test `tests/commandParity.test.js` fait le même garde-fou en CI.

Considérer l'absence d'un équivalent slash ou préfixe comme une **erreur de
conception** : la corriger (déclaration `args`, `handleComponent` pour les
modals) plutôt que dupliquer la commande.

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

Vérifications avant de committer : `npm test` (tests `node:test`), `npm run
audit` (parité slash/préfixe — bloquant en cas d'incohérence critique, aussi
posé en hook `.githooks/pre-commit`) et un smoke test de chargement (les
loaders + `buildSlashCommand` sur toutes les commandes).

# Configuration

Le `.env` doit **uniquement** contenir :

- le token Discord (`BOT_TOKEN`) ;
- l'owner principal (`OWNER_ID`) ;
- le serveur des logs d'erreurs internes (`ERROR_GUILD_ID`) ;
- des données statiques globales (`CLIENT_ID`, `GUILD_ID`, `PREFIX`,
  `LOCALE`, `MUTED_ROLE_NAME`, `OWNER_ROLE_NAME`) ;
- la configuration **statique** de l'interface web et de l'authentification
  OAuth2 (`WEB_ENABLED`, `WEB_PORT`, `WEB_URL`, `DISCORD_CLIENT_ID`,
  `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `WEB_SESSION_SECRET`) —
  jamais de configuration dynamique de serveur.

L'interface web est **strictement réservée aux owners du bot** (owner principal
du `.env` + owners secondaires en base) : le callback OAuth2 refuse toute autre
connexion et **toutes** les routes backend (API, SSE, frontend) vérifient
`ownerService.isOwner(session.userId)` (`services/web/webAuth.isBotOwner`).

Toutes les données serveur (salons, rôles, options activables,
statistiques, paramètres utilisateurs) sont stockées **séparément**, par
serveur, via les repositories (`database/*.js` → `database/data/*.json`,
écriture atomique via `JsonStore`).

# Discord

Toujours :

- supporter **les commandes slash et les commandes préfixées** avec
  la même logique interne (voir le schéma `args` ci-dessus). Le préfixe est
  **personnalisable par serveur** (`services/prefix/prefixService`,
  `setprefix`/`prefix`) : le défaut vit dans `.env` (`PREFIX`), jamais en base ;
  le point d'entrée des messages lit `prefixService.getPrefix(guildId)` ;
- prendre en charge les **messages privés (DM)** : une commande personnelle
  (sans serveur) déclare `dm: 'direct'` et s'exécute en DM (`ctx.guild` est
  `null` ; le pipeline ignore alors permissions Discord, statistiques et logs de
  serveur). Les commandes nécessitant un serveur proposent en DM une **sélection
  de serveur** (menu déroulant des serveurs partagés) via
  `services/directMessages`. Points d'entrée : `events/dm/directMessage.js`
  (préfixe) et la branche DM de `events/interaction/interactionCreate.js` (slash) ;
- utiliser les fonctionnalités **natives** de Discord (timeout natif,
  bans, bulkDelete, raisons d'audit log, `default_member_permissions`,
  sélecteurs de salons/rôles natifs…) plutôt que réinventer ;
- utiliser les **embeds** (constructeurs de `utils/embeds/embeds.js` —
  charte graphique unique : `successEmbed`, `errorEmbed`, `infoEmbed`,
  `modLogEmbed`, `logEventEmbed`, couleurs de `utils/constants/colors.js`) ;
- utiliser les **boutons et composants** quand pertinent ;
- utiliser les **émojis officiels** via `config/emojis.js` (jamais d'identifiant
  d'émoji en dur) — voir ci-dessous.

## Émojis officiels

Tous les émojis de marque de NaoBot sont centralisés dans **`config/emojis.js`**
(source unique). **Aucun identifiant d'émoji (`<:nom:id>`) ne doit être écrit
ailleurs** : tout module qui affiche un émoji importe ce fichier. Ajouter un
émoji = une entrée dans `DEFS` (aucune commande existante à modifier).

- `emojis.thumb` / `emojis.get('thumb')` → **chaîne** pour un texte ou une
  description d'embed ; `emojis.component('thumb')` → valeur pour `setEmoji`
  (boutons/menus) ; `emojis.fallback('thumb')` → secours Unicode seul.
- **Secours automatique** : chaque émoji déclare un `fallback` Unicode. Au
  démarrage, `events/emoji/ready.js` appelle `syncAvailability(client)` qui
  vérifie les émojis réellement disponibles (émojis d'application + cache) ;
  un émoji supprimé bascule **automatiquement** sur son secours, sans toucher
  au code.
- **Usages câblés** : `successEmbed`/`errorEmbed` (défaut `thumb`/`glitch`,
  override par `{ emoji }`) → propagation à **tous** les succès/erreurs ; help
  (icône `basic` + `CATEGORY_EMOJIS` par catégorie) ; captcha (`party` / `crying`
  / `angry`) ; réputation (`love`/`doubt`/`angry` via `emojiKey`) ; niveaux
  (`party` / `love`) ; sanctions (`replyResult(..., { successEmoji })`) ; logs de
  commandes (`thumb`/`glitch`).

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
(`services/logs/logService.js`).

Le système est limité à **sept catégories fixes** (`utils/constants/logCategories.js`) :
`moderation`, `sanctions`, `members`, `roles`, `tickets`, `watch`,
`protections`. **Aucune nouvelle catégorie ne peut être créée sans modifier le
code.** Les anciennes clés sont fusionnées vers ces sept catégories (ou
supprimées) par la table `LEGACY_ALIASES` de `logService` : appeler
`logService.log(guild, '<clé ou ancienne clé>', logEventEmbed({...}))` route
automatiquement vers la bonne catégorie (ou ignore l'événement).

Les logs doivent rester :

- configurables (commande `logs` : panneau, `setup`, `status`, `enable`,
  `disable`) ;
- activables/désactivables (par catégorie et en masse, persistant, avec date
  et auteur de la dernière modification) ;
- migrés automatiquement au démarrage depuis l'ancien système
  (`services/logs/logMigration.js`).

Ajouter une catégorie (rare, volontairement fermé) = une entrée dans
`logCategories.js` + le routage des appels concernés ; le panneau, la
persistance et la création automatique des salons suivent.

**Logs d'erreurs internes du bot** (distinct des logs de serveur) :
`services/errors/errorLogService.js` journalise les erreurs techniques du bot
(erreurs de commandes, `unhandledRejection`, `uncaughtException`, erreurs API
Discord, WebSocket, base de données, synchronisation) dans le salon privé
`#bot-errors` d'un **unique** serveur défini par `ERROR_GUILD_ID`. La catégorie
et le salon sont créés automatiquement au démarrage (`events/errors/ready.js`).
Aucun autre serveur n'y a accès ; la journalisation échoue silencieusement.
Pour signaler une erreur ailleurs dans le code :
`errorLogService.report({ type, error, guild, channel, user, command, module })`.

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
