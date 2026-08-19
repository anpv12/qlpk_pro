// Custom Modal Utility Functions
window.CustomModal = {
  // Hiển thị modal xác nhận
  confirm: function(message, title = 'Xác nhận', type = 'warning') {
    return new Promise((resolve) => {
      const modalId = 'custom-confirm-modal-' + Date.now();
      
      const modalHTML = `
        <div id="${modalId}" class="custom-modal-overlay">
          <div class="custom-modal">
            <div class="custom-modal-icon ${type}">!</div>
            <div class="custom-modal-title">${title}</div>
            <div class="custom-modal-message">${message}</div>
            <div class="custom-modal-buttons">
              <button class="custom-modal-btn cancel" onclick="CustomModal.closeModal('${modalId}', false)">Hủy bỏ</button>
              <button class="custom-modal-btn confirm" onclick="CustomModal.closeModal('${modalId}', true)">Xác nhận</button>
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
          CustomModal.closeModal(modalId, false);
        }
      });
      
      // Thêm event listener cho ESC key
      const escHandler = function(e) {
        if (e.key === 'Escape') {
          CustomModal.closeModal(modalId, false);
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
              <button class="custom-modal-btn success" onclick="CustomModal.closeModal('${modalId}', true)">OK</button>
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
          CustomModal.closeModal(modalId, true);
        }
      });
      
      // Thêm event listener cho ESC key
      const escHandler = function(e) {
        if (e.key === 'Escape') {
          CustomModal.closeModal(modalId, true);
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
  },
  
  // Thay thế window.confirm
  replaceConfirm: function() {
    const originalConfirm = window.confirm;
    window.confirm = function(message) {
      return CustomModal.confirm(message, 'Xác nhận', 'warning');
    };
  },
  
  // Thay thế window.alert
  replaceAlert: function() {
    const originalAlert = window.alert;
    window.alert = function(message) {
      return CustomModal.alert(message, 'Thông báo', 'success');
    };
  }
};

// Tự động thay thế khi load
document.addEventListener('DOMContentLoaded', function() {
  CustomModal.replaceConfirm();
  CustomModal.replaceAlert();
}); 
