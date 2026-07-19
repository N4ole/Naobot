/* Tableau de bord NaoBot — logique frontend (vanilla JS, sans dépendance). */
'use strict';

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of [].concat(children)) node.append(child?.nodeType ? child : document.createTextNode(child ?? ''));
  return node;
};
const api = (path) => fetch(path, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
const fmtUptime = (ms) => {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return [d && `${d}j`, h && `${h}h`, m && `${m}min`].filter(Boolean).join(' ') || '< 1min';
};

let state = { me: null, guilds: [] };

function showLogin() {
  $('#login-view').classList.remove('hidden');
  $('#dash-view').classList.add('hidden');
  const params = new URLSearchParams(location.search);
  if (params.get('denied') === '1') {
    $('#login-error').textContent = "Accès refusé : le tableau de bord est réservé aux owners du bot.";
    return;
  }
  const err = params.get('error');
  if (err) $('#login-error').textContent = err === 'auth' ? 'Échec de l’authentification Discord.' : 'Session invalide, réessayez.';
}

function renderUser(me) {
  const area = $('#user-area');
  area.innerHTML = '';
  if (me.user.avatar) area.append(el('img', { src: me.user.avatar, alt: '' }));
  area.append(el('span', {}, me.user.tag + (me.user.botOwner ? ' · owner' : '')));
  area.append(el('a', { className: 'btn btn-ghost', href: '/logout' }, 'Déconnexion'));
}

const STAT_DEFS = [
  { key: 'servers', lbl: 'Serveurs', ico: '🖥️' },
  { key: 'users', lbl: 'Utilisateurs', ico: '👥' },
  { key: 'tickets', lbl: 'Tickets', ico: '🎫' },
  { key: 'bumps', lbl: 'Bumps', ico: '📣' },
];

function renderStats(stats) {
  const grid = $('#stat-grid');
  grid.innerHTML = '';
  for (const def of STAT_DEFS) {
    grid.append(el('div', { className: 'stat' }, [
      el('span', { className: 'ico' }, def.ico),
      el('span', { className: 'val' }, String(stats[def.key] ?? 0)),
      el('span', { className: 'lbl' }, def.lbl),
    ]));
  }
  const st = stats.status || {};
  const row = $('#bot-status');
  row.innerHTML = '';
  row.append(
    el('span', { className: 'pill' }, [el('span', {}, [el('span', { className: `dot ${st.ready ? 'on' : 'off'}` }), st.ready ? 'En ligne' : 'Hors ligne']), el('b', {}, ' ')]),
    el('span', { className: 'pill' }, [el('span', { className: 'muted' }, 'Latence'), el('b', {}, `${st.ping ?? 0} ms`)]),
    el('span', { className: 'pill' }, [el('span', { className: 'muted' }, 'Uptime'), el('b', {}, fmtUptime(st.uptimeMs ?? 0))]),
    el('span', { className: 'pill' }, [el('span', { className: 'muted' }, 'Commandes'), el('b', {}, String(st.commands ?? 0))]),
  );
}

function guildAvatar(g) {
  return g.icon ? el('img', { src: g.icon, alt: '' }) : el('span', { className: 'avatar' }, (g.name || '?').slice(0, 1).toUpperCase());
}

function renderGuildList() {
  const list = $('#guild-list');
  list.innerHTML = '';
  if (state.guilds.length === 0) return list.append(el('p', { className: 'muted' }, 'Aucun serveur administrable.'));
  for (const g of state.guilds) {
    const item = el('div', { className: 'guild-item' }, [guildAvatar(g), el('span', {}, g.name)]);
    item.addEventListener('click', () => {
      document.querySelectorAll('.guild-item').forEach((n) => n.classList.remove('active'));
      item.classList.add('active');
      loadGuildOverview(g.id);
    });
    list.append(item);
  }
}

function kv(items) {
  const wrap = el('div', { className: 'kv' });
  for (const [k, v] of items) wrap.append(el('div', { className: 'item' }, [el('div', { className: 'k' }, k), el('div', { className: 'v' }, String(v))]));
  return wrap;
}

async function loadGuildOverview(id) {
  const detail = $('#guild-detail');
  detail.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    const o = await api(`/api/guilds/${id}/overview`);
    detail.innerHTML = '';
    detail.append(el('h2', {}, o.name));
    detail.append(kv([
      ['Membres', o.members], ['Salons', o.channels], ['Rôles', o.roles],
      ['Préfixe', `${o.prefix?.prefix ?? '!'}${o.prefix?.isCustom ? '' : ' (défaut)'}`],
      ['Tickets ouverts', o.tickets.open], ['Tickets fermés', o.tickets.closed], ['Catégories tickets', o.tickets.categories],
      ['Rôles réactions', o.reactionRoles], ['Formulaires', o.forms], ['Sauvegardes', o.backups],
      ['Vocaux (générateurs)', o.tempVoice?.generators ?? 0], ['Vocaux actifs', o.tempVoice?.active ?? 0],
      ['Captcha', o.captcha?.enabled ? `activé (${o.captcha.type})` : 'désactivé'],
      ['Anti-pub', o.antipub?.enabled ? `activé (${o.antipub.exemptChannels} salon(s) exempté(s))` : 'désactivé'],
      ['Anti-sensible', o.antisensitive?.enabled ? `activé (${o.antisensitive.stats?.detections ?? 0} détection(s))` : 'désactivé'],
      ['Niveaux', o.levels?.enabled ? `activé (${o.levels.ranked} membre(s), ${o.levels.rewards} récompense(s))` : 'désactivé'],
      ['Logs actifs', `${Object.values(o.logs || {}).filter((l) => l && l.enabled).length}/7`],
      ['Réputation', o.reputation?.level ?? o.reputation?.score ?? '—'],
    ]));
  } catch (e) {
    detail.innerHTML = `<p class="muted">Erreur de chargement (${e}).</p>`;
  }
}

