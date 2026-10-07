import { readFileSync, realpathSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// Reuse the reviewed standalone HTML core; there is only one TOTP implementation.
export function loadTotpApi() {
  const html = readFileSync(new URL('../assets/totp.html', import.meta.url), 'utf8');
  const fullSource = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!fullSource?.includes('// UI')) throw new Error('Bundled TOTP core is unavailable.');
  const context = vm.createContext({ crypto: webcrypto, URL, Uint8Array, ArrayBuffer, DataView });
  vm.runInContext(fullSource.split('// UI')[0] + ';globalThis.api = { parseConfig, importTotpKey, generateTotp };', context, { timeout: 1000 });
  return { html, fullSource, context, api: context.api };
}

const { api } = loadTotpApi();
export async function computeOtp(input, seconds = Date.now() / 1000) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      typeof input.secret !== 'string' || input.secret.length > 4096 ||
      Object.keys(input).some(k => !['secret', 'algorithm', 'digits', 'period', 'offset_seconds'].includes(k))) {
    throw new Error('Supply an object with secret and optional algorithm/digits/period/offset_seconds.');
  }
  if (input.algorithm !== undefined && typeof input.algorithm !== 'string') throw new Error('Algorithm must be text.');
  const offset = input.offset_seconds ?? 0;
  if (!Number.isFinite(offset) || Math.abs(offset) > 300) throw new Error('Clock offset must be within 300 seconds.');
  const config = api.parseConfig(input.secret, input.algorithm ?? 'SHA1', input.digits ?? '6', input.period ?? '30');
  const now = seconds + offset;
  const code = await api.generateTotp(await api.importTotpKey(config), config, now);
  return { code, valid_for_seconds: config.period - Math.floor(now) % config.period,
    algorithm: config.algorithm, digits: config.digits, period: config.period };
}

let directRun = false;
try { directRun = !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* Library imports need no argv path. */ }
if (directRun) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--self-test') {
      const result = await computeOtp({ secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', digits: 8 }, 59);
      if (result.code !== '94287082') throw new Error('Public RFC 6238 check failed.');
      console.log('PASS: local TOTP core; no account data, network or clipboard used.');
    } else if (args.length === 1 && args[0] === '--help') {
      console.log('Node 18+. Pass JSON through stdin: secret, optional algorithm/digits/period/offset_seconds. Output contains a sensitive one-time code; keep it inside the authorized runtime. No secret arguments or files are required.');
    } else {
      if (args.length) throw new Error('Use stdin for input; credential arguments are not accepted.');
      process.stdin.setEncoding('utf8');
      let raw = '', size = 0;
      for await (const chunk of process.stdin) {
        size += Buffer.byteLength(chunk, 'utf8');
        if (size > 8192) { process.stdin.destroy(); throw new Error('Input is too large.'); }
        raw += chunk;
      }
      let input;
      try { input = JSON.parse(raw); } catch { throw new Error('Input must be valid JSON.'); }
      console.log(JSON.stringify(await computeOtp(input)));
    }
  } catch (error) {
    process.stdin.destroy();
    console.error(error.message);
    process.exitCode = 1;
  }
}
