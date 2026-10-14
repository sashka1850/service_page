import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderSite, renderData, renderPrivacy, validateContent } from '../scripts/content.mjs';
import { server } from '../server/admin.mjs';

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
