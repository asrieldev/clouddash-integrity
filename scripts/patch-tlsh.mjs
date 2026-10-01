import { readFileSync, writeFileSync } from 'node:fs';
// tlsh 1.0.8 uses undeclared loop counters, which throw in browser strict mode.
const path = new URL('../node_modules/tlsh/lib/digests/digest-string-composer.js', import.meta.url);
const source = readFileSync(path, 'utf8');
const fixed = source.replace('for (k = 0;', 'for (var k = 0;').replace('for(i=0;', 'for(var i=0;');
if (!fixed.includes('for (var k = 0;') || !fixed.includes('for(var i=0;')) throw new Error('Unexpected TLSH source; review compatibility patch');
if (source !== fixed) writeFileSync(path, fixed);
