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
- **Système de logs modulaire** : 10 catégories activables indépendamment
  (sanctions, messages supprimés/modifiés, arrivées/départs, rôles, salons,
  serveur, commandes, erreurs…), salons créés automatiquement, paramètres
  persistants, panneau d'administration interactif (menu + boutons).
- **Notification par MP** : le membre sanctionné est prévenu en message privé
  (silencieusement ignoré si ses MP sont fermés).
- **Cooldowns** anti-spam par commande et par utilisateur.
- **Charte graphique unifiée** : toutes les réponses passent par les
  constructeurs d'embeds centralisés (`utils/embeds/`), avec composants
  interactifs (boutons, menus) lorsque c'est pertinent.
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

Le `.env` ne contient **que des données statiques et globales**. Les
configurations par serveur (salons, rôles, options activables) ne vont
**jamais** dans le `.env` : elles sont persistées par serveur dans
`database/data/` via les commandes du bot — le bot est conçu comme un bot
public multi-serveurs.

| Variable | Obligatoire | Description |
|---|---|---|
| `BOT_TOKEN` | ✅ | Jeton du bot (`DISCORD_TOKEN` reste accepté) |
| `OWNER_ID` | ✅ | Identifiant Discord de l'**owner principal** du bot (tous les privilèges, non supprimable par commande) |
| `CLIENT_ID` | — | Identifiant de l'application (lien d'invitation) |
| `GUILD_ID` | — | Si défini, les commandes slash sont enregistrées sur ce serveur uniquement (instantané, idéal en développement). Sinon, enregistrement global (~1 h de propagation). |
| `PREFIX` | — | Préfixe des commandes textuelles (défaut : `!`) |
| `LOCALE` | — | Langue des messages (défaut : `fr`) |
| `MUTED_ROLE_NAME` | — | Nom du rôle de mute (défaut : `Muted`) |
| `OWNER_ROLE_NAME` | — | Nom du rôle décoratif attribué aux owners (défaut : `Owner NaoBot`) |
| `SUPPORT_CONTACT` | — | Contact affiché aux serveurs bannis pour un recours (ex. : lien du serveur de support) |

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

### ⚙️ Administration

| Commande | Description | Permission requise (auteur) | Exemple |
|---|---|---|---|
| `logs` | Panneau interactif de configuration des logs (menu de catégories + boutons « Tout activer » / « Tout désactiver ») | Gérer le serveur | `!logs` |
| `logs statut` | État des catégories de logs | Gérer le serveur | `!logs statut` |
| `logs activer <catégories…\|tout>` | Active une, plusieurs ou toutes les catégories (crée les salons manquants) | Gérer le serveur | `!logs activer sanctions moderation` |
| `logs desactiver <catégories…\|tout>` | Désactive une, plusieurs ou toutes les catégories | Gérer le serveur | `!logs desactiver tout` |

### 👑 Owner (réservées aux owners du bot)

