import { Sidekick } from "../sidekick.js";
import { Triggler } from "./triggler.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class TrigglerForm extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(object, options = {}) {
		super(options);
		this.data = object || {};
		this.parentApp = options.parent || null;
	}

	static DEFAULT_OPTIONS = {
		id: "cub-triggler-form",
		window: {
			title: "Triggler",
			resizable: true,
			controls: [
				{
					action: "import",
					icon: "fas fa-file-import",
					label: "CLT.WORDS.Import"
				},
				{
					action: "export",
					icon: "fas fa-file-export",
					label: "CLT.WORDS.Export"
				}
			]
		},
		position: { width: 780, height: "auto" },
		classes: ["sheet", "triggler-form"],
		actions: {
			import: TrigglerForm.#onImport,
			export: TrigglerForm.#onExport
		},
		form: {
			handler: TrigglerForm.#onSubmit,
			submitOnChange: false,
			closeOnSubmit: false
		},
		tag: "form"
	};

	static PARTS = {
		form: {
			template: "modules/ironsworn-impacts/templates/triggler-form.html"
		}
	};

	async _prepareContext(options) {
		const id = this.data.id;
		const triggers = game.settings.get("ironsworn-impacts", "storedTriggers");

		if (this.noMerge) {
			this.noMerge = false;
		} else if (id && triggers) {
			const trigger = triggers.find((t) => t.id === id);
			if (trigger) foundry.utils.mergeObject(this.data, trigger);
		}

		const {
			triggerType = "simple",
			category = null,
			attribute = null,
			property1 = null,
			operator = null,
			value = null,
			property2 = null,
			advancedName = null,
			advancedActorProperty = null,
			advancedActorProperty2 = null,
			advancedTokenProperty = null,
			advancedTokenProperty2 = null,
			advancedOperator = null,
			advancedValue = null,
			pcOnly = null,
			npcOnly = null,
			notZero = null
		} = this.data || {};

		const isSimpleTrigger = triggerType === "simple";
		const isAdvancedTrigger = triggerType === "advanced";
		let actorModel = game.model.Actor ?? {};
		const isEmpty = Object.values(actorModel).every((obj) => Object.keys(obj).length === 0);
		let mergedModel = null;
		if (isEmpty) {
			actorModel = CONFIG.Actor.dataModels ?? {};
			mergedModel = Object.keys(actorModel)
				.reduce((obj, key) =>
					foundry.utils.mergeObject(obj, new CONFIG.Actor.documentClass({ name: "CLT Actor", type: key }).toObject().system), {});
		} else {
			mergedModel = Object.keys(actorModel)
				.reduce((accumulator, key) => foundry.utils.mergeObject(accumulator, actorModel[key]), {});
		}
		const arrayToObj = (arr) => arr.reduce((obj, key) => { obj[key] = key; return obj; }, {});
		const categories = mergedModel ? arrayToObj(Object.keys(mergedModel).sort()) : {};
		const attributes = category ? arrayToObj(Object.keys(mergedModel[category])) : {};
		const properties = category && attribute ? arrayToObj(Object.keys(mergedModel[category][attribute])) : {};
		const operators = Triggler.OPERATORS;
		const triggerSelected = !!(id && triggers);

		if (!categories) {
			ui.notifications.warn("Simple Trigger not supported. Try Advanced Trigger");
		}

		return {
			id, triggerSelected, triggers, isSimpleTrigger, isAdvancedTrigger,
			category, categories, attribute, attributes, property1, properties,
			operator, operators, value, property2, advancedName,
			advancedActorProperty, advancedActorProperty2,
			advancedTokenProperty, advancedTokenProperty2,
			advancedOperator, advancedValue, pcOnly, npcOnly, notZero
		};
	}

	_onRender(context, options) {
		const html = this.element;
		this._originalTop = html.style.top;

		if (this._reposition && !this._repositioned) {
			this._repositioned = true;
			const scaledHeight = html.offsetHeight;
			const tarT = (window.innerHeight - scaledHeight) / 2;
			const maxT = Math.max(window.innerHeight - scaledHeight, 0);
			this.setPosition({ top: Math.clamp(tarT, 0, maxT) });
		}

		this.noMerge = true;

		html.querySelector("select[name='triggers']")?.addEventListener("change", (event) => {
			this.data = {};
			this.data.id = event.target.value;
			this.noMerge = false;
			this.render();
		});

		html.querySelector("a.delete")?.addEventListener("click", async () => {
			const triggers = game.settings.get("ironsworn-impacts", "storedTriggers");
			const triggerIndex = triggers.findIndex((t) => t.id === this.data.id);
			if (triggerIndex === undefined) return;
			const updatedTriggers = foundry.utils.deepClone(triggers);
			updatedTriggers.splice(triggerIndex, 1);
			await game.settings.set("ironsworn-impacts", "storedTriggers", updatedTriggers);
			this.data = {};
			this.render();
		});

		html.querySelector("select[name='category']")?.addEventListener("change", (event) => {
			this.data.category = event.target.value;
			this.data.attribute = null;
			this.data.property1 = null;
			this.data.property2 = null;
			this.data.operator = null;
			this.data.value = null;
			this.render();
		});

		html.querySelector("select[name='attribute']")?.addEventListener("change", (event) => {
			this.data.attribute = event.target.value;
			this.data.property1 = null;
			this.data.property2 = null;
			this.data.operator = null;
			this.data.value = null;
			this.render();
		});

		html.querySelector("select[name='property1']")?.addEventListener("change", (event) => {
			this.data.property1 = event.target.value;
			this.render();
		});
		html.querySelector("select[name='property2']")?.addEventListener("change", (event) => {
			this.data.property2 = event.target.value;
			this.render();
		});
		html.querySelector("select[name='operator']")?.addEventListener("change", (event) => {
			this.data.operator = event.target.value;
			this.render();
		});
		html.querySelector("input[name='value']")?.addEventListener("change", (event) => {
			this.data.value = event.target.value;
			this.render();
		});

		html.querySelectorAll("input[name='triggerType']").forEach((el) => {
			el.addEventListener("change", (event) => {
				this.data.triggerType = event.currentTarget.value;
				if (event.currentTarget.value === "advanced"
					&& this._originalTop === this.element.style.top
					&& !this._reposition) {
					this._reposition = true;
				}
				this.render();
			});
		});

		html.querySelector("input[name='advancedName']")?.addEventListener("change", (event) => {
			this.data.advancedName = event.target.value; this.render();
		});
		html.querySelector("input[name='advancedActorProperty']")?.addEventListener("change", (event) => {
			this.data.advancedActorProperty = event.target.value; this.render();
		});
		html.querySelector("input[name='advancedActorProperty2']")?.addEventListener("change", (event) => {
			this.data.advancedActorProperty2 = event.target.value; this.render();
		});
		html.querySelector("input[name='advancedTokenProperty']")?.addEventListener("change", (event) => {
			this.data.advancedTokenProperty = event.target.value; this.render();
		});
		html.querySelector("input[name='advancedTokenProperty2']")?.addEventListener("change", (event) => {
			this.data.advancedTokenProperty2 = event.target.value; this.render();
		});
		html.querySelector("select[name='advancedOperator']")?.addEventListener("change", (event) => {
			this.data.advancedOperator = event.target.value; this.render();
		});
		html.querySelector("input[name='advancedValue']")?.addEventListener("change", (event) => {
			this.data.advancedValue = event.target.value; this.render();
		});

		html.querySelector("input[name='pcOnly']")?.addEventListener("click", (event) => {
			this.data.pcOnly = event.target.checked; this.render();
		});
		html.querySelector("input[name='npcOnly']")?.addEventListener("click", (event) => {
			this.data.npcOnly = event.target.checked; this.render();
		});
		html.querySelector("input[name='notZero']")?.addEventListener("click", (event) => {
			this.data.notZero = event.target.checked; this.render();
		});
	}

	static async #onSubmit(event, form, formData) {
		const data = foundry.utils.expandObject(formData.object);
		if (!data.category && !data.advancedActorProperty && !data.advancedTokenProperty) return;

		const triggerType = data.triggerType;
		if (triggerType === "advanced" && !data.advancedName?.length) {
			ui.notifications.warn(game.i18n.localize("CLT.TRIGGLER.App.AdvancedTrigger.Name.Warning"));
			return;
		}

		const triggers = game.settings.get("ironsworn-impacts", "storedTriggers");
		const existingIds = triggers ? triggers.map((t) => t.id) : null;
		const text = triggerType === "simple" ? Triggler._constructString(data) : data.advancedName;
		if (!text) return;

		const id = this.data.id;
		const newData = foundry.utils.deepClone(data);
		delete newData.triggers;

		const updatedTriggers = foundry.utils.deepClone(triggers);
		const existingTrigger = triggers.find((t) => t.id === id);
		const isNew = existingTrigger ? triggerType === "simple" || existingTrigger.advancedName !== text : true;

		if (!isNew) {
			const updatedTrigger = foundry.utils.mergeObject(existingTrigger, newData);
			updatedTrigger.text = text;
			updatedTriggers[triggers.indexOf(existingTrigger)] = updatedTrigger;
			this.data = updatedTrigger;
		} else {
			const newTrigger = { id: Sidekick.createId(existingIds), ...newData, text };
			updatedTriggers.push(newTrigger);
			this.data = newTrigger;
		}

		const setting = await game.settings.set("ironsworn-impacts", "storedTriggers", updatedTriggers);
		if (!setting) ui.notifications.info(game.i18n.localize("CLT.TRIGGLER.App.SaveSuccessful"));
		this.render();
	}

	static async #onImport() {
		await this._importFromJSONDialog();
	}

	static #onExport() {
		this._exportToJSON();
	}

	_exportToJSON() {
		const triggers = foundry.utils.deepClone(game.settings.get("ironsworn-impacts", "storedTriggers"));
		const data = { system: game.system.id, triggers };
		const filename = `${game.world.id}-triggers.json`;
		foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "text/json", filename);
	}

	async _importFromJSONDialog() {
		foundry.applications.api.DialogV2.wait({
			window: { title: game.i18n.localize("CLT.TRIGGLER.ImportTitle") },
			content: await foundry.applications.handlebars.renderTemplate(
				"modules/ironsworn-impacts/templates/import-conditions.html", {}
			),
			buttons: [
				{
					action: "import",
					icon: "fas fa-file-import",
					label: game.i18n.localize("CLT.WORDS.Import"),
					callback: (_event, _button, dialog) => {
						this._processImport(dialog.element);
					}
				},
				{
					action: "cancel",
					icon: "fas fa-times",
					label: game.i18n.localize("Cancel")
				}
			],
			default: "import"
		});
	}

	async _processImport(html) {
		const form = html.querySelector ? html.querySelector("form") : html.find("form")[0];
		const fileInput = form.elements["data"] ?? form.data;

		if (!fileInput.files.length) {
			return ui.notifications.error(game.i18n.localize("CLT.ENHANCED_CONDITIONS.Lab.Import.NoFile"));
		}

		const jsonFile = await foundry.utils.readTextFromFile(fileInput.files[0]);
		const json = JSON.parse(jsonFile);
		const triggers = Triggler.triggersFromJson(json);

		if (!triggers?.length) return;

		const originalTriggers = game.settings.get("ironsworn-impacts", "storedTriggers");
		await game.settings.set("ironsworn-impacts", "storedTriggers", originalTriggers.concat(triggers));
		this.render();
	}
}
