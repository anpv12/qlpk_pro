const getComponent = () => {
  const component = window.QLPKDoctorModuleRegistry.get('medicalHistoryForm')?.getActive?.();
  if (!component) throw new Error('Thiếu medical history form component');
  return component;
};

const getPageRuntime = () => {
  const pageRuntime = getComponent().config.pageRuntime;
  if (!pageRuntime || typeof pageRuntime.getAuthHeader !== 'function') {
    throw new Error('Thiếu page runtime cho medical history');
  }
  return pageRuntime;
};

const getAuthHeader = () => getPageRuntime().getAuthHeader() || '';

const getSelectedICDs = () => {
  const historyIcd = getComponent().getFeature('icd');
  return historyIcd && typeof historyIcd.getSelectedICDs === 'function'
    ? historyIcd.getSelectedICDs()
    : {};
};

const getIcdLookup = () => getComponent().state.icdLookup || Object.create(null);

const debugLog = (...args) => {
  if (window.QLPK_DEBUG_MEDICAL_HISTORY && window.console && typeof window.console.info === 'function') {
    window.console.info(...args);
  }
};

const getJsonAuthHeaders = () => {
  const authHeader = getAuthHeader();
  return {
    ...(authHeader ? { Authorization: authHeader } : {}),
    'Content-Type': 'application/json'
  };
};

const callAction = (name, ...args) => {
  const action = getComponent().getAction(name);
  return typeof action === 'function' ? action(...args) : undefined;
};

const getSupportRuntime = () => window.QLPKDoctorModuleRegistry.require('supportRuntime');
const escapeHtml = value => getSupportRuntime().escapeHtml(value);
const escapeAttr = value => getSupportRuntime().escapeAttr(value);

const setVisible = (element, visible, displayValue = '') => {
  if (!element) return;
  element.classList.toggle('medical-history-hidden', !visible);
  element.style.display = visible ? displayValue : 'none';
};

export {
  callAction,
  debugLog,
  escapeAttr,
  escapeHtml,
  getAuthHeader,
  getComponent,
  getIcdLookup,
  getJsonAuthHeaders,
  getPageRuntime,
  getSelectedICDs,
  setVisible
};