function fillGuildSelect(select) {
  select.innerHTML = '';
  select.append(el('option', { value: '' }, '— Choisir un serveur —'));
  for (const g of state.guilds) select.append(el('option', { value: g.id }, g.name));
}

async function loadModeration(id) {
  const box = $('#mod-detail');
  if (!id) return (box.innerHTML = '<p class="muted">Sélectionnez un serveur.</p>');
  box.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    const m = await api(`/api/guilds/${id}/moderation`);
    box.innerHTML = '';
    box.append(kv([['Warns (total)', m.totalWarns], ['Membres avertis', m.warnedUsers]]));
    const table = el('table');
    table.append(el('tr', {}, [el('th', {}, 'Utilisateur'), el('th', {}, 'Raison'), el('th', {}, 'Sanction'), el('th', {}, 'Date')]));
    for (const w of m.recent) {
      table.append(el('tr', {}, [
        el('td', {}, `${w.userId}`), el('td', {}, w.reason || '—'), el('td', {}, w.sanction || '—'),
        el('td', {}, new Date(w.createdAt).toLocaleString('fr-FR')),
      ]));
    }
    box.append(el('h2', {}, 'Derniers warns'), table);
  } catch (e) {
    box.innerHTML = `<p class="muted">Erreur (${e}).</p>`;
  }
}

async function loadTickets(id) {
  const box = $('#tickets-detail');
  if (!id) return (box.innerHTML = '<p class="muted">Sélectionnez un serveur.</p>');
  box.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    const tk = await api(`/api/guilds/${id}/tickets`);
    box.innerHTML = '';
    box.append(kv([['Ouverts', tk.open.length], ['Fermés', tk.closed], ['Catégories', tk.categories.length]]));
    if (tk.categories.length) {
      const table = el('table');
      table.append(el('tr', {}, [el('th', {}, 'Catégorie'), el('th', {}, 'Compteur')]));
      for (const c of tk.categories) table.append(el('tr', {}, [el('td', {}, `${c.emoji || '🎫'} ${c.name}`), el('td', {}, String(c.counter))]));
      box.append(el('h2', {}, 'Catégories'), table);
    }
  } catch (e) {
    box.innerHTML = `<p class="muted">Erreur (${e}).</p>`;
  }
}

