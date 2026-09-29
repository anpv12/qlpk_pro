/* One renderer for clinic list pagination. Page owners retain data loading. */
(function () {
    'use strict';
    const sizes = [10, 20, 50, 100];

    function create({ onChange }) {
        const root = document.getElementById('clinicPagination');
        const select = root.querySelector('#clinicPageSize');
        const info = root.querySelector('#clinicPageInfo');
        const links = root.querySelector('#clinicPageLinks');
        let state = { page: 1, pageSize: 10, total: 0 };

        function update({ page = 1, pageSize = 10, total = 0 }) {
            total = Math.max(0, Number(total) || 0);
            pageSize = sizes.includes(Number(pageSize)) ? Number(pageSize) : 10;
            const pages = Math.max(1, Math.ceil(total / pageSize));
            page = Math.max(1, Math.min(pages, Number(page) || 1));
            state = { page, pageSize, total };
            select.value = String(pageSize);
            info.textContent = `${total ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, total)} / ${total} mục`;
            links.replaceChildren();

            function button(label, target, disabled, active = false) {
                const li = document.createElement('li');
                li.className = `page-item${disabled ? ' disabled' : ''}${active ? ' active' : ''}`;
                const control = document.createElement('button');
                control.type = 'button';
                control.className = 'page-link';
                control.textContent = label;
                control.dataset.page = String(target);
                control.disabled = disabled;
                control.setAttribute('aria-label', ({ '‹': 'Trang trước', '›': 'Trang sau' })[label] || `Trang ${target}`);
                if (active) control.setAttribute('aria-current', 'page');
                li.append(control);
                links.append(li);
            }
            button('‹', page - 1, page === 1);
            const visible = [...new Set([1, page - 1, page, page + 1, pages])].filter(p => p >= 1 && p <= pages).sort((a, b) => a - b);
            visible.forEach((p, index) => {
                if (index && p - visible[index - 1] > 1) {
                    const gap = document.createElement('li');
                    gap.className = 'page-item disabled';
                    gap.innerHTML = '<span class="page-link" aria-hidden="true">…</span>';
                    links.append(gap);
                }
                button(String(p), p, false, p === page);
            });
            button('›', page + 1, page === pages);
        }

        select.addEventListener('change', () => {
            const pageSize = Number(select.value);
            if (sizes.includes(pageSize)) onChange(1, pageSize);
        });
        links.addEventListener('click', event => {
            const button = event.target.closest('button[data-page]');
            if (!button || button.disabled) return;
            const page = Number(button.dataset.page);
            if (page !== state.page) onChange(page, state.pageSize);
        });
        update(state);
        return { update };
    }

    function createClient({ render }) {
        let items = [];
        let page = 1;
        let pageSize = 10;
        const pagination = create({ onChange(nextPage, nextSize) {
            page = nextPage;
            pageSize = nextSize;
            draw();
        } });
        function draw() {
            page = Math.max(1, Math.min(page, Math.ceil(items.length / pageSize)));
            const offset = (page - 1) * pageSize;
            pagination.update({ page, pageSize, total: items.length });
            render(items.slice(offset, offset + pageSize), offset);
        }
        return { setItems(nextItems) { items = nextItems; page = 1; draw(); } };
    }

    window.QLPKPagination = { create, createClient };
})();
