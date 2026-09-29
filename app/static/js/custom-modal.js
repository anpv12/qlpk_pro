// Custom Modal Utility Functions
window.CustomModal = {
  // Hiển thị modal xác nhận
  confirm: function(message, title = 'Xác nhận', type = 'warning', buttonRole = 'execute') {
    return new Promise((resolve) => {
      const modalId = 'custom-confirm-modal-' + Date.now();
      
      const modalHTML = `
        <div id="${modalId}" class="custom-modal-overlay">
          <div class="custom-modal">
            <div class="custom-modal-icon ${type}">!</div>
            <div class="custom-modal-title">${title}</div>
            <div class="custom-modal-message">${message}</div>
            <div class="custom-modal-buttons">
              <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" class="custom-modal-btn cancel" data-qlpk-call="CustomModal.closeModal" data-qlpk-args='["${modalId}", false]'>Hủy bỏ</button>
              <button data-qlpk-button="${buttonRole === 'danger' ? 'danger' : 'execute'}" data-qlpk-button-variant="solid" class="custom-modal-btn confirm" data-qlpk-call="CustomModal.closeModal" data-qlpk-args='["${modalId}", true]'>Xác nhận</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      
      // Lưu promise resolve function
      window[modalId + '_resolve'] = resolve;
      
      // Thêm event listener cho overlay click
      document.getElementById(modalId).addEventListener('click', function(e) {
        if (e.target.id === modalId) {
          window.CustomModal.closeModal(modalId, false);
        }
      });
      
      // Thêm event listener cho ESC key
      const escHandler = function(e) {
        if (e.key === 'Escape') {
          window.CustomModal.closeModal(modalId, false);
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
    });
  },
  
  // Hiển thị modal thông báo
  alert: function(message, title = 'Thông báo', type = 'success') {
    return new Promise((resolve) => {
      const modalId = 'custom-alert-modal-' + Date.now();
      
      const modalHTML = `
        <div id="${modalId}" class="custom-modal-overlay">
          <div class="custom-modal">
            <div class="custom-modal-icon ${type}">✓</div>
            <div class="custom-modal-title">${title}</div>
            <div class="custom-modal-message">${message}</div>
            <div class="custom-modal-buttons">
              <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" class="custom-modal-btn success" data-qlpk-call="CustomModal.closeModal" data-qlpk-args='["${modalId}", true]'>OK</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      
      // Lưu promise resolve function
      window[modalId + '_resolve'] = resolve;
      
      // Thêm event listener cho overlay click
      document.getElementById(modalId).addEventListener('click', function(e) {
        if (e.target.id === modalId) {
          window.CustomModal.closeModal(modalId, true);
        }
      });
      
      // Thêm event listener cho ESC key
      const escHandler = function(e) {
        if (e.key === 'Escape') {
          window.CustomModal.closeModal(modalId, true);
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
    });
  },
  
  // Đóng modal
  closeModal: function(modalId, result) {
    const modal = document.getElementById(modalId);
    if (modal) {
      // Thêm animation đóng
      modal.classList.add('is-closing');
      
      setTimeout(() => {
        modal.remove();
        // Gọi resolve function
        if (window[modalId + '_resolve']) {
          window[modalId + '_resolve'](result);
          delete window[modalId + '_resolve'];
        }
      }, 200);
    }
  }
};

