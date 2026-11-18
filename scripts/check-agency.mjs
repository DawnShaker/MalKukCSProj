import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';

const root = fileURLToPath(new URL('../', import.meta.url));
const dll = join(root, 'RealEstateAgency/bin/Debug/net10.0/RealEstateAgency.dll');
const directory = await mkdtemp(join(tmpdir(), 'agency-stage56-'));
const key = randomBytes(48).toString('hex');
const ids = new Map();
let application, logs = '', checks = 0;
function check(condition, name) { assert(condition, name); checks++; console.log(`PASS: ${name}`); }
const security = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const { username, password } = JSON.parse(body || '{}');
  if (request.url !== '/api/Users/login' || password !== 'test-password') { response.writeHead(401).end(); return; }
  if (!ids.has(username)) ids.set(username, randomUUID());
  const signingKey = username === 'forged' ? 'wrong-key'.repeat(8) : key;
  const token = await new SignJWT({ Id: ids.get(username),
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name': username,
    'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': username === 'owner' ? 'Admin' : 'User' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuer('test-security').setAudience(username === 'wrong-audience' ? 'other' : 'test-agency')
    .setExpirationTime(username === 'expired' ? Math.floor(Date.now()/1000)-60 : '1h')
    .sign(new TextEncoder().encode(signingKey));
  response.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify({token,role:'Admin'}));
});
await new Promise(resolve => security.listen(0, '127.0.0.1', resolve));
const portProbe = createServer();
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, ASPNETCORE_ENVIRONMENT:'Development', ASPNETCORE_URLS:base,
  ConnectionStrings__Agency:`Data Source=${join(directory,'agency.db')}`, DataProtection__Path:join(directory,'keys'),
  Security__Url:`http://127.0.0.1:${security.address().port}`, Security__JwtKey:key,
  Security__Issuer:'test-security', Security__Audience:'test-agency', Security__BootstrapManagerUsername:'owner', Logging__LogLevel__Default:'Warning' };
