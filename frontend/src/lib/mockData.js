// Mock data generator for NetSentinel AI.
// Simulates realistic telemetry from Filebeat, Packetbeat and fail2ban.

const randomIP = () => {
  const octets = [
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256)
  ];
  return octets.join('.');
};

const randomInternalIP = () => {
  const prefixes = ['192.168.1.', '10.0.0.', '172.16.0.'];
  return prefixes[Math.floor(Math.random() * prefixes.length)] + Math.floor(Math.random() * 255);
};

const randomHostname = () => {
  const prefixes = ['srv', 'web', 'db', 'app', 'mail', 'fw', 'proxy', 'dns', 'ldap', 'vpn'];
  const suffixes = ['prod', 'dev', 'staging', 'test', 'backup'];
  return `${prefixes[Math.floor(Math.random() * prefixes.length)]}-${suffixes[Math.floor(Math.random() * suffixes.length)]}-${Math.floor(Math.random() * 99).toString().padStart(2, '0')}`;
};

const randomPort = () => {
  const commonPorts = [22, 80, 443, 3306, 5432, 6379, 8080, 8443, 27017, 3389];
  return commonPorts[Math.floor(Math.random() * commonPorts.length)];
};

const randomSeverity = () => {
  const severities = ['critical', 'high', 'medium', 'low', 'info'];
  const weights = [0.05, 0.15, 0.30, 0.35, 0.15];
  const random = Math.random();
  let cumulative = 0;
  for (let i = 0; i < severities.length; i++) {
    cumulative += weights[i];
    if (random < cumulative) return severities[i];
  }
  return 'info';
};

const randomStatus = () => {
  const statuses = ['open', 'investigating', 'resolved', 'false_positive'];
  return statuses[Math.floor(Math.random() * statuses.length)];
};

const randomEventType = () => {
  const types = [
    'Authentication Failure',
    'Port Scan Detected',
    'Brute Force Attempt',
    'Suspicious DNS Query',
    'Malware Communication',
    'Data Exfiltration',
    'Privilege Escalation',
    'Lateral Movement',
    'C2 Beacon',
    'Anomalous Traffic',
    'SQL Injection Attempt',
    'XSS Attempt',
    'DDoS Pattern',
    'Unauthorized Access',
    'Configuration Change'
  ];
  return types[Math.floor(Math.random() * types.length)];
};

const randomMitreTactic = () => {
  const tactics = [
    'Initial Access',
    'Execution',
    'Persistence',
    'Privilege Escalation',
    'Defense Evasion',
    'Credential Access',
    'Discovery',
    'Lateral Movement',
    'Collection',
    'Exfiltration',
    'Command and Control'
  ];
  return tactics[Math.floor(Math.random() * tactics.length)];
};

const randomCountry = () => {
  const countries = ['CN', 'RU', 'US', 'DE', 'NL', 'FR', 'GB', 'BR', 'IN', 'KR', 'JP', 'UA', 'RO', 'VN'];
  return countries[Math.floor(Math.random() * countries.length)];
};

const randomUser = () => {
  const users = ['admin', 'root', 'jdoe', 'asmith', 'mwilson', 'service_account', 'backup_user', 'monitoring', 'deploy', 'guest'];
  return users[Math.floor(Math.random() * users.length)];
};

// Generate timestamp within last N hours
const recentTimestamp = (hoursAgo = 24) => {
  const now = new Date();
  const offset = Math.floor(Math.random() * hoursAgo * 60 * 60 * 1000);
  return new Date(now - offset);
};

// Overview KPIs
export const generateOverviewKPIs = () => ({
  totalAlerts: Math.floor(Math.random() * 500) + 1200,
  anomalies: Math.floor(Math.random() * 100) + 50,
  incidentsOpen: Math.floor(Math.random() * 20) + 5,
  meanTimeToDetect: (Math.random() * 10 + 2).toFixed(1),
  alertsTrend: (Math.random() * 20 - 10).toFixed(1),
  anomaliesTrend: (Math.random() * 15 - 5).toFixed(1),
  incidentsTrend: (Math.random() * 10 - 8).toFixed(1),
  mttdTrend: (Math.random() * 5 - 3).toFixed(1),
});

// Traffic data for area chart
export const generateTrafficData = (points = 24) => {
  const data = [];
  const now = new Date();
  for (let i = points - 1; i >= 0; i--) {
    const time = new Date(now - i * 3600000);
    data.push({
      time: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      timestamp: time.toISOString(),
      inbound: Math.floor(Math.random() * 500) + 200,
      outbound: Math.floor(Math.random() * 400) + 150,
      blocked: Math.floor(Math.random() * 50) + 10,
      anomalous: Math.floor(Math.random() * 30) + 5,
    });
  }
  return data;
};

