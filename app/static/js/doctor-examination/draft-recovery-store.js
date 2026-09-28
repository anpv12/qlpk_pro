(function (window) {
	'use strict';

	const DATABASE_NAME = 'qlpk_doctor_draft_recovery';
	const DATABASE_VERSION = 1;
	const STORE_NAME = 'clinical_drafts';
	const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

	function openDatabase() {
		return new Promise((resolve, reject) => {
			if (!window.indexedDB) {
				reject(new Error('IndexedDB không khả dụng trên trình duyệt này'));
				return;
			}
			const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
			request.onerror = () => reject(request.error || new Error('Không mở được kho nháp cục bộ'));
			request.onupgradeneeded = () => {
				const database = request.result;
				const store = database.objectStoreNames.contains(STORE_NAME)
					? request.transaction.objectStore(STORE_NAME)
					: database.createObjectStore(STORE_NAME, { keyPath: 'key' });
				if (!store.indexNames.contains('expiresAt')) store.createIndex('expiresAt', 'expiresAt', { unique: false });
				if (!store.indexNames.contains('userId')) store.createIndex('userId', 'userId', { unique: false });
			};
			request.onsuccess = () => resolve(request.result);
		});
	}

	async function withStore(mode, callback) {
		const database = await openDatabase();
		try {
			return await new Promise((resolve, reject) => {
				const transaction = database.transaction(STORE_NAME, mode);
				const store = transaction.objectStore(STORE_NAME);
				let result;
				try {
					result = callback(store, transaction);
				} catch (error) {
					reject(error);
					return;
				}
				transaction.oncomplete = () => resolve(result);
				transaction.onerror = () => reject(transaction.error || new Error('Không thể cập nhật kho nháp'));
				transaction.onabort = () => reject(transaction.error || new Error('Đã hủy cập nhật kho nháp'));
			});
		} finally {
			database.close();
		}
	}

	function readRecord(key) {
		return withStore('readonly', store => new Promise((resolve, reject) => {
			const request = store.get(key);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error || new Error('Không đọc được bản nháp'));
		}));
	}

	function writeRecord(record) {
		return withStore('readwrite', store => store.put(record));
	}

	function deleteRecord(key) {
		return withStore('readwrite', store => store.delete(key));
	}

	function deleteRecordIfMatches(record) {
		if (!record?.key) return Promise.resolve(false);
		return withStore('readwrite', store => new Promise((resolve, reject) => {
			const request = store.get(record.key);
			request.onsuccess = () => {
				const current = request.result;
				const matches = Boolean(current && (record.captureId
					? current.captureId === record.captureId
					: current.schemaVersion === record.schemaVersion && current.savedAt === record.savedAt));
				if (matches) store.delete(record.key);
				resolve(matches);
			};
			request.onerror = () => reject(request.error || new Error('Không đọc được bản nháp để kiểm tra race'));
		}));
	}

	function replaceRecordIfMatches(record, replacement) {
		if (!record?.key || !replacement?.key || record.key !== replacement.key) return Promise.resolve(false);
		return withStore('readwrite', store => new Promise((resolve, reject) => {
			const request = store.get(record.key);
			request.onsuccess = () => {
				const current = request.result;
				const matches = Boolean(current && (record.captureId
					? current.captureId === record.captureId
					: current.schemaVersion === record.schemaVersion && current.savedAt === record.savedAt));
				if (matches) store.put(replacement);
				resolve(matches);
			};
			request.onerror = () => reject(request.error || new Error('Không đọc được bản nháp để cập nhật an toàn'));
		}));
	}

	async function purgeExpiredRecords() {
		const now = Date.now();
		await withStore('readwrite', store => {
			const index = store.index('expiresAt');
			const request = index.openCursor(IDBKeyRange.upperBound(now));
			request.onsuccess = event => {
				const cursor = event.target.result;
				if (!cursor) return;
				cursor.delete();
				cursor.continue();
			};
		});
	}

	function deleteUserRecords(userId) {
		return withStore('readwrite', store => {
			const index = store.index('userId');
			const request = index.openCursor(IDBKeyRange.only(userId));
			request.onsuccess = event => {
				const cursor = event.target.result;
				if (!cursor) return;
				cursor.delete();
				cursor.continue();
			};
		});
	}

	function draftKey(context) {
		return `doctor-clinical:${context.userId}:${context.appointmentId}`;
	}

	window.QLPKDoctorModuleRegistry.register('draftRecoveryStore', Object.freeze({
		DRAFT_TTL_MS,
		draftKey,
		readRecord,
		writeRecord,
		deleteRecord,
		deleteRecordIfMatches,
		replaceRecordIfMatches,
		purgeExpiredRecords,
		deleteUserRecords
	}), { owner: 'doctor/draft-recovery' });
})(window);
