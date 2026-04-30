import { Sidekick } from "../sidekick.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Enhanced Condition Option Config Application
 */
export default class EnhancedConditionOptionConfig extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(object, options = {}) {
		super(options);
		this.object = object ?? {};
		this.initialObject = foundry.utils.duplicate(this.object);
	}

	static DEFAULT_OPTIONS = {
		id: "cub-enhanced-condition-option-config",
		window: { title: "CLT.ENHANCED_CONDITIONS.OptionConfig.Title" },
		position: { width: 500, height: "auto" },
		classes: ["sheet"],
		form: {
			handler: EnhancedConditionOptionConfig.#onSubmit,
			submitOnChange: false,
			closeOnSubmit: false
		},
		tag: "form"
	};

	static PARTS = {
		form: {
			template: "modules/ironsworn-impacts/templates/enhanced-condition-option-config.hbs"
		}
	};

	_prepareContext(_options) {
		return {
			condition: this.object,
			optionData: this.object.options,
			specialStatus: CONFIG.specialStatusEffects
		};
	}

	_onRender(_context, _options) {
		this.element.querySelectorAll("input[type='checkbox']").forEach((el) => {
			el.addEventListener("change", (event) => this._onCheckboxChange(event));
		});
	}

	_onCheckboxChange(event) {
		if (!event.target?.checked) return;
		const targetName = event.target?.name;
		const propertyName = Sidekick.toCamelCase(targetName, "-");
		const specialStatusEffectsProps = Object.values({
			blinded: { optionProperty: "blindToken" },
			invisible: { optionProperty: "markInvisible" }
		}).map((k) => k.optionProperty);

		if (!propertyName || !specialStatusEffectsProps) return;

		if (specialStatusEffectsProps.includes(propertyName)) {
			event.detail = event.detail && event.detail instanceof Object ? event.detail : {};
			event.detail.statusName = targetName;
			event.detail.statusLabel = event.target.nextElementSibling?.innerText;
			event.detail.conditionId = this.object.id;
			return EnhancedConditionOptionConfig._onSpecialStatusEffectToggle(event);
		}
	}

	static async _onSpecialStatusEffectToggle(event) {
		const existingCondition = game.clt.conditions.find((c) => {
			const optionValue = foundry.utils.getProperty(
				c,
				`options.${Sidekick.toCamelCase(event.detail.statusName, "-")}`
			);
			return c.id !== event.detail.conditionId && optionValue;
		});
		if (existingCondition) {
			event.preventDefault();
			const title = game.i18n.localize("CLT.ENHANCED_CONDITIONS.OptionConfig.SpecialStatusEffectOverride.Title");
			const content = game.i18n.format(
				"CLT.ENHANCED_CONDITIONS.OptionConfig.SpecialStatusEffectOverride.Content",
				{
					existingCondition: existingCondition.name,
					statusEffect: event.detail.statusLabel ?? event.detail.statusName
				}
			);
			return foundry.applications.api.DialogV2.confirm({
				window: { title },
				content,
				yes: { callback: () => {} },
				no: { callback: () => { event.target.checked = false; } },
				defaultYes: false
			});
		}
		return event;
	}

	static async #onSubmit(_event, _form, formData) {
		const data = formData.object;
		this.object.options = {};
		const specialStatusEffectMapping = game.settings.get("ironsworn-impacts", "specialStatusEffectMapping");
		const map = game.clt.conditionLab.map;
		const newMap = foundry.utils.deepClone(map);
		let conditionIndex = newMap.findIndex((c) => c.id === this.object.id);

		for (const field in data) {
			const value = data[field];
			const propertyName = Sidekick.toCamelCase(field, "-");
			const specialStatusEffect = this.getSpecialStatusEffectByField(field);

			if (specialStatusEffect) {
				const existingMapping = foundry.utils.getProperty(specialStatusEffectMapping, specialStatusEffect);
				if (existingMapping === this.object.id && value === false) {
					this.setSpecialStatusEffectMapping(specialStatusEffect);
				} else if (existingMapping !== this.object.id && value === true) {
					this.setSpecialStatusEffectMapping(specialStatusEffect, this.object.id);
					if (existingMapping) {
						const existingId = existingMapping.replace("ironsworn-impacts.", "");
						const existingConditionIndex = newMap.findIndex((c) => c.id === existingId);
						if (existingConditionIndex !== -1) {
							const existingCondition = newMap[existingConditionIndex];
							const options = existingCondition?.options;
							options[propertyName] = false;
							newMap[existingConditionIndex] = existingCondition;
						}
					}
				}
			}

			this.object.options[propertyName] = value;
		}

		newMap[conditionIndex] = this.object;
		await game.clt.conditionLab._saveMapping(newMap);
		await this.close();
	}

	getSpecialStatusEffectByField(field) {
		switch (field) {
			case "blind-token": return "BLIND";
			case "mark-invisible": return "INVISIBLE";
			default: break;
		}
	}

	setSpecialStatusEffectMapping(effect, conditionId = null) {
		if (!Object.prototype.hasOwnProperty.call(CONFIG.specialStatusEffects, effect)) return;
		CONFIG.specialStatusEffects[effect] = conditionId;
		game.settings.set("ironsworn-impacts", "specialStatusEffectMapping", CONFIG.specialStatusEffects);
	}
}
