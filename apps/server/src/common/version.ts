import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface VersionInfo {
  name: string;
  version: string;
}

let cached: VersionInfo | null = null;

export function getVersion(): VersionInfo {
  if (cached) return cached;
  let dir = __dirname;
  for (let depth = 0; depth < 8 && dir !== dirname(dir); depth++) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === 'kithlink' && pkg.version) {
        cached = { name: pkg.name, version: pkg.version };
        return cached;
      }
    }
    dir = dirname(dir);
  }
  cached = { name: 'kithlink', version: '0.0.0-dev' };
  return cached;
}
