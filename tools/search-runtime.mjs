import { build } from 'esbuild';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';

const output = new URL('../site/search-runtime/', import.meta.url);
await mkdir(output, { recursive: true });
await build({
  stdin: { contents: `export { AutoConfig, AutoModel, AutoTokenizer, env } from '@huggingface/transformers';`,
    resolveDir: process.cwd(), sourcefile: 'search-runtime.mjs' },
  outfile: new URL('transformers.mjs', output).pathname,
  bundle: true, format: 'esm', platform: 'browser', minify: true,
});
for (const name of [
  'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.jspi.mjs', 'ort-wasm-simd-threaded.jspi.wasm',
]) {
  await copyFile(new URL(`../node_modules/onnxruntime-web/dist/${name}`, import.meta.url), new URL(name, output));
}
for (const [source, name] of [
  ['@huggingface/transformers/LICENSE', 'LICENSE-transformers.txt'],
  ['@huggingface/tokenizers/LICENSE', 'LICENSE-tokenizers.txt'],
  ['@huggingface/jinja/LICENSE', 'LICENSE-jinja.txt'],
  ['onnxruntime-web/README.md', 'README-onnxruntime.txt'],
]) {
  await copyFile(new URL(`../node_modules/${source}`, import.meta.url), new URL(name, output));
}
await writeFile(new URL('versions.json', output), JSON.stringify({
  transformers: JSON.parse(await readFile(new URL('../node_modules/@huggingface/transformers/package.json', import.meta.url))).version,
  onnxruntime: JSON.parse(await readFile(new URL('../node_modules/onnxruntime-web/package.json', import.meta.url))).version,
}));
await copyFile(new URL('./ONNX-LICENSE.txt', import.meta.url), new URL('LICENSE-onnxruntime.txt', output));
