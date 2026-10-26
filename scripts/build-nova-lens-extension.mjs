#!/usr/bin/env node
/** Package the existing Lens with Auction Desk's exact cost engine. */
import { mkdir, cp, copyFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = new URL('../', import.meta.url), dest = process.argv[2];
if (!dest || process.argv.length !== 3) throw new Error('Usage: node scripts/build-nova-lens-extension.mjs NEW-output-directory');
await mkdir(dest, { recursive: false });
await cp(new URL('apps/extension/', root), resolve(dest), { recursive: true });
await copyFile(new URL('apps/web/public/tools/auction-desk/core.mjs', root), resolve(dest, 'auction-core.mjs'));
const manifest = JSON.parse(await readFile(resolve(dest, 'manifest.json'), 'utf8'));
console.log(JSON.stringify({ directory: resolve(dest), version: manifest.version, network: 'Public BID13 only; explicit watch opt-in', costEngine: 'Existing Auction Desk v1.0.0' }));
