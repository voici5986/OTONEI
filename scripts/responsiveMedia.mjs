import { VIEWPORT_BREAKPOINTS } from '../src/config/responsive.mjs';

/** Expand the project's named md media features after CSS imports are loaded. */
export default function responsiveMedia(breakpoints = VIEWPORT_BREAKPOINTS) {
  const features = {
    '--viewport-md-up': `min-width: ${breakpoints.md}px`,
    '--viewport-md-down': `max-width: ${breakpoints.md}px`,
    '--viewport-md-below': `max-width: ${breakpoints.md - 1}px`,
    '--viewport-md-above': `min-width: ${breakpoints.md + 1}px`,
  };

  return {
    postcssPlugin: 'otonei-responsive-media',
    AtRule: {
      media(rule) {
        rule.params = rule.params.replace(/\(\s*(--viewport-[\w-]+)\s*\)/g, (_, name) => {
          if (!Object.hasOwn(features, name)) {
            throw rule.error(`Unknown responsive media feature: ${name}`);
          }
          return `(${features[name]})`;
        });
        const unknown = rule.params.match(/--viewport-[\w-]+/);
        if (unknown) {
          throw rule.error(`Unknown or invalid responsive media feature: ${unknown[0]}`);
        }
      },
    },
  };
}
