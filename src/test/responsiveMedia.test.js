// @vitest-environment node
import path from 'node:path';
import { preprocessCSS, resolveConfig } from 'vite';
import responsiveMedia from '../../scripts/responsiveMedia.mjs';

const stylesheetPath = path.resolve('src/styles/responsive-test.css');
const configFor = (breakpoints) =>
  resolveConfig(
    { configFile: false, css: { postcss: { plugins: [responsiveMedia(breakpoints)] } } },
    'build'
  );

describe('responsive media features through Vite CSS processing', () => {
  let config;

  beforeAll(async () => {
    config = await configFor();
  });

  it('preserves all four existing inclusive and exclusive md boundaries', async () => {
    const source = ['up', 'down', 'below', 'above']
      .map(
        (direction) => `@media (--viewport-md-${direction}) { .${direction} { display: block; } }`
      )
      .join('\n');
    const { code } = await preprocessCSS(source, stylesheetPath, config);
    expect(code).toContain('(min-width: 768px)');
    expect(code).toContain('(max-width: 768px)');
    expect(code).toContain('(max-width: 767px)');
    expect(code).toContain('(min-width: 769px)');
    expect(code).not.toContain('--viewport-');
  });

  it('expands named features in combined queries without changing unrelated conditions', async () => {
    const source =
      '@media screen and (--viewport-md-up) and (max-width: 1024px) and (orientation: landscape) { .a { display: block; } }';
    const { code } = await preprocessCSS(source, stylesheetPath, config);
    expect(code).toContain(
      '@media screen and (min-width: 768px) and (max-width: 1024px) and (orientation: landscape)'
    );
  });

  it('processes named features in imported application stylesheets', async () => {
    const { code } = await preprocessCSS("@import './Orientation.css';", stylesheetPath, config);
    expect(code).toContain('(max-width: 767px)');
    expect(code).toContain('(min-width: 768px) and (max-width: 1024px)');
    expect(code).not.toContain('--viewport-');
    expect(code).not.toContain('@import');
  });

  it('derives every boundary from a changed md configuration', async () => {
    const changedConfig = await configFor({ md: 820 });
    const source =
      '@media (--viewport-md-up), (--viewport-md-down), (--viewport-md-below), (--viewport-md-above) { .a { display: block; } }';
    const { code } = await preprocessCSS(source, stylesheetPath, changedConfig);
    expect(code).toContain(
      '@media (min-width: 820px), (max-width: 820px), (max-width: 819px), (min-width: 821px)'
    );
  });

  it('fails CSS processing clearly for an unknown viewport feature', async () => {
    await expect(
      preprocessCSS(
        '@media (--viewport-md-typo) { .a { display: block; } }',
        stylesheetPath,
        config
      )
    ).rejects.toThrow('Unknown responsive media feature: --viewport-md-typo');
  });
});
