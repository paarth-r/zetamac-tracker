// Chrome native messaging host. Chrome starts this process for each message
// from the extension: 4-byte little-endian length + UTF-8 JSON on stdin, one
// framed JSON reply on stdout. Stdout carries only the protocol; log to file.
const store = require('../src/store.js');

function reply(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

function handle(msg) {
  if (msg && msg.type === 'games' && Array.isArray(msg.games)) {
    const r = store.ingest(msg.games);
    store.log(`ingest received=${msg.games.length} added=${r.added} total=${r.total} notes=${r.notes}`);
    return { ok: true, ...r };
  }
  if (msg && msg.type === 'ping') return { ok: true, home: store.home() };
  return { ok: false, error: 'unknown message' };
}

const chunks = [];
process.stdin.on('data', (c) => {
  chunks.push(c);
  const buf = Buffer.concat(chunks);
  if (buf.length < 4) return;
  const len = buf.readUInt32LE(0);
  if (buf.length < 4 + len) return;
  let out;
  try {
    out = handle(JSON.parse(buf.subarray(4, 4 + len).toString('utf8')));
  } catch (e) {
    store.log(`error ${e && e.stack ? e.stack : e}`);
    out = { ok: false, error: String(e && e.message ? e.message : e) };
  }
  reply(out);
  process.stdin.pause();
});
process.stdin.on('end', () => process.exit(0));
