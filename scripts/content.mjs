const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const lines = value => esc(value).replace(/\n/g, '<br>');
const media = value => esc(value || '');
const num = n => String(n + 1).padStart(2, '0');

export function validateContent(c) {
  if (c?.version !== 1 || !c.hero || !c.config || !c.headings) throw Error('Неверная структура контента');
  const string = (v, limit = 1000) => typeof v === 'string' && v.length <= limit;
  const required = (v, label, limit) => { if (!string(v, limit) || !v.trim()) throw Error(`Заполните ${label}`); };
  const path = v => typeof v === 'string' && /^\.\/assets\/[a-zA-Z0-9_./-]+$/.test(v) && !v.includes('..');
  for (const key of ['eyebrow', 'title', 'description']) required(c.hero[key], `hero.${key}`, 1000);
  for (const [key, heading] of Object.entries(c.headings)) {
    required(heading.title, `${key}.title`, 240);
    if (!string(heading.description, 600)) throw Error(`Неверное описание ${key}`);
  }
  if (!Array.isArray(c.services) || !c.services.length || c.services.length > 30) throw Error('Неверное число услуг');
  if (!Array.isArray(c.team) || c.team.length > 30 || !Array.isArray(c.space) || !c.space.length || c.space.length > 30) throw Error('Неверное число карточек');
  if (!Array.isArray(c.process) || c.process.length !== 6) throw Error('Для прогрессбара требуется шесть этапов');
  if (!/^\+7\d{10}$/.test(c.config.phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.config.email)) throw Error('Проверьте контакты');
  for (const key of ['businessName', 'inn', 'ogrnip', 'city', 'street', 'phoneDisplay']) required(c.config[key], key, 200);
  if (!/^\d{12}$/.test(c.config.inn) || !/^\d{15}$/.test(c.config.ogrnip)) throw Error('Проверьте реквизиты');
  if (!path(c.config.heroPoster) || c.config.heroPosterMobile && !path(c.config.heroPosterMobile) || !path(c.config.heroVideo)) throw Error('Неверный путь к обложке или видео');
  for (const [group, entries] of [['team', c.team], ['space', c.space]]) entries.forEach((entry, i) => {
    required(entry.title ?? entry.name, `${group} ${i + 1}`, 160);
    required(entry.text, `${group} ${i + 1} описание`, 1000);
    if (group === 'team') { required(entry.role, 'должность', 160); if (!path(entry.image)) throw Error('Неверное фото сотрудника'); }
    if (!Array.isArray(entry.photos) || !entry.photos.length || entry.photos.length > 20) throw Error('У карточки должен быть фотоальбом');
    entry.photos.forEach(p => {
      if (p.src ? !path(p.src) : group !== 'team' || p.kind !== 'certificate') throw Error('Загрузите фотографию');
      if (p.mobileSrc && !path(p.mobileSrc)) throw Error('Неверный путь мобильного фото');
      if (!string(p.alt, 240)) throw Error('Неверное описание фотографии');
    });
  });
  c.process.forEach((step, i) => {
    for (const key of ['label', 'title', 'text']) required(step[key], `этап ${i + 1}`, 1000);
    if (!path(step.image) || !path(step.mobileImage)) throw Error('Неверное фото этапа');
  });
  c.services.forEach((s, i) => {
    required(s.title, `услуга ${i + 1}`, 160);
    if (!Array.isArray(s.items) && !Array.isArray(s.columns)) throw Error('Добавьте описание услуги');
    const groups = s.columns ? s.columns.map(column => { required(column.title, 'заголовок колонки', 160); return column.items; }) : [s.items];
    groups.forEach(items => {
      if (!Array.isArray(items) || items.length > 30) throw Error('Неверный список пунктов услуги');
      items.forEach(item => { if (typeof item === 'string') required(item, 'пункт услуги', 600); else required(item?.text, 'пункт услуги', 600); });
    });
  });
  return c;
}

