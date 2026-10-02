// Relative Link Handler Utility
// Giúp các trang (receptionist, doctor, ...) xử lý sự kiện open-relative-search đồng nhất

const RelativeLinkHandler = (() => {
    let resolver = null;
    let initialized = false;

    function registerResolver(fn) {
        if (typeof fn === 'function') {
            resolver = fn;
        }
    }

    async function handle(patientId) {
        if (typeof resolver === 'function') {
            try {
                await resolver(patientId);
            } catch (error) {
                console.error('RelativeLinkHandler resolver error:', error);
            }
        } else {
            console.warn('RelativeLinkHandler resolver is not defined');
        }
    }

    function init(options = {}) {
        if (initialized) return api;
        const { autoRegisterResolver } = options;

        if (autoRegisterResolver && typeof autoRegisterResolver === 'function') {
            registerResolver(autoRegisterResolver);
        }

        window.addEventListener('open-relative-search', (event) => {
            const patientId = Number(event.detail?.patientId);
            if (!patientId) return;
            handle(patientId);
        });

        initialized = true;
        return api;
    }

    const api = {
        registerResolver,
        handle,
        init,
    };

    return api;
})();

RelativeLinkHandler.init();

export { RelativeLinkHandler };
