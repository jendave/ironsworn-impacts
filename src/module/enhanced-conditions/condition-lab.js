import { Sidekick } from "../sidekick.js";
import { TrigglerForm } from "../triggler/triggler-form.js";
import EnhancedConditionMacroConfig from "./enhanced-condition-macro.js";
import EnhancedConditionOptionConfig from "./enhanced-condition-option.js";
import EnhancedConditionTriggerConfig from "./enhanced-condition-trigger.js";
import { EnhancedConditions } from "./enhanced-conditions.js";
import EnhancedEffectConfig from "./enhanced-effect-config.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Form application for managing mapping of Conditions to Icons and JournalEntries
 */
export class ConditionLab extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(_object, options = {}) {
		super(options);
		game.clt.conditionLab = this;
		this.data = null;
		this.system = game.system.id;
		this.initialMapType = game.settings.get("ironsworn-impacts", "conditionMapType");
		this.mapType = null;
		this.initialMap = game.settings.get("ironsworn-impacts", "activeConditionMap");
		this.map = null;
		this.displayedMap = null;
		this.maps = game.settings.get("ironsworn-impacts", "defaultConditionMaps");
		this.filterValue = "";
		this.sortDirection = "";
	}

	static DEFAULT_OPTIONS = {
		id: "cub-condition-lab",
		window: {
			title: "CLT.ENHANCED_CONDITIONS.Lab.Title",
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
		position: { width: 780, height: 680 },
		classes: ["sheet", "condition-lab-form"],
		actions: {
			import: ConditionLab.#onImport,
			export: ConditionLab.#onExport
		},
		form: {
			handler: ConditionLab.#onSubmit,
			submitOnChange: false,
			closeOnSubmit: false
		},
		tag: "form"
	};

	static PARTS = {
		form: {
			template: "modules/ironsworn-impacts/templates/condition-lab.hbs",
			scrollable: ["ol.condition-lab"]
		}
	};

	/**
	 * Get updated map by combining existing in-memory map with current formdata
	 */
	get updatedMap() {
		const submitData = this._buildSubmitData();
		const mergedMap = this._processFormData(submitData);
		return EnhancedConditions._prepareMap(mergedMap);
	}

	get isEditable() {
		return true;
	}

	/**
	 * Prepares context data for the template
	 */
	async _prepareContext(_options) {
		const sortDirection = this.sortDirection;
		const sortTitle = game.i18n.localize(
			`CLT.ENHANCED_CONDITIONS.ConditionLab.SortAnchorTitle.${sortDirection ? sortDirection : "unsorted"}`
		);
		const filterTitle = game.i18n.localize("CLT.ENHANCED_CONDITIONS.ConditionLab.FilterInputTitle");
		const filterValue = this.filterValue;

		const mapTypeChoices = { ...game.settings.settings.get("ironsworn-impacts.conditionMapType").choices };

		if (this.initialMap.length) {
			mapTypeChoices.default = game.i18n.localize("CLT.SETTINGS.EnhancedConditions.MapType.Choices.inferred");
		} else {
			delete mapTypeChoices.default;
		}

		this.mapType ||= this.initialMapType || "other";
		const conditionMap = (this.map ||= foundry.utils.duplicate(this.initialMap));
		const triggers = game.settings.get("ironsworn-impacts", "storedTriggers").map((t) => [t.id, t.text]);

		const isDefault = this.mapType === "default";
		const disableChatOutput = isDefault;

		for (const condition of conditionMap) {
			condition.name = game.i18n.localize(condition.name ?? condition.label);
			condition.img ??= condition.icon;
			const existingEntry = this.initialMap.find((e) => e.id === condition.id) ?? null;
			condition.isNew = !existingEntry;
			condition.isChanged = condition.isNew || this._hasEntryChanged(condition, existingEntry);

			condition.options = condition.options ?? {};
			const uuids = condition.reference ? condition.reference.split(" ").filter(Boolean) : [];
			condition.enrichedReferences = await Promise.all(
				uuids.map(async (uuid) => {
					const parts = uuid.split(".");
					if (parts[0] === "Compendium" && parts.length >= 4) {
						const packId = `${parts[1]}.${parts[2]}`;
						const pack = game.packs.get(packId);
						if (pack && !pack.indexed) await pack.getIndex();
					}
					return {
						uuid,
						html: await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${uuid}]`, { documents: true })
					};
				})
			);

			condition.hidden = condition.hidden ?? false;
		}

		this.displayedMap = filterValue
			? this._filterMapByName(conditionMap, filterValue)
			: foundry.utils.duplicate(conditionMap);

		if (sortDirection) {
			this.displayedMap = this._sortMapByName(this.displayedMap, sortDirection);
		}

		const displayedMap = this.displayedMap;
		const conditionMapLength = displayedMap.length - 1;

		let unsavedMap = false;
		if (
			this.mapType !== this.initialMapType
			|| conditionMap?.length !== this.initialMap?.length
			|| conditionMap.some((c) => c.isNew || c.isChanged)
		) {
			unsavedMap = true;
		}

		const data = {
			sortTitle,
			sortDirection,
			filterTitle,
			filterValue,
			mapTypeChoices,
			mapType: this.mapType,
			conditionMap,
			displayedMap,
			conditionMapLength,
			triggers,
			isDefault,
			disableChatOutput,
			unsavedMap
		};

		this.data = data;
		return data;
	}

	_onRender(_context, _options) {
		const html = this.element;
		ui.clt.conditionLab = this;

		const find = (sel) => html.querySelectorAll(sel);
		const on = (sel, evt, fn) => find(sel).forEach((el) => el.addEventListener(evt, fn));

		find("input").forEach((el) => el.addEventListener("change", (e) => this._onChangeInputs(e)));
		on("select.map-type", "change", (e) => this._onChangeMapType(e));
		on("button.active-effect-config", "click", (e) => this._onClickActiveEffectConfig(e));
		on("a.trigger", "click", (e) => this._onOpenTrigglerForm(e));
		on("a[name='add-row']", "click", (e) => this._onAddRow(e));
		on("a.remove-row", "click", (e) => this._onRemoveRow(e));
		on(".row-controls a.move-up, .row-controls a.move-down", "click", (e) => this._onChangeSortOrder(e));
		on("button.restore-defaults", "click", (e) => this._onRestoreDefaults(e));
		on("button[name='reset']", "click", (e) => this._onResetForm(e));
		on("input[name='filter-list']", "input", (e) => this._onChangeFilter(e));
		on("a.sort-list", "click", (e) => this._onClickSortButton(e));
		on("button.macro-config", "click", (e) => this._onClickMacroConfig(e));
		on("button.trigger-config", "click", (e) => this._onClickTriggerConfig(e));
		on("button.option-config", "click", (e) => this._onClickOptionConfig(e));
		on("a.remove-reference", "click", (e) => this._onRemoveReference(e));

		if (this.isEditable) {
			find("img[data-edit]").forEach((el) => el.addEventListener("click", this._onEditImage.bind(this)));
		}

		// drag-drop
		find("div.text-entry.reference").forEach((el) => {
			el.addEventListener("dragover", (e) => e.preventDefault());
			el.addEventListener("drop", (e) => this._onDrop(e));
		});
	}

	/**
	 * Enriches submit data with existing map to ensure continuity
	 */
	_buildSubmitData() {
		const map = this.sortDirection ? this._sortMapByName(this.map) : this.map;
		const baseData = map?.reduce((acc, entry, index) => {
			acc[`id-${index}`] = entry.id;
			return acc;
		}, {}) ?? {};

		// collect current form values
		const form = this.element?.querySelector ? this.element : null;
		if (!form) return baseData;
		const inputs = form.querySelectorAll("input, select, textarea");
		inputs.forEach((el) => {
			if (el.name) baseData[el.name] = el.type === "checkbox" ? el.checked : el.value;
		});
		return baseData;
	}

	/**
	 * Processes the Form Data and builds a usable Condition Map
	 */
	_processFormData(formData) {
		let ids = [];
		let conditions = [];
		let icons = [];
		let references = [];
		let newMap = [];
		const rows = [];
		const existingMap = this.map ?? game.settings.get("ironsworn-impacts", "activeConditionMap");

		const conditionRegex = /condition/i;
		const idRegex = new RegExp(/^id/, "i");
		const iconRegex = /icon/i;
		const referenceRegex = /reference/i;
		const rowRegex = new RegExp(/\d+$/);

		for (let e in formData) {
			const rowMatch = e.match(rowRegex);
			const row = rowMatch ? rowMatch[0] : null;

			if (!row) continue;

			rows.push(row);

			if (e.match(idRegex)) {
				ids[row] = formData[e];
			} else if (e.match(conditionRegex)) {
				conditions[row] = formData[e];
			} else if (e.match(iconRegex)) {
				icons[row] = formData[e];
			} else if (e.match(referenceRegex)) {
				references[row] = formData[e];
			}
		}

		const uniqueRows = [...new Set(rows)];

		for (let i = 0; i < uniqueRows.length; i++) {
			const id = ids[i] ?? null;
			const name = conditions[i];
			const existingCondition = existingMap && id ? existingMap.find((c) => c.id === id) : null;
			const {
				activeEffect = null,
				applyTrigger = null,
				removeTrigger = null,
				macros = null,
				options = {}
			} = existingCondition || {};

			newMap.push({
				id,
				name,
				img: icons[i],
				reference: references[i],
				applyTrigger,
				removeTrigger,
				activeEffect,
				macros,
				options
			});
		}

		return newMap;
	}

	/**
	 * Restore defaults for a mapping
	 */
	async _restoreDefaults() {
		const system = this.system;
		const defaultMaps = await EnhancedConditions._loadDefaultMaps();
		game.settings.set("ironsworn-impacts", "defaultConditionMaps", defaultMaps);
		const tempMap = this.mapType !== "other" && defaultMaps && defaultMaps[system] ? defaultMaps[system] : [];
		this.map = tempMap;
		this.render();
	}

	static async #onSubmit(_event, _form, formData) {
		const data = foundry.utils.expandObject(formData.object);
		const showDialogSetting = game.settings.get("ironsworn-impacts", "showSortDirectionDialog");

		if (this.sortDirection && showDialogSetting) {
			await foundry.applications.api.DialogV2.confirm({
				window: { title: game.i18n.localize("CLT.ENHANCED_CONDITIONS.ConditionLab.SortDirectionSave.Title") },
				content: game.i18n.localize("CLT.ENHANCED_CONDITIONS.ConditionLab.SortDirectionSave.Content"),
				yes: {
					callback: (_event, _button, dialog) => {
						const checkbox = dialog.element.querySelector("input[name='dont-show-again']");
						if (checkbox?.checked) {
							game.settings.set("ironsworn-impacts", "showSortDirectionDialog", false);
						}
						this._processFormUpdate(data);
					}
				},
				no: { callback: () => {} }
			});
		} else {
			this._processFormUpdate(data);
		}
	}

	static async #onImport() {
		await this._importFromJSONDialog();
	}

	static #onExport() {
		this._exportToJSON();
	}

	/**
	 * Process Ironsworn Impacts formdata and then save changes
	 */
	async _processFormUpdate(formData) {
		const mapType = formData["map-type"];
		let newMap = this.updatedMap;

		if (mapType === "default") {
			const defaultMap = EnhancedConditions.getDefaultMap(this.system);
			newMap = foundry.utils.mergeObject(newMap, defaultMap);
		}

		this._saveMapping(newMap, mapType);
	}

	/**
	 * Saves a given map and option map type to storage
	 */
	async _saveMapping(newMap, mapType = this.mapType) {
		this.mapType = this.initialMapType = mapType;
		const preparedMap = EnhancedConditions._prepareMap(newMap);

		await game.settings.set("ironsworn-impacts", "conditionMapType", mapType);
		await game.settings.set("ironsworn-impacts", "activeConditionMap", preparedMap);

		this._finaliseSave(preparedMap);
	}

	/**
	 * Performs final steps after saving mapping
	 */
	async _finaliseSave(preparedMap) {
		this.map = this.initialMap = preparedMap;
		this.unsaved = false;
		this.sortDirection = "";

		ui.notifications.info(game.i18n.localize("CLT.ENHANCED_CONDITIONS.Lab.SaveSuccess"));
		this.render();
	}

	/**
	 * Exports the current map to JSON
	 */
	_exportToJSON() {
		const transient = new Set(["enrichedReference", "enrichedReferences", "isNew", "isChanged", "hidden"]);
		const raw = this.map ?? game.settings.get("ironsworn-impacts", "activeConditionMap");
		const map = foundry.utils.duplicate(raw).map((entry) => {
			for (const key of transient) delete entry[key];
			return entry;
		});
		const data = {
			system: game.system.id,
			map
		};

		const filename = `${game.system.id}-impacts.json`;
		foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "text/json", filename);
	}

	/**
	 * Initiates an import via a dialog
	 */
	async _importFromJSONDialog() {
		foundry.applications.api.DialogV2.wait({
			window: { title: game.i18n.localize("CLT.ENHANCED_CONDITIONS.Lab.ImportTitle") },
			content: await foundry.applications.handlebars.renderTemplate("modules/ironsworn-impacts/templates/import-conditions.html", {}),
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

	/**
	 * Process a Condition Map Import
	 */
	async _processImport(html) {
		const form = html.querySelector ? html.querySelector("form") : html.find("form")[0];
		const fileInput = form.elements["data"] ?? form.data;

		if (!fileInput.files.length) {
			return ui.notifications.error(game.i18n.localize("CLT.ENHANCED_CONDITIONS.Lab.Import.NoFile"));
		}

		const jsonFile = await foundry.utils.readTextFromFile(fileInput.files[0]);
		const json = JSON.parse(jsonFile);
		const map = EnhancedConditions.mapFromJson(json);

		if (!map || !map?.length) return;

		this.mapType = "other";
		this.map = map;
		this.render();
	}

	/* -------------------------------------------- */
	/*                 Hook Handlers                */
	/* -------------------------------------------- */

	static _onRenderSaveDialog(app, html, data) {
		const contentDiv = html[0]?.querySelector("div.dialog-content") ?? html.querySelector?.("div.dialog-content");
		const checkbox = `<div class="form-group"><label class="dont-show-again-checkbox">${game.i18n.localize(
			"CLT.ENHANCED_CONDITIONS.ConditionLab.SortDirectionSave.CheckboxText"
		)}<input type="checkbox" name="dont-show-again"></label></div>`;
		contentDiv?.insertAdjacentHTML("beforeend", checkbox);
		app.setPosition?.({ height: (app.position?.height ?? 200) + 32 });
	}

	static _onRenderRestoreDefaultsDialog(app, html, data) {
		if (game.clt.conditionLab.mapType !== "default") return;
		const contentDiv = html[0]?.querySelector("div.dialog-content") ?? html.querySelector?.("div.dialog-content");
		const checkbox = `<div class="form-group">
		<label>${game.i18n.localize("CLT.ENHANCED_CONDITIONS.ConditionLab.RestoreDefaultClearCache.CheckboxText")}</label>
		<input type="checkbox" name="clear-cache">
		</div>`;
		contentDiv?.insertAdjacentHTML("beforeend", checkbox);
		app.setPosition?.({ height: (app.position?.height ?? 200) + 32 });
	}

	/* -------------------------------------------- */
	/*                Event Handlers                */
	/* -------------------------------------------- */

	async _onChangeInputs(event) {
		const name = event.target.name;
		if (name.startsWith("filter-list")) return;
		this.map = this.updatedMap;
		if (!this.map.length) return;
		if (name.startsWith("reference")) this._onChangeReferenceId(event);
		if (this._hasMapChanged()) return this.render();
	}

	_onChangeFilter(event) {
		const input = event.target;
		const inputValue = input?.value;
		this.filterValue = inputValue ?? "";
		this.displayedMap = this._filterMapByName(this.map, this.filterValue);
		this.displayedRowIds = this.displayedMap.filter((r) => !r.hidden).map((r) => r.id);

		const conditionRowEls = this.element.querySelectorAll("li.row");
		for (const el of conditionRowEls) {
			const conditionId = el.dataset.conditionId;
			if (this.displayedRowIds.includes(conditionId)) {
				el.classList.remove("hidden");
			} else {
				el.classList.add("hidden");
			}
		}
	}

	_filterMapByName(map, filter) {
		return map.map((c) => ({ ...c, hidden: !c.name.toLowerCase().includes(filter.toLowerCase()) }));
	}

	async _onChangeMapType(event) {
		event.preventDefault();
		const select = event.target;
		const newType = (this.mapType = select.options[select.selectedIndex].value);

		switch (newType) {
			case "default":
			case "custom": {
				const defaultMap = EnhancedConditions.getDefaultMap(this.system);
				this.map = defaultMap?.length ? EnhancedConditions._prepareMap(defaultMap) : [];
				break;
			}
			case "other": {
				this.map = this.initialMapType === "other" ? this.initialMap : [];
				break;
			}
			default:
				break;
		}

		this.data = null;
		this.render();
	}

	async _onClickActiveEffectConfig(event) {
		const li = event.currentTarget.closest("li");
		const conditionId = li ? li.dataset.conditionId : null;
		if (!conditionId) return;

		const conditions = this.map ?? game.settings.get("ironsworn-impacts", "activeConditionMap");
		const condition = conditions.length ? conditions.find((c) => c.id === conditionId) : null;
		if (!condition) return;

		const conditionEffect = condition.activeEffect ?? EnhancedConditions.getActiveEffects(condition)[0];
		if (!conditionEffect) return;

		if (!foundry.utils.hasProperty(conditionEffect, "flags.ironsworn-impacts.conditionId")) {
			foundry.utils.setProperty(conditionEffect, "flags.ironsworn-impacts.conditionId", conditionId);
		}

		delete conditionEffect.id;
		if (!conditionEffect.name) conditionEffect.name = condition.name;
		const effect = new ActiveEffect(conditionEffect, {
			parent: new Item({ name: "Global", type: "base" })
		});
		effect.testUserPermission = () => true;

		new EnhancedEffectConfig({ document: effect }).render(true);
	}

	async _onChangeReferenceId(event) {
		event.preventDefault();
		this.map = this.updatedMap;
		this.render();
	}

	_onRemoveReference(event) {
		event.preventDefault();
		const anchor = event.currentTarget;
		const uuid = anchor.dataset.uuid;
		const row = anchor.dataset.row;
		const input = this.element.querySelector(`input[name="reference-item-${row}"]`);
		if (!input) return;
		const existing = input.value.split(" ").filter((u) => u && u !== uuid);
		input.value = existing.join(" ");
		input.dispatchEvent(new Event("change"));
	}

	_onOpenTrigglerForm(event) {
		event.preventDefault();
		const anchor = event.currentTarget;
		const select = anchor.parentElement.nextElementSibling;
		const id = select.value;
		const conditionLabRow = select.name.match(/\d+$/)[0];
		new TrigglerForm({ id, conditionLabRow }, { parent: this }).render(true);
	}

	_onAddRow(event) {
		event.preventDefault();

		const existingNewConditions = this.map.filter((m) => m.name.match(/^New Condition \d+$/));
		const newConditionIndex = existingNewConditions.length
			? Math.max(...existingNewConditions.map((m) => Number(m.name.match(/\d+$/g)[0]))) + 1
			: 1;
		const newConditionName = `New Condition ${newConditionIndex}`;
		const fdMap = this.updatedMap;

		if (this.mapType === "default") {
			const defaultMap = EnhancedConditions.getDefaultMap(this.system);
			this.map = foundry.utils.mergeObject(fdMap, defaultMap);
		} else {
			this.map = fdMap;
		}

		const newMap = foundry.utils.duplicate(this.map);
		const exisitingIds = this.map.filter((c) => c.id).map((c) => c.id);

		newMap.push({
			id: Sidekick.createId(exisitingIds),
			name: newConditionName,
			img: "icons/svg/d20-black.svg",
			reference: "",
			trigger: "",
			options: {
				outputChat: false
			}
		});

		this.mapType = this.mapType === "default" ? "custom" : this.mapType;
		this.map = newMap;
		this.data = null;
		this.render();
	}

	_onRemoveRow(event) {
		event.preventDefault();
		this.map = this.updatedMap;
		const row = event.currentTarget.name.match(/\d+$/)[0];

		foundry.applications.api.DialogV2.confirm({
			window: { title: game.i18n.localize("CLT.ENHANCED_CONDITIONS.Lab.ConfirmDeleteTitle") },
			content: game.i18n.localize("CLT.ENHANCED_CONDITIONS.Lab.ConfirmDeleteContent"),
			yes: {
				icon: "fa fa-check",
				callback: async () => {
					const newMap = foundry.utils.deepClone(this.map);
					newMap.splice(row, 1);
					this.map = newMap;
					this.render();
				}
			},
			no: { icon: "fa fa-times" },
			defaultYes: false
		});
	}

	_onChangeSortOrder(event) {
		event.preventDefault();
		const anchor = event.currentTarget;
		const liRow = anchor?.closest("li");
		const rowNumber = parseInt(liRow?.dataset.mappingRow);
		const type = anchor?.className;
		const newMap = foundry.utils.deepClone(this.map);
		const mappingRow = newMap?.splice(rowNumber, 1) ?? [];
		let newIndex = -1;

		switch (type) {
			case "move-up":
				newIndex = rowNumber - 1;
				break;
			case "move-down":
				newIndex = rowNumber + 1;
				break;
			default:
				break;
		}

		if (newIndex <= -1) return;

		newMap.splice(newIndex, 0, ...mappingRow);
		this.map = newMap;
		this.render();
	}

	_onClickSortButton(event) {
		switch (this.sortDirection) {
			case "": this.sortDirection = "asc"; break;
			case "asc": this.sortDirection = "desc"; break;
			case "desc": this.sortDirection = ""; break;
			default: break;
		}
		return this.render();
	}

	_sortMapByName(map, direction) {
		return map.sort((a, b) => {
			if (direction === "desc") return b.name.localeCompare(a.name);
			return a.name.localeCompare(b.name);
		});
	}

	_onRestoreDefaults(event) {
		event.preventDefault();
		foundry.applications.api.DialogV2.confirm({
			window: { title: game.i18n.localize("CLT.ENHANCED_CONDITIONS.Lab.RestoreDefaultsTitle") },
			content: game.i18n.localize("CLT.ENHANCED_CONDITIONS.Lab.RestoreDefaultsContent"),
			yes: {
				icon: "fas fa-check",
				callback: () => { this._restoreDefaults(); }
			},
			no: { icon: "fas fa-times" },
			defaultYes: false
		});
	}

	_onResetForm(event) {
		foundry.applications.api.DialogV2.confirm({
			window: { title: game.i18n.localize("CLT.ENHANCED_CONDITIONS.Lab.ResetFormTitle") },
			content: game.i18n.localize("CLT.ENHANCED_CONDITIONS.Lab.ResetFormContent"),
			yes: {
				icon: "fa fa-check",
				callback: () => {
					this.map = this.initialMap;
					this.render();
				}
			},
			no: { icon: "fa fa-times" },
			defaultYes: false
		});
	}

	async _onDrop(event) {
		event.preventDefault();
		const eventData = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
		const link = await foundry.applications.ux.TextEditor.implementation.getContentLink(eventData);
		if (link) {
			const targetInput = event.currentTarget.querySelector("input");
			const existing = targetInput.value ? targetInput.value.split(" ").filter(Boolean) : [];
			if (!existing.includes(eventData.uuid)) {
				existing.push(eventData.uuid);
				targetInput.value = existing.join(" ");
			}
			return targetInput.dispatchEvent(new Event("change"));
		}
		return ui.notifications.error(game.i18n.localize("CLT.ENHANCED_CONDITIONS.ConditionLab.BadReference"));
	}

	_onClickMacroConfig(event) {
		const rowLi = event.target.closest("li");
		const conditionId = rowLi ? rowLi.dataset.conditionId : null;
		if (!conditionId) return;
		const condition = this.map.find((c) => c.id === conditionId);
		new EnhancedConditionMacroConfig(condition).render(true);
	}

	_onClickTriggerConfig(event) {
		const rowLi = event.target.closest("li");
		const conditionId = rowLi ? rowLi.dataset.conditionId : null;
		if (!conditionId) return;
		const condition = this.map.find((c) => c.id === conditionId);
		new EnhancedConditionTriggerConfig(condition).render(true);
	}

	_onClickOptionConfig(event) {
		const rowLi = event.target.closest("li");
		const conditionId = rowLi ? rowLi.dataset.conditionId : null;
		if (!conditionId) return;
		const condition = this.map.find((c) => c.id === conditionId);
		const config = new EnhancedConditionOptionConfig(condition);
		config.parentApp = this;
		config.render(true);
	}

	_hasMapChanged() {
		let hasChanged = false;
		const conditionMap = this.updatedMap;

		conditionMap.forEach((entry, index) => {
			const existingEntry = this.initialMap.find((e) => e.id === entry.id) ?? null;
			entry.isNew = !existingEntry;
			entry.isChanged = entry.isNew || index !== this.initialMap?.indexOf(existingEntry);

			if (!entry.isChanged) {
				entry.isChanged = !foundry.utils.isEmpty(foundry.utils.diffObject(existingEntry, entry));
				hasChanged ||= entry.isChanged;
			}
		});

		return hasChanged;
	}

	_hasEntryChanged(entry, existingEntry) {
		const propsToCheck = ["name", "img", "options", "reference", "applyTrigger", "removeTrigger", "activeEffect"];
		return propsToCheck.some((p) => this._hasPropertyChanged(p, existingEntry, entry));
	}

	_hasPropertyChanged(propertyName, original, comparison) {
		const originalValue = original?.[propertyName];
		const comparisonValue = comparison?.[propertyName];
		return (originalValue && !comparisonValue)
			|| (original && JSON.stringify(originalValue) !== JSON.stringify(comparisonValue));
	}

	_onEditImage(event) {
		const current = event.target.getAttribute("src");
		const fp = new foundry.applications.apps.FilePicker.implementation({
			current,
			type: "image",
			callback: (path) => {
				event.currentTarget.src = path;
				const iconPath = event.target.closest(".content1").querySelector(".icon-path");
				iconPath.value = path;
				this.map = this.updatedMap;
				if (this._hasMapChanged()) this.render();
			},
			top: this.position.top + 40,
			left: this.position.left + 10
		});
		return fp.browse();
	}
}
