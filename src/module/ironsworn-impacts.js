/* -------------------------------------------- */
/*                    Imports                   */
/* -------------------------------------------- */
import { libWrapper } from "./libWrapper.js";
import { registerSettings } from "./settings.js";
import { Sidekick } from "./sidekick.js";

/* ------------------ Gadgets ----------------- */

import { EnhancedConditions } from "./enhanced-conditions/enhanced-conditions.js";

/* ------------------- Utils ------------------ */

import { ConditionLab } from "./enhanced-conditions/condition-lab.js";
import { TrigglerForm } from "./triggler/triggler-form.js";
import { Triggler } from "./triggler/triggler.js";

/* -------------------------------------------- */
/*                    System                    */
/* -------------------------------------------- */

/* ------------------- Init ------------------- */

Hooks.on("i18nInit", () => {
	registerSettings();

	// Assign the namespace Object if it already exists or instantiate it as an object if not
	game.clt = EnhancedConditions;
	ui.clt = {};

	// Execute housekeeping
	Sidekick.loadTemplates();

	// Keybinds
	game.keybindings.register("ironsworn-impacts", "openConditionLab", {
		name: "CLT.KEYBINDINGS.openConditionLab.name",
		onDown: () => {
			new ConditionLab().render(true);
		},
		restricted: true,
		precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
	});
	game.keybindings.register("ironsworn-impacts", "openTriggler", {
		name: "CLT.KEYBINDINGS.openTriggler.name",
		onDown: () => {
			new TrigglerForm().render(true);
		},
		restricted: true,
		precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
	});

	// Wrappers
	if (!game.modules.get("status-halo")?.active && !game.modules.get("illandril-token-hud-scale")?.active) {
		const effectSizes = {
			xLarge: {
				multiplier: 5,
				divisor: 2
			},
			large: {
				multiplier: 3.3,
				divisor: 3
			},
			medium: {
				multiplier: 2.5,
				divisor: 4
			},
			small: {
				multiplier: 2,
				divisor: 5
			}
		};
		libWrapper.register(
			"ironsworn-impacts",
			"foundry.canvas.placeables.Token.prototype._refreshEffects",
			function () {
				const effectSize = game.settings.get("ironsworn-impacts", "effectSize");
				// Use the default values if no setting found
				const { multiplier = 2, divisor = 5 } = effectSizes[effectSize];

				let i = 0;
				const size = Math.round(canvas.dimensions.size / 2 / 5) * multiplier;
				const rows = Math.floor(this.document.height * divisor);

				const bg = this.effects.bg.clear().beginFill(0x000000, 0.4)
					.lineStyle(1.0, 0x000000);
				for (const effect of this.effects.children) {
					if (effect === bg) continue;

					if (effect === this.effects.overlay) {
						const fallbackSize = {
							width: this.document.width * canvas.dimensions.size,
							height: this.document.height * canvas.dimensions.size
						};
						const { width, height } = this.document.getSize?.() ?? this.getSize?.() ?? fallbackSize;
						const size = Math.min(width * 0.6, height * 0.6);
						effect.width = effect.height = size;
						effect.position = this.document.getCenterPoint?.({ x: 0, y: 0 })
							?? this.getCenterPoint?.({ x: 0, y: 0 });
						effect.anchor.set(0.5, 0.5);
					} else {
						effect.width = effect.height = size;
						effect.x = Math.floor(i / rows) * size;
						effect.y = (i % rows) * size;
						bg.drawRoundedRect(effect.x + 1, effect.y + 1, size - 2, size - 2, 2);
						i++;
					}
				}
			},
			"OVERRIDE"
		);
	}
});

