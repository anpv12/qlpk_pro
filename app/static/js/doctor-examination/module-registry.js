const modules = Object.create(null);
const metadata = Object.create(null);

function register(name, value, options = {}) {
	if (!name || !value) throw new Error(`Doctor module không hợp lệ: ${name || 'unknown'}`);
	if (modules[name] && modules[name] !== value) {
		throw new Error(`Doctor module bị đăng ký trùng: ${name}`);
	}
	modules[name] = value;
	metadata[name] = {
		dependencies: Array.isArray(options.dependencies) ? [...options.dependencies] : [],
		version: options.version || 1,
		owner: options.owner || 'doctor'
	};
	return value;
}

function get(name) {
	return modules[name] || null;
}

function resolve(name, options = {}) {
	const module = get(name);
	if (module || options.required !== true) return module;
	throw new Error(`Thiếu Doctor module: ${name}`);
}

function requireModule(name) {
	const module = get(name);
	if (!module) throw new Error(`Thiếu Doctor module: ${name}`);
	return module;
}

function has(name) {
	return Boolean(modules[name]);
}

function describe(name) {
	if (!has(name)) return null;
	return { name, ...metadata[name] };
}

function list() {
	return Object.keys(modules).map(describe);
}

function validate(names = []) {
	const required = Array.isArray(names) ? names : [names];
	const missing = required.filter(name => !has(name));
	if (missing.length) {
		const error = new Error(`Thiếu Doctor modules: ${missing.join(', ')}`);
		error.missingModules = missing;
		throw error;
	}
	return true;
}

function validateGraph() {
	const missing = [];
	Object.entries(metadata).forEach(([name, info]) => {
		(info.dependencies || []).forEach(dependency => {
			if (!has(dependency)) missing.push({ module: name, dependency });
		});
	});
	if (missing.length) {
		const error = new Error('Doctor module dependency graph chưa đủ');
		error.missingDependencies = missing;
		throw error;
	}
	return true;
}

export const QLPKDoctorModuleRegistry = Object.freeze({
	register,
	get,
	resolve,
	require: requireModule,
	has,
	describe,
	list,
	validate,
	validateGraph
});