async function start() {
  logs = '';
  application = spawn('dotnet', [dll], {cwd:directory,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  application.stdout.on('data', chunk => {logs += chunk;});
  application.stderr.on('data', chunk => {logs += chunk;});
  for (let attempt=0;attempt<60;attempt++) {
    if(application.exitCode !== null) throw new Error(`C# app stopped: ${logs.slice(-4000)}`);
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve,250));
  }
  throw new Error(`C# startup timeout: ${logs.slice(-4000)}`);
}
async function stop() {
  if(application && application.exitCode === null) {
    const stopped = new Promise(resolve => application.once('exit',resolve));
    application.kill(); await stopped;
  }
}
function browser() {
  const cookies = new Map();
  let csrf;
  return { async request(path, method='GET', data, withCsrf=true) {
    const response = await fetch(`${base}/api${path}`, { method, redirect:'manual', headers: {
      ...(env.ASPNETCORE_FORWARDEDHEADERS_ENABLED === 'true' ? {'X-Forwarded-Proto':'https'} : {}),
      Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; '),
      ...(data === undefined ? {} : {'Content-Type':'application/json'}),
      ...(csrf && withCsrf ? {'X-CSRF-Token':csrf} : {}) },
      ...(data === undefined ? {} : {body:JSON.stringify(data)}) });
    for(const line of response.headers.getSetCookie()) { const pair=line.split(';')[0], split=pair.indexOf('='); cookies.set(pair.slice(0,split),pair.slice(split+1)); }
    const text = await response.text();
    let body; try { body=JSON.parse(text); } catch { body=text; }
    if(body.csrfToken) csrf=body.csrfToken;
    return {status:response.status,body,headers:response.headers};
  }};
}
async function login(username) {
  const session=browser(); await session.request('/auth/session');
  const result=await session.request('/auth/login','POST',{username,password:'test-password',role:'manager'});
  assert.equal(result.status,200,`${username} login: ${JSON.stringify(result.body)}`);
  return {session,user:result.body.user,result};
}
try {
  const imported=spawnSync('dotnet',[dll,'--import-json',join(root,'RealEstateAgency/agency_data.json')],{cwd:directory,env,windowsHide:true,encoding:'utf8'});
  assert.equal(imported.status,0,imported.stderr || imported.stdout);
  await start();
  const anonymous=browser();
  check((await anonymous.request('/properties')).status===401,'C# API rejects anonymous access');
  await anonymous.request('/auth/session');
  check((await anonymous.request('/auth/login','POST',{username:'owner',password:'test-password'},false)).status===400,'login requires an antiforgery token');
  for(const name of ['forged','expired','wrong-audience']) {
    const response=await anonymous.request('/auth/login','POST',{username:name,password:'test-password'});
    assert.equal(response.status,401,`Security rejects ${name}: ${JSON.stringify(response.body)}; ${logs.slice(-1500)}`);
    check(true,`Security rejects ${name} JWT`);
  }
  const manager=await login('owner');
  check(manager.user.role==='manager','only the configured signed Admin bootstraps manager');
  check(manager.result.headers.getSetCookie().some(value=>value.startsWith('agency-session=') && value.toLowerCase().includes('httponly')),'session uses an HttpOnly cookie');
  check(manager.result.body.token===undefined && manager.result.body.session===undefined,'browser JSON contains no upstream JWT');
  check((await manager.session.request('/properties')).body.length===12,'EF migration and JSON import preserve original records');
  check((await fetch(base)).status===200,'the C# server also serves the React interface');
  const agents=(await manager.session.request('/agents')).body;
  const agent=await login('agent'); const client=await login('client');
  check(agent.user.role==='client' && client.user.role==='client','unsigned role fields cannot grant manager access');
  check((await manager.session.request(`/users/${agent.user.id}`,'PATCH',{role:'agent',agentId:agents[0].id,clientId:null})).status===200,'manager links a Security account to an agent');
  const propertyDto={type:'Квартира',area:45,address:'Test address',district:'Центр',landmark:'Парк',rooms:2,price:50000,status:1,yearBuilt:2020,agentId:agents[0].id};
  const own=(await manager.session.request('/properties','POST',propertyDto)).body.property;
  const other=(await manager.session.request('/properties','POST',{...propertyDto,address:'Other',agentId:agents[1].id})).body.property;
  const ownClient=(await manager.session.request('/clients','POST',{name:'Test client',contactInfo:'test@example.test',type:1,agentId:agents[0].id})).body;
  check((await agent.session.request('/properties')).body.every(row=>row.agentId===agents[0].id),'agent only reads assigned properties');
  check((await agent.session.request(`/properties/${other.id}`,'PUT',{...propertyDto,agentId:agents[1].id})).status===404,'agent cannot edit another agent property');
  check((await agent.session.request('/properties','POST',{...propertyDto,agentId:agents[1].id})).status===403,'agent cannot create a property for another agent');
  check((await client.session.request(`/clients/${ownClient.id}/searches`)).status===404,'client cannot read another client searches');
  check((await client.session.request('/analytics')).status===403,'client cannot read management statistics');
  check((await client.session.request(`/users/${client.user.id}`,'PATCH',{role:'manager',agentId:null,clientId:null})).status===403,'client cannot promote itself');
  const deal=await agent.session.request('/deals','POST',{propertyId:own.id,clientId:ownClient.id,agentId:agents[0].id,price:50000,dealType:1,commission:5});
  check(deal.status===200,'agent creates its own deal through C# business logic');
  check((await manager.session.request(`/properties/${own.id}`,'PUT',{...propertyDto,agentId:agents[1].id})).status===400,'an active deal prevents unsafe property reassignment');
  check((await client.session.request('/properties')).body.every(row=>[1,2].includes(row.status)),'client catalog excludes sold and reserved properties');
  const request=await client.session.request(`/clients/${client.user.clientId}/requests`,'POST',{title:'My request',filter:{maxPrice:60000}});
  check(request.status===200 && (await client.session.request(`/requests/${request.body.id}/matches`)).status===200,'client creates requests and receives matching properties');
  await client.session.request('/properties/search','POST',{maxPrice:60000});
  check((await client.session.request(`/clients/${client.user.clientId}/history`)).body.length===1,'client search history is stored by EF Core');
  for(let index=0;index<11;index++) await client.session.request(`/clients/${client.user.clientId}/searches`,'POST',{title:`Search ${index}`,filter:{maxPrice:60000}});
  check((await client.session.request(`/clients/${client.user.clientId}/searches`)).body.length===10,'only ten saved searches are retained');
  const report=await manager.session.request('/reports');
  check(report.status===200 && report.headers.get('content-type').includes('text/csv'),'manager downloads a CSV report');
  check((await manager.session.request(`/users/${manager.user.id}`,'PATCH',{role:'client',agentId:null,clientId:ownClient.id})).status===409,'the last manager cannot be demoted');
  await manager.session.request(`/users/${agent.user.id}`,'PATCH',{role:'client',agentId:null,clientId:agent.user.clientId});
  check((await agent.session.request('/deals')).status===403,'role changes apply to an existing session on the next request');
  await stop(); await start();
  check((await manager.session.request('/auth/session')).body.user.id===manager.user.id,'account and protected cookie survive server restart');
  check((await manager.session.request('/properties')).body.some(row=>row.id===own.id && row.status===4),'business changes survive a new C# server instance');
  await client.session.request('/auth/session');
  await client.session.request('/auth/logout','POST',{});
  check((await client.session.request('/properties')).status===401,'logout removes authenticated access');
  await stop();
  env.ASPNETCORE_ENVIRONMENT='Production';
  env.ASPNETCORE_FORWARDEDHEADERS_ENABLED='true';
  await start();
  const proxyBrowser=browser();
  const proxySession=await proxyBrowser.request('/auth/session');
  check(proxySession.status===200 && proxySession.body.csrfToken && proxySession.headers.getSetCookie().some(value=>value.startsWith('agency-csrf=') && /; secure/i.test(value)), 'HTTPS behind a proxy issues a secure CSRF cookie in Production');
  check((await proxyBrowser.request('/auth/logout','POST',{},false)).status===400 && (await proxyBrowser.request('/auth/logout','POST',{})).status===200, 'Production proxy keeps CSRF validation enabled');
  console.log(`Completed ${checks} C# stage 5–6 checks.`);
} finally {
  await stop();
  await new Promise(resolve=>security.close(resolve));
  if(!resolve(directory).startsWith(resolve(tmpdir()) + sep) || !basename(directory).startsWith('agency-stage56-')) throw new Error('Unexpected test directory');
  await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
