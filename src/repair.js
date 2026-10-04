export function searchWorks(works, classId, query) {
  const normalize = value => String(value).toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return works.filter(work => Number.isFinite(work.prices[classId]) && words.every(word => normalize(work.title).includes(word)));
}

export function initRepairCalculator({ apiRequest, openBooking, money }) {
  const $ = selector => document.querySelector(selector);
  const tabs = [...document.querySelectorAll('.calculator-tabs [role="tab"]')];
  const car = $('#repair-class'), input = $('#repair-work'), list = $('#repair-options');
  const status = $('#repair-status'), book = $('#repair-book'), retry = $('#repair-retry');
  let catalog = null, loading = null, selected = null, matches = [], focused = -1;
  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    focused = -1;
  }
  function updatePrice() {
    const price = selected?.prices[car.value];
    book.disabled = !Number.isFinite(price);
    $('#repair-price').textContent = book.disabled ? '—' : money(price);
    $('#repair-note').textContent = book.disabled ? 'Выберите класс автомобиля и работу'
      : `${car.selectedOptions[0].textContent} · ${selected.title} · без стоимости запчастей`;
  }
  function choose(work) {
    selected = work;
    input.value = work.title;
    close();
    status.textContent = '';
    updatePrice();
  }
  function show() {
    if (!catalog || !car.value) return;
    const all = searchWorks(catalog.works, car.value, selected ? '' : input.value);
    matches = all.slice(0, 50);
    focused = -1;
    input.removeAttribute('aria-activedescendant');
    list.replaceChildren();
    matches.forEach((work, i) => {
      const option = document.createElement('li');
      option.id = `repair-option-${i}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = work.title;
      option.addEventListener('mousedown', event => event.preventDefault());
      option.addEventListener('click', () => { choose(work); input.focus(); close(); });
      list.append(option);
    });
    list.hidden = !matches.length;
    input.setAttribute('aria-expanded', String(!!matches.length));
    status.textContent = !all.length ? 'Работы не найдены. Попробуйте другое название.'
      : all.length > 50 ? `Найдено: ${all.length}. Показаны первые 50 — уточните название.` : `Найдено работ: ${all.length}`;
  }
  async function load() {
    if (catalog || loading) return loading;
    status.textContent = 'Загружаем работы и цены…';
    retry.hidden = true;
    loading = (async () => {
      try {
        const result = await apiRequest({ action: 'repairCatalog' });
        if (!result.ok || !Array.isArray(result.classes) || !Array.isArray(result.works)) throw new Error(result.error || 'Не удалось загрузить работы');
        catalog = result;
        car.replaceChildren(new Option('Выберите класс авто', ''));
        result.classes.forEach(item => car.add(new Option(item.label, item.classId)));
        car.disabled = !result.classes.length || !result.works.length;
        if (result.hint) $('#repair-hint').textContent = result.hint;
        status.textContent = result.works.length ? '' : 'В таблице пока нет доступных работ.';
      } catch (error) {
        status.textContent = 'Не удалось загрузить работы. Попробуйте еще раз.';
        retry.hidden = false;
      } finally { loading = null; }
    })();
    return loading;
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        const active = t === tab;
        t.setAttribute('aria-selected', String(active));
        t.tabIndex = active ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !active;
      });
      close();
      if (tab.id === 'repair-tab') load();
    });
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - i];
      next.click(); next.focus();
    });
  });
  retry.addEventListener('click', load);
  car.addEventListener('change', () => {
    input.disabled = !car.value;
    if (!car.value || (selected && !Number.isFinite(selected.prices[car.value]))) { selected = null; input.value = ''; }
    close(); status.textContent = ''; updatePrice();
  });
  input.addEventListener('focus', show);
  input.addEventListener('click', show);
  input.addEventListener('input', () => { selected = null; updatePrice(); show(); });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); if (list.hidden) show();
      if (!matches.length) return;
      focused = (focused + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      [...list.children].forEach((option, i) => option.setAttribute('aria-selected', String(i === focused)));
      input.setAttribute('aria-activedescendant', list.children[focused].id);
      list.children[focused].scrollIntoView({ block: 'nearest' });
    }
    if (event.key === 'Enter' && !list.hidden) {
      event.preventDefault();
      if (focused >= 0) choose(matches[focused]);
      else if (matches.length === 1) choose(matches[0]);
    }
  });
  $('#repair-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!selected || book.disabled) return;
    openBooking({ kind: 'repair', workId: selected.workId, classId: car.value, expectedPrice: selected.prices[car.value] },
      `Ремонт · ${car.selectedOptions[0].textContent} · ${selected.title} · ${money(selected.prices[car.value])}`);
  });
}
