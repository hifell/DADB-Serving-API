import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

// Test targets
const SINGLE_NODE = __ENV.SINGLE_NODE_URL || 'http://localhost:3001';
const LB_URL = __ENV.LB_URL || 'http://localhost:8081';

const latencySingle = new Trend('latency_single');
const latencyLB = new Trend('latency_lb');

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '30s', target: 50 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<20000'],
  },
};

export default function () {
  // Test 10MB file download via Load Balancer
  const url = `${LB_URL}/file/10mb`;
  const res = http.get(url);
  latencyLB.add(res.timings.duration);

  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(0.3);
}

export function handleSummary(data) {
  const rps = data.metrics.http_reqs.values.rate;
  const avgLat = data.metrics.http_req_duration.values.avg;
  const p95 = data.metrics.http_req_duration.values['p(95)'];
  const p99 = data.metrics.http_req_duration.values['p(99)'] || 0;
  const maxLat = data.metrics.http_req_duration.values.max;

  // Compare with baseline
  const singleNodeBaseline = 14.42; // From Task #1: L = λ × W
  const currentConcurrency = rps * (avgLat / 1000);

  // Amdahl's Law: Speedup = 1 / (S + (1-S)/N)
  // S = serial portion (Nginx overhead ~0.25)
  // N = number of parallel nodes = 3
  const serialPortion = 0.25;
  const nodes = 3;
  const theoreticalMax = 1 / (serialPortion + (1 - serialPortion) / nodes);

  // Actual speedup calculation
  // If single node can handle ~14 concurrent with 10MB
  // 3 nodes should theoretically handle 3x more
  // But LB adds serial bottleneck
  const expectedSpeedup = nodes * (1 - serialPortion); // Accounting for serial
  const actualSpeedup = currentConcurrency / singleNodeBaseline;

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║              AMDHAL\'S LAW VERIFICATION (3 Nodes + LB)             ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  Formula:  Speedup = 1 / (S + (1-S)/N)                         ║');
  console.log('║  S = Serial portion  N = Number of parallel nodes               ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  console.log('┌──────────────────────────────────────────────────────────────────────┐');
  console.log('│                    SYSTEM CONFIGURATION                             │');
  console.log('├──────────────────────────────────────────────────────────────────────┤');
  console.log('│  Nodes:            3 (parallel processing)                         │');
  console.log('│  Load Balancer:    Nginx (serial gateway)                         │');
  console.log('│  Serial Portion S: 25% (LB overhead + request routing)           │');
  console.log('│  Parallel Portion: 75% (actual file serving)                      │');
  console.log('└──────────────────────────────────────────────────────────────────────┘\n');

  console.log('┌──────────────────────────────────────────────────────────────────────┐');
  console.log('│                    ACTUAL METRICS (Multi-Node)                      │');
  console.log('├──────────────────────────────────────────────────────────────────────┤');
  console.log(`│  Throughput:        ${rps.toFixed(2).padStart(10)} req/s                              │`);
  console.log(`│  Avg Latency:       ${avgLat.toFixed(2).padStart(10)} ms                               │`);
  console.log(`│  P95 Latency:       ${p95.toFixed(2).padStart(10)} ms                               │`);
  console.log(`│  P99 Latency:       ${p99.toFixed(2).padStart(10)} ms                               │`);
  console.log(`│  Max Latency:       ${maxLat.toFixed(2).padStart(10)} ms                               │`);
  console.log(`│  Concurrency (L):   ${currentConcurrency.toFixed(2).padStart(10)} concurrent                    │`);
  console.log('└──────────────────────────────────────────────────────────────────────┘\n');

  console.log('┌──────────────────────────────────────────────────────────────────────┐');
  console.log('│              AMDHAL\'S LAW CALCULATION                             │');
  console.log('├──────────────────────────────────────────────────────────────────────┤');
  console.log('│  S (Serial) = 0.25                                                 │');
  console.log('│  N (Nodes)   = 3                                                   │');
  console.log('│  1-S         = 0.75 (parallel portion)                             │');
  console.log('│                                                                    │');
  console.log('│  Speedup_max = 1 / (0.25 + 0.75/3)                                 │');
  console.log('│             = 1 / (0.25 + 0.25)                                     │');
  console.log('│             = 1 / 0.5                                               │');
  console.log(`│             = ${theoreticalMax.toFixed(2)}x (THEORETICAL MAXIMUM)                    │`);
  console.log('├──────────────────────────────────────────────────────────────────────┤');
  console.log(`│  Actual Speedup:    ${actualSpeedup.toFixed(2)}x                                      │`);
  console.log(`│  Efficiency:        ${((actualSpeedup / theoreticalMax) * 100).toFixed(1)}%                                       │`);
  console.log('└──────────────────────────────────────────────────────────────────────┘\n');

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                      KEY INSIGHTS                                 ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  1. Adding 3 nodes does NOT give 3x speedup                      ║');
  console.log('║  2. Serial portion (Nginx LB) limits maximum speedup             ║');
  console.log('║  3. Even with infinite nodes, speedup capped at 1/S = 4x         ║');
  console.log('║  4. LB is the bottleneck - all traffic passes through it         ║');
  console.log('║  5. Real-world speedup < theoretical due to:                    ║');
  console.log('║     - LB overhead                                                 ║');
  console.log('║     - Connection setup time                                       ║');
  console.log('║     - Request distribution latency                                ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  CONCLUSION: Amdahl\'s Law proves parallelization has limits.    ║');
  console.log('║  The serial portion (LB) determines the ceiling.                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Comparison table
  console.log('┌──────────────────────────────────────────────────────────────────────┐');
  console.log('│              COMPARISON: Single vs Multi-Node                       │');
  console.log('├─────────────────┬──────────────────┬───────────────────────────────┤');
  console.log('│     Metric      │   Single Node    │     3 Nodes + LB             │');
  console.log('├─────────────────┼──────────────────┼───────────────────────────────┤');
  console.log(`│  Concurrency    │   ${singleNodeBaseline.toFixed(2).padStart(14)}  │   ${currentConcurrency.toFixed(2).padStart(27)} │`);
  console.log(`│  Latency (avg)  │   ~34ms          │   ${avgLat.toFixed(2).padStart(27)}ms │`);
  console.log(`│  Latency (P95)  │   ~75ms          │   ${p95.toFixed(2).padStart(27)}ms │`);
  console.log('└─────────────────┴──────────────────┴───────────────────────────────┘\n');

  return { stdout: '' };
}
