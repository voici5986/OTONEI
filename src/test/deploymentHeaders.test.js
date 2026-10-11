import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepoFile = (filePath) => readFileSync(resolve(process.cwd(), filePath), 'utf8');

describe('deployment security headers', () => {
  it('keeps the same CSP on Cloudflare and Nginx', () => {
    const cloudflare = readRepoFile('public/_headers').match(/Content-Security-Policy: (.+)/)?.[1];
    const nginx = readRepoFile('conf/security-headers.conf').match(
      /add_header Content-Security-Policy "(.+)" always;/
    )?.[1];

    expect(cloudflare).toBeTruthy();
    expect(nginx).toBe(cloudflare);
  });

  it('reapplies security headers in every Nginx location that defines add_header', () => {
    const nginx = readRepoFile('conf/nginx.conf');
    const locationsWithHeaders = [...nginx.matchAll(/location[^{]+{([\s\S]*?)\n    }/g)]
      .map((match) => match[1])
      .filter((body) => body.includes('add_header'));

    expect(locationsWithHeaders).toHaveLength(6);
    for (const location of locationsWithHeaders) {
      expect(location).toContain('include /etc/nginx/otonei-security-headers.conf;');
    }

    const sharedHeaders = readRepoFile('conf/security-headers.conf');
    expect(sharedHeaders).toContain('add_header Strict-Transport-Security');
    expect(readRepoFile('Dockerfile')).toContain(
      'COPY ./conf/security-headers.conf /etc/nginx/otonei-security-headers.conf'
    );
  });

  it('revalidates HTML while keeping hashed assets immutable', () => {
    const cloudflare = readRepoFile('public/_headers');
    expect(cloudflare).toMatch(/\n\/\r?\n\s+Cache-Control: no-cache/);
    expect(cloudflare).toMatch(/\/\*\.html\r?\n\s+Cache-Control: no-cache/);
    // Pages concatenates headers from overlapping rules. A global cache rule
    // would add no-cache to immutable assets and force needless revalidation.
    const blocks = cloudflare.trim().split(/\r?\n\s*\r?\n/);
    const assetPolicies = blocks
      .filter((block) => {
        const pattern = block.split(/\r?\n/)[0];
        const escaped = pattern
          .split('*')
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*');
        return new RegExp(`^${escaped}$`).test('/assets/app-hash.js');
      })
      .flatMap((block) => [...block.matchAll(/Cache-Control: (.+)/g)].map((match) => match[1]));
    expect(assetPolicies).toEqual(['public, max-age=31536000, immutable']);
    expect(cloudflare).toMatch(
      /\/assets\/\*\r?\n\s+Cache-Control: public, max-age=31536000, immutable/
    );
    const nginx = readRepoFile('conf/nginx.conf');
    expect(nginx).toMatch(/location \/ \{[^}]+Cache-Control "no-cache"/);
    expect(nginx).toMatch(/location \/assets\/ \{[^}]+immutable/);
  });
});
