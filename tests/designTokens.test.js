/**
 * Garde-fou de l'**identité graphique** : les couleurs sont déclarées dans
 * `config/designTokens.js` (source unique) et reprises en variables CSS dans
 * `web/frontend/style.css` — le navigateur ne peut pas lire un module Node.
 *
 * Ce test existe pour empêcher les deux de **rediverger** : c'est exactement le
 * défaut relevé par la charte (« deux chartes graphiques parallèles »), où une
 * couleur changée d'un côté ne bougeait pas de l'autre.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tokens = require('../config/designTokens');
const COLORS = require('../utils/constants/colors');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'web', 'frontend', 'style.css'), 'utf8');
const ROOT = CSS.slice(CSS.indexOf(':root {'), CSS.indexOf('\n}', CSS.indexOf(':root {')));

/** Lit une variable CSS du bloc `:root`, en majuscules et sans espaces. */
function cssVar(name) {
  const match = ROOT.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return match ? match[1].trim().toUpperCase() : null;
}

/** Couleurs de la charte attendues dans le `:root`. */
const EXPECTED = {
  primary: tokens.BRAND.primary,
  'primary-hover': tokens.BRAND.primaryHover,
  'primary-active': tokens.BRAND.primaryActive,
  'primary-bright': tokens.BRAND.primaryBright,
  secondary: tokens.BRAND.secondary,
  'secondary-hover': tokens.BRAND.secondaryHover,
  'secondary-active': tokens.BRAND.secondaryActive,
  'accent-1': tokens.BRAND.accent1,
  'accent-2': tokens.BRAND.accent2,
  'accent-3': tokens.BRAND.accent3,
  'accent-3-text': tokens.BRAND.accent3Text,
  success: tokens.FUNCTIONAL.success,
  warning: tokens.FUNCTIONAL.warning,
  error: tokens.FUNCTIONAL.error,
  'error-text': tokens.FUNCTIONAL.errorText,
  info: tokens.FUNCTIONAL.info,
  'info-text': tokens.FUNCTIONAL.infoText,
  bg: tokens.SURFACE.bg,
  'bg-secondary': tokens.SURFACE.bgSecondary,
  surface: tokens.SURFACE.surface,
  card: tokens.SURFACE.card,
  'card-hover': tokens.SURFACE.cardHover,
  sidebar: tokens.SURFACE.sidebar,
  input: tokens.SURFACE.input,
  border: tokens.SURFACE.border,
  'border-strong': tokens.SURFACE.borderStrong,
  'border-focus': tokens.SURFACE.borderFocus,
  text: tokens.TEXT.primary,
  'text-secondary': tokens.TEXT.secondary,
  'text-muted': tokens.TEXT.muted,
  'text-inverse': tokens.TEXT.inverse,
  'text-disabled': tokens.TEXT.disabled,
  link: tokens.TEXT.link,
  'link-hover': tokens.TEXT.linkHover,
};

test('tokens : le :root de style.css ne dérive pas de config/designTokens.js', () => {
  for (const [name, expected] of Object.entries(EXPECTED)) {
    assert.equal(cssVar(name), expected.toUpperCase(), `--${name} doit valoir ${expected}`);
  }
});

test('tokens : les neutres 50→900 sont repris à l’identique', () => {
  for (const [step, hex] of Object.entries(tokens.NEUTRAL)) {
    assert.equal(cssVar(`n-${step}`), hex.toUpperCase(), `--n-${step}`);
  }
});

test('tokens : la palette de graphiques est identique des deux côtés', () => {
  tokens.CHART.forEach((hex, i) => {
    assert.equal(cssVar(`chart-${i + 1}`), hex.toUpperCase(), `--chart-${i + 1}`);
  });
  assert.equal(tokens.CHART.length, 8, 'huit séries');
  assert.equal(new Set(tokens.CHART).size, 8, 'aucune teinte dupliquée');
});

test('tokens : les rayons et espacements de la charte sont déclarés', () => {
  for (const [name, px] of Object.entries(tokens.RADIUS)) {
    assert.equal(cssVar(`r-${name}`), `${px}PX`, `--r-${name}`);
  }
  for (const [step, px] of Object.entries(tokens.SPACING)) {
    assert.equal(cssVar(`sp-${step}`), `${px}PX`, `--sp-${step}`);
  }
});

