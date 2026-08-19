(function () {
	function createPrescriptionPreviewScaler(options) {
		const area = options?.area;
		const preview = options?.preview;
		const documentWidth = options?.documentWidth || 800;

		const fit = function () {
			if (!area || !preview) return;
			const availableWidth = area.getBoundingClientRect().width || documentWidth;
			const scale = Math.min(1, Math.max(0.1, availableWidth / documentWidth));
			area.style.setProperty('--verify-document-scale', scale.toFixed(4));
			area.classList.toggle('verify-document-scaled', scale < 1);
			area.style.height = scale < 1 ? `${Math.ceil(preview.scrollHeight * scale)}px` : '';
		};

		return { fit };
	}

	window.createPrescriptionPreviewScaler = createPrescriptionPreviewScaler;
})();
