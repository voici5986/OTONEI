const { execSync } = require('node:child_process');
const { version } = require('../package.json');

execSync('git add -A', { stdio: 'inherit' });

let hasStagedChanges = true;
try {
  execSync('git diff --cached --quiet', { stdio: 'inherit' });
  hasStagedChanges = false;
} catch {
  hasStagedChanges = true;
}

if (hasStagedChanges) {
  execSync(`git commit -m "chore(release): v${version}"`, {
    stdio: 'inherit',
  });
} else {
  console.log('No changes to commit. Skipping release commit.');
}
