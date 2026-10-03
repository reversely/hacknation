import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@noor/contracts'],
  turbopack: { root: path.resolve(process.cwd(), '..') },
};
export default config;
