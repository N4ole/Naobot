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
- **Rappels personnels** : `remind` planifie un rappel (durée relative ou date
  absolue) envoyé en message privé à l'échéance ; consultation paginée,
  modification et suppression, persistants (survivent aux redémarrages).
- **Sondages avancés** : `poll` crée un sondage via un assistant interactif
  (choix multiples, quatre modes de vote — classique, multiple, anonyme,
  public), avec durée, fermeture automatique ou anticipée, résultats détaillés
  (pourcentages, gagnants, égalités, participants) et persistance.
- **Salons vocaux temporaires** : des salons « générateurs » créent
  automatiquement un salon vocal à l'arrivée d'un membre (nom personnalisable),
  l'y déplacent, et le suppriment dès qu'il est vide ; le propriétaire peut le
  renommer via `renamevoice`. Configurable par serveur, persistant.
- **Captcha à l'arrivée** : vérification configurable des nouveaux membres
  (bouton, code aléatoire, calcul) pour se protéger des raids et bots —
  rôle temporaire, rôle après validation, délai, expulsion automatique en cas
  d'échec ou d'expiration. Désactivé par défaut, configurable par serveur.
- **Réputation globale inter-serveurs** : indicateur de confiance (0-100)
  centralisé au niveau du bot, alimenté automatiquement par les sanctions
  observées par NaoBot (warn, timeout, mute, kick, ban, anti-spam/link/bot,
  captcha) sur tous les serveurs. `reputation`, `globalprofile`, plus des
  commandes owner (`globalrepstats`, `userhistory`, `repconfig`). Confidentiel,
  tracé, anti-abus.
- **Dossiers membres global inter-serveurs** : dossier de modération unique par
  utilisateur, partagé par tous les serveurs NaoBot, intégré à la réputation.
  `file`, `fileinfo`, `filelist`, `filedelete` — notes tracées (auteur, serveur
  d'origine, date, id), accès réservé aux équipes de modération, consultations
  journalisées.
- **Parité slash / préfixe garantie** : chaque commande existe automatiquement
  dans les deux modes (schéma d'arguments unique). Audit intégré (`commandaudit`,
  `npm run audit`, hook pre-commit, avertissements au démarrage) qui détecte et
  bloque toute incohérence.
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
| `ERROR_GUILD_ID` | — | Serveur privé recevant les logs d'erreurs internes du bot (salon `#bot-errors` créé automatiquement). Aucun autre serveur n'y a accès. |
| `CLIENT_ID` | — | Identifiant de l'application (lien d'invitation) |
| `GUILD_ID` | — | Si défini, les commandes slash sont enregistrées sur ce serveur uniquement (instantané, idéal en développement). Sinon, enregistrement global (~1 h de propagation). |
| `PREFIX` | — | Préfixe **par défaut** des commandes textuelles (défaut : `!`). Chaque serveur peut le remplacer via `setprefix` (persisté séparément). |
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
| 1 | Avertissement simple |
| 2 | Timeout 5 minutes |
| 3 | Timeout 15 minutes |
| 4 | Timeout 1 heure |
| 5 | Timeout 1 jour |
| 6 | Timeout 1 semaine |
| 7 | Bannissement définitif |

- L'échelle se configure via `setwarnsanction` (panneau interactif : menu
  des paliers, menu des types de sanction, modal de durée pour les
  timeouts, désactivation d'un palier, `reset`). Ajouter un palier ou un
  type de sanction est trivial (`utils/constants/warnSanctions.js`).
- Au-delà du dernier palier, le dernier palier s'applique (plafond).
- Chaque sanction enregistre l'utilisateur, le modérateur, la raison, la durée
  et la date ; à chaque warn, le membre reçoit un **MP** (raison, modérateur,
  sanction appliquée, total, prochaine sanction) — échec silencieux si MP fermés.
- `warnings` (alias `warns`) affiche le **total actif**, la **sanction
  actuellement associée** et la **prochaine sanction**.
- **Retrait d'un warn** (`unwarn`) : soft-delete — le warn est **conservé dans
  l'historique** (marqué comme retiré) mais n'est plus actif ; le total et la
  sanction associée sont **recalculés automatiquement**. La réputation globale
  conserve l'événement (signal de confiance inter-serveurs, non réversible).
- `unwarn` / `clearwarns` recalculent le total ; toutes les actions (ajout,
  suppression, remise à zéro, sanction automatique, modification des
  règles) sont journalisées dans la catégorie de logs `sanctions`.
- La persistance (`database/data/warns.json`, `warnConfig.json`) porte tout
  le nécessaire aux futures statistiques (modérateurs les plus actifs,
  utilisateurs les plus sanctionnés, sanctions les plus fréquentes).
- Le système de warns **n'attribue aucun rôle** : il se limite à enregistrer
  les sanctions, appliquer la sanction configurée, conserver l'historique et
  mettre à jour la **réputation globale** de l'utilisateur.

### ⚙️ Administration

| Commande | Description | Permission requise (auteur) | Exemple |
|---|---|---|---|
| `logs` | Panneau interactif de configuration des logs (7 catégories : menu + boutons) | Gérer le serveur | `!logs` |
| `logs setup` | Crée la catégorie « Logs » et les sept salons, active tout | Gérer le serveur | `!logs setup` |
| `logs status` | État détaillé (catégorie, état, salon, date et auteur de la dernière modification) | Gérer le serveur | `!logs status` |
| `logs enable <catégories…\|tout>` | Active une, plusieurs ou toutes les catégories (crée les salons manquants) | Gérer le serveur | `!logs enable sanctions moderation` |
| `logs disable <catégories…\|tout>` | Désactive une, plusieurs ou toutes les catégories | Gérer le serveur | `!logs disable tout` |
| `setwarnsanction [reset]` | Configure l'échelle des sanctions progressives des warns (panneau interactif : menus + boutons + modal ; `reset` restaure les valeurs par défaut) | Gérer le serveur | `!setwarnsanction` |
| `say <message>` | Fait relayer un message par le bot (texte, mentions, emojis, liens, pièces jointes) ; supprime la commande d'origine, neutralise @everyone/@here, journalise l'auteur | Admin / propriétaire / owner du bot | `!say Bienvenue à tous !` |
| `prefix` (alias `prefixe`) | Affiche le préfixe actuel, le préfixe par défaut, l'auteur et la date de la dernière modification | Tous | `!prefix` |
| `setprefix <nouveau\|reset>` (alias `changeprefix`) | Change le préfixe des commandes textuelles du serveur (ou `reset` pour revenir au défaut), pris en compte immédiatement | Admin / propriétaire / owner du bot | `!setprefix ?` |

**Préfixe personnalisable par serveur** : le préfixe **par défaut** est défini
dans le code (`PREFIX` du `.env`) et n'est jamais stocké en base ; chaque
serveur peut le remplacer via `setprefix`. Le nouveau préfixe est **persistant**
(`database/data/prefixes.json`), pris en compte **immédiatement** (sans
redémarrage) et journalisé (catégorie `moderation` : ancien préfixe, nouveau
préfixe, auteur). Validation : non vide, **5 caractères max**, sans espace ni
caractères `@ # / \ ` `` ` `` `< >` (évite les conflits avec les mentions, les
salons et les commandes slash). Les commandes **slash** restent toujours
disponibles quel que soit le préfixe. Architecture prête pour **plusieurs
préfixes par serveur** dans une future mise à jour.

### 🛡️ Protections automatiques

| Commande | Description | Permission requise (auteur) | Exemple |
|---|---|---|---|
| `antispam <on\|off>` | Active/désactive l'anti-spam intelligent | Gérer le serveur | `!antispam on` |
| `antilink <on\|off>` | Active/désactive l'anti-link | Gérer le serveur | `!antilink on` |
| `antibot <on\|off>` | Active/désactive l'anti-bot | Gérer le serveur | `!antibot on` |
| `protections` (alias `protection`) | Tableau de bord de l'état des protections (indicateurs, dernière modification, bouton d'actualisation) | Gérer le serveur | `!protections` |
| `antipub <on\|off>` | Active/désactive l'anti-publicité (invitations Discord) | Administrateur | `!antipub on` |
| `antipub status` | État, salons exemptés (paginés), statistiques, boutons | Administrateur | `!antipub status` |
| `antipub whitelist add <salon>` | Exempte un salon (invitations autorisées) | Administrateur | `!antipub whitelist add #partenariats` |
| `antipub whitelist remove <salon>` | Retire un salon des exemptions | Administrateur | `!antipub whitelist remove #partenariats` |
| `antipub whitelist list` | Liste les salons exemptés | Administrateur | `!antipub whitelist list` |
| `antisensitive <on\|off>` | Active/désactive l'anti-contenus sensibles (sites adultes/violents) | Administrateur | `!antisensitive on` |
| `antisensitive status` | État, salons exemptés (paginés), statistiques, boutons | Administrateur | `!antisensitive status` |
| `antisensitive whitelist add\|remove\|list <salon>` | Gère les salons exemptés | Administrateur | `!antisensitive whitelist add #nsfw` |

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

