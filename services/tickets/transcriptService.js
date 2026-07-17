/**
 * Transcripts de tickets : capture des messages d'un salon de ticket avant
 * sa fermeture/suppression, puis rendu en plusieurs formats.
 *
 * **Extensible** : les formats sont déclarés dans FORMATTERS ; ajouter un
 * format (ex. PDF dans une future version) = ajouter une entrée, sans toucher
 * aux appelants. La capture est bornée pour rester sûre sur les gros salons.
 */
const { AttachmentBuilder } = require('discord.js');

const MAX_MESSAGES = 2000;
const FETCH_BATCH = 100;

/** Récupère les messages du salon (ordre chronologique, borné). */
async function collectMessages(channel) {
  const collected = [];
  let before;
  while (collected.length < MAX_MESSAGES) {
    const batch = await channel.messages.fetch({ limit: FETCH_BATCH, before }).catch(() => null);
    if (!batch || batch.size === 0) break;
    collected.push(...batch.values());
    before = batch.last().id;
    if (batch.size < FETCH_BATCH) break;
  }
  return collected
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((message) => ({
      id: message.id,
      author: message.author?.tag ?? 'Inconnu',
      authorId: message.author?.id ?? null,
      bot: Boolean(message.author?.bot),
      timestamp: message.createdTimestamp,
      content: message.content ?? '',
      attachments: [...message.attachments.values()].map((attachment) => ({ name: attachment.name, url: attachment.url })),
      embeds: message.embeds.length,
    }));
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderText(ticket, header, messages) {
  const lines = [
    `=== Transcript — ${header.channelName} ===`,
    `Catégorie : ${header.categoryName}`,
    `Créateur : ${header.creatorTag} (${ticket.userId})`,
    `Ouvert le : ${new Date(ticket.createdAt).toISOString()}`,
    `Messages : ${messages.length}`,
    '',
  ];
  for (const message of messages) {
    const time = new Date(message.timestamp).toISOString();
    lines.push(`[${time}] ${message.author}${message.bot ? ' (bot)' : ''}: ${message.content}`);
    for (const attachment of message.attachments) lines.push(`    ↳ pièce jointe : ${attachment.name} (${attachment.url})`);
    if (message.embeds > 0) lines.push(`    ↳ ${message.embeds} embed(s)`);
  }
  return lines.join('\n');
}

function renderHtml(ticket, header, messages) {
  const rows = messages
    .map((message) => {
      const time = new Date(message.timestamp).toLocaleString('fr-FR');
      const attachments = message.attachments
        .map((attachment) => `<div class="att"><a href="${escapeHtml(attachment.url)}">📎 ${escapeHtml(attachment.name)}</a></div>`)
        .join('');
      const content = escapeHtml(message.content).replace(/\n/g, '<br>');
      return `<div class="msg"><span class="time">${escapeHtml(time)}</span><span class="author${message.bot ? ' bot' : ''}">${escapeHtml(message.author)}</span><div class="content">${content}</div>${attachments}${message.embeds ? `<div class="att">${message.embeds} embed(s)</div>` : ''}</div>`;
    })
    .join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Transcript — ${escapeHtml(header.channelName)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#313338;color:#dbdee1;margin:0;padding:24px}
h1{color:#fff;font-size:20px}.meta{color:#b5bac1;font-size:13px;margin-bottom:16px}
.msg{padding:8px 12px;border-left:3px solid #4f545c;margin:6px 0;background:#2b2d31;border-radius:4px}
.time{color:#949ba4;font-size:11px;margin-right:8px}.author{color:#f2f3f5;font-weight:600}.author.bot{color:#5865f2}
.content{margin-top:2px;white-space:pre-wrap;word-wrap:break-word}.att{font-size:12px;margin-top:4px}.att a{color:#00a8fc}</style></head>
<body><h1>🎫 Transcript — ${escapeHtml(header.channelName)}</h1>
<div class="meta">Catégorie : ${escapeHtml(header.categoryName)} • Créateur : ${escapeHtml(header.creatorTag)} • ${messages.length} message(s)</div>
${rows}</body></html>`;
}

/** Formats disponibles (extensible : PDF, JSON… à ajouter ici). */
const FORMATTERS = {
  txt: { extension: 'txt', render: renderText },
  html: { extension: 'html', render: renderHtml },
};

/**
 * Génère le transcript d'un ticket dans les formats demandés.
 * @returns {Promise<{ count: number, attachments: AttachmentBuilder[] }>}
 */
async function generate(channel, ticket, header, formats = ['html', 'txt']) {
  const messages = await collectMessages(channel);
  const base = `transcript-${header.channelName}`.slice(0, 80);
  const attachments = formats
    .filter((format) => FORMATTERS[format])
    .map((format) => {
      const { extension, render } = FORMATTERS[format];
      const content = render(ticket, header, messages);
      return new AttachmentBuilder(Buffer.from(content, 'utf8'), { name: `${base}.${extension}` });
    });
  return { count: messages.length, attachments };
}

module.exports = { generate, collectMessages, FORMATTERS, MAX_MESSAGES };
