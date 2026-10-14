import http from 'node:http';
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { createHash, createSign, randomBytes } from 'node:crypto';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSite, renderData, renderPrivacy, validateContent } from '../scripts/content.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const drafts = resolve(process.env.SCT_DRAFT_DIR || join(root, 'var/editor'));
const repo = process.env.SCT_REPOSITORY || 'sashka1850/service_page';
const origin = (process.env.SCT_ADMIN_ORIGIN || 'http://localhost:8787').replace(/\/$/, '');
const ownerId = String(process.env.SCT_OWNER_ID || '');
const editorIds = new Set((process.env.SCT_EDITOR_IDS || '').split(',').map(s => s.trim()).filter(Boolean));
const sessions = new Map(), loginStates = new Map();
let draftQueue = Promise.resolve();
const html = 'text/html; charset=utf-8', json = 'application/json; charset=utf-8';
const safeName = name => /^[a-zA-Z0-9_-]{1,80}\.(webp|jpg|png|mp4)$/.test(name);
const cookie = (req, key) => (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(key + '='))?.slice(key.length + 1);
const role = id => String(id) === ownerId && ownerId ? 'owner' : editorIds.has(String(id)) ? 'editor' : null;
const send = (res, code, body, type = json, headers = {}) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const error = (res, code, message) => send(res, code, { error: message });
const base = path => path === '/petrovich' || path.startsWith('/petrovich/');
const urlOf = req => new URL(req.url, origin);
const sha = value => createHash('sha256').update(value).digest('base64url');
const token = () => randomBytes(32).toString('base64url');
const secure = origin.startsWith('https:') ? '; Secure' : '';
const auth = req => { const s = sessions.get(cookie(req, 'sct_admin')); return s && s.exp > Date.now() && role(s.id) ? { ...s, role: role(s.id) } : null; };
const readJson = async (req, limit = 65 * 1024 * 1024) => {
  let length = 0, chunks = [];
  for await (const chunk of req) { length += chunk.length; if (length > limit) throw Error('Слишком большой файл'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};
const current = async () => JSON.parse(await readFile(join(drafts, 'draft.json'), 'utf8').catch(() => readFile(join(root, 'content/site.json'), 'utf8')));
const template = () => readFile(join(root, 'index.template.html'), 'utf8');
const staticFile = async (res, path, dir) => {
  if (!/^(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+$/.test(path) || path.split('/').includes('..')) return error(res, 404, 'Не найдено');
  const mime = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4' }[extname(path)] || 'application/octet-stream';
  try { send(res, 200, await readFile(join(dir, path)), mime); } catch { error(res, 404, 'Не найдено'); }
};
async function github(path, options = {}) {
  const r = await fetch(`https://api.github.com${path}`, { ...options, headers: { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'sct-content-editor', ...options.headers } });
  const value = await r.json();
  if (!r.ok) throw Error(`GitHub ${r.status}: ${value.message || 'Ошибка API'}`);
  return value;
}
async function installationToken() {
  const key = process.env.SCT_GITHUB_PRIVATE_KEY_FILE
    ? await readFile(process.env.SCT_GITHUB_PRIVATE_KEY_FILE, 'utf8')
    : process.env.SCT_GITHUB_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!key || !process.env.SCT_GITHUB_APP_ID || !process.env.SCT_GITHUB_INSTALLATION_ID) throw Error('GitHub App не настроен');
  const now = Math.floor(Date.now() / 1000);
  const first = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const second = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: process.env.SCT_GITHUB_APP_ID })).toString('base64url');
  const signer = createSign('RSA-SHA256'); signer.update(`${first}.${second}`);
  const jwt = `${first}.${second}.${signer.sign(key).toString('base64url')}`;
  const result = await github(`/app/installations/${process.env.SCT_GITHUB_INSTALLATION_ID}/access_tokens`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` } });
  return result.token;
}
async function publish(content) {
  const key = await installationToken(), headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const api = (path, method, body) => github(`/repos/${repo}${path}`, { method, headers, body: body && JSON.stringify(body) });
  const ref = await api('/git/ref/heads/main', 'GET');
  const commit = await api(`/git/commits/${ref.object.sha}`, 'GET');
  for (const file of ['index.template.html', 'privacy.template.html', 'src/app.js', 'src/repair.js']) {
    const remote = await api(`/contents/${file}?ref=main`, 'GET');
    const local = await readFile(join(root, file));
    const digest = createHash('sha1').update(`blob ${local.length}\0`).update(local).digest('hex');
    if (remote.sha !== digest) throw Error(`Код ${file} изменился. Обновите сервер редактора перед публикацией.`);
  }
  const templateText = await template();
  const files = {
    'content/site.json': Buffer.from(JSON.stringify(content, null, 2) + '\n'),
    'src/data.js': Buffer.from(renderData(content)),
    'index.html': Buffer.from(renderSite(content, templateText)),
    'privacy.html': Buffer.from(renderPrivacy(content, await readFile(join(root, 'privacy.template.html'), 'utf8'))),
  };
  const data = renderData(content).replace(/^export /gm, '');
  const repair = (await readFile(join(root, 'src/repair.js'), 'utf8')).replace(/^export /gm, '');
  const app = repair + '\n' + (await readFile(join(root, 'src/app.js'), 'utf8')).replace(/^import .*?;\s*/gm, '');
  files['src/site.js'] = Buffer.from('// Generated by npm run build. Edit content/site.json and app.js instead.\n(() => {\n"use strict";\n' + data + '\n' + app + '\n})();\n');
  for (const name of await readdir(join(drafts, 'media')).catch(() => [])) {
    if (safeName(name)) files[`assets/editor/${name}`] = await readFile(join(drafts, 'media', name));
  }
  const tree = [];
  for (const [path, bytes] of Object.entries(files)) {
    const blob = await api('/git/blobs', 'POST', { content: bytes.toString('base64'), encoding: 'base64' });
    tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = await api('/git/trees', 'POST', { base_tree: commit.tree.sha, tree });
  const newCommit = await api('/git/commits', 'POST', { message: 'Publish site content from Petrovich editor', tree: newTree.sha, parents: [ref.object.sha] });
  await api('/git/refs/heads/main', 'PATCH', { sha: newCommit.sha, force: false });
  return newCommit.sha;
}

const server = http.createServer(async (req, res) => {
  try {
    const path = urlOf(req).pathname;
    if (!base(path)) return error(res, 404, 'Не найдено');
    if (path === '/petrovich') { res.writeHead(302, { Location: '/petrovich/' }); return res.end(); }
    if (path === '/petrovich/' && req.method === 'GET') return staticFile(res, 'index.html', join(root, 'petrovich'));
    if (/^\/petrovich\/(?:editor\.js|editor\.css)$/.test(path) && req.method === 'GET') return staticFile(res, path.split('/').pop(), join(root, 'petrovich'));
    if (path === '/petrovich/login') {
      if (!process.env.SCT_GITHUB_CLIENT_ID || !process.env.SCT_GITHUB_CLIENT_SECRET) return error(res, 503, 'Вход через GitHub пока не настроен');
      const state = token(), verifier = token(); loginStates.set(state, { verifier, exp: Date.now() + 600000 });
      const authorize = new URL('https://github.com/login/oauth/authorize');
      authorize.searchParams.set('client_id', process.env.SCT_GITHUB_CLIENT_ID);
      authorize.searchParams.set('redirect_uri', `${origin}/petrovich/callback`);
      authorize.searchParams.set('state', state);
      authorize.searchParams.set('code_challenge', sha(verifier)); authorize.searchParams.set('code_challenge_method', 'S256');
      res.writeHead(302, { Location: authorize.toString(), 'Set-Cookie': `sct_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/petrovich; Max-Age=600${secure}` }); return res.end();
    }
    if (path === '/petrovich/callback') {
      const params = urlOf(req).searchParams, state = params.get('state'), saved = loginStates.get(state);
      loginStates.delete(state);
      if (!saved || saved.exp < Date.now() || cookie(req, 'sct_oauth_state') !== state || !params.get('code')) return error(res, 403, 'Не удалось подтвердить вход');
      const response = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.SCT_GITHUB_CLIENT_ID, client_secret: process.env.SCT_GITHUB_CLIENT_SECRET, code: params.get('code'), redirect_uri: `${origin}/petrovich/callback`, code_verifier: saved.verifier }) });
      const access = await response.json(); if (!access.access_token) return error(res, 403, 'GitHub отклонил вход');
      const user = await github('/user', { headers: { Authorization: `Bearer ${access.access_token}` } });
      if (!role(user.id)) return error(res, 403, 'Вашему аккаунту не выдан доступ');
      const id = token(); sessions.set(id, { id: user.id, name: user.login, csrf: token(), exp: Date.now() + 8 * 60 * 60 * 1000 });
      res.writeHead(302, { Location: '/petrovich/', 'Set-Cookie': `sct_admin=${id}; HttpOnly; SameSite=Lax; Path=/petrovich; Max-Age=28800${secure}` }); return res.end();
    }
    const s = auth(req);
    if (!s) return error(res, 401, 'Требуется вход');
    if (path === '/petrovich/api/me') return send(res, 200, { name: s.name, role: s.role, csrf: s.csrf });
    if (path === '/petrovich/api/draft' && req.method === 'GET') {
      const content = await current(); return send(res, 200, { content, revision: sha(JSON.stringify(content)) });
    }
    if (path === '/petrovich/preview/' && req.method === 'GET') {
      const page = renderSite(await current(), await template());
      return send(res, 200, page.replace('<head>', '<head><base href="/petrovich/preview/">'), html, { 'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "frame-ancestors 'self'" });
    }
    if (path.startsWith('/petrovich/preview/') && req.method === 'GET') {
      const file = path.slice('/petrovich/preview/'.length);
      if (!/^(src\/(?:site\.js|styles\.css|contact-map\.css|process\.(?:css|js))|assets\/[a-zA-Z0-9_./-]+|privacy\.html)$/.test(file) || file.includes('..')) return error(res, 404, 'Не найдено');
      if (file === 'src/site.js') {
        const data = renderData(await current()).replace(/^export /gm, '');
        const repair = (await readFile(join(root, 'src/repair.js'), 'utf8')).replace(/^export /gm, '');
        const app = repair + '\n' + (await readFile(join(root, 'src/app.js'), 'utf8')).replace(/^import .*?;\s*/gm, '');
        return send(res, 200, `(() => {\n"use strict";\n${data}\n${app}\n})();`, 'text/javascript; charset=utf-8');
      }
      if (file === 'privacy.html') return send(res, 200, renderPrivacy(await current(), await readFile(join(root, 'privacy.template.html'), 'utf8')), html, { 'X-Robots-Tag': 'noindex, nofollow' });
      if (file.startsWith('assets/editor/')) {
        const name = file.slice('assets/editor/'.length);
        if (!safeName(name)) return error(res, 404, 'Не найдено');
        return staticFile(res, name, join(drafts, 'media'));
      }
      return staticFile(res, file, root);
    }
    if (path.startsWith('/petrovich/') && req.method === 'GET' && !path.startsWith('/petrovich/api/')) return staticFile(res, path.slice('/petrovich/'.length), join(root, 'petrovich'));
    if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['x-sct-csrf'] !== s.csrf) return error(res, 403, 'Неверный запрос');
    if (path === '/petrovich/api/logout') { sessions.delete(cookie(req, 'sct_admin')); return send(res, 200, { ok: true }, json, { 'Set-Cookie': `sct_admin=; HttpOnly; SameSite=Lax; Path=/petrovich; Max-Age=0${secure}` }); }
    if (path === '/petrovich/api/draft') {
      const request = await readJson(req, 1024 * 1024);
      const task = draftQueue.then(async () => {
        const existing = await current();
        if (request.expectedRevision !== sha(JSON.stringify(existing))) return null;
        const data = validateContent(request.content);
        await mkdir(drafts, { recursive: true }); const tmp = join(drafts, 'draft.json.tmp');
        await writeFile(tmp, JSON.stringify(data, null, 2) + '\n'); await rename(tmp, join(drafts, 'draft.json'));
        return sha(JSON.stringify(data));
      });
      draftQueue = task.catch(() => {});
      const revision = await task;
      return revision ? send(res, 200, { ok: true, revision }) : error(res, 409, 'Черновик изменён другим редактором. Обновите страницу перед сохранением.');
    }
    if (path === '/petrovich/api/media') {
      const { name, data, type } = await readJson(req);
      const ext = extname(String(name)).slice(1).toLowerCase();
      const types = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4' };
      if (!types[ext] || type !== types[ext] || typeof data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return error(res, 400, 'Неверный формат файла');
      const bytes = Buffer.from(data, 'base64');
      if (!bytes.length || bytes.length > (ext === 'mp4' ? 40 : 5) * 1024 * 1024) return error(res, 400, 'Слишком большой файл');
      if (ext === 'webp' && (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') || ext === 'png' && !bytes.subarray(0, 4).equals(Buffer.from([137, 80, 78, 71])) || ext === 'jpg' && !bytes.subarray(0, 2).equals(Buffer.from([255, 216])) || ext === 'mp4' && bytes.toString('ascii', 4, 8) !== 'ftyp') return error(res, 400, 'Содержимое файла не соответствует формату');
      const filename = `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
      await mkdir(join(drafts, 'media'), { recursive: true }); await writeFile(join(drafts, 'media', filename), bytes);
      return send(res, 200, { path: `./assets/editor/${filename}` });
    }
    if (path === '/petrovich/api/publish') {
      if (s.role !== 'owner') return error(res, 403, 'Публиковать может только владелец');
      const data = validateContent(await current());
      // Keep drafts until publishing is confirmed by GitHub; history lives in git.
      const sha = await publish(data);
      return send(res, 200, { ok: true, commit: sha });
    }
    return error(res, 404, 'Не найдено');
  } catch (e) { console.error('Admin error:', e.message); return error(res, 400, e.message); }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(Number(process.env.PORT || 8787), process.env.SCT_BIND_HOST || '127.0.0.1', () => console.log(`Petrovich editor listening on ${origin}`));
export { server, publish };
