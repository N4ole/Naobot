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
| `warn <membre> <raison>` | Avertit un membre et applique **automatiquement** la sanction progressive du palier atteint | Modérer les membres | `!warn @Utilisateur Langage inapproprié` |
| `unwarn <utilisateur> <identifiant>` | Supprime un avertissement précis (recalcule le total) | Modérer les membres | `!unwarn @Utilisateur a1b2c3` |
| `warnings <utilisateur>` (alias `warns`) | Liste paginée des avertissements (raisons, modérateurs, dates, sanctions appliquées) | Modérer les membres | `!warnings @Utilisateur` |
| `warncount <utilisateur>` | Aperçu rapide : total actif, prochaine sanction, date du dernier warn | Modérer les membres | `!warncount @Utilisateur` |
| `clearwarns <utilisateur>` | Supprime tous les avertissements d'un membre (confirmation par boutons) | Modérer les membres | `!clearwarns @Utilisateur` |
| `purge <nombre>` (alias `clear`) | Supprime les 1 à 100 derniers messages du salon (moins de 14 jours, limite Discord) | Gérer les messages | `!purge 20` |

> **mute vs timeout** : `mute` applique un rôle et dure jusqu'à `unmute` ;
> `timeout` utilise l'exclusion temporaire **native** de Discord (plafonnée à
> 28 jours par l'API). Pour une sanction temporaire, préférer `timeout`.

#### Sanctions progressives (warns)

Chaque avertissement déclenche **automatiquement** la sanction du palier
atteint, selon une échelle **configurable par serveur** (persistante). Le
palier 1 est toujours un simple avertissement.

| Warns | Sanction par défaut |
|---|---|
| 1 | Avertissement |
| 2 | Timeout 1 heure |
| 3 | Timeout 1 jour |
| 4 | Mute (rôle) |
| 5 | Kick |
| 6 | Ban |

- L'échelle se configure via `setwarnsanction` (panneau interactif : menu
  des paliers, menu des types de sanction, modal de durée pour les
  timeouts, désactivation d'un palier, `reset`). Ajouter un palier ou un
  type de sanction est trivial (`utils/constants/warnSanctions.js`).
- Au-delà du dernier palier, le dernier palier s'applique (plafond).
- À chaque warn, le membre reçoit un **MP** (raison, modérateur, sanction
  appliquée, total, prochaine sanction) — échec silencieux si MP fermés.
- `unwarn` / `clearwarns` recalculent le total ; toutes les actions (ajout,
  suppression, remise à zéro, sanction automatique, modification des
  règles) sont journalisées dans la catégorie de logs `warns`.
- La persistance (`database/data/warns.json`, `warnConfig.json`) porte tout
  le nécessaire aux futures statistiques (modérateurs les plus actifs,
  utilisateurs les plus sanctionnés, sanctions les plus fréquentes).

### ⚙️ Administration

| Commande | Description | Permission requise (auteur) | Exemple |
|---|---|---|---|
| `logs` | Panneau interactif de configuration des logs (menu de catégories + boutons « Tout activer » / « Tout désactiver ») | Gérer le serveur | `!logs` |
| `logs statut` | État des catégories de logs | Gérer le serveur | `!logs statut` |
| `logs activer <catégories…\|tout>` | Active une, plusieurs ou toutes les catégories (crée les salons manquants) | Gérer le serveur | `!logs activer sanctions moderation` |
| `logs desactiver <catégories…\|tout>` | Désactive une, plusieurs ou toutes les catégories | Gérer le serveur | `!logs desactiver tout` |
| `setwarnsanction [reset]` | Configure l'échelle des sanctions progressives des warns (panneau interactif : menus + boutons + modal ; `reset` restaure les valeurs par défaut) | Gérer le serveur | `!setwarnsanction` |

### 🛡️ Protections automatiques

