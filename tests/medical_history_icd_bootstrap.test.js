'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadSupportRuntime } = require('./helpers/doctor-registry');
const { runScriptFile } = require('./helpers/module-source');



class FakeElement {}

function createFixture() {
	const registrations = new Map();
	const icdRoots = {
		physHistory: new FakeElement(),
		famHistory: new FakeElement()
	};
	icdRoots.physHistory.mode = 'physHistory';
	icdRoots.famHistory.mode = 'famHistory';
	const containers = {
		physHistoryContainer: { closest: () => icdRoots.physHistory },
		famHistoryContainer: { closest: () => icdRoots.famHistory }
	};
	const historyRoot = new FakeElement();
	historyRoot.id = 'doctorHistoryPanel';
	historyRoot.querySelector = selector => {
		const id = String(selector || '').replace(/^#/, '');
		return containers[id] || null;
	};

	const document = {
		querySelector(selector) {
			return selector === '#doctorHistoryPanel' || selector === '[data-medical-history-root]'
				? historyRoot
				: null;
		}
	};
	const registry = {
		register(name, value) {
			registrations.set(name, value);
			return value;
		},
		get(name) {
			return registrations.get(name) || null;
		},
		require(name) {
			const value = registrations.get(name);
			if (!value) throw new Error(`Thiếu Doctor module: ${name}`);
			return value;
		}
	};

	const createdComponents = [];
	function FakeIcdAutocomplete(root, options) {
		createdComponents.push({ root, options });
		this.getSelected = () => [];
		this.renderSelected = () => {};
		this.clear = () => {};
	}
	registry.register('icdAutocomplete', FakeIcdAutocomplete);
	registry.register('icdDataLoader', { loadICDData: async () => [] });
	registry.register('doctorComponentConfig', { history: { rootId: 'doctorHistoryPanel' } });
	registry.register('supportRuntime', loadSupportRuntime());

	const window = {
		Element: FakeElement,
		HTMLInputElement: FakeElement,
		QLPKDoctorModuleRegistry: registry
	};
	window.window = window;

	return { context: { window, document, console }, createdComponents };
}

async function main() {
	const fixture = createFixture();
	const { context, createdComponents } = fixture;

	// The shared form must only create its instance.  Its workflow bridge owns init().
	const sandbox = vm.createContext(context);
	runScriptFile('app/static/js/components/medical-history-form.js', sandbox);
	const form = context.window.QLPKDoctorModuleRegistry.get('medicalHistoryForm');
	assert.ok(form);
	assert.equal(form.getActive().state.initialized, false);

	// Loading the bridge after the form must still create both ICD controls.
	runScriptFile('app/static/js/doctor-examination/medical-history-icd-bridge.js', sandbox);
	runScriptFile('app/static/js/doctor-examination/medical-history-bridge.js', sandbox);

	const active = form.getActive();
	assert.equal(active.state.initialized, true);
	assert.deepEqual(Object.keys(active.state.components).sort(), ['famHistory', 'physHistory']);
	assert.equal(createdComponents.length, 2);
	assert.deepEqual(createdComponents.map(item => item.root.mode), ['physHistory', 'famHistory']);
	assert.ok(createdComponents.every(item => item.options.multiple === true));
	assert.ok(createdComponents.every(item => item.options.selectionKey === 'code'));
	console.log('medical history ICD bootstrap order: ok');
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
