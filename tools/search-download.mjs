import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const modelArtifacts = JSON.parse(
  await readFile(new URL('../data/semantic-search.json', import.meta.url))).artifacts_sha256;
export async function verifyModel(directory) {
  const url = pathToFileURL(directory.endsWith('/') ? directory : directory + '/');
  for (const [file, expected] of Object.entries(modelArtifacts)) {
    const bytes = await readFile(new URL(file, url));
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`Model checksum mismatch: ${file}`);
  }
}
export async function downloadModel(config) {
  const directory = new URL(`../.cache/search-model/${config.revision}/`, import.meta.url);
  for (const [file, expected] of Object.entries(modelArtifacts)) {
    const path = new URL(file, directory);
    await mkdir(new URL('./', path), { recursive: true });
    let bytes;
    try { bytes = await readFile(path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!bytes || createHash('sha256').update(bytes).digest('hex') !== expected) {
      execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2',
        '--max-time', '180', `https://huggingface.co/${config.model}/resolve/${config.revision}/${file}`,
        '--output', path.pathname], { stdio: 'inherit' });
      bytes = await readFile(path);
    }
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`Model checksum mismatch: ${file}`);
  }
  return directory.pathname;
}
