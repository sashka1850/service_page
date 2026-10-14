const $ = selector => document.querySelector(selector);
const fieldRoot = $('#fields');
let doc, csrf, role, revision, dirty = false;
const groups = [
  ['hero', 'Первый экран'], ['headings', 'Заголовки блоков'], ['services', 'Услуги'],
  ['team', 'Команда'], ['space', 'Фото сервиса'], ['process', 'Как мы работаем'], ['contacts', 'Контакты'],
];
let active = 'hero';
function element(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
function status(text) { $('#status').textContent = text; }
function changed() { dirty = true; status('Есть несохранённые изменения'); }
function field(parent, label, obj, key, multiline = false) {
  const wrap = element('label', null, 'field'), caption = element('span', label);
  const input = document.createElement(multiline ? 'textarea' : 'input');
  if (!multiline) input.type = key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text';
  input.value = obj[key] ?? '';
  input.addEventListener('input', () => { obj[key] = input.value; changed(); });
  wrap.append(caption, input); parent.append(wrap);
  return input;
}
function card(parent, title) { const box = element('div', null, 'card'); box.append(element('h3', title)); parent.append(box); return box; }
function action(parent, label, fn, cls = '') { const button = element('button', label, cls); button.type = 'button'; button.addEventListener('click', fn); parent.append(button); return button; }
function reorder(list, i, offset) { const j = i + offset; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; changed(); render(); }
function arrayActions(box, list, i) {
  const controls = element('div', null, 'card-actions');
  action(controls, '↑', () => reorder(list, i, -1)).disabled = i === 0;
  action(controls, '↓', () => reorder(list, i, 1)).disabled = i === list.length - 1;
  action(controls, 'Удалить', () => { if (!confirm('Удалить карточку из черновика?')) return; list.splice(i, 1); changed(); render(); }, 'danger');
  box.append(controls);
}
async function upload(blob, name) {
  const data = await new Promise(resolve => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob);
  });
  const response = await api('/media', 'POST', { name, type: blob.type, data });
  return response.path;
}
async function cropImage(file, size = [[640, 420], [360, 480]]) {
  const img = await createImageBitmap(file);
  const dialog = $('#crop');
  [$('#crop-desktop'), $('#crop-mobile')].forEach((canvas, i) => { [canvas.width, canvas.height] = size[i]; });
  const controls = ['desk-x', 'desk-y', 'mob-x', 'mob-y'].map(id => $('#' + id));
  controls.forEach(x => { x.value = '50'; });
  const draw = (canvas, x, y) => {
    const ctx = canvas.getContext('2d');
    const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
    const width = img.width * scale, height = img.height * scale;
    const dx = (canvas.width - width) * Number(x.value) / 100;
    const dy = (canvas.height - height) * Number(y.value) / 100;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, dx, dy, width, height);
  };
  const redraw = () => { draw($('#crop-desktop'), controls[0], controls[1]); draw($('#crop-mobile'), controls[2], controls[3]); };
  controls.forEach(x => x.oninput = redraw); redraw(); dialog.showModal();
  const result = await new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true }));
  if (result !== 'confirm') { img.close(); return null; }
  const blob = canvas => new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .84));
  const desktop = await blob($('#crop-desktop')), mobile = await blob($('#crop-mobile'));
  img.close();
  return { src: await upload(desktop, 'desktop.webp'), mobileSrc: await upload(mobile, 'mobile.webp') };
}
function mediaField(box, label, obj, key, mobileKey = null, video = false, size, whole = false) {
  const row = element('div', null, 'row'); row.append(element('strong', label));
  const preview = element('span', obj[key] || 'Файл не выбран', 'muted'); row.append(preview);
  if (!video && obj[key]) { const img = element('img'); img.src = './preview/' + obj[key].replace(/^\.\//, ''); img.alt = ''; row.append(img); }
  const input = element('input'); input.type = 'file'; input.accept = video ? 'video/mp4' : 'image/*'; input.hidden = true;
  action(row, video ? 'Загрузить MP4' : whole ? 'Загрузить целиком' : 'Загрузить и кадрировать', () => input.click()); row.append(input);
  input.addEventListener('change', async () => {
    const file = input.files[0]; if (!file) return;
    try {
      status('Обрабатываем файл…');
      if (video) {
        if (file.type !== 'video/mp4') throw Error('Нужен MP4');
        if (file.size > 40 * 1024 * 1024) throw Error('Видео должно быть не больше 40 МБ');
        obj[key] = await upload(file, 'video.mp4');
      } else if (whole) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw Error('Документ: JPG, PNG или WebP до 5 МБ');
        obj[key] = await upload(file, `certificate.${file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]}`);
        if (mobileKey) obj[mobileKey] = obj[key];
      } else {
        const frames = await cropImage(file, size);
        if (!frames) { status('Кадрирование отменено'); return; }
        obj[key] = frames.src;
        if (mobileKey) obj[mobileKey] = frames.mobileSrc;
      }
      changed(); render();
    } catch (error) { status(error.message); }
  });
  box.append(row);
}
function photoAlbum(box, photos, onFirstChanged = () => {}, type = 'space') {
  photos.forEach((photo, i) => {
    const row = card(box, `Фото ${i + 1}`);
    mediaField(row, photo.kind === 'certificate' ? 'Сертификат целиком' : 'Фотография', photo, 'src', 'mobileSrc', false, type === 'team' ? [[480, 600], [360, 450]] : undefined, photo.kind === 'certificate');
    field(row, 'Описание фото (alt)', photo, 'alt');
    const controls = element('div', null, 'card-actions');
    action(controls, '↑', () => { reorder(photos, i, -1); onFirstChanged(); }).disabled = !i;
    action(controls, '↓', () => { reorder(photos, i, 1); onFirstChanged(); }).disabled = i === photos.length - 1;
    action(controls, 'Удалить', () => { if (photos.length === 1) return status('Оставьте хотя бы одно фото'); photos.splice(i, 1); onFirstChanged(); changed(); render(); }, 'danger');
    row.append(controls);
  });
  action(box, '+ Добавить фото', () => { photos.push({ src: '', alt: '' }); changed(); render(); });
}
function render() {
  fieldRoot.replaceChildren();
  $('#section-title').textContent = groups.find(x => x[0] === active)[1];
  document.querySelectorAll('#sections button').forEach(button => button.classList.toggle('active', button.dataset.group === active));
  if (active === 'hero') {
    const box = card(fieldRoot, 'Первый экран');
    field(box, 'Надпись', doc.hero, 'eyebrow'); field(box, 'Заголовок', doc.hero, 'title', true);
    field(box, 'Описание', doc.hero, 'description', true);
    mediaField(box, 'Обложка', doc.config, 'heroPoster', 'heroPosterMobile', false, [[640, 360], [360, 640]]); mediaField(box, 'Фоновое видео', doc.config, 'heroVideo', null, true);
  }
  if (active === 'headings') Object.entries(doc.headings).forEach(([key, heading]) => {
    const box = card(fieldRoot, groups.find(x => x[0] === key)?.[1] || key);
    field(box, 'Заголовок', heading, 'title', true); field(box, 'Описание', heading, 'description', true);
  });
  if (active === 'services') {
    doc.services.forEach((service, i) => {
      const box = card(fieldRoot, `Услуга ${i + 1}`);
      field(box, 'Название', service, 'title');
      const editItems = (items, container) => {
        items.forEach((item, n) => {
          if (typeof item === 'string') {
            const holder = { value: item };
            field(container, `Пункт ${n + 1}`, holder, 'value').addEventListener('input', () => { items[n] = holder.value; });
          } else field(container, `Пункт ${n + 1}`, item, 'text');
          action(container, 'Удалить пункт', () => { items.splice(n, 1); changed(); render(); }, 'danger');
        });
        action(container, '+ Добавить пункт', () => { items.push('Новый пункт'); changed(); render(); });
      };
      if (service.columns) service.columns.forEach((column, n) => {
        const sub = card(box, `Колонка ${n + 1}`); field(sub, 'Название колонки', column, 'title'); editItems(column.items, sub);
      }); else editItems(service.items ||= [], box);
      arrayActions(box, doc.services, i);
    });
    action(fieldRoot, '+ Добавить услугу', () => { doc.services.push({ title: 'Новая услуга', items: ['Описание'], action: 'Записаться', target: '#contacts', icon: String(doc.services.length + 1).padStart(2, '0') }); changed(); render(); });
  }
  if (active === 'team') {
    doc.team.forEach((person, i) => {
      const box = card(fieldRoot, `Сотрудник ${i + 1}`);
      field(box, 'Имя', person, 'name'); field(box, 'Должность', person, 'role'); field(box, 'Описание', person, 'text', true);
      photoAlbum(box, person.photos, () => { person.image = person.photos[0]?.src || ''; }, 'team');
      if (person.photos[0]?.src !== person.image) person.image = person.photos[0]?.src || '';
      arrayActions(box, doc.team, i);
    });
    action(fieldRoot, '+ Добавить сотрудника', () => { doc.team.push({ name: '', role: '', text: '', image: '', photos: [{ src: '', alt: '', kind: 'portrait' }] }); changed(); render(); });
  }
  if (active === 'space') {
    doc.space.forEach((zone, i) => {
      const box = card(fieldRoot, `Зона ${i + 1}`);
      field(box, 'Заголовок', zone, 'title'); field(box, 'Описание', zone, 'text', true);
      photoAlbum(box, zone.photos); arrayActions(box, doc.space, i);
    });
    action(fieldRoot, '+ Добавить зону', () => { doc.space.push({ title: '', text: '', photos: [{ src: '', alt: '' }] }); changed(); render(); });
  }
  if (active === 'process') doc.process.forEach((step, i) => {
    const box = card(fieldRoot, `Шаг ${i + 1}`);
    field(box, 'Подпись в прогрессбаре', step, 'label'); field(box, 'Заголовок', step, 'title'); field(box, 'Описание', step, 'text', true);
    mediaField(box, 'Фото для ПК и телефона', step, 'image', 'mobileImage', false, [[640, 420], [360, 540]]);
  });
  if (active === 'contacts') {
    const box = card(fieldRoot, 'Контакты');
    for (const [key, label] of [['phone', 'Телефон для ссылки (+7…)'], ['phoneDisplay', 'Телефон на странице'], ['email', 'Почта'], ['city', 'Город'], ['street', 'Улица и дом']]) field(box, label, doc.config, key);
    const legal = card(fieldRoot, 'Реквизиты · проверьте перед публикацией');
    for (const [key, label] of [['businessName', 'Название ИП'], ['inn', 'ИНН'], ['ogrnip', 'ОГРНИП']]) field(legal, label, doc.config, key);
  }
}
async function api(path, method = 'GET', body) {
  const response = await fetch(`./api${path}`, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json', 'X-SCT-CSRF': csrf } : {}, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const error = Error(result.error || `HTTP ${response.status}`); error.status = response.status; throw error; }
  return result;
}
async function save() { status('Сохраняем черновик…'); const result = await api('/draft', 'POST', { content: doc, expectedRevision: revision }); revision = result.revision; dirty = false; status('Черновик сохранён'); }
async function ready() {
  try {
    const me = await api('/me'); csrf = me.csrf; role = me.role;
    $('#identity').textContent = `${me.name} · ${role === 'owner' ? 'владелец' : 'редактор'}`;
    $('#logout').hidden = false; $('#workspace').hidden = false; $('#publish').hidden = role !== 'owner';
    const draft = await api('/draft'); doc = draft.content; revision = draft.revision;
    groups.forEach(([key, title]) => { const b = action($('#sections'), title, () => { active = key; render(); }); b.dataset.group = key; });
    render(); status('Готово');
  } catch (error) {
    $('#login').hidden = false;
    if (error.status !== 401) {
      $('#login-note').textContent = 'Сервер входа на этом адресе пока не настроен. Обратитесь к владельцу сайта.';
      $('#login-link').hidden = true;
    }
  }
}
$('#save').onclick = () => save().catch(e => status(e.message));
$('#preview').onclick = async () => {
  const tab = window.open('', '_blank');
  try { if (dirty) await save(); tab.location = './preview/'; } catch (e) { tab?.close(); status(e.message); }
};
$('#publish').onclick = async () => {
  if (!confirm('Опубликовать текущий черновик на основном сайте?')) return;
  try { if (dirty) await save(); status('Публикуем…'); const result = await api('/publish', 'POST', {}); status(`Опубликовано: ${result.commit.slice(0, 7)}. Дождитесь обновления GitHub Pages.`); }
  catch (e) { status(e.message); }
};
$('#logout').onclick = async () => { await api('/logout', 'POST', {}); location.reload(); };
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
ready();
