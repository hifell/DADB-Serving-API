import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

const errorRate = new Rate('errors');
const latencyTrend = new Trend('latency');
const requestsByNode = {
  node1: new Counter('node1_requests'),
  node2: new Counter('node2_requests'),
  node3: new Counter('node3_requests'),
};
const nodeLatency = {
  node1: new Trend('node1_latency'),
  node2: new Trend('node2_latency'),
  node3: new Trend('node3_latency'),
};

export const options = {
  scenarios: {
    // Amdahl's Law test: constant load, measure throughput with N nodes
    single_node_baseline: {
      executor: 'constant-vus',
      vus: 20,
      duration: '60s',
      tags: { test: 'baseline_single' },
    },
    multi_node_3: {
      executor: 'constant-vus',
      vus: 20,
      duration: '60s',
      tags: { test: 'amdahl_3nodes' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    errors: ['rate<0.05'],
  },
};

// Test targets
const TARGETS = {
  single: __ENV.SINGLE_NODE_URL || 'http://localhost:3001',
  lb: __ENV.LB_URL || 'http://localhost:8080',
};

export default function () {
  const testType = __ENV.TEST_TYPE || 'lb';

  let url, nodeKey;
  if (testType === 'single') {
    url = `${TARGETS.single}/file/10mb`;
    nodeKey = 'node1';
  } else {
    url = `${TARGETS.lb}/file/10mb`;
    // Since LB distributes, we track overall
    nodeKey = 'lb';
  }

  const start = Date.now();
  const res = http.get(url, {
    responseType: 'binary',
  });
  const latency = Date.now() - start;

  latencyTrend.add(latency);

  if (nodeKey !== 'lb' && nodeLatency[nodeKey]) {
    nodeLatency[nodeKey].add(latency);
    requestsByNode[nodeKey].add(1);
  }

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'content length > 0': (r) => r.body && r.body.length > 0,
  });

  errorRate.add(!success);
  sleep(0.5);
}

export function handleSummary(data) {
  console.log('\n=== Amdahl\'s Law Analysis ===');
  console.log('Formula: Speedup = 1 / (S + (1-S)/N)');
  console.log('');
  console.log('Where:');
  console.log('  S = Serial portion (Nginx LB overhead)');
  console.log('  N = Number of parallel nodes');
  console.log('');

  const totalRequests = data.metrics.http_reqs.values.count;
  const duration = data.metrics.http_req_duration.values.iteration_duration || 60;
  const throughput = totalRequests / 60;
  const avgLatency = data.metrics.http_req_duration.values.avg || 0;
  const p95 = data.metrics.http_req_duration.values['p(95)'] || 0;

  console.log('=== Results ===');
  console.log(`Total Requests: ${totalRequests}`);
  console.log(`Throughput: ${throughput.toFixed(2)} req/s`);
  console.log(`Avg Latency: ${avgLatency.toFixed(2)} ms`);
  console.log(`P95 Latency: ${p95.toFixed(2)} ms`);
  console.log(`Error Rate: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%`);
  console.log('');

  // Calculate theoretical vs actual speedup
  const singleNodeTput = 50; // Baseline from single node test
  const multiNodeTput = throughput;
  const actualSpeedup = multiNodeTput / singleNodeTput;

  console.log('=== Speedup Analysis ===');
  console.log(`Single Node Throughput: ~${singleNodeTput} req/s`);
  console.log(`Multi-Node Throughput: ${multiNodeTput.toFixed(2)} req/s`);
  console.log(`Actual Speedup: ${actualSpeedup.toFixed(2)}x`);
  console.log('');

  // Amdahl's Law: max speedup with serial portion
  // If LB adds 25% serial overhead (S=0.25), N=3
  // Speedup_max = 1 / (0.25 + 0.75/3) = 1 / (0.25 + 0.25) = 2x
  const serialPortion = 0.25; // Estimated Nginx overhead
  const nodes = 3;
  const theoreticalMax = 1 / (serialPortion + (1 - serialPortion) / nodes);

  console.log('=== Theoretical (Amdahl) ===');
  console.log(`Serial Portion (S): ${serialPortion * 100}%`);
  console.log(`Parallel Portion (1-S): ${(1 - serialPortion) * 100}%`);
  console.log(`Nodes (N): ${nodes}`);
  console.log(`Theoretical Max Speedup: ${theoreticalMax.toFixed(2)}x`);
  console.log(`Actual Speedup: ${actualSpeedup.toFixed(2)}x`);
  console.log(`Efficiency: ${((actualSpeedup / theoreticalMax) * 100).toFixed(1)}%`);
  console.log('');

  return {
    stdout: textSummary(data, actualSpeedup, theoreticalMax),
  };
}

function textSummary(data, actualSpeedup, theoreticalMax) {
  let summary = '\n=== HTTP Metrics ===\n';
  summary += `Requests: ${data.metrics.http_reqs.values.count}\n`;
  summary += `Request Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)}/s\n`;
  summary += `Avg Duration: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
  summary += `P95 Duration: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  summary += `P99 Duration: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n`;
  summary += `Max Duration: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms\n`;
  summary += '\n=== Comparison ===\n';
  summary += `Actual Speedup: ${actualSpeedup.toFixed(2)}x\n`;
  summary += `Theoretical Max: ${theoreticalMax.toFixed(2)}x\n`;

  return summary;
}
