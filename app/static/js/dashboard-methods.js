/* global DashboardManager */
// dashboard.js: method của DashboardManager tách từ dashboard.js (nạp ngay sau file đó).
// Gắn vào prototype như method của class (non-enumerable, writable, configurable).
(function (window) {
	'use strict';
	const methods = {
		renderReferralSourceChart(items) {
			const dom = document.getElementById('referralSourceChart');
			if (!dom) return;

			if (this.referralSourceChart) {
				this.referralSourceChart.dispose();
				this.referralSourceChart = null;
			}

			if (!items.length) {
				dom.innerHTML = '<div class="empty-state"><i class="bi bi-diagram-3"></i>Chưa có dữ liệu nguồn giới thiệu</div>';
				return;
			}

			const total = items.reduce((sum, item) => sum + (item.count || 0), 0);
			const fallbackColors = {
				facebook: '#1877F2',
				website: '#22C55E',
				referral: '#F59E0B',
				medpro: '#EF4444',
				walk_in: '#06B6D4',
				other: '#8B5CF6'
			};
			const iconFor = {
				facebook: 'bi-facebook',
				website: 'bi-globe2',
				referral: 'bi-people-fill',
				medpro: 'bi-heart-pulse-fill',
				walk_in: 'bi-door-open-fill',
				other: 'bi-grid-3x3-gap-fill'
			};
			const classFor = (key) => String(key || 'unknown').replace(/[^a-z0-9_-]/gi, '');
			const colorFor = (item) => {
				const color = String(item.color || '').trim();
				return /^#[0-9a-f]{6}$/i.test(color) ? color : (fallbackColors[item.key] || '#8B5CF6');
			};
			const percentFor = (count) => total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
			const percentText = (percent) => Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;

			dom.innerHTML = `
				<div class="referral-source-tag-summary">
					<span class="referral-source-tag-summary-label">Tổng lượt khám</span>
					<span class="referral-source-tag-summary-value">${total}</span>
				</div>
				<div class="referral-source-tag-grid">
					${items.map((item) => {
						const count = item.count || 0;
						const percent = percentFor(count);
						const color = colorFor(item);
						const icon = iconFor[item.key] || 'bi-tag-fill';
						return `<button type="button" class="referral-source-tag referral-source-tag--${classFor(item.key)}"
							style="--tag-color:${color};--tag-bg:${color}14;--tag-shadow:${color}26;--tag-width:${percent}%;"
							data-source-key="${this.escapeHtml(item.key)}" data-source-label="${this.escapeHtml(item.label)}" data-source-count="${item.count || 0}"
							title="${this.escapeHtml(item.label)}: ${item.count || 0} lượt khám">
							<span class="referral-source-tag-icon"><i class="bi ${icon}"></i></span>
							<span class="referral-source-tag-main">
								<span class="referral-source-tag-label">${this.escapeHtml(item.label)}</span>
								<span class="referral-source-tag-metrics">
									<span class="referral-source-tag-count">${count} lượt</span>
									<span class="referral-source-tag-share">${percentText(percent)}</span>
								</span>
							</span>
							<span class="referral-source-tag-bar"><span></span></span>
						</button>`;
					}).join('')}
				</div>
			`;

			dom.querySelectorAll('.referral-source-tag').forEach((button) => {
				button.addEventListener('click', () => {
					this.showReferralSourceDetail(
						button.dataset.sourceKey,
						button.dataset.sourceLabel,
						Number(button.dataset.sourceCount || 0)
					);
				});
			});
		},

		async showReferralSourceDetail(sourceKey, sourceLabel, count) {
			const modalEl = document.getElementById('referralSourceDetailModal');
			if (!modalEl) return;
			const modal = new bootstrap.Modal(modalEl);

			document.getElementById('referralSourceDetailTitle').textContent = `${sourceLabel} — ${count || 0} lượt khám`;
			this.setElementVisible('referralSourceDetailLoading', true);
			this.setElementVisible('referralSourceDetailContent', false);
			this.setElementVisible('referralSourceDetailEmpty', false);
			modal.show();

			try {
				const url = `/api/dashboard/referral-source-detail?source=${encodeURIComponent(sourceKey)}&from_date=${this.referralSourceFromDate}&to_date=${this.referralSourceToDate}`;
				const res = await fetch(url, {
				});
				if (!res.ok) throw new Error('API error');
				const data = await res.json();
				const items = data.items || [];

				this.setElementVisible('referralSourceDetailLoading', false);

				if (items.length === 0) {
					this.setElementVisible('referralSourceDetailEmpty', true);
					return;
				}

				const tbody = document.getElementById('referralSourceDetailTableBody');
				tbody.innerHTML = items.map((item, index) => `
					<tr class="${index % 2 === 0 ? '' : 'dashboard-row-green-alt'}">
						<td class="ps-3 py-2 text-center fw-semibold dashboard-cell-accent">${index + 1}</td>
						<td class="py-2 fw-semibold">${this.escapeHtml(item.patient_name || '')}</td>
						<td class="py-2 dashboard-cell-muted">${this.escapeHtml(item.phone || '')}</td>
						<td class="py-2 text-center dashboard-cell-muted">${this.escapeHtml(item.exam_date || '')}</td>
						<td class="py-2 text-center dashboard-cell-accent dashboard-cell-semibold">${this.escapeHtml(item.exam_time || '')}</td>
						<td class="py-2 referral-source-detail-reason">${this.escapeHtml(item.main_reason || '—')}</td>
						<td class="pe-3 py-2 referral-source-detail-source">${this.escapeHtml(item.source_value || item.source_label || '')}</td>
					</tr>
				`).join('');

				this.setElementVisible('referralSourceDetailContent', true);
			} catch (e) {
				console.error('Referral source detail error:', e);
				this.setElementVisible('referralSourceDetailLoading', false);
				this.setElementVisible('referralSourceDetailEmpty', true);
			}
		},

		// ==================== TOP ICD ====================
		async loadTopICD() {
			try {
				const url = `/api/dashboard/top-icd?from_date=${this.icdFromDate}&to_date=${this.icdToDate}`;
				const response = await fetch(url, {
				});
				if (response.ok) {
					const data = await response.json();
					this.renderICDChart(data.items || []);
				}
			} catch (e) {
				console.error('Error loading top ICD:', e);
			}
		},

		renderICDChart(items) {
			const dom = document.getElementById('icdChart');
			if (!dom) return;

			if (this.icdChart) { this.icdChart.dispose(); this.icdChart = null; }

			if (items.length === 0) {
				dom.innerHTML = '<div class="empty-state"><i class="bi bi-clipboard2-pulse"></i>Chưa có dữ liệu ICD</div>';
				return;
			}

			const COLORS = [
				'#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
				'#06B6D4', '#F97316', '#EC4899', '#14B8A6', '#A855F7',
				'#6366F1', '#84CC16', '#D946EF', '#0EA5E9', '#22C55E',
				'#FB923C', '#F43F5E', '#7C3AED', '#0891B2', '#65A30D'
			];

			const total = items.reduce((s, i) => s + i.count, 0);
			const treemapData = items.map((item, i) => ({
				name: item.icd_code,
				value: item.count,
				_disease: item.disease_name || '',
				_pct: total > 0 ? (item.count / total * 100).toFixed(1) : 0,
				itemStyle: { color: COLORS[i % COLORS.length] }
			}));

			const chart = echarts.init(dom);
			this.icdChart = chart;

			chart.setOption({
				tooltip: {
					trigger: 'item',
					confine: true,
					formatter: (p) => {
						const d = p.data;
						return `<b>${d.name}</b><br/>
							<span class="dashboard-tooltip-muted">${d._disease}</span><br/>
							${p.marker} <b>${d.value}</b> ca &nbsp;•&nbsp; ${d._pct}%`;
					}
				},
				series: [{
					type: 'treemap',
					width: '100%',
					height: '100%',
					roam: false,
					nodeClick: false,
					breadcrumb: { show: false },
					label: {
						show: true,
						formatter: (p) => `{code|${p.name}}\n{cnt|${p.value} ca}`,
						rich: {
							code: { fontSize: 13, fontWeight: 'bold', color: '#fff', lineHeight: 20 },
							cnt: { fontSize: 11, color: 'rgba(255,255,255,0.82)', lineHeight: 16 }
						}
					},
					upperLabel: { show: false },
					itemStyle: { borderWidth: 2, borderColor: '#fff', gapWidth: 2 },
					emphasis: {
						itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.25)' },
						label: { color: '#fff' }
					},
					data: treemapData,
					animationType: 'expansion',
					animationDuration: 600
				}]
			});

			// Click vào 1 ICD block → show chi tiết ca khám
			chart.on('click', (params) => {
				if (params.data && params.data.name) {
					this.showICDDetail(params.data.name, params.data._disease, params.data.value);
				}
			});

			window.addEventListener('resize', () => chart.resize());
		},

		async showICDDetail(icdCode, diseaseName, count) {
			const modalEl = document.getElementById('icdDetailModal');
			if (!modalEl) return;
			const modal = new bootstrap.Modal(modalEl);

			document.getElementById('icdDetailTitle').textContent =
				`${icdCode} — ${diseaseName || ''} (${count} ca)`;
			this.setElementVisible('icdDetailLoading', true);
			this.setElementVisible('icdDetailContent', false);
			this.setElementVisible('icdDetailEmpty', false);
			modal.show();

			try {
				const url = `/api/dashboard/icd-detail?icd_code=${encodeURIComponent(icdCode)}&from_date=${this.icdFromDate}&to_date=${this.icdToDate}`;
				const res = await fetch(url, {
				});
				if (!res.ok) throw new Error('API error');
				const data = await res.json();
				const items = data.items || [];

				this.setElementVisible('icdDetailLoading', false);

				if (items.length === 0) {
					this.setElementVisible('icdDetailEmpty', true);
					return;
				}

				const tbody = document.getElementById('icdDetailTableBody');
				tbody.innerHTML = items.map((it, i) =>
					`<tr class="${i % 2 === 0 ? '' : 'dashboard-row-green-alt'}">
						<td class="ps-3 py-2 text-center fw-semibold dashboard-cell-accent">${i + 1}</td>
						<td class="py-2 fw-semibold">${it.patient_name}</td>
						<td class="py-2 dashboard-cell-muted">${it.doctor_name}</td>
						<td class="py-2 text-center dashboard-cell-muted">${it.exam_date}</td>
						<td class="pe-3 py-2 text-center dashboard-cell-accent dashboard-cell-semibold">${it.exam_time}</td>
					</tr>`
				).join('');

				this.setElementVisible('icdDetailContent', true);
			} catch (e) {
				console.error('ICD detail error:', e);
				this.setElementVisible('icdDetailLoading', false);
				this.setElementVisible('icdDetailEmpty', true);
			}
		},

		// ==================== EXPORT EXCEL ====================
		async exportICDExcel() {
			const btn = document.getElementById('btnExportICD');
			if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Đang xuất...'; }
			try {
				const url = `/api/dashboard/export-icd-excel?from_date=${this.icdFromDate}&to_date=${this.icdToDate}`;
				const response = await fetch(url, {
				});
				if (!response.ok) {
					window.QLPKUserFeedback?.show('error', 'Không thể xuất danh sách ICD. Vui lòng thử lại.');
					return;
				}
				const blob = await response.blob();
				const a = document.createElement('a');
				a.href = URL.createObjectURL(blob);
				const cd = response.headers.get('Content-Disposition') || '';
				const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
				a.download = match ? match[1].replace(/['"]/g, '') : 'icd.xlsx';
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(a.href);
			} catch (e) {
				console.error('Export ICD error:', e);
				window.QLPKUserFeedback?.show('error', 'Không thể xuất danh sách ICD. Vui lòng thử lại.');
			} finally {
				if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-file-earmark-excel"></i> Excel'; }
			}
		},

		async exportReferralSourceExcel() {
			const btn = document.getElementById('btnExportReferralSource');
			if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Đang xuất...'; }
			try {
				const url = `/api/dashboard/export-referral-source-excel?from_date=${this.referralSourceFromDate}&to_date=${this.referralSourceToDate}`;
				const response = await fetch(url, {
				});
				if (!response.ok) {
					window.QLPKUserFeedback?.show('error', 'Không thể xuất nguồn giới thiệu. Vui lòng thử lại.');
					return;
				}
				const blob = await response.blob();
				const a = document.createElement('a');
				a.href = URL.createObjectURL(blob);
				const cd = response.headers.get('Content-Disposition') || '';
				const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
				a.download = match ? match[1].replace(/['"]/g, '') : 'nguon_gioi_thieu.xlsx';
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(a.href);
			} catch (e) {
				console.error('Export referral source error:', e);
				window.QLPKUserFeedback?.show('error', 'Không thể xuất nguồn giới thiệu. Vui lòng thử lại.');
			} finally {
				if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-file-earmark-excel"></i> Excel'; }
			}
		},

		// ==================== STAFF ONLINE ====================
		async loadStaffOnline() {
			try {
				const response = await fetch('/api/dashboard/staff-online', {
				});
				if (response.ok) {
					const data = await response.json();
					this.renderStaffOnline(data);
				}
			} catch (e) {
				console.error('Error loading staff online:', e);
			}
		},

		renderStaffOnline(data) {
			const container = document.getElementById('staffOnlineList');
			const badge = document.getElementById('onlineCount');
			if (!container) return;

			const items = (data.items || []).sort((a, b) => {
				if (a.is_online !== b.is_online) return b.is_online - a.is_online;
				return (a.full_name || '').localeCompare(b.full_name || '');
			});
			const onlineCount = data.online_count || 0;

			if (badge) {
				badge.textContent = `${onlineCount} online`;
				badge.className = `online-badge ${onlineCount > 0 ? 'has-online' : ''}`;
			}

			if (items.length === 0) {
				container.innerHTML = '<div class="empty-state"><i class="bi bi-people"></i>Chưa có nhân viên</div>';
				return;
			}

			container.innerHTML = items.map(s => {
				const dotClass = s.is_online ? 'online' : 'offline';
				let statusText = 'Đang hoạt động';
			if (!s.is_online) statusText = s.last_login ? this.timeAgo(s.last_login) : 'Chưa đăng nhập';
				const initials = (s.full_name || '').split(' ').map(w => w[0]).slice(-2).join('').toUpperCase();
				const avatarHtml = s.avatar
					? `<img class="staff-avatar staff-avatar-img" src="${s.avatar}" alt="${s.full_name}">`
					: `<div class="staff-avatar">${initials}</div>`;
				return `
					<div class="staff-item">
						${avatarHtml}
						<div class="staff-info">
							<div class="staff-name">${s.full_name}</div>
							<div class="staff-role">${s.role_label}</div>
						</div>
						<div class="staff-status">
							<span class="status-dot ${dotClass}"></span>
							<span class="status-text ${dotClass}">${statusText}</span>
						</div>
					</div>
				`;
			}).join('');
		},

		timeAgo(isoString) {
			const now = new Date();
			const past = new Date(isoString);
			const diffMs = now - past;
			const mins = Math.floor(diffMs / 60000);
			if (mins < 60) return `${mins} phút trước`;
			const hours = Math.floor(mins / 60);
			if (hours < 24) return `${hours} giờ trước`;
			const days = Math.floor(hours / 24);
			return `${days} ngày trước`;
		},

		escapeHtml(value) {
			return String(value ?? '')
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		}
	};
	for (const name of Object.keys(methods)) {
		Object.defineProperty(DashboardManager.prototype, name, { value: methods[name], writable: true, configurable: true, enumerable: false });
	}
})(window);
