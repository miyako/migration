import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { loadEncoder } from '../tools/search-encoder.mjs';
import { downloadModel, modelArtifacts } from '../tools/search-download.mjs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('data/semantic-search.json', root)));
const localPath = process.env.SEARCH_MODEL_PATH ?? await downloadModel(config);
const local = new URL(`file://${localPath.endsWith('/') ? localPath : localPath + '/'}`);
const server = createServer(async (request, response) => {
  try {
    if (request.url.startsWith(`/models/${config.revision}/`)) {
      const file = request.url.split(`/models/${config.revision}/`)[1];
      assert.ok(Object.hasOwn(modelArtifacts,file));
      const bytes = await readFile(new URL(file, local));
      assert.equal(createHash('sha256').update(bytes).digest('hex'),modelArtifacts[file]);
      response.setHeader('Access-Control-Allow-Origin','*');
      response.setHeader('Access-Control-Expose-Headers','Content-Range,Content-Length');
      if (request.headers.range === 'bytes=0-0') {
        response.setHeader('Content-Range',`bytes 0-0/${bytes.length}`);
        response.writeHead(206); response.end(bytes.subarray(0,1)); return;
      }
      response.end(bytes); return;
    }
    if (!request.url.startsWith('/migration/')) { response.writeHead(404).end(); return; }
    const path = request.url.slice('/migration/'.length).split('?')[0] || 'index.html';
    if (path.includes('..')) { response.writeHead(403).end(); return; }
    const bytes = await readFile(new URL(`_site/${path}`, root));
    response.setHeader('Content-Type', path.endsWith('.mjs') ? 'text/javascript' :
      path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.html') ? 'text/html' :
      path.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.setHeader('Cache-Control', path.startsWith('assets/') ? 'max-age=600' : 'no-cache');
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
}).listen(0, '127.0.0.1');
await new Promise(resolve => server.on('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const report = { model:config.model, revision:config.revision, backend:'webgpu', precision:'q4', network:[], parity:[] };
let browser, memoryTimer;
const waitState = async (page, expected, timeout = 180000) => {
  await page.waitForFunction(expected => {
    const status = document.querySelector('#meaning-status');
    if (status?.dataset.state === 'error') throw new Error(status.textContent);
    return status?.dataset.state === expected;
  }, expected, { timeout });
};
try {
  browser = await chromium.launch({
    executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true,
    dumpio:process.env.SEARCH_DEBUG === '1',
  });
  const cdp = await browser.newBrowserCDPSession();
  let peak = 0;
  memoryTimer = setInterval(async () => {
    if (!browser.isConnected()) return;
    try {
    const {processInfo} = await cdp.send('SystemInfo.getProcessInfo');
    const rows = execFileSync('ps', ['-o','rss=','-p',processInfo.map(p => p.id).join(',')], {encoding:'utf8'})
      .trim().split('\n').map(Number);
    peak = Math.max(peak, rows.reduce((sum,value) => sum+value,0));
    } catch(error) {console.error('Memory measurement unavailable',String(error));}
  }, 1000);
  const context = await browser.newContext();
  const requests = [];
  context.on('request', request => {
    const url = new URL(request.url());
    if (!url.origin.startsWith(origin)) {
      requests.push({method:request.method(),host:url.host,path:url.pathname});
      assert.equal(request.method(), 'GET');
      assert.equal(request.postData(), null);
      assert.ok((url.host === 'huggingface.co' &&
        (url.pathname.startsWith(`/${config.model}/resolve/${config.revision}/`) ||
         url.pathname.startsWith(`/api/resolve-cache/models/${config.model}/${config.revision}/`))) ||
        (url.host === 'us.aws.cdn.hf.co' && url.pathname.startsWith('/xet-bridge-us/')),
      `Unexpected external service: ${url.host}${url.pathname}`);
    }
  });
  if (process.env.SEARCH_BROWSER_LOCAL === '1') {
    await context.route('https://huggingface.co/**', async route => {
      const request = new URL(route.request().url());
      const marker = `/resolve/${config.revision}/`;
      const file = request.pathname.split(marker)[1];
      assert.ok(file && Object.hasOwn(modelArtifacts,file), `Unexpected model download: ${request.pathname}`);
      await route.fulfill({status:302,body:'',
        headers:{location:`${origin}/models/${config.revision}/${file}`,'Access-Control-Allow-Origin':'*'}});
    });
  }
  const page = await context.newPage();
  if (process.env.SEARCH_DEBUG === '1') {
    page.on('console',message => console.error('BROWSER',message.text().slice(0,400)));
    page.on('worker',worker => {
      console.error('WORKER',worker.url());
      worker.on('close',() => console.error('WORKER closed'));
    });
    context.on('request', request => console.error('GET',new URL(request.url()).pathname));
  }
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`${origin}/migration/`);
  await page.waitForSelector('[data-change-id]');
  assert.equal(requests.length,0,'No external requests before opt-in');
  const start = Date.now();
  await page.locator('#meaning-enable').check();
  await waitState(page,'ready');
  report.load_ms = Date.now()-start;
  console.error('Model loaded', report.load_ms);
  report.browser = await browser.version();
  const app = await page.locator('script[src]').getAttribute('src');
  const workerUrl = new URL(app,`${origin}/migration/`).href.replace('/app.mjs','/search-worker.mjs');
  const encoder = await loadEncoder(config,{localPath});
  try {
    for (const [language,query] of [
      ['en','I need to replace the scripting interpreter that was bundled with 4D'],
      ['fr','BASE64 DECODER'],
      ['de','Wie kann ich alte XML Transformationen ersetzen?'],
      ['es','El cliente de un proyecto y el servidor están en el mismo equipo, pero ya no aparecen los complementos que antes se copiaban desde el servidor.'],
      ['ja','DISABLE BUTTONでボタンを操作不能にする古い処理が、コンパイルできるのに実行時エラーになります。有効状態の切り替えは何に移しますか？'],
    ]) {
      await page.locator('#language').selectOption(language);
      const beforeQuery = requests.length;
      const queryStart = Date.now();
      await page.locator('#search').fill(query);
      await waitState(page,'ready');
      if (!report.first_query_ui_ms) {
        report.first_query_ui_ms = Date.now()-queryStart;
        await page.locator('#search').fill('');
        const warmStart = Date.now();
        await page.locator('#search').fill(query);
        await waitState(page,'ready');
        report.warm_query_ui_ms = Date.now()-warmStart;
      }
      assert.equal(requests.length,beforeQuery,'Query inference must not request any external service');
      assert.ok(await page.locator('[data-change-id]').count(),language);
      if (!report.approx_single_model_chrome_rss_mb) report.approx_single_model_chrome_rss_mb = peak/1024;
      const result = await page.evaluate(async ({workerUrl,config,language,query}) => {
        const catalog = await (await fetch(new URL('./data/catalog.json',workerUrl))).json();
        const {corpusRows} = await import(new URL('./semantic.mjs',workerUrl));
        const worker = new Worker(workerUrl,{type:'module'});
        return new Promise((resolve,reject) => {
          const timeout = setTimeout(() => {worker.terminate();reject(new Error('Parity worker timed out'));},90000);
          worker.onmessage = ({data}) => {
            if (data.type === 'ready') worker.postMessage({type:'search',sequence:1,language,query,
              rows:corpusRows(catalog,language)});
            if (data.type === 'results') {clearTimeout(timeout);worker.terminate();resolve(data);}
            if (data.type === 'error') {clearTimeout(timeout);worker.terminate();reject(new Error(data.error));}
          };
          worker.onerror = event => {worker.terminate();reject(new Error(event.message));};
          worker.postMessage({type:'load',config});
        });
      }, {workerUrl,config,language,query});
      const cpu = await encoder.encode(config.query_prefix+query);
      const maxAbsolute = Math.max(...cpu.map((value,index) => Math.abs(value-result.vector[index])));
      const cosine = cpu.reduce((sum,value,index) => sum+value*result.vector[index],0);
      assert.ok(cosine > .9999 && maxAbsolute < .001, `CPU/WebGPU parity ${cosine}, ${maxAbsolute}`);
      report.parity.push({language,query,cosine,max_absolute:maxAbsolute,query_ms:result.elapsed});
      console.error('Parity',language,cosine,maxAbsolute);
    }
  } finally {await encoder.dispose();}
  await page.locator('#language').selectOption('en');
  await page.locator('#search').fill('PHP');
  await waitState(page,'ready');
  for (const [source,target] of [['v17','v18'],['v21','latest'],['v21','v21'],['v16','v21']]) {
    await page.locator('#target-version').selectOption('latest');
    await page.locator('#source-version').selectOption(source);
    await page.locator('#target-version').selectOption(target);
    for (const sort of ['severity','complexity']) {
      await page.locator('#sort').selectOption(sort);
      const actual = await page.locator('[data-change-id]').evaluateAll(cards => cards.map(c => c.dataset.changeId));
      const allowed = await page.evaluate(async ({workerUrl,source,target,sort}) => {
        const catalog = await (await fetch(new URL('./data/catalog.json',workerUrl))).json();
        const {filterChanges,projectChangeForPath} = await import(new URL('./logic.mjs',workerUrl));
        return filterChanges(catalog.changes.map(c => projectChangeForPath(c,catalog.sources,source,target,catalog.latest))
          .filter(Boolean),{source,target,sort},catalog.latest).map(c => c.id);
      },{workerUrl,source,target,sort});
      assert.deepEqual(actual,allowed.filter(id => actual.includes(id)),'Semantic matches respect path and selected sort');
    }
  }
  const lexicalAfterDisable = async () => {
    await page.locator('#meaning-cancel').click();
    assert.equal(await page.locator('#meaning-status').getAttribute('data-state'),'off');
    return page.locator('[data-change-id]').evaluateAll(cards => cards.map(c => c.dataset.changeId));
  };
  const first = await lexicalAfterDisable();
  await page.locator('#meaning-enable').check();
  await waitState(page,'ready');
  await page.locator('#search').fill('PHP');
  await waitState(page,'ready');
  await page.locator('#meaning-cancel').click();
  await page.route('**/data/search/manifest.json', route => route.fulfill({
    contentType:'application/json',body:JSON.stringify({model:'stale'}),
  }));
  await page.locator('#meaning-enable').check();
  await page.waitForFunction(() => document.querySelector('#meaning-status')?.dataset.state === 'error');
  assert.match(await page.locator('#meaning-status').textContent(),/retry|réessayez|erneut|reintente|再試行/);
  assert.ok(await page.locator('[data-change-id]').count(),'Explicit failure retains keyword matches');
  await page.unroute('**/data/search/manifest.json');
  const unsupported = await browser.newContext();
  await unsupported.addInitScript(() => Object.defineProperty(navigator,'gpu',{value:undefined}));
  const up = await unsupported.newPage();
  await up.goto(`${origin}/migration/`);
  await up.waitForSelector('[data-change-id]');
  await up.locator('#meaning-enable').check();
  await waitState(up,'unavailable');
  assert.ok(await up.locator('[data-change-id]').count());
  await unsupported.close();
  assert.deepEqual(await lexicalAfterDisable(),first);
  await page.locator('#meaning-enable').check();
  await waitState(page,'ready');
  await page.locator('[data-group="platforms"][data-select="none"]').click();
  assert.equal(await page.locator('[data-change-id]').count(),0);
  await page.locator('#reset').click();
  assert.equal(await page.locator('#search').inputValue(),'');
  assert.equal(await page.locator('[data-change-id]').count(),190);
  for (const theme of ['light','dark']) {
    await page.locator('#theme').selectOption(theme);
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  // Cancel kills the dedicated worker, including in-flight inference and downloads.
  await page.locator('#meaning-cancel').click();
  await page.locator('#meaning-enable').check();
  await page.locator('#meaning-cancel').click();
  assert.equal(await page.locator('#meaning-status').getAttribute('data-state'),'off');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#meaning-status').getAttribute('data-state'),'off');
  assert.deepEqual(errors,[]);
  report.network = [...new Map(requests.map(r => [r.host+r.path,r])).values()];
  report.approx_peak_chrome_tree_rss_mb = peak/1024;
  report.cache_entries = await page.evaluate(async () => {
    const result = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) result.push(new URL(request.url).pathname);
    }
    return result.filter(path => path.includes('embeddinggemma'));
  });
  // Cached model reloading is tested with public network blocked, not called fully offline:
  // Pages HTML/runtime retention is not promised by this app.
  await context.unroute('https://huggingface.co/**');
  await context.route('https://huggingface.co/**', route => route.abort('internetdisconnected'));
  await page.locator('#meaning-enable').check();
  const warmStart = Date.now();
  await waitState(page,'ready');
  report.cached_model_load_ms = Date.now()-warmStart;
  await page.locator('#search').fill('PHP');
  await waitState(page,'ready');
  await context.close();
  try {
    const wk = await webkit.launch({headless:true,
      executablePath:process.env.WEBKIT_EXECUTABLE_PATH});
    const wp = await wk.newPage();
    await wp.goto(`${origin}/migration/`);
    await wp.waitForSelector('[data-change-id]');
    await wp.locator('#meaning-enable').check();
    await wp.waitForFunction(() => ['ready','unavailable','error'].includes(
      document.querySelector('#meaning-status')?.dataset.state),null,{timeout:180000});
    report.webkit = {version:wk.version(),state:await wp.locator('#meaning-status').getAttribute('data-state'),
      status:await wp.locator('#meaning-status').textContent()};
    await wk.close();
  } catch(error) { report.webkit = {unavailable:String(error).split('\n')[0]}; }
  console.log(JSON.stringify(report,null,2));
} catch(error) {
  console.error('SEMANTIC BROWSER FAILURE',error);
  throw error;
} finally {
  clearInterval(memoryTimer);
  await browser?.close();
  server.close();
}
