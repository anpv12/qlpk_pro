/* exported exportTemplate, importServices, openImportModal */
  let categories = [];
  let services = [];

  function normalizeSearchText(value) {
	return window.QLPKSearchNormalization?.normalizeSearchText(value)
	  || String(value || '').toLowerCase().trim();
  }

  // Toast function - đồng bộ với các màn hình khác
  function showToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message);
  }

  // Load danh mục
  function loadCategories() {
    $.ajax({
      url: '/service-categories/',
      method: 'GET',
      success: function(data) {
        categories = data;
        populateCategoryDropdowns();
      },
      error: function(xhr) {
        console.error('Error loading categories:', xhr);
        showToast('error', 'Không thể tải danh mục dịch vụ. Vui lòng thử lại.');
      }
    });
  }

  // Populate category dropdowns
  function populateCategoryDropdowns() {
    const addSelect = $('#serviceCategory');
    const editSelect = $('#editServiceCategory');
    
    addSelect.empty().append('<option value="">Chọn danh mục</option>');
    editSelect.empty().append('<option value="">Chọn danh mục</option>');
    
    categories.forEach(category => {
      if (category.is_active) {
        addSelect.append(`<option value="${category.id}">${window.QLPKHtml.escape(category.name)}</option>`);
        editSelect.append(`<option value="${category.id}">${window.QLPKHtml.escape(category.name)}</option>`);
      }
    });
  }

  // Load dịch vụ
  function loadServices() {
    $.ajax({
      url: '/services/',
      method: 'GET',
      success: function(data) {
        services = data;
        renderServices(services);
      },
      error: function(xhr) {
        console.error('Error loading services:', xhr);
        showToast('error', 'Không thể tải danh sách dịch vụ. Vui lòng thử lại.');
      }
    });
  }

  // Render dịch vụ
  const listPagination = window.QLPKPagination.createClient({ render: renderPage });
    function renderServices(servicesToRender) { listPagination.setItems(servicesToRender); }
    function renderPage(servicesToRender) {
    const tbody = $('#serviceTableBody');
    tbody.empty();
    
    if (servicesToRender.length === 0) {
      tbody.append(`
        <tr>
          <td colspan="7" class="text-center text-muted py-4">
            <i class="bi bi-inbox fs-1 d-block mb-2"></i>
            Chưa có dịch vụ nào
          </td>
        </tr>
      `);
      return;
    }
    
    servicesToRender.forEach(service => {
      const row = `
        <tr>
          <td>${service.id}</td>
          <td><strong>${window.QLPKHtml.escape(service.name)}</strong></td>
          <td>${window.QLPKHtml.escape(service.category_name || 'N/A')}</td>
          <td>${formatPrice(service.default_price)}</td>
          <td>${service.duration_minutes || 60}</td>
          <td>
            <span class="badge ${service.is_active ? 'bg-success' : 'bg-secondary'}">
              ${service.is_active ? 'Kích hoạt' : 'Không kích hoạt'}
            </span>
          </td>
          <td>
            <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="btn btn-sm btn-outline-primary me-1" data-qlpk-call="editService" data-qlpk-args='[${service.id}]' aria-label="Sửa dịch vụ" title="Sửa dịch vụ">
              <i class="bi bi-pencil"></i>
            </button>
            <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="btn btn-sm btn-outline-danger" data-qlpk-call="deleteService" data-qlpk-args='[${service.id}]' aria-label="Xóa dịch vụ" title="Xóa dịch vụ">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
      `;
      tbody.append(row);
    });
  }

  // Format price
  function formatPrice(price) {
    return new Intl.NumberFormat('vi-VN').format(price) + ' VNĐ';
  }

  // Thêm dịch vụ
  $('#addServiceForm').submit(function(e) {
    e.preventDefault();
    
    const name = $('#serviceName').val().trim();
    const categoryId = $('#serviceCategory').val();
    const defaultPrice = $('#defaultPrice').val();
    const durationMinutes = $('#durationMinutes').val();
    const description = $('#serviceDescription').val().trim();
    const isActive = $('#serviceActive').is(':checked');
    
    if (!name) {
      $('#serviceName').addClass('is-invalid');
      $('#nameError').text('Tên dịch vụ không được để trống');
      return;
    }
    
    if (!categoryId) {
      $('#serviceCategory').addClass('is-invalid');
      $('#categoryError').text('Vui lòng chọn danh mục');
      return;
    }
    
    if (defaultPrice === '' || defaultPrice === null || defaultPrice === undefined) {
      $('#defaultPrice').addClass('is-invalid');
      $('#priceError').text('Vui lòng nhập đơn giá');
      return;
    }
    if (parseFloat(defaultPrice) < 0) {
      $('#defaultPrice').addClass('is-invalid');
      $('#priceError').text('Đơn giá không được âm');
      return;
    }
    
    $('#serviceName, #serviceCategory, #defaultPrice').removeClass('is-invalid');
    
    const data = {
      name: name,
      category_id: parseInt(categoryId),
      default_price: parseFloat(defaultPrice),
      duration_minutes: parseInt(durationMinutes) || 60,
      description: description,
      is_active: isActive
    };
    
    
    $.ajax({
      url: '/services/',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(data),
      success: function() {
        showToast('success', 'Thêm dịch vụ thành công!');
        $('#addServiceModal').modal('hide');
        loadServices();
      },
      error: function(xhr) {
        console.error('Error adding service:', xhr);
        const error = 'Không thể thêm dịch vụ. Vui lòng kiểm tra lại.';
        showToast('error', error);
      }
    });
  });

  // Sửa dịch vụ
  window.editService = function(serviceId) {
    const service = services.find(s => s.id === serviceId);
    if (!service) return;
    
    $('#editServiceId').val(service.id);
    $('#editServiceName').val(service.name);
    $('#editServiceCategory').val(service.category_id);
    $('#editDefaultPrice').val(service.default_price);
    $('#editDurationMinutes').val(service.duration_minutes || 60);
    $('#editServiceDescription').val(service.description);
    $('#editServiceActive').prop('checked', service.is_active);
    
    $('#editServiceModal').modal('show');
  };

  // Cập nhật dịch vụ
  $('#updateServiceBtn').click(function() {
    const id = $('#editServiceId').val();
    const name = $('#editServiceName').val().trim();
    const categoryId = $('#editServiceCategory').val();
    const defaultPrice = $('#editDefaultPrice').val();
    const durationMinutes = $('#editDurationMinutes').val();
    const description = $('#editServiceDescription').val().trim();
    const isActive = $('#editServiceActive').is(':checked');
    
    if (!name) {
      $('#editServiceName').addClass('is-invalid');
      $('#editNameError').text('Tên dịch vụ không được để trống');
      return;
    }
    
    if (!categoryId) {
      $('#editServiceCategory').addClass('is-invalid');
      $('#editCategoryError').text('Vui lòng chọn danh mục');
      return;
    }
    
    if (defaultPrice === '' || defaultPrice === null || defaultPrice === undefined) {
      $('#editDefaultPrice').addClass('is-invalid');
      $('#editPriceError').text('Vui lòng nhập đơn giá');
      return;
    }
    if (parseFloat(defaultPrice) < 0) {
      $('#editDefaultPrice').addClass('is-invalid');
      $('#editPriceError').text('Đơn giá không được âm');
      return;
    }
    
    $('#editServiceName, #editServiceCategory, #editDefaultPrice').removeClass('is-invalid');
    
    const data = {
      name: name,
      category_id: parseInt(categoryId),
      default_price: parseFloat(defaultPrice),
      duration_minutes: parseInt(durationMinutes) || 60,
      description: description,
      is_active: isActive
    };
    
    
    $.ajax({
      url: `/services/${id}`,
      method: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify(data),
      success: function() {
        showToast('success', 'Cập nhật dịch vụ thành công!');
        $('#editServiceModal').modal('hide');
        loadServices();
      },
      error: function(xhr) {
        console.error('Error updating service:', xhr);
        const error = 'Không thể cập nhật dịch vụ. Vui lòng kiểm tra lại.';
        showToast('error', error);
      }
    });
  });

  // Xóa dịch vụ
  window.deleteService = async function(serviceId) {
    if (!await window.QLPKConfirmationDialog.confirmDelete('Bạn có chắc chắn muốn xóa dịch vụ này?')) return;
    
    
    $.ajax({
      url: `/services/${serviceId}`,
      method: 'DELETE',
      success: function() {
        showToast('success', 'Xóa dịch vụ thành công!');
        loadServices();
      },
      error: function(xhr) {
        console.error('Error deleting service:', xhr);
        const error = 'Không thể xóa dịch vụ. Vui lòng thử lại.';
        showToast('error', error);
      }
    });
  };

  // Tìm kiếm
  $('#searchInput').on('input', function() {
    const searchTerm = normalizeSearchText($(this).val());
    const filtered = services.filter(service => 
      normalizeSearchText(service.name).includes(searchTerm) ||
      (service.description && normalizeSearchText(service.description).includes(searchTerm)) ||
      (service.category_name && normalizeSearchText(service.category_name).includes(searchTerm))
    );
    renderServices(filtered);
  });

  // Reset form khi đóng modal
  $('#addServiceModal').on('hidden.bs.modal', function() {
    $('#addServiceForm')[0].reset();
    $('.is-invalid').removeClass('is-invalid');
  });

  function registerRealtimeHooks() {
    if (!window.QLPKRealtimePageHooks) return;
    window.QLPKRealtimePageHooks.register({
      types: ['catalog.changed'],
      filter: function(event) {
        const entity = event && event.payload ? event.payload.entity : '';
        return ['service', 'service_category', 'service_price'].includes(entity);
      },
      handler: function(event) {
        const entity = event && event.payload ? event.payload.entity : '';
        if (entity === 'service_category') {
          loadCategories();
        }
        loadServices();
      },
      debounceMs: 350,
    });
  }

  // Load data ban đầu
  $(document).ready(function() {
    registerRealtimeHooks();
    loadCategories();
    loadServices();
  });

  // Import functions
  function openImportModal() {
    $('#importModal').modal('show');
  }

  function exportTemplate() {
    // Tạo template Excel
    const template = [
      ['Tên dịch vụ', 'Danh mục', 'Đơn giá (VNĐ)', 'Thời gian (phút)', 'Mô tả', 'Trạng thái'],
      ['Khám tổng quát', 'Khám tổng quát', '500000', '60', 'Khám sức khỏe tổng quát', 'Kích hoạt'],
      ['Khám tim mạch', 'Khám chuyên khoa', '800000', '90', 'Khám chuyên khoa tim mạch', 'Kích hoạt'],
      ['Xét nghiệm máu', 'Xét nghiệm', '300000', '30', 'Xét nghiệm máu cơ bản', 'Kích hoạt']
    ];

    // Tạo workbook và worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(template);

    // Thêm worksheet vào workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Template');

    // Xuất file
    XLSX.writeFile(wb, 'mau_import_dich_vu.xlsx');
  }

  function importServices() {
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];
    
    if (!file) {
      showToast('error', 'Vui lòng chọn file để import');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    $.ajax({
      url: '/services/import',
      method: 'POST',
      data: formData,
      processData: false,
      contentType: false,
      success: function() {
        showToast('success', 'Import dịch vụ thành công!');
        $('#importModal').modal('hide');
        loadServices();
        $('#importFile').val('');
      },
      error: function(xhr) {
        console.error('Import error:', xhr);
        const error = 'Không thể nhập dữ liệu dịch vụ. Vui lòng kiểm tra tệp và thử lại.';
        showToast('error', error);
      }
    });
  }
