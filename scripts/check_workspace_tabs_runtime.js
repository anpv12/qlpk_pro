'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/static/js/app-shell/workspace-tabs.js'), 'utf8');

class MemoryStorage {
	constructor() {
		this.values = new Map();
	}

	getItem(key) {
		return this.values.has(key) ? this.values.get(key) : null;
	}

	setItem(key, value) {
		this.values.set(key, String(value));
	}

	removeItem(key) {
		this.values.delete(key);
	}
}

const storage = new MemoryStorage();
const windowObject = {
	location: {
		origin: 'http://localhost:8000',
		pathname: '/doctor-examination.html',
		search: '',
	},
	QLPKNavigationConfig: {
		items: [
			{ label: 'Trang chủ', href: '/index.html', permission: 'dashboard' },
			{
				label: 'Quản lý khám',
				children: [
					{ label: 'Lễ tân', href: '/receptionist-new.html', permission: 'qlkham-letan' },
					{ label: 'Bác sĩ', href: '/doctor-examination.html', permission: 'qlkham-bs' },
				],
			},
		],
	},
	setTimeout,
};

const context = {
	window: windowObject,
	document: {},
	localStorage: storage,
	URL,
	URLSearchParams,
	ResizeObserver: undefined,
	setTimeout,
	clearTimeout,
};
vm.runInNewContext(source, context, { filename: 'workspace-tabs.js' });

const doctorTab = {
	id: 'doctor-examination-html',
	label: 'Bác sĩ',
	href: '/doctor-examination.html',
	mode: 'native',
};
const receptionistTab = {
	id: 'receptionist-new-html',
	label: 'Lễ tân',
	href: '/receptionist-new.html',
	mode: 'iframe',
};

storage.setItem('qlpk_workspace_tabs', JSON.stringify({
	version: 2,
	owners: {
		'user-id:1': [doctorTab, receptionistTab],
		'user-id:2': [receptionistTab],
	},
}));

storage.setItem('qlpk_user', JSON.stringify({ id: 1, username: 'doctor-one', role: 'doctor' }));
storage.setItem('qlpk_permissions', JSON.stringify(['qlkham-bs']));
assert.deepEqual(
	Array.from(windowObject.QLPKWorkspaceShell.getTabs(), tab => tab.id),
	['doctor-examination-html'],
	'Tài khoản bác sĩ không được nhận tab Lễ tân thiếu quyền',
);

storage.setItem('qlpk_user', JSON.stringify({ id: 2, username: 'staff-two', role: 'staff' }));
storage.setItem('qlpk_permissions', JSON.stringify(['qlkham-letan']));
assert.deepEqual(
	Array.from(windowObject.QLPKWorkspaceShell.getTabs(), tab => tab.id),
	['receptionist-new-html'],
	'Tài khoản thứ hai phải đọc đúng workspace riêng',
);

storage.setItem('qlpk_workspace_tabs', JSON.stringify({ version: 2, owners: {
	'user-id:2': [receptionistTab, { id: 'package-management-html', label: 'Gói dịch vụ',
		href: '/package-management.html', mode: 'iframe' }],
} }));
assert.deepEqual(
	Array.from(windowObject.QLPKWorkspaceShell.getTabs(), tab => tab.id),
	['receptionist-new-html'],
	'Tab Gói dịch vụ đã ẩn không được khôi phục từ phiên cũ',
);

storage.setItem('qlpk_workspace_tabs', JSON.stringify([receptionistTab]));
assert.deepEqual(
	Array.from(windowObject.QLPKWorkspaceShell.getTabs(), tab => tab.id),
	[],
	'Legacy global tab array phải bị bỏ qua để không rò state giữa tài khoản',
);

process.stdout.write('Workspace tabs runtime OK\n');