| Commande | Description | Exemple |
|---|---|---|
| `addowner <utilisateur>` | Ajoute un owner secondaire (persisté dans `database/data/owners.json`) | `!addowner @Utilisateur` |
| `rmowner <utilisateur>` (alias `removeowner`) | Retire un owner secondaire (l'owner principal et le dernier owner sont protégés) | `!rmowner 123456789012345678` |
| `serveurs` (alias `servers`, `guilds`) | Liste paginée (boutons ⏮️ ◀️ ▶️ ⏭️) des serveurs du bot : ID, nom, propriétaire, membres, bots, dates de création et d'arrivée, niveau de vérification, salons, rôles, réputation, icône | `!serveurs` |
| `invite <id_serveur>` | Invitation vers un serveur du bot (voir la commande `invite` de la catégorie Utilitaire : sans argument, elle donne le lien d'invitation du bot à tout le monde) | `!invite 123456789012345678` |
| `rep <id_serveur>` (alias `reputation`) | Réputation détaillée d'un serveur : score, niveau, détail des critères, statistiques, historique | `!rep 123456789012345678` |
| `rep recalc <id_serveur>` | Recalcule la réputation (lève un éventuel score manuel) | `!rep recalc 123456789012345678` |
| `rep set <id_serveur> <score>` | Fixe manuellement le score (0-100) | `!rep set 123456789012345678 25` |
| `rep top` / `rep flop` | Les 10 serveurs les mieux / moins bien notés | `!rep top` |
| `leave <id_serveur>` | Force le départ du bot d'un serveur, avec embed de confirmation (infos + statistiques) et boutons Confirmer/Annuler réservés au demandeur ; historique et statistiques conservés | `!leave 123456789012345678` |
| `serverban <id_serveur> [raison]` | Ajoute un serveur à la **liste noire globale** ; si le bot y est présent, le propriétaire est prévenu en MP et le bot part immédiatement | `!serverban 123456789012345678 Violation des règles` |
| `serverunban <id_serveur>` | Retire un serveur de la liste noire | `!serverunban 123456789012345678` |
| `serverbanlist` (alias `sbl`) | Liste noire complète (ID, raison, date, owner responsable), paginée par boutons | `!serverbanlist` |

### 📣 Bump

| Commande | Description | Permission requise (auteur) | Exemple |
|---|---|---|---|
| `bumpenable <on\|off>` | Active le système (choix du salon de réception via un sélecteur Discord) ou le désactive (statistiques conservées) | Gérer le serveur | `!bumpenable on` |
| `bump` | Publie la publicité du serveur vers tous les serveurs participants (cooldown global de 6 h **par serveur**) | — | `!bump` |
| `bumpcount [utilisateur]` | Bumps d'un utilisateur : total, classement global, classement serveur, dernier bump | — | `!bumpcount @Utilisateur` |
| `bumpunicount` | Bumps du serveur : total, classement inter-serveurs, dernier bump, réputation, membres ayant bumpé | — | `!bumpunicount` |

### 🎫 Tickets

| Commande | Description | Permission requise (auteur) | Exemple |
|---|---|---|---|
| `setticket <salon> <type>` | Publie le panneau de création de tickets d'un type dans un salon (types : `assistance`, `questions`, `report`, `signalement`) | Gérer le serveur | `!setticket #support assistance` |
| `ticket` | Informations du ticket courant (type, créateur, statut, participants) | — | `!ticket` |
| `ticketclose` | Ferme le ticket courant | Créateur ou modérateur | `!ticketclose` |
| `ticketopen` (alias `ticketreopen`) | Réouvre le ticket courant | Créateur ou modérateur | `!ticketopen` |
| `ticketdelete` | Supprime le ticket courant, avec confirmation | Créateur ou modérateur | `!ticketdelete` |

## Système de tickets

Multi-serveurs et persistant (`database/data/tickets.json`) : panneaux,
compteur, tickets ouverts/fermés et archive des tickets supprimés (base
des futurs transcripts) survivent aux redémarrages.

- **Types indépendants** (`utils/constants/ticketTypes.js`) : assistance,
  questions, report, signalement — chacun avec son panneau (embed :
  description, règles, nombre de tickets ouverts + bouton 🎫 **Ouvrir un
  ticket**). Ajouter un type = une entrée dans ce fichier.
- **Création** : au clic, vérification qu'aucun ticket du même type n'est
  déjà ouvert par l'utilisateur, création/réutilisation de la catégorie
  **📁 Tickets**, salon privé `ticket-n001` (compteur incrémental propre
  au serveur, persistant) visible uniquement du créateur, des rôles de
  modération (*Modérer les membres*) et du bot.
- **Message d'accueil** : embed (type, créateur, date, identifiant,
  instructions) + boutons 🔒 Fermer, ✏️ Renommer (modal natif),
  🗑️ Supprimer (avec confirmation), ➕/➖ Ajouter/Retirer un utilisateur
  (sélecteurs d'utilisateurs natifs).
- **Fermeture** : écriture coupée pour le créateur et les participants,
  embed d'accueil mis à jour (fermé par X, date), bouton 🔓 **Réouvrir le
  ticket**. Les commandes `ticketclose`/`ticketopen`/`ticketdelete`
  fonctionnent même sans les boutons.
- **Suppression** : confirmation obligatoire, informations archivées,
  salon supprimé définitivement.
- **Logs** : catégorie dédiée `tickets` (création, fermeture,
  réouverture, suppression, ajout/retrait d'utilisateur, renommage,
  configuration de panneau).

### 👁️ Surveillance (modération)

> ⚠️ **Outil de modération encadré.** À utiliser uniquement dans un cadre de
> modération clairement annoncé aux membres, conformément au RGPD, aux
> règles de Discord et aux lois locales. Un avertissement explicite est
> affiché et doit être confirmé avant toute activation ; la surveillance
> expire automatiquement après **7 jours**. Les administrateurs sont
> responsables de son utilisation.

| Commande | Description | Accès | Exemple |
|---|---|---|---|
| `watch <utilisateur>` | Surveille un membre (messages, éditions, suppressions, activité vocale) dans un salon privé dédié, après avertissement et confirmation | Admin / Modérer les membres / owner | `!watch @Utilisateur` |
| `stopwatch <utilisateur>` | Arrête la surveillance (salon et historique conservés) | Admin / Modérer les membres / owner | `!stopwatch @Utilisateur` |
| `watchtimeuser` | *(owner)* Classement des utilisateurs les plus surveillés, paginé | Owner | `!watchtimeuser` |
| `watchserveurs` | *(owner)* Classement des serveurs utilisant le plus la surveillance, paginé | Owner | `!watchserveurs` |

## Système de surveillance

Outil de modération **strictement encadré** : réservé aux administrateurs,
aux modérateurs (*Modérer les membres*) et aux owners du bot ; multi-serveurs
et persistant (`database/data/watch.json`).

- **Avertissement obligatoire** avant activation (embed rappelant : usage
  de modération, interdiction d'usage abusif, limite automatique de 7 jours,
  responsabilité des administrateurs), à confirmer par bouton.
- **Espace dédié** : catégorie privée **📁 Surveillance** créée/réutilisée,
  un salon `surveillance-<pseudo>` par membre surveillé, **jamais visible du
  membre surveillé** (accessible aux administrateurs, aux rôles autorisés et
  au bot).
- **Événements enregistrés** (en embeds) : messages (contenu, date, salon,
  liens, pièces jointes, images, réponses, mentions), modifications
  (avant/après), suppressions, et activité vocale (connexion, déconnexion,
  changement de salon — avec durée et autres membres présents).
- **Reprise** : relancer une surveillance existante réutilise le salon et
  envoie « Surveillance reprise ».
- **Arrêt manuel** (`stopwatch`) : collecte stoppée, salon et historique
  conservés, message d'interruption.
- **Arrêt automatique** après 7 jours (vérifié en continu, même après un
  redémarrage) : embed « La durée maximale de surveillance a été atteinte.
  Une nouvelle activation manuelle est nécessaire. »
- **Logs** : catégorie dédiée `surveillance` (démarrage, arrêt, reprise,
  expiration, erreurs).
- **Statistiques owner** : `watchtimeuser` et `watchserveurs` (classements
  paginés par boutons). Extensible (export d'historique, tableaux de bord,
  durée paramétrable) : durée dans `WATCH_DURATION_MS`, persistance isolée.

### 🧰 Utilitaire

| Commande | Description | Exemple |
|---|---|---|
| `help [commande]` (alias `aide`) | Aide dynamique paginée : une page par catégorie, navigation par **boutons** (🏠 ◀️ ▶️, désactivés aux extrémités, réservés au demandeur, retirés après 5 min), permissions affichées, total de commandes et version en pied de page — mise à jour automatique à chaque nouvelle commande | `!help ban` |
| `ping` | Latence du bot | `!ping` |
| `botinfo` (alias `stats`) | Serveurs, utilisateurs, commandes, uptime, mémoire, versions | `!botinfo` |
| `uptime` | Durée de fonctionnement du bot | `!uptime` |
| `serverinfo` (alias `si`) | Informations du serveur : membres, salons, rôles, émojis, boosts, vérification, réputation… | `!serverinfo` |
| `userinfo [membre]` (alias `ui`, `whois`) | Informations d'un membre : dates, rôles, rôle le plus haut… | `!userinfo @Utilisateur` |
| `avatar [utilisateur]` (alias `pdp`) | Avatar en grand avec lien vers l'original | `!avatar @Utilisateur` |
| `roleinfo <rôle>` (alias `ri`) | Informations d'un rôle : couleur, position, membres, permissions clés | `!roleinfo @Modérateur` |
| `channelinfo [salon]` (alias `ci`) | Informations d'un salon : type, sujet, mode lent, bitrate… | `!channelinfo #général` |
| `invite [id_serveur]` | Lien d'invitation du bot (bouton, permissions pré-cochées) ; avec un ID de serveur (owners) : invitation vers ce serveur | `!invite` |

### 🎉 Fun

| Commande | Description | Permission | Exemple |
|---|---|---|---|
| `8ball <question>` (alias `boule`) | La boule magique répond | — | `!8ball Vais-je gagner ?` |
| `coinflip` (alias `pileouface`, `pf`) | Pile ou face | — | `!coinflip` |
| `dice [faces] [nombre]` (alias `de`, `roll`) | Lance des dés (2-1000 faces, 1-20 dés) | — | `!dice 20 3` |
| `say <message>` | Le bot répète un message (embed, mentions neutralisées) | Gérer les messages | `!say Bienvenue !` |
| `rps` (alias `pfc`, `chifoumi`) | Pierre-feuille-ciseaux contre le bot, avec boutons | — | `!rps` |

## Système de bump inter-serveurs

Par défaut **désactivé** sur chaque serveur. Seuls les serveurs activés
envoient **et** reçoivent les publicités ; les autres sont ignorés
silencieusement.

- **Activation** : `bumpenable on` active le système puis propose un
  **sélecteur de salons Discord natif** pour choisir le salon de réception
  (permissions du bot vérifiées : voir/écrire/intégrer des liens/créer une
  invitation). `bumpenable off` coupe l'envoi et la réception mais conserve
  toutes les statistiques.
- **Bump** : n'importe quel membre peut lancer `bump`. Le bot crée une
  invitation valide (permanente si possible, sinon 7 jours — les
  expirations sont tracées dans les logs), puis publie dans les salons de
  tous les serveurs participants (jamais deux fois le même salon) un
  message contenant : l'URL d'invitation (l'embed d'invitation **natif**
  de Discord), la publicité en embed (nom, icône, bannière, membres,
  utilisateurs, bots, date de création, réputation, description,
  invitation, total de bumps) et un bouton **Rejoindre**.
- **Cooldown** : 6 h **par serveur** (pas par utilisateur), persistant.
- **Persistance** (`database/data/bumps.json`) : activation, salon,
  compteurs serveur et par utilisateur, dates, historique des bumps.
- **Logs** : catégorie dédiée `bumps` (activation, désactivation,
  changement de salon, bump effectué avec succès/échecs, erreurs,
  invitations avec expiration).
- **Extensible** : la sélection des destinataires (`collectTargets`) et le
  contenu de la publicité (`buildAdvert`) sont isolés dans
  `services/bump/bumpService.js` — points d'entrée prévus pour de futurs
  classements mondiaux, récompenses, badges, boosts de visibilité ou
  filtres par langue/catégorie.

## Système d'owners

Système global du bot, **totalement indépendant des permissions Discord** :

- **Owner principal** : `OWNER_ID` dans le `.env`. Tous les privilèges ;
  impossible à supprimer via une commande.
- **Owners secondaires** : stockés dans `database/data/owners.json`
  (`{ "owners": ["id", …] }`), chargés au démarrage, sauvegardés
  immédiatement à chaque modification via `addowner` / `rmowner`
  (doublons refusés, dernier owner protégé).
- **Middleware owner** : une commande déclarant `ownerOnly: true` est
  automatiquement réservée aux owners — pour les commandes slash, les
  commandes préfixées **et** les composants interactifs (les boutons de
  pagination de `serveurs` revérifient l'owner). Les futures commandes
  owner n'ont que ce champ à déclarer.
- **Rôle décoratif « Owner NaoBot »** : créé sans aucune permission et
  attribué automatiquement aux owners — au démarrage du bot (owners déjà
  présents), quand un owner rejoint un serveur, quand le bot rejoint un
  serveur, et à l'ajout d'un owner. Jamais de doublon : le rôle est
  recherché par nom avant toute création. `rmowner` retire le rôle.
- Les commandes owner sont masquées de la commande `help` pour les
  non-owners, et masquées côté Discord (slash) aux membres non
  administrateurs — le middleware reste la seule autorité.

### Gestion globale des serveurs

Le module `services/serverManagement/` centralise les actions globales :

- **`leave`** : départ manuel d'un serveur après confirmation par boutons
  (embed avec propriétaire, membres, réputation, dates, statistiques).
  L'historique et les statistiques du serveur sont conservés (suivi
  existant), et la date de départ est enregistrée.
- **Liste noire** (`serverban`/`serverunban`/`serverbanlist`) : persistée
  dans `database/data/serverBans.json` (id, nom, raison, owner
  responsable, date, historique des actions). Quand un serveur banni
  invite le bot : **aucune initialisation** (écouteurs et commandes
  ignorent le serveur), le propriétaire reçoit un MP (raison, date,
  contact `SUPPORT_CONTACT` si configuré) et le bot part immédiatement.
- **Journal des actions globales** : chaque action (départ manuel, ajout/
  retrait de liste noire, tentative d'ajout d'un serveur banni + départ
  automatique) génère un embed — action, serveur, owner responsable,
  date, raison — envoyé en MP à tous les owners et, si le bot est encore
  présent sur le serveur concerné, dans la catégorie de logs
  `gestion-serveurs`.

## Suivi des serveurs et réputation

### Notifications aux owners

Quand le bot **rejoint** ou **quitte** un serveur, tous les owners reçoivent
un MP détaillé (embed conforme à la charte) : nom, ID, icône, bannière,
propriétaire, membres/utilisateurs/bots, salons textuels/vocaux/catégories,
rôles, niveau de vérification, dates de création et d'arrivée, totaux
globaux (serveurs et utilisateurs touchés). Le départ ajoute : temps passé
sur le serveur, réputation, dernière activité connue et nombre de commandes
exécutées.

### Historique persistant

`database/data/guildStats.json` conserve pour chaque serveur : premier
ajout, dernier départ, nombre d'arrivées/départs du bot, séjours courts,
commandes exécutées, sanctions, dernière activité, événements récents
(suppressions de salons, bans) et la réputation.

### Réputation

Chaque serveur possède un **score (0-100)**, un **niveau**
(🟢 Excellent ≥ 80, 🟩 Bon ≥ 60, 🟡 Moyen ≥ 40, 🟠 Suspect ≥ 20,
🔴 Dangereux) et un **historique des changements**. Le score part d'une
base de 50 points, ajustée par des critères modulaires
(`services/reputation/reputationService.js`, tableau `CRITERIA`) :
ancienneté, nombre de membres, ratio humains/bots, niveau de vérification,
volume de sanctions, fréquence d'utilisation du bot, suppressions massives
de salons (24 h), bannissements massifs (24 h), départs/retours répétés du
bot, invitations suivies de départs rapides. **Ajouter un critère = une
entrée dans `CRITERIA`**, rien d'autre à modifier.

La réputation est recalculée automatiquement lors des événements
importants (arrivée/départ du bot, sanction, suppression de salon,
bannissement), affichée dans `serveurs` et dans les notifications de
départ, et administrable via `rep` (détail, recalcul, score manuel,
classements). Un score fixé via `rep set` prime jusqu'au prochain
`rep recalc`.

## Système de logs

Le système de logs est organisé en **catégories indépendantes**, persistées
par serveur (`database/data/logSettings.json`) :

| Clé | Contenu | Salon |
|---|---|---|
| `moderation` | Actions de modération générales (purge…) | `#logs-moderation` |
| `sanctions` | Sanctions via le bot (ban, kick, mute, timeout, warn…) | `#logs-sanctions` |
| `messages-supprimes` | Messages supprimés (unitaires et en masse) | `#logs-messages` |
| `messages-modifies` | Messages modifiés (avant / après) | `#logs-messages` |
| `arrivees-departs` | Arrivées et départs de membres | `#logs-arrivees-departs` |
| `roles` | Rôles ajoutés / retirés aux membres | `#logs-roles` |
| `salons` | Salons créés, modifiés, supprimés | `#logs-salons` |
| `serveur` | Événements du serveur (nom, icône, émojis…) | `#logs-serveur` |
| `commandes` | Commandes du bot exécutées | `#logs-commandes` |
| `erreurs` | Erreurs du bot pendant les commandes | `#logs-erreurs` |
| `bumps` | Système de bump (activation, salon, bumps, erreurs, invitations) | `#logs-bumps` |
| `gestion-serveurs` | Actions globales du bot : départs manuels, liste noire, départs automatiques | `#logs-gestion-serveurs` |
| `tickets` | Système de tickets : cycle de vie complet des tickets et panneaux | `#logs-tickets` |
| `surveillance` | Système de surveillance : démarrage, arrêt, reprise, expiration, erreurs | `#logs-surveillance` |

À l'activation d'une catégorie, le bot **crée automatiquement** la catégorie
Discord `📁 Logs` et les salons manquants (privés : invisibles pour
`@everyone`) ; les salons existants sont **réutilisés** — jamais de doublon.
La désactivation conserve les salons.

### Ajouter une catégorie de logs

1. Ajouter une entrée dans `utils/constants/logCategories.js` (label,
   description, nom de salon, émoji).
2. Appeler `logService.log(guild, '<clé>', embed)` depuis l'événement ou le
   service concerné (embed construit avec `logEventEmbed` pour respecter la
   charte graphique).

Rien d'autre à modifier : la commande `logs`, le panneau interactif, la
persistance et la création de salons prennent la nouvelle catégorie en
compte automatiquement.

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

> 📘 Le fichier [`CLAUDE.md`](CLAUDE.md) est la référence permanente des
> règles d'architecture et de développement du projet : à lire avant toute
> modification (humain ou agent IA).

```
/
├── commands/            # Définition des commandes (1 fichier = 1 fonctionnalité,
│   ├── administration/  # les familles proches partagent un fichier : ban+unban…)
│   ├── bump/            #   bumpenable, bump, bumpcount+bumpunicount
│   ├── fun/             #   8ball, coinflip, dice, say, rps
│   ├── moderation/
│   ├── owner/           #   addowner+rmowner, serveurs, rep, leave, serverban…
│   ├── tickets/         #   setticket, ticket, ticketclose+ticketopen+ticketdelete
│   ├── watch/           #   watch+stopwatch, watchtimeuser+watchserveurs
│   └── utility/         #   help, ping, botinfo+uptime, serverinfo, userinfo…
├── events/              # Écouteurs d'événements Discord
│   ├── client/          #   ready (enregistrement des commandes slash)
│   ├── guild/           #   logs des salons et du serveur
│   ├── interaction/     #   interactionCreate (slash + composants interactifs)
│   ├── member/          #   logs des arrivées/départs et des rôles
│   └── message/         #   messageCreate (préfixe) + logs des messages
├── services/            # Logique métier, partagée par slash et préfixe
│   ├── moderation/      #   banService, kickService, muteService, timeoutService…
│   ├── logging/         #   logService (logs par catégories), modLogService
│   ├── owners/          #   ownerService (owners globaux + rôle décoratif)
│   ├── reputation/      #   reputationService (score, niveaux, critères)
│   ├── tracking/        #   guildStatsService, ownerNotifier (arrivées/départs)
│   ├── bump/            #   bumpService (bump inter-serveurs)
│   ├── serverManagement/#   départ manuel, liste noire globale, journal owner
│   ├── tickets/         #   ticketService (panneaux, cycle de vie, logs)
│   └── watch/           #   watchService (surveillance de modération, 7 j max)
├── middlewares/
│   ├── permissions/     # Permissions auteur/bot, hiérarchie des rôles, owners
│   ├── cooldowns/       # Anti-spam par utilisateur et par commande
│   ├── tickets/         # Accès aux tickets (créateur ou modérateur)
│   └── watch/           # Accès à la surveillance (admin / modérateur / owner)
├── utils/
│   ├── constants/       # Couleurs, limites, catégories (commandes et logs)…
│   ├── helpers/         # Contexte unifié, parseur d'arguments, loaders, i18n…
│   └── embeds/          # Constructeurs d'embeds homogènes (charte graphique)
├── config/              # Configuration (env) et permissions par commande
├── database/            # Persistance (JSON) : warns, logs, owners, stats, bumps
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
