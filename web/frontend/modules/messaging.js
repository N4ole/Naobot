/**
 * Page **Messagerie** : conversations entre les owners du bot et les
 * propriétaires des serveurs, présentées comme une véritable messagerie
 * (liste + fil de discussion + composeur).
 *
 * Les messages partent **par le bot** : le compte Discord de l'owner n'est
 * jamais exposé. Les réponses envoyées depuis Discord (`contactowner`)
 * apparaissent automatiquement ici, les deux chemins partageant le même
 * service métier.
 */
import { $, el, replace, api, card, toolbar, input, button, select, pager, notice, errorText, fmtDate, fmtBytes, toast } from '../lib/ui.js';

const state = { page: 1, filters: {}, selected: null, statuses: {} };
let containerRef = null;

/** Lit un fichier en base64 (transféré tel quel au propriétaire par le bot). */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: String(reader.result).split(',')[1] });
    reader.onerror = () => reject(new Error('read_error'));
    reader.readAsDataURL(file);
  });
}

// --- Liste des conversations ------------------------------------------------

function conversationItem(conversation) {
  const item = el('div', { className: `conv-item${state.selected === conversation.id ? ' active' : ''}` }, [
    el('div', { className: 'conv-head' }, [
      el('strong', {}, conversation.guildName ?? conversation.guildId),
      el('span', { className: 'muted small' }, conversation.statusLabel ?? conversation.status),
    ]),
    // Poste occupé par l'auteur : un owner sait à quel titre le membre écrit.
    el('div', { className: 'muted small' }, `${conversation.ownerName} · ${conversation.positionLabel} · ${fmtDate(conversation.lastActivityAt)}`),
    conversation.lastMessage
      ? el('div', { className: 'conv-preview' }, [
          el('span', { className: `tag tag-${conversation.lastMessage.from}` }, conversation.lastMessage.from === 'owner' ? conversation.positionLabel : 'équipe'),
          conversation.lastMessage.preview,
        ])
      : null,
    conversation.unreadFromOwner ? el('span', { className: 'pill-alert' }, 'en attente de réponse') : null,
  ]);
  item.addEventListener('click', () => { state.selected = conversation.id; refresh(); });
  return item;
}

function filterBar() {
  const search = input({ placeholder: 'Rechercher (serveur, propriétaire, contenu)…', value: state.filters.q ?? '' });
  search.addEventListener('change', (e) => { state.filters.q = e.target.value.trim() || undefined; state.page = 1; refresh(); });

  const statuses = [{ value: '', label: 'Tous les statuts' }, ...Object.entries(state.statuses).map(([key, def]) => ({ value: key, label: def.label ?? key }))];
  return toolbar(
    search,
    select(statuses, { value: state.filters.status ?? '', onChange: (value) => { state.filters.status = value || undefined; state.page = 1; refresh(); } }),
    button('Nouveau message', () => { state.selected = 'new'; refresh(); }, 'btn btn-primary'),
  );
}

// --- Fil de discussion ------------------------------------------------------

function messageBubble(message) {
  const mine = message.from === 'botOwner';
  return el('div', { className: `bubble ${mine ? 'mine' : 'theirs'}` }, [
    el('div', { className: 'bubble-head' }, [
      el('strong', {}, mine ? `Équipe NaoBot — ${message.author}` : message.author),
      el('span', { className: 'muted small' }, fmtDate(message.at)),
    ]),
    message.title ? el('div', { className: 'bubble-title' }, message.title) : null,
    el('div', { className: 'bubble-body' }, message.content),
    message.attachment ? el('div', { className: 'muted small' }, `📎 ${message.attachment.name} (${fmtBytes(message.attachment.size)})`) : null,
  ]);
}

