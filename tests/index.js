// Entry point for `node --test tests/`.
//
// Since Node 21 the test runner resolves a directory argument as a single
// file instead of searching it for test files (nodejs/node#64555, fixed in
// Node 26). Importing the test files here keeps that documented command
// working on Node 21-25 as well.
//
// Every file is still runnable on its own: `node --test tests/util.test.js`.
import './util.test.js';
import './crypto.test.js';
import './authority.test.js';
import './store.test.js';
