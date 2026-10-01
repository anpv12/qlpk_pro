// Keep the editing context visible while reusing the existing inventory dialogs.
function showInventoryOverlay(element) {
    if (element.classList.contains('show')) return;
    const parent = [...document.querySelectorAll('.modal.show')].reverse().find(node =>
        node !== element && !node.inert && ['medicineModal', 'importBatchModal'].includes(node.id));
    const modal = window.bootstrap.Modal.getOrCreateInstance(element);
    if (!parent) { modal.show(); return; }
    const parentModal = window.bootstrap.Modal.getOrCreateInstance(parent);
    const trigger = document.activeElement;
    const parentHidden = parent.getAttribute('aria-hidden');
    const parentModalAttribute = parent.getAttribute('aria-modal');
    const bodyOverflow = document.body.style.overflow;
    const bodyPadding = document.body.style.paddingRight;
    const scrollbarAttributes = ['data-bs-overflow', 'data-bs-padding-right'].map(name => [name, document.body.getAttribute(name)]);
    const level = Number(parent.dataset.inventoryModalLayer || 0) + 1;
    const existingBackdrops = new Set(document.querySelectorAll('.modal-backdrop'));
    element.dataset.inventoryModalLayer = String(level);
    // Bootstrap 5.3.2 shares focus-trap listeners across modal instances.
    // Deactivate the parent before opening, then reactivate it after dismissal.
    parentModal._focustrap.deactivate();
    parent.inert = true;
    element.addEventListener('shown.bs.modal', () => {
        parent.setAttribute('aria-hidden', 'true');
        parent.removeAttribute('aria-modal');
    }, { once: true });
    element.addEventListener('hidden.bs.modal', () => {
        delete element.dataset.inventoryModalLayer;
        parent.inert = false;
        if (!parent.classList.contains('show')) return;
        if (parentHidden == null) parent.removeAttribute('aria-hidden');
        else parent.setAttribute('aria-hidden', parentHidden);
        if (parentModalAttribute == null) parent.removeAttribute('aria-modal');
        else parent.setAttribute('aria-modal', parentModalAttribute);
        document.body.classList.add('modal-open');
        document.body.style.overflow = bodyOverflow;
        document.body.style.paddingRight = bodyPadding;
        scrollbarAttributes.forEach(([name, value]) => {
            if (value == null) document.body.removeAttribute(name);
            else document.body.setAttribute(name, value);
        });
        parentModal._focustrap.activate();
        if (trigger?.isConnected && parent.contains(trigger)) trigger.focus();
    }, { once: true });
    modal.show();
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        if (!existingBackdrops.has(backdrop)) backdrop.dataset.inventoryModalLayer = String(level);
    });
}

export { showInventoryOverlay };
