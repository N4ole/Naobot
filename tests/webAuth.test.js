const test = require('node:test');
const assert = require('node:assert/strict');

// Configuration OAuth2 déterministe AVANT de charger webAuth.
const config = require('../config/config');
config.web.baseUrl = 'https://dash.example.com';
config.web.clientId = 'app123';
config.web.clientSecret = 'secret';
config.web.sessionSecret = 'sess';
config.web.redirectUri = null;

const webAuth = require('../services/web/webAuth');

test('redirectUri : dérivée de baseUrl par défaut', () => {
  config.web.redirectUri = null;
  assert.equal(webAuth.redirectUri(), 'https://dash.example.com/callback');
  assert.equal(webAuth.callbackPath(), '/callback');
});

test('redirectUri : DISCORD_REDIRECT_URI explicite prioritaire', () => {
  config.web.redirectUri = 'https://dash.example.com/auth/discord/callback';
  assert.equal(webAuth.redirectUri(), 'https://dash.example.com/auth/discord/callback');
  assert.equal(webAuth.callbackPath(), '/auth/discord/callback');
});

test('authUrl : paramètres OAuth2 corrects', () => {
  config.web.redirectUri = 'https://dash.example.com/callback';
  const url = new URL(webAuth.authUrl('state-xyz'));
  assert.equal(url.origin + url.pathname, 'https://discord.com/api/oauth2/authorize');
  assert.equal(url.searchParams.get('client_id'), 'app123');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://dash.example.com/callback');
  assert.equal(url.searchParams.get('scope'), 'identify guilds');
  assert.equal(url.searchParams.get('state'), 'state-xyz');
});

test('callbackPath : repli /callback si URI invalide', () => {
  config.web.redirectUri = 'pas-une-url';
  assert.equal(webAuth.callbackPath(), '/callback');
});
