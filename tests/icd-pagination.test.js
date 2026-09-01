'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = relativePath => fs.readFileSync(
	path.join(__dirname, '..', relativePath),
	'utf8'
);

class FakeClassList {
	constructor() {
		this.values = new Set();
	}

	add(...values) {
		values.forEach(value => this.values.add(value));
	}

	remove(...values) {
		values.forEach(value => this.values.delete(value));
	}

	toggle(value, force) {
		const shouldAdd = force === undefined ? !this.values.has(value) : force;
		if (shouldAdd) this.values.add(value);
		else this.values.delete(value);
		return shouldAdd;
	}

	contains(value) {
		return this.values.has(value);
	}
}

class FakeElement {
	constructor() {
		this.children = [];
		this.dataset = {};
		this.classList = new FakeClassList();
		this.events = new Map();
		this.hidden = false;
		this.value = '';
	}

	addEventListener(type, handler) {
		this.events.set(type, handler);
	}

	setAttribute(name, value) {
		this[name] = String(value);
	}

	append(...children) {
		children.forEach(child => {
			child.parentNode = this;
			this.children.push(child);
		});
	}

	appendChild(child) {
		this.append(child);
	}

	replaceChildren(...children) {
		this.children = children;
	}

	remove() {
		this.removed = true;
		if (this.parentNode) {
			this.parentNode.children = this.parentNode.children.filter(child => child !== this);
		}
	}

	contains(target) {
		return target === this || this.children.includes(target);
	}

	closest() {
		return null;
	}

	querySelector(selector) {
		return this.querySelectorAll(selector)[0] || null;
	}

	querySelectorAll(selector) {
		if (selector === '[data-icd-option]') {
			return this.children.filter(child => child.dataset?.icdOption === 'true');
		}
		if (selector === '.icd-autocomplete__load-more') {
			return this.children.filter(child => child.className === 'icd-autocomplete__load-more');
		}
		return [];
	}

	click(event = {}) {
		this.events.get('click')?.({
			preventDefault() {},
			stopPropagation() {},
			...event
		});
	}
}

function createRoot() {
	const input = new FakeElement();
	const tags = new FakeElement();
	const dropdown = new FakeElement();
	const list = new FakeElement();
	const root = new FakeElement();
	root.querySelector = selector => ({
		'[data-icd-autocomplete-input]': input,
		'[data-icd-autocomplete-tags]': tags,
		'[data-icd-autocomplete-dropdown]': dropdown,
		'[data-icd-autocomplete-list]': list
	}[selector] || null);
	return { root, input, tags, dropdown, list };
}

async function main() {
	const loaderSource = read('app/static/js/components/icd-data-loader.js');
	const autocompleteSource = read('app/static/js/components/icd-autocomplete.js');
	const fetchCalls = [];
	const window = {
		fetch: async (url, options) => {
			fetchCalls.push({ url, options });
			return {
				ok: true,
				json: async () => ({
					data: [{ id: 1, icd_code: 'A00', disease_name: 'Bệnh tả' }],
					pagination: {
						current_page: 2,
						per_page: 100,
						total_count: 201,
						total_pages: 3,
						has_next: true,
						has_prev: true
					}
				})
			};
		}
	};
	const document = {
		addEventListener() {},
		createElement: () => new FakeElement()
	};
	const context = { window, document, console, Set, Math, Number, String, Array, Boolean };
	window.window = window;
	vm.runInNewContext(loaderSource, context);

	assert.equal(
		window.ClinicalIcdDataLoader.buildIcdUrl('bệnh', { skip: 100, limit: 50 }),
		'/api/icd/?skip=100&limit=50&search=b%E1%BB%87nh'
	);
	const page = await window.ClinicalIcdDataLoader.loadICDPage('bệnh', {
		skip: 100,
		limit: 50,
		getAuthHeader: () => 'Bearer test-token'
	});
	assert.equal(page.data.length, 1);
	assert.equal(page.pagination.has_next, true);
	assert.equal(fetchCalls[0].url, '/api/icd/?skip=100&limit=50&search=b%E1%BB%87nh');

	const arrayContract = await window.ClinicalIcdDataLoader.loadICDData('bệnh', {
		limit: 50,
		getAuthHeader: () => 'Bearer test-token'
	});
	assert.ok(Array.isArray(arrayContract));
	assert.equal(arrayContract.pagination.total_count, 201);

	let requestedSkips = [];
	window.ClinicalIcdDataLoader.loadICDPage = async (_query, options) => {
		requestedSkips.push(options.skip);
		const data = options.skip === 0
			? [
				{ id: 1, icd_code: 'A00', disease_name: 'Bệnh tả' },
				{ id: 2, icd_code: 'A01', disease_name: 'Thương hàn' }
			]
			: [{ id: 3, icd_code: 'I25.5', disease_name: 'Bệnh cơ tim' }];
		return {
			data,
			pagination: {
				current_page: options.skip === 0 ? 1 : 2,
				per_page: 2,
				total_count: 3,
				total_pages: 2,
				has_next: options.skip === 0,
				has_prev: options.skip > 0
			}
		};
	};
	vm.runInNewContext(autocompleteSource, context);
	const fixture = createRoot();
	const autocomplete = new window.QLPKIcdAutocomplete(fixture.root);
	await autocomplete.refresh('bệnh');
	assert.deepEqual(requestedSkips, [0]);
	assert.equal(fixture.list.querySelectorAll('[data-icd-option]').length, 2);
	const loadMoreButton = fixture.list.querySelector('.icd-autocomplete__load-more');
	assert.ok(loadMoreButton);
	loadMoreButton.click();
	await new Promise(resolve => setImmediate(resolve));
	assert.deepEqual(requestedSkips, [0, 2]);
	assert.equal(fixture.list.querySelectorAll('[data-icd-option]').length, 3);
	assert.equal(fixture.list.querySelector('.icd-autocomplete__load-more'), null);

	console.log('ICD pagination loader/autocomplete: ok');
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
