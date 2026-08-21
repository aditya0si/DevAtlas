# Performance Testing Reference

## k6 (Modern, Scriptable)

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // Ramp up
    { duration: '1m', target: 20 },    // Steady state
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% under 500ms
    http_req_failed: ['rate<0.01'],    // <1% errors
  },
};

export default function () {
  const res = http.get('https://api.example.com/users');

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

## Artillery (YAML-based)

```yaml
config:
  target: https://api.example.com
  phases:
    - duration: 60
      arrivalRate: 10
  defaults:
    headers:
      Authorization: Bearer ${TOKEN}

scenarios:
  - name: "Get users"
    flow:
      - get:
          url: "/api/users"
          expect:
            - statusCode: 200
            - hasProperty: "data"
```

## Key Metrics

| Metric | What to Measure | Target |
|--------|----------------|--------|
| Response time (p50, p95, p99) | Latency distribution | p95 < 500ms |
| Throughput | Requests per second | Meet SLA |
| Error rate | Failed requests | <1% |
| Concurrent users | Simultaneous load | Expected peak |
| Resource utilization | CPU, memory, DB connections | <80% |

## Load Test Types

- **Smoke:** 1-2 users, verify functionality
- **Load:** Expected peak load, verify performance
- **Stress:** Beyond peak, find breaking point
- **Soak:** Extended duration, find memory leaks
- **Spike:** Sudden traffic surge, test recovery

## CI Integration

```yaml
# GitHub Actions
- name: Run k6 load test
  uses: grafana/k6-action@v0.3.0
  with:
    filename: load-test.js
    flags: --out json=results.json

- name: Check thresholds
  run: k6 run --out json=results.json load-test.js
```
