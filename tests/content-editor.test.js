import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { renderSite, renderData, renderPrivacy, validateContent } from '../scripts/content.mjs';
import { server, publish } from '../server/admin.mjs';

const original = JSON.parse(await readFile(new URL('../content/site.json', import.meta.url)));
const template = await readFile(new URL('../index.template.html', import.meta.url), 'utf8');
const privacyTemplate = await readFile(new URL('../privacy.template.html', import.meta.url), 'utf8');
const copy = () => structuredClone(original);

test('published content updates cards, contacts, both mobile and desktop media and preserves booking hooks', () => {
  const content = copy();
  content.team.push({ name: 'Новый мастер', role: 'Мастер', text: 'Описание', image: './assets/timofey.jpg', photos: [{ src: './assets/timofey.jpg', mobileSrc: './assets/vadim.jpg', alt: 'Портрет' }] });
  content.space[0].photos[0].mobileSrc = './assets/lounge.jpg';
  content.config.heroPosterMobile = './assets/lounge.jpg';
  content.config.phone = '+79101234567'; content.config.phoneDisplay = '8 (910) 123-45-67';
  content.headings.services.description = 'Описание всех услуг';
  const html = renderSite(content, template), data = renderData(content);
  const privacy = renderPrivacy(content, privacyTemplate);
  assert.match(html, /href="tel:\+79101234567"/);
  assert.match(html, /srcset="\.\/assets\/lounge.jpg"/);
  assert.match(html, /id="calculator-form"/);
  assert.match(html, /data-book-callback/);
  assert.match(html, /Описание всех услуг/);
  assert.match(privacy, /tel:\+79101234567/);
  assert.match(data, /Новый мастер/);
  assert.match(data, /mobileSrc/);
});

test('editor text is escaped, bad media paths and wrong process lengths are rejected', () => {
  const content = copy(); content.hero.title = '<script>alert(1)</script>';
  assert.match(renderSite(content, template), /&lt;script&gt;/);
  content.config.heroPoster = 'https://example.com/x.jpg';
  assert.throws(() => validateContent(content), /Неверный путь/);
  content.config.heroPoster = './assets/hero.jpg'; content.process.pop();
  assert.throws(() => validateContent(content), /шесть этапов/);
});

test('draft and publish API cannot be accessed without a session', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    for (const [path, method] of [['/petrovich/api/draft', 'GET'], ['/petrovich/api/publish', 'POST'], ['/petrovich/preview/', 'GET']]) {
      const res = await fetch(url + path, { method }); assert.equal(res.status, 401);
    }
    const page = await fetch(url + '/petrovich/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Вход в редактор/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('publication writes a complete static site commit and advances main only after preparing all files', async () => {
  const previousFetch = globalThis.fetch;
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = ['SCT_GITHUB_PRIVATE_KEY', 'SCT_GITHUB_APP_ID', 'SCT_GITHUB_INSTALLATION_ID'].map(key => [key, process.env[key]]);
  process.env.SCT_GITHUB_PRIVATE_KEY = privateKey.export({ format: 'pem', type: 'pkcs8' });
  process.env.SCT_GITHUB_APP_ID = '123'; process.env.SCT_GITHUB_INSTALLATION_ID = '456';
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname; calls.push({ path, method: options.method || 'GET', body: options.body && JSON.parse(options.body) });
    const ok = value => Response.json(value);
    if (path.endsWith('/access_tokens')) return ok({ token: 'installation-token' });
    if (path.endsWith('/git/ref/heads/main')) return ok({ object: { sha: 'before' } });
    if (path.endsWith('/git/commits/before')) return ok({ tree: { sha: 'before-tree' } });
    if (path.includes('/contents/')) {
      const file = decodeURIComponent(path.split('/contents/')[1]);
      const bytes = await readFile(new URL(`../${file}`, import.meta.url));
      return ok({ sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') });
    }
    if (path.endsWith('/git/blobs')) return ok({ sha: `blob-${calls.length}` });
    if (path.endsWith('/git/trees')) return ok({ sha: 'new-tree' });
    if (path.endsWith('/git/commits')) return ok({ sha: 'new-commit' });
    if (path.endsWith('/git/refs/heads/main')) return ok({ ok: true });
    throw Error(`Unexpected GitHub request ${path}`);
  };
  try {
    assert.equal(await publish(copy()), 'new-commit');
    const tree = calls.find(call => call.path.endsWith('/git/trees'));
    assert.deepEqual(tree.body.tree.map(item => item.path).sort(), ['content/site.json', 'index.html', 'privacy.html', 'src/data.js', 'src/site.js']);
    assert.equal(tree.body.base_tree, 'before-tree');
    const commit = calls.find(call => call.path.endsWith('/git/commits') && call.method === 'POST');
    assert.deepEqual(commit.body.parents, ['before']);
    const update = calls.at(-1);
    assert.equal(update.method, 'PATCH'); assert.equal(update.body.force, false);
  } finally {
    globalThis.fetch = previousFetch;
    env.forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  }
});
