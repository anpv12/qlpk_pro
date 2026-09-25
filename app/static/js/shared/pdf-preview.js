(function (window) {
    'use strict';

    async function inlineVerificationImages(document) {
        for (const image of document.querySelectorAll('img')) {
            const source = new URL(image.getAttribute('src') || '', window.location.origin);
            if (source.origin !== window.location.origin || !/^\/api\/public\/prescription\/[^/]+\/verification-qr\.png$/.test(source.pathname)) continue;
            const response = await window.fetch(source.href);
            if (!response.ok) throw new Error('Không tải được mã QR xác thực');
            const blob = await response.blob();
            image.src = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }
    }

    async function render(tab, html) {
        if (!tab || tab.closed) throw new Error('Tab xem trước đã đóng');
        try {
            const document = new DOMParser().parseFromString(html, 'text/html');
            await inlineVerificationImages(document);
            const token = window.localStorage.getItem('qlpk_token') || window.localStorage.getItem('token') || window.sessionStorage.getItem('qlpk_token') || '';
            const controller = new AbortController();
            const timeout = window.setTimeout(() => controller.abort(), 55000);
            let response;
            try {
                response = await window.fetch('/api/print/preview.pdf', {
                    method: 'POST',
                    headers: {'Content-Type': 'text/html; charset=utf-8', 'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`},
                    body: '<!DOCTYPE html>' + document.documentElement.outerHTML,
                    signal: controller.signal
                });
            } finally {
                window.clearTimeout(timeout);
            }
            if (!response.ok) throw new Error((await response.json()).detail || 'Không thể tạo PDF');
            const blob = await response.blob();
            if (!blob.type.includes('application/pdf')) throw new Error('Phản hồi không phải PDF');
            if (tab.closed) return null;
            const url = window.URL.createObjectURL(blob);
            tab.location.replace(url);
            const cleanup = window.setInterval(() => {
                if (!tab.closed) return;
                window.URL.revokeObjectURL(url);
                window.clearInterval(cleanup);
            }, 1000);
            return tab;
        } catch (error) {
            if (!tab.closed) {
                tab.document.open();
                tab.document.write('<!doctype html><meta charset="utf-8"><title>Không thể tạo PDF</title><p>Không thể tạo PDF. Vui lòng đóng tab và thử lại.</p>');
                tab.document.close();
            }
            throw error;
        }
    }

    window.QLPKPdfPreview = Object.freeze({render});
})(window);
