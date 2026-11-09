import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const source=await readFile(new URL('dist/server/index.js',root),'utf8');
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const response=await worker.fetch(new Request('https://pokeamor.local/catalog.json'),{},{});
assert.deepEqual(await response.json(),JSON.parse(await readFile(new URL('data/catalog.json',root),'utf8')),'Published catalog differs from source');
console.log('Published catalog matches source');