| Commande | Description | Permission requise (auteur) | Exemple |
|---|---|---|---|
| `antispam <on\|off>` | Active/désactive l'anti-spam intelligent | Gérer le serveur | `!antispam on` |
| `antilink <on\|off>` | Active/désactive l'anti-link | Gérer le serveur | `!antilink on` |
| `antibot <on\|off>` | Active/désactive l'anti-bot | Gérer le serveur | `!antibot on` |
| `protections` (alias `protection`) | Tableau de bord de l'état des protections (indicateurs, dernière modification, bouton d'actualisation) | Gérer le serveur | `!protections` |

Protections indépendantes, **désactivées par défaut**, configurées par
serveur et persistantes (`database/data/protections.json`).

- **Anti-spam intelligent** : détecte flood (fréquence), messages répétés,
  messages identiques multi-salons, mentions abusives (@everyone/rôles),
  suites de caractères répétitifs, tentatives de **contournement**
  (normalisation : casse, invisibles, ponctuation, répétitions) et **raids**
  (afflux de comptes récents). Réaction par défaut : suppression + logs.
- **Anti-link** : détecte liens externes, invitations Discord,
  raccourcisseurs et domaines suspects (liste blanche prévue). Réaction par
  défaut : suppression + logs.
- **Anti-bot** : surveille l'arrivée des bots, identifie l'ajouteur via les
  **logs d'audit** (si permission disponible) et détecte les **ajouts
  massifs** (raid). Notification des modérateurs.
- **Réactions extensibles** : l'architecture (`REACTIONS`, `applyReaction`)
  permet d'ajouter ultérieurement des sanctions configurables (warn,
  timeout, mute) ; les listes blanches/noires anti-bot et anti-link sont
  prévues.
- **Sécurité** : les membres exemptés (bots, *Gérer les messages* /
  administrateurs, rang ≥ au bot) ne sont jamais sanctionnés ; le bot
  vérifie ses propres permissions avant d'agir.
- **Logs** : catégorie dédiée `protections` (activation, désactivation,
  spam, lien supprimé, arrivée de bot, raid, erreurs).

#### 🚨 Mode urgence

| Commande | Description | Accès | Exemple |
|---|---|---|---|
| `urgence <on\|off\|status>` (alias `emergency`, `lockdown`) | Verrouille / déverrouille tous les salons du serveur | Admin / propriétaire / owner du bot | `!urgence on` |

- **`on`** : mémorise les permissions @everyone de chaque salon puis les
  restreint (plus d'envoi de messages, réactions, fils, connexion ni prise
  de parole vocale) ; embed d'alerte dans le salon + log.
- **`off`** : **restaure exactement** les permissions d'origine.
- Résiste au redémarrage (état persistant), salons neufs verrouillés
  automatiquement pendant l'urgence, jamais de verrouillage irréversible,
  salons critiques ignorables (`exemptChannelIds`, extension future).

#### 👋 Bienvenue

| Commande | Description | Permission | Exemple |
|---|---|---|---|
| `setwelcome` | Panneau interactif : salon, message, couleur, modèle de carte, rôles automatiques, MP, questions d'accueil | Gérer le serveur | `!setwelcome` |
| `welcomestatus` | Affiche la configuration de bienvenue | Gérer le serveur | `!welcomestatus` |
| `welcomepreview` | Aperçu de la carte de bienvenue | Gérer le serveur | `!welcomepreview` |

Carte de bienvenue par **modèles** (`classic`, `banner` — extensible), avec
avatar, pseudo, nom du serveur et nombre de membres. Placeholders
`{user} {username} {server} {count}`. Rôles automatiques (hiérarchie
vérifiée), MP optionnel, et **questions d'accueil** (le nouvel arrivant
répond via un bouton + modal ; réponses enregistrées). Logs `bienvenue`.

#### 💾 Sauvegarde du serveur

| Commande | Description | Permission | Exemple |
|---|---|---|---|
| `backup create [nom]` | Sauvegarde structure + permissions + configuration du bot | Administrateur | `!backup create Avant refonte` |
| `backup list` | Liste des sauvegardes (id, auteur, date, contenu) | Administrateur | `!backup list` |
| `backup load <id>` | Restaure (confirmation par boutons, **non destructif**) | Administrateur | `!backup load a1b2c3d4` |
| `backup delete <id>` | Supprime une sauvegarde (confirmation) | Administrateur | `!backup delete a1b2c3d4` |