#### 📢 Anti-publicité (invitations Discord)

Protection **dédiée et indépendante** des autres protections, activable
séparément, **désactivée par défaut**, persistante par serveur
(`database/data/antipub.json`).

- **Détection** : invitations Discord (`discord.gg`, `discord.com/invite`,
  `discordapp.com/invite`, sous-domaines `canary`/`ptb`, raccourcisseurs
  `dsc.gg`/`invite.gg`, redirecteurs vanity `discord.me`/`.io`/`.li`/`.st`),
  y compris **dissimulées** dans le texte (espaces, « (dot) », caractères
  invisibles) et présentes dans un **embed**. S'applique aux messages
  classiques, **modifiés**, aux réponses et aux commandes de type `say`.
- **Réaction** : suppression du message, **notification discrète** de
  l'utilisateur (auto-supprimée), journalisation (`protections`) et
  incrément des statistiques (détections, suppressions, erreurs). Sanctions
  automatiques prévues (extension future).
- **Salons exemptés** : liste persistante, éditable et consultable
  (`whitelist add`/`remove`/`list`) — les invitations y sont autorisées
  (ex. `#partenariats`, `#publicité`, `#recrutement`).
- **Exceptions futures** : l'architecture (repository + middleware) prévoit
  déjà rôles exemptés, utilisateurs exemptés et serveurs autorisés.
- **Sécurité** : les membres exemptés (bots, *Gérer les messages* /
  administrateurs, rang ≥ au bot) ne sont jamais visés ; le bot vérifie ses
  permissions avant d'agir.

#### 🔞 Anti-contenus sensibles (sites adultes / violents)

Protection **dédiée et indépendante**, activable séparément, **désactivée par
défaut**, persistante par serveur (`database/data/antisensitive.json`).

- **Détection** : liens vers des sites pour **adultes**, **violents/gore** ou
  **choquants** (listes fermées par catégorie dans
  `utils/constants/sensitiveDomains.js`), par **domaine et sous-domaine**, y
  compris **dissimulés** (espaces, « (dot) », caractères invisibles) et dans un
  **embed**. S'applique aux messages classiques, **modifiés**, aux réponses et
  aux commandes de type `say`. **Domaines configurables** par serveur
  (`blockedDomains`) et **domaines autorisés** (`allowedDomains`).
- **Extensible** : `analyze` applique une chaîne de matchers ; l'architecture
  prévoit l'ajout d'**API de réputation**, de **listes noires externes**, de
  **modèles d'analyse** et la résolution des **liens raccourcis / redirections**.
- **Réaction** : suppression du message, **notification discrète** de
  l'utilisateur (auto-supprimée), journalisation (`protections`) et
  statistiques (détections, suppressions, erreurs). Warns/sanctions automatiques
  et notifications aux modérateurs prévus (extensions).
- **Salons exemptés** : liste persistante, éditable et consultable
  (`whitelist add`/`remove`/`list`).
- **Exceptions futures** : rôles et utilisateurs exemptés prévus (repository +
  middleware).
- **Status** : `antisensitive status` — état, salons exemptés (paginés),
  statistiques et date de dernière modification (embed + boutons).
- **Intégration** : l'état apparaît dans le tableau de bord `protections`
  (anti-spam, anti-link, anti-bot, anti-publicité, anti-contenus sensibles).
  **Interface web** : `/api/guilds/:id/antisensitive`.

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
| `commandaudit` (alias `cmdaudit`, `auditcommands`) | Audit de parité slash / préfixe de toutes les commandes : statistiques, incohérences restantes, date du dernier audit | `!commandaudit` |
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
- **Logs** : journalisation (fusionnée dans les 7 catégories de logs) (ouverture, réponse, changement de
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

**Configuration** (administrateurs — assistants interactifs) :

| Commande | Description | Permission | Exemple |
|---|---|---|---|
| `ticketcategory <create\|edit\|delete\|list> [id]` (alias `tcategory`, `ticketcat`) | Gère les catégories de tickets (assistant : identité, salon, message, comportement, notifications) | Administrateur | `!ticketcategory create` |
| `ticketpanel <create\|edit\|delete\|list> [id]` (alias `tpanel`) | Gère les panneaux (salon, catégories affichées, boutons ou menu déroulant, contenu) | Administrateur | `!ticketpanel create` |
| `ticketstats` (alias `ticketstatistics`) | Statistiques par catégorie et globales (total, temps moyen, modérateurs/catégories les plus actifs) | Gérer le serveur | `!ticketstats` |

**Gestion d'un ticket** (créateur, modérateur assigné ou équipe — utilisables aussi via les boutons du ticket) :

| Commande | Description | Exemple |
|---|---|---|
| `ticket` / `ticketinfo` | Informations du ticket courant | `!ticketinfo` |
| `ticketclose` | Ferme le ticket courant | `!ticketclose` |
| `ticketopen` (alias `ticketreopen`) | Réouvre le ticket courant | `!ticketopen` |
| `ticketrename <nom>` | Renomme le ticket courant | `!ticketrename urgent-paiement` |
| `ticketdelete` | Supprime le ticket courant (confirmation + transcript) | `!ticketdelete` |
| `ticketadd <membre>` | Ajoute un membre au ticket | `!ticketadd @Membre` |
| `ticketremove <membre>` | Retire un membre du ticket | `!ticketremove @Membre` |
| `ticketmove <id_catégorie>` (alias `tickettransfer`) | Transfère le ticket vers une autre catégorie | `!ticketmove a1b2c3d4` |
| `ticketclaim` | S'assigne le ticket | `!ticketclaim` |
| `ticketunclaim` | Retire l'assignation | `!ticketunclaim` |

## Système de tickets avancé

Système **entièrement personnalisable et modulaire**, multi-serveurs et
persistant (`database/data/tickets.json`, `ticketCategories.json`,
`ticketPanels.json`) : catégories, panneaux, compteurs, tickets,
assignations, statistiques et paramètres survivent aux redémarrages.

- **Catégories illimitées et indépendantes** (`ticketcategory`) : chaque
  catégorie possède sa propre configuration (nom, description, emoji,
  couleur, catégorie Discord cible, rôles d'accès), son **propre compteur
  persistant**, son **format de salon** personnalisable
  (`support-{counter}`, `plainte-{username}-{counter}`… variables
  `{counter} {user} {username} {userid} {category} {date}`, extensibles via
  `utils/constants/ticketVariables.js`), son message d'accueil (variables
  `{user} {mention} {category} {ticketid} {date}`), son mode d'ouverture
  (directe ou **formulaire modal**) et son **comportement** (nombre max de
  tickets ouverts, délai entre deux tickets, fermeture automatique par
  inactivité, suppression automatique, archivage).
- **Notifications & sortie par catégorie** : rôles/utilisateurs à notifier à
  l'ouverture, salon de logs dédié (sinon la catégorie de logs globale
  `tickets`).
