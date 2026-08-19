(function () {
  'use strict';

  function getEl(id) {
    return document.getElementById(id);
  }

  function init(options = {}) {
    const buttonId = options.buttonId || 'notesUploadBtn';
    const countId = options.countId || 'notesAttachmentCount';
    const modalId = options.modalId || 'medicalHistoryModal';
    const tabId = options.tabId || 'documents-tab';
    const targetId = options.targetId || 'receptionistDocumentsSection';
    const onBeforeOpen = typeof options.onBeforeOpen === 'function' ? options.onBeforeOpen : null;
    const getTotalCount = typeof options.getTotalCount === 'function' ? options.getTotalCount : (() => 0);

    const button = getEl(buttonId);
    const countEl = getEl(countId);
    if (!button || !countEl) {
      return {
        update: function () { },
        bind: function () { }
      };
    }

    function update() {
      let total = 0;
      try {
        total = Number(getTotalCount() || 0);
      } catch (_) {
        total = 0;
      }
      countEl.textContent = String(total);
      button.classList.toggle('active-has-files', total > 0);
    }

    async function handleClick() {
      const modalEl = getEl(modalId);
      const tabBtn = getEl(tabId);

      try {
        if (onBeforeOpen) await onBeforeOpen();
      } catch (_) { }

      if (!modalEl || !tabBtn) {
        const target = getEl(targetId) || getEl('documentsList');
        if (!target) return;

        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.add('is-guided-focus');
        window.setTimeout(() => target.classList.remove('is-guided-focus'), 900);

        const uploadBtn = getEl('uploadDocumentBtn');
        if (uploadBtn && typeof uploadBtn.focus === 'function') {
          window.setTimeout(() => uploadBtn.focus({ preventScroll: true }), 250);
        }
        return;
      }

      const modal = window.bootstrap?.Modal?.getOrCreateInstance
        ? bootstrap.Modal.getOrCreateInstance(modalEl)
        : null;
      if (modal) modal.show();

      if (window.bootstrap?.Tab?.getOrCreateInstance) {
        bootstrap.Tab.getOrCreateInstance(tabBtn).show();
      } else {
        tabBtn.click();
      }
    }

    function bind() {
      if (button.dataset.notesChipBound === '1') return;
      button.addEventListener('click', handleClick);
      button.dataset.notesChipBound = '1';
    }

    bind();
    update();

    return { update, bind };
  }

  window.NotesAttachmentChip = {
    init
  };
})();
