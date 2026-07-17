const path = require('path');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const buildDir = path.join(__dirname, 'build');
const backendTarget = 'http://127.0.0.1:8010';
const backendProxy = createProxyMiddleware({
  target: backendTarget,
  changeOrigin: true,
});
const sendIndex = (res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(buildDir, 'index.html'));
};

app.get('/setup', (_req, res) => {
  sendIndex(res);
});

app.use((req, res, next) => {
  const originalUrl = req.originalUrl || req.url;

  if (
    originalUrl === '/health' ||
    originalUrl === '/docs' ||
    originalUrl === '/openapi.json' ||
    originalUrl === '/api' ||
    originalUrl.startsWith('/api/')
  ) {
    req.url = originalUrl;
    return backendProxy(req, res, next);
  }

  if (
    originalUrl === '/setup/status' ||
    originalUrl.startsWith('/setup/status?') ||
    originalUrl === '/setup/test-connection' ||
    originalUrl.startsWith('/setup/test-connection?') ||
    originalUrl === '/setup/current-config' ||
    originalUrl.startsWith('/setup/current-config?') ||
    originalUrl === '/setup/complete' ||
    originalUrl.startsWith('/setup/complete?') ||
    originalUrl === '/setup/reset' ||
    originalUrl.startsWith('/setup/reset?')
  ) {
    req.url = `/api${originalUrl}`;
    return backendProxy(req, res, next);
  }

  if (
    originalUrl === '/scope/options' ||
    originalUrl.startsWith('/scope/options?')
  ) {
    req.url = `/api${originalUrl}`;
    return backendProxy(req, res, next);
  }

  return next();
});

app.use('/static', express.static(path.join(buildDir, 'static'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store');
  },
}));

app.use(express.static(buildDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

app.get('*', (_req, res) => {
  sendIndex(res);
});

app.listen(port, host, () => {
  console.log(`NetSentinel frontend listening on http://${host}:${port}`);
});
