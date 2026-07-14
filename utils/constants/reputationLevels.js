/**
 * Niveaux de réputation des serveurs, du meilleur au pire.
 * `min` : score minimal (sur 100) pour atteindre le niveau.
 * Les libellés affichés viennent de locales/<langue>.json
 * (clés reputation.levels.<key>).
 */
module.exports = [
  { key: 'excellent', min: 80, emoji: '🟢' },
  { key: 'bon', min: 60, emoji: '🟩' },
  { key: 'moyen', min: 40, emoji: '🟡' },
  { key: 'suspect', min: 20, emoji: '🟠' },
  { key: 'dangereux', min: 0, emoji: '🔴' },
];
