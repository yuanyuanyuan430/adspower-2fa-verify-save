// Run with Node.js 18+: node scripts/check-totp.mjs
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadTotpApi, computeOtp } from './totp.mjs';
import { allocateProxies } from './allocate-proxies.mjs';

const { html, fullSource, context, api } = loadTotpApi();
const { parseConfig, importTotpKey, generateTotp } = api;
const times = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];
const vectors = [
  ['SHA1', 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', ['94287082', '07081804', '14050471', '89005924', '69279037', '65353130']],
  ['SHA256', 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA====', ['46119246', '68084774', '67062674', '91819424', '90698825', '77737706']],
  ['SHA512', 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA=', ['90693936', '25091201', '99943326', '93441116', '38618901', '47863826']],
];
for (const [algorithm, secret, expected] of vectors) {
  const config = parseConfig(secret, algorithm, '8');
  const key = await importTotpKey(config);
  for (let i = 0; i < times.length; i++) assert.equal(await generateTotp(key, config, times[i]), expected[i]);
}
const config = parseConfig(vectors[0][1].toLowerCase().replace(/(.{4})/g, '$1 '));
const key = await importTotpKey(config);
assert.equal(await generateTotp(key, config, 1111111109), '081804');
assert.equal(await generateTotp(key, config, 58), await generateTotp(key, config, 59));
assert.notEqual(await generateTotp(key, config, 59), await generateTotp(key, config, 60));
const uri = `otpauth://totp/Test?secret=${vectors[1][1]}&algorithm=SHA256&digits=8&period=45`;
const parsed = parseConfig(uri);
assert.equal(parsed.algorithm, 'SHA256'); assert.equal(parsed.digits, 8); assert.equal(parsed.period, 45);
assert.equal(parseConfig(`otpauth://totp/Test?secret=${vectors[0][1]}`, 'SHA512', '8', '60').period, 30);
for (const raw of ['', '123456', 'not-a-secret', 'A'.repeat(15), 'A'.repeat(16) + 'B', 'A'.repeat(16) + '=', 'A'.repeat(1025),
  'otpauth://hotp/Test?secret=' + vectors[0][1], uri + '&digits=6', uri.replace('SHA256', 'MD5'), uri.replace('period=45', 'period=0')]) {
  assert.throws(() => parseConfig(raw));
}
assert.throws(() => parseConfig(vectors[0][1], 'SHA1', '6', '30.5'));
await assert.rejects(() => generateTotp(key, config, -1));
assert.ok(html.includes("connect-src 'none'"));
assert.ok(!/\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|console\.)/.test(html));
// Exercise actual UI handlers: a pending rollover copy must not undo Clear.
const handlers = {}, elements = {};
const element = id => elements[id] ??= {
  value: { secret: vectors[0][1], algorithm: 'SHA1', digits: '6', period: '30' }[id] ?? '',
  addEventListener: (event, handler) => { handlers[`${id}:${event}`] = handler; },
  removeAttribute() {}, setAttribute() {}, focus() {}, reset() { elements.secret.value = ''; },
};
Object.assign(context, { document: { getElementById: element }, window: { addEventListener() {} },
  setInterval: () => 1, clearInterval() {}, Date: { now: () => 59000 } });
vm.runInContext(fullSource, context);
await handlers['form:submit']({ preventDefault() {} });
assert.match(elements.code.textContent, /^\d{6}$/);
context.Date.now = () => 60000;
vm.runInContext('generateTotp = () => new Promise(resolve => { globalThis.releaseCode = resolve; });', context);
const pendingCopy = handlers['copy:click']();
handlers['clear:click']();
context.releaseCode('000000');
await pendingCopy;
assert.equal(elements.code.textContent, '------'); assert.equal(elements.status.textContent, '');
assert.equal(elements.copy.disabled, true);
assert.equal((await computeOtp({ secret: vectors[0][1], digits: 8 }, 59)).code, '94287082');
assert.equal((await computeOtp({ secret: vectors[0][1], offset_seconds: 1 }, 59)).code,
  (await computeOtp({ secret: vectors[0][1] }, 60)).code);
await assert.rejects(() => computeOtp({ secret: vectors[0][1], offset_seconds: 301 }));
const dummyIPs = Array.from({ length: 9 }, (_, i) => `192.0.2.${i + 1}`);
const zeroUsage = Object.fromEntries(dummyIPs.map(ip => [ip, 0]));
const balanced = allocateProxies(10, dummyIPs, zeroUsage);
assert.equal(balanced.complete, true); assert.equal(balanced.assignments.length, 10);
assert.equal(balanced.assignments[9], 0); assert.ok(balanced.ip_groups.every(g => g.known_usage_after <= 5));
const sameIP = allocateProxies(6, ['192.0.2.1:1080:u:p', '192.0.2.1:1081:u:p'], zeroUsage);
assert.equal(sameIP.complete, false); assert.equal(sameIP.unassigned_indexes.length, 1);
assert.equal(sameIP.ip_groups.length, 1); assert.equal(sameIP.ip_groups[0].known_usage_after, 5);
const ipv6 = allocateProxies(6, ['[2001:db8::1]:1080:u:p', '2001:0db8:0:0:0:0:0:1'], { '2001:db8::1': 0 });
assert.equal(ipv6.ip_groups.length, 1); assert.equal(ipv6.unassigned_indexes.length, 1);
const mapped = allocateProxies(6, ['192.0.2.1', '::ffff:192.0.2.1', '::ffff:c000:201'], { '192.0.2.1': 0 });
assert.equal(mapped.ip_groups.length, 1); assert.equal(mapped.unassigned_indexes.length, 1);
assert.deepEqual(allocateProxies(2, ['192.0.2.1'], { '::ffff:192.0.2.1': 4 }).assignments, [0, null]);
const unknown = allocateProxies(1, dummyIPs, {});
assert.equal(unknown.complete, false); assert.equal(unknown.ip_groups[0].capacity_known, false);
assert.equal(unknown.ip_groups[0].remaining_capacity, null);
assert.deepEqual(allocateProxies(6, dummyIPs.slice(0, 2), { '192.0.2.1': 0 }).assignments, [0, 0, 0, 0, 0, null]);
const usedIPs = allocateProxies(2, dummyIPs.slice(0, 2), { '192.0.2.1': 5, '192.0.2.2': 4 });
assert.deepEqual(usedIPs.assignments, [1, null]);
assert.throws(() => allocateProxies(1, ['proxy.example.invalid'], {}));
assert.throws(() => allocateProxies(1, dummyIPs, { '192.0.2.1': -1 }));
assert.ok(allocateProxies(2, [{ proxy_host: 'proxy.example.invalid', allocation_ip: '192.0.2.1' }], zeroUsage).complete);
const cliPath = fileURLToPath(new URL('./totp.mjs', import.meta.url));
const goodCLI = spawnSync(process.execPath, [cliPath], { input: JSON.stringify({ secret: vectors[0][1] }), encoding: 'utf8' });
assert.equal(goodCLI.status, 0); assert.match(JSON.parse(goodCLI.stdout).code, /^\d{6}$/);
const sentinel = 'PRIVATE_SENTINEL_NOT_A_REAL_SECRET';
const badCLI = spawnSync(process.execPath, [cliPath], { input: '{"secret":"' + sentinel, encoding: 'utf8' });
assert.notEqual(badCLI.status, 0); assert.ok(!badCLI.stderr.includes(sentinel)); assert.equal(badCLI.stdout, '');
const argCLI = spawnSync(process.execPath, [cliPath, sentinel], { encoding: 'utf8' });
assert.notEqual(argCLI.status, 0); assert.ok(!argCLI.stderr.includes(sentinel));
const importedCLI = spawnSync(process.execPath, ['--input-type=module', '-e',
  `await import(${JSON.stringify(new URL('./totp.mjs', import.meta.url).href)})`, sentinel], { encoding: 'utf8' });
assert.equal(importedCLI.status, 0); assert.equal(importedCLI.stderr, '');
const utf8Payload = Buffer.from(JSON.stringify({ secret: vectors[0][1].replace(/(.{4})/g, '$1\u3000') }));
const cut = utf8Payload.indexOf(Buffer.from('\u3000')) + 1;
const utf8CLI = spawn(process.execPath, [cliPath]);
let utf8Output = '', utf8Error = '';
utf8CLI.stdout.on('data', c => { utf8Output += c; }); utf8CLI.stderr.on('data', c => { utf8Error += c; });
utf8CLI.stdin.write(utf8Payload.subarray(0, cut));
setTimeout(() => utf8CLI.stdin.end(utf8Payload.subarray(cut)), 20);
const utf8Status = await new Promise(resolve => utf8CLI.on('close', resolve));
assert.equal(utf8Status, 0); assert.equal(utf8Error, ''); assert.match(JSON.parse(utf8Output).code, /^\d{6}$/);
const allocationCLI = spawnSync(process.execPath, [fileURLToPath(new URL('./allocate-proxies.mjs', import.meta.url))],
  { input: JSON.stringify({ account_count: 10, proxies: dummyIPs, usage: zeroUsage }), encoding: 'utf8' });
assert.equal(allocationCLI.status, 0); assert.equal(JSON.parse(allocationCLI.stdout).complete, true);
console.log('PASS: 18 RFC vectors, TOTP CLI/offset/input privacy, pending-copy Clear regression, per-IP capacity/balancing/IPv6/known usage, and both portable CLI entries.');
