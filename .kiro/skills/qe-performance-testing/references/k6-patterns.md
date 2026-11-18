# k6 Load Testing Patterns

## Basic Load Test
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // ramp up
    { duration: '1m', target: 20 },   // steady state
    { duration: '10s', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${__ENV.BASE_URL}/api/endpoint`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1); // Think time — don't forget!
}
```

## Stress Test Pattern
```javascript
export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 0 },
  ],
};
```

## Spike Test Pattern
```javascript
export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '10s', target: 1000 },  // spike!
    { duration: '3m', target: 1000 },
    { duration: '10s', target: 10 },
  ],
};
```

## Soak Test Pattern
```javascript
export const options = {
  stages: [
    { duration: '5m', target: 50 },
    { duration: '4h', target: 50 },  // long duration
    { duration: '5m', target: 0 },
  ],
};
```

## Tips
- Always include `sleep()` for think time
- Use `__ENV.BASE_URL` not hardcoded URLs
- Set `--out json=results.json` for CI comparison
- Use `scenarios` for complex user journeys
- Watch for connection reuse vs real-world patterns