// Top risky hosts
export const generateRiskyHosts = (count = 5) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `host-${i + 1}`,
    hostname: randomHostname(),
    ip: randomInternalIP(),
    riskScore: Math.floor(Math.random() * 40) + 60,
    alertCount: Math.floor(Math.random() * 50) + 10,
    lastSeen: recentTimestamp(2).toISOString(),
    criticality: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)],
  })).sort((a, b) => b.riskScore - a.riskScore);
};

// Top attacking IPs
export const generateAttackingIPs = (count = 5) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `ip-${i + 1}`,
    ip: randomIP(),
    country: randomCountry(),
    attackCount: Math.floor(Math.random() * 200) + 50,
    lastAttack: recentTimestamp(4).toISOString(),
    blocked: Math.random() > 0.3,
    threatLevel: ['critical', 'high', 'medium'][Math.floor(Math.random() * 3)],
  })).sort((a, b) => b.attackCount - a.attackCount);
};

// Anomaly score with trend
export const generateAnomalyScore = () => ({
  current: Math.floor(Math.random() * 30) + 20,
  threshold: 70,
  trend: Array.from({ length: 12 }, () => Math.floor(Math.random() * 40) + 15),
});

// Live events stream
export const generateLiveEvents = (count = 20) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `event-${Date.now()}-${i}`,
    timestamp: recentTimestamp(1).toISOString(),
    type: randomEventType(),
    severity: randomSeverity(),
    sourceIP: randomIP(),
    destIP: randomInternalIP(),
    destPort: randomPort(),
    hostname: randomHostname(),
    user: Math.random() > 0.5 ? randomUser() : null,
    details: `Detected ${randomEventType().toLowerCase()} from external source`,
    mitreTactic: randomMitreTactic(),
    modelVersion: `v${Math.floor(Math.random() * 3) + 1}.${Math.floor(Math.random() * 10)}`,
    confidence: Math.floor(Math.random() * 30) + 70,
  })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

// Realtime metrics
export const generateRealtimeMetrics = () => ({
  eventsPerSecond: Math.floor(Math.random() * 500) + 100,
  bytesPerSecond: Math.floor(Math.random() * 1000000) + 500000,
  failedLogins: Math.floor(Math.random() * 20) + 5,
  activeConnections: Math.floor(Math.random() * 2000) + 500,
  latency: Math.floor(Math.random() * 50) + 10,
  queueDepth: Math.floor(Math.random() * 100) + 20,
});

// Alerts list
export const generateAlerts = (count = 15) => {
  const analysts = ['Sarah Chen', 'Mike Johnson', 'Ana Rodriguez', 'James Wilson', 'Unassigned'];
  return Array.from({ length: count }, (_, i) => ({
    id: `ALT-${String(1000 + i).padStart(6, '0')}`,
    timestamp: recentTimestamp(48).toISOString(),
    title: randomEventType(),
    severity: randomSeverity(),
    status: randomStatus(),
    sourceIP: randomIP(),
    destIP: randomInternalIP(),
    hostname: randomHostname(),
    assignee: analysts[Math.floor(Math.random() * analysts.length)],
    eta: Math.random() > 0.5 ? `${Math.floor(Math.random() * 4) + 1}h` : null,
    mitreTactic: randomMitreTactic(),
    description: `Automated detection of suspicious activity pattern`,
  })).sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
};

// Incidents
export const generateIncidents = (count = 8) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `INC-${String(100 + i).padStart(5, '0')}`,
    title: `${randomEventType()} Campaign`,
    severity: ['critical', 'high', 'medium'][Math.floor(Math.random() * 3)],
    status: ['active', 'investigating', 'contained', 'resolved'][Math.floor(Math.random() * 4)],
    createdAt: recentTimestamp(72).toISOString(),
    updatedAt: recentTimestamp(12).toISOString(),
    alertCount: Math.floor(Math.random() * 20) + 3,
    affectedHosts: Math.floor(Math.random() * 5) + 1,
    assignee: ['Sarah Chen', 'Mike Johnson', 'Ana Rodriguez'][Math.floor(Math.random() * 3)],
    timeline: Array.from({ length: Math.floor(Math.random() * 5) + 2 }, (_, j) => ({
      timestamp: recentTimestamp(48 - j * 8).toISOString(),
      action: ['Alert triggered', 'Investigation started', 'Host isolated', 'Malware identified', 'Remediation in progress'][j % 5],
    })),
    tactics: Array.from({ length: Math.floor(Math.random() * 3) + 1 }, () => randomMitreTactic()),
  }));
};

