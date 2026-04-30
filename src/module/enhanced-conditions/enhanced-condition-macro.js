const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Enhanced Condition Macro Config Application
 */
export default class EnhancedConditionMacroConfig extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(object, options = {}) {
		super(options);
		this.object = object ?? {};
		this.object.macros = this.object.macros ?? [];
		this.initialObject = foundry.utils.duplicate(this.object);
	}

	static DEFAULT_OPTIONS = {
		id: "cub-enhanced-condition-macro-config",
		window: { title: "CLT.ENHANCED_CONDITIONS.MacroConfig.Title" },
		position: { width: 400, height: "auto" },
		classes: ["sheet"],
		form: {
			handler: EnhancedConditionMacroConfig.#onSubmit,
			submitOnChange: false,
			closeOnSubmit: false
		},
		tag: "form"
	};

	static PARTS = {
		form: {
			template: "modules/ironsworn-impacts/templates/enhanced-condition-macro-config.hbs"
		}
	};

	async _prepareContext(_options) {
		const conditionMacros = this.object.macros;
		const applyMacroId = conditionMacros.find((m) => m.type === "apply")?.id;
		const removeMacroId = conditionMacros.find((m) => m.type === "remove")?.id;

		const worldMacros = (game.macros?.contents ?? [])
			.map((m) => ({ id: m.id, name: m.name }))
			.sort((a, b) => a.name.localeCompare(b.name));

		const compendiumMacros = [];
		for (const pack of game.packs) {
			if (pack.documentName !== "Macro") continue;
			if (!pack.indexed) await pack.getIndex();
			for (const entry of pack.index) {
				compendiumMacros.push({
					id: `Compendium.${pack.collection}.Macro.${entry._id}`,
					name: `[${pack.metadata.label}] ${entry.name}`
				});
			}
		}
		compendiumMacros.sort((a, b) => a.name.localeCompare(b.name));

		return {
			condition: this.object,
			applyMacroId,
			removeMacroId,
			macroChoices: [...worldMacros, ...compendiumMacros]
		};
	}

	static async #onSubmit(_event, _form, formData) {
		const data = formData.object;
		this.object.macros = [];

		for (const field in data) {
			const type = field.split("-").slice(-1).pop() ?? "";
			this.object.macros.push({ id: data[field], type });
		}

		const map = game.clt.conditions;
		const newMap = foundry.utils.duplicate(map);
		const conditionIndex = newMap.findIndex((c) => c.id === this.object.id);
		newMap[conditionIndex] = this.object;
		await game.settings.set("ironsworn-impacts", "activeConditionMap", newMap);
		this.close();
	}
}
