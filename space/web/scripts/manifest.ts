// Writes the hashed bundle's file name to dist/manifest.json for app.py, and copies the site photos
// and the mascot's poses beside the bundle, where the page loads them relative to its own URL.
import { cpSync, readdirSync, writeFileSync } from 'node:fs';

const bundle = readdirSync('dist').find((f) => /^main-[a-z0-9]+\.js$/.test(f));
if (!bundle) throw new Error('No bundle in dist/');
writeFileSync('dist/manifest.json', bundle);
console.log(bundle);
cpSync('src/assets/photos', 'dist/photos', { recursive: true });
cpSync('src/assets/mascot', 'dist/mascot', { recursive: true });