export function renderSite(content, template) {
  const c = validateContent(content), { config: cfg } = c;
  const spaceCards = `<div class="space-grid">${c.space.map((card, i) => `<article class="space-card"><img src="${media(card.photos[0].src)}" loading="lazy" alt="${esc(card.photos[0].alt)}"><div><span>${num(i)}</span><h3>${esc(card.title)}</h3><p>${esc(card.text)}</p></div></article>`).join('')}</div>`;
  const slides = c.process.map((step, i) => `<article class="process-slide${i ? '' : ' is-current'}" aria-hidden="${i !== 0}"><picture><source media="(max-width: 640px)" srcset="${media(step.mobileImage)}"><img src="${media(step.image)}" alt="${esc(step.label)}" loading="lazy"></picture><div class="process-shade"></div><div class="process-copy"><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></div></article>`).join('');
  const steps = c.process.map((step, i) => `<button type="button" class="process-step" aria-label="Этап ${i + 1}: ${esc(step.label)}" aria-pressed="${i === 0}"><span class="process-track"><span></span></span><span class="process-label">${num(i)} / ${esc(step.label)}</span></button>`).join('');
  const player = `<div class="process-player">${slides}<div class="process-controls"><div class="process-stage" aria-live="off">01 / ${esc(c.process[0].label)}</div><div class="process-steps">${steps}</div></div></div>`;
  const address = `г. ${esc(cfg.city)}, ${esc(cfg.street)}`;
  const tel = `<a href="tel:${esc(cfg.phone)}">${esc(cfg.phoneDisplay)}</a>`;
  const email = `<a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>`;
  const legal = `${esc(cfg.businessName)}<br>ИНН ${esc(cfg.inn)} · ОГРНИП ${esc(cfg.ogrnip)}`;
  const map = `https://yandex.ru/map-widget/v1/?text=${encodeURIComponent(`г. ${cfg.city}, ${cfg.street}`)}&z=16`;
  const contacts = `<section id="contacts" class="contacts-section"><div class="container contacts-layout"><div class="contacts-info"><p class="eyebrow light">07 / До встречи в сервисе</p><h2>${lines(c.headings.contacts.title)}</h2><h3>${lines(c.headings.contacts.description)}</h3><p>Телефон: ${tel}<br>Электронная почта: ${email}<br>Адрес: ${address}</p><p>${legal}</p><button class="button primary" type="button" data-book-callback>Заказать звонок</button><p id="selected-service" aria-live="polite"></p></div><div class="contacts-map"><iframe src="${esc(map)}" title="Карта: Service Car Team, ${esc(cfg.street)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div><div class="contact-card legacy-contact-card" hidden><p></p><p id="contact-status"></p><div id="contact-actions"></div></div></div></section>`;
  const widget = `<div class="contact-widget" aria-label="Способы связи"><div class="contact-widget-list" id="contact-widget-list"><a href="tel:${esc(cfg.phone)}">Телефон</a><a href="mailto:${esc(cfg.email)}">Почта</a><button type="button" data-book-callback>Заказать звонок</button></div><button class="contact-widget-toggle" type="button" aria-expanded="false" aria-controls="contact-widget-list" aria-label="Способ связи"><svg viewBox="0 0 35 32" aria-hidden="true" focusable="false"><path d="M11.2667 12.6981H23.3667M11.2667 16.4717H23.3667M4.8104 23.5777C2.4311 21.1909 1 18.1215 1 14.7736C1 7.16679 8.38723 1 17.5 1C26.6128 1 34 7.16679 34 14.7736C34 22.3804 26.6128 28.5472 17.5 28.5472C15.6278 28.5472 13.8286 28.2868 12.1511 27.8072L12 27.7925L5.03333 31V23.8219L4.8104 23.5777Z" stroke="#ffffff" stroke-width="2" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></button></div>`;
  const footer = `<footer class="container footer"><a class="logo" href="#" aria-label="Service Car Team — главная"><img class="logo-main-mark" src="./assets/SCT-logo-black.svg" alt="SCT" loading="eager"></a><div class="footer-details"><p>© <span id="year"></span> Service Car Team</p><address>${legal}<br>${address}<br>${tel} · ${email}</address></div><a href="./privacy.html">Политика обработки персональных данных (редакция для согласования)</a><a href="#main">Наверх ↑</a></footer>`;
  const replacements = { 'space.cards': spaceCards, 'process.player': player, 'contacts.section': contacts, 'contacts.widget': widget, 'contacts.footer': footer, 'config.heroPoster': media(cfg.heroPoster), 'config.heroPosterMobile': cfg.heroPosterMobile ? `<source media="(max-width: 640px)" srcset="${media(cfg.heroPosterMobile)}">` : '', 'hero.eyebrow': esc(c.hero.eyebrow), 'hero.title': lines(c.hero.title), 'hero.description': lines(c.hero.description) };
  Object.entries(c.headings).forEach(([name, heading]) => { replacements[`headings.${name}.title`] = lines(heading.title); replacements[`headings.${name}.description`] = lines(heading.description); });
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => { if (!(key in replacements)) throw Error(`Неизвестное поле ${key}`); return replacements[key]; });
}

export function renderData(content) {
  const c = validateContent(content);
  const compact = value => JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
  const config = { ...c.config }; delete config.heroPoster; delete config.heroPosterMobile; delete config.phoneDisplay; delete config.businessName; delete config.inn; delete config.ogrnip; delete config.city; delete config.street;
  config.address = `${c.config.city}, ${c.config.street}`; config.house = '';
  const team = c.team.map(member => ({ ...member, image: member.image }));
  return `// Generated from content/site.json by npm run build.\nexport const config = ${compact(config)};\nexport const services = ${compact(c.services)};\nexport const team = ${compact(team)};\nexport const spaceAlbums = ${compact(c.space.map(card => card.photos))};\n`;
}

export function renderPrivacy(content, template) {
  const c = validateContent(content).config;
  const values = { businessName: c.businessName, inn: c.inn, ogrnip: c.ogrnip, phone: c.phone,
    phoneDisplay: c.phoneDisplay, email: c.email, address: `г. ${c.city}, ${c.street}` };
  return template.replace(/\{\{config\.([^}]+)\}\}/g, (_, key) => {
    if (!(key in values)) throw Error(`Неизвестное поле политики ${key}`);
    return esc(values[key]);
  });
}
