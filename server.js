const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3001;
const app = express();

app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const latency = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} | ${res.statusCode} | ${latency}ms`);
  });
  next();
});

app.get('/file/:size', (req, res) => {
  const { size } = req.params;
  const fileMap = {
    '1kb': '1kb.bin',
    '100kb': '100kb.bin',
    '1mb': '1mb.bin',
    '10mb': '10mb.bin'
  };
  const filename = fileMap[size];

  if (!filename) {
    return res.status(400).json({
      error: 'Invalid size',
      available: Object.keys(fileMap)
    });
  }

  const filePath = path.join(__dirname, 'test-files', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filePath, filename);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    port: PORT,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.get('/stats', (req, res) => {
  res.json({
    hostname: os.hostname(),
    port: PORT,
    cpuCount: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem()
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Test endpoints:`);
  console.log(`  GET /file/1kb   - download 1KB file`);
  console.log(`  GET /file/100kb - download 100KB file`);
  console.log(`  GET /file/1mb   - download 1MB file`);
  console.log(`  GET /file/10mb  - download 10MB file`);
  console.log(`  GET /health     - health check`);
  console.log(`  GET /stats      - server stats`);
});

module.exports = app;
