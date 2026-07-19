/**
 * Capture pour le snipe des événements de membres : arrivées, départs,
 * changements de rôles (ajouts / retraits) et sanctions de type bannissement.
 * La consultation se fait via membersnipe / rolesnipe / sanctionsnipe.
 */
const { Events } = require('discord.js');
const snipeService = require('../../services/snipe/snipeService');

const memberAdd = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    snipeService.record(member.guild, 'members', {
      type: 'join',
      userId: member.id,
      userTag: member.user?.tag ?? null,
    });
  },
};

const memberRemove = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    snipeService.record(member.guild, 'members', {
      type: 'leave',
      userId: member.id,
      userTag: member.user?.tag ?? null,
    });
  },
};

const memberUpdate = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    const before = oldMember.roles?.cache;
    const after = newMember.roles?.cache;
    if (!before || !after) return;
    const added = [...after.keys()].filter((id) => !before.has(id));
    const removed = [...before.keys()].filter((id) => !after.has(id));
    if (added.length === 0 && removed.length === 0) return;
    snipeService.record(newMember.guild, 'roles', {
      type: added.length ? 'roleAdd' : 'roleRemove',
      userId: newMember.id,
      userTag: newMember.user?.tag ?? null,
      extra: { added, removed },
    });
  },
};

const banAdd = {
  name: Events.GuildBanAdd,
  async execute(ban) {
    snipeService.record(ban.guild, 'sanctions', {
      type: 'ban',
      userId: ban.user?.id ?? null,
      userTag: ban.user?.tag ?? null,
      newContent: ban.reason ?? null,
    });
  },
};

const banRemove = {
  name: Events.GuildBanRemove,
  async execute(ban) {
    snipeService.record(ban.guild, 'sanctions', {
      type: 'unban',
      userId: ban.user?.id ?? null,
      userTag: ban.user?.tag ?? null,
    });
  },
};

module.exports = [memberAdd, memberRemove, memberUpdate, banAdd, banRemove];
