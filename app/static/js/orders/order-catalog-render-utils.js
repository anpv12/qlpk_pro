(function () {
	'use strict';

	function defaultEscapeHtml(value = '') {
		return value
			.toString()
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function countDescendantOrders(nodes = []) {
		return nodes.reduce((total, child) => {
			const childrenCount = child.children ? countDescendantOrders(child.children) : 0;
			return total + 1 + childrenCount;
		}, 0);
	}

	function renderOrderNode(node, options = {}) {
		const depth = options.depth || 0;
		const expandedNodes = options.expandedNodes || new Set();
		const escapeHtml = options.escapeHtml || defaultEscapeHtml;
		const isExpanded = expandedNodes.has(node.id);
		const hasChildren = Array.isArray(node.children) && node.children.length > 0;
		const badgeClass = node.is_in_house ? 'badge bg-primary-subtle text-primary' : 'badge bg-secondary-subtle text-muted';
		const badgeLabel = node.is_in_house ? 'Trong cơ sở' : 'Ngoài cơ sở';
		const performer = node.performer ? `<small class="text-muted">${escapeHtml(node.performer)}</small>` : '';
		const descendantCount = hasChildren ? countDescendantOrders(node.children) : 0;

		const toggleMarkup = hasChildren
			? `<button type="button" class="order-tree-toggle" data-order-toggle="${node.id}" aria-label="Mở rộng">
                <i class="bi ${isExpanded ? 'bi-chevron-down' : 'bi-chevron-right'}"></i>
            </button>`
			: '<span class="order-tree-placeholder"></span>';

		return `
	        <div class="order-tree-node" data-order-id="${node.id}">
	            <div class="order-tree-row" data-order-row="${node.id}">
	                ${toggleMarkup}
	                <button type="button" class="order-tree-order flex-grow-1 text-start" data-order-item="${node.id}">
                    <div class="d-flex justify-content-between align-items-center">
                        <span>${escapeHtml(node.name || '')}</span>
                        <span class="${badgeClass}">${badgeLabel}</span>
                    </div>
                    ${performer}
                </button>
                ${descendantCount ? `<span class="badge bg-light text-muted border ms-2">${descendantCount}</span>` : ''}
            </div>
            ${isExpanded && hasChildren ? `
                <div class="order-tree-children">
                    ${node.children.map(child => renderOrderNode(child, { ...options, depth: depth + 1 })).join('')}
                </div>
            ` : ''}
        </div>
    `;
	}

	function getSurveyTemplatePricingText(template, options = {}) {
		if (template.pricing_type === 'time_based') {
			const formatPricing = typeof options.formatPricing === 'function'
				? options.formatPricing
				: value => String(value || 0);
			return `${formatPricing(template.price_per_minute || 0)}/phút`;
		}
		return template.service_name || 'Chưa liên kết dịch vụ';
	}

	function renderSurveyTemplateNode(template, options = {}) {
		const escapeHtml = options.escapeHtml || defaultEscapeHtml;
		const variant = options.variant || 'doctor';
		const questionCount = template.question_count || 0;

		if (variant === 'psychologist') {
			const pricingInfo = getSurveyTemplatePricingText(template, options);
			return `
	        <div class="survey-template-node" data-survey-template-id="${template.id}">
	            <button type="button" class="survey-template-item survey-template-item--psychologist w-100 text-start" 
	                    data-survey-template-item="${template.id}">
	                <div class="d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center gap-2">
                        <i class="bi bi-file-earmark-text text-primary"></i>
                        <span class="fw-medium">${escapeHtml(template.name || '')}</span>
                    </div>
                    <span class="badge bg-primary-subtle text-primary">${questionCount} câu hỏi</span>
                </div>
                ${template.description ? `<small class="text-muted d-block mt-1">${escapeHtml(template.description)}</small>` : ''}
                <small class="text-muted d-flex align-items-center gap-1 mt-1">
                    <i class="bi bi-currency-dollar"></i>
                    ${pricingInfo}
                </small>
            </button>
        </div>
    `;
		}

		return `
			<div class="order-tree-row survey-template-node survey-template-row" data-survey-template-item="${template.id}">
				<button type="button" class="order-tree-order flex-grow-1 text-start border-0 bg-transparent p-0 w-100"
					    data-survey-template-item="${template.id}">
					<div class="d-flex justify-content-between align-items-center">
						<span class="d-flex align-items-center gap-2">
							<i class="bi bi-clipboard-pulse survey-template-icon"></i>
							<span class="survey-template-name">${escapeHtml(template.name || '')}</span>
						</span>
						<span class="badge survey-template-count">${questionCount} câu</span>
					</div>
					${template.description ? `<div class="survey-template-description">${escapeHtml(template.description)}</div>` : ''}
				</button>
			</div>
		`;
	}

	function buildOrderCatalogTreeHtml(options = {}) {
		const surveyTemplates = Array.isArray(options.surveyTemplates) ? options.surveyTemplates : [];
		const treeRoots = Array.isArray(options.treeRoots) ? options.treeRoots : [];
		const renderSurvey = typeof options.renderSurveyTemplateNode === 'function'
			? options.renderSurveyTemplateNode
			: template => renderSurveyTemplateNode(template, options.surveyTemplateOptions || {});
		const renderOrder = typeof options.renderOrderNode === 'function'
			? options.renderOrderNode
			: node => renderOrderNode(node, options.orderNodeOptions || {});
		const hasSurveys = surveyTemplates.length > 0;
		const hasOrders = treeRoots.length > 0;

		let html = '';
		if (hasSurveys) {
				html += `
	            <div class="survey-templates-section mb-3">
	                <div class="survey-section-header d-flex align-items-center gap-2 mb-2 px-2 py-1">
	                    <i class="bi bi-clipboard-pulse text-white"></i>
	                    <span class="fw-semibold text-white">Khảo sát Tâm lý</span>
                    <span class="badge bg-white text-primary ms-auto">${surveyTemplates.length}</span>
                </div>
                <div class="survey-templates-list">
                    ${surveyTemplates.map(template => renderSurvey(template)).join('')}
                </div>
            </div>
        `;
		}

		if (hasOrders) {
				if (hasSurveys && options.showOrderItemsHeaderWhenSurveys) {
					html += `
	                <div class="order-items-section-header d-flex align-items-center gap-2 mb-2 px-2 py-1">
	                    <i class="bi bi-list-check text-secondary"></i>
                    <span class="fw-semibold text-secondary">Chỉ định khác</span>
                </div>
            `;
			}
			html += treeRoots.map(node => renderOrder(node, 0)).join('');
		}

		return html;
	}

	function renderOrderCatalogTreeSection(options = {}) {
		const container = options.container;
		if (!container) return { rendered: false, empty: false };

		const loadingElement = options.loadingElement;
		const emptyElement = options.emptyElement;
		const surveyTemplates = Array.isArray(options.surveyTemplates) ? options.surveyTemplates : [];
		const treeRoots = Array.isArray(options.treeRoots) ? options.treeRoots : [];
		const hasSurveys = surveyTemplates.length > 0;
		const hasOrders = treeRoots.length > 0;

		if (loadingElement) loadingElement.classList.add('d-none');

		if (!hasSurveys && !hasOrders) {
			container.innerHTML = '';
			if (emptyElement) emptyElement.classList.remove('d-none');
			return { rendered: true, empty: true };
		}

		if (typeof options.ensureDefaultExpansion === 'function') {
			options.ensureDefaultExpansion();
		}
		if (emptyElement) emptyElement.classList.add('d-none');

		container.innerHTML = buildOrderCatalogTreeHtml({
			surveyTemplates,
			treeRoots,
			renderSurveyTemplateNode: options.renderSurveyTemplateNode,
			renderOrderNode: options.renderOrderNode,
			surveyTemplateOptions: options.surveyTemplateOptions,
			orderNodeOptions: options.orderNodeOptions,
			showOrderItemsHeaderWhenSurveys: options.showOrderItemsHeaderWhenSurveys
		});

		return { rendered: true, empty: false };
	}

	function getOrderCatalogTreeElements(documentRef) {
		if (!documentRef) {
			return { container: null, loadingElement: null, emptyElement: null };
		}
		return {
			container: documentRef.getElementById('orderCategoryTree'),
			loadingElement: documentRef.getElementById('orderCategoryTreeLoading'),
			emptyElement: documentRef.getElementById('orderCategoryTreeEmpty')
		};
	}

	function showOrderCatalogTreeLoading(elements = {}) {
		if (elements.loadingElement) elements.loadingElement.classList.remove('d-none');
		if (elements.emptyElement) elements.emptyElement.classList.add('d-none');
		if (elements.container) elements.container.innerHTML = '';
	}

	function hideOrderCatalogTreeLoading(elements = {}) {
		if (elements.loadingElement) elements.loadingElement.classList.add('d-none');
	}

	function renderOrderCatalogTreeError(elements = {}, message = 'Không thể tải danh mục. Vui lòng thử lại.') {
		if (elements.container) {
			elements.container.innerHTML = `<div class="text-danger small">${message}</div>`;
		}
	}

	function bindOrderCatalogTreeEvents(treeElement, options = {}) {
		if (!treeElement) return null;

		const clickHandler = (event) => {
			const surveyTarget = event.target.closest('[data-survey-template-item]');
			if (surveyTarget) {
				if (typeof options.onSurveyTemplateSelect === 'function') {
					options.onSurveyTemplateSelect(Number(surveyTarget.getAttribute('data-survey-template-item')), surveyTarget, event);
				}
				return;
			}

			const toggleTarget = event.target.closest('[data-order-toggle]');
			if (toggleTarget) {
				if (typeof options.onCategoryToggle === 'function') {
					options.onCategoryToggle(Number(toggleTarget.getAttribute('data-order-toggle')), toggleTarget, event);
				}
				return;
			}

			const rowTarget = event.target.closest('[data-order-row]');
			if (rowTarget && !event.target.closest('[data-order-item]')) {
				if (typeof options.onCategoryToggle === 'function') {
					options.onCategoryToggle(Number(rowTarget.getAttribute('data-order-row')), rowTarget, event);
				}
				return;
			}

			const orderTarget = event.target.closest('[data-order-item]');
			if (orderTarget && typeof options.onOrderSelect === 'function') {
				options.onOrderSelect(Number(orderTarget.getAttribute('data-order-item')), orderTarget, event);
			}
		};

		treeElement.addEventListener('click', clickHandler);

		return function cleanupOrderCatalogTreeEvents() {
			treeElement.removeEventListener('click', clickHandler);
		};
	}

	function createOrderCatalogRenderAdapter(options = {}) {
		const doc = options.document || document;
		const getState = typeof options.getState === 'function' ? options.getState : () => options.state || {};
		const getElements = () => ({
			container: doc.getElementById(options.containerId || 'orderCategoryTree'),
			loadingElement: doc.getElementById(options.loadingId || 'orderCategoryTreeLoading'),
			emptyElement: doc.getElementById(options.emptyId || 'orderCategoryTreeEmpty')
		});

		const renderSurvey = (template) => renderSurveyTemplateNode(template, {
			escapeHtml: options.escapeHtml,
			formatPricing: options.formatPricing,
			variant: options.variant
		});

		const renderOrder = (node, depth = 0) => {
			const state = getState() || {};
			return renderOrderNode(node, {
				depth,
				expandedNodes: state.expandedNodes,
				escapeHtml: options.escapeHtml
			});
		};

		return {
			renderOrderCategoryTree() {
				const state = getState() || {};
				const elements = getElements();
				return renderOrderCatalogTreeSection({
					container: elements.container,
					loadingElement: elements.loadingElement,
					emptyElement: elements.emptyElement,
					surveyTemplates: state.surveyTemplates,
					treeRoots: state.treeRoots,
					ensureDefaultExpansion: options.ensureDefaultExpansion,
					renderSurveyTemplateNode: renderSurvey,
					renderOrderNode: renderOrder,
					showOrderItemsHeaderWhenSurveys: !!options.showOrderItemsHeaderWhenSurveys
				});
			},
			renderSurveyTemplateNode: renderSurvey,
			renderOrderNode: renderOrder,
			countDescendantOrders
		};
	}

	const api = {
		countDescendantOrders,
		buildOrderCatalogTreeHtml,
		renderOrderCatalogTreeSection,
		getOrderCatalogTreeElements,
		showOrderCatalogTreeLoading,
		hideOrderCatalogTreeLoading,
		renderOrderCatalogTreeError,
		renderOrderNode,
		renderSurveyTemplateNode,
		bindOrderCatalogTreeEvents,
		createOrderCatalogRenderAdapter
	};

	window.ClinicalOrderCatalogRenderUtils = api;
	window.DoctorExaminationOrderCatalogRenderUtils = api;
	window.PsychologistExaminationOrderCatalogRenderUtils = api;
})();
