const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Enhanced Condition Trigger Config Application
 */
export default class EnhancedConditionTriggerConfig extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(object, options = {}) {
		super(options);
		this.object = object ?? {};
		this.initialObject = foundry.utils.duplicate(this.object);
	}

	static DEFAULT_OPTIONS = {
		id: "cub-enhanced-condition-trigger-config",
		window: { title: "CLT.ENHANCED_CONDITIONS.TriggerConfig.Title" },
		position: { width: 500, height: "auto" },
		classes: ["sheet"],
		form: {
			handler: EnhancedConditionTriggerConfig.#onSubmit,
			submitOnChange: false,
			closeOnSubmit: false
		},
		tag: "form"
	};

	static PARTS = {
		form: {
			template: "modules/ironsworn-impacts/templates/enhanced-condition-trigger-config.hbs"
		}
	};

	async _prepareContext(_options) {
		return {
			condition: this.object,
			applyTriggerId: this.object.applyTrigger,
			removeTriggerId: this.object.removeTrigger,
			triggerChoices: game.settings.get("ironsworn-impacts", "storedTriggers") ?? []
		};
	}

	static async #onSubmit(_event, _form, formData) {
		const data = formData.object;
		this.object.macros = [];

		for (const field in data) {
			const type = field.split("-").slice(-1).pop() ?? "";
			this.object[`${type}Trigger`] = data[field];
		}

		const map = game.clt.conditions;
		const newMap = foundry.utils.duplicate(map);
		const conditionIndex = newMap.findIndex((c) => c.id === this.object.id);
		newMap[conditionIndex] = this.object;
		await game.settings.set("ironsworn-impacts", "activeConditionMap", newMap);
		this.close();
	}
}