async function loadTempVoice(id) {
  const box = $('#voice-detail');
  if (!id) return (box.innerHTML = '<p class="muted">Sélectionnez un serveur.</p>');
  box.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    const v = await api(`/api/guilds/${id}/tempvoice`);
    box.innerHTML = '';
    box.append(kv([['Générateurs', v.generators.length], ['Salons actifs', v.active.length], ['Créés', v.stats.created ?? 0], ['Supprimés', v.stats.deleted ?? 0]]));
    if (v.generators.length) {
      const table = el('table');
      table.append(el('tr', {}, [el('th', {}, 'Générateur'), el('th', {}, 'Format'), el('th', {}, 'Limite'), el('th', {}, 'Créés')]));
      for (const g of v.generators) table.append(el('tr', {}, [el('td', {}, `#${g.channelId}`), el('td', {}, g.nameFormat), el('td', {}, g.userLimit > 0 ? String(g.userLimit) : '∞'), el('td', {}, String(g.counter ?? 0))]));
      box.append(el('h2', {}, 'Générateurs'), table);
    }
    if (v.active.length) {
      const table = el('table');
      table.append(el('tr', {}, [el('th', {}, 'Salon'), el('th', {}, 'Propriétaire'), el('th', {}, 'Créé')]));
      for (const a of v.active) table.append(el('tr', {}, [el('td', {}, a.name), el('td', {}, `${a.ownerId}`), el('td', {}, new Date(a.createdAt).toLocaleString('fr-FR'))]));
      box.append(el('h2', {}, 'Salons actifs'), table);
    }
  } catch (e) {
    box.innerHTML = `<p class="muted">Erreur (${e}).</p>`;
  }
}

async function loadAntipub(id) {
  const box = $('#antipub-detail');
  if (!id) return (box.innerHTML = '<p class="muted">Sélectionnez un serveur.</p>');
  box.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    const a = await api(`/api/guilds/${id}/antipub`);
    box.innerHTML = '';
    box.append(kv([
      ['État', a.enabled ? '🟢 activé' : '🔴 désactivé'],
      ['Salons exemptés', a.exemptChannels.length],
      ['Détections', a.stats.detections ?? 0], ['Supprimés', a.stats.deleted ?? 0], ['Erreurs', a.stats.errors ?? 0],
      ['Dernière modification', a.lastModifiedAt ? new Date(a.lastModifiedAt).toLocaleString('fr-FR') : '—'],
    ]));
    if (a.exemptChannels.length) {
      box.append(el('h2', {}, 'Salons exemptés'), el('p', {}, a.exemptChannels.map((c) => `#${c}`).join(', ')));
    }
    if (a.recentDetections.length) {
      const table = el('table');
      table.append(el('tr', {}, [el('th', {}, 'Utilisateur'), el('th', {}, 'Salon'), el('th', {}, 'Invitation'), el('th', {}, 'Supprimé'), el('th', {}, 'Date')]));
      for (const d of a.recentDetections) {
        table.append(el('tr', {}, [el('td', {}, `${d.userId}`), el('td', {}, `#${d.channelId}`), el('td', {}, d.match), el('td', {}, d.deleted ? '✅' : '❌'), el('td', {}, new Date(d.at).toLocaleString('fr-FR'))]));
      }
      box.append(el('h2', {}, 'Dernières détections'), table);
    }
  } catch (e) {
    box.innerHTML = `<p class="muted">Erreur (${e}).</p>`;
  }
}

async function loadLevels(id) {
  const box = $('#levels-detail');
  if (!id) return (box.innerHTML = '<p class="muted">Sélectionnez un serveur.</p>');
  box.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    const l = await api(`/api/guilds/${id}/levels`);
    box.innerHTML = '';
    const c = l.config || {};
    box.append(kv([
      ['État', c.enabled ? '🟢 activé' : '🔴 désactivé'],
      ['XP / message', c.xpPerMessage ?? '—'], ['XP / min vocale', c.xpPerVoiceMinute ?? '—'],
      ['Cooldown (ms)', c.messageCooldownMs ?? '—'], ['Longueur min.', c.minMessageLength ?? '—'],
      ['Membres classés', l.leaderboard.length], ['Récompenses', l.rewards.length],
    ]));
    if (l.rewards.length) {
      box.append(el('h2', {}, 'Récompenses'), el('p', {}, l.rewards.map((r) => `Niv. ${r.level} → ${r.roleId}`).join(', ')));
    }
    if (l.leaderboard.length) {
      const table = el('table');
      table.append(el('tr', {}, [el('th', {}, '#'), el('th', {}, 'Membre'), el('th', {}, 'Niveau'), el('th', {}, 'XP'), el('th', {}, 'Messages'), el('th', {}, 'Vocal (min)')]));
      for (const e of l.leaderboard) {
        table.append(el('tr', {}, [el('td', {}, `${e.rank}`), el('td', {}, `${e.userId}`), el('td', {}, String(e.level)), el('td', {}, String(e.xp)), el('td', {}, String(e.messages)), el('td', {}, String(Math.round((e.voiceMs || 0) / 60000)))]));
      }
      box.append(el('h2', {}, 'Classement'), table);
    }
  } catch (e) {
    box.innerHTML = `<p class="muted">Erreur (${e}).</p>`;
  }
}

