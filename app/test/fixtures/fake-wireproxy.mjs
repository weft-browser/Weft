// A stand-in for wireproxy in tests: reads the [Socks5] BindAddress from the config it is given
// and listens there. `FAKE_WIREPROXY_DIE=1` makes it exit at once, like a bad key would.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';

const conf = readFileSync(process.argv[process.argv.indexOf('-c') + 1], 'utf8');
const m = /BindAddress\s*=\s*127\.0\.0\.1:(\d+)/.exec(conf);
if (!m) { console.error('no bind address'); process.exit(2); }
if (process.env.FAKE_WIREPROXY_DIE) { console.error('handshake failed'); process.exit(1); }
createServer((s) => s.end()).listen(Number(m[1]), '127.0.0.1');