Chaque sauvegarde capture les **rôles** (nom, couleur, position,
permissions…), la **structure** (catégories, salons textuels/vocaux/forums/
annonces, ordre, permissions) et la **configuration du bot** propre au
serveur (logs, bump, tickets, rôles réactions, protections, bienvenue,
sanctions, réputation…). Identifiant unique, auteur et date enregistrés ;
nombre plafonné par serveur (10, la plus ancienne évincée). La
restauration est **non destructive** (recrée uniquement les éléments
manquants + réapplique la config), avec résumé détaillé et confirmation.
Logs `sauvegardes`.

#### 📝 Formulaires personnalisables

| Commande | Description | Permission | Exemple |
|---|---|---|---|
| `form create <nom>` (alias `formulaire`) | Assistant de création (questions typées, salon, rôles autorisés) | Gérer le serveur | `!form create Candidature staff` |
| `form edit <id>` | Modifie un formulaire (met à jour le message) | Gérer le serveur | `!form edit a1b2c3d4` |
| `form delete <id>` | Supprime un formulaire | Gérer le serveur | `!form delete a1b2c3d4` |
| `form list` | Liste des formulaires | Gérer le serveur | `!form list` |

Formulaires pour recrutements, candidatures, demandes d'accès… **Questions
typées** : texte court, texte long, nombre, date (via **modal**), choix
unique/multiple (via **menus**). Chaque question : obligatoire ou non,
longueur max, ordre. Le membre remplit via un bouton (menus de choix +
modal de saisie) ; les **réponses sont stockées** et consultables
(exportables ultérieurement). Les modérateurs **traitent** chaque
soumission via des boutons : accepter / refuser / en attente / commenter.
Logs `formulaires`.

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
| `respond <identifiant> <message>` | Répond à une conversation de contact (message signé transmis au propriétaire via le bot ; autres owners synchronisés) | `!respond CONTACT-000001 Bonjour…` |
| `contactlist` | Liste paginée des conversations de contact (statut, serveur, dernier message, date) | `!contactlist` |
| `contactinfo <identifiant>` | Détail d'une conversation + menu de changement de statut | `!contactinfo CONTACT-000001` |

### ✉️ Contact

| Commande | Description | Accès | Exemple |
|---|---|---|---|
| `contactowner <message>` | Contacte les owners du bot depuis le serveur (message transmis par le bot, sans exposer les comptes des owners) | **Propriétaire du serveur** | `!contactowner Une question sur le bot…` |

Système de **communication sécurisée** entre les propriétaires de serveurs
et les owners du bot : toutes les communications transitent par le bot,
aucun compte Discord d'owner n'est jamais exposé.

- **`contactowner`** (propriétaire du serveur uniquement, serveur non
  blacklisté) : envoie un MP à **tous les owners** sous forme d'embed (nom
  et ID du serveur, nom et ID du propriétaire, réputation, membres, date et
  heure, message). Chaque demande reçoit un **identifiant unique**
  `CONTACT-000001`.
- **`respond`** (owners) : la réponse est **signée automatiquement** et
  transmise au propriétaire via le bot ; **tous les autres owners sont
  synchronisés** (embed indiquant l'identifiant, l'owner ayant répondu, la
  date et le contenu) — personne n'ignore qu'une réponse a été envoyée.
- **Statuts** : ouverte, en attente, traitée, fermée — modifiables par les
  owners via le menu de `contactinfo`.
- **Historique persistant** (`database/data/contact.json`) : identifiant,
  serveur, propriétaire, owners ayant répondu, messages échangés et dates
  — survit aux redémarrages.