async function loadReputation(userId) {
  const box = $('#rep-detail');
  const target = (userId || state.me?.user?.id || '').trim();
  if (!target) return (box.innerHTML = '<p class="muted">Indiquez un identifiant utilisateur.</p>');
  box.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    const p = await api(`/api/reputation/${encodeURIComponent(target)}`);
    box.innerHTML = '';
    box.append(kv([
      ['Score', `${p.score}/100`], ['Confiance', `${p.level.emoji} ${p.level.label}`],
      ['Warns', p.stats.warns ?? 0], ['Timeouts', p.stats.timeouts ?? 0], ['Mutes', p.stats.mutes ?? 0],
      ['Kicks', p.stats.kicks ?? 0], ['Bans', p.stats.bans ?? 0], ['Serveurs', p.guildsCount],
      ['Badges', p.badges.length ? p.badges.join(' ') : '—'],
    ]));
    if (p.history.length) {
      const table = el('table');
      table.append(el('tr', {}, [el('th', {}, 'Action'), el('th', {}, 'Serveur'), el('th', {}, 'Date'), el('th', {}, 'Score')]));
      for (const h of p.history.slice(-15).reverse()) table.append(el('tr', {}, [el('td', {}, h.action), el('td', {}, `${h.guildId ?? '—'}`), el('td', {}, new Date(h.date).toLocaleString('fr-FR')), el('td', {}, `${h.scoreBefore}→${h.scoreAfter}`)]));
      box.append(el('h2', {}, 'Historique'), table);
    }
  } catch (e) {
    box.innerHTML = e === 403 ? '<p class="muted">Accès refusé : vous ne pouvez consulter que votre propre réputation.</p>' : `<p class="muted">Erreur (${e}).</p>`;
  }
}

let filesCache = null;

function renderFiles(box, dossier, filter) {
  box.innerHTML = '';
  box.append(kv([
    ['Utilisateur', dossier.rep?.record?.userId ?? '—'],
    ['Réputation', `${dossier.rep?.score ?? '—'}/100`],
    ['Confiance', `${dossier.rep?.level?.emoji ?? ''} ${dossier.rep?.level?.label ?? '—'}`],
    ['Warns', dossier.totalWarns], ['Sanctions', dossier.totalSanctions],
    ['Notes', dossier.noteCount], ['Serveurs concernés', dossier.guildsCount],
  ]));
  const f = (filter || '').trim().toLowerCase();
  const notes = f
    ? dossier.notes.filter((n) => `${n.content} ${n.guildName ?? ''} ${n.authorTag ?? ''}`.toLowerCase().includes(f))
    : dossier.notes;
  if (notes.length) {
    const table = el('table');
    table.append(el('tr', {}, [el('th', {}, 'ID'), el('th', {}, 'Contenu'), el('th', {}, 'Auteur'), el('th', {}, 'Serveur'), el('th', {}, 'Date')]));
    for (const n of notes) {
      table.append(el('tr', {}, [el('td', {}, n.id), el('td', {}, n.content), el('td', {}, n.authorTag || n.authorId), el('td', {}, n.guildName || n.guildId || '—'), el('td', {}, new Date(n.createdAt).toLocaleString('fr-FR'))]));
    }
    box.append(el('h2', {}, `Notes (${notes.length})`), table);
  } else {
    box.append(el('p', { className: 'muted' }, 'Aucune note.'));
  }
}

async function loadMemberFile(userId, filter) {
  const box = $('#files-detail');
  const target = (userId || '').trim();
  if (!target) return (box.innerHTML = '<p class="muted">Indiquez un identifiant utilisateur.</p>');
  box.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    filesCache = await api(`/api/files/${encodeURIComponent(target)}`);
    renderFiles(box, filesCache, filter);
  } catch (e) {
    box.innerHTML = e === 403 ? '<p class="muted">Accès refusé : réservé aux owners du bot.</p>' : `<p class="muted">Erreur (${e}).</p>`;
  }
}

