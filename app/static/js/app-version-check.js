function syncAppVersion() {
	const versionMeta = document.querySelector('meta[name="qlpk-app-version"]');
	const serverAppVersion = versionMeta ? versionMeta.getAttribute('content') : '';

	if (!serverAppVersion) return;


	const currentAppVersion = localStorage.getItem('APP_VERSION');

	if (currentAppVersion === serverAppVersion) return;

	if (!currentAppVersion) {
		localStorage.setItem('APP_VERSION', serverAppVersion);
		return;
	}

	const preservedKeys = [
		'qlpk_token',
		'qlpk_user',
		'qlpk_permissions',
		'qlpk_workspace_tabs',
		'qlpk_workspace_active_tab',
	];
	const preservedValues = preservedKeys.reduce((values, key) => {
		const value = localStorage.getItem(key);
		if (value !== null) values[key] = value;
		return values;
	}, {});

	localStorage.clear();
	sessionStorage.clear();

	Object.entries(preservedValues).forEach(([key, value]) => {
		localStorage.setItem(key, value);
	});
	localStorage.setItem('APP_VERSION', serverAppVersion);
}

syncAppVersion();

export { syncAppVersion };
