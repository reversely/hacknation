// Writes the hashed bundle's file name to dist/manifest.json for app.py.
import { readdirSync, writeFileSync } from 'node:fs';

const bundle = readdirSync('dist').find((f) => /^main-[a-z0-9]+\.js$/.test(f));
if (!bundle) throw new Error('No bundle in dist/');
writeFileSync('dist/manifest.json', bundle);
console.log(bundle);
