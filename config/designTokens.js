/**
 * **Source unique** de l'identité graphique NaoBot (Design System v1.0 — Dark).
 *
 * Avant ce fichier, trois chartes vivaient en parallèle : `utils/constants/colors.js`
 * (embeds Discord), le `:root` de `web/frontend/style.css` (interface) et la
 * `PALETTE` de `charts.js` (graphiques). Une couleur changée à un endroit ne
 * bougeait pas aux deux autres. Ici, les valeurs sont déclarées **une fois**.
 *
 * Répartition des rôles :
 *   - **côté bot** : `utils/constants/colors.js` dérive ses entiers Discord de
 *     ces tokens ;
 *   - **côté web** : `style.css` déclare les mêmes valeurs en variables CSS
 *     (le navigateur ne peut pas lire ce module), et `charts.js` lit ces
 *     variables plutôt que de redéclarer la palette. Un test
 *     (`tests/designTokens.test.js`) vérifie que le `:root` de la feuille ne
 *     dérive **jamais** de ce fichier.
 *
 * Fondement des couleurs : elles sont échantillonnées sur le logo — bleu du
 * casque et du « N », cyan des yeux, rouge de l'écharpe — puis ajustées en
 * luminance pour satisfaire WCAG 2.1 AA. Le blurple Discord est conservé mais
 * démis de son rôle de primaire : il ne signifie plus que « ceci relève de
 * Discord ».
 */

/** Couleurs de marque. */
const BRAND = {
  primary: '#2569E8',
  primaryHover: '#1B5FDC',
  primaryActive: '#1450BE',
  /** Primaire lisible en **texte** sur fond sombre (la pleine échoue en AA). */
  primaryBright: '#4A8BFF',

  secondary: '#3FD3EE',
  secondaryHover: '#2FBEDA',
  secondaryActive: '#22A2BC',

  /** Rouge Nao : couleur de marque **et** de danger — un seul rouge. */
  accent1: '#F0453C',
  /** Cyan des yeux du robot : ce qui est « en direct ». */
  accent2: '#68E8F8',
  /** Blurple Discord : uniquement « ceci appartient à Discord ». */
  accent3: '#5865F2',
  /** Blurple lisible en texte (le plein échoue en AA : 4,10:1). */
  accent3Text: '#A6AEFF',
};

/** Couleurs fonctionnelles (états). */
const FUNCTIONAL = {
  success: '#46D97F',
  warning: '#F5C542',
  error: '#F0453C',
  /** Rouge lisible en **texte** (5,64:1) — jamais `error` plein en typographie. */
  errorText: '#FF6B60',
  info: '#2569E8',
  infoText: '#4A8BFF',
};

/**
 * Neutres légèrement teintés vers le navy de la visière (teinte ≈ 220°) plutôt
 * que gris purs : les surfaces sombres restent parentes du logo.
 */
const NEUTRAL = {
  50: '#F5F7FB',
  100: '#E7EBF3',
  200: '#CBD3E1',
  300: '#A7B2C6',
  400: '#8592AB',
  500: '#63708A',
  600: '#47536B',
  700: '#313C51',
  800: '#1E2739',
  900: '#0E1524',
};

/** Surfaces : quatre niveaux d'élévation, +4 % de clarté par palier. */
const SURFACE = {
  bg: '#0B0F1A',
  bgSecondary: '#101725',
  surface: '#161E2E',
  card: '#1A2334',
  cardHover: '#1F2940',
  header: '#101725',
  sidebar: '#0E1522',
  footer: '#0B0F1A',
  input: '#131B29',
  inputHover: '#16203A',
  border: '#27324A',
  borderStrong: '#37455F',
  borderFocus: '#2569E8',
};

/** Texte : chaque rôle satisfait AA sur `card`, sauf `disabled` (exempt WCAG). */
const TEXT = {
  primary: '#E8ECF5',
  secondary: '#A7B2C6',
  muted: '#8592AB',
  inverse: '#0B0F1A',
  disabled: '#63708A',
  link: '#6FA8FF',
  linkHover: '#9AC4FF',
};

/**
 * Palette des graphiques : huit séries ordonnées par **écart de luminance
 * croissant**, de sorte que deux séries voisines restent distinguables en
 * niveaux de gris — donc en vision dichromatique.
 */
const CHART = ['#2569E8', '#46D97F', '#F5C542', '#F0453C', '#68E8F8', '#F2994A', '#9B6DFF', '#FF8FA3'];

/** Typographie : trois familles, un rôle chacune. */
const TYPOGRAPHY = {
  display: "'Outfit', system-ui, sans-serif",
  ui: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

/** Échelle d'espacement (base 4). */
const SPACING = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 14: 56, 18: 72 };

/** Rayons autorisés (aucune autre valeur ne doit apparaître dans la feuille). */
const RADIUS = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, full: 999 };

/** Convertit `#RRGGBB` en entier, format attendu par discord.js. */
function toInt(hex) {
  return Number.parseInt(String(hex).replace('#', ''), 16);
}

module.exports = { BRAND, FUNCTIONAL, NEUTRAL, SURFACE, TEXT, CHART, TYPOGRAPHY, SPACING, RADIUS, toInt };