test('couleurs des embeds : dérivées des tokens, valeurs de la charte', () => {
  assert.equal(COLORS.BRAND, 0x2569e8);
  assert.equal(COLORS.SUCCESS, 0x46d97f);
  assert.equal(COLORS.ERROR, 0xf0453c);
  assert.equal(COLORS.WARNING, 0xf5c542);
  // L'information neutre est la voix du bot : couleur de marque, plus blurple.
  assert.equal(COLORS.INFO, 0x2569e8);
  // L'acte de modération quitte le rose Discord pour le cyan de la charte.
  assert.equal(COLORS.MODLOG, 0x3fd3ee);
  assert.equal(COLORS.LOG_CREATE, COLORS.SUCCESS);
  assert.equal(COLORS.LOG_DELETE, COLORS.ERROR);
  assert.equal(COLORS.LOG_UPDATE, COLORS.WARNING);
  assert.equal(COLORS.LOG_NEUTRAL, 0x8592ab);
  // Toutes les valeurs sont des entiers Discord valides (0x000000-0xFFFFFF).
  for (const [name, value] of Object.entries(COLORS)) {
    assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffff, `${name} doit être une couleur valide`);
  }
});

// --- Accessibilité : contraste WCAG 2.1 ------------------------------------

/** Luminance relative WCAG 2.1 d'une couleur `#RRGGBB`. */
function luminance(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = Number.parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste entre deux couleurs. */
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

test('accessibilité : tout texte du système atteint WCAG AA (4,5:1) sur une carte', () => {
  const card = tokens.SURFACE.card;
  const pairs = {
    'texte principal': tokens.TEXT.primary,
    'texte secondaire': tokens.TEXT.secondary,
    'texte discret': tokens.TEXT.muted,
    lien: tokens.TEXT.link,
    'lien survolé': tokens.TEXT.linkHover,
    'erreur en texte': tokens.FUNCTIONAL.errorText,
    'primaire en texte': tokens.BRAND.primaryBright,
    'blurple en texte': tokens.BRAND.accent3Text,
    succès: tokens.FUNCTIONAL.success,
    avertissement: tokens.FUNCTIONAL.warning,
  };
  for (const [name, color] of Object.entries(pairs)) {
    const ratio = contrast(color, card);
    assert.ok(ratio >= 4.5, `${name} (${color}) : ${ratio.toFixed(2)}:1 < 4,5:1`);
  }
});

test('accessibilité : les couleurs pleines refusées en texte le sont à raison', () => {
  const card = tokens.SURFACE.card;
  // Ces trois-là échouaient en AA dans l'ancienne feuille : c'est pourquoi une
  // variante « …-text » existe. Le test documente la raison du doublon.
  assert.ok(contrast(tokens.BRAND.accent3, card) < 4.5, 'le blurple plein échoue bien en texte');
  assert.ok(contrast(tokens.FUNCTIONAL.error, card) < 4.5, 'le rouge plein échoue bien en texte');
  assert.ok(contrast(tokens.BRAND.primary, card) < 4.5, 'la primaire pleine échoue bien en texte');
});

test('accessibilité : blanc sur bouton primaire et texte inversé sur cyan', () => {
  assert.ok(contrast('#FFFFFF', tokens.BRAND.primary) >= 4.5, 'blanc sur bouton primaire');
  assert.ok(contrast(tokens.TEXT.inverse, tokens.BRAND.secondary) >= 4.5, 'texte inversé sur cyan');
  assert.ok(contrast(tokens.TEXT.inverse, tokens.FUNCTIONAL.success) >= 4.5, 'texte inversé sur vert');
  assert.ok(contrast(tokens.TEXT.inverse, tokens.FUNCTIONAL.warning) >= 4.5, 'texte inversé sur ambre');
});

// --- Règles de la charte présentes dans la feuille -------------------------

test('feuille : la règle de focus visible existe (correctif le plus rentable)', () => {
  assert.match(CSS, /:focus-visible/, 'aucune règle :focus-visible');
  assert.match(CSS, /outline:\s*2px solid var\(--border-focus\)/, 'anneau de focus de la charte');
});

test('feuille : le survol change la surface, la sélection est distincte', () => {
  assert.match(CSS, /\.btn:hover[^{]*\{[^}]*background:\s*var\(--card-hover\)/, 'le survol doit changer le fond');
  assert.match(CSS, /\.guild-item\.active[^{]*\{[^}]*background:\s*var\(--primary-soft\)/, 'la sélection doit être teintée');
});

test('feuille : l’état désactivé est réellement représenté', () => {
  assert.match(CSS, /\[disabled\][^{]*\{[^}]*cursor:\s*not-allowed/, 'état désactivé non représenté');
});

test('feuille : le thème clair mort-né a été retiré', () => {
  assert.ok(!/:root\[data-theme='light'\]/.test(CSS), 'le thème clair jamais activé doit être retiré');
});

test('feuille : aucune règle .app dupliquée', () => {
  const matches = CSS.match(/^\.app\s*\{/gm) ?? [];
  assert.equal(matches.length, 1, '.app ne doit être déclarée qu’une fois');
});
