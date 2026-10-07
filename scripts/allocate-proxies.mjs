import { isIP } from 'node:net';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function ipKey(value) {
  if (typeof value !== 'string') throw new Error('Each proxy needs a numeric allocation IP.');
  const ip = value.trim().replace(/^\[|\]$/g, '');
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) === 6) {
    const canonical = new URL('http://[' + ip + ']/').hostname.slice(1, -1);
    const mapped = canonical.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/);
    if (!mapped) return canonical;
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return [high >>> 8, high & 255, low >>> 8, low & 255].join('.');
  }
  throw new Error('Use a numeric fixed IP, or supply allocation_ip for a hostname/rotating proxy.');
}

export function allocateProxies(accountCount, proxies, usage) {
  if (!Number.isInteger(accountCount) || accountCount < 1 || accountCount > 10000 ||
      !Array.isArray(proxies) || !proxies.length || proxies.length > 2000 ||
      !usage || typeof usage !== 'object' || Array.isArray(usage)) throw new Error('Invalid bounded allocation request.');
  const used = new Map();
  for (const [ip, count] of Object.entries(usage)) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Known usage counts must be non-negative integers.');
    const key = ipKey(ip);
    const sum = (used.get(key) ?? 0) + count;
    if (!Number.isSafeInteger(sum)) throw new Error('Known usage count is too large.');
    used.set(key, sum);
  }
  const byIP = new Map();
  proxies.forEach((proxy, index) => {
    let value;
    if (typeof proxy === 'string') {
      value = isIP(proxy.trim()) ? proxy : proxy.match(/^\[([^\]]+)\]/)?.[1] ?? proxy.split(':')[0];
    } else if (proxy && typeof proxy === 'object') {
      value = proxy.allocation_ip ?? proxy.proxy_host ?? proxy.host ?? proxy.ip;
    }
    const key = ipKey(value);
    if (!byIP.has(key)) byIP.set(key, { indexes: [], known: used.has(key), used: used.get(key) ?? null, cursor: 0, added: 0 });
    byIP.get(key).indexes.push(index);
  });
  const groups = [...byIP.values()], assignments = [], unassigned = [];
  // ponytail: O(accounts × IPs), bounded small batches; use a heap if large-batch profiling warrants it.
  for (let i = 0; i < accountCount; i++) {
    let selected;
    for (const group of groups) if (group.known && group.used < 5 && (!selected || group.used < selected.used)) selected = group;
    if (!selected) { assignments.push(null); unassigned.push(i); continue; }
    assignments.push(selected.indexes[selected.cursor++ % selected.indexes.length]);
    selected.used++; selected.added++;
  }
  return { complete: unassigned.length === 0, assignments, unassigned_indexes: unassigned,
    ip_groups: groups.map((g, i) => ({ ip_ref: i, proxy_indexes: g.indexes, capacity_known: g.known, known_usage_after: g.used,
      assigned_in_batch: g.added, remaining_capacity: g.known ? Math.max(0, 5 - g.used) : null })) };
}

let directRun = false;
try { directRun = !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* Library imports need no argv path. */ }
if (directRun) {
  try {
    if (process.argv.length !== 2) throw new Error('Pass account_count, proxies and known usage as JSON through stdin.');
    process.stdin.setEncoding('utf8');
    let raw = '', size = 0;
    for await (const chunk of process.stdin) {
      size += Buffer.byteLength(chunk, 'utf8');
      if (size > 262144) { process.stdin.destroy(); throw new Error('Allocation input is too large.'); }
      raw += chunk;
    }
    let input;
    try { input = JSON.parse(raw); } catch { throw new Error('Input must be valid JSON.'); }
    console.log(JSON.stringify(allocateProxies(input.account_count, input.proxies, input.usage)));
  } catch (error) {
    process.stdin.destroy(); console.error(error.message); process.exitCode = 1;
  }
}