Hooks.on("ready", async () => {
	game.clt.CoreStatusEffects = foundry.utils.deepClone(CONFIG.statusEffects);
	game.clt.CoreSpecialStatusEffects = foundry.utils.deepClone(CONFIG.specialStatusEffects);
	game.clt.supported = false;
	let defaultMaps = game.settings.get("ironsworn-impacts", "defaultConditionMaps");
	let conditionMap = game.settings.get("ironsworn-impacts", "activeConditionMap");

	const mapType = game.settings.get("ironsworn-impacts", "conditionMapType");

	// If there's no defaultMaps or defaultMaps doesn't include game system, check storage then set appropriately
	if (
		game.user.isGM
		&& (
			!defaultMaps
			|| Object.keys(defaultMaps).length === 0
			|| !Object.keys(defaultMaps).includes(game.system.id)
		)
	) {
		defaultMaps = await EnhancedConditions._loadDefaultMaps();
		game.settings.set("ironsworn-impacts", "defaultConditionMaps", defaultMaps);
	}

	// If map type is not set and a default map exists for the system, set maptype to default
	if (!mapType && defaultMaps instanceof Object && Object.keys(defaultMaps).includes(game.system.id)) {
		game.settings.set("ironsworn-impacts", "conditionMapType", "default");
	}

	// When mapType is "default", always reload from the config file rather than trusting the stored map,
	// which can become corrupted (e.g. populated with engine defaults instead of system conditions).
	const systemDefault = defaultMaps instanceof Object ? defaultMaps[game.system.id] : null;
	if (mapType === "default" && systemDefault?.length) {
		conditionMap = systemDefault;
		if (game.user.isGM) {
			game.settings.set("ironsworn-impacts", "activeConditionMap", conditionMap);
		}
	} else if (!conditionMap.length) {
		// No stored map — load from defaults
		conditionMap = EnhancedConditions.getDefaultMap(defaultMaps);
		if (game.user.isGM && conditionMap.length) {
			game.settings.set("ironsworn-impacts", "activeConditionMap", conditionMap);
		}
	}

	// If map type is not set, now set to default
	if (!mapType && conditionMap.length) {
		game.settings.set("ironsworn-impacts", "conditionMapType", "default");
	}

	// Auto-load default triggers on first use if none are stored
	if (game.user.isGM) {
		const storedTriggers = game.settings.get("ironsworn-impacts", "storedTriggers");
		if (!storedTriggers?.length) {
			try {
				const triggersPath = `modules/ironsworn-impacts/config/${game.system.id}-triggers.json`;
				const response = await fetch(triggersPath);
				if (response.ok) {
					const json = await response.json();
					const triggers = Triggler.triggersFromJson(json);
					if (triggers?.length) {
						await game.settings.set("ironsworn-impacts", "storedTriggers", triggers);
					}
				}
			} catch(e) {
				// No default triggers file for this system — that's fine
			}
		}
	}

	// Update status icons accordingly
	if (game.user.isGM) {
		// CONFIG.statusEffects
		// CONFIG.specialStatusEffects
	}
	// const specialStatusEffectMap = game.settings.get("ironsworn-impacts", "specialStatusEffectMapping");
	if (conditionMap.length) EnhancedConditions._updateStatusEffects(conditionMap);
	setInterval(EnhancedConditions.updateConditionTimestamps, 15000);

	// Save the active condition map to a convenience property
	game.clt.conditions = conditionMap;

	game.clt.supported = true;

	// v14+: update existing ironsworn-impacts effects to show icons (they default to CONDITIONAL, only shown when temporary)
	if (game.user.isGM && CONST.ACTIVE_EFFECT_SHOW_ICON !== undefined) {
		for (const actor of game.actors) {
			const toUpdate = actor.effects
				.filter(e => e.getFlag("ironsworn-impacts", "conditionId") && e.showIcon !== CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS)
				.map(e => ({ _id: e.id, showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS }));
			if (toUpdate.length) await actor.updateEmbeddedDocuments("ActiveEffect", toUpdate);
		}
	}
});

/* -------------------------------------------- */
/*                    Entity                    */
/* -------------------------------------------- */

/* ------------------- Actor ------------------ */

Hooks.on("updateActor", (actor, updateData, options, userId) => {
	// Workaround for actor array returned in hook for non triggering clients
	if (game.userId !== userId) return;
	Triggler._processUpdate(actor, updateData, "system");
});

/* --------------- Active Effect -------------- */

Hooks.on("createActiveEffect", (effect, options, userId) => {
	if (!game.user.isGM || game.userId !== userId) return;
	EnhancedConditions._processActiveEffectChange(effect, "create");
});

