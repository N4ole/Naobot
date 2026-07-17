/**
 * Commande form : formulaires personnalisables (create / edit / delete /
 * list). Ce fichier porte aussi tous les composants du système (customId
 * `form:*`) : assistant de création (menus, boutons, modals), flux public
 * de remplissage (menus de choix + modal de saisie) et traitement des
 * soumissions par les modérateurs (accepter / refuser / attente / commenter).
 * La logique métier vit dans services/forms.
 */
const {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const formService = require('../../services/forms/formService');
const wizard = require('../../services/forms/formWizard');
const { canManageForms, canFillForm } = require('../../middlewares/forms/formAccess');
const formQuestionTypes = require('../../utils/constants/formQuestionTypes');
const formRepository = require('../../database/formRepository');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const eph = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });

// ---------------------------------------------------------------------------
// Commande
// ---------------------------------------------------------------------------

module.exports = {
  name: 'form',
  description: 'Gère les formulaires personnalisables (recrutements, candidatures…)',
  usage: 'form <create|edit|delete|list> [identifiant|nom]',
  examples: ['form create Candidature staff', 'form list', 'form edit a1b2c3d4', 'form delete a1b2c3d4'],
  aliases: ['formulaire'],
  cooldown: 3,
  args: [
    { name: 'action', type: 'string', required: false, choices: ['create', 'edit', 'delete', 'list'], description: 'Action à effectuer' },
    { name: 'valeur', type: 'string', required: false, rest: true, description: 'Nom (create) ou identifiant (edit/delete)' },
  ],
  async execute(ctx) {
    const action = (ctx.options.action ?? 'list').toLowerCase();
    const value = ctx.options.valeur?.trim();

    if (action === 'list') {
      const forms = formService.getForms(ctx.guild.id);
      if (forms.length === 0) return ctx.reply({ embeds: [infoEmbed(t('forms.list.title'), t('forms.list.empty'))], ephemeral: true });
      const lines = forms.map((form) => t('forms.list.entry', { id: form.id, name: form.name, channel: form.channelId, questions: form.questions.length }));
      return ctx.reply({ embeds: [infoEmbed(t('forms.list.title'), lines.join('\n\n'))], ephemeral: true });
    }

    if (action === 'create') {
      wizard.startCreate(ctx.user.id, ctx.guild.id, value);
      return ctx.reply({ ...wizard.buildPanel(wizard.getDraft(ctx.user.id)), ephemeral: true });
    }

    if (action === 'edit' || action === 'delete') {
      if (!value) return ctx.reply({ embeds: [errorEmbed(t('forms.errors.idRequired'))], ephemeral: true });
      const form = formService.getForm(ctx.guild.id, value);
      if (!form) return ctx.reply({ embeds: [errorEmbed(t('forms.errors.notFound', { id: value }))], ephemeral: true });
      if (action === 'edit') {
        wizard.startEdit(ctx.user.id, form);
        return ctx.reply({ ...wizard.buildPanel(wizard.getDraft(ctx.user.id)), ephemeral: true });
      }
      const channel = ctx.guild.channels.cache.get(form.channelId);
      const message = form.messageId ? await channel?.messages.fetch(form.messageId).catch(() => null) : null;
      await message?.delete().catch(() => null);
      formService.deleteForm(ctx.guild.id, form.id);
      await formService.logForm(ctx.guild, 'deleted', [{ name: t('forms.field.form'), value: form.name, inline: true }], ctx.user);
      return ctx.reply({ embeds: [successEmbed(t('forms.delete.done', { name: form.name }))] });
    }
    return ctx.reply({ embeds: [errorEmbed(t('forms.errors.idRequired'))], ephemeral: true });
  },

  async handleComponent(interaction) {
    if (!interaction.inCachedGuild()) return;
    const parts = interaction.customId.split(':');
    const action = parts[1];

    // --- Flux public de remplissage ---
    if (['fill', 'sel', 'cont', 'sub'].includes(action)) return this._handleFill(interaction, action, parts);

    // --- Traitement des soumissions (modérateurs) ---
    if (['act', 'comment', 'commentmodal'].includes(action)) return this._handleProcess(interaction, action, parts);

    // --- Assistant (gestion) : « Gérer le serveur » ---
    if (!canManageForms(interaction.member)) return interaction.reply(eph(errorEmbed(t('forms.errors.noPermission'))));
    return this._handleWizard(interaction, action, parts);
  },

  // -------------------------------------------------------------------------
  // Assistant de création / édition
  // -------------------------------------------------------------------------
  async _handleWizard(interaction, action, parts) {
    const draft = wizard.getDraft(interaction.user.id);
    if (!draft) return interaction.reply(eph(errorEmbed(t('forms.wizard.expired'))));

    switch (action) {
      case 'wchannel':
        draft.channelId = interaction.channels.first()?.id ?? draft.channelId;
        return interaction.update(wizard.buildPanel(draft));
      case 'wroles':
        draft.allowedRoleIds = interaction.roles.map((role) => role.id);
        return interaction.update(wizard.buildPanel(draft));
      case 'qtype':
        return interaction.showModal(this._questionModal(interaction.values[0]));
      case 'qmodal': {
        const type = parts[2];
        const label = interaction.fields.getTextInputValue('label').trim();
        if (!label) return interaction.reply(eph(errorEmbed(t('forms.wizard.labelRequired'))));
        const required = /^(o|oui|y|yes|true)$/i.test(interaction.fields.getTextInputValue('required').trim());
        const maxLength = Number.parseInt(interaction.fields.getTextInputValue('maxlength'), 10);
        const choices = interaction.fields.getTextInputValue('choices').split(',').map((c) => c.trim()).filter(Boolean).slice(0, 25);
        draft.questions.push({
          id: formRepository.generateId(),
          type,
          label: label.slice(0, 200),
          required,
          maxLength: Number.isInteger(maxLength) && maxLength > 0 ? Math.min(maxLength, 1024) : null,
          order: draft.questions.length,
          choices: formQuestionTypes[type]?.input === 'select' ? choices : [],
        });
        return interaction.update(wizard.buildPanel(draft));
      }
      case 'winfo':
        return interaction.showModal(this._infoModal(draft));
      case 'infomodal':
        draft.name = interaction.fields.getTextInputValue('name').trim() || draft.name;
        draft.description = interaction.fields.getTextInputValue('description').trim();
        return interaction.update(wizard.buildPanel(draft));
      case 'wremove':
        draft.questions.pop();
        draft.questions.forEach((question, index) => { question.order = index; });
        return interaction.update(wizard.buildPanel(draft));
      case 'wcancel':
        wizard.clearDraft(interaction.user.id);
        return interaction.update({ embeds: [infoEmbed(t('forms.wizard.cancelledTitle'), t('forms.wizard.cancelled'))], components: [] });
      case 'wpublish':
        return this._publish(interaction, draft);
      default:
        return undefined;
    }
  },

  _questionModal(type) {
    const isSelect = formQuestionTypes[type]?.input === 'select';
    const field = (id, label, style, required) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required));
    return new ModalBuilder()
      .setCustomId(`form:qmodal:${type}`)
      .setTitle(t('forms.wizard.questionModalTitle', { type: formQuestionTypes[type]?.label ?? type }))
      .addComponents(
        field('label', t('forms.wizard.qLabel'), TextInputStyle.Short, true),
        field('required', t('forms.wizard.qRequired'), TextInputStyle.Short, false),
        field('maxlength', t('forms.wizard.qMaxLength'), TextInputStyle.Short, false),
        field('choices', isSelect ? t('forms.wizard.qChoices') : t('forms.wizard.qChoicesNA'), TextInputStyle.Short, false),
      );
  },

  _infoModal(draft) {
    const field = (id, label, style, value) => {
      const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(id === 'name');
      if (value) input.setValue(value);
      return new ActionRowBuilder().addComponents(input);
    };
    return new ModalBuilder().setCustomId('form:infomodal').setTitle(t('forms.wizard.editInfo')).addComponents(
      field('name', t('forms.wizard.fName'), TextInputStyle.Short, draft.name),
      field('description', t('forms.wizard.fDescription'), TextInputStyle.Paragraph, draft.description),
    );
  },

  async _publish(interaction, draft) {
    const form = {
      id: draft.id ?? formRepository.generateId(),
      name: draft.name,
      description: draft.description,
      channelId: draft.channelId,
      messageId: draft.messageId ?? null,
      allowedRoleIds: draft.allowedRoleIds,
      questions: draft.questions,
      createdBy: draft.createdBy ?? interaction.user.id,
      createdAt: draft.createdAt ?? new Date().toISOString(),
    };
    await interaction.deferUpdate();
    const result = await formService.publishForm(interaction.guild, form);
    if (!result.ok) return interaction.editReply({ embeds: [errorEmbed(t(`forms.wizard.error.${result.code}`))], components: [] });
    if (!draft.editing) {
      await formService.logForm(interaction.guild, 'created', [{ name: t('forms.field.form'), value: form.name, inline: true }], interaction.user);
    }
    wizard.clearDraft(interaction.user.id);
    return interaction.editReply({ embeds: [successEmbed(t(draft.editing ? 'forms.wizard.saved' : 'forms.wizard.published', { id: form.id, channel: `<#${form.channelId}>` }))], components: [] });
  },

  // -------------------------------------------------------------------------
  // Flux public de remplissage
  // -------------------------------------------------------------------------
  async _handleFill(interaction, action, parts) {
    const formId = parts[2];
    const form = formService.getForm(interaction.guild.id, formId);
    if (!form) return interaction.reply(eph(errorEmbed(t('forms.errors.gone'))));

    if (action === 'fill') {
      if (!canFillForm(interaction.member, form)) return interaction.reply(eph(errorEmbed(t('forms.errors.notAllowed'))));
      wizard.startPending(interaction.guild.id, interaction.user.id, formId);
      const selectRows = form.questions
        .map((question, index) => ({ question, index }))
        .filter(({ question }) => formQuestionTypes[question.type]?.input === 'select')
        .slice(0, 4)
        .map(({ question, index }) =>
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`form:sel:${formId}:${index}`)
              .setPlaceholder(question.label.slice(0, 100))
              .setMinValues(question.required ? 1 : 0)
              .setMaxValues(formQuestionTypes[question.type].multi ? Math.max(1, question.choices.length) : 1)
              .addOptions((question.choices.length ? question.choices : [t('forms.fill.noChoice')]).slice(0, 25).map((choice) => ({ label: choice.slice(0, 100), value: choice.slice(0, 100) }))),
          ),
        );

      if (selectRows.length > 0) {
        const { ButtonBuilder, ButtonStyle } = require('discord.js');
        const continueRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`form:cont:${formId}`).setLabel(t('forms.fill.continue')).setStyle(ButtonStyle.Success),
        );
        return interaction.reply({ embeds: [infoEmbed(t('forms.fill.title', { form: form.name }), t('forms.fill.selectHint'))], components: [...selectRows, continueRow], flags: MessageFlags.Ephemeral });
      }
      return interaction.showModal(this._answersModal(form));
    }

    if (action === 'sel') {
      wizard.setPendingSelect(interaction.guild.id, interaction.user.id, formId, Number.parseInt(parts[3], 10), interaction.values);
      return interaction.deferUpdate();
    }

    if (action === 'cont') {
      const hasText = form.questions.some((question) => formQuestionTypes[question.type]?.input === 'modal');
      if (hasText) return interaction.showModal(this._answersModal(form));
      return this._finalize(interaction, form, false);
    }

    if (action === 'sub') {
      return this._finalize(interaction, form, true);
    }
    return undefined;
  },

  _answersModal(form) {
    const modal = new ModalBuilder().setCustomId(`form:sub:${form.id}`).setTitle(t('forms.fill.title', { form: form.name }).slice(0, 45));
    form.questions.forEach((question, index) => {
      if (formQuestionTypes[question.type]?.input !== 'modal') return;
      const input = new TextInputBuilder()
        .setCustomId(`q${index}`)
        .setLabel(question.label.slice(0, 45))
        .setStyle(formQuestionTypes[question.type].style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(question.required);
      if (question.maxLength) input.setMaxLength(question.maxLength);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
    });
    return modal;
  },

  async _finalize(interaction, form, fromModal) {
    const pending = wizard.getPending(interaction.guild.id, interaction.user.id, form.id);
    const answers = [];
    for (let i = 0; i < form.questions.length; i += 1) {
      const question = form.questions[i];
      let answer = '';
      if (formQuestionTypes[question.type]?.input === 'select') {
        answer = (pending.selects[i] ?? []).join(', ');
      } else if (fromModal) {
        answer = interaction.fields.getTextInputValue(`q${i}`).trim();
        if (question.type === 'number' && answer && Number.isNaN(Number(answer))) {
          return interaction.reply(eph(errorEmbed(t('forms.fill.invalidNumber', { question: question.label }))));
        }
        if (question.type === 'date' && answer && !/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(answer)) {
          return interaction.reply(eph(errorEmbed(t('forms.fill.invalidDate', { question: question.label }))));
        }
      }
      if (question.required && !answer) {
        return interaction.reply(eph(errorEmbed(t('forms.fill.missingRequired', { question: question.label }))));
      }
      answers.push({ question: question.label, answer });
    }

    await formService.createSubmission(interaction.guild, form, interaction.user, answers);
    wizard.clearPending(interaction.guild.id, interaction.user.id, form.id);
    const reply = { embeds: [successEmbed(t('forms.fill.submitted', { form: form.name }))], flags: MessageFlags.Ephemeral };
    return interaction.replied || interaction.deferred ? interaction.followUp(reply) : interaction.reply(reply);
  },

  // -------------------------------------------------------------------------
  // Traitement des soumissions (modérateurs)
  // -------------------------------------------------------------------------
  async _handleProcess(interaction, action, parts) {
    if (!canManageForms(interaction.member)) return interaction.reply(eph(errorEmbed(t('forms.errors.noPermission'))));

    if (action === 'comment') {
      const submissionId = parts[2];
      const modal = new ModalBuilder().setCustomId(`form:commentmodal:${submissionId}`).setTitle(t('forms.action.comment')).addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel(t('forms.action.commentLabel')).setStyle(TextInputStyle.Paragraph).setRequired(true)),
      );
      return interaction.showModal(modal);
    }

    if (action === 'commentmodal') {
      const submissionId = parts[2];
      const result = await formService.addNote(interaction.guild, submissionId, interaction.fields.getTextInputValue('text').trim(), interaction.user);
      if (!result.ok) return interaction.reply(eph(errorEmbed(t('forms.errors.submissionGone'))));
      return interaction.update({ embeds: [formService.submissionEmbed(result.form, result.submission)], components: formService.submissionComponents(submissionId) });
    }

    if (action === 'act') {
      const status = parts[2];
      const submissionId = parts[3];
      const result = await formService.setSubmissionStatus(interaction.guild, submissionId, status, interaction.user);
      if (!result.ok) return interaction.reply(eph(errorEmbed(t('forms.errors.submissionGone'))));
      return interaction.update({ embeds: [formService.submissionEmbed(result.form, result.submission)], components: formService.submissionComponents(submissionId) });
    }
    return undefined;
  },
};
