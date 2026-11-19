import test from 'node:test';
import assert from 'node:assert/strict';

const json = (data, status = 200) => Response.json(data, {status});
const session = () => json({user:null,csrfToken:'test-csrf',auth:{identifier:'username',refresh:false}});
let moduleId = 0;
async function client() {
  return import(new URL(`../client-app/src/api/http.js?test=${++moduleId}`, import.meta.url));
}

test('session loading waits through a cold API and its HTML loading page', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({url,options});
    if (calls.length === 1) return new Response('', {status:503});
    if (calls.length === 2) return new Response('<html>Starting</html>', {headers:{'Content-Type':'text/html'}});
    return session();
  });
  const api = await client();
  const first = api.getSession(), second = api.getSession();
  assert.equal(first, second);
  assert.equal((await first).auth.identifier, 'username');
  assert.equal(calls.length, 3);
  assert(calls.every(call => call.url === '/api/auth/session' && !call.options.body && call.options.signal));
});

test('login waits for Security then sends credentials once with a fresh CSRF token', async t => {
  const calls = [];
  let probes = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({url,options});
    if (url.endsWith('/ready')) return json({ready:++probes > 1});
    if (url.endsWith('/session')) return session();
    return json({user:{id:'manager',role:'manager'}});
  });
  const api = await client();
  assert.equal((await api.authApi.login({username:'test-user',password:'test-password'})).user.role, 'manager');
  const posts = calls.filter(call => call.options.method === 'POST');
  assert.equal(probes, 2);assert.equal(posts.length, 1);
  assert.equal(posts[0].options.headers['X-CSRF-Token'], 'test-csrf');
  assert(calls.slice(0,-1).every(call => !call.options.body));
});

test('incorrect credentials and failed mutations are not automatically resubmitted', async t => {
  const posts = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/ready')) return json({ready:true});
    if (url.endsWith('/session')) return session();
    posts.push(url);
    return json({error:'Rejected'}, url.endsWith('/login') ? 401 : 503);
  });
  const api = await client();
  await assert.rejects(api.authApi.login({username:'test-user',password:'wrong'}), error=>error.status===401);
  await assert.rejects(api.request('/properties',{method:'POST',body:'{}'}), error=>error.status===503);
  assert.deepEqual(posts, ['/api/auth/login','/api/properties']);
});

test('persistent unavailability stops waiting and never submits the password', async t => {
  let time = 0, calls = 0;
  t.mock.method(Date, 'now', () => time);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/session')) return session();
    calls++;time += 120_001;
    assert.equal(url, '/api/auth/ready');assert.equal(options.body, undefined);
    return json({ready:false});
  });
  const api = await client();
  await assert.rejects(api.authApi.login({username:'test-user',password:'test-password'}), error=>error.status===503);
  assert.equal(calls, 1);
});

test('Security and the C# session start together instead of adding their startup delays', async t => {
  let sessionStarted = false;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/session')) {sessionStarted=true;return session();}
    if (url.endsWith('/ready')) {
      await new Promise(resolve=>setTimeout(resolve,10));
      assert(sessionStarted, 'the session request must start before readiness finishes');
      return json({status:'ok',ready:true});
    }
    return json({user:{role:'manager'}});
  });
  const api = await client();
  assert.equal((await api.authApi.login({username:'test-user',password:'test-password'})).user.role,'manager');
});

test('an authentication gate is reported without retries', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {calls++;return new Response('Sign in',{status:401});});
  const api = await client();
  await assert.rejects(api.getSession(), error=>error.status===401);
  assert.equal(calls, 1);
});