/** Composeur : titre, message, pièce jointe. Réutilisé pour l'envoi et la réponse. */
function composer({ guildId, conversationId, guilds }) {
  const title = input({ placeholder: 'Titre du message', maxLength: 240 });
  const message = el('textarea', { className: 'input textarea', placeholder: 'Votre message…', rows: 6, maxLength: 4000 });
  const file = el('input', { className: 'input', type: 'file' });
  const guildSelect = guilds
    ? select([{ value: '', label: '— Serveur destinataire —' }, ...guilds.map((g) => ({ value: g.id, label: g.name }))])
    : null;

  const send = button('Envoyer', async () => {
    const target = guildSelect ? guildSelect.value : guildId;
    if (!target) return toast('Choisissez un serveur destinataire.', 'error');
    if (!title.value.trim()) return toast('Le titre est obligatoire.', 'error');
    if (!message.value.trim()) return toast('Le message est obligatoire.', 'error');

    send.disabled = true;
    try {
      const attachment = file.files?.[0] ? await readFileAsBase64(file.files[0]) : undefined;
      const result = await api('/api/messaging/send', {
        method: 'POST',
        body: { guildId: target, title: title.value.trim(), message: message.value.trim(), attachment, conversationId },
      });
      toast('Message envoyé au propriétaire du serveur.', 'success');
      state.selected = result.conversationId;
      refresh();
    } catch (error) {
      const messages = {
        dmClosed: "Le propriétaire n'accepte pas les messages privés du bot.",
        ownerUnreachable: 'Propriétaire du serveur introuvable.',
        guildNotFound: 'Serveur introuvable.',
        attachmentTooLarge: 'Pièce jointe trop volumineuse (8 Mo maximum).',
      };
      toast(messages[error.error] ?? errorText(error), 'error');
    } finally {
      send.disabled = false;
    }
    return undefined;
  }, 'btn btn-primary');

  return el('div', { className: 'composer' }, [guildSelect, title, message, el('label', { className: 'muted small' }, 'Pièce jointe (optionnelle, 8 Mo max)'), file, send]);
}

async function renderThread(pane) {
  if (state.selected === 'new') {
    return replace(pane, card('Nouveau message officiel', composer({ guilds: window.__naoGuilds ?? [] })));
  }
  if (!state.selected) return replace(pane, notice('Sélectionnez une conversation, ou composez un nouveau message.'));

  try {
    const conversation = await api(`/api/messaging/conversations/${encodeURIComponent(state.selected)}`);
    const statusSelect = select(
      Object.entries(state.statuses).map(([key, def]) => ({ value: key, label: def.label ?? key })),
      {
        value: conversation.status,
        onChange: async (value) => {
          try {
            await api(`/api/messaging/conversations/${encodeURIComponent(conversation.id)}/status`, { method: 'POST', body: { status: value } });
            toast('Statut mis à jour.', 'success');
            refresh();
          } catch (error) {
            toast(errorText(error), 'error');
          }
        },
      },
    );

    return replace(
      pane,
      card(
        `${conversation.guildName} — ${conversation.id}`,
        toolbar(el('span', { className: 'muted' }, `Auteur : ${conversation.ownerName} · ${conversation.positionLabel}`), statusSelect),
        el('div', { className: 'thread' }, conversation.messages.map(messageBubble)),
      ),
      card('Répondre', composer({ guildId: conversation.guildId, conversationId: conversation.id })),
    );
  } catch (error) {
    return replace(pane, notice(errorText(error)));
  }
}

async function refresh() {
  if (!containerRef) return;
  try {
    const params = new URLSearchParams({ page: String(state.page) });
    for (const [key, value] of Object.entries(state.filters)) if (value) params.set(key === 'q' ? 'q' : key, value);
    const data = await api(`/api/messaging/conversations?${params.toString()}`);
    state.statuses = data.statuses ?? {};

    const list = el('aside', { className: 'conv-list' }, [
      ...(data.conversations.length ? data.conversations.map(conversationItem) : [notice('Aucune conversation.')]),
      pager(data, (page) => { state.page = page; refresh(); }),
    ]);
    const pane = el('div', { className: 'conv-pane' });

    replace(containerRef, card(null, filterBar()), el('div', { className: 'split' }, [list, pane]));
    await renderThread(pane);
  } catch (error) {
    replace(containerRef, notice(errorText(error)));
  }
}

export default {
  id: 'messaging',
  label: 'Messagerie',
  icon: '✉️',
  order: 50,

  async render(container, ctx) {
    containerRef = container;
    // Les serveurs connus alimentent le sélecteur de destinataire.
    window.__naoGuilds = ctx.state.guilds;
    await refresh();
  },

  /** Un message reçu d'un propriétaire apparaît sans rafraîchissement manuel. */
  onNotify({ event, payload, isCurrent }) {
    if (event === 'notify' && payload.type === 'contactMessage' && isCurrent) refresh();
  },
};
