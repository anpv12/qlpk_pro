// Khởi tạo FullCalendar, kéo thả/đổi thời lượng lịch hẹn.
// Hàm dùng chung qua window.AppointmentManagementPage; state trang nằm ở page.state.
(function (window) {
	const page = window.AppointmentManagementPage || (window.AppointmentManagementPage = { state: {} });
	const state = page.state;

	function consumeHeaderAppointmentModalRequest() {
		let attempts = 0;
		const maxAttempts = 20;
		const openWhenReady = () => {
			attempts += 1;
			try {
				if (sessionStorage.getItem('qlpk_open_add_appointment_modal') !== '1') return;
				const modal = document.getElementById('addAppointmentModal');
				if (!modal || !window.$ || typeof $('#addAppointmentModal').modal !== 'function') {
					if (attempts < maxAttempts) setTimeout(openWhenReady, 150);
					return;
				}
				window.openAddAppointmentWithDate();
				setTimeout(() => {
					if (modal.classList.contains('show')) {
						sessionStorage.removeItem('qlpk_open_add_appointment_modal');
						return;
					}
					if (attempts < maxAttempts) setTimeout(openWhenReady, 150);
				}, 80);
			} catch (error) {
				if (attempts < maxAttempts) setTimeout(openWhenReady, 150);
			}
		};

		setTimeout(openWhenReady, 2500);
	}

	// Load danh sách bác sĩ cho modal add
	function loadDoctorsForAdd() {
		$.ajax({
			url: '/users/doctors',
			method: 'GET',
			success: function (res) {
				window.AppointmentManagementDoctorControlsUtils.populateDoctorSelect($, '#addDoctor', res, 'Chọn bác sĩ');
			},
			error: function (xhr, status, error) {

				// Handle authentication error
				if (xhr.status === 401) {
					page.showCustomToast('error', 'Lỗi xác thực. Vui lòng đăng nhập lại.');
				} else {
					page.showCustomToast('error', 'Không thể tải danh sách bác sĩ. Vui lòng thử lại.');
				}
			}
		});
	}

	// Khi load trang lần đầu, $(document).ready sẽ khởi tạo calendar và loadAllAppointments

	// Khởi tạo FullCalendar
	function scheduleCalendarSizeUpdate() {
		if (!state.calendar || state.calendarResizeFrame) return;
		state.calendarResizeFrame = window.requestAnimationFrame(function () {
			state.calendarResizeFrame = null;
			if (state.calendar && typeof state.calendar.updateSize === 'function') {
				state.calendar.updateSize();
			}
		});
	}

	function bindCalendarResizeObserver(calendarEl) {
		if (state.calendarResizeObserver) {
			state.calendarResizeObserver.disconnect();
			state.calendarResizeObserver = null;
		}

		const calendarHost = calendarEl.closest('.appt-main') || calendarEl.parentElement || calendarEl;
		if (typeof ResizeObserver !== 'undefined') {
			state.calendarResizeObserver = new ResizeObserver(scheduleCalendarSizeUpdate);
			state.calendarResizeObserver.observe(calendarHost);
		}

		window.removeEventListener('resize', scheduleCalendarSizeUpdate);
		window.addEventListener('resize', scheduleCalendarSizeUpdate);
	}

	function initializeCalendar() {
		const calendarEl = document.getElementById('calendar');
		if (!calendarEl) return;

		state.calendar = window.QLPKAppointmentCalendar.create(calendarEl, {
			timeZone: 'local', // Đảm bảo sử dụng timezone local
			// Title sẽ được format lại trong datesSet callback
			expandRows: true,
			allDaySlot: false, // Bỏ all-day slot
			slotDuration: '01:00:00', // Slot 1 giờ match doctor
			slotLabelInterval: '01:00', // Vẫn hiển thị label mỗi giờ
			slotMinTime: '07:00:00', // Bắt đầu từ 7:00 match doctor
			slotMaxTime: '24:00:00', // Exclusive — hiện đến 23:00
			scrollTime: '07:00:00', // Scroll đến 7h khi load
			slotLabelFormat: {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false
			},
			dayHeaderContent: function (arg) {
				const viewType = arg.view.type;
				if (viewType === 'timeGridWeek') {
					const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
					const dayName = dayNames[arg.date.getDay()];
					const dayNum = String(arg.date.getDate()).padStart(2, '0');
					const container = document.createElement('div');
					container.className = 'appointment-week-day-header';
					const nameEl = document.createElement('span');
					nameEl.textContent = dayName;
					nameEl.className = 'appointment-week-day-name';
					const numEl = document.createElement('span');
					numEl.textContent = dayNum;
					numEl.className = 'appointment-week-day-number';
					container.appendChild(nameEl);
					container.appendChild(numEl);
					return { domNodes: [container] };
				}
				return arg.text;
			},

			editable: true,
			selectable: true,
			selectMirror: true,
			moreLinkClick: 'popover', // Hiển thị popover khi có quá nhiều events
			weekends: true,
			datesSet: function (info) {
				// Load appointments theo range của view hiện tại
				const start = info.start || info.view.activeStart;
				const end = info.end || info.view.activeEnd;
				const dateFrom = start.toISOString().split('T')[0];
				const dateTo = end.toISOString().split('T')[0];
				page.loadCalendarRangeData(dateFrom, dateTo);
			},
			events: [],
			eventDisplay: 'block', // Đảm bảo hiển thị
			eventOverlap: false, // Tránh overlap events
			slotEventOverlap: false, // Tránh overlap trong slot
			eventConstraint: {
				startTime: '08:00',
				endTime: '24:00',
				dows: [0, 1, 2, 3, 4, 5, 6] // Tất cả các ngày trong tuần
			},

			// Đảm bảo không bị cắt theo business hours
			businessHours: false,
			// Set ngày bắt đầu hiển thị là tuần hiện tại
			initialDate: new Date(), // Hiển thị tuần hiện tại
			// Không giới hạn phạm vi thời gian - cho phép xem tất cả các tháng/năm
			// Tối ưu drag & drop
			eventDrop: function (info) {
				const event = info.event;
				const newDate = event.start;
				const appointmentId = event.id;

				//   eventId: appointmentId,
				//   newDate: newDate,
				//   event: event
				// });

				// Kiểm tra ID format
				if (!appointmentId || appointmentId === '') {
					page.showCustomToast('error', 'Lỗi: Không tìm thấy ID lịch hẹn!');
					info.revert(); // Revert the drag
					return;
				}

				// Kiểm tra lịch bận trước khi cập nhật
				page.checkDoctorAvailabilityForDragDrop(appointmentId, newDate, info);
			},
			eventResize: function (info) {
				const event = info.event;
				const newStart = event.start;
				const newEnd = event.end;
				const appointmentId = event.id;
				let numericId = appointmentId;
				if (appointmentId.startsWith('appt-')) {
					numericId = appointmentId.replace('appt-', '');
				}
				const appointment = state.allAppointments.find(item => item.id == numericId);
				if (!appointment) {
					page.showCustomToast('error', 'Không tìm thấy lịch hẹn!');
					info.revert();
					return;
				}
				const duration = Math.round((newEnd - newStart) / (1000 * 60));
				const appointmentData = {
					appointment_date: toLocalISOString(newStart),
					doctor_id: appointment.doctor_id,
					duration_minutes: duration,
					appointment_id: numericId
				};

				// Thêm visual feedback ngay lập tức
				page.showCustomToast('info', 'Đang cập nhật thời lượng...');

				// Debounce để tránh gọi API quá nhiều
				clearTimeout(window.resizeTimeout);
				window.resizeTimeout = setTimeout(() => {
					page.checkDoctorAvailabilityBeforeCreate(appointmentData, function (isAvailable, conflictInfo) {
						if (!isAvailable) {
							page.showConflictWarning(conflictInfo, appointmentData, true);
							info.revert();
							return;
						}
						updateAppointmentDuration(appointmentId, newStart, newEnd, info);
					});
				}, 300);
			},
			eventClick: function (info) {
				// Không cho phép click vào ngày lễ
				if (info.event.extendedProps.type === 'holiday') {
					return false;
				}

				// Xử lý click vào busy schedule indicator
				if (info.event.extendedProps.type === 'busy_schedule') {
					page.showBusySchedulePopup(info.event);
					return false; // Ngăn không cho mở modal appointment
				}

				const appointmentId = info.event.id;
				page.openEditModal(appointmentId);
			},
			dateClick: function (info) {
				page.openAddModal(info.dateStr);
			}
		}, { getDoctors: () => state.doctors });

		state.calendar.render();
		bindCalendarResizeObserver(calendarEl);
		scheduleCalendarSizeUpdate();
		window.setTimeout(scheduleCalendarSizeUpdate, 120);
		window.calendar = state.calendar; // Expose for mini calendar sync
	}

	// Hàm format ISO string đơn giản (không có offset)
	function toLocalISOString(date) {
		return window.AppointmentManagementCalendarDateUtils.toLocalISOString(date);
	}

	// Cập nhật thời gian lịch hẹn
	function updateAppointmentTime(appointmentId, newDate, info = null) {
		//   appointmentId: appointmentId,
		//   newDate: newDate,
		//   allAppointments: allAppointments.length
		// });

		// Xử lý ID format - calendar events sử dụng appt-{id}
		let numericId = appointmentId;
		if (appointmentId.startsWith('appt-')) {
			numericId = appointmentId.replace('appt-', '');
		}

		const appointment = state.allAppointments.find(a => a.id == numericId);
		if (!appointment) {
			//   originalId: appointmentId,
			//   numericId: numericId,
			//   availableIds: allAppointments.map(a => a.id)
			// });
			page.showCustomToast('error', 'Không tìm thấy lịch hẹn!');
			if (info) {
				info.revert(); // Revert the drag
			} else {
				state.calendar.refetchEvents(); // Revert calendar
			}
			return;
		}

		const formattedDate = toLocalISOString(newDate);

		// Kéo-thả chỉ đổi lịch: chỉ gửi field scheduling, KHÔNG gửi field hồ sơ bệnh nhân
		// (tránh ghi đè dữ liệu patient bằng snapshot list có thể cũ/thiếu)
		const updateData = {
			patient_id: appointment.patient_id,
			appointment_date: formattedDate, // BẮT BUỘC
			doctor_id: appointment.doctor_id,
			duration_minutes: appointment.duration_minutes,
			status: appointment.status,
			notes: appointment.notes
		}

		$.ajax({
			url: `/api/${numericId}`,
			method: 'PUT',
			contentType: 'application/json',
			data: JSON.stringify(updateData),
			success: function (response) {
				page.showCustomToast('success', 'Đã cập nhật giờ hẹn thành công!');

				// Cập nhật allAppointments
				const index = state.allAppointments.findIndex(a => a.id == numericId);
				if (index !== -1) {
					state.allAppointments[index].appointment_date = formattedDate;
				}

				// Không reload toàn bộ, chỉ cập nhật event hiện tại
				const event = state.calendar.getEventById(appointmentId);
				if (event) {
					event.setStart(newDate);
				}
			},
			error: function (xhr, status, error) {
				//   status: status,
				//   error: error,
				//   responseText: xhr.responseText
				// });

				const errorMessage = 'Không thể cập nhật giờ hẹn. Vui lòng thử lại.';

				page.showCustomToast('error', errorMessage);

				if (info) {
					info.revert(); // Revert the drag
				} else {
					state.calendar.refetchEvents(); // Revert calendar
				}
			}
		});
	}

	// Cập nhật thời lượng lịch hẹn
	function updateAppointmentDuration(appointmentId, newStart, newEnd, info = null) {
		// Xử lý ID format - calendar events sử dụng appt-{id}
		let numericId = appointmentId;
		if (appointmentId.startsWith('appt-')) {
			numericId = appointmentId.replace('appt-', '');
		}

		const appointment = state.allAppointments.find(a => a.id == numericId);
		if (!appointment) {
			page.showCustomToast('error', 'Không tìm thấy lịch hẹn!');
			if (info) {
				info.revert();
			} else {
				state.calendar.refetchEvents(); // Revert calendar
			}
			return;
		}
		const duration = Math.round((newEnd - newStart) / (1000 * 60)); // Tính phút
		// Resize chỉ đổi thời lượng: chỉ gửi field scheduling, KHÔNG gửi field hồ sơ bệnh nhân
		const updateData = {
			patient_id: appointment.patient_id,
			appointment_date: appointment.appointment_date, // BẮT BUỘC
			doctor_id: appointment.doctor_id,
			duration_minutes: duration,
			status: appointment.status,
			notes: appointment.notes
		}
		$.ajax({
			url: `/api/${numericId}`,
			method: 'PUT',
			contentType: 'application/json',
			data: JSON.stringify(updateData),
			success: function (response) {
				page.showCustomToast('success', 'Đã cập nhật thời gian lịch hẹn!');
				const index = state.allAppointments.findIndex(a => a.id == numericId);
				if (index !== -1) {
					state.allAppointments[index].duration_minutes = duration;
				}
				// Không reload toàn bộ, chỉ cập nhật event hiện tại
				const event = state.calendar.getEventById(appointmentId);
				if (event) {
					event.setStart(newStart);
					event.setEnd(newEnd);
				}
			},
			error: function (xhr) {
				page.showCustomToast('error', 'Không thể cập nhật thời gian. Vui lòng thử lại.');
				if (info) {
					info.revert();
				} else {
					state.calendar.refetchEvents();
				}
			}
		});
	}

	Object.assign(page, {
		consumeHeaderAppointmentModalRequest,
		loadDoctorsForAdd,
		scheduleCalendarSizeUpdate,
		bindCalendarResizeObserver,
		initializeCalendar,
		toLocalISOString,
		updateAppointmentTime,
		updateAppointmentDuration
	});
})(window);
