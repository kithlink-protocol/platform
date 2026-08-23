import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    smoke: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [{ duration: '30s', target: 50 }],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:4000';

const ROUTES = [
  '/public/v1/shelters',
  '/public/v1/shelters/happytail/animals?limit=5',
  '/healthz',
];

export default function () {
  for (const route of ROUTES) {
    const res = http.get(`${BASE}${route}`, { tags: { name: route } });
    check(res, {
      [`${route} is 200`]: r => r.status === 200,
    });
    sleep(0.2);
  }
}