// Hosts inventory
export const generateHosts = (count = 20) => {
  const os = ['Windows Server 2022', 'Ubuntu 22.04', 'RHEL 9', 'CentOS 8', 'Windows 11'];
  const roles = ['Web Server', 'Database', 'Application', 'DNS', 'Mail', 'Proxy', 'Firewall'];
  return Array.from({ length: count }, (_, i) => ({
    id: `host-${i + 1}`,
    hostname: randomHostname(),
    ip: randomInternalIP(),
    os: os[Math.floor(Math.random() * os.length)],
    role: roles[Math.floor(Math.random() * roles.length)],
    riskScore: Math.floor(Math.random() * 100),
    criticality: ['critical', 'high', 'medium', 'low'][Math.floor(Math.random() * 4)],
    lastSeen: recentTimestamp(Math.random() > 0.9 ? 48 : 1).toISOString(),
    alertCount: Math.floor(Math.random() * 30),
    status: Math.random() > 0.1 ? 'online' : 'offline',
    agent: Math.random() > 0.2 ? 'installed' : 'missing',
  }));
};

// Model metrics
export const generateModelMetrics = () => ({
  versions: [
    { version: 'v3.2', status: 'active', precision: 0.94, recall: 0.89, f1: 0.91, falsePositives: 12, deployedAt: '2024-01-15' },
    { version: 'v3.1', status: 'retired', precision: 0.91, recall: 0.87, f1: 0.89, falsePositives: 18, deployedAt: '2024-01-01' },
    { version: 'v3.0', status: 'retired', precision: 0.88, recall: 0.85, f1: 0.86, falsePositives: 24, deployedAt: '2023-12-15' },
  ],
  featureImportance: [
    { feature: 'bytes_transferred', importance: 0.23 },
    { feature: 'connection_duration', importance: 0.19 },
    { feature: 'port_frequency', importance: 0.17 },
    { feature: 'time_of_day', importance: 0.14 },
    { feature: 'geo_anomaly', importance: 0.12 },
    { feature: 'user_behavior', importance: 0.09 },
    { feature: 'protocol_deviation', importance: 0.06 },
  ],
  confusionMatrix: {
    truePositive: 847,
    falsePositive: 23,
    trueNegative: 12456,
    falseNegative: 34,
  },
});

// Predictions
export const generatePredictions = () => ({
  forecast: Array.from({ length: 24 }, (_, i) => {
    const base = 30 + Math.sin(i / 4) * 15;
    return {
      hour: i,
      predicted: Math.floor(base + Math.random() * 10),
      lower: Math.floor(base - 5),
      upper: Math.floor(base + 15),
    };
  }),
  nextTargets: [
    { hostname: randomHostname(), probability: 0.78, reason: 'Historical attack pattern' },
    { hostname: randomHostname(), probability: 0.65, reason: 'Exposed services' },
    { hostname: randomHostname(), probability: 0.52, reason: 'Similar profile to compromised hosts' },
    { hostname: randomHostname(), probability: 0.41, reason: 'Outdated software detected' },
  ],
  riskTrend: 'increasing',
  confidence: 0.82,
});

// Pipeline health
export const generatePipelineHealth = () => ({
  services: [
    { name: 'Log Collector', status: 'healthy', cpu: Math.floor(Math.random() * 40) + 20, memory: Math.floor(Math.random() * 30) + 40 },
    { name: 'Event Parser', status: 'healthy', cpu: Math.floor(Math.random() * 30) + 15, memory: Math.floor(Math.random() * 25) + 35 },
    { name: 'ML Engine', status: Math.random() > 0.9 ? 'degraded' : 'healthy', cpu: Math.floor(Math.random() * 50) + 30, memory: Math.floor(Math.random() * 40) + 50 },
    { name: 'Alert Manager', status: 'healthy', cpu: Math.floor(Math.random() * 20) + 10, memory: Math.floor(Math.random() * 20) + 30 },
    { name: 'Database', status: 'healthy', cpu: Math.floor(Math.random() * 35) + 25, memory: Math.floor(Math.random() * 35) + 55 },
  ],
  ingestionLag: Math.floor(Math.random() * 500) + 100,
  queueDepth: Math.floor(Math.random() * 1000) + 200,
  droppedEvents: Math.floor(Math.random() * 10),
  throughput: Math.floor(Math.random() * 5000) + 3000,
  uptime: 99.97,
});

// Logs for explorer
export const generateLogs = (count = 50) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `log-${Date.now()}-${i}`,
    timestamp: recentTimestamp(24).toISOString(),
    level: ['DEBUG', 'INFO', 'WARN', 'ERROR'][Math.floor(Math.random() * 4)],
    source: randomHostname(),
    message: `${randomEventType()} - ${randomIP()} -> ${randomInternalIP()}:${randomPort()}`,
    fields: {
      sourceIP: randomIP(),
      destIP: randomInternalIP(),
      destPort: randomPort(),
      user: randomUser(),
      protocol: ['TCP', 'UDP', 'HTTP', 'HTTPS', 'SSH'][Math.floor(Math.random() * 5)],
      bytes: Math.floor(Math.random() * 10000),
    },
  })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};