- **Panneaux personnalisables** (`ticketpanel`) : salon d'envoi, titre,
  description, couleur, image, pied de page, et une ou plusieurs catégories
  affichées via des **boutons** ou un **menu déroulant** (au choix ; repli
  automatique en menu au-delà de 25 catégories).
- **Ouverture** : bouton, menu déroulant ou **formulaire Discord** (modal)
  selon la catégorie ; vérification de la limite de tickets ouverts et du
  délai ; salon privé placé dans la catégorie Discord cible, visible du
  créateur, du staff (rôles d'accès + rôles notifiés) et du bot.
- **Message d'ouverture** : embed (catégorie, créateur, statut, assigné,
  demande) + boutons 🔒 Fermer, 🙋 S'assigner, ✏️ Renommer (modal),
  🗑️ Supprimer (confirmation), ➕/➖ Ajouter/Retirer un utilisateur.
- **Assignation** (`ticketclaim`/`ticketunclaim`) : prise en charge par un
  modérateur, affichée dans le ticket et journalisée.
- **Transcripts** (`services/tickets/transcriptService.js`, extensible) :
  à la suppression, capture des messages en **texte** et **HTML** (PDF dans
  une future version), joints au salon de logs de la catégorie.
- **Fermeture / suppression automatiques** : planificateur (inactivité,
  délai après fermeture) selon la configuration de chaque catégorie.
- **Statistiques** (`ticketstats`) : total par catégorie, temps moyen de
  traitement, modérateurs et catégories les plus actifs.
- **Logs** : catégorie dédiée `tickets` (ouverture, fermeture, réouverture,
  suppression, renommage, assignation, transfert, membres) + salon de logs
  propre à chaque catégorie.