Hooks.on("deleteActiveEffect", (effect, options, userId) => {
	if (!game.user.isGM || game.userId !== userId) return;
	EnhancedConditions._processActiveEffectChange(effect, "delete");
});

/* ------------------ Combat ------------------ */

Hooks.on("updateCombat", (combat, update, options, userId) => {
	const enableOutputCombat = game.settings.get("ironsworn-impacts", "conditionsOutputDuringCombat");
	const outputChatSetting = game.settings.get("ironsworn-impacts", "conditionsOutputToChat");
	const combatant = combat.combatant;

	if (
		!foundry.utils.hasProperty(update, "turn")
		|| !combatant
		|| !outputChatSetting
		|| !enableOutputCombat
		|| !game.user.isGM
	) {
		return;
	}

	const token = combatant.token;

	if (!token) return;

	const tokenConditions = EnhancedConditions.getConditions(token, { warn: false });
	let conditions = tokenConditions && tokenConditions.conditions ? tokenConditions.conditions : [];
	conditions = conditions instanceof Array ? conditions : [conditions];

	if (!conditions.length) return;

	const chatConditions = conditions.filter((c) => c.options?.outputChat);

	if (!chatConditions.length) return;

	EnhancedConditions.outputChatMessage(token, chatConditions, { type: "active" });
});

/* -------------- Scene Controls -------------- */
Hooks.on("getSceneControlButtons", function (hudButtons) {
	if (game.user.isGM && game.settings.get("ironsworn-impacts", "sceneControls")) {
		const hud = hudButtons.find((val) => val.name === "token");
		if (hud) {
			hud.tools.push({
				name: "CLT.ENHANCED_CONDITIONS.Lab.Title",
				title: "CLT.ENHANCED_CONDITIONS.Lab.Title",
				icon: "fas fa-flask",
				button: true,
				onClick: async () => new ConditionLab().render(true)
			});
			hud.tools.push({
				name: "Triggler",
				title: "Triggler",
				icon: "fas fa-exclamation",
				button: true,
				onClick: async () => new TrigglerForm().render(true)
			});
		}
	}
});

Hooks.on("renderSceneControls", (app, html, data) => {
	const htmlEl = html instanceof HTMLElement ? html : html[0];
	const trigglerButton = htmlEl.querySelector('li[data-tool="Triggler"]');
	if (trigglerButton) {
		trigglerButton.style.display = "inline-block";
		const exclamationMark = trigglerButton.children[0];
		exclamationMark.style.marginRight = "0px";
		const rightChevron = document.createElement("i");
		rightChevron.classList.add("fas", "fa-angle-right");
		rightChevron.style.marginRight = "0px";
		trigglerButton.insertBefore(rightChevron, exclamationMark);
		const leftChevron = document.createElement("i");
		leftChevron.classList.add("fas", "fa-angle-left");
		exclamationMark.after(leftChevron);
	}
});

/* ------------------- Misc ------------------- */

Hooks.on("renderSettingsConfig", (app, html, data, ...others) => {
	const htmlEl = html instanceof HTMLElement ? html : html[0];
	const trigglerMenu = htmlEl.querySelector("button[data-key=\"ironsworn-impacts.trigglerMenu\"]");
	if (trigglerMenu) {
		const exclamationMark = trigglerMenu.children[0];
		exclamationMark.style.margin = "0 -6px";
		const rightChevron = document.createElement("i");
		rightChevron.classList.add("fas", "fa-angle-right");
		trigglerMenu.insertBefore(rightChevron, exclamationMark);
		const leftChevron = document.createElement("i");
		leftChevron.classList.add("fas", "fa-angle-left");
		exclamationMark.after(leftChevron);
	}
});

