import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const latency1kb = new Trend('latency_1kb');
const latency100kb = new Trend('latency_100kb');
const latency1mb = new Trend('latency_1mb');
const latency10mb = new Trend('latency_10mb');

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3001';

export const options = {
  stages: [
    { duration: '20s', target: 50 },
    { duration: '20s', target: 100 },
    { duration: '20s', target: 50 },
    { duration: '20s', target: 30 },
    { duration: '20s', target: 20 },
    { duration: '20s', target: 10 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<15000'],
  },
};

export default function () {
  // Progressive test: all file sizes, mixed load
  const sizes = ['1kb', '100kb', '1mb', '10mb'];
  const size = sizes[Math.floor(Math.random() * sizes.length)];
  const url = `${BASE_URL}/file/${size}`;

  const res = http.get(url);

  if (size === '1kb') latency1kb.add(res.timings.duration);
  if (size === '100kb') latency100kb.add(res.timings.duration);
  if (size === '1mb') latency1mb.add(res.timings.duration);
  if (size === '10mb') latency10mb.add(res.timings.duration);

  check(res, { 'status 200': (r) => r.status === 200 });

  sleep(0.2);
}

export function handleSummary(data) {
  const rps = data.metrics.http_reqs.values.rate;
  const avgLat = data.metrics.http_req_duration.values.avg;
  const p95 = data.metrics.http_req_duration.values['p(95)'];
  const maxLat = data.metrics.http_req_duration.values.max;

  const concurrency = rps * (avgLat / 1000);

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║         LITTLE\'S LAW VERIFICATION (Single Node)         ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  Formula:  L = λ × W                                   ║');
  console.log('║  L = Concurrency  λ = Throughput  W = Latency          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log('┌────────────────────────────────────────────────────────┐');
  console.log('│                    ACTUAL METRICS                       │');
  console.log('├────────────────────────────────────────────────────────┤');
  console.log(`│  Throughput (λ):   ${rps.toFixed(2).padStart(10)} req/s              │`);
  console.log(`│  Avg Latency (W):  ${avgLat.toFixed(2).padStart(10)} ms               │`);
  console.log(`│  P95 Latency:      ${p95.toFixed(2).padStart(10)} ms               │`);
  console.log(`│  Max Latency:      ${maxLat.toFixed(2).padStart(10)} ms               │`);
  console.log('├────────────────────────────────────────────────────────┤');
  console.log(`│  Calculated L:    ${concurrency.toFixed(2).padStart(10)} concurrent        │`);
  console.log('└────────────────────────────────────────────────────────┘\n');

  console.log('┌────────────────────────────────────────────────────────┐');
  console.log('│               PER-FILE LATENCY BREAKDOWN               │');
  console.log('├──────────┬───────────────┬───────────────┬────────────┤');
  console.log('│  Size    │     Avg       │      P95      │   Change   │');
  console.log('├──────────┼───────────────┼───────────────┼────────────┤');

  const sizes = [
    { name: '1kb', metric: data.metrics.latency_1kb },
    { name: '100kb', metric: data.metrics.latency_100kb },
    { name: '1mb', metric: data.metrics.latency_1mb },
    { name: '10mb', metric: data.metrics.latency_10mb },
  ];

  let prev = 0;
  for (const s of sizes) {
    if (s.metric && s.metric.values.avg > 0) {
      const avg = s.metric.values.avg;
      const p95s = s.metric.values['p(95)'] || 0;
      const change = prev > 0 ? `+${((avg/prev - 1) * 100).toFixed(0)}%` : '-';
      console.log(`│  ${s.name.padEnd(6)} │ ${avg.toFixed(2).padStart(13)}ms │ ${p95s.toFixed(2).padStart(13)}ms │ ${change.padStart(10)} │`);
      prev = avg;
    }
  }
  console.log('└──────────┴───────────────┴───────────────┴────────────┘\n');

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                    KEY INSIGHTS                         ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  • Larger files = Higher latency                       ║');
  console.log('║  • With fixed VUs, higher latency = higher concurrency ║');
  console.log('║  • Concurrency = λ × W (mathematical identity)        ║');
  console.log('║  • When concurrency > capacity: queue buildup          ║');
  console.log('║  • Queue buildup → latency increases further            ║');
  console.log('║  • Eventually: server overload / OOM / crash            ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  CONCLUSION: Little\'s Law proves capacity limits        ║');
  console.log('║  are NOT theoretical - they cause real failures.       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  return { stdout: '' };
}
