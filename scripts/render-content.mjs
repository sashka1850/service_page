const escape = (value) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function renderServiceItem(item) {
  if (typeof item === 'string') return escape(item);
  const text = String(item.text || '');
  const emphasis = String(item.emphasis || '');
  const emphasisIndex = emphasis ? text.indexOf(emphasis) : -1;
  if (emphasisIndex < 0) return escape(text);
  return `${escape(text.slice(0, emphasisIndex))}<strong>${escape(emphasis)}</strong>${escape(text.slice(emphasisIndex + emphasis.length))}`;
}
function renderServiceDescription(service) {
  if (service.columns) {
    return `<div class="service-columns">${service.columns.map(column => `<div><h4>${escape(column.title)}</h4><ul>${column.items.map(item => `<li>${renderServiceItem(item)}</li>`).join('')}</ul></div>`).join('')}</div>`;
  }
  if (service.items) return `<ul>${service.items.map(item => `<li>${renderServiceItem(item)}</li>`).join('')}</ul>`;
  return `<p>${escape(service.text || '')}</p>`;
}
export const renderServices = (services) => services.map((s, i) => `<article class="service-card"><div class="service-card-head"><span class="card-number">${s.icon} /</span><button class="service-toggle" type="button" aria-expanded="false" aria-controls="service-panel-${i}" aria-label="Открыть описание: ${escape(s.title)}"></button></div><h3>${escape(s.title)}</h3><div class="service-details" id="service-panel-${i}" hidden>${renderServiceDescription(s)}${i === 0 ? `<a class="service-action button dark" href="${escape(s.target)}">${escape(s.action)}</a>` : `<button class="service-action button dark" type="button" data-book-callback>${escape(s.action)}</button>`}</div></article>`).join('');
export const renderTeam = (team) => team.map(s => `<article class="team-card"><img src="./assets/${escape(s.image)}" alt="Временное фото для карточки: ${escape(s.name)}" loading="lazy"><p class="team-role">${escape(s.role)}</p><h3>${escape(s.name)}</h3><p>${escape(s.text)}</p></article>`).join('');
