// The asset version the server wrote into the qlpk-app-version meta ('' when the page has none).
export function getServerAppVersion() {
	return document.querySelector('meta[name="qlpk-app-version"]')?.getAttribute('content') || '';
}

// The page's asset version: the server's, else the last stored one, else a cache-busting timestamp.
export function getAppVersion() {
	return getServerAppVersion() || localStorage.getItem('APP_VERSION') || Date.now();
}