- **Extensible sans refonte** : le schéma des catégories/tickets accepte de
  nouveaux champs (SLA, priorités, tags, formulaires avancés, réponses
  automatiques, IA…) via les modules `services/tickets`,
  `services/ticketCategories`, `services/ticketPanels`.

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
- **Logs** : catégorie `watch` (démarrage, arrêt, reprise,
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
- **Logs** : catégorie `roles` (création, modification,
  suppression, mode, erreurs d'attribution).
- **Extensible** (rôles temporaires/conditionnels, statistiques d'usage…) :
  le schéma d'un panneau accepte de nouveaux champs (compteurs `stats` déjà
  présents), la persistance et la logique sont isolées.

### 🧰 Utilitaire

| Commande | Description | Exemple |
|---|---|---|
| `help [commande]` (alias `aide`) | Aide dynamique : embed d'accueil (statistiques) + **menu déroulant** de catégories ; la sélection affiche les commandes de la catégorie (description, permissions, exemples), **paginées** par boutons ◀️/▶️ si nécessaire, réservées au demandeur, retirées après 5 min — mise à jour automatique à chaque nouvelle commande | `!help ban` |
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
| `rps` (alias `pfc`, `chifoumi`) | Pierre-feuille-ciseaux contre le bot, avec boutons | — | `!rps` |

### ⏰ Rappels personnels

Rappels personnels (par utilisateur, valables sur tous les serveurs), envoyés
en **message privé** à l'échéance. Ils sont **persistants** : un rappel dû
pendant l'arrêt du bot est envoyé au redémarrage.

| Commande | Description | Exemple |
|---|---|---|
| `remind <durée\|date> <message>` (alias `rappel`, `remindme`) | Crée un rappel. Durée relative (`30s`, `15m`, `2h`, `3j`, `1w`/`1sem`) ou date absolue (`JJ/MM/AAAA [HH:mm]`) | `!remind 2h Préparer la réunion` · `!remind 25/12/2026 18:00 Repas` |
| `remindlist` (alias `reminders`, `rappels`) | Liste vos rappels actifs (identifiant, échéance, contenu), paginée par **boutons** | `!remindlist` |
| `remindedit <id> <échéance\|garder> [message]` | Modifie l'échéance et/ou le texte d'un rappel (`garder` conserve l'échéance) | `!remindedit a1b2c3 garder Nouveau texte` |
| `reminddelete <id>` (alias `remindremove`) | Supprime un rappel (**confirmation par boutons**) | `!reminddelete a1b2c3` |

À l'échéance, le message privé rappelle le texte d'origine, la date de
création, le temps écoulé et un lien vers le message d'origine si disponible.

### 📊 Sondages avancés

Sondages créés via un **assistant interactif** (menus + modal) : titre,
description, choix (2 à 20, un par ligne), salon de publication, mode de vote
et durée. Le sondage est publié dans le salon choisi avec des **boutons** (≤ 5
choix) ou un **menu déroulant** (> 5 choix). Il se ferme automatiquement à
l'expiration (ou manuellement) ; tout est **persistant**.

**Modes de vote** : `classique` (un seul choix), `multiple` (plusieurs choix),
`anonyme` (décomptes masqués pendant le vote, seuls les résultats agrégés sont
révélés à la fermeture), `public` (liste des votants visible dans les
résultats).

| Commande | Description | Permission | Exemple |
|---|---|---|---|
| `poll [titre]` (alias `sondage`) | Ouvre l'assistant de création d'un sondage | Gérer les messages | `!poll Quel jeu ce week-end ?` |
| `pollclose <id>` (alias `closepoll`) | Ferme un sondage par anticipation (**confirmation** + résultats immédiats) | Créateur ou gestionnaire | `!pollclose a1b2c3` |
| `pollresults <id>` (alias `resultspoll`) | Résultats détaillés : total, pourcentages, gagnants, égalités, participants (paginés, sauf anonyme) | — | `!pollresults a1b2c3` |
| `polllist` (alias `polls`, `sondages`) | Liste les sondages du serveur (actifs et terminés, créateurs, dates), paginée | — | `!polllist` |

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
- **Logs** : journalisation (fusionnée dans les 7 catégories de logs) (activation, désactivation,
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

## Captcha à l'arrivée

Protège le serveur contre les **raids**, comptes automatisés, bots
malveillants, créations massives de comptes et spams. **Désactivé par défaut**,
configuré par serveur, persistant (`database/data/captcha.json`).

| Commande | Description | Permission | Exemple |
|---|---|---|---|
| `captcha status` | État et statistiques du captcha | Administrateur | `!captcha status` |
| `captcha setup` | Assistant : salon, rôle temporaire, rôle après validation, type, délai, message, tentatives | Administrateur | `!captcha setup` |
| `captcha enable` | Active la vérification (configuration requise) | Administrateur | `!captcha enable` |
| `captcha disable` | Désactive la vérification | Administrateur | `!captcha disable` |
| `captcha delete <secondes\|off>` | Durée avant suppression auto du message de confirmation (défaut 10 s ; `off` conserve le message) | Administrateur | `!captcha delete 15` |

- **Arrivée d'un membre** (si activé) : attribution d'un **rôle temporaire**,
  restriction d'accès (le membre ne voit que le salon de captcha), envoi du
  défi qui le mentionne.
- **Types de captcha** (extensibles, `utils/constants/captchaTypes.js`) :
  **bouton simple** (un clic), **code aléatoire** (recopier un code type
  `K7P4X9` via un modal), **calcul** (résoudre une opération). Ajouter un type
  = une entrée + un cas dans `generateChallenge`.
- **Validation** : le **rôle vérifié** est attribué, le rôle temporaire retiré,
  l'accès débloqué. Le **message de confirmation** (« Vérification réussie ») est
  **temporaire** : il est supprimé automatiquement après une durée configurable
  (défaut **10 s**, réglable via `captcha delete`, ou désactivable). Un échec de
  suppression n'est jamais critique : il est consigné dans les **logs d'erreurs
  internes** du bot et le fonctionnement continue normalement.
- **Échec** (trop de tentatives) ou **expiration** (délai dépassé) →
  **expulsion** automatique (anti-raid), même après un redémarrage
  (vérifications en attente persistées, planificateur au démarrage).
- **Sécurité** : seul le membre concerné peut résoudre son captcha ; nombre de
  tentatives limité ; configuration réservée aux administrateurs.
- **Logs** : catégorie `members` (envoi, validation, échec, expiration,
  configuration). **Interface web** : état et statistiques dans la vue serveur.

## Salons vocaux temporaires

Système « Join to Create » **configurable par serveur** et persistant
(`database/data/tempVoice.json`) : générateurs, paramètres, salons temporaires
actifs, propriétaires et statistiques survivent aux redémarrages.

| Commande | Description | Permission | Exemple |
|---|---|---|---|
| `voicecreate` (alias `voiceadd`) | Assistant : salon générateur, catégorie de création, format du nom, limite d'utilisateurs, rôles supplémentaires | Administrateur | `!voicecreate` |
| `voiceedit <salon>` | Modifie un générateur (même assistant) | Administrateur | `!voiceedit #Créer un salon` |
| `voicelist` | Liste les générateurs, salons actifs et statistiques | Administrateur | `!voicelist` |
| `voicedelete <salon>` (alias `voiceremove`) | Supprime un générateur (confirmation) | Administrateur | `!voicedelete #Créer un salon` |
| `renamevoice <nom>` (alias `vcrename`) | Renomme **votre** salon temporaire (propriétaire uniquement) | — | `!renamevoice 🎮 Détente` |

- **Fonctionnement** : un administrateur configure un **salon générateur**
  (ex. « ➕ Créer un salon vocal »). Quand un membre le rejoint, le bot crée un
  salon vocal (nom personnalisable), y **déplace** le membre, et le marque
  temporaire. Dès que le salon est **vide**, il est supprimé automatiquement,
  les données nettoyées et l'événement journalisé.
- **Format du nom** personnalisable via variables (`{user}`, `{username}`,
  `{displayname}`, `{counter}`, extensibles dans
  `utils/constants/tempVoiceVariables.js`). Exemples : `Salon de {user}`,
  `🔊 {username}`, `Squad de {displayname}`.
- **Permissions synchronisées** : le salon temporaire **hérite intégralement
  des permissions de sa catégorie** Discord (synchronisation native via
  `lockPermissions`) — aucune permission n'est copiée manuellement et le salon
  reste aligné sur sa catégorie.
- **Renommage (`renamevoice <nom>`)** : le **propriétaire** du salon peut le
  renommer. Vérifications avant modification : l'utilisateur est **connecté**
  à un salon vocal, le salon est bien un **salon temporaire** géré par le bot,
  l'utilisateur en est le **propriétaire**, et le nouveau nom respecte les
  **limites Discord** (100 caractères max). Le salon est renommé immédiatement,
  la modification persistée (`renamedAt`) et une confirmation envoyée en embed.
- **Propriétaire** : sa seule capacité est de **renommer** son salon via
  `renamevoice` (arbitré par le bot). Il **ne peut pas** modifier les
  permissions, changer la catégorie, supprimer le salon, déplacer des membres
  ni modifier d'autres paramètres — il ne reçoit aucune permission de gestion
  Discord. Le système reste compatible avec de futures extensions.
- **Sécurité** : anti-doublon (un seul salon actif par membre et par
  générateur — sinon le membre est déplacé vers l'existant), pas de boucle de
  création (un salon temporaire n'est jamais un générateur), configuration
  réservée aux administrateurs, suppression automatique des salons vides.
- **Persistance** : identifiant du salon, propriétaire, date de création et
  date du dernier renommage survivent aux redémarrages
  (`database/data/tempVoice.json`).
- **Logs** : journalisation (fusionnée dans les 7 catégories de logs) : création,
  suppression, **renommage (ancien nom → nouveau nom, propriétaire, serveur,
  date)**, configuration, erreurs. **Interface web** : section « Vocaux »
  (générateurs, salons actifs, statistiques).
- **Extensible sans refonte** : salons privés, mots de passe, limite
  ajustable, verrouillage, transfert de propriété, salons permanents…
  (services/temporaryVoice, schéma des générateurs/temps ouvert).

## Réputation globale (inter-serveurs)

Indicateur de confiance **global à l'utilisateur** (indépendant du serveur),
**centralisé au niveau du bot** : il suit l'utilisateur entre tous les serveurs
NaoBot. Il **ne remplace pas** la modération locale — c'est un simple indicateur
fondé sur les actions observées par NaoBot. Persistant
(`database/data/globalReputation.json`, `moderationHistory.json`,
`reputationConfig.json`).

| Commande | Description | Accès | Exemple |
|---|---|---|---|
| `reputation [utilisateur]` (alias `globalrep`, `grep`) | Score /100, niveau de confiance, sanctions (warns/timeouts/mutes/kicks/bans), serveurs, ancienneté, historique résumé | Sa propre réputation ; celle d'autrui : admin d'un serveur commun ou owner | `!reputation @Membre` |
| `globalprofile [utilisateur]` (alias `gprofile`) | Profil complet : avatar, pseudo, ID, score, badges, statistiques, historique | idem | `!globalprofile @Membre` |
| `globalrepstats` | Meilleures/pires réputations, total de sanctions, statistiques globales | Owners du bot | `!globalrepstats` |
| `userhistory <utilisateur>` | Historique complet (action, serveur, date, modérateur, raison, score) paginé | Owners du bot | `!userhistory @Membre` |
| `repconfig [clé] [valeur]` | Consulte/modifie les pondérations ; recalcule les scores | Owners du bot | `!repconfig ban 40` |

- **Score 0-100** : 100 = très fiable, 50 = à surveiller, 0 = problématique.
  Calcul **automatique** à partir de l'historique complet avec les pondérations
  courantes (un changement de pondération **reprice** tous les scores).
- **Facteurs négatifs** (pondérations configurables) : warn (-3), timeout court
  (-5) / long (-10), mute (-8), kick (-15), ban (-30), anti-spam (-4),
  anti-link (-4), anti-bot (-15), captcha (-6). **Facteurs positifs** :
  ancienneté du compte Discord (+2/an, plafonné) — architecture ouverte à
  d'autres facteurs (ancienneté serveur, activité…).
- **Liaison automatique** : les modules de modération envoient leurs événements
  au service (`warn`, `timeout`, `mute`, `kick` via les services, `ban` via
  l'événement `GuildBanAdd` — NaoBot ou manuel —, `antispam`/`antilink`/
  `antibot`, `captcha`). Chaque module peut appeler
  `globalReputationService.record(...)`.
- **Historique global** : chaque événement enregistre utilisateur, serveur,
  action, raison, modérateur, date, durée, **score avant / après**.
- **Protection contre les abus** : un serveur ne peut **jamais** fixer
  directement le score (seulement contribuer via des événements **tracés**) ;
  la configuration est centralisée (owners uniquement) ; le nombre d'événements
  par (serveur, utilisateur, jour) est **plafonné**. Logs obligatoires.
- **Confidentialité** : un membre ne voit que **sa propre** réputation ; celle
  d'autrui n'est visible que des **administrateurs d'un serveur commun** et des
  **owners**. Toute consultation d'un tiers est journalisée.
- **Interface web** : section « Réputation » (score, statistiques, historique ;
  pondérations pour les owners).
- **Logs** : l'évolution de la réputation globale est journalisée dans la
  catégorie `sanctions`. Distinct de la réputation des **serveurs** (`rep`).

## Dossiers membres (global inter-serveurs)

Dossier de modération **global à l'utilisateur** (indépendant du serveur),
**centralisé au niveau du bot** : chaque utilisateur Discord possède **un
unique dossier** partagé par tous les serveurs NaoBot, consultable par les
équipes de modération autorisées. Un dossier regroupe des **notes** (remarques,
événements, observations, commentaires de modération). Persistant
(`database/data/memberFiles.json`), **entièrement intégré à la réputation**.

| Commande | Description | Accès | Exemple |
|---|---|---|---|
| `file <utilisateur> <texte>` (alias `dossier`, `note`) | Ajoute une note au dossier global de l'utilisateur | Admin / Modérer les membres / owner | `!file @Membre Comportement suspect signalé` |
| `fileinfo <utilisateur>` (alias `dossierinfo`) | Dossier complet : infos générales (avatar, pseudo, ID, réputation globale, warns/sanctions, nombre de notes et de serveurs) + notes paginées (boutons) | Admin / owner | `!fileinfo @Membre` |
| `filelist <utilisateur>` (alias `dossierlist`) | Liste allégée des notes (id, auteur, serveur, date) | Admin / owner | `!filelist @Membre` |
| `filedelete <id>` (alias `dossierdelete`) | Supprime une note après confirmation (trace conservée dans les logs) | Owner, auteur de la note, ou admin du serveur d'origine | `!filedelete a1b2c3d4` |

- **Note** : contenu, auteur (pseudo + ID Discord), **serveur d'origine**, date
  et **identifiant unique** — chaque champ est persisté et survit aux
  redémarrages.
- **Intégration réputation** : le profil de réputation globale
  (`globalprofile`) affiche le **nombre de notes** et le **nombre de serveurs**
  ayant contribué au dossier, avec un accès rapide. Les notes **ne modifient
  jamais automatiquement** le score de réputation.
- **Confidentialité** : les membres classiques n'ont **aucun accès** ; l'ajout
  est réservé aux administrateurs / modérateurs / owners, la consultation aux
  administrateurs et owners. La suppression est restreinte à l'auteur, à l'admin
  du serveur d'origine de la note ou aux owners. **Toute consultation est
  journalisée.**
- **Logs** : création, suppression et consultation d'un dossier sont
  journalisées dans la catégorie **surveillance** (`watch`).
- **Interface web** : section « Dossiers membres » (**owners du bot
  uniquement**) — consultation d'un dossier, recherche d'un utilisateur,
  filtrage des notes et statistiques ; `/api/files/:userId`.
- **Architecture évolutive** : pièces jointes, catégories de notes, niveaux de
  gravité, tags et historique de modification pourront être ajoutés sans refonte.

## Système de niveaux (activité)

Progression basée **uniquement sur l'activité réelle** des membres, propre à
chaque serveur, persistante (`database/data/levels.json`). **Désactivé par
défaut** (activation via `levelconfig on`).

| Commande | Description | Permission | Exemple |
|---|---|---|---|
| `rank` / `level` [membre] (alias `niveau`) | Profil de progression (niveau, XP, progression, classement, messages, temps vocal) | Tous | `!rank @Membre` |
| `leaderboard` (alias `classement`, `top`) | Classement paginé des membres (niveau, XP, messages, vocal) | Tous | `!leaderboard` |
| `levelconfig [on\|off\|set\|reward\|announce\|exclude] …` | Configuration (administrateurs) | Administrateur | `!levelconfig set xpmessage 20` |

- **Sources d'XP** :
  - **Messages** : XP par message avec **cooldown anti-spam**, **longueur
    minimale** et **anti-répétition** (message identique ignoré) ; bots, salons
    et rôles exclus ne rapportent rien.
  - **Temps vocal** : XP par minute réellement active (salon vocal hors AFK, non
    sourd), **exclusion des membres seuls** si configuré, **bots exclus**. Les
    sessions vocales sont **persistées** : le calcul survit aux redémarrages
    (reprise au démarrage + flush périodique).
- **Courbe configurable** : XP total requis pour un niveau = `base·niveau² +
  offset` (défaut `50·L²+50` → **100, 250, 500, 850…**, conforme à l'exemple).
- **Récompenses** : rôles attribués à certains niveaux (cumulatifs), **message
  d'annonce** de montée de niveau dans un **salon d'annonce** configurable (ou
  le salon courant).
- **Configuration** (`levelconfig`) : activation, XP/message, XP/minute vocale,
  cooldown, longueur minimale, salons/rôles exclus, bots exclus, récompenses,
  salon d'annonce.
- **rank** : embed avec niveau, XP actuelle/nécessaire, **barre de progression**,
  classement serveur, messages et temps vocal cumulé. L'architecture sépare les
  **données** (`buildRankData`) de la présentation, pour ajouter plus tard une
  **carte graphique** de profil.
- **Logs** : montée de niveau et configuration → catégorie `members` ;
  attribution d'un rôle de récompense → catégorie `roles`.
- **Interface web** : section « Niveaux » (statistiques, paramètres, classement,
  récompenses ; `/api/guilds/:id/levels`).

## Système de snipe

Consultation des **événements récents** supprimés ou modifiés d'un serveur,
catégorisés (comme les logs). Persisté par serveur (`database/data/snipe.json`)
avec limites et **purge automatique**.

| Commande | Catégorie consultée | Exemple |
|---|---|---|
| `snipe` | Messages supprimés (unitaires + suppressions massives) | `!snipe #salon` |
| `editsnipe` | Messages modifiés (avant / après) | `!editsnipe @Membre` |
| `membersnipe` | Arrivées / départs | `!membersnipe` |
| `rolesnipe` | Changements de rôles (ajouts / retraits) | `!rolesnipe @Membre` |
| `sanctionsnipe` | Sanctions (warns, bans, unbans) | `!sanctionsnipe` |
| `ticketsnipe` | Événements de tickets | `!ticketsnipe` |
| `protectionsnipe` | Événements de protections | `!protectionsnipe` |

- **Catégories** (`utils/constants/snipeCategories.js`) : messages supprimés,
  messages modifiés, arrivées/départs, changements de rôles, sanctions,
  tickets, protections. **Fermé et extensible** : ajouter une catégorie = une
  entrée + un appel `snipeService.record`.
- **Données conservées** par événement : utilisateur, salon, serveur, date,
  type, ancien contenu, nouveau contenu, pièces jointes, images, et modérateur
  responsable lorsque applicable.
- **Consultation** : filtres par **utilisateur** et par **salon**, navigation
  par **boutons** et **pagination** (un événement par page). Chaque résultat est
  un embed (catégorie, date, salon, auteur, contenu).
- **Limites** : nombre maximal d'éléments par serveur et **durée de conservation
  configurables** (`snipeService.setConfig` ; défaut : 50 éléments / catégorie,
  24 h) ; une **purge automatique** périodique retire les événements expirés.
- **Permissions** : administrateurs, modérateurs (Modérer les membres) ou owners
  du bot (`middlewares/snipe`).
- **Logs** : toute consultation est journalisée dans la catégorie de logs de
  **surveillance** (`watch`). **Interface web** : nombre d'événements récents par
  catégorie dans la vue serveur (`/api/guilds/:id/snipe`).

## Commandes en messages privés (DM)

Le bot fonctionne aussi en **messages privés**. Les commandes **personnelles**
(sans contexte serveur) déclarent `dm: 'direct'` et s'utilisent directement en
DM ; les commandes nécessitant un serveur proposent une **sélection de serveur**.

- **Commandes utilisables en DM** : `help`, `remind` / `remindlist` /
  `reminddelete` / `remindedit` (rappels personnels), `globalprofile`
  (réputation globale), `servers` (choix du serveur actif). En DM, le **préfixe
  par défaut** s'applique (aucun préfixe personnalisé sans serveur).
- **Sélection de serveur** : `servers` (alias `serveurs`) affiche un **menu
  déroulant** des serveurs que vous partagez avec le bot et **mémorise** votre
  serveur actif (`database/data/dmSelections.json`) pour améliorer l'expérience.
- **Commandes nécessitant un serveur** : lancées en DM, elles **détectent** le
  contexte, **expliquent** pourquoi un serveur est requis et proposent le menu de
  sélection de serveur. Les commandes agissant sur un salon/serveur précis
  (modération directe…) restent réservées à une utilisation **en serveur**.
- **Pipeline** : en DM, `ctx.guild` est `null` ; le pipeline ignore alors les
  permissions Discord, les statistiques et les logs de serveur (les commandes
  DM compatibles sont personnelles). Points d'entrée dédiés :
  `events/dm/directMessage.js` (préfixe) et la branche DM de
  `events/interaction/interactionCreate.js` (slash). Intents requis :
  `DirectMessages` + partiel `Channel`.

## Émojis officiels (charte)

Tous les émojis de marque de NaoBot sont **centralisés** dans
**`config/emojis.js`** (source unique) et réutilisés partout sans duplication.
**Aucun identifiant d'émoji (`<:nom:id>`) n'est écrit ailleurs** : chaque module
importe ce fichier ; ajouter un émoji = une entrée, sans modifier les commandes
existantes.

| Émoji | Clé | Usage principal |
|---|---|---|
| 🤖 | `basic` | Icône principale du bot (help) |
| 👍 | `thumb` | Succès : confirmations, validations, sauvegardes, créations, logs de succès |
| ⚠️ | `glitch` | Erreurs : exceptions, permissions insuffisantes, problèmes internes, logs d'erreur |
| 🎉 | `party` | Captcha validé, bienvenue, **montée de niveau** |
| ❤️ | `love` | Réputation excellente, **récompense débloquée**, catégories bump/sondages |
| 🤔 | `doubt` | Réputation moyenne, avertissements (logs), surveillance |
| 😠 | `angry` | Sanction (ban/kick), réputation mauvaise, captcha échoué, modération |
| 😢 | `crying` | Sanction (mute/timeout), échec de captcha |
| 😉 | `wink` | Tickets, formulaires |
| 😄 | `happy` | Rôles réactions, salons vocaux |
| 😴 | `sleepy` | Rappels |
| 😲 | `shocked` | Réservé (extensible) |

- **Formes** : `emojis.thumb` / `emojis.get('thumb')` (chaîne, pour texte et
  descriptions d'embeds) ; `emojis.component('thumb')` (pour `setEmoji` des
  boutons et menus) ; `emojis.fallback('thumb')` (secours Unicode seul).
- **Secours automatique** : chaque émoji déclare un équivalent **Unicode**. Au
  démarrage (`events/emoji/ready.js` → `syncAvailability`), le bot vérifie quels
  émojis personnalisés existent réellement ; si l'un a été supprimé, toutes les
  résolutions basculent **automatiquement** sur l'Unicode, sans changement de
  code.
- **Intégration** : les constructeurs partagés `successEmbed`/`errorEmbed`
  utilisent `thumb`/`glitch` par défaut (override via `{ emoji }`), ce qui
  applique la charte à **tous** les succès et erreurs du projet ; sont aussi
  câblés le help (icône + émoji par catégorie), le captcha, la réputation, les
  niveaux, les sanctions et les logs de commandes.

## Système de logs

Le système de logs se limite à **sept catégories fixes**, réellement utiles à
la modération et à l'administration, activables/désactivables indépendamment et
persistées par serveur (`database/data/logSettings.json`). Il n'est **pas**
possible de créer d'autres catégories sans modifier le code.

| Clé | Contenu | Salon |
|---|---|---|
| `moderation` | Kick, ban, unban, mute, unmute, timeout, retrait de timeout, suppressions massives, renommage de salons, commandes de modération | `#moderation-logs` |
| `sanctions` | Warns, retrait/remise à zéro, évolution de la réputation globale, sanctions automatiques | `#sanctions-logs` |
| `members` | Arrivée, départ volontaire, expulsion, bannissement, validation et échec du captcha (pseudo, ID, création du compte, ancienneté, nombre de membres) | `#members-logs` |
| `roles` | Ajout/retrait de rôle, rôles réactions, rôles automatiques | `#roles-logs` |
| `tickets` | Ouverture, fermeture, suppression, transfert, attribution, renommage, transcript | `#tickets-logs` |
| `watch` | Surveillance : lancement, arrêt, expiration automatique, reprise, statistiques | `#watch-logs` |
| `protections` | Détection de spam/raid/liens/bots, mode urgence, événements captcha, actions automatiques | `#protection-logs` |

**Commandes** (Gérer le serveur) :

| Commande | Rôle |
|---|---|
| `logs` | Panneau interactif (menu de catégories + boutons) |
| `logs setup` | Crée la catégorie « Logs » et les sept salons (réutilise l'existant), active tout |
| `logs status` | État détaillé : catégorie, état, salon, **date et auteur** de la dernière modification |
| `logs enable <catégories\|tout>` | Active une, plusieurs, ou toutes les catégories |
| `logs disable <catégories\|tout>` | Désactive une, plusieurs, ou toutes les catégories |

À l'activation (ou `logs setup`), le bot **crée automatiquement** la catégorie
Discord `📁 Logs` et les salons manquants (privés : invisibles pour
`@everyone`) ; les salons existants sont **réutilisés** — jamais de doublon.
La désactivation conserve les salons.

**Migration automatique** : au démarrage, les serveurs configurés avec l'ancien
système (nombreuses catégories) sont migrés vers ces sept catégories
(`services/logs/logMigration`) — les anciennes clés sont fusionnées vers leur
nouvelle catégorie (table `LEGACY_ALIASES` de `services/logs/logService`), les
catégories obsolètes supprimées, l'état et les salons conservés. Opération
idempotente.

### Ajouter une catégorie de logs

Le système est volontairement **fermé** : ajouter une catégorie impose une
modification explicite du code.

1. Ajouter une entrée dans `utils/constants/logCategories.js` (label,
   description, nom de salon, émoji).
2. Router les événements concernés via `logService.log(guild, '<clé>', embed)`
   (embed construit avec `logEventEmbed`). Les anciennes clés sont routées vers
   les sept catégories par `LEGACY_ALIASES`.

## Logs d'erreurs internes du bot

Système **distinct** des logs de serveur : il journalise les erreurs internes
du bot (fonctionnement technique), et non l'activité d'un serveur.

- **Accès restreint** : les logs ne sont envoyés que sur un **unique serveur
  privé**, identifié par `ERROR_GUILD_ID` (`.env`). Aucun autre serveur n'y a
  accès et aucune commande ne les expose.
- **Démarrage automatique** : au lancement, le bot récupère le serveur
  `ERROR_GUILD_ID`, crée si besoin une **catégorie dédiée** et le salon
  **`#bot-errors`** (réutilise l'existant), puis y publie les erreurs.
- **Erreurs capturées** : erreurs de commandes, promesses rejetées non gérées
  (`unhandledRejection`), exceptions non capturées (`uncaughtException`),
  erreurs de l'API Discord (`error`), erreurs WebSocket (`shardError`) — les
  erreurs de base de données et de synchronisation remontent via ces
  gestionnaires globaux.
- **Contenu de chaque log** (embed lisible) : type d'erreur, date, serveur,
  salon, utilisateur, commande, module responsable et pile d'erreurs.
- **Robustesse** : la journalisation échoue silencieusement et ne peut jamais
  provoquer d'erreur en cascade (`services/errors/errorLogService`).

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

## Interface web (tableau de bord)

Tableau de bord officiel de NaoBot, **entièrement séparé de la logique
Discord** (`web/` + `services/web/`) et **sans dépendance externe** (module
`http` natif, SSE pour le temps réel, OAuth2 via `fetch`). **Désactivée par
défaut** : elle ne démarre que si `WEB_ENABLED=true` et que la configuration
OAuth2 est complète.

- **Sections** : tableau de bord (serveurs, utilisateurs, tickets, bumps, état
  du bot), serveurs (**préfixe du serveur**, protections, tickets, rôles
  réactions, formulaires, sauvegardes, réputation…), modération (warns,
  statistiques), tickets
  (ouverts / fermés / catégories), vocaux temporaires (générateurs, salons
  actifs, statistiques), captcha (état, statistiques), **anti-publicité**
  (état, salons exemptés, statistiques, dernières détections), réputation
  globale (score, statistiques, historique ; pondérations pour les owners),
  **dossiers membres** (consultation, recherche, filtrage des notes,
  statistiques — owners uniquement), profils
  (réputation, warns, historique ; badges et succès à venir). Interface
  **responsive**.
- **Temps réel** : flux **SSE** (équivalent WebSocket) — statistiques
  poussées en continu et journal web en direct (owners).
- **Authentification Discord OAuth2** (scopes `identify`, `guilds`) : bouton
  « Se connecter avec Discord » → `/login` (redirection vers Discord avec un
  `state` anti-CSRF) → retour sur l'URI de redirection → échange du code contre
  un jeton (`fetch`) → **vérification que le compte est un owner du bot** →
  **session signée** (cookie HMAC, en mémoire, TTL 24 h) ; `/logout` détruit la
  session.
- **Accès strictement réservé aux owners du bot** : l'owner principal (`.env`)
  et les owners secondaires (base de données). Toute autre connexion est
  **refusée** dès le callback (aucune session créée, page d'**accès refusé**).
  **Toutes** les routes backend le vérifient — API REST, flux temps réel (SSE)
  et frontend : impossible de contourner le frontend, d'appeler l'API ou le
  WebSocket sans être owner. Les administrateurs de serveurs n'ont plus accès.
  Les endpoints d'administration (écriture) restent non exposés (lecture seule).
- **Modules** : `web/frontend` (dashboard statique), `web/backend` (serveur
  HTTP + tunnel OAuth2), `web/api` (API REST), `web/websocket` (hub SSE),
  `services/web` (`webService` = pont de données, `webAuth` = OAuth2 +
  permissions, `webLog` = journal). Catégorie de logs dédiée `web`.
- **Configuration** (statique, `.env` uniquement — jamais de config dynamique
  de serveur) : `WEB_ENABLED`, `WEB_PORT`, `WEB_URL`, `DISCORD_CLIENT_ID`,
  `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `WEB_SESSION_SECRET`.
  L'**URI de redirection** (`DISCORD_REDIRECT_URI`, défaut `<WEB_URL>/callback`)
  doit être déclarée **à l'identique** dans le portail Discord
  (*OAuth2 → Redirects*) ; elle est affichée dans la console au démarrage.

## Architecture

> 📘 Le fichier [`CLAUDE.md`](CLAUDE.md) est la référence permanente des
> règles d'architecture et de développement du projet : à lire avant toute
> modification (humain ou agent IA).

```
/
├── commands/            # Définition des commandes (1 fichier = 1 fonctionnalité,
│   ├── administration/  # les familles proches partagent un fichier : ban+unban…)
│   ├── logs/            #   logs (enable/disable/setup/status + panneau — 7 catégories)
│   ├── bump/            #   bumpenable, bump, bumpcount+bumpunicount
│   ├── fun/             #   8ball, coinflip, dice, rps
│   ├── moderation/
│   ├── owner/           #   addowner+rmowner, serveurs, rep, leave, serverban…
│   ├── tickets/         #   ticketcategory, ticketpanel, ticket (info+composants), ticketManage (cycle de vie), ticketstats
│   ├── reactionRoles/   #   reactionrole (assistant + composants live)
│   ├── contact/         #   contactowner, respond, contactlist+contactinfo
│   ├── protections/     #   antispam+antilink+antibot, protections (tableau de bord)
│   ├── antipub/         #   antipub (on/off/status/whitelist — invitations Discord)
│   ├── antisensitive/   #   antisensitive (on/off/status/whitelist — sites sensibles)
│   ├── emergency/       #   urgence (verrouillage on/off/status)
│   ├── welcome/         #   setwelcome, welcomestatus+welcomepreview
│   ├── backup/          #   backup (create/load/delete/list)
│   ├── forms/           #   form (create/edit/delete/list + remplissage)
│   ├── reminders/       #   remind, remindlist+reminddelete+remindedit
│   ├── polls/           #   poll (assistant + vote), pollclose+pollresults+polllist
│   ├── temporaryVoice/  #   voicecreate+voiceedit+voicelist+voicedelete, renamevoice
│   ├── captcha/         #   captcha (enable/disable/status/setup/delete + vérification)
│   ├── levels/          #   rank+level, leaderboard, levelconfig
│   ├── reputation/      #   reputation+globalprofile, globalrepstats+userhistory+repconfig
│   ├── memberFiles/     #   file+fileinfo+filelist+filedelete (dossiers membres globaux)
│   ├── watch/           #   watch+stopwatch, watchtimeuser+watchserveurs
│   ├── snipe/           #   snipe+editsnipe+membersnipe+rolesnipe+sanctionsnipe+ticketsnipe+protectionsnipe
│   ├── dm/              #   servers (sélection de serveur en messages privés)
│   └── utility/         #   help, ping, botinfo+uptime, serverinfo, userinfo…
├── events/              # Écouteurs d'événements Discord
│   ├── client/          #   ready (enregistrement des commandes slash)
│   ├── logs/            #   ready (migration auto vers les 7 catégories)
│   ├── errors/          #   ready (init des logs d'erreurs internes du bot)
│   ├── guild/           #   logs des salons et du serveur
│   ├── interaction/     #   interactionCreate (slash + composants interactifs)
│   ├── member/          #   logs des arrivées/départs et des rôles
│   ├── message/         #   messageCreate (préfixe) + logs des messages
│   ├── dm/              #   directMessage (commandes préfixées en messages privés)
│   ├── reactionRoles/   #   ready (panneaux persistés opérationnels)
│   ├── contact/         #   ready (conversations de contact persistées)
│   ├── protections/     #   messageProtection (spam/link), botJoinProtection
│   ├── antipub/         #   messageAntipub (création + modification de messages)
│   ├── antisensitive/   #   messageAntisensitive (création + modification)
│   ├── emergency/       #   channelLock (verrouillage des nouveaux salons)
│   ├── welcome/         #   memberJoin (carte, rôles auto, MP, questions)
│   ├── backup/          #   ready (sauvegardes disponibles)
│   ├── forms/           #   ready (formulaires actifs)
│   ├── reminders/       #   ready (planificateur des rappels dus)
│   ├── polls/           #   ready (fermeture des sondages expirés)
│   ├── tickets/         #   ready (planificateur), activity (anti-inactivité)
│   ├── captcha/         #   memberJoin (envoi du captcha) + ready (expiration)
│   ├── messageActivity/ #   messageXp (XP par message : cooldown, longueur, anti-répétition)
│   ├── voiceActivity/   #   voiceXp (XP vocal : sessions persistées, flush, reprise)
│   ├── reputation/      #   guildBan (capture des bans → réputation globale)
│   ├── audit/           #   ready (audit de parité slash/préfixe + avertissements)
│   ├── emoji/           #   ready (disponibilité des émojis officiels + secours Unicode)
│   ├── memberFiles/     #   ready (dossiers membres globaux disponibles)
│   ├── snipe/           #   messageSnipe + memberSnipe (capture) + ready (purge auto)
│   ├── web/             #   ready (démarre l'interface web si activée)
│   └── temporaryVoice/  #   voiceStateUpdate (create/delete) + ready (nettoyage)
├── services/            # Logique métier, partagée par slash et préfixe
│   ├── moderation/      #   banService, kickService, muteService, timeoutService…
│   ├── logs/            #   logService (7 catégories + alias) + modLogService + logMigration
│   ├── owners/          #   ownerService (owners globaux + rôle décoratif)
│   ├── reputation/      #   reputationService (serveurs) + globalReputationService (utilisateurs, inter-serveurs)
│   ├── tracking/        #   guildStatsService, ownerNotifier (arrivées/départs)
│   ├── bump/            #   bumpService (bump inter-serveurs)
│   ├── serverManagement/#   départ manuel, liste noire globale, journal owner
│   ├── tickets/         #   ticketService (cycle de vie, planificateur) + transcriptService
│   ├── ticketCategories/#   ticketCategoryService + ticketCategoryWizard (catégories)
│   ├── ticketPanels/    #   ticketPanelService + ticketPanelWizard (panneaux)
│   ├── watch/           #   watchService (surveillance de modération, 7 j max)
│   ├── warnings/        #   warnService + sanctionService (sanctions progressives)
│   ├── errors/          #   errorLogService (logs d'erreurs internes → #bot-errors)
│   ├── prefix/          #   prefixService (préfixe personnalisable par serveur)
│   ├── snipe/           #   snipeService (capture, requêtes filtrées, purge auto)
│   ├── directMessages/  #   dmService (compatibilité DM + sélection de serveur)
│   ├── reactionRoles/   #   reactionRoleService + reactionRoleWizard (assistant)
│   ├── contact/         #   contactService (communication owners ↔ propriétaires)
│   ├── protections/     #   protectionService (état, stats, logs partagés)
│   ├── antispam/        #   antispamService (moteur de détection)
│   ├── antilink/        #   antilinkService (moteur de détection)
│   ├── antibot/         #   antibotService (arrivées de bots, raids)
│   ├── antipub/         #   antipubService (invitations Discord, indépendant)
│   ├── antisensitive/   #   antisensitiveService (sites sensibles, indépendant)
│   ├── emergency/       #   emergencyService (verrouillage/restauration)
│   ├── welcome/         #   welcomeService + welcomeCardService (modèles)
│   ├── backup/          #   backupService + botConfigBackup (structure + config)
│   ├── forms/           #   formService + formWizard (questions, soumissions)
│   ├── reminders/       #   reminderService (planificateur, envoi en MP)
│   ├── polls/           #   pollService + pollWizard (votes, modes, résultats)
│   ├── audit/           #   commandParityService (audit de parité slash/préfixe)
│   ├── web/             #   webService (données) + webAuth (OAuth2) + webLog
│   ├── temporaryVoice/  #   tempVoiceService (cycle de vie) + tempVoiceWizard
│   ├── captcha/         #   captchaService (vérification) + captchaWizard
│   └── levels/          #   levelService (courbe XP, montées de niveau, récompenses)
├── web/                 # Interface web (séparée de la logique Discord)
│   ├── frontend/        #   dashboard statique responsive (HTML/CSS/JS)
│   ├── backend/         #   serveur HTTP natif + tunnel OAuth2
│   ├── api/             #   API REST (JSON, lecture seule)
│   └── websocket/       #   hub temps réel SSE (équivalent WebSocket)
├── middlewares/
│   ├── permissions/     # Permissions auteur/bot, hiérarchie des rôles, owners
│   ├── logs/            # Accès à la configuration des logs (Gérer le serveur)
│   ├── cooldowns/       # Anti-spam par utilisateur et par commande
│   ├── moderation/      # Garde des warns (cible valide + hiérarchie)
│   ├── tickets/         # Admin (config) + accès ticket (créateur / assigné / équipe)
│   ├── watch/           # Accès à la surveillance (admin / modérateur / owner)
│   ├── snipe/           # Accès au snipe (admin / modérateur / owner)
│   ├── dm/              # Compatibilité DM (commande directe ou serveur requis)
│   ├── reactionRoles/   # Sécurité d'attribution des rôles (hiérarchie du bot)
│   ├── contact/         # Accès au contact (propriétaire du serveur)
│   ├── protections/     # Exemptions (bot, admin, hiérarchie) + permissions bot
│   ├── antipub/         # Accès config (admin) + exemptions (salons/rôles/membres)
│   ├── antisensitive/   # Accès config (admin) + exemptions (salons/rôles/membres)
│   ├── emergency/       # Accès mode urgence (admin / propriétaire / owner)
│   ├── backup/          # Accès sauvegardes (administrateur)
│   ├── forms/           # Gestion (Gérer le serveur) + accès au remplissage
│   ├── reminders/       # Appartenance d'un rappel (auteur uniquement)
│   ├── polls/           # Gestion des sondages (créateur ou gestionnaire)
│   ├── temporaryVoice/  # Admin (config) + propriétaire d'un salon temporaire
│   ├── captcha/         # Admin (config du captcha)
│   ├── levels/          # Admin (levelconfig) + éligibilité XP (exclusions)
│   ├── reputation/      # Confidentialité de la réputation globale (self/admin/owner)
│   └── memberFiles/     # Accès aux dossiers (ajout/consultation/suppression)
├── utils/
│   ├── constants/       # Couleurs, limites, catégories (commandes et logs)…
│   ├── helpers/         # Contexte unifié, parseur d'arguments, loaders, i18n…
│   └── embeds/          # Constructeurs d'embeds homogènes (charte graphique)
├── config/              # Configuration (env), permissions par commande, émojis officiels
├── database/            # Persistance (JSON) : warns (+ échelle), logs, owners, stats, bumps, dossiers membres…
├── locales/             # Textes utilisateur (fr.json)
├── scripts/             # Utilitaires hors ligne (checkCommandParity.js → npm run audit)
├── .githooks/           # Hooks Git versionnés (pre-commit : parité slash/préfixe)
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

### Parité slash / préfixe garantie (audit)

Comme une commande est un **objet unique** (un seul schéma `args`, un seul
`execute`), chaque commande existe **automatiquement** en slash **et** en
préfixe : il n'y a jamais de « version slash » et de « version préfixe »
séparées à maintenir (ce serait de la duplication). Un **audit intégré**
(`services/audit/commandParityService.js`) garantit cette parité en détectant
les rares défauts qui casseraient un mode :

- **définition slash invalide** (nom non minuscule / avec espace, description
  manquante ou trop longue, **argument requis après un optionnel**, plus de 25
  arguments, alias en collision avec un nom de commande…) ;
- **comportement propre à l'interaction dans `execute`** — un `showModal` ne
  peut venir que d'une interaction, il reste donc réservé à `handleComponent`
  (réponse à un bouton/menu), jamais à `execute` (qui doit fonctionner en
  préfixe).

Points d'accès :

| Usage | Détail |
|---|---|
| `commandaudit` (owner) | `/commandaudit` = `!commandaudit` : statistiques (total, compatibles slash, compatibles préfixe, parité complète), incohérences restantes et date du dernier audit |
| `npm run audit` | Rapport en console ; **sort en erreur** s'il reste une incohérence critique |
| `.githooks/pre-commit` | **Bloque le commit** en cas d'incohérence critique (activer une fois : `git config core.hooksPath .githooks`) |
| Démarrage | `events/audit/ready.js` rejoue l'audit et **avertit** en console (détection des nouvelles commandes) |
| `npm test` | `tests/commandParity.test.js` échoue si une commande casse la parité |

L'audit a d'ailleurs corrigé trois alias morts (des alias qui reprenaient le
nom d'une autre commande — `serveurs`/`servers` croisés et `rep`→`reputation` —
et n'étaient donc jamais résolus).

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
npm test        # tests unitaires (node:test)
npm run audit   # audit de parité slash / préfixe (bloquant si incohérence critique)
```

Tests unitaires avec le runner natif de Node (`node:test`) : parseur de
durées, stockage JSON, i18n, **audit de parité slash/préfixe** (règles
unitaires + garde-fou du projet). L'audit est aussi disponible en hook Git
(`.githooks/pre-commit`, activé via `git config core.hooksPath .githooks`).
