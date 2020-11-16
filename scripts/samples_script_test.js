import http from 'k6/http';
import {check, group, sleep, fail} from 'k6';

export let options = {
  stages: [
    { target: 50, duration: '25s' },
    { target: 50, duration: '5s' },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1500'],
    'http_req_duration{name:PublicCrocs}': ['avg<400'],
    'http_req_duration{name:Create}': ['avg<600', 'max>1000'],
  },
};

function randomString(length) {
  const charset = 'abcdefghijklmnopqrstuvwxyz';
  let res = '';
  while (length--) res += charset[Math.random() * charset.length | 0];
  return res;
}

const USERNAME = `${randomString(10)}@example.com`;
const PASSWORD = 'superCroc2019';
const BASE_URL = 'https://test-api.loadimpact.com';

export function setup() {
  // Register a new user and authenticate via a Bearer token.
  let res = http.post(`${BASE_URL}/user/register/`, {
    first_name: 'Crocodile',
    last_name: 'Owner',
    username: USERNAME,
    password: PASSWORD,
  });

  check(res, { 'created user': (r) => r.status === 201 });

  let loginRes = http.post(`${BASE_URL}/auth/token/login/`, {
    username: USERNAME,
    password: PASSWORD
  });

  let authToken = loginRes.json('access');
  check(authToken, { 'logged in successfully': () => authToken !== '', });

  return authToken;
}


export default (authToken) => {
  const requestConfigWithTag = tag => ({
    headers: {
      Authorization: `Bearer ${authToken}`
    },
    tags: Object.assign({}, {
      name: 'PrivateCrocs'
    }, tag)
  });

  group('Public endpoints', () => {
    // Call some public endpoints in parallel.
    let responses = http.batch([
      ['GET', `${BASE_URL}/public/crocodiles/1/`, null, {tags: {name: 'PublicCrocs'}}],
      ['GET', `${BASE_URL}/public/crocodiles/2/`, null, {tags: {name: 'PublicCrocs'}}],
      ['GET', `${BASE_URL}/public/crocodiles/3/`, null, {tags: {name: 'PublicCrocs'}}],
      ['GET', `${BASE_URL}/public/crocodiles/4/`, null, {tags: {name: 'PublicCrocs'}}],
    ]);

    const ages = Object.values(responses).map(res => res.json('age'));

    // Check that all the public crocodiles are older than 5.
    check(ages, {
      'Crocs are older than 5 years of age': Math.min(...ages) > 5
    });
  });

  group('Create and modify crocs', () => {
    let URL = `${BASE_URL}/my/crocodiles/`;

    group('Create crocs', () => {
      const payload = {
        name: `Name ${randomString(10)}`,
        sex: 'M',
        date_of_birth: '2001-01-01',
      };

      const res = http.post(URL, payload, requestConfigWithTag({ name: 'Create' }));

      if (check(res, { 'croc created': (r) => r.status === 201 })) {
        URL = `${URL}${res.json('id')}/`;
      } else {
        fail(`Unable to create a Croc ${res.status} ${res.body}`)
      }
    });

    group('Update croc', () => {
      const payload = { name: 'New name' };
      const res = http.patch(URL, payload, requestConfigWithTag({ name: 'Update' }));
      const isSuccessfulUpdate = check(res, {
        'resp correct': () => res.status === 200,
        'croc updated': () => res.json('name') === 'New name',
      });

      if (!isSuccessfulUpdate) {
        fail(`Unable to update the croc ${res.status} ${res.body}`)
      }
    });

    group('Update croc', () => {
      const res = http.del(URL, null, requestConfigWithTag({ name: 'Delete' }));
      const getRes = http.get(URL, requestConfigWithTag({ name: 'RetrieveDeleted' }));

      const isSuccessfulDelete = check(res, {
        'crocDeleted': () => res.status === 204,
        'crocNotFound': () => getRes.status === 404,
      });

      if (!isSuccessfulDelete) {
        fail(`Croc was not deleted properly`)
      }
    })
  });

  sleep(1);
}