/**
 * Module d'API **Analyse** : séries temporelles et répartitions alimentant les
 * graphiques interactifs. Chaque section est aussi accessible séparément, pour
 * ne charger que ce qui est affiché.
 */
const webAnalytics = require('../../../services/web/webAnalytics');

/** Fenêtre d'analyse en jours (bornée : 1 à 90). */
function daysFrom(searchParams) {
  const days = Number(searchParams?.get('days'));
  return { days: Math.min(Math.max(1, Number.isFinite(days) && days > 0 ? days : 30), 90) };
}

module.exports = {
  name: 'analytics',
  routes: {
    /** Vue complète (toutes les sections en un appel). */
    'GET /api/analytics': ({ searchParams }) => webAnalytics.overview(daysFrom(searchParams)),

    'GET /api/analytics/activity': ({ searchParams }) => webAnalytics.activity(daysFrom(searchParams)),
    'GET /api/analytics/moderation': ({ searchParams }) => webAnalytics.moderation(daysFrom(searchParams)),
    'GET /api/analytics/protections': ({ searchParams }) => webAnalytics.protections(daysFrom(searchParams)),
    'GET /api/analytics/tickets': () => webAnalytics.tickets(),
    'GET /api/analytics/bumps': ({ searchParams }) => webAnalytics.bumps(daysFrom(searchParams)),
    'GET /api/analytics/levels': () => webAnalytics.levels(),
    'GET /api/analytics/performance': () => webAnalytics.performance(),
  },
};