Hooks.on("renderMacroConfig", (app, html, data) => {
	const htmlEl = html instanceof HTMLElement ? html : html[0];
	const typeSelect = htmlEl.querySelector("select[name='type']");
	const typeSelectDiv = typeSelect?.closest("div");
	const macro = app.document ?? app.object;
	if (!macro) return;
	const flag = macro.getFlag("ironsworn-impacts", "macroTrigger");
	const triggers = game.settings.get("ironsworn-impacts", "storedTriggers");

	const select = foundry.applications.fields.createSelectInput({
		name: "flags.ironsworn-impacts.macroTrigger",
		options: triggers,
		value: flag,
		blank: "CLT.ENHANCED_CONDITIONS.MacroConfig.NoTriggerSet",
		localize: true,
		sort: true,
		valueAttr: "id",
		labelAttr: "text"
	});

	const wrapper = document.createElement("div");
	wrapper.classList.add("form-group");
	wrapper.innerHTML = `<label>${game.i18n.localize("CLT.Trigger")}</label>`;
	wrapper.appendChild(select);
	typeSelectDiv?.after(wrapper);
});

/* ------------------- Chat ------------------- */

Hooks.on("renderChatLog", (app, html, data) => {
	EnhancedConditions.updateConditionTimestamps();
});

Hooks.on("renderChatMessageHTML", (app, html, data) => {
	if (data.message.content && !data.message.content.match("enhanced-conditions")) {
		return;
	}

	const speaker = data.message.speaker;

	if (!speaker) return;

	const htmlEl = html instanceof HTMLElement ? html : html[0];
	const removeConditionAnchor = htmlEl.querySelector("a[name='remove-row']");
	const undoRemoveAnchor = htmlEl.querySelector("a[name='undo-remove']");

	/**
	 * @todo #284 move to chatlog listener instead
	 */
	removeConditionAnchor?.addEventListener("click", (event) => {
		const conditionListItem = event.target.closest("li");
		const conditionName = conditionListItem.dataset.conditionName;
		const messageListItem = conditionListItem?.parentElement?.closest("li");
		const messageId = messageListItem?.dataset?.messageId;
		const message = messageId ? game.messages.get(messageId) : null;

		if (!message) return;

		const token = canvas.tokens.get(speaker.token);
		const actor = game.actors.get(speaker.actor);
		const entity = token ?? actor;

		if (!entity) return;

		EnhancedConditions.removeCondition(conditionName, entity, { warn: false });
	});

	undoRemoveAnchor?.addEventListener("click", (event) => {
		const conditionListItem = event.target.closest("li");
		const conditionName = conditionListItem.dataset.conditionName;
		const messageListItem = conditionListItem?.parentElement?.closest("li");
		const messageId = messageListItem?.dataset?.messageId;
		const message = messageId ? game.messages.get(messageId) : null;

		if (!message) return;

		const speaker = message?.speaker;

		if (!speaker) return;

		const token = canvas.tokens.get(speaker.token);
		const actor = game.actors.get(speaker.actor);
		const entity = token ?? actor;

		if (!entity) return;

		EnhancedConditions.addCondition(conditionName, entity);
	});
});

Hooks.on("renderDialog", (app, html, data) => {
	switch (app.title) {
		case game.i18n.localize("CLT.ENHANCED_CONDITIONS.ConditionLab.SortDirectionSave.Title"):
			ConditionLab._onRenderSaveDialog(app, html, data);
			break;

		case game.i18n.localize("CLT.ENHANCED_CONDITIONS.Lab.RestoreDefaultsTitle"):
			ConditionLab._onRenderRestoreDefaultsDialog(app, html, data);
			break;

		default:
			break;
	}
});

/* -------------- Combat Tracker -------------- */

Hooks.on("renderCombatTracker", (app, html, data) => {
	const htmlEl = html instanceof HTMLElement ? html : html[0];
	htmlEl.querySelectorAll("img[class='token-effect']").forEach((element) => {
		const url = new URL(element.src);
		const path = url?.pathname?.substring(1);
		const conditions = EnhancedConditions.getConditionsByIcon(path);
		const statusEffect = CONFIG.statusEffects.find((e) => e.img === path);

		if (conditions?.length) {
			element.title = conditions[0];
		} else if (statusEffect?.name) {
			element.title = game.i18n.localize(statusEffect.name);
		}
	});
});

/* ---------------- Custom Apps --------------- */

Hooks.on("renderConditionLab", (app, html, data) => {
	const htmlEl = html instanceof HTMLElement ? html : html[0];
	ConditionLab._onRender(app, htmlEl, data);
});
