/**
 * Commande levelconfig : configuration du système de niveaux (administrateurs).
 *
 * - `levelconfig` : affiche la configuration actuelle.
 * - `levelconfig on|off` : active / désactive le système.
 * - `levelconfig set <xpmessage|xpvoice|cooldown|minlength> <valeur>`.
 * - `levelconfig reward <niveau> [@rôle]` : récompense de niveau (sans rôle : retire).
 * - `levelconfig announce [#salon]` : salon d'annonce (sans salon : désactive).
 * - `levelconfig exclude <salon|role> <#salon|@rôle>` : ajoute/retire une exclusion.
 *
 * Accès : Administrateur (config/permissions.js). La logique vit dans
 * services/levels/levelService.
 */
const config = require('../../config/config');
const levelService = require('../../services/levels/levelService');
const { formatDuration } = require('../../utils/helpers/durationParser');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const SET_KEYS = {
  xpmessage: { field: 'xpPerMessage', label: 'XP par message' },
  xpvoice: { field: 'xpPerVoiceMinute', label: 'XP par minute vocale' },
  cooldown: { field: 'messageCooldownMs', label: 'Cooldown message (s)', seconds: true },
  minlength: { field: 'minMessageLength', label: 'Longueur minimale' },
};

function configEmbed(guild) {
  const c = levelService.getConfig(guild.id);
  const rewards = Object.entries(c.rewards).length
    ? Object.entries(c.rewards).sort((a, b) => Number(a[0]) - Number(b[0])).map(([lvl, role]) => `• ${t('levels.field.level')} ${lvl} → <@&${role}>`).join('\n')
    : t('levels.config.noRewards');
  return infoEmbed(t('levels.config.title', { guild: guild.name }), null).addFields(
    { name: t('levels.config.state'), value: c.enabled ? '🟢' : '🔴', inline: true },
    { name: 'XP / message', value: String(c.xpPerMessage), inline: true },
    { name: 'XP / min vocale', value: String(c.xpPerVoiceMinute), inline: true },
    { name: 'Cooldown', value: formatDuration(c.messageCooldownMs), inline: true },
    { name: 'Longueur min.', value: String(c.minMessageLength), inline: true },
    { name: 'Salon d’annonce', value: c.announceChannelId ? `<#${c.announceChannelId}>` : t('levels.config.currentChannel'), inline: true },
    { name: t('levels.config.excludedChannels'), value: c.excludedChannels.length ? c.excludedChannels.map((id) => `<#${id}>`).join(' ') : '—', inline: false },
    { name: t('levels.config.excludedRoles'), value: c.excludedRoles.length ? c.excludedRoles.map((id) => `<@&${id}>`).join(' ') : '—', inline: false },
    { name: t('levels.config.rewards'), value: rewards, inline: false },
  );
}

module.exports = {
  name: 'levelconfig',
  description: 'Configure le système de niveaux (activation, XP, cooldown, exclusions, récompenses)',
  usage: 'levelconfig [on|off|set|reward|announce|exclude] …',
  examples: ['levelconfig', 'levelconfig on', 'levelconfig set xpmessage 20', 'levelconfig reward 5 @Actif', 'levelconfig announce #niveaux', 'levelconfig exclude salon #spam'],
  aliases: ['levelsettings'],
  cooldown: 3,
  args: [
    { name: 'action', type: 'string', required: false, choices: ['on', 'off', 'set', 'reward', 'announce', 'exclude'], description: 'Action (sans action : affiche la configuration)' },
    { name: 'cle', type: 'string', required: false, description: 'set : paramètre ; exclude : « salon » ou « role »' },
    { name: 'valeur', type: 'integer', required: false, description: 'set : valeur ; reward : niveau' },
    { name: 'salon', type: 'channel', required: false, description: 'announce / exclude : salon' },
    { name: 'role', type: 'role', required: false, description: 'reward / exclude : rôle' },
  ],

  async execute(ctx) {
    const action = ctx.options.action;
    const c = levelService.getConfig(ctx.guild.id);

    if (!action) return ctx.reply({ embeds: [configEmbed(ctx.guild)] });

    if (action === 'on' || action === 'off') {
      c.enabled = action === 'on';
      await levelService.saveConfig(ctx.guild, c, ctx.user);
      return ctx.reply({ embeds: [successEmbed(t(action === 'on' ? 'levels.config.enabled' : 'levels.config.disabled')), configEmbed(ctx.guild)] });
    }

    if (action === 'set') {
      const def = SET_KEYS[(ctx.options.cle ?? '').toLowerCase()];
      const value = ctx.options.valeur;
      if (!def || value === undefined || value < 0) {
        return ctx.reply({ embeds: [errorEmbed(t('levels.config.setUsage', { keys: Object.keys(SET_KEYS).join(', ') }))], ephemeral: true });
      }
      c[def.field] = def.seconds ? value * 1000 : value;
      await levelService.saveConfig(ctx.guild, c, ctx.user);
      return ctx.reply({ embeds: [successEmbed(t('levels.config.setDone', { key: def.label, value: String(value) })), configEmbed(ctx.guild)] });
    }

    if (action === 'reward') {
      const level = ctx.options.valeur;
      if (!Number.isInteger(level) || level < 1) return ctx.reply({ embeds: [errorEmbed(t('levels.config.rewardUsage'))], ephemeral: true });
      if (ctx.options.role) c.rewards[level] = ctx.options.role.id;
      else delete c.rewards[level];
      await levelService.saveConfig(ctx.guild, c, ctx.user);
      return ctx.reply({ embeds: [successEmbed(t(ctx.options.role ? 'levels.config.rewardSet' : 'levels.config.rewardRemoved', { level: String(level) })), configEmbed(ctx.guild)] });
    }

    if (action === 'announce') {
      c.announceChannelId = ctx.options.salon?.id ?? null;
      await levelService.saveConfig(ctx.guild, c, ctx.user);
      return ctx.reply({ embeds: [successEmbed(t(c.announceChannelId ? 'levels.config.announceSet' : 'levels.config.announceOff', { channel: c.announceChannelId ? `<#${c.announceChannelId}>` : '' })), configEmbed(ctx.guild)] });
    }

    if (action === 'exclude') {
      const type = (ctx.options.cle ?? '').toLowerCase();
      if (type === 'salon' && ctx.options.salon) {
        const id = ctx.options.salon.id;
        c.excludedChannels = c.excludedChannels.includes(id) ? c.excludedChannels.filter((x) => x !== id) : [...c.excludedChannels, id];
      } else if (type === 'role' && ctx.options.role) {
        const id = ctx.options.role.id;
        c.excludedRoles = c.excludedRoles.includes(id) ? c.excludedRoles.filter((x) => x !== id) : [...c.excludedRoles, id];
      } else {
        return ctx.reply({ embeds: [errorEmbed(t('levels.config.excludeUsage', { prefix: config.prefix }))], ephemeral: true });
      }
      await levelService.saveConfig(ctx.guild, c, ctx.user);
      return ctx.reply({ embeds: [successEmbed(t('levels.config.excludeDone')), configEmbed(ctx.guild)] });
    }

    return ctx.reply({ embeds: [configEmbed(ctx.guild)] });
  },
};
