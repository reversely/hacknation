import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@wren/contracts'],
  turbopack: { root: path.resolve(process.cwd(), '..') },
};
export default config;
