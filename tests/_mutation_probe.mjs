// TEMPORARY mutation probe - deleted after use.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_STORE = path.join(HERE, '..', 'server', 'store.js');

function parsePublicFields(src) {
  const decl = src.indexOf('const PUBLIC_FIELDS');
  assert.notEqual(decl, -1);
  const open = src.indexOf('{', decl);
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = src.slice(open + 1, end);
  const out = {};
  const re = /([A-Za-z_$][\w$]*)\s*:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(body)) !== null) out[m[1]] = [...m[2].matchAll(/'([^']*)'/g)].map(x => x[1]);
  return out;
}

const src = fs.readFileSync(SERVER_STORE, 'utf8');
const real = parsePublicFields(src);
console.log('parsed server PUBLIC_FIELDS:', JSON.stringify(real, null, 1));

const auth = await import(pathToFileURL(path.join(HERE, '..', 'public', 'js', 'core', 'authority.js')).href);
console.log('client equals server:', JSON.stringify(auth.PUBLIC_SIGN_FIELDS) === JSON.stringify(real));

// Mutation 1: the node drops "meta" from the signed shorts fields.
const mutated1 = src.replace("'title', 'meta', 'ts'", "'title', 'ts'");
const parsed1 = parsePublicFields(mutated1);
let detected = false;
try {
  assert.deepEqual(auth.PUBLIC_SIGN_FIELDS.shorts, parsed1.shorts);
} catch { detected = true; }
console.log('mutation "meta dropped from server shorts" detected:', detected);

// Mutation 2: the server reorders the stream fields.
const mutated2 = src.replace(
  "'id', 'by', 'title', 'visibility', 'channelId', 'chatKey', 'wrappedChatKey', 'live', 'ended', 'ts'",
  "'id', 'by', 'title', 'visibility', 'channelId', 'wrappedChatKey', 'chatKey', 'live', 'ended', 'ts'",
);
const parsed2 = parsePublicFields(mutated2);
let detected2 = false;
try {
  assert.deepEqual(auth.PUBLIC_SIGN_FIELDS.streams, parsed2.streams);
} catch { detected2 = true; }
console.log('mutation "stream field order changed" detected:', detected2);
