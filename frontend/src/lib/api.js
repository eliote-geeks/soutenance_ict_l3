// API layer for NetSentinel AI. All data comes from the backend.

const SCOPE_STORAGE_KEY = 'netsentinel-scope';
const ADMIN_SECRET_KEY = 'netsentinel-admin-secret';

export const getBackendBaseUrl = () => {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:3000';
  }
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return process.env.REACT_APP_BACKEND_URL || 'http://localhost:8010';
  }
  return window.location.origin;
};

export const getApiBaseUrl = () => `${getBackendBaseUrl()}/api`;

const getStoredScope = () => {
  if (typeof window === 'undefined') {
    return { mode: 'all', profileId: '', assetId: '' };
  }
  try {
    return JSON.parse(window.localStorage.getItem(SCOPE_STORAGE_KEY) || '{"mode":"all","profileId":"","assetId":""}');
  } catch (error) {
    return { mode: 'all', profileId: '', assetId: '' };
  }
};

const getStoredAdminSecret = () => {
  try {
    return sessionStorage.getItem(ADMIN_SECRET_KEY) || '';
  } catch {
    return '';
  }
};

const appendScopeParams = (path) => {
  const scope = getStoredScope();
  const url = new URL(path, 'http://netsentinel.local');
  if (scope.mode === 'profile' && scope.profileId) {
    url.searchParams.set('profile_id', scope.profileId);
  }
  if (scope.mode === 'asset' && scope.assetId) {
    url.searchParams.set('asset_id', scope.assetId);
  }
  return `${url.pathname}${url.search}`;
};

const readErrorDetail = async (response) => {
  let detail = response.status === 503
    ? 'Service indisponible: le backend exige Elasticsearch pour cette fonction.'
    : `API request failed with status ${response.status}`;
  try {
    const payload = await response.json();
    detail = payload.detail || payload.message || detail;
  } catch (error) {
    // keep default detail
  }
  const error = new Error(detail);
  error.status = response.status;
  return error;
};

const fetchJson = async (path, options) => {
  const apiBase = getApiBaseUrl();
  const scopedPath = appendScopeParams(path);
  const response = await fetch(`${apiBase}${scopedPath}`, options);
  if (!response.ok) {
    throw await readErrorDetail(response);
  }
  return response.json();
};

const fetchAdminJson = async (path, options = {}) => {
  const apiBase = getApiBaseUrl();
  const secret = getStoredAdminSecret();
  const headers = {
    ...(options.headers || {}),
    ...(secret ? { 'X-Admin-Secret': secret } : {}),
  };
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    throw await readErrorDetail(response);
  }
  return response.json();
};

export const authenticateAdminSession = async (secret) => {
  const apiBase = getApiBaseUrl();
  const response = await fetch(`${apiBase}/admin/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': secret },
  });
  if (!response.ok) {
    throw await readErrorDetail(response);
  }
  try {
    sessionStorage.setItem(ADMIN_SECRET_KEY, secret);
  } catch {
    // ignore storage failures
  }
  return response.json();
};

export const fetchOverview = async () => fetchJson('/overview');

export const fetchStream = async () => fetchJson('/stream');

export const fetchLogs = async (filters = {}) => {
  const params = new URLSearchParams(filters);
  return fetchJson(`/logs?${params}`);
};

export const fetchAlerts = async (filters = {}) => {
  const params = new URLSearchParams(filters);
  return fetchJson(`/alerts?${params}`);
};

export const fetchIncidents = async () => fetchJson('/incidents');

export const fetchHosts = async () => fetchJson('/hosts');

export const fetchModel = async () => fetchJson('/model');

export const fetchPredictions = async () => fetchJson('/predictions');

export const fetchPipeline = async () => fetchJson('/pipeline');

export const fetchScopeOptions = async () => fetchJson('/scope/options');

export const fetchAssets = async () => fetchJson('/assets');

export const createAsset = async (payload) => fetchJson('/assets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const fetchAgentInstances = async () => fetchAdminJson('/agent/instances');

export const fetchEnrollmentTokens = async () => fetchAdminJson('/agent/enrollment-tokens');

export const createEnrollmentToken = async (payload) => fetchAdminJson('/agent/enrollment-tokens', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const revokeEnrollmentToken = async (tokenId) => fetchAdminJson(`/agent/enrollment-tokens/${tokenId}/revoke`, {
  method: 'POST',
});

export const approveAgentInstance = async (instanceId) => fetchAdminJson(`/agent/instances/${instanceId}/approve`, {
  method: 'POST',
});

export const rejectAgentInstance = async (instanceId, reason = '') => fetchAdminJson(`/agent/instances/${instanceId}/reject`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ reason }),
});

export const disableAgentInstance = async (instanceId, reason = '') => fetchAdminJson(`/agent/instances/${instanceId}/disable`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ reason }),
});

export const acknowledgeAlert = async (alertId) => fetchJson(`/alerts/${alertId}/acknowledge`, {
  method: 'POST',
});

export const isolateHost = async (hostId) => fetchJson(`/hosts/${hostId}/isolate`, {
  method: 'POST',
});

export const blockIP = async (ip) => fetchJson('/firewall/block', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ip }),
});

export const createTicket = async (alertId, data) => fetchJson('/tickets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ alertId, ...data }),
});

export const exportReport = async (type, filters) => fetchJson('/reports/export', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type, filters }),
});
