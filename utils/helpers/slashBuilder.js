/**
 * Génère la définition d'une commande slash à partir du schéma `args`
 * déclaré par la commande. Une seule source de vérité : le même schéma sert
 * aussi au parseur des commandes préfixées (utils/helpers/argumentParser).
 *
 * Les permissions `user` de config/permissions.js sont appliquées comme
 * `default_member_permissions` : Discord masque alors nativement la commande
 * aux membres qui ne les possèdent pas.
 */
const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const permissionsConfig = require('../../config/permissions');

function buildSlashCommand(command) {
  const builder = new SlashCommandBuilder()
    .setName(command.name)
    .setDescription(command.description)
    .setDMPermission(false);

  const userPerms = permissionsConfig[command.name]?.user;
  if (userPerms?.length) {
    builder.setDefaultMemberPermissions(new PermissionsBitField(userPerms).bitfield);
  }

  for (const arg of command.args ?? []) {
    const base = (option) =>
      option.setName(arg.name).setDescription(arg.description).setRequired(Boolean(arg.required));

    switch (arg.type) {
      case 'member':
      case 'user':
        builder.addUserOption(base);
        break;
      case 'integer':
        builder.addIntegerOption((option) => {
          base(option);
          if (arg.min !== undefined) option.setMinValue(arg.min);
          if (arg.max !== undefined) option.setMaxValue(arg.max);
          return option;
        });
        break;
      // Les durées sont saisies sous forme de texte ("1h30m") puis validées
      // par le parseur d'arguments.
      case 'duration':
      default:
        builder.addStringOption((option) => {
          base(option);
          if (arg.choices?.length) {
            option.addChoices(...arg.choices.map((choice) => ({ name: choice, value: choice })));
          }
          return option;
        });
    }
  }
  return builder.toJSON();
}

module.exports = { buildSlashCommand };
