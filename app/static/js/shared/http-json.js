// JSON requests through the app transport (window.fetch is wrapped by shared/api-transport.js,
// which adds the session header/cookie and blocks responses that cross an account switch).
// Resolves with the parsed body for 2xx; rejects with HttpError (status + parsed body) otherwise,
// matching the success/error split the pages previously got from $.ajax.

export class HttpError extends Error {
	constructor(status, data) {
		super(`HTTP ${status}`);
		this.name = 'HttpError';
		this.status = status;
		this.data = data;
	}
}

async function readBody(response) {
	const text = await response.text();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

export async function requestJson(url, { method = 'GET', json, body, signal } = {}) {
	const headers = { 'X-Requested-With': 'XMLHttpRequest' };
	let payload = body;
	if (json !== undefined) {
		headers['Content-Type'] = 'application/json';
		payload = JSON.stringify(json);
	}
	const response = await window.fetch(url, { method, headers, body: payload, signal, credentials: 'same-origin' });
	const data = await readBody(response);
	if (!response.ok) throw new HttpError(response.status, data);
	return data;
}

export async function downloadFile(url, filename) {
	const response = await window.fetch(url, { credentials: 'same-origin' });
	if (!response.ok) throw new HttpError(response.status, null);
	const blobUrl = URL.createObjectURL(await response.blob());
	const link = document.createElement('a');
	link.href = blobUrl;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(blobUrl);
}
