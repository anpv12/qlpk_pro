import {
  debugLog as medicalHistoryDebugLog,
  escapeHtml as medicalHistoryEscapeHtml,
  getAuthHeader as medicalHistoryGetAuthHeader,
  getComponent as medicalHistoryGetComponent,
  getIcdLookup as medicalHistoryGetIcdLookup
} from './medical-history-context.js';

/* ══════════════════════════════════════════════════════════════════
   DỮ LIỆU GỢI Ý ĐỘNG VÀ ĐỒNG BỘ HÓA TRẠNG THÁI KIỂM
   ══════════════════════════════════════════════════════════════════ */

function medicalHistoryGetSuggestionSelectedICDs() {
  const historyIcd = medicalHistoryGetComponent().getFeature('icd');
  return historyIcd && typeof historyIcd.getSelectedICDs === 'function'
    ? historyIcd.getSelectedICDs()
    : {};
}

async function medicalHistoryLoadAllIcds() {
  try {
    const authHeader = medicalHistoryGetAuthHeader();
    if (!authHeader) {
      console.warn('[MedicalHistory] Không tìm thấy mã token để tải danh mục gợi ý.');
      return;
    }

    const codes = [
      'I10', 'E11', 'E78', 'K29', 'K21', 'J45', 'J44', 'B18.1', 'A15.9', 'D50', 'B20', 'M10', 'N18', 'I64',
      'K35', 'N20', 'K80', 'K40', 'I84', 'N40', 'H25', 'M17', 'S06',
      'J30.1', 'L50.1', 'L23', 'Z88.0', 'Z88.1', 'Z91.0', 'T78.0',
      'F17', 'F18', 'F10', 'F13', 'F12', 'F16', 'F14', 'F11', 'F15', 'F19',
      'Z91.5', 'X60', 'X70', 'X78', 'X80', 'Z65.5', 'Z61',
      'Z80.0', 'Z80.1', 'Z80.3', 'Z80.4', 'Z80.6', 'Z81.8', 'Z81.1', 'Z81.0', 'Z82.4', 'Z82.3', 'Z82.8', 'Z82.5', 'Z83.0', 'Z83.3',
      'Z72', 'Z72.0', 'Z72.1', 'Z72.2', 'Z72.3', 'Z72.4', 'Z72.5', 'Z72.6', 'Z72.8', 'Z72.9',
      'Z73', 'Z73.0', 'Z73.1', 'Z73.2', 'Z73.3', 'Z73.4', 'Z73.5', 'Z73.6', 'Z73.8', 'Z73.9',
      'Z74', 'Z74.0', 'Z74.1', 'Z74.2', 'Z74.3', 'Z74.8', 'Z74.9'
    ];

    const response = await fetch(`/api/icd/?codes=${encodeURIComponent(codes.join(','))}&limit=200`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      const list = result.data || [];
	  const lookup = Object.create(null);
	  list.forEach(icd => {
		lookup[icd.icd_code.trim().toUpperCase()] = icd;
	  });
	  medicalHistoryGetComponent().state.icdLookup = lookup;
	  medicalHistoryDebugLog('[MedicalHistory] Đã tải danh mục gợi ý ICD:', Object.keys(lookup).length);
      
      // Vẽ giao diện gợi ý động
      medicalHistoryRenderSuggestions();
      // Đồng bộ checkbox
      medicalHistorySyncCheckboxesState();
    } else {
      console.error('[MedicalHistory] Lỗi khi tải danh sách ICD gợi ý:', response.statusText);
    }
  } catch (e) {
    console.error('[MedicalHistory] Lỗi hệ thống khi tải danh sách ICD gợi ý:', e);
  }
}

