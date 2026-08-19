const OrderCatalogSimple = (() => {
    const state = {
        items: [],
        searchKeyword: '',
        editingItemId: null,
        defaultCategoryId: null,
        itemsMap: new Map(),
        childrenMap: new Map(),
        treeRoots: [],
        groupPicker: {
            isOpen: false,
            selectedId: null,
            selectedLabel: '',
            expandedNodes: new Set(),
        },
    };

    const els = {};
    let orderItemModal = null;
    let deleteModal = null;
    const deleteContext = { type: null, id: null };

    function init() {
        cacheElements();
        initModals();
        bindEvents();
        bindRealtimeHooks();
        fetchInitialData();
    }

    function cacheElements() {
        els.alert = document.getElementById('orderCatalogAlert');
        els.searchInput = document.getElementById('globalSearchInput');
        els.refreshBtn = document.getElementById('refreshItemsBtn');
        els.addItemBtn = document.getElementById('addOrderItemBtn');
        els.tableBody = document.getElementById('orderItemsTableBody');
        els.emptyState = document.getElementById('orderItemsEmptyState');

        els.orderItemForm = document.getElementById('orderItemForm');
        els.orderItemModalTitle = document.getElementById('orderItemModalTitle');
        els.orderItemNameInput = document.getElementById('orderItemNameInput');
        els.orderItemPerformerInput = document.getElementById('orderItemPerformerInput');
        els.orderItemDescriptionInput = document.getElementById('orderItemDescriptionInput');
        els.orderItemInHouseYes = document.getElementById('optionInHouse');
        els.orderItemInHouseNo = document.getElementById('optionOutHouse');
        els.orderItemIsActiveInput = document.getElementById('orderItemIsActiveInput');
        els.orderItemFormSubmit = document.getElementById('orderItemFormSubmit');
        els.orderItemGroupTrigger = document.getElementById('orderItemGroupTrigger');
        els.orderItemGroupPanel = document.getElementById('orderItemGroupPanel');
        els.orderItemGroupList = document.getElementById('orderItemGroupList');
        els.orderItemGroupLabel = document.getElementById('orderItemGroupLabel');
        els.orderItemGroupValue = document.getElementById('orderItemGroupValue');
        els.orderItemGroupClear = document.getElementById('orderItemGroupClear');

        els.confirmDeleteMessage = document.getElementById('confirmDeleteMessage');
        els.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    }

    function initModals() {
        if (!window.bootstrap) return;
        const itemModalEl = document.getElementById('orderItemModal');
        if (itemModalEl) orderItemModal = new bootstrap.Modal(itemModalEl);
        const deleteModalEl = document.getElementById('confirmDeleteModal');
        if (deleteModalEl) deleteModal = new bootstrap.Modal(deleteModalEl);
    }

    function bindEvents() {
        els.searchInput?.addEventListener('input', () => {
            state.searchKeyword = els.searchInput.value.trim().toLowerCase();
            renderTable();
        });

        els.refreshBtn?.addEventListener('click', fetchInitialData);
        els.addItemBtn?.addEventListener('click', () => openOrderItemModal('create'));
        els.tableBody?.addEventListener('click', handleTableClick);
        els.orderItemForm?.addEventListener('submit', handleOrderItemSubmit);
        els.confirmDeleteBtn?.addEventListener('click', handleDeleteConfirmed);
        els.orderItemGroupTrigger?.addEventListener('click', toggleGroupPicker);
        els.orderItemGroupList?.addEventListener('click', handleGroupListClick);
        els.orderItemGroupClear?.addEventListener('click', clearGroupSelection);
        document.addEventListener('click', handleGlobalClick);
    }

    function bindRealtimeHooks() {
        if (!window.QLPKRealtimePageHooks) return;
        window.QLPKRealtimePageHooks.register({
            types: ['catalog.changed'],
            filter: (event) => event?.payload?.entity === 'order_catalog',
            handler: fetchInitialData,
            debounceMs: 350,
        });
    }

    async function fetchInitialData() {
        await fetchItems();
    }

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        let token = localStorage.getItem('qlpk_token') || localStorage.getItem('token');
        if (token) {
            token = token.trim();
            if (token.startsWith('{')) {
                try {
                    const parsed = JSON.parse(token);
                    token = parsed.access_token || parsed.token;
                } catch (e) {
                    token = null;
                }
            }
        }
        if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
        return headers;
    }

    async function fetchItems() {
        try {
            setTableLoading(true);
            const response = await fetch('/api/order-items?include_inactive=true', { headers: getHeaders() });
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            if (!response.ok) {
                const payload = await safeJson(response);
                throw new Error(payload?.detail || 'Không thể tải chỉ định');
            }
            const payload = await response.json();
            state.items = Array.isArray(payload.data) ? payload.data : [];
            state.defaultCategoryId = payload.default_category_id ?? null;
            rebuildItemRelations();
            renderTable();
        } catch (error) {
            console.error(error);
			showAlert('Không thể tải chỉ định. Vui lòng thử lại.');
            state.items = [];
            renderTable();
        } finally {
            setTableLoading(false);
        }
    }

    function rebuildItemRelations() {
        state.itemsMap = new Map();
        state.childrenMap = new Map();
        state.items.forEach((item) => {
            state.itemsMap.set(item.id, item);
            const key = item.group_order_item_id ?? null;
            if (!state.childrenMap.has(key)) {
                state.childrenMap.set(key, []);
            }
            state.childrenMap.get(key).push(item.id);
        });
        buildTreeRoots();
    }

    function buildTreeRoots() {
        const nodes = new Map();
        state.items.forEach((item) => {
            nodes.set(item.id, { ...item, children: [] });
        });
        const roots = [];
        nodes.forEach((node) => {
            const parentId = node.group_order_item_id;
            if (parentId && nodes.has(parentId)) {
                nodes.get(parentId).children.push(node);
            } else {
                roots.push(node);
            }
        });
        sortTreeNodes(roots);
        state.treeRoots = roots;
        state.groupPicker.expandedNodes = new Set(roots.map((node) => node.id));
    }

    function sortTreeNodes(list) {
        list.sort((a, b) => {
            const sortCompare = (a.sort_order || 0) - (b.sort_order || 0);
            if (sortCompare !== 0) return sortCompare;
            return (a.name || '').localeCompare(b.name || '');
        });
        list.forEach((node) => {
            if (node.children && node.children.length) {
                sortTreeNodes(node.children);
            }
        });
    }

    function getDescendantIds(rootId, acc = new Set()) {
        const children = state.childrenMap.get(rootId) || [];
        children.forEach((childId) => {
            if (!acc.has(childId)) {
                acc.add(childId);
                getDescendantIds(childId, acc);
            }
        });
        return acc;
    }

    function getGroupExcludeSet() {
        const exclude = state.editingItemId ? getDescendantIds(state.editingItemId) : new Set();
        if (state.editingItemId) exclude.add(state.editingItemId);
        return exclude;
    }

    function renderGroupTree(excludeIds = new Set()) {
        if (!els.orderItemGroupList) return;
        const tree = state.treeRoots || [];
        if (!tree.length) {
            els.orderItemGroupList.innerHTML = '<div class="group-tree-empty">Chưa có chỉ định nào để chọn.</div>';
            return;
        }
        ensureGroupPickerExpansionDefaults();
        const rootButton = `
            <div class="px-3 mb-2">
                <button type="button" class="group-tree-item" data-group-node="" data-disabled="false">
                    (Không chọn – trở thành chỉ định cha)
                </button>
            </div>`;
        const html = rootButton + tree.map((node) => renderGroupTreeNode(node, 0, excludeIds)).join('');
        els.orderItemGroupList.innerHTML = html;
    }

    function ensureGroupPickerExpansionDefaults() {
        if (!state.groupPicker.expandedNodes) {
            state.groupPicker.expandedNodes = new Set();
        }
        if (!state.groupPicker.expandedNodes.size && state.treeRoots?.length) {
            state.treeRoots.forEach((root) => state.groupPicker.expandedNodes.add(root.id));
        }
    }

    function renderGroupTreeNode(node, depth, excludeIds) {
        const indent = depth * 16;
        const disabled = excludeIds.has(node.id);
        const children = node.children || [];
        const hasChildren = children.length > 0;
        const isExpanded = state.groupPicker.expandedNodes.has(node.id);
        const toggleMarkup = hasChildren
            ? `<button type="button" class="group-tree-toggle" data-group-toggle="${node.id}">
                    <i class="bi ${isExpanded ? 'bi-caret-down-fill' : 'bi-caret-right-fill'}"></i>
               </button>`
            : '<span class="group-tree-placeholder"></span>';
        return `
            <div class="group-tree-node">
                <div class="group-tree-row" style="padding-left:${indent}px;">
                    ${toggleMarkup}
                    <button type="button"
                        class="group-tree-item ${disabled ? 'disabled' : ''}"
                        data-group-node="${node.id}"
                        data-disabled="${disabled}"
                        data-path="${escapeHtml(node.group_path || node.name || '')}">
                        ${escapeHtml(node.name || '')}
                    </button>
                </div>
                ${hasChildren && isExpanded ? children.map((child) => renderGroupTreeNode(child, depth + 1, excludeIds)).join('') : ''}
            </div>
        `;
    }

    function toggleGroupPicker(event) {
        event?.preventDefault();
        event?.stopPropagation();
        if (state.groupPicker.isOpen) {
            closeGroupPicker();
        } else {
            renderGroupTree(getGroupExcludeSet());
            state.groupPicker.isOpen = true;
            els.orderItemGroupPanel?.classList.remove('d-none');
        }
    }

    function closeGroupPicker() {
        state.groupPicker.isOpen = false;
        els.orderItemGroupPanel?.classList.add('d-none');
    }

    function handleGlobalClick(event) {
        if (!state.groupPicker.isOpen) return;
        if (
            els.orderItemGroupPanel?.contains(event.target) ||
            els.orderItemGroupTrigger?.contains(event.target)
        ) {
            return;
        }
        closeGroupPicker();
    }

    function handleGroupListClick(event) {
        const toggleBtn = event.target.closest('[data-group-toggle]');
        if (toggleBtn) {
            const toggleId = Number(toggleBtn.dataset.groupToggle);
            if (state.groupPicker.expandedNodes.has(toggleId)) {
                state.groupPicker.expandedNodes.delete(toggleId);
            } else {
                state.groupPicker.expandedNodes.add(toggleId);
            }
            renderGroupTree(getGroupExcludeSet());
            return;
        }
        const target = event.target.closest('[data-group-node]');
        if (!target) return;
        if (target.dataset.disabled === 'true') return;
        const rawValue = target.dataset.groupNode;
        if (!rawValue) {
            setGroupSelection(null);
            closeGroupPicker();
            return;
        }
        const nodeId = Number(rawValue);
        setGroupSelection(nodeId);
        closeGroupPicker();
    }

    function setGroupSelection(nodeId) {
        if (!nodeId) {
            state.groupPicker.selectedId = null;
            state.groupPicker.selectedLabel = '';
            if (els.orderItemGroupValue) els.orderItemGroupValue.value = '';
            updateGroupPickerLabel(null);
            return;
        }
        const item = state.itemsMap.get(nodeId);
        if (!item) return;
        state.groupPicker.selectedId = nodeId;
        state.groupPicker.selectedLabel = formatSelectedLabel(item);
        if (els.orderItemGroupValue) els.orderItemGroupValue.value = nodeId;
        updateGroupPickerLabel(state.groupPicker.selectedLabel);
    }

    function updateGroupPickerLabel(label) {
        if (!els.orderItemGroupLabel) return;
        if (label) {
            els.orderItemGroupLabel.textContent = label;
            els.orderItemGroupLabel.classList.remove('text-muted');
        } else {
            els.orderItemGroupLabel.textContent = 'Không chọn (trở thành chỉ định cha)';
            els.orderItemGroupLabel.classList.add('text-muted');
        }
    }

    function formatSelectedLabel(item) {
        if (!item) return '';
        if (item.group_path) {
            const segments = item.group_path.split(' › ').filter(Boolean);
            return segments.join(' › ');
        }
        return item.name || '';
    }

    function clearGroupSelection(event) {
        event?.preventDefault();
        setGroupSelection(null);
        closeGroupPicker();
    }

    function getParentPathLabel(item) {
        if (!item?.group_path) return '';
        const segments = item.group_path.split(' › ').filter(Boolean);
        if (!segments.length) return '';
        segments.pop(); // remove current item
        return segments.join(' › ');
    }

    function renderTable() {
        if (!els.tableBody) return;
        const keyword = state.searchKeyword;
        const filtered = state.items.filter((item) => {
            if (!keyword) return true;
            const name = (item.name || '').toLowerCase();
            const performer = (item.performer || '').toLowerCase();
            const path = (item.group_path || '').toLowerCase();
            return name.includes(keyword) || performer.includes(keyword) || path.includes(keyword);
        });

        if (!filtered.length) {
            els.tableBody.innerHTML = '';
            toggleElement(els.emptyState, true);
            return;
        }

        toggleElement(els.emptyState, false);
        const sorted = [...filtered].sort((a, b) => {
            const pathCompare = (a.group_path || '').localeCompare(b.group_path || '');
            if (pathCompare !== 0) return pathCompare;
            return (a.name || '').localeCompare(b.name || '');
        });

        const rows = [];
        sorted.forEach((item, idx) => {
            const badgeClass = item.is_in_house ? 'bg-primary-subtle text-primary' : 'bg-secondary-subtle text-muted';
            const badgeLabel = item.is_in_house ? 'Trong cơ sở' : 'Ngoài cơ sở';
            const indent = (item.group_level || 0) * 16;
            const parentPath = getParentPathLabel(item);
            const parentInfo = parentPath ? `<div class="small text-muted">Nhóm: ${escapeHtml(parentPath)}</div>` : '';

            rows.push(`
                <tr data-item-id="${item.id}">
                    <td>${idx + 1}</td>
                    <td>
                        <div class="fw-semibold" style="margin-left:${indent}px">${escapeHtml(item.name || '')}</div>
                        ${parentInfo}
                    </td>
                    <td>${escapeHtml(item.performer || '—')}</td>
                    <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-primary me-1" data-edit-item="${item.id}"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger" data-delete-item="${item.id}"><i class="bi bi-trash"></i></button>
                    </td>
                </tr>
            `);
        });

        els.tableBody.innerHTML = rows.join('');
    }

    function setTableLoading(isLoading) {
        if (!els.tableBody) return;
        if (isLoading) {
            els.tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-4">
                        <div class="spinner-border text-primary" role="status"></div>
                        <p class="mb-0 mt-2">Đang tải dữ liệu...</p>
                    </td>
                </tr>`;
            toggleElement(els.emptyState, false);
        }
    }

    function handleTableClick(event) {
        const editBtn = event.target.closest('[data-edit-item]');
        if (editBtn) {
            openOrderItemModal('edit', Number(editBtn.getAttribute('data-edit-item')));
            return;
        }
        const deleteBtn = event.target.closest('[data-delete-item]');
        if (deleteBtn) {
            const id = Number(deleteBtn.getAttribute('data-delete-item'));
            const item = state.items.find((itm) => itm.id === id);
            confirmDeletion('item', id, item?.name || 'chỉ định');
        }
    }

    function openOrderItemModal(mode, itemId = null) {
        if (!orderItemModal) return;
        state.editingItemId = mode === 'edit' ? itemId : null;
        els.orderItemForm.reset();
        els.orderItemIsActiveInput.checked = true;
        els.orderItemInHouseYes.checked = true;
        els.orderItemInHouseNo.checked = false;
        setGroupSelection(null);
        closeGroupPicker();
        const exclude = getGroupExcludeSet();
        renderGroupTree(exclude);

        if (mode === 'edit' && itemId) {
            const item = state.items.find((itm) => itm.id === itemId);
            if (!item) {
                showAlert('Không tìm thấy chỉ định này');
                return;
            }
            els.orderItemModalTitle.textContent = 'Chỉnh sửa chỉ định';
            els.orderItemNameInput.value = item.name || '';
            els.orderItemPerformerInput.value = item.performer || '';
            els.orderItemDescriptionInput.value = item.description || '';
            if (item.is_in_house) {
                els.orderItemInHouseYes.checked = true;
            } else {
                els.orderItemInHouseNo.checked = true;
            }
            els.orderItemIsActiveInput.checked = Boolean(item.is_active);
            renderGroupTree(exclude);
            if (item.group_order_item_id && state.itemsMap.has(item.group_order_item_id)) {
                setGroupSelection(item.group_order_item_id);
            } else {
                setGroupSelection(null);
            }
        } else {
            els.orderItemModalTitle.textContent = 'Thêm chỉ định mới';
            renderGroupTree(exclude);
        }

        orderItemModal.show();
    }

    async function handleOrderItemSubmit(event) {
        event.preventDefault();
        const selectedParentId = state.groupPicker.selectedId ? Number(state.groupPicker.selectedId) : null;
        let categoryId = null;
        if (selectedParentId && state.itemsMap.has(selectedParentId)) {
            categoryId = state.itemsMap.get(selectedParentId).category_id;
        } else {
            categoryId = state.defaultCategoryId;
        }
        if (!categoryId) {
            showAlert('Chưa cấu hình danh mục mặc định cho chỉ định gốc');
            return;
        }

        const payload = {
            category_id: categoryId,
            name: els.orderItemNameInput.value.trim(),
            performer: els.orderItemPerformerInput.value.trim() || null,
            description: els.orderItemDescriptionInput.value.trim() || null,
            is_in_house: els.orderItemInHouseYes.checked,
            is_active: Boolean(els.orderItemIsActiveInput.checked),
            group_order_item_id: selectedParentId,
        };
        if (!payload.name) {
            showAlert('Tên chỉ định là bắt buộc');
            return;
        }
        const isEdit = Boolean(state.editingItemId);
        const url = isEdit ? `/api/order-items/${state.editingItemId}` : '/api/order-items';
        const method = isEdit ? 'PUT' : 'POST';
        try {
            disableButton(els.orderItemFormSubmit, true);
            const response = await fetch(url, {
                method,
                headers: getHeaders(),
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const err = await safeJson(response);
                throw new Error(err?.detail || 'Không thể lưu chỉ định');
            }
            showAlert(isEdit ? 'Cập nhật chỉ định thành công' : 'Thêm chỉ định thành công', 'success');
            orderItemModal.hide();
            await fetchItems();
        } catch (error) {
            console.error(error);
			showAlert('Không thể lưu chỉ định. Vui lòng kiểm tra lại.');
        } finally {
            disableButton(els.orderItemFormSubmit, false);
        }
    }

    function confirmDeletion(type, id, name) {
        deleteContext.type = type;
        deleteContext.id = id;
        if (els.confirmDeleteMessage) {
            els.confirmDeleteMessage.textContent = `Bạn có chắc chắn muốn xoá ${name}?`;
        }
        deleteModal?.show();
    }

    async function handleDeleteConfirmed() {
        if (!deleteContext.type || !deleteContext.id) return;
        try {
            disableButton(els.confirmDeleteBtn, true);
            const response = await fetch(`/api/order-items/${deleteContext.id}`, { method: 'DELETE', headers: getHeaders() });
            const payload = await safeJson(response);
            if (!response.ok || payload?.success === false) {
                throw new Error(payload?.detail || 'Không thể xoá');
            }
            showAlert('Xoá thành công', 'success');
            deleteModal?.hide();
            await fetchItems();
        } catch (error) {
            console.error(error);
			showAlert('Không thể xóa chỉ định. Vui lòng thử lại.');
        } finally {
            disableButton(els.confirmDeleteBtn, false);
            deleteContext.type = null;
            deleteContext.id = null;
        }
    }

    function toggleElement(element, shouldShow) {
        if (!element) return;
        element.classList.toggle('d-none', !shouldShow);
    }

    function disableButton(button, isDisabled) {
        if (!button) return;
        button.disabled = isDisabled;
        if (isDisabled) {
            button.dataset.originalText = button.innerHTML;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Đang xử lý';
        } else if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }

    function showAlert(message, type = 'danger') {
        if (!els.alert) return;
        if (!message) {
            els.alert.classList.add('d-none');
            els.alert.textContent = '';
            return;
        }
        const classes = {
            success: 'alert-success',
            info: 'alert-info',
            warning: 'alert-warning',
            danger: 'alert-danger',
        };
        els.alert.className = `alert ${classes[type] || classes.danger}`;
        els.alert.textContent = message;
        els.alert.classList.remove('d-none');
        setTimeout(() => els.alert?.classList.add('d-none'), 4000);
    }

    function escapeHtml(value = '') {
        return value
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function safeJson(response) {
        try {
            return await response.json();
        } catch (error) {
            return null;
        }
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
    OrderCatalogSimple.init();
});
