/**
 * Page **Réglages** : état de l'interface et du bot, owners déclarés, outils de
 * consultation globaux (réputation, dossiers membres) et serveurs sur liste
 * noire.
 *
 * En lecture seule : la configuration se fait par les commandes Discord et le
 * `.env` — l'interface ne crée pas un second chemin de configuration.
 */
import { el, replace, api, card, kv, table, toolbar, input, button, notice, errorText, fmtNumber, fmtDate } from '../lib/ui.js';

let containerRef = null;

/** Outil : consultation de la réputation globale d'un utilisateur. */
function reputationTool() {
  const field = input({ placeholder: 'Identifiant utilisateur' });
  const output = el('div', {});
  const load = async () => {
    const target = field.value.trim();
    if (!target) return replace(output, notice('Indiquez un identifiant utilisateur.'));
    replace(output, notice('Chargement…'));
    try {
      const profile = await api(`/api/reputation/${encodeURIComponent(target)}`);
      return replace(
        output,
        kv([
          ['Score', `${profile.score}/100`],
          ['Confiance', `${profile.level?.emoji ?? ''} ${profile.level?.label ?? '—'}`],
          ['Warns', fmtNumber(profile.stats?.warns ?? 0)], ['Timeouts', fmtNumber(profile.stats?.timeouts ?? 0)],
          ['Kicks', fmtNumber(profile.stats?.kicks ?? 0)], ['Bans', fmtNumber(profile.stats?.bans ?? 0)],
          ['Serveurs', fmtNumber(profile.guildsCount ?? 0)],
        ]),
        table(
          ['Action', 'Serveur', 'Date', 'Score'],
          (profile.history ?? []).slice(-15).reverse().map((h) => [h.action, h.guildId ?? '—', fmtDate(h.date), `${h.scoreBefore}→${h.scoreAfter}`]),
        ),
      );
    } catch (error) {
      return replace(output, notice(errorText(error)));
    }
  };
  return card('Réputation globale', toolbar(field, button('Consulter', load)), output);
}

/** Outil : consultation d'un dossier membre global (inter-serveurs). */
function memberFileTool() {
  const field = input({ placeholder: 'Identifiant utilisateur' });
  const filter = input({ placeholder: 'Filtrer les notes…' });
  const output = el('div', {});
  let cache = null;

  const draw = () => {
    if (!cache) return;
    const needle = filter.value.trim().toLowerCase();
    const notes = needle
      ? cache.notes.filter((n) => `${n.content} ${n.guildName ?? ''} ${n.authorTag ?? ''}`.toLowerCase().includes(needle))
      : cache.notes;
    replace(
      output,
      kv([
        ['Réputation', `${cache.rep?.score ?? '—'}/100`],
        ['Warns', fmtNumber(cache.totalWarns)], ['Sanctions', fmtNumber(cache.totalSanctions)],
        ['Notes', fmtNumber(cache.noteCount)], ['Serveurs concernés', fmtNumber(cache.guildsCount)],
      ]),
      table(['ID', 'Contenu', 'Auteur', 'Serveur', 'Date'], notes.map((n) => [n.id, n.content, n.authorTag || n.authorId, n.guildName || n.guildId || '—', fmtDate(n.createdAt)]), { empty: 'Aucune note.' }),
    );
  };
  filter.addEventListener('input', draw);

  const load = async () => {
    const target = field.value.trim();
    if (!target) return replace(output, notice('Indiquez un identifiant utilisateur.'));
    replace(output, notice('Chargement…'));
    try {
      cache = await api(`/api/files/${encodeURIComponent(target)}`);
      return draw();
    } catch (error) {
      return replace(output, notice(errorText(error)));
    }
  };
  return card('Dossier membre global', toolbar(field, button('Consulter', load), filter), output);
}

export default {
  id: 'settings',
  label: 'Réglages',
  icon: '⚙️',
  order: 60,

  async render(container) {
    containerRef = container;
    try {
      const [settings, banned] = await Promise.all([api('/api/settings'), api('/api/settings/banned-guilds').catch(() => ({ guilds: [] }))]);

      replace(
        container,
        card('Bot', kv([
          ['Version', settings.bot.version], ['Compte', settings.bot.tag ?? '—'],
          ['Préfixe par défaut', settings.bot.defaultPrefix], ['Langue', settings.bot.locale],
          ['Commandes chargées', fmtNumber(settings.bot.commands)],
        ])),
        card('Interface web', kv([
          ['État', settings.web.enabled ? '🟢 activée' : '🔴 désactivée'],
          ['URL', settings.web.baseUrl],
          ['OAuth2 configuré', settings.web.oauthConfigured ? '✅' : '❌'],
          ['Clients temps réel connectés', fmtNumber(settings.web.realtimeClients)],
          ['Accès', 'Owners du bot uniquement'],
        ])),
        card('Owners', kv([
          ['Owner principal', settings.owners.primary ?? '—'],
          ['Total', fmtNumber(settings.owners.total)],
          ['Identifiants', settings.owners.ids.join(', ') || '—'],
        ])),
        card('Logs d’erreurs internes', kv([
          ['Configuré', settings.errorLogging.configured ? '✅' : '❌ (ERROR_GUILD_ID non défini)'],
          ['Serveur dédié', settings.errorLogging.guildId ?? '—'],
        ])),
        card('Serveurs sur liste noire', table(['Serveur', 'Raison', 'Par', 'Date'], (banned.guilds ?? []).map((g) => [g.name ?? g.id, g.reason ?? '—', g.bannedBy ?? '—', fmtDate(g.bannedAt)]), { empty: 'Aucun serveur banni.' })),
        reputationTool(),
        memberFileTool(),
      );
    } catch (error) {
      replace(container, notice(errorText(error)));
    }
  },
};