function medicalHistoryRenderSuggestions() {
  const groups = {
    'noi-khoa': [
      { code: 'I10', defaultName: 'Tăng huyết áp' },
      { code: 'E11', defaultName: 'Đái tháo đường típ 2' },
      { code: 'E78', defaultName: 'Rối loạn chuyển hóa lipoprotein (Rối loạn mỡ máu)' },
      { code: 'K29', defaultName: 'Viêm dạ dày và tá tràng' },
      { code: 'K21', defaultName: 'Bệnh trào ngược dạ dày - thực quản (GERD)' },
      { code: 'J45', defaultName: 'Hen phế quản' },
      { code: 'J44', defaultName: 'Bệnh phổi tắc nghẽn mạn tính (COPD)' },
      { code: 'B18.1', defaultName: 'Viêm gan siêu vi B mạn tính' },
      { code: 'A15.9', defaultName: 'Lao' },
      { code: 'D50', defaultName: 'Thiếu máu thiếu sắt' },
      { code: 'B20', defaultName: 'HIV' },
      { code: 'M10', defaultName: 'Gút (Gout)' },
      { code: 'N18', defaultName: 'Suy thận mạn' },
      { code: 'I64', defaultName: 'Đột quỵ (Tai biến mạch máu não)' }
    ],
    'ngoai-khoa': [
      { code: 'K35', defaultName: 'Viêm ruột thừa cấp' },
      { code: 'N20', defaultName: 'Sỏi thận và sỏi niệu quản' },
      { code: 'K80', defaultName: 'Sỏi túi mật' },
      { code: 'K40', defaultName: 'Thoát vị bẹn' },
      { code: 'I84', defaultName: 'Trĩ' },
      { code: 'N40', defaultName: 'U xơ tuyến tiền liệt (Tăng sản lành tính)' },
      { code: 'H25', defaultName: 'Đục thủy tinh thể tuổi già' },
      { code: 'M17', defaultName: 'Thoái hóa khớp gối' },
      { code: 'S06', defaultName: 'Chấn thương sọ não (kín/hở)' }
    ],
    'thoi-quen': [
      { code: 'Z72', defaultName: 'Các vấn đề liên quan đến lối sống' },
      { code: 'Z72.0', defaultName: 'Sử dụng thuốc lá' },
      { code: 'Z72.1', defaultName: 'Sử dụng rượu' },
      { code: 'Z72.2', defaultName: 'Sử dụng ma túy' },
      { code: 'Z72.3', defaultName: 'Không luyện tập thể dục' },
      { code: 'Z72.4', defaultName: 'Chế độ ăn uống và thói quen ăn uống không thích hợp' },
      { code: 'Z72.5', defaultName: 'Hành vi tình dục nguy cơ cao' },
      { code: 'Z72.6', defaultName: 'Đánh bạc và đánh cuộc' },
      { code: 'Z72.8', defaultName: 'Các vấn đề khác liên quan đến lối sống' },
      { code: 'Z72.9', defaultName: 'Vấn đề liên quan đến lối sống, không xác định' },
      { code: 'Z73', defaultName: 'Các vấn đề liên quan đến khó khăn về quản trị cuộc sống' },
      { code: 'Z73.0', defaultName: 'Cạn kiệt' },
      { code: 'Z73.1', defaultName: 'Những nét cá tính nổi bật' },
      { code: 'Z73.2', defaultName: 'Thiếu thư giãn và giải trí' },
      { code: 'Z73.3', defaultName: 'Sang chấn, chưa được phân loại ở phần khác' },
      { code: 'Z73.4', defaultName: 'Kỹ năng xã hội không đầy đủ, chưa được phân loại ở phần khác' },
      { code: 'Z73.5', defaultName: 'Mâu thuẫn vai trò xã hội, chưa được phân loại ở phần khác' },
      { code: 'Z73.6', defaultName: 'Hạn chế hoạt động vì khuyết tật' },
      { code: 'Z73.8', defaultName: 'Các vấn đề khác liên quan đến khó khăn về quản trị cuộc sống' },
      { code: 'Z73.9', defaultName: 'Vấn đề liên quan đến khó khăn về quản trị cuộc sống, không xác định' },
      { code: 'Z74', defaultName: 'Các vấn đề liên quan đến việc phụ thuộc vào người chăm sóc' },
      { code: 'Z74.0', defaultName: 'Nhu cầu trợ giúp cho giảm di chuyển' },
      { code: 'Z74.1', defaultName: 'Nhu cầu trợ giúp chăm sóc cho bản thân' },
      { code: 'Z74.2', defaultName: 'Nhu cầu trợ giúp chăm sóc tại nhà và nhu cầu trợ giúp khi trong nhà không ai có khả năng chăm sóc' },
      { code: 'Z74.3', defaultName: 'Nhu cầu Theo dõi liên tục' },
      { code: 'Z74.8', defaultName: 'Các vấn đề khác liên quan đến phụ thuộc của bản thân vào người chăm sóc' },
      { code: 'Z74.9', defaultName: 'Vấn đề liên quan đến lệ thuộc của bản thân vào người chăm sóc, không đặc hiệu' }
    ],
    'di-ung': [
      { code: 'J30.1', defaultName: 'Viêm mũi dị ứng do phấn hoa' },
      { code: 'L50.1', defaultName: 'Mề đay vô căn' },
      { code: 'L23', defaultName: 'Viêm da tiếp ứng do dị ứng' },
      { code: 'Z88.0', defaultName: 'Tiền sử dị ứng với Penicillin' },
      { code: 'Z88.1', defaultName: 'Tiền sử dị ứng với các thuốc kháng sinh khác' },
      { code: 'Z91.0', defaultName: 'Tiền sử dị ứng với thức ăn' },
      { code: 'T78.0', defaultName: 'Phản vệ do phản ứng có hại của thức ăn' }
    ]
  };

  for (const groupName in groups) {
      const container = medicalHistoryGetComponent().query(`#banThanList [data-bt-group="${groupName}"]`);
    if (!container) continue;

    // Xóa gợi ý cũ, giữ lại nhãn nhóm
    const label = container.querySelector('.medical-history-group-label');
    container.innerHTML = '';
    if (label) container.appendChild(label);

    let col72, col73, col74;
    if (groupName === 'thoi-quen') {
      const colsWrap = document.createElement('div');
      colsWrap.className = 'medical-history-thoi-quen-cols';

      col72 = document.createElement('div');
      col72.className = 'medical-history-thoi-quen-col';

      col73 = document.createElement('div');
      col73.className = 'medical-history-thoi-quen-col';

      col74 = document.createElement('div');
      col74.className = 'medical-history-thoi-quen-col';

      colsWrap.appendChild(col72);
      colsWrap.appendChild(col73);
      colsWrap.appendChild(col74);
      container.appendChild(colsWrap);
    }

    groups[groupName].forEach(itemInfo => {
      const code = itemInfo.code;
      const icdObj = medicalHistoryGetIcdLookup()[code];
      if (!icdObj) {
        medicalHistoryDebugLog(`[MedicalHistory] Không tìm thấy mã ICD ${code} trong danh mục cơ sở dữ liệu.`);
        return;
      }

      const itemDiv = document.createElement('div');
      itemDiv.className = 'medical-history-suggestion-item';
      itemDiv.dataset.id = icdObj.id;
      itemDiv.dataset.icd = icdObj.icd_code;
      itemDiv.dataset.medicalHistoryAction = 'toggle-personal-history';

      itemDiv.innerHTML = `
        <div class="medical-history-item-check"></div>
        <span class="medical-history-icd-badge">${medicalHistoryEscapeHtml(icdObj.icd_code)}</span>
        <span class="medical-history-item-name">${medicalHistoryEscapeHtml(icdObj.disease_name)}</span>
      `;

      if (groupName === 'thoi-quen') {
        if (code.startsWith('Z72')) {
          col72.appendChild(itemDiv);
        } else if (code.startsWith('Z73')) {
          col73.appendChild(itemDiv);
        } else if (code.startsWith('Z74')) {
          col74.appendChild(itemDiv);
        }
      } else {
        container.appendChild(itemDiv);
      }
    });
  }

  // Vẽ gợi ý gia đình
  const gdGroups = {
    'z80': [
      { code: 'Z80.0', defaultName: 'U ác tính cơ quan tiêu hóa' },
      { code: 'Z80.1', defaultName: 'U ác tính cơ quan hô hấp/lồng ngực' },
      { code: 'Z80.3', defaultName: 'U ác tính của vú' },
      { code: 'Z80.4', defaultName: 'U ác tính cơ quan sinh dục' },
      { code: 'Z80.6', defaultName: 'Bệnh bạch cầu' }
    ],
    'z81': [
      { code: 'Z81.8', defaultName: 'Rối loạn tâm thần và hành vi khác' },
      { code: 'Z81.1', defaultName: 'Rối loạn tâm thần do rượu' },
      { code: 'Z81.0', defaultName: 'Chậm phát triển tâm thần' }
    ],
    'z82': [
      { code: 'Z82.4', defaultName: 'Bệnh tim thiếu máu cục bộ & mạch máu' },
      { code: 'Z82.3', defaultName: 'Tai biến mạch máu não' },
      { code: 'Z82.8', defaultName: 'Bệnh mạn tính khác gây tàn phế' },
      { code: 'Z82.5', defaultName: 'Bệnh hen và hô hấp mạn tính khác' }
    ],
    'z83': [
      { code: 'Z83.0', defaultName: 'Bệnh nhiễm trùng và ký sinh trùng' },
      { code: 'Z83.3', defaultName: 'Đái tháo đường' }
    ]
  };

  for (const groupName in gdGroups) {
      const container = medicalHistoryGetComponent().query(`#giaDinhList [data-gd-group="${groupName}"]`);
    if (!container) continue;

    // Xóa gợi ý cũ, giữ lại nhãn nhóm
    const label = container.querySelector('.medical-history-group-label');
    container.innerHTML = '';
    if (label) container.appendChild(label);

    gdGroups[groupName].forEach(itemInfo => {
      const code = itemInfo.code;
      const icdObj = medicalHistoryGetIcdLookup()[code];
      if (!icdObj) {
        medicalHistoryDebugLog(`[MedicalHistory] Không tìm thấy mã ICD gia đình ${code} trong danh mục cơ sở dữ liệu.`);
        return;
      }

      const itemDiv = document.createElement('div');
      itemDiv.className = 'medical-history-suggestion-item';
      itemDiv.dataset.id = icdObj.id;
      itemDiv.dataset.icd = icdObj.icd_code;
      itemDiv.dataset.medicalHistoryAction = 'toggle-family-history';

      itemDiv.innerHTML = `
        <div class="medical-history-item-check"></div>
        <span class="medical-history-icd-badge">${medicalHistoryEscapeHtml(icdObj.icd_code)}</span>
        <span class="medical-history-item-name">${medicalHistoryEscapeHtml(icdObj.disease_name)}</span>
      `;

      container.appendChild(itemDiv);
    });
  }
}

