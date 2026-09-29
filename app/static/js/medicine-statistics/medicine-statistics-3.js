/* exported debounce, hideLoading */

function hideLoading(containerId) {
	const container = document.getElementById(containerId);
	if (container) {
		container.classList.remove('medicine-stats-loading');
	}
}

function debounce(func, wait) {
	let timeout;
	return function executedFunction(...args) {
		const later = () => {
			clearTimeout(timeout);
			func(...args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
}
