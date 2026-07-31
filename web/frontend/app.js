/**
 * Cœur de l'interface web NaoBot (module ES, sans dépendance ni bundler).
 *
 * **Extensibilité** : le cœur ne connaît aucune page. Il demande à l'API la
 * liste des sections disponibles (`/api/settings/sections`, alimentée par les
 * modules de `web/api/modules/`) puis importe dynamiquement le module de page
 * correspondant dans `web/frontend/modules/`. Ajouter une page =
 * déposer deux fichiers (une route + une page), **aucune modification ici**.
 *
 * Chaque module de page exporte :
 *   export default {
 *     id: 'logs', label: 'Logs du bot', icon: '📜', order: 30,
 *     render(container, ctx)   // ctx = { state, api, on, refresh }
 *     onNotify?(notification)  // notifications temps réel (SSE)
 *   }
 */
import { $, el, api, replace, notice, errorText } from './lib/ui.js';

/** Ordre d'affichage par défaut si un module ne précise pas `order`. */
const DEFAULT_ORDER = 100;

const state = {
  me: null,
  guilds: [],
  pages: [],
  current: null,
  /** Compteurs de notifications non lues, par page. */
  badges: new Map(),
};

// ---------------------------------------------------------------------------
// Authentification
// ---------------------------------------------------------------------------

function showLogin() {
  $('#login-view').classList.remove('hidden');
  $('#dash-view').classList.add('hidden');
  const params = new URLSearchParams(location.search);
  if (params.get('denied') === '1') {
    $('#login-error').textContent = "Accès refusé : le tableau de bord est strictement réservé aux owners du bot.";
    return;
  }
  const error = params.get('error');
  if (error) $('#login-error').textContent = error === 'auth' ? "Échec de l'authentification Discord." : 'Session invalide, réessayez.';
}

function renderUser(me) {
  replace(
    $('#user-area'),
    me.user.avatar ? el('img', { src: me.user.avatar, alt: '' }) : null,
    el('span', {}, `${me.user.tag}${me.user.botOwner ? ' · owner' : ''}`),
    el('a', { className: 'btn btn-ghost', href: '/logout' }, 'Déconnexion'),
  );
}

// ---------------------------------------------------------------------------
// Registre de pages (découverte dynamique)
// ---------------------------------------------------------------------------

/**
 * Importe le module de page d'une section, s'il existe. Une section d'API sans
 * page correspondante est simplement ignorée (et inversement) : les deux
 * couches restent indépendantes.
 */
async function loadPage(section) {
  try {
    const module = await import(`./modules/${section}.js`);
    const page = module.default;
    if (!page?.id || typeof page.render !== 'function') return null;
    return page;
  } catch {
    return null; // pas de page pour cette section : ce n'est pas une erreur
  }
}

async function discoverPages() {
  let sections = [];
  try {
    ({ sections } = await api('/api/settings/sections'));
  } catch {
    sections = ['dashboard'];
  }
  const pages = (await Promise.all(sections.map(loadPage))).filter(Boolean);
  pages.sort((a, b) => (a.order ?? DEFAULT_ORDER) - (b.order ?? DEFAULT_ORDER) || a.label.localeCompare(b.label));
  return pages;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function renderNav() {
  const nav = $('#tabs');
  replace(
    nav,
    ...state.pages.map((page) => {
      const badge = state.badges.get(page.id) ?? 0;
      const tab = el('button', { className: `tab${state.current === page.id ? ' active' : ''}`, type: 'button' }, [
        `${page.icon ?? '•'} ${page.label}`,
        badge > 0 ? el('span', { className: 'badge' }, String(badge)) : null,
      ]);
      tab.addEventListener('click', () => navigate(page.id));
      return tab;
    }),
  );
}

/** Contexte transmis à chaque page. */
function pageContext() {
  return {
    state,
    api,
    /** Force le re-rendu de la page courante. */
    refresh: () => navigate(state.current, { force: true }),
  };
}

async function navigate(id, { force = false } = {}) {
  const page = state.pages.find((p) => p.id === id) ?? state.pages[0];
  if (!page) return;
  if (!force && state.current === page.id) return;
  state.current = page.id;
  state.badges.delete(page.id); // la page consultée n'a plus de notification
  location.hash = `#${page.id}`;
  renderNav();

  const container = $('#page');
  replace(container, notice('Chargement…'));
  try {
    await page.render(container, pageContext());
  } catch (error) {
    replace(container, notice(errorText(error)));
  }
}

// ---------------------------------------------------------------------------
// Temps réel (SSE)
// ---------------------------------------------------------------------------

/** Types de notification → page concernée (pour la pastille de la navigation). */
const NOTIFICATION_PAGE = {
  error: 'logs',
  command: 'logs',
  system: 'logs',
  contactMessage: 'messaging',
  ticket: 'guilds',
  protection: 'guilds',
  guildJoin: 'dashboard',
  guildLeave: 'dashboard',
};

function connectRealtime() {
  const source = new EventSource('/events');

  const dispatch = (event, payload) => {
    for (const page of state.pages) {
      if (typeof page.onNotify !== 'function') continue;
      try {
        page.onNotify({ event, payload, isCurrent: page.id === state.current });
      } catch {
        /* une page défaillante ne doit pas casser le flux temps réel */
      }
    }
  };

  source.addEventListener('dashboard', (e) => dispatch('dashboard', JSON.parse(e.data)));
  source.addEventListener('stats', (e) => dispatch('stats', JSON.parse(e.data)));
  source.addEventListener('log', (e) => dispatch('log', JSON.parse(e.data)));
  source.addEventListener('notify', (e) => {
    const notification = JSON.parse(e.data);
    const target = NOTIFICATION_PAGE[notification.type];
    // Pastille sur la page concernée, si l'utilisateur est ailleurs.
    if (target && target !== state.current) {
      state.badges.set(target, (state.badges.get(target) ?? 0) + 1);
      renderNav();
    }
    dispatch('notify', notification);
  });
  source.onerror = () => {}; // reconnexion automatique par le navigateur
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

async function init() {
  let me;
  try {
    me = await api('/api/me');
  } catch {
    return showLogin();
  }

  state.me = me;
  state.guilds = me.guilds ?? [];
  $('#login-view').classList.add('hidden');
  $('#dash-view').classList.remove('hidden');
  renderUser(me);

  state.pages = await discoverPages();
  if (state.pages.length === 0) return replace($('#page'), notice('Aucune section disponible.'));

  renderNav();
  const requested = location.hash.replace('#', '');
  await navigate(state.pages.some((p) => p.id === requested) ? requested : state.pages[0].id, { force: true });

  window.addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '');
    if (id && id !== state.current) navigate(id);
  });

  connectRealtime();
  return undefined;
}

init();
