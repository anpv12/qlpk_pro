/**
 * Personal Detail Modal DRY Module
 * Module chung để xử lý modal thông tin đầy đủ (địa chỉ, nghề nghiệp, giới tính)
 * Tái sử dụng cho lễ tân, bác sĩ và tâm lý gia
 * Tuân thủ nguyên tắc DRY - Don't Repeat Yourself
 */

(function () {
	'use strict';

	// Flag để kiểm tra modal đã được load chưa
	let modalLoaded = false;
	let modalLoading = false;

	// Helper function: Get element value safely
	function safeVal(id) {
		const el = document.getElementById(id);
		return el ? (el.value || '') : '';
	}

	// Helper function: Set element value safely
	function safeSetValue(elementId, value) {
		const element = document.getElementById(elementId);
		if (element) {
			element.value = value || '';
			return true;
		}
		return false;
	}

	function setPersonalDetailVisible(element, isVisible) {
		if (!element) return;
		element.classList.toggle('personal-detail-hidden', !isVisible);
	}

	function showAllModalSections() {
		document.querySelectorAll('.modal-section').forEach(section => {
			setPersonalDetailVisible(section, true);
		});
	}

	// Helper function: Format date to ISO format (YYYY-MM-DD)
	function formatDateToLocalISO(date) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	// Helper function: Set min date cho modalNgayDuSinh (ngày hôm nay)
	function setMinDateForModalNgayDuSinh() {
		const modalNgayDuSinh = document.getElementById('modalNgayDuSinh');
		if (modalNgayDuSinh) {
			const today = new Date();
			const todayStr = formatDateToLocalISO(today);
			modalNgayDuSinh.setAttribute('min', todayStr);
		}
	}

	/**
	 * Load modal HTML từ template nếu chưa có trong DOM
	 */
	function ensureModalLoaded(callback) {
		// Nếu modal đã có trong DOM, bind events và gọi callback
		if (document.getElementById('personalDetailModal')) {
			// ✅ QUAN TRỌNG: Bind events ngay cả khi modal đã có sẵn trong DOM
			// Đảm bảo events luôn được bind, không chỉ khi load từ template
			if (!modalLoaded) {
				bindPersonalDetailModalEvents();
			}
			modalLoaded = true;
			if (callback) callback();
			return;
		}

		// Nếu đang load, đợi
		if (modalLoading) {
			setTimeout(() => ensureModalLoaded(callback), 100);
			return;
		}

		// Bắt đầu load
		modalLoading = true;

		// Sử dụng jQuery nếu có, nếu không thì dùng fetch
		// Thêm version để bypass cache khi deploy version mới
		const appVersion = window.APP_VERSION || localStorage.getItem('APP_VERSION') || Date.now();
		const templateUrl = `/static/templates/personal-detail-modal.html?v=${appVersion}`;

		if (typeof $ !== 'undefined' && $.get) {
			$.get(templateUrl)
				.done(function (html) {
					// Thêm modal vào body
					$('body').append(html);
					modalLoaded = true;
					modalLoading = false;
					// Bind event handlers sau khi modal được load vào DOM
					bindPersonalDetailModalEvents();
					if (callback) callback();
				})
				.fail(function () {
					console.error('Không thể load template personal detail modal');
					modalLoading = false;
					if (typeof showCustomToast === 'function') {
						showCustomToast('error', 'Không thể mở thông tin bệnh nhân. Vui lòng tải lại trang.');
					}
				});
		} else {
			// Fallback: dùng fetch
			fetch(templateUrl)
				.then(response => {
					if (!response.ok) throw new Error('Network response was not ok');
					return response.text();
				})
				.then(html => {
					// Thêm modal vào body
					const tempDiv = document.createElement('div');
					tempDiv.innerHTML = html;
					document.body.appendChild(tempDiv.firstElementChild);
					modalLoaded = true;
					modalLoading = false;
					// Bind event handlers sau khi modal được load vào DOM
					bindPersonalDetailModalEvents();
					if (callback) callback();
				})
				.catch(error => {
					console.error('Không thể load template personal detail modal:', error);
					modalLoading = false;
					if (typeof showCustomToast === 'function') {
						showCustomToast('error', 'Không thể mở thông tin bệnh nhân. Vui lòng tải lại trang.');
					}
				});
		}
	}

	/**
	 * Bind event handlers cho modal sau khi load
	 */
	function bindPersonalDetailModalEvents() {
		const modalEl = document.getElementById('personalDetailModal');
		if (!modalEl) return;

		// Bootstrap v5 event: khi modal được hiển thị
		modalEl.addEventListener('shown.bs.modal', async () => {
			// Set min date cho ngày dự sinh = ngày hôm nay
			setMinDateForModalNgayDuSinh();

			// ✅ FIX BUG: LUÔN LUÔN load data từ form chính TRƯỚC, bất kể new hay edit mode
			// Vì khi đóng modal, data đã được sync vào hidden fields trên form chính
			// Nếu là edit mode, loadAddressDataIntoModal() sẽ load thêm từ DB nếu cần
			if (typeof loadAddressDataIntoModal === 'function') {
				await loadAddressDataIntoModal();
			}

			// Load draft từ cache CHỈ KHI đang tạo mới VÀ TẤT CẢ hidden fields rỗng
			// (Draft cache chỉ dùng khi F5 reload trang, không dùng khi đóng/mở lại modal)
			if (!window.currentPatientId && typeof loadAddressDraftFromCache === 'function') {
				// ✅ FIX: Kiểm tra TẤT CẢ các trường nghề nghiệp, không chỉ occupation
				const occupationValue = document.getElementById('occupation')?.value;
				const donViCongTacValue = document.getElementById('donViCongTac')?.value;
				const diaChiCongTyValue = document.getElementById('diaChiCongTy')?.value;

				// Chỉ load draft nếu TẤT CẢ hidden fields rỗng (tức là chưa nhập gì hoặc vừa F5)
				if (!occupationValue && !donViCongTacValue && !diaChiCongTyValue) {
					await loadAddressDraftFromCache();
				}
			} else if (window.currentPatientId) {
				// Edit mode: clear cache
				if (typeof clearAddressDraftCache === 'function') {
					clearAddressDraftCache();
				}
			}

			// Khởi tạo autocomplete components SAU KHI đã load data
			// Đảm bảo instance được tạo lại và giá trị được restore đúng cách
			initializeModalAutocompleteComponents();

			// Setup autocomplete cho các field đơn giản (nationality, religion, ethnicity, education_level)
			// Đảm bảo autocomplete được setup sau khi modal đã hiển thị và sections đã được show/hide
			// Đặc biệt quan trọng cho education_level đã được di chuyển sang modal occupation
			setTimeout(() => {
				if (typeof setupModalAutocomplete === 'function') {
					setupModalAutocomplete();
				}
			}, 150);
		});

		// Bootstrap v5 event: khi modal bắt đầu đóng (TRƯỚC KHI bị hidden)
		// Dùng hide.bs.modal thay vì hidden.bs.modal để lấy giá trị TRƯỚC KHI modal fields bị reset
		modalEl.addEventListener('hide.bs.modal', function (event) {
			// ✅ QUAN TRỌNG: Đảm bảo handleAddressModalClose() hoàn thành trước khi modal đóng
			// Nếu chưa xử lý xong, block việc đóng modal và xử lý async
			if (typeof handleAddressModalClose === 'function') {
				// Kiểm tra nếu đã xử lý xong (flag được set sau khi await xong)
				if (!modalEl.dataset.syncComplete) {
					// Chưa xử lý xong → block việc đóng modal
					event.preventDefault();

					// Chạy async function
					handleAddressModalClose().then(() => {
						// Đã xử lý xong → set flag và đóng modal thủ công
						modalEl.dataset.syncComplete = 'true';
						const modal = bootstrap.Modal.getInstance(modalEl);
						if (modal) {
							modal.hide();
						}
					}).catch((error) => {
						console.error('Error in handleAddressModalClose:', error);
						// Vẫn cho phép đóng modal dù có lỗi
						modalEl.dataset.syncComplete = 'true';
						const modal = bootstrap.Modal.getInstance(modalEl);
						if (modal) {
							modal.hide();
						}
					});
				} else {
					// Đã xử lý xong → cho phép đóng modal và reset flag
					delete modalEl.dataset.syncComplete;
				}
			}
		});

		// Bootstrap v5 event: khi modal đã được đóng hoàn toàn (SAU KHI đã hidden)
		modalEl.addEventListener('hidden.bs.modal', function () {
			// Chỉ reset UI sau khi đã sync data, không sync data nữa
			// Reset về hiển thị tất cả khi đóng modal
			showAllModalSections();

			const modalTitle = document.getElementById('personalDetailModalLabel');
			if (modalTitle) {
				modalTitle.textContent = 'Thông tin đầy đủ';
			}
		});

		// Event listener cho giới tính và checkbox mang thai
		const modalGenderSelect = document.getElementById('modalGender');
		if (modalGenderSelect && typeof updatePregnancySectionVisibility === 'function') {
			modalGenderSelect.addEventListener('change', updatePregnancySectionVisibility);
		}

		const modalMangThaiCheckbox = document.getElementById('modalMangThai');
		if (modalMangThaiCheckbox && typeof updatePregnancySectionVisibility === 'function') {
			modalMangThaiCheckbox.addEventListener('change', updatePregnancySectionVisibility);
		}

		// Khởi tạo tính tuần thai từ ngày dự sinh
		if (typeof setupPregnancyWeekCalculation === 'function') {
			setupPregnancyWeekCalculation();
		}

		// Không gọi initializeModalAutocompleteComponents() ở đây nữa
		// Sẽ được gọi trong shown.bs.modal event để đảm bảo được gọi mỗi lần mở modal
	}

	/**
	 * Logic show/hide pregnancy section dựa trên giới tính
	 * Function này được gọi bởi DRY module khi có thay đổi giới tính hoặc checkbox mang thai
	 */
	function updatePregnancySectionVisibility() {
		const modalGender = document.getElementById('modalGender');
		const pregnancySection = document.getElementById('pregnancySection');
		const ngayDuSinhSection = document.getElementById('ngayDuSinhSection');
		const soTuanThaiSection = document.getElementById('soTuanThaiSection');
		const modalMangThai = document.getElementById('modalMangThai');
		const modalNgayDuSinh = document.getElementById('modalNgayDuSinh');
		const modalSoTuanThai = document.getElementById('modalSoTuanThai');

		if (modalGender && pregnancySection) {
			// Luôn hiển thị các section
			setPersonalDetailVisible(pregnancySection, true);
			setPersonalDetailVisible(ngayDuSinhSection, true);
			setPersonalDetailVisible(soTuanThaiSection, true);

			if (modalGender.value === 'female') {
				// Nếu là nữ: enable checkbox mang thai
				if (modalMangThai) {
					modalMangThai.disabled = false;
				}
				// Enable ngày dự sinh và số tuần thai chỉ khi đã checked mang thai
				if (modalMangThai && modalMangThai.checked) {
					if (modalNgayDuSinh) {
						modalNgayDuSinh.disabled = false;
					}
					if (modalSoTuanThai) {
						modalSoTuanThai.disabled = false;
					}
				} else {
					// Disable và clear khi chưa checked mang thai
					if (modalNgayDuSinh) {
						modalNgayDuSinh.disabled = true;
						modalNgayDuSinh.value = '';
					}
					if (modalSoTuanThai) {
						modalSoTuanThai.disabled = true;
						modalSoTuanThai.value = '';
					}
					const soTuanThaiField = document.getElementById('soTuanThai');
					if (soTuanThaiField) {
						soTuanThaiField.value = '';
					}
				}
			} else {
				// Nếu không phải nữ: disable các field và clear giá trị
				if (modalMangThai) {
					modalMangThai.disabled = true;
					modalMangThai.checked = false;
				}
				if (modalNgayDuSinh) {
					modalNgayDuSinh.disabled = true;
					modalNgayDuSinh.value = '';
				}
				if (modalSoTuanThai) {
					modalSoTuanThai.disabled = true;
					modalSoTuanThai.value = '';
				}
				const soTuanThaiField = document.getElementById('soTuanThai');
				if (soTuanThaiField) {
					soTuanThaiField.value = '';
				}
			}
		}
	}

	/**
	 * Tính tuần tuổi thai dựa trên ngày dự sinh
	 * @param {string} expectedDeliveryDate - Ngày dự sinh (YYYY-MM-DD)
	 * @returns {object|null} - Object chứa weeks, days, totalDays, display hoặc null nếu không hợp lệ
	 */
	function calculatePregnancyWeek(expectedDeliveryDate) {
		if (!expectedDeliveryDate) return null;

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const edd = new Date(expectedDeliveryDate);
		edd.setHours(0, 0, 0, 0);

		// Kiểm tra Invalid Date
		if (isNaN(edd.getTime())) {
			return null;
		}

		// Tính số ngày còn lại đến ngày dự sinh (có thể âm nếu đã qua ngày dự sinh)
		const daysUntilDelivery = Math.ceil((edd - today) / (1000 * 60 * 60 * 24));

		// Thai kỳ bình thường: 40 tuần = 280 ngày
		// Nếu số ngày còn lại > 280 ngày, chưa mang thai
		if (daysUntilDelivery > 280) {
			return null; // Chưa mang thai
		}

		// Tính số ngày đã mang thai = 280 - số ngày còn lại
		const daysPregnant = 280 - daysUntilDelivery;

		// Kiểm tra nếu số ngày đã mang thai < 0 (đã qua ngày dự sinh quá nhiều)
		if (daysPregnant < 0) {
			return null;
		}

		// Tính tuần và ngày
		const weeks = Math.floor(daysPregnant / 7);
		const days = daysPregnant % 7;

		// Kiểm tra phạm vi hợp lệ (0-42 tuần)
		if (weeks < 0) {
			return null;
		}
		if (weeks > 42) {
			// Đã qua ngày dự sinh, có thể đã sinh hoặc quá ngày
			// Vẫn trả về giá trị
			return {
				weeks: weeks,
				days: days,
				totalDays: daysPregnant,
				display: `${weeks} tuần ${days} ngày`
			};
		}

		// Trả về object chứa cả tuần và ngày
		return {
			weeks: weeks,
			days: days,
			totalDays: daysPregnant,
			display: `${weeks} tuần ${days} ngày`
		};
	}

	/**
	 * Setup event listener cho ngày dự sinh để tự động tính tuần tuổi thai
	 */
	function setupPregnancyWeekCalculation() {
		const modalNgayDuSinh = document.getElementById('modalNgayDuSinh');
		const modalSoTuanThai = document.getElementById('modalSoTuanThai');

		if (modalNgayDuSinh && modalSoTuanThai) {
			// Off trước để tránh bind nhiều lần
			if (typeof $ !== 'undefined') {
				$(modalNgayDuSinh).off('change.pregnancyWeekCalculation');
				$(modalNgayDuSinh).on('change.pregnancyWeekCalculation', function () {
					const edd = this.value;
					const result = calculatePregnancyWeek(edd);

					if (result && result.weeks >= 0) {
						// Hiển thị cả tuần và ngày trực tiếp trong input field
						modalSoTuanThai.value = result.display;
						// Cập nhật hidden field soTuanThai (chỉ lưu số tuần)
						const soTuanThaiField = document.getElementById('soTuanThai');
						if (soTuanThaiField) {
							soTuanThaiField.value = result.weeks;
						}
					} else {
						modalSoTuanThai.value = '';
						const soTuanThaiField = document.getElementById('soTuanThai');
						if (soTuanThaiField) {
							soTuanThaiField.value = '';
						}
					}
				});
			}

			// Input field là readonly nên không cần event listener cho chỉnh sửa thủ công
		}
	}

	function markModalAutocompleteFields() {
		const modal = document.getElementById('personalDetailModal');
		if (!modal) return;

		modal.querySelectorAll('.autocomplete-dropdown[id]').forEach((dropdown) => {
			const wrapper = dropdown.parentElement;
			if (!wrapper) return;
			const input = wrapper.querySelector('input.form-control');
			if (!input) return;

			wrapper.classList.add('personal-detail-autocomplete-field');
			input.classList.add('personal-detail-autocomplete-input');
		});
	}

	/**
	 * Khởi tạo autocomplete components cho modal sau khi modal được load
	 */
	async function initializeModalAutocompleteComponents() {
		markModalAutocompleteFields();

		// Initialize occupation autocomplete for modal
		const modalOccupationInput = document.getElementById('modalOccupation');
		const modalOccupationDropdown = document.getElementById('modalOccupationDropdown');

		if (modalOccupationInput && modalOccupationDropdown) {
			// Check if OccupationAutocomplete class is available
			if (typeof OccupationAutocomplete !== 'undefined') {
				// Lưu giá trị hiện tại trước khi destroy instance cũ
				let savedOccupationValue = '';
				if (window.modalOccupationAutocomplete && window.modalOccupationAutocomplete.getValue) {
					savedOccupationValue = window.modalOccupationAutocomplete.getValue();
				} else {
					// Lấy từ field trên form chính trước (nguồn đáng tin cậy) - DRY với sexual_orientation
					savedOccupationValue = safeVal('occupation') || modalOccupationInput.value || '';
				}

				// Destroy existing instance if any
				if (window.modalOccupationAutocomplete) {
					if (window.modalOccupationAutocomplete.destroy) window.modalOccupationAutocomplete.destroy();
					window.modalOccupationAutocomplete = null;
				}

				// Tạo instance mới
				window.modalOccupationAutocomplete = new OccupationAutocomplete('modalOccupation', 'modalOccupationDropdown');

				// Restore giá trị sau khi tạo instance mới
				if (savedOccupationValue && window.modalOccupationAutocomplete.setValue) {
					window.modalOccupationAutocomplete.setValue(savedOccupationValue);
				}
			}
		}

		// Initialize sexual orientation autocomplete for modal
		const sexualOrientationInput = document.getElementById('modalSexualOrientation');
		const sexualOrientationDropdown = document.getElementById('modalSexualOrientationDropdown');

		if (sexualOrientationInput && sexualOrientationDropdown) {
			// Check if SexualOrientationAutocomplete class is available
			if (typeof SexualOrientationAutocomplete !== 'undefined') {
				// Lưu giá trị hiện tại trước khi destroy instance cũ
				let savedSexualOrientationValue = '';
				if (window.sexualOrientationAutocomplete && window.sexualOrientationAutocomplete.getValue) {
					savedSexualOrientationValue = window.sexualOrientationAutocomplete.getValue();
				} else {
					// Lấy từ hidden field trên form chính trước (nguồn đáng tin cậy) - DRY với occupation
					savedSexualOrientationValue = safeVal('sexualOrientation') || sexualOrientationInput.value || '';
				}

				// Destroy existing instance if any (tránh xung đột và memory leak)
				if (window.sexualOrientationAutocomplete) {
					if (window.sexualOrientationAutocomplete.destroy) window.sexualOrientationAutocomplete.destroy();
					window.sexualOrientationAutocomplete = null;
				}

				// Tạo instance mới
				window.sexualOrientationAutocomplete = new SexualOrientationAutocomplete('modalSexualOrientation', 'modalSexualOrientationDropdown');

				// Restore giá trị sau khi tạo instance mới
				if (savedSexualOrientationValue && window.sexualOrientationAutocomplete.setValue) {
					window.sexualOrientationAutocomplete.setValue(savedSexualOrientationValue);
				}
			}
		}

		// Initialize education level autocomplete for modal
		const educationLevelInput = document.getElementById('modalEducationLevel');
		const educationLevelDropdown = document.getElementById('modalEducationLevelDropdown');

		if (educationLevelInput && educationLevelDropdown) {
			// Check if EducationLevelAutocomplete class is available
			if (typeof EducationLevelAutocomplete !== 'undefined') {
				// Lưu giá trị hiện tại trước khi destroy instance cũ
				let savedEducationLevelValue = '';
				if (window.modalEducationLevelAutocomplete && window.modalEducationLevelAutocomplete.getValue) {
					savedEducationLevelValue = window.modalEducationLevelAutocomplete.getValue();
				} else {
					// Lấy từ hidden field trên form chính trước (nguồn đáng tin cậy)
					savedEducationLevelValue = safeVal('educationLevel') || educationLevelInput.value || '';
				}

				// Destroy existing instance if any (tránh xung đột và memory leak)
				if (window.modalEducationLevelAutocomplete) {
					if (window.modalEducationLevelAutocomplete.destroy) window.modalEducationLevelAutocomplete.destroy();
					window.modalEducationLevelAutocomplete = null;
				}

				// Tạo instance mới
				window.modalEducationLevelAutocomplete = new EducationLevelAutocomplete('modalEducationLevel', 'modalEducationLevelDropdown');

				// Restore giá trị sau khi tạo instance mới
				if (savedEducationLevelValue && window.modalEducationLevelAutocomplete.setValue) {
					window.modalEducationLevelAutocomplete.setValue(savedEducationLevelValue);
				}
			}
		}

		// Initialize nationality autocomplete for modal
		const nationalityInput = document.getElementById('modalNationality');
		const nationalityDropdown = document.getElementById('modalNationalityDropdown');

		if (nationalityInput && nationalityDropdown) {
			if (typeof NationalityAutocomplete !== 'undefined') {
				// Lưu giá trị hiện tại trước khi destroy instance cũ
				let savedNationalityValue = '';
				if (window.modalNationalityAutocomplete && window.modalNationalityAutocomplete.getValue) {
					savedNationalityValue = window.modalNationalityAutocomplete.getValue();
				} else {
					savedNationalityValue = safeVal('nationality') || nationalityInput.value || '';
				}

				// Destroy existing instance if any
				if (window.modalNationalityAutocomplete) {
					if (window.modalNationalityAutocomplete.destroy) window.modalNationalityAutocomplete.destroy();
					window.modalNationalityAutocomplete = null;
				}

				// Tạo instance mới
				window.modalNationalityAutocomplete = new NationalityAutocomplete('modalNationality', 'modalNationalityDropdown');

				// Restore giá trị sau khi tạo instance mới
				if (savedNationalityValue && window.modalNationalityAutocomplete.setValue) {
					window.modalNationalityAutocomplete.setValue(savedNationalityValue);
				}
			}
		}

		// Initialize religion autocomplete for modal
		const religionInput = document.getElementById('modalReligion');
		const religionDropdown = document.getElementById('modalReligionDropdown');

		if (religionInput && religionDropdown) {
			if (typeof ReligionAutocomplete !== 'undefined') {
				// Lưu giá trị hiện tại trước khi destroy instance cũ
				let savedReligionValue = '';
				if (window.modalReligionAutocomplete && window.modalReligionAutocomplete.getValue) {
					savedReligionValue = window.modalReligionAutocomplete.getValue();
				} else {
					savedReligionValue = safeVal('religion') || religionInput.value || '';
				}

				// Destroy existing instance if any
				if (window.modalReligionAutocomplete) {
					if (window.modalReligionAutocomplete.destroy) window.modalReligionAutocomplete.destroy();
					window.modalReligionAutocomplete = null;
				}

				// Tạo instance mới
				window.modalReligionAutocomplete = new ReligionAutocomplete('modalReligion', 'modalReligionDropdown');

				// Restore giá trị sau khi tạo instance mới
				if (savedReligionValue && window.modalReligionAutocomplete.setValue) {
					window.modalReligionAutocomplete.setValue(savedReligionValue);
				}
			}
		}

		// Initialize ethnicity autocomplete for modal
		const ethnicityInput = document.getElementById('modalEthnicity');
		const ethnicityDropdown = document.getElementById('modalEthnicityDropdown');

		if (ethnicityInput && ethnicityDropdown) {
			if (typeof EthnicityAutocomplete !== 'undefined') {
				// Lưu giá trị hiện tại trước khi destroy instance cũ
				let savedEthnicityValue = '';
				if (window.modalEthnicityAutocomplete && window.modalEthnicityAutocomplete.getValue) {
					savedEthnicityValue = window.modalEthnicityAutocomplete.getValue();
				} else {
					savedEthnicityValue = safeVal('ethnicity') || ethnicityInput.value || '';
				}

				// Destroy existing instance if any
				if (window.modalEthnicityAutocomplete) {
					if (window.modalEthnicityAutocomplete.destroy) window.modalEthnicityAutocomplete.destroy();
					window.modalEthnicityAutocomplete = null;
				}

				// Tạo instance mới
				window.modalEthnicityAutocomplete = new EthnicityAutocomplete('modalEthnicity', 'modalEthnicityDropdown');

				// Restore giá trị sau khi tạo instance mới
				if (savedEthnicityValue && window.modalEthnicityAutocomplete.setValue) {
					window.modalEthnicityAutocomplete.setValue(savedEthnicityValue);
				}
			}
		}

		// Initialize Province autocomplete for modal
		const provinceInput = document.getElementById('modalProvince');
		const provinceDropdown = document.getElementById('modalProvinceDropdown');

		if (provinceInput && provinceDropdown) {
			if (typeof ProvinceAutocomplete !== 'undefined') {
				// Lưu giá trị hiện tại trước khi destroy instance cũ
				let savedProvinceValue = '';
				if (window.modalProvinceAutocomplete && window.modalProvinceAutocomplete.getValue) {
					savedProvinceValue = window.modalProvinceAutocomplete.getValue();
				} else {
					savedProvinceValue = safeVal('province') || provinceInput.value || '';
				}

				// Destroy existing instance if any
				if (window.modalProvinceAutocomplete) {
					if (window.modalProvinceAutocomplete.destroy) window.modalProvinceAutocomplete.destroy();
					window.modalProvinceAutocomplete = null;
				}

				// Callback khi chọn province - load ward cho province đó
				const onProvinceSelect = async (provinceName, provinceCode) => {
					if (window.modalWardAutocomplete && provinceCode) {
						await window.modalWardAutocomplete.setProvinceCode(provinceCode);
					}
				};

				// Tạo instance mới với callback
				window.modalProvinceAutocomplete = new ProvinceAutocomplete('modalProvince', 'modalProvinceDropdown', onProvinceSelect);

				// Restore giá trị sau khi tạo instance mới
				if (savedProvinceValue) {
					await window.modalProvinceAutocomplete.setValueByName(savedProvinceValue);
				}
			}
		}

		// Initialize Ward autocomplete for modal
		const wardInput = document.getElementById('modalWard');
		const wardDropdown = document.getElementById('modalWardDropdown');

		if (wardInput && wardDropdown) {
			if (typeof WardAutocomplete !== 'undefined') {
				// Lưu giá trị hiện tại trước khi destroy instance cũ
				let savedWardValue = '';
				if (window.modalWardAutocomplete && window.modalWardAutocomplete.getValue) {
					savedWardValue = window.modalWardAutocomplete.getValue();
				} else {
					savedWardValue = safeVal('ward') || wardInput.value || '';
				}

				// Destroy existing instance if any
				if (window.modalWardAutocomplete) {
					if (window.modalWardAutocomplete.destroy) window.modalWardAutocomplete.destroy();
					window.modalWardAutocomplete = null;
				}

				// Tạo instance mới
				window.modalWardAutocomplete = new WardAutocomplete('modalWard', 'modalWardDropdown');

				// Nếu đã có province được chọn, load units cho province đó
				const provinceCode = window.modalProvinceAutocomplete?.getSelectedCode();
				if (provinceCode) {
					await window.modalWardAutocomplete.setProvinceCode(provinceCode);
				}

				// Restore giá trị sau khi tạo instance mới
				if (savedWardValue) {
					await window.modalWardAutocomplete.setValueByName(savedWardValue);
				}
			}
		}
	}

	/**
	 * Setup event listeners for modal dropdowns (province/region)
	 * Sử dụng clone element để remove old listeners (an toàn hơn)
	 */
	function setupModalEventListeners() {
		// Province (Region) change event - remove old listener trước khi add mới
		const modalProvince = document.getElementById('modalProvince');
		if (modalProvince) {
			// Lưu giá trị trước khi clone để restore sau
			const savedProvinceValue = modalProvince.value;

			// Clone element để remove tất cả event listeners cũ
			const newProvince = modalProvince.cloneNode(true);
			modalProvince.parentNode.replaceChild(newProvince, modalProvince);

			// Restore giá trị sau khi clone
			if (savedProvinceValue) {
				newProvince.value = savedProvinceValue;
			}

			newProvince.addEventListener('change', function () {
				if (typeof handleProvinceChange === 'function') {
					handleProvinceChange(this.value);
				}
			});
		}

		// Removed District listener as it is no longer used in 2-level system
	}

	/**
	 * Show autocomplete suggestions cho một input field
	 * @param {HTMLElement} input - Input element
	 * @param {Array} suggestions - Danh sách gợi ý
	 * @param {String} searchValue - Giá trị tìm kiếm
	 */
	function showAutocompleteSuggestions(input, suggestions, searchValue) {
		// Remove existing dropdown
		const existingDropdown = input.parentNode.querySelector('.autocomplete-dropdown');
		if (existingDropdown) {
			existingDropdown.remove();
		}

		// Filter suggestions
		let filtered;
		if (!searchValue) {
			// Show all suggestions when focus (no search value)
			filtered = suggestions;
		} else {
			// Filter suggestions based on search value
			filtered = suggestions.filter(suggestion =>
				suggestion.toLowerCase().includes(searchValue)
			);
		}

		if (filtered.length === 0) return;

		// ✅ FIX: Giới hạn số items hiển thị tối đa 10 để tránh tràn
		const MAX_ITEMS = 10;
		if (filtered.length > MAX_ITEMS) {
			filtered = filtered.slice(0, MAX_ITEMS);
		}

		// Create dropdown
		const dropdown = document.createElement('div');
		dropdown.className = 'autocomplete-dropdown';

		filtered.forEach(suggestion => {
			const item = document.createElement('div');
			item.className = 'autocomplete-item';
			item.textContent = suggestion;

			// CSS từ file personal-detail-modal.css sẽ được apply
			// Không cần inline style vì CSS đã được load và selector #personalDetailModal .autocomplete-item sẽ match

			item.addEventListener('click', function () {
				input.value = suggestion;
				dropdown.remove();
			});

			dropdown.appendChild(item);
		});

		// ✅ FIX: Append dropdown vào modal (không phải modal-body) để tránh bị clip bởi overflow
		// Tính toán vị trí tuyệt đối của input trong modal
		const modal = document.getElementById('personalDetailModal');

		if (modal) {
			dropdown.classList.add('autocomplete-dropdown--floating');

			// Append vào modal (không phải modal-body) để tránh bị clip bởi overflow-y: auto
			modal.appendChild(dropdown);

			// Tính toán vị trí của dropdown dựa trên vị trí của input
			let scrollHandler = null;
			const updateDropdownPosition = () => {
				const inputRect = input.getBoundingClientRect();
				const modalRect = modal.getBoundingClientRect();

				// Tính toán vị trí relative to modal
				const top = inputRect.bottom - modalRect.top;
				const left = inputRect.left - modalRect.left;

				// ✅ QUAN TRỌNG: Tính toán max-height động để đảm bảo dropdown không tràn ra ngoài modal
				const availableHeight = modalRect.bottom - inputRect.bottom;
				const maxHeight = Math.min(200, Math.max(100, availableHeight - 10)); // 10px padding, tối thiểu 100px
				Object.assign(dropdown.style, {
					'--personal-detail-autocomplete-top': `${top}px`,
					'--personal-detail-autocomplete-left': `${left}px`,
					'--personal-detail-autocomplete-width': `${inputRect.width}px`,
					'--personal-detail-autocomplete-max-height': `${maxHeight}px`
				});
			};

			updateDropdownPosition();

			// Update position on scroll của modal-body
			const modalBody = modal.querySelector('.modal-body');
			if (modalBody) {
				scrollHandler = () => updateDropdownPosition();
				modalBody.addEventListener('scroll', scrollHandler);
			}

			// Cleanup khi dropdown bị remove
			const originalRemove = dropdown.remove.bind(dropdown);
			dropdown.remove = function () {
				if (modalBody && scrollHandler) {
					modalBody.removeEventListener('scroll', scrollHandler);
				}
				originalRemove();
			};
		} else {
			// Fallback: append vào parentNode nếu không tìm thấy modal
			input.parentNode.classList.add('personal-detail-autocomplete-anchor');
			input.parentNode.appendChild(dropdown);
		}

		// Close dropdown when clicking outside
		document.addEventListener('click', function closeDropdown(e) {
			if (!dropdown.contains(e.target) && e.target !== input) {
				dropdown.remove();
				document.removeEventListener('click', closeDropdown);
			}
		});
	}

	/**
	 * Setup autocomplete for modal fields (nationality, religion, ethnicity, education)
	 * Sử dụng helper function với clone element để remove old listeners
	 */
	function setupModalAutocomplete() {
		// Helper function để setup autocomplete cho một field
		function setupFieldAutocomplete(fieldId, suggestions) {
			const field = document.getElementById(fieldId);
			if (!field) return;

			// Clone element để remove tất cả event listeners cũ
			const newField = field.cloneNode(true);
			field.parentNode.replaceChild(newField, field);

			newField.addEventListener('input', function () {
				const value = this.value.toLowerCase();
				if (typeof showAutocompleteSuggestions === 'function') {
					showAutocompleteSuggestions(this, suggestions, value);
				}
			});

			newField.addEventListener('focus', function () {
				if (typeof showAutocompleteSuggestions === 'function') {
					showAutocompleteSuggestions(this, suggestions, '');
				}
			});
		}

		// Nationality, Religion, Ethnicity autocomplete - Đã chuyển sang các Autocomplete components
		// Không cần setup ở đây nữa, đã được khởi tạo trong initializeModalAutocompleteComponents()

		// Education level autocomplete - Đã chuyển sang EducationLevelAutocomplete component
		// Không cần setup ở đây nữa, đã được khởi tạo trong initializeModalAutocompleteComponents()
	}

	/**
	 * Show/hide modal sections theo mode
	 * @param {String} mode - 'address', 'occupation', 'gender', hoặc 'all'
	 */
	function showModalSections(mode) {
		const allSections = document.querySelectorAll('.modal-section');
		allSections.forEach(section => {
			const sectionType = section.getAttribute('data-section');
			setPersonalDetailVisible(section, sectionType === mode);
		});

		// Modal title luôn là "Thông tin chi tiết", không thay đổi theo mode
	}

	/**
	 * Load address data into modal
	 * Version đầy đủ từ receptionist-new.js - gọi trực tiếp các function đã được expose
	 */
	async function loadAddressDataIntoModal() {
		// Load current data from main form's hidden fields
		let currentProvince = safeVal('province');
		let currentDistrict = safeVal('district');
		let currentWard = safeVal('ward');
		let currentAddressDetail = safeVal('addressDetail');

		// Các trường này có thể không tồn tại trên form chính (chỉ có trong modal), cần lấy an toàn
		let currentIdCard = safeVal('idCard');
		let currentNationality = safeVal('nationality');
		let currentReligion = safeVal('religion');
		let currentEthnicity = safeVal('ethnicity');
		let currentEducationLevel = safeVal('educationLevel');
		let currentOccupation = safeVal('occupation');
		let currentDonViCongTac = safeVal('donViCongTac');
		let currentDiaChiCongTy = safeVal('diaChiCongTy');
		let currentGender = safeVal('gender');

		// sexual_orientation: lấy từ hidden field trên form chính (giống nationality, religion, etc.)
		let currentSexualOrientation = safeVal('sexualOrientation');
		let currentMangThai = safeVal('mangThai');

		// ✅ FALLBACK: Nếu hidden fields rỗng VÀ đang edit patient, load từ DB (GỘP 2 LẦN LOAD THÀNH 1)
		const needsLoadFromDB = window.currentPatientId && (
			(!currentProvince && !currentAddressDetail) ||
			(!currentOccupation && !currentDonViCongTac && !currentDiaChiCongTy)
		);

		if (needsLoadFromDB && typeof apiCall === 'function') {
			try {
				const response = await apiCall(`/api/patients/${window.currentPatientId}`);
				if (response.ok) {
					const data = await response.json();
					const patientData = data.data || data;

					// Load address data
					if (!currentProvince && !currentAddressDetail) {
						currentProvince = patientData.province || '';
						// ✅ FIX: Trong hệ thống 2 cấp, Phường/Xã lưu trong cột ward (không phải district)
						currentDistrict = ''; // Không dùng district nữa
						currentWard = patientData.ward || '';
						currentAddressDetail = patientData.address_detail || '';

						// Update hidden fields với data từ DB
						safeSetValue('province', currentProvince);
						safeSetValue('district', ''); // Không dùng district
						safeSetValue('ward', currentWard); // Lưu Phường/Xã vào ward
						safeSetValue('addressDetail', currentAddressDetail);
					} else {
						// ✅ FIX: Luôn load ward từ DB nếu hidden field rỗng (dù có province hay không)
						// Điều này đảm bảo ward được cập nhật thủ công trong DB sẽ không bị mất
						if (!currentWard && patientData.ward) {
							currentWard = patientData.ward;
							safeSetValue('ward', currentWard);
						}
					}

					// Load expected_delivery_date từ patient data nếu có
					if (patientData.expected_delivery_date) {
						const modalNgayDuSinh = document.getElementById('modalNgayDuSinh');
						if (modalNgayDuSinh) {
							// Khi EDIT: Luôn hiển thị ngày dự sinh từ database (kể cả quá khứ)
							// Chỉ ràng buộc minDate khi người dùng muốn thay đổi
							modalNgayDuSinh.value = patientData.expected_delivery_date;
							// Trigger change để tính tuần thai
							if (typeof $ !== 'undefined') {
								setTimeout(() => {
									$(modalNgayDuSinh).trigger('change.pregnancyWeekCalculation');
								}, 100);
							}
						}
					}

					// Load idCard và thông tin cá nhân (nationality, religion, ethnicity)
					const idCard = patientData.id_number || patientData.id_card || '';
					const nat = patientData.nationality || '';
					const rel = patientData.religion || '';
					const eth = patientData.ethnicity || '';

					if (idCard || nat || rel || eth) {
						safeSetValue('idCard', idCard);
						safeSetValue('nationality', nat);
						safeSetValue('religion', rel);
						safeSetValue('ethnicity', eth);
					}

					// Load occupation và gender data
					if (!currentOccupation && !currentDonViCongTac && !currentDiaChiCongTy) {
						const occ = patientData.occupation || '';
						const dvc = patientData.don_vi_cong_tac || '';
						const dcc = patientData.dia_chi_cong_ty || '';
						const gen = patientData.gender || '';
						const so = patientData.sexual_orientation || '';
						const mt = patientData.mang_thai || false;
						const stt = patientData.so_tuan_thai || '';

						// Update hidden fields với data từ DB
						safeSetValue('occupation', occ);
						safeSetValue('donViCongTac', dvc);
						safeSetValue('diaChiCongTy', dcc);
						safeSetValue('gender', gen);
						// Set vào hidden field trên form chính (giống nationality, religion, etc.)
						safeSetValue('sexualOrientation', so);
						safeSetValue('mangThai', mt ? '1' : '');
						safeSetValue('soTuanThai', stt);

						// Update current values
						if (occ) currentOccupation = occ;
						if (dvc) currentDonViCongTac = dvc;
						if (dcc) currentDiaChiCongTy = dcc;
						if (gen) currentGender = gen;
						if (so) currentSexualOrientation = so;
						if (mt) currentMangThai = '1';
					}

					// Update current values cho identity fields
					if (idCard) currentIdCard = idCard;
					if (nat) currentNationality = nat;
					if (rel) currentReligion = rel;
					if (eth) currentEthnicity = eth;
				}
			} catch (e) {
				// Ignore errors
			}
		}

		// Set values for the modal fields
		const modalProvinceSelect = document.getElementById('modalProvince');
		// const modalDistrictSelect = document.getElementById('modalDistrict'); // Removed
		const modalWardSelect = document.getElementById('modalWard');

		const modalAddressDetailEl = document.getElementById('modalAddressDetail');
		if (modalAddressDetailEl) modalAddressDetailEl.value = currentAddressDetail;
		const modalIdCardEl = document.getElementById('modalIdCard');
		if (modalIdCardEl) modalIdCardEl.value = currentIdCard || '';
		const modalNationalityEl = document.getElementById('modalNationality');
		if (modalNationalityEl) {
			modalNationalityEl.value = currentNationality;
			// Set giá trị cho autocomplete nếu đã được khởi tạo
			if (window.modalNationalityAutocomplete && window.modalNationalityAutocomplete.setValue) {
				window.modalNationalityAutocomplete.setValue(currentNationality);
			}
		}
		const modalReligionEl = document.getElementById('modalReligion');
		if (modalReligionEl) {
			modalReligionEl.value = currentReligion;
			// Set giá trị cho autocomplete nếu đã được khởi tạo
			if (window.modalReligionAutocomplete && window.modalReligionAutocomplete.setValue) {
				window.modalReligionAutocomplete.setValue(currentReligion);
			}
		}
		const modalEthnicityEl = document.getElementById('modalEthnicity');
		if (modalEthnicityEl) {
			modalEthnicityEl.value = currentEthnicity;
			// Set giá trị cho autocomplete nếu đã được khởi tạo
			if (window.modalEthnicityAutocomplete && window.modalEthnicityAutocomplete.setValue) {
				window.modalEthnicityAutocomplete.setValue(currentEthnicity);
			}
		}
		// education_level: Vẫn load để hiển thị trong modal occupation (khi mode = 'occupation' hoặc 'all')
		const modalEducationLevelEl = document.getElementById('modalEducationLevel');
		if (modalEducationLevelEl) {
			modalEducationLevelEl.value = currentEducationLevel;
			// Set giá trị cho autocomplete nếu đã được khởi tạo
			if (window.modalEducationLevelAutocomplete && window.modalEducationLevelAutocomplete.setValue) {
				window.modalEducationLevelAutocomplete.setValue(currentEducationLevel);
			}
		}

		// Set occupation value - sử dụng autocomplete nếu có
		const modalOccupationInput = document.getElementById('modalOccupation');
		if (modalOccupationInput) {
			modalOccupationInput.value = currentOccupation;
			// Set giá trị cho autocomplete nếu đã được khởi tạo
			if (window.modalOccupationAutocomplete && window.modalOccupationAutocomplete.setValue) {
				window.modalOccupationAutocomplete.setValue(currentOccupation);
			}
		}

		const modalDonViCongTacEl = document.getElementById('modalDonViCongTac');
		if (modalDonViCongTacEl) modalDonViCongTacEl.value = currentDonViCongTac;
		const modalDiaChiCongTyEl = document.getElementById('modalDiaChiCongTy');
		if (modalDiaChiCongTyEl) modalDiaChiCongTyEl.value = currentDiaChiCongTy;

		// Load gender data
		const modalGender = document.getElementById('modalGender');
		if (modalGender) {
			modalGender.value = currentGender || 'male';
		}
		const modalSexualOrientation = document.getElementById('modalSexualOrientation');
		if (modalSexualOrientation) {
			modalSexualOrientation.value = currentSexualOrientation;
			// Set giá trị cho autocomplete nếu đã được khởi tạo
			if (window.sexualOrientationAutocomplete && window.sexualOrientationAutocomplete.setValue && currentSexualOrientation) {
				window.sexualOrientationAutocomplete.setValue(currentSexualOrientation);
			}
		}
		const modalMangThai = document.getElementById('modalMangThai');
		if (modalMangThai) {
			modalMangThai.checked = currentMangThai === '1' || currentMangThai === 'true';
		}

		// Load ngày dự sinh; tuần thai chỉ được tính từ ngày dự sinh.
		const modalNgayDuSinh = document.getElementById('modalNgayDuSinh');
		if (modalNgayDuSinh) {
			const modalSoTuanThai = document.getElementById('modalSoTuanThai');

			if (!modalNgayDuSinh.value) {
				// Clear nếu không có dữ liệu
				modalNgayDuSinh.value = '';
				if (modalSoTuanThai) {
					modalSoTuanThai.value = '';
				}
			} else {
				// Đã có giá trị từ patient data, trigger change để tính tuần thai
				if (typeof $ !== 'undefined') {
					setTimeout(() => {
						$(modalNgayDuSinh).trigger('change.pregnancyWeekCalculation');
					}, 100);
				}
			}
		}

		// Update pregnancy section visibility - gọi trực tiếp vì function đã được expose
		if (typeof updatePregnancySectionVisibility === 'function') {
			updatePregnancySectionVisibility();
		}

		// Add event listeners for modal dropdowns TRƯỚC loadAddressHierarchy
		// để tránh mất giá trị khi clone element (fix từ lễ tân)
		if (typeof setupModalEventListeners === 'function') {
			setupModalEventListeners();
		}

		// Load complete address hierarchy using utility functions - gọi trực tiếp vì function đã được expose
		// Gọi SAU setupModalEventListeners để giá trị không bị mất khi clone
		// ✅ FIX: Truyền currentWard để populate vào modal (tránh bị clear khi đóng modal)
		if (typeof loadAddressHierarchy === 'function') {
			await loadAddressHierarchy(currentProvince, null, currentWard); // district = null (không dùng)
		}

		// Setup autocomplete for modal fields - gọi trực tiếp vì function đã được expose
		if (typeof setupModalAutocomplete === 'function') {
			setupModalAutocomplete();
		}
	}

	/**
	 * Mở modal với mode cụ thể
	 * @param {String} mode - 'address', 'occupation', 'gender', hoặc 'all'
	 */
	function openPersonalDetailModal(mode = 'all') {
		// Đảm bảo modal đã được load trước
		ensureModalLoaded(function () {
			openPersonalDetailModalInternal(mode);
		});
	}

	/**
	 * Internal function để mở modal (sau khi đã load HTML)
	 */
	function openPersonalDetailModalInternal(mode) {
		// Set min date cho ngày dự sinh = ngày hôm nay (không cho chọn ngày quá khứ)
		setMinDateForModalNgayDuSinh();

		// Load data vào modal
		loadAddressDataIntoModal();

		// Show/hide sections theo mode
		if (mode !== 'all') {
			showModalSections(mode);
			// Nếu là gender mode, cần update pregnancy section visibility
			if (mode === 'gender') {
				setTimeout(() => {
					if (typeof updatePregnancySectionVisibility === 'function') {
						updatePregnancySectionVisibility();
					}
				}, 100);
			}
			// Setup autocomplete lại sau khi sections được hiển thị để đảm bảo autocomplete hoạt động
			// Đặc biệt quan trọng cho education_level đã được di chuyển sang modal occupation
			// Và cho nationality, religion, ethnicity đã được di chuyển sang modal identity
			if (mode === 'identity' || mode === 'occupation' || mode === 'all') {
				setTimeout(() => {
					// Khởi tạo lại các autocomplete components sau khi sections được hiển thị
					if (typeof initializeModalAutocompleteComponents === 'function') {
						initializeModalAutocompleteComponents();
					}
					if (typeof setupModalAutocomplete === 'function') {
						setupModalAutocomplete();
					}
				}, 100);
			}
		} else {
			// Show tất cả nếu mode = 'all'
			showAllModalSections();
			const modalTitle = document.getElementById('personalDetailModalLabel');
			if (modalTitle) {
				modalTitle.textContent = 'Thông tin đầy đủ';
			}
			// Setup autocomplete cho mode 'all'
			setTimeout(() => {
				if (typeof setupModalAutocomplete === 'function') {
					setupModalAutocomplete();
				}
			}, 100);
		}

		// Show modal
		const modalEl = document.getElementById('personalDetailModal');
		if (modalEl) {
			const modal = new bootstrap.Modal(modalEl);
			modal.show();
		}
	}

	/**
	 * Get all form values from modal fields
	 * DRY function - sử dụng chung cho tất cả các màn hình
	 */
	function getAddressFormValues() {
		// Read values from the Personal Detail modal fields
		const address_detail = document.getElementById('modalAddressDetail')?.value || '';
		// Lấy province từ autocomplete nếu có, nếu không thì lấy từ input
		let province = '';
		if (window.modalProvinceAutocomplete && window.modalProvinceAutocomplete.getValue) {
			province = window.modalProvinceAutocomplete.getValue();
		} else {
			province = document.getElementById('modalProvince')?.value || '';
		}
		const district = ''; // District field không còn sử dụng
		// Lấy ward từ autocomplete nếu có, nếu không thì lấy từ input
		let ward = '';
		if (window.modalWardAutocomplete && window.modalWardAutocomplete.getValue) {
			ward = window.modalWardAutocomplete.getValue();
		} else {
			ward = document.getElementById('modalWard')?.value || '';
		}
		const id_card = document.getElementById('modalIdCard')?.value || '';
		// Lấy nationality từ autocomplete nếu có, nếu không thì lấy từ input
		let nationality = '';
		if (window.modalNationalityAutocomplete && window.modalNationalityAutocomplete.getValue) {
			nationality = window.modalNationalityAutocomplete.getValue();
		} else {
			nationality = document.getElementById('modalNationality')?.value || '';
		}
		// Lấy religion từ autocomplete nếu có, nếu không thì lấy từ input
		let religion = '';
		if (window.modalReligionAutocomplete && window.modalReligionAutocomplete.getValue) {
			religion = window.modalReligionAutocomplete.getValue();
		} else {
			religion = document.getElementById('modalReligion')?.value || '';
		}
		// Lấy ethnicity từ autocomplete nếu có, nếu không thì lấy từ input
		let ethnicity = '';
		if (window.modalEthnicityAutocomplete && window.modalEthnicityAutocomplete.getValue) {
			ethnicity = window.modalEthnicityAutocomplete.getValue();
		} else {
			ethnicity = document.getElementById('modalEthnicity')?.value || '';
		}
		// education_level đã được di chuyển sang modal nghề nghiệp, không lấy ở đây nữa

		// Lấy occupation từ autocomplete nếu có, nếu không thì lấy từ input
		let occupation = '';
		if (window.modalOccupationAutocomplete && window.modalOccupationAutocomplete.getValue) {
			occupation = window.modalOccupationAutocomplete.getValue();
		} else {
			occupation = document.getElementById('modalOccupation')?.value || '';
		}

		const don_vi_cong_tac = document.getElementById('modalDonViCongTac')?.value || '';
		const dia_chi_cong_ty = document.getElementById('modalDiaChiCongTy')?.value || '';

		// Lấy education_level từ autocomplete nếu có, nếu không thì lấy từ input
		let education_level = '';
		if (window.modalEducationLevelAutocomplete && window.modalEducationLevelAutocomplete.getValue) {
			education_level = window.modalEducationLevelAutocomplete.getValue();
		} else {
			education_level = document.getElementById('modalEducationLevel')?.value || '';
		}

		const gender = document.getElementById('modalGender')?.value || '';

		// Lấy sexual_orientation từ autocomplete nếu có, nếu không thì lấy từ input
		let sexual_orientation = '';
		if (window.sexualOrientationAutocomplete && window.sexualOrientationAutocomplete.getValue) {
			sexual_orientation = window.sexualOrientationAutocomplete.getValue();
		} else {
			sexual_orientation = document.getElementById('modalSexualOrientation')?.value || '';
		}

		const mang_thai = document.getElementById('modalMangThai')?.checked || false;
		const expected_delivery_date = document.getElementById('modalNgayDuSinh')?.value || '';
		const so_tuan_thai = expected_delivery_date ? (() => {
			if (typeof calculatePregnancyWeek === 'function') {
				const result = calculatePregnancyWeek(expected_delivery_date);
				return result ? result.weeks : null;
			}
			return null;
		})() : null;

		return {
			address_detail, province, district, ward, id_card, nationality, religion, ethnicity,
			education_level, occupation, don_vi_cong_tac, dia_chi_cong_ty, gender,
			sexual_orientation, mang_thai, expected_delivery_date, so_tuan_thai
		};
	}

	/**
	 * Save address draft to cache
	 * DRY function - sử dụng chung cho tất cả các màn hình
	 */
	function saveAddressDraftToCache() {
		try {
			// Sử dụng constants từ window nếu có, nếu không thì dùng default
			const ADDRESS_DRAFT_KEY = window.ADDRESS_DRAFT_KEY || 'qlpk_address_draft';
			const getCurrentLoadId = window.getCurrentLoadId || (() => {
				const PAGE_LOAD_ID_KEY = window.PAGE_LOAD_ID_KEY || 'qlpk_page_load_id';
				return () => sessionStorage.getItem(PAGE_LOAD_ID_KEY) || '';
			});

			const values = getAddressFormValues();
			const payload = {
				...values,
				loadId: getCurrentLoadId()
			};
			sessionStorage.setItem(ADDRESS_DRAFT_KEY, JSON.stringify(payload));
		} catch (e) {
			// Ignore errors
		}
	}

	/**
	 * Load address draft from cache
	 * DRY function - sử dụng chung cho tất cả các màn hình
	 */
	async function loadAddressDraftFromCache() {
		try {
			// Sử dụng constants từ window nếu có, nếu không thì dùng default
			const ADDRESS_DRAFT_KEY = window.ADDRESS_DRAFT_KEY || 'qlpk_address_draft';
			const getCurrentLoadId = window.getCurrentLoadId || (() => {
				const PAGE_LOAD_ID_KEY = window.PAGE_LOAD_ID_KEY || 'qlpk_page_load_id';
				return () => sessionStorage.getItem(PAGE_LOAD_ID_KEY) || '';
			});

			const raw = sessionStorage.getItem(ADDRESS_DRAFT_KEY);
			if (!raw) return;
			const data = JSON.parse(raw);
			// Chỉ nạp draft thuộc cùng lần tải trang
			if (!data.loadId || data.loadId !== getCurrentLoadId()) return;

			const setVal = (id, v) => {
				const el = document.getElementById(id);
				if (el) el.value = v || '';
			};

			setVal('modalAddressDetail', data.address_detail);
			setVal('modalNationality', data.nationality);
			setVal('modalReligion', data.religion);
			setVal('modalEthnicity', data.ethnicity);
			setVal('modalEducationLevel', data.education_level);
			setVal('modalOccupation', data.occupation);
			setVal('modalDonViCongTac', data.don_vi_cong_tac);
			setVal('modalDiaChiCongTy', data.dia_chi_cong_ty);
			setVal('modalGender', data.gender);
			setVal('modalSexualOrientation', data.sexual_orientation);

			const modalMangThai = document.getElementById('modalMangThai');
			if (modalMangThai) {
				modalMangThai.checked = data.mang_thai === true || data.mang_thai === '1' || data.mang_thai === 'true';
			}

			// Set ngày dự sinh; tuần thai chỉ được tính từ ngày dự sinh.
			const modalNgayDuSinh = document.getElementById('modalNgayDuSinh');
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			if (data.expected_delivery_date) {
				// Kiểm tra ngày dự sinh không được là ngày quá khứ (chỉ khi tạo mới)
				const eddDate = new Date(data.expected_delivery_date);
				eddDate.setHours(0, 0, 0, 0);

				// Nếu đang edit (có currentPatientId), luôn hiển thị ngày dự sinh (kể cả quá khứ)
				// Nếu đang tạo mới, chỉ hiển thị nếu ngày >= hôm nay
				if (window.currentPatientId || eddDate >= today) {
					setVal('modalNgayDuSinh', data.expected_delivery_date);
					// Trigger change để tính tuần thai
					if (modalNgayDuSinh && typeof $ !== 'undefined') {
						setTimeout(() => {
							$(modalNgayDuSinh).trigger('change.pregnancyWeekCalculation');
						}, 100);
					}
				} else {
					// Nếu ngày quá khứ và đang tạo mới, clear field
					if (modalNgayDuSinh) {
						modalNgayDuSinh.value = '';
					}
				}
			} else {
				// Clear nếu không có dữ liệu
				if (modalNgayDuSinh) {
					modalNgayDuSinh.value = '';
				}
				const modalSoTuanThai = document.getElementById('modalSoTuanThai');
				if (modalSoTuanThai) {
					modalSoTuanThai.value = '';
				}
			}

			// Cập nhật hiển thị tuần và ngày nếu có ngày dự sinh
			if (modalNgayDuSinh && modalNgayDuSinh.value && typeof $ !== 'undefined') {
				setTimeout(() => {
					$(modalNgayDuSinh).trigger('change.pregnancyWeekCalculation');
				}, 100);
			}

			// Update pregnancy section visibility after loading data
			if (typeof updatePregnancySectionVisibility === 'function') {
				updatePregnancySectionVisibility();
			}

			// Set giá trị cho autocomplete nếu đã được khởi tạo
			if (data.occupation && window.modalOccupationAutocomplete && window.modalOccupationAutocomplete.setValue) {
				window.modalOccupationAutocomplete.setValue(data.occupation);
			}
			if (data.sexual_orientation && window.sexualOrientationAutocomplete && window.sexualOrientationAutocomplete.setValue) {
				window.sexualOrientationAutocomplete.setValue(data.sexual_orientation);
			}

			// Load complete address hierarchy using utility functions
			if (typeof loadAddressHierarchy === 'function') {
				await loadAddressHierarchy(data.province, null, data.ward); // Null district
			}

			// Sync address từ modal về form chính
			if (typeof buildFullAddressFromParts === 'function') {
				const { address_detail, ward, district, province } = getAddressFormValues();
				const full = buildFullAddressFromParts(address_detail, ward, district, province);
				const mainAddress = document.getElementById('address');
				if (mainAddress) mainAddress.value = full;
			}
		} catch (e) {
			// Ignore errors
		}
	}

	/**
	 * Clear address draft cache
	 * DRY function - sử dụng chung cho tất cả các màn hình
	 */
	function clearAddressDraftCache() {
		try {
			const ADDRESS_DRAFT_KEY = window.ADDRESS_DRAFT_KEY || 'qlpk_address_draft';
			sessionStorage.removeItem(ADDRESS_DRAFT_KEY);
		} catch (e) {
			// Ignore errors
		}
	}

	// Expose functions to global scope
	window.PersonalDetailModalDRY = {
		open: openPersonalDetailModal,
		loadData: loadAddressDataIntoModal,
		showSections: showModalSections,
		setMinDate: setMinDateForModalNgayDuSinh,
		updatePregnancySectionVisibility,
		ensureLoaded: ensureModalLoaded,
		getFormValues: getAddressFormValues,
		saveDraft: saveAddressDraftToCache,
		loadDraft: loadAddressDraftFromCache,
		clearDraft: clearAddressDraftCache
	};

	// ===== ADDRESS UTILITY FUNCTIONS (Standardized 2-Level: Region -> Unit) =====

	// Global normalize function for address name matching
	function normalizeAddressName(s) {
		if (!s) return '';
		let x = ('' + s).normalize('NFC').toLowerCase().trim();
		// Loại bỏ tiền tố thông dụng
		x = x.replace(/^t\s*p\.?\s*/i, '');
		x = x.replace(/^thành phố\s+/i, '');
		x = x.replace(/^tỉnh\s+/i, '');
		return x.replace(/\s+/g, ' ');
	}

	// Helper to set select value with fallback matching
	function setSelectValueWithFallback(selectId, value) {
		const select = document.getElementById(selectId);
		if (!select || !value) return false;

		if (!select.options) {
			select.value = value;
			return true;
		}

		// Try direct value first
		select.value = value;
		if (select.value === value) return true;

		// Fallback: try normalized matching
		const targetNorm = normalizeAddressName(value);
		const matchOpt = Array.from(select.options).find(opt =>
			normalizeAddressName(opt.textContent) === targetNorm
		);
		if (matchOpt) {
			select.value = matchOpt.value;
			return true;
		}
		return false;
	}

	async function findRegionCodeByName(provinceName) {
		if (!provinceName || typeof apiCall !== 'function') return null;
		try {
			const response = await apiCall('/api/vietnam-address/regions');
			const data = await response.json();
			const list = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
			const targetNorm = normalizeAddressName(provinceName);
			const region = list.find(item =>
				normalizeAddressName(item.name) === targetNorm ||
				normalizeAddressName(item.full_name || '') === targetNorm
			);
			return region ? region.code : null;
		} catch (error) {
			console.error('Error finding region code for modal:', error);
			return null;
		}
	}

	function clearWardOptionsOrValue(wardField) {
		if (!wardField) return;
		if (wardField.options) {
			wardField.innerHTML = '<option value="">Chọn Xã/Phường/Đặc khu</option>';
		} else {
			wardField.dataset.provinceCode = '';
		}
	}

	/**
	 * Load regions (provinces/cities) for modal
	 */
	async function loadRegionsForModal() {
		try {
			if (typeof apiCall !== 'function') return;
			const response = await apiCall('/api/vietnam-address/regions');
			const data = await response.json();

			if (data.success && data.data) {
				const provinceSelect = document.getElementById('modalProvince');
				if (!provinceSelect) return;

				// Save current value
				const currentValue = provinceSelect.value;
				if (!provinceSelect.options) {
					if (currentValue && window.modalProvinceAutocomplete && window.modalProvinceAutocomplete.setValueByName) {
						await window.modalProvinceAutocomplete.setValueByName(currentValue);
					}
					return;
				}

				provinceSelect.innerHTML = '<option value="">Chọn tỉnh/thành phố</option>';

				data.data.forEach(region => {
					const option = document.createElement('option');
					option.value = region.name;
					option.textContent = region.name;
					option.dataset.code = region.code; // Store code
					provinceSelect.appendChild(option);
				});

				// Restore value if exists
				if (currentValue) {
					setSelectValueWithFallback('modalProvince', currentValue);
				}
			}
		} catch (error) {
			console.error('Error loading regions for modal:', error);
		}
	}

	/**
	 * Load units (wards/communes) based on region code
	 */
	async function loadUnitsModal(provinceName, ignoredDistrict) {
		const provinceSelect = document.getElementById('modalProvince');
		if (!provinceSelect) return;

		// Get code from selected option or find it
		let provinceCode = null;
		if (window.modalProvinceAutocomplete && window.modalProvinceAutocomplete.getSelectedCode) {
			provinceCode = window.modalProvinceAutocomplete.getSelectedCode();
		}
		if (!provinceCode && provinceSelect.dataset) {
			provinceCode = provinceSelect.dataset.code || null;
		}
		if (!provinceCode && provinceSelect.options && provinceSelect.value === provinceName) {
			const selectedOption = provinceSelect.options[provinceSelect.selectedIndex];
			provinceCode = selectedOption ? selectedOption.dataset.code : null;
		}

		// Fallback: search in options if code not found (e.g. set by value only)
		if (!provinceCode && provinceSelect.options && provinceName) {
			const option = Array.from(provinceSelect.options).find(opt => opt.value === provinceName);
			if (option) provinceCode = option.dataset.code;
		}
		if (!provinceCode && provinceName) {
			provinceCode = await findRegionCodeByName(provinceName);
		}

		const wardSelect = document.getElementById('modalWard');
		if (!wardSelect) return;

		if (!provinceCode) {
			clearWardOptionsOrValue(wardSelect);
			return;
		}

		if (!wardSelect.options) {
			wardSelect.dataset.provinceCode = provinceCode;
			if (window.modalWardAutocomplete && window.modalWardAutocomplete.setProvinceCode) {
				await window.modalWardAutocomplete.setProvinceCode(provinceCode);
			}
			return;
		}

		try {
			// Show loading
			wardSelect.innerHTML = '<option value="">Đang tải...</option>';

			if (typeof apiCall !== 'function') return;
			const response = await apiCall(`/api/vietnam-address/regions/${provinceCode}/units`);
			const data = await response.json();
			const list = data.data || [];

			wardSelect.innerHTML = '<option value="">Chọn Xã/Phường/Đặc khu</option>';
			list.forEach(unit => {
				const option = document.createElement('option');
				option.value = unit.name;
				option.textContent = unit.name;
				wardSelect.appendChild(option);
			});
		} catch (error) {
			console.error('Error loading units (modal):', error);
			wardSelect.innerHTML = '<option value="">Lỗi tải dữ liệu</option>';
		}
	}

	/**
	 * Handle Province Change
	 */
	async function handleProvinceChange(provinceName) {
		if (provinceName) {
			// Directly load units (wards modal)
			// Pass null for district name
			await loadUnitsModal(provinceName, null);
		} else {
			const wardSelect = document.getElementById('modalWard');
			clearWardOptionsOrValue(wardSelect);
		}
	}

	/**
	 * Load complete address hierarchy
	 */
	async function loadAddressHierarchy(provinceName = null, districtName = null, wardName = null) {
		try {
			// Step 1: Load regions
			await loadRegionsForModal();

			// Set province value if provided
			if (provinceName) {
				setSelectValueWithFallback('modalProvince', provinceName);
			}

			// Step 2: Load units directly (AddressKit 2-level)
			if (provinceName) {
				// Just load units for the province
				await loadUnitsModal(provinceName, null);

				if (wardName) {
					setSelectValueWithFallback('modalWard', wardName);
				} else if (districtName) {
					// Fallback using district name for unit if ward is empty
					setSelectValueWithFallback('modalWard', districtName);
				}
			}
			return true;
		} catch (error) {
			console.error('Error loading address hierarchy:', error);
			return false;
		}
	}

	// Expose functions individually for backward compatibility
	window.loadRegionsForModal = loadRegionsForModal;
	window.loadProvincesForModal = loadRegionsForModal; // Alias
	window.loadUnitsModal = loadUnitsModal;
	window.loadWardsModal = loadUnitsModal; // Alias
	window.handleProvinceChange = handleProvinceChange;
	window.loadAddressHierarchy = loadAddressHierarchy;

	// Expose functions individually for backward compatibility
	window.openPersonalDetailModal = openPersonalDetailModal;
	window.loadAddressDataIntoModal = loadAddressDataIntoModal;
	window.showModalSections = showModalSections;
	window.setMinDateForModalNgayDuSinh = setMinDateForModalNgayDuSinh;
	window.updatePregnancySectionVisibility = updatePregnancySectionVisibility;
	window.setupModalEventListeners = setupModalEventListeners;
	window.setupModalAutocomplete = setupModalAutocomplete;
	window.showAutocompleteSuggestions = showAutocompleteSuggestions;
	window.getAddressFormValues = getAddressFormValues;
	window.saveAddressDraftToCache = saveAddressDraftToCache;
	window.loadAddressDraftFromCache = loadAddressDraftFromCache;
	window.clearAddressDraftCache = clearAddressDraftCache;

	// ✅ QUAN TRỌNG: Tự động bind events khi module được load nếu modal đã có sẵn trong DOM
	// Đảm bảo events được bind ngay cả khi modal không được load từ template
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', function () {
			// Kiểm tra nếu modal đã có sẵn trong DOM, bind events ngay
			if (document.getElementById('personalDetailModal') && !modalLoaded) {
				bindPersonalDetailModalEvents();
				modalLoaded = true;
			}
		});
	} else {
		// DOM đã được load, kiểm tra và bind events ngay
		if (document.getElementById('personalDetailModal') && !modalLoaded) {
			bindPersonalDetailModalEvents();
			modalLoaded = true;
		}
	}

})();
