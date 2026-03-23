// API layer for NetSentinel AI.
// Mock mode stays available for UI-only work on low-resource machines.

import {
  generateOverviewKPIs,
  generateTrafficData,
  generateRiskyHosts,
  generateAttackingIPs,
  generateAnomalyScore,
  generateLiveEvents,
  generateRealtimeMetrics,
  generateAlerts,
  generateIncidents,
  generateHosts,
  generateModelMetrics,
  generatePredictions,
  generatePipelineHealth,
  generateLogs,
} from './mockData';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API_BASE = `${BACKEND_URL}/api`;
const SCOPE_STORAGE_KEY = 'netsentinel-scope';

// Simulate network delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const USE_MOCK = process.env.REACT_APP_USE_MOCK === 'true';

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

const fetchJson = async (path, options) => {
  const scopedPath = appendScopeParams(path);
  const response = await fetch(`${API_BASE}${scopedPath}`, options);
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  return response.json();
};

// API Functions
export const fetchOverview = async () => {
  if (USE_MOCK) {
    await delay(300);
    return {
      kpis: generateOverviewKPIs(),
      trafficData: generateTrafficData(24),
      riskyHosts: generateRiskyHosts(5),
      attackingIPs: generateAttackingIPs(5),
      anomalyScore: generateAnomalyScore(),
    };
  }
  
  return fetchJson('/overview');
};

export const fetchStream = async () => {
  if (USE_MOCK) {
    await delay(200);
    return {
      events: generateLiveEvents(20),
      metrics: generateRealtimeMetrics(),
    };
  }
  
  return fetchJson('/stream');
};

export const fetchLogs = async (filters = {}) => {
  if (USE_MOCK) {
    await delay(400);
    return {
      logs: generateLogs(50),
      total: 1247,
      page: 1,
      pageSize: 50,
    };
  }
  
  const params = new URLSearchParams(filters);
  return fetchJson(`/logs?${params}`);
};

export const fetchAlerts = async (filters = {}) => {
  if (USE_MOCK) {
    await delay(300);
    return {
      alerts: generateAlerts(15),
      total: 156,
    };
  }
  
  const params = new URLSearchParams(filters);
  return fetchJson(`/alerts?${params}`);
};

export const fetchIncidents = async () => {
  if (USE_MOCK) {
    await delay(350);
    return {
      incidents: generateIncidents(8),
    };
  }
  
  return fetchJson('/incidents');
};

export const fetchHosts = async () => {
  if (USE_MOCK) {
    await delay(300);
    return {
      hosts: generateHosts(20),
    };
  }
  
  return fetchJson('/hosts');
};

export const fetchModel = async () => {
  if (USE_MOCK) {
    await delay(400);
    return generateModelMetrics();
  }
  
  return fetchJson('/model');
};

export const fetchPredictions = async () => {
  if (USE_MOCK) {
    await delay(350);
    return generatePredictions();
  }
  
  return fetchJson('/predictions');
};

export const fetchPipeline = async () => {
  if (USE_MOCK) {
    await delay(250);
    return generatePipelineHealth();
  }
  
  return fetchJson('/pipeline');
};

export const fetchScopeOptions = async () => {
  if (USE_MOCK) {
    await delay(200);
    return { profiles: [], assets: [], assignments: [] };
  }
  const response = await fetch(`${API_BASE}/scope/options`);
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  return response.json();
};

// Action functions
export const acknowledgeAlert = async (alertId) => {
  if (USE_MOCK) {
    await delay(200);
    return { success: true, alertId };
  }
  
  return fetchJson(`/alerts/${alertId}/acknowledge`, {
    method: 'POST',
  });
};

export const isolateHost = async (hostId) => {
  if (USE_MOCK) {
    await delay(500);
    return { success: true, hostId };
  }
  
  return fetchJson(`/hosts/${hostId}/isolate`, {
    method: 'POST',
  });
};

export const blockIP = async (ip) => {
  if (USE_MOCK) {
    await delay(300);
    return { success: true, ip };
  }
  
  return fetchJson('/firewall/block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip }),
  });
};

export const createTicket = async (alertId, data) => {
  if (USE_MOCK) {
    await delay(400);
    return { success: true, ticketId: `TKT-${Date.now()}` };
  }
  
  return fetchJson('/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alertId, ...data }),
  });
};

export const exportReport = async (type, filters) => {
  if (USE_MOCK) {
    await delay(1000);
    // Simulate file download
    return { success: true, downloadUrl: '#' };
  }
  
  return fetchJson('/reports/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, filters }),
  });
};
