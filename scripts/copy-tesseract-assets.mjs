import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = join(rootDir, 'public', 'vendor', 'tesseract');
const workerDir = join(vendorDir, 'dist');
const coreDir = join(vendorDir, 'core');
const langDir = join(vendorDir, 'lang');

const ensureCleanDirectory = (directory) => {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
};

ensureCleanDirectory(vendorDir);
mkdirSync(workerDir, { recursive: true });
mkdirSync(coreDir, { recursive: true });
mkdirSync(langDir, { recursive: true });

copyFileSync(
  join(rootDir, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
  join(workerDir, 'worker.min.js'),
);

const coreSourceDir = join(rootDir, 'node_modules', 'tesseract.js-core');
for (const filename of readdirSync(coreSourceDir)) {
  if (!filename.startsWith('tesseract-core')) {
    continue;
  }

  copyFileSync(join(coreSourceDir, filename), join(coreDir, filename));
}

const languageCandidates = [
  join(
    rootDir,
    'node_modules',
    '@tesseract.js-data',
    'eng',
    '4.0.0_best_int',
    'eng.traineddata.gz',
  ),
  join(
    rootDir,
    'node_modules',
    '@tesseract.js-data',
    'eng',
    '4.0.0',
    'eng.traineddata.gz',
  ),
];

const languageSource = languageCandidates.find(existsSync);
if (!languageSource) {
  throw new Error('Could not find a local English language file for Tesseract.');
}

copyFileSync(languageSource, join(langDir, 'eng.traineddata.gz'));

console.log('Prepared local Tesseract assets in public/vendor/tesseract.');