function medicalHistorySyncCheckboxesState() {
  const selectedICDs = medicalHistoryGetSuggestionSelectedICDs();
  const selectedList = selectedICDs.physHistory || [];
  const selectedCodes = selectedList.map(x => (x.icd_code || '').trim().toUpperCase());
  const selectedIds = selectedList.map(x => x.id).filter(id => id !== null && id !== undefined);

  // 1. Đồng bộ các gợi ý bản thân
  medicalHistoryGetComponent().queryAll('#banThanList .medical-history-suggestion-item').forEach(item => {
    const itemId = parseInt(item.dataset.id);
    const itemCode = (item.dataset.icd || '').trim().toUpperCase();
    const isSelected = selectedIds.includes(itemId) || selectedCodes.includes(itemCode);
    if (isSelected) {
      item.classList.add('medical-history-selected');
    } else {
      item.classList.remove('medical-history-selected');
    }
  });

  // 2. Đồng bộ các gợi ý gia đình
  const selectedFamList = selectedICDs.famHistory || [];
  const selectedFamCodes = selectedFamList.map(x => (x.icd_code || '').trim().toUpperCase());
  const selectedFamIds = selectedFamList.map(x => x.id).filter(id => id !== null && id !== undefined);

  medicalHistoryGetComponent().queryAll('#giaDinhList .medical-history-suggestion-item').forEach(item => {
    const itemId = parseInt(item.dataset.id);
    const itemCode = (item.dataset.icd || '').trim().toUpperCase();
    const isSelected = selectedFamIds.includes(itemId) || selectedFamCodes.includes(itemCode);
    if (isSelected) {
      item.classList.add('medical-history-selected');
    } else {
      item.classList.remove('medical-history-selected');
    }
  });

  // Bảng tự sát thuộc risk_assessment, không suy luận từ physical_history.
  medicalHistoryGetComponent().queryAll('#suicideTableWrap input[type="checkbox"]').forEach(cb => {
    const noteEl = medicalHistoryGetComponent().getElement(cb.id.replace('_check', '_note'));
    if (noteEl) noteEl.disabled = !cb.checked;
  });
}

medicalHistoryGetComponent().registerActions({
  getSuggestionSelectedICDs: medicalHistoryGetSuggestionSelectedICDs,
  loadAllIcds: medicalHistoryLoadAllIcds,
  renderSuggestions: medicalHistoryRenderSuggestions,
  syncCheckboxesState: medicalHistorySyncCheckboxesState
});