- **Logs** : catégorie dédiée `contact` (ouverture, réponse, changement de
  statut, fermeture, erreurs d'envoi).
- **Extensible** (pièces jointes, catégories, priorités, notes privées,
  assignation…) : le schéma d'une conversation accepte de nouveaux champs.

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

### 📌 Rôles réactions

| Commande | Description | Permission requise (auteur) | Exemple |
|---|---|---|---|
| `reactionrole create` (alias `rr`) | Assistant interactif de création d'un panneau (menus + boutons + modals) | Gérer les rôles | `!reactionrole create` |
| `reactionrole edit <id>` | Assistant d'édition d'un panneau (met à jour le message existant) | Gérer les rôles | `!reactionrole edit a1b2c3d4` |
| `reactionrole delete <id>` | Supprime un panneau (confirmation par boutons, option « + message ») | Gérer les rôles | `!reactionrole delete a1b2c3d4` |
| `reactionrole list` | Liste paginée des panneaux (id, salon, rôles, mode, date) | Gérer les rôles | `!reactionrole list` |

Panneaux de rôles réactions **personnalisables et persistants**
(`database/data/reactionRoles.json`) : les membres obtiennent/retirent
leurs rôles eux-mêmes via boutons ou menu déroulant.

- **Assistant interactif** (`create`/`edit`) : salon d'envoi, titre,
  description, couleur, image, pied de page, mode, et liste des rôles avec
  emoji / nom affiché / description — le tout via menus, boutons et modals.
- **Composant automatique** : boutons si ≤ 5 rôles, menu déroulant au-delà.
- **Modes** : `multiple` (autant de rôles que souhaité), `unique` (un seul
  rôle du panneau — les autres sont retirés), `limited` (maximum N rôles).
- **Sécurité** : permission *Gérer les rôles* pour administrer ; à chaque
  attribution, vérification de la permission du bot et de la hiérarchie —
  le bot **n'attribue jamais** un rôle supérieur ou égal au sien.
- **Persistance & redémarrage** : les panneaux survivent aux redémarrages
  et restent fonctionnels sans ré-enregistrement (routage par `customId`).
- **Modification** : met à jour automatiquement le message existant (ou le
  republie si le salon change). **Suppression** : confirmation + option de
  suppression du message Discord.
- **Logs** : catégorie dédiée `roles-reactions` (création, modification,
  suppression, mode, erreurs d'attribution).
- **Extensible** (rôles temporaires/conditionnels, statistiques d'usage…) :
  le schéma d'un panneau accepte de nouveaux champs (compteurs `stats` déjà
  présents), la persistance et la logique sont isolées.

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
| `warns` | Sanctions progressives : ajout, suppression, remise à zéro, sanction automatique, règles | `#logs-warns` |
| `roles-reactions` | Panneaux de rôles réactions : création, modification, suppression, rôles, mode, erreurs | `#logs-roles-reactions` |
| `contact` | Contact owners : ouverture, réponse, changement de statut, fermeture, erreurs | `#logs-contact` |
| `protections` | Protections automatiques : activation, spam, lien supprimé, arrivée de bot, raid, erreurs | `#logs-protections` |
| `urgence` | Mode urgence : activation, désactivation, restauration, erreurs | `#logs-urgence` |
| `bienvenue` | Bienvenue : arrivées, rôles automatiques, réponses aux questions, erreurs | `#logs-bienvenue` |
| `sauvegardes` | Sauvegardes : création, restauration, suppression, erreurs | `#logs-sauvegardes` |
| `formulaires` | Formulaires : création, modification, suppression, soumission, traitement, erreurs | `#logs-formulaires` |

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
│   ├── reactionRoles/   #   reactionrole (assistant + composants live)
│   ├── contact/         #   contactowner, respond, contactlist+contactinfo
│   ├── protections/     #   antispam+antilink+antibot, protections (tableau de bord)
│   ├── emergency/       #   urgence (verrouillage on/off/status)
│   ├── welcome/         #   setwelcome, welcomestatus+welcomepreview
│   ├── backup/          #   backup (create/load/delete/list)
│   ├── forms/           #   form (create/edit/delete/list + remplissage)
│   ├── watch/           #   watch+stopwatch, watchtimeuser+watchserveurs
│   └── utility/         #   help, ping, botinfo+uptime, serverinfo, userinfo…
├── events/              # Écouteurs d'événements Discord
│   ├── client/          #   ready (enregistrement des commandes slash)
│   ├── guild/           #   logs des salons et du serveur
│   ├── interaction/     #   interactionCreate (slash + composants interactifs)
│   ├── member/          #   logs des arrivées/départs et des rôles
│   ├── message/         #   messageCreate (préfixe) + logs des messages
│   ├── reactionRoles/   #   ready (panneaux persistés opérationnels)
│   ├── contact/         #   ready (conversations de contact persistées)
│   ├── protections/     #   messageProtection (spam/link), botJoinProtection
│   ├── emergency/       #   channelLock (verrouillage des nouveaux salons)
│   ├── welcome/         #   memberJoin (carte, rôles auto, MP, questions)
│   ├── backup/          #   ready (sauvegardes disponibles)
│   └── forms/           #   ready (formulaires actifs)
├── services/            # Logique métier, partagée par slash et préfixe
│   ├── moderation/      #   banService, kickService, muteService, timeoutService…
│   ├── logging/         #   logService (logs par catégories), modLogService
│   ├── owners/          #   ownerService (owners globaux + rôle décoratif)
│   ├── reputation/      #   reputationService (score, niveaux, critères)
│   ├── tracking/        #   guildStatsService, ownerNotifier (arrivées/départs)
│   ├── bump/            #   bumpService (bump inter-serveurs)
│   ├── serverManagement/#   départ manuel, liste noire globale, journal owner
│   ├── tickets/         #   ticketService (panneaux, cycle de vie, logs)
│   ├── watch/           #   watchService (surveillance de modération, 7 j max)
│   ├── warnings/        #   warnService + sanctionService (sanctions progressives)
│   ├── reactionRoles/   #   reactionRoleService + reactionRoleWizard (assistant)
│   ├── contact/         #   contactService (communication owners ↔ propriétaires)
│   ├── protections/     #   protectionService (état, stats, logs partagés)
│   ├── antispam/        #   antispamService (moteur de détection)
│   ├── antilink/        #   antilinkService (moteur de détection)
│   ├── antibot/         #   antibotService (arrivées de bots, raids)
│   ├── emergency/       #   emergencyService (verrouillage/restauration)
│   ├── welcome/         #   welcomeService + welcomeCardService (modèles)
│   ├── backup/          #   backupService + botConfigBackup (structure + config)
│   └── forms/           #   formService + formWizard (questions, soumissions)
├── middlewares/
│   ├── permissions/     # Permissions auteur/bot, hiérarchie des rôles, owners
│   ├── cooldowns/       # Anti-spam par utilisateur et par commande
│   ├── moderation/      # Garde des warns (cible valide + hiérarchie)
│   ├── tickets/         # Accès aux tickets (créateur ou modérateur)
│   ├── watch/           # Accès à la surveillance (admin / modérateur / owner)
│   ├── reactionRoles/   # Sécurité d'attribution des rôles (hiérarchie du bot)
│   ├── contact/         # Accès au contact (propriétaire du serveur)
│   ├── protections/     # Exemptions (bot, admin, hiérarchie) + permissions bot
│   ├── emergency/       # Accès mode urgence (admin / propriétaire / owner)
│   ├── backup/          # Accès sauvegardes (administrateur)
│   └── forms/           # Gestion (Gérer le serveur) + accès au remplissage
├── utils/
│   ├── constants/       # Couleurs, limites, catégories (commandes et logs)…
│   ├── helpers/         # Contexte unifié, parseur d'arguments, loaders, i18n…
│   └── embeds/          # Constructeurs d'embeds homogènes (charte graphique)
├── config/              # Configuration (env) et permissions par commande
├── database/            # Persistance (JSON) : warns (+ échelle), logs, owners, stats, bumps…
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
