// API Layer for ElasticGuard AI Dashboard
// Currently uses mock data, can be connected to real backend

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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API_BASE = `${BACKEND_URL}/api`;

// Simulate network delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Flag to use mock data (set to false when backend is ready)
const USE_MOCK = true;

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
  
  const response = await fetch(`${API_BASE}/overview`);
  return response.json();
};

export const fetchStream = async () => {
  if (USE_MOCK) {
    await delay(200);
    return {
      events: generateLiveEvents(20),
      metrics: generateRealtimeMetrics(),
    };
  }
  
  const response = await fetch(`${API_BASE}/stream`);
  return response.json();
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
  const response = await fetch(`${API_BASE}/logs?${params}`);
  return response.json();
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
  const response = await fetch(`${API_BASE}/alerts?${params}`);
  return response.json();
};

export const fetchIncidents = async () => {
  if (USE_MOCK) {
    await delay(350);
    return {
      incidents: generateIncidents(8),
    };
  }
  
  const response = await fetch(`${API_BASE}/incidents`);
  return response.json();
};

export const fetchHosts = async () => {
  if (USE_MOCK) {
    await delay(300);
    return {
      hosts: generateHosts(20),
    };
  }
  
  const response = await fetch(`${API_BASE}/hosts`);
  return response.json();
};

export const fetchModel = async () => {
  if (USE_MOCK) {
    await delay(400);
    return generateModelMetrics();
  }
  
  const response = await fetch(`${API_BASE}/model`);
  return response.json();
};

export const fetchPredictions = async () => {
  if (USE_MOCK) {
    await delay(350);
    return generatePredictions();
  }
  
  const response = await fetch(`${API_BASE}/predictions`);
  return response.json();
};

export const fetchPipeline = async () => {
  if (USE_MOCK) {
    await delay(250);
    return generatePipelineHealth();
  }
  
  const response = await fetch(`${API_BASE}/pipeline`);
  return response.json();
};

// Action functions
export const acknowledgeAlert = async (alertId) => {
  if (USE_MOCK) {
    await delay(200);
    return { success: true, alertId };
  }
  
  const response = await fetch(`${API_BASE}/alerts/${alertId}/acknowledge`, {
    method: 'POST',
  });
  return response.json();
};

export const isolateHost = async (hostId) => {
  if (USE_MOCK) {
    await delay(500);
    return { success: true, hostId };
  }
  
  const response = await fetch(`${API_BASE}/hosts/${hostId}/isolate`, {
    method: 'POST',
  });
  return response.json();
};

export const blockIP = async (ip) => {
  if (USE_MOCK) {
    await delay(300);
    return { success: true, ip };
  }
  
  const response = await fetch(`${API_BASE}/firewall/block`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip }),
  });
  return response.json();
};

export const createTicket = async (alertId, data) => {
  if (USE_MOCK) {
    await delay(400);
    return { success: true, ticketId: `TKT-${Date.now()}` };
  }
  
  const response = await fetch(`${API_BASE}/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alertId, ...data }),
  });
  return response.json();
};

export const exportReport = async (type, filters) => {
  if (USE_MOCK) {
    await delay(1000);
    // Simulate file download
    return { success: true, downloadUrl: '#' };
  }
  
  const response = await fetch(`${API_BASE}/reports/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, filters }),
  });
  return response.json();
};
