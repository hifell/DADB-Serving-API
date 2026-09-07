import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const latencyTrend = new Trend('latency');

export const options = {
  scenarios: {
    // Progressive load test: 1KB -> 100KB -> 1MB -> 10MB
    file_1kb: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '30s', target: 100 },
      ],
      tags: { file: '1kb' },
    },
    file_100kb: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 30 },
        { duration: '30s', target: 50 },
      ],
      tags: { file: '100kb' },
    },
    file_1mb: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '30s', target: 20 },
      ],
      tags: { file: '1mb' },
    },
    file_10mb: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '20s', target: 5 },
        { duration: '20s', target: 10 },
      ],
      tags: { file: '10mb' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 2s timeout threshold
    errors: ['rate<0.1'], // Less than 10% errors
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3001';

export default function () {
  const fileSizes = ['1kb', '100kb', '1mb', '10mb'];

  for (const size of fileSizes) {
    const url = `${BASE_URL}/file/${size}`;

    const start = Date.now();
    const res = http.get(url, {
      responseType: 'binary',
    });
    const latency = Date.now() - start;

    latencyTrend.add(latency);

    const success = check(res, {
      'status is 200': (r) => r.status === 200,
      'content length > 0': (r) => r.body && r.body.length > 0,
    });

    errorRate.add(!success);

    sleep(0.1);
  }
}

export function handleSummary(data) {
  console.log('\n=== Little\'s Law Analysis ===');
  console.log('Formula: Concurrency = Throughput × Latency');
  console.log('');

  const totalRequests = data.metrics.http_reqs.values.count;
  const avgLatency = data.metrics.http_req_duration.values.avg || 0;
  const throughput = totalRequests / (data.metrics.http_req_duration.values.iteration_duration || 1);

  console.log(`Total Requests: ${totalRequests}`);
  console.log(`Avg Latency (ms): ${avgLatency.toFixed(2)}`);
  console.log(`Throughput (req/s): ${throughput.toFixed(2)}`);
  console.log(`Calculated Concurrency: ${(throughput * avgLatency / 1000).toFixed(2)}`);

  // Little's Law verification
  const concurrency = data.metrics.vus ? data.metrics.vus.values.current : 0;
  const expectedConcurrency = throughput * avgLatency / 1000;

  console.log(`Actual VUs (Concurrency): ${concurrency}`);
  console.log(`Expected (λ × W): ${expectedConcurrency.toFixed(2)}`);
  console.log('');

  return {
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  let summary = '\n=== HTTP Metrics ===\n';
  summary += `Requests: ${data.metrics.http_reqs.values.count}\n`;
  summary += `Request Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)}/s\n`;
  summary += `Avg Duration: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
  summary += `P95 Duration: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  summary += `Max Duration: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms\n`;
  summary += `\n=== Error Metrics ===\n`;
  summary += `Error Rate: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%\n`;
  summary += `Total Errors: ${data.metrics.errors.values.count}\n`;

  return summary;
}