async function loadReputationStats() {
  const box = $('#rep-detail');
  box.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    const o = await api('/api/reputation');
    box.innerHTML = '';
    box.append(kv([['Utilisateurs suivis', o.stats.users], ['Sanctions', o.stats.totalSanctions], ['Événements', o.stats.totalEvents]]));
    const table = el('table');
    table.append(el('tr', {}, [el('th', {}, 'Pondération'), el('th', {}, 'Points')]));
    for (const [k, v] of Object.entries(o.config.weights)) table.append(el('tr', {}, [el('td', {}, k), el('td', {}, `-${v}`)]));
    box.append(el('h2', {}, 'Pondérations'), table);
  } catch (e) {
    box.innerHTML = `<p class="muted">Erreur (${e}).</p>`;
  }
}

async function loadProfile(guildId, userId) {
  const box = $('#profile-detail');
  if (!guildId || !userId) return (box.innerHTML = '<p class="muted">Choisissez un serveur et un identifiant utilisateur.</p>');
  box.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    const p = await api(`/api/guilds/${guildId}/profile/${encodeURIComponent(userId)}`);
    box.innerHTML = '';
    box.append(kv([
      ['Utilisateur', p.userId], ['Réputation', p.reputation?.level ?? p.reputation?.score ?? '—'],
      ['Warns', p.warns], ['Badges', p.badges.length + ' (à venir)'], ['Succès', p.achievements.length + ' (à venir)'],
    ]));
    if (p.history.length) {
      const table = el('table');
      table.append(el('tr', {}, [el('th', {}, 'Raison'), el('th', {}, 'Sanction'), el('th', {}, 'Date')]));
      for (const h of p.history) table.append(el('tr', {}, [el('td', {}, h.reason || '—'), el('td', {}, h.sanction || '—'), el('td', {}, new Date(h.createdAt).toLocaleString('fr-FR'))]));
      box.append(el('h2', {}, 'Historique'), table);
    }
  } catch (e) {
    box.innerHTML = `<p class="muted">Erreur (${e}).</p>`;
  }
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
      $(`#panel-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });
}

function appendLog(entry) {
  const list = $('#log-list');
  const li = el('li', {}, [
    el('span', { className: 't' }, new Date(entry.at).toLocaleTimeString('fr-FR')),
    el('span', { className: 'tag' }, entry.type),
    el('span', {}, entry.message),
  ]);
  list.prepend(li);
  while (list.children.length > 80) list.lastChild.remove();
}

function connectRealtime(isOwner) {
  const source = new EventSource('/events');
  source.addEventListener('stats', (e) => renderStats(JSON.parse(e.data)));
  if (isOwner) source.addEventListener('log', (e) => appendLog(JSON.parse(e.data)));
  source.onerror = () => {}; // reconnexion automatique par le navigateur
}

async function init() {
  let me;
  try {
    me = await api('/api/me');
  } catch {
    return showLogin();
  }
  state.me = me;
  state.guilds = me.guilds || [];
  $('#login-view').classList.add('hidden');
  $('#dash-view').classList.remove('hidden');
  renderUser(me);
  renderGuildList();
  for (const sel of ['#mod-guild', '#tickets-guild', '#voice-guild', '#levels-guild', '#antipub-guild', '#profile-guild']) fillGuildSelect($(sel));
  setupTabs();

  try {
    renderStats(await api('/api/stats'));
  } catch { /* ignore */ }

  if (me.user.botOwner) $('#log-card').hidden = false;
  connectRealtime(me.user.botOwner);

  $('#mod-guild').addEventListener('change', (e) => loadModeration(e.target.value));
  $('#tickets-guild').addEventListener('change', (e) => loadTickets(e.target.value));
  $('#voice-guild').addEventListener('change', (e) => loadTempVoice(e.target.value));
  $('#levels-guild').addEventListener('change', (e) => loadLevels(e.target.value));
  $('#antipub-guild').addEventListener('change', (e) => loadAntipub(e.target.value));
  $('#rep-load').addEventListener('click', () => loadReputation($('#rep-user').value));
  $('#files-load').addEventListener('click', () => loadMemberFile($('#files-user').value, $('#files-filter').value));
  $('#files-filter').addEventListener('input', (e) => { if (filesCache) renderFiles($('#files-detail'), filesCache, e.target.value); });
  if (me.user.botOwner) {
    $('#rep-stats').hidden = false;
    $('#rep-stats').addEventListener('click', loadReputationStats);
  }
  $('#profile-load').addEventListener('click', () => loadProfile($('#profile-guild').value, $('#profile-user').value.trim()));
}

init();
