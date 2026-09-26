import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function makeApi() {
  const tables = {
    Лист1: [
      ['model_id', 'марка', 'модель', 'вариант_из_источника'],
      ['M001', 'Hyundai', 'Solaris', 'Solaris 1.4'],
      ['M002', 'Hyundai', 'Creta', 'Creta 2.0'],
      ['M003', 'Hyundai', 'Creta', 'Creta 2.0'],
    ],
    Лист2: [
      ['price_id', 'model_id', 'вид_ТО', 'итого_руб', 'статус'],
      ['P0001', 'M001', 'ТО 15 000', 16646, 'готово'],
      ['P0002', 'M001', 'ТО 30 000', '18 926,50', 'готово'],
      ['P0003', 'M001', 'ТО 45 000', 100, 'проверить'],
      ['P0004', 'M002', 'ТО 15 000', 200, 'готово'],
      ['P0005', 'M003', 'ТО 15 000', 300, 'готово'],
    ],
    Акции: [
      ['offer_id', 'название', 'цена_руб', 'активна', 'порядок'],
      ['O001', 'Диагностика двигателя', 2999, true, 2],
      ['O002', 'Диагностика ходовой', 999, false, 1],
      ['O003', 'Диагностика кондиционера', 3999, true, 1],
    ],
    Состав_акций: [
      ['offer_id', 'порядок', 'пункт'],
      ['O001', 2, 'Проверка ошибок'],
      ['O001', 1, 'Осмотр двигателя'],
      ['O003', 1, 'Проверка кондиционера'],
    ],
  };
  const cache = new Map();
  const telegramMessages = [];
  const telegram = { status: 200, ok: true, token: 'fake-test-token', chatId: '1234' };
  const context = vm.createContext({
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => tables[name] && ({ getDataRange: () => ({ getValues: () => tables[name].map(row => [...row]) }) }) }) },
    ContentService: { MimeType: { JAVASCRIPT: 'js', JSON: 'json', TEXT: 'text' }, createTextOutput: text => ({ setMimeType: mime => ({ text, mime }) }) },
    HtmlService: { XFrameOptionsMode: { ALLOWALL: 'allow' }, createHtmlOutput: html => ({ setXFrameOptionsMode: () => ({ html }) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => ({ TELEGRAM_BOT_TOKEN: telegram.token, TELEGRAM_CHAT_ID: telegram.chatId })[key] }) },
    UrlFetchApp: { fetch: (url, options) => {
      telegramMessages.push({ url, body: JSON.parse(options.payload) });
      return { getResponseCode: () => telegram.status, getContentText: () => JSON.stringify({ ok: telegram.ok }) };
    } },
    console,
  });
  vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), context);
  return { context, tables, telegramMessages, telegram };
}

test('only unique confirmed vehicles and their available TO types are offered', () => {
  const { context } = makeApi();
  const result = JSON.parse(context.doGet({ parameter: { action: 'catalog' } }).text);
  assert.equal(result.ok, true);
  assert.deepEqual([...result.models.map(v => v.modelId)], ['M001']);
  assert.deepEqual([...result.models[0].types], ['ТО 15 000', 'ТО 30 000']);
});

test('valid consent and quote deliver one Telegram lead without trusting a client price', () => {
  const { context, telegramMessages } = makeApi();
  const form = { action: 'lead', nonce: 'booking_123456789000_test', name: 'Анна',
    phone: '8 (999) 123-45-67', consent: 'yes', modelId: 'M001', type: 'ТО 15 000', priceId: 'P0001' };
  assert.match(context.doPost({ parameter: form }).html, /"ok":true/);
  assert.equal(telegramMessages.length, 1);
  assert.match(telegramMessages[0].body.text, /\+79991234567/);
  assert.match(telegramMessages[0].body.text, /16646 ₽/);
  context.doPost({ parameter: form });
  assert.equal(telegramMessages.length, 1);
});

test('invalid consent, phone and price ID never send a lead', () => {
  const { context, telegramMessages } = makeApi();
  const form = { action: 'lead', nonce: 'booking_123456789000_test', name: 'Анна',
    phone: '+79991234567', consent: 'yes', modelId: 'M001', type: 'ТО 15 000', priceId: 'P0001' };
  for (const overrides of [{ consent: '' }, { phone: '123' }, { priceId: 'P0002' }]) {
    assert.match(context.doPost({ parameter: { ...form, ...overrides } }).html, /"ok":false/);
  }
  assert.equal(telegramMessages.length, 0);
});

test('free-form car request is delivered without a selected price and rejects empty text', () => {
  const { context, telegramMessages } = makeApi();
  const form = { action: 'lead', kind: 'custom', nonce: 'booking_123456789030_test',
    name: 'Анна', phone: '+79991234567', consent: 'yes', request: 'Kia Rio, замена масла' };
  assert.match(context.doPost({ parameter: { ...form, request: '  ' } }).html, /INVALID_REQUEST/);
  assert.equal(telegramMessages.length, 0);
  assert.match(context.doPost({ parameter: form }).html, /"ok":true/);
  assert.match(telegramMessages[0].body.text, /Kia Rio, замена масла/);
  context.doPost({ parameter: form });
  assert.equal(telegramMessages.length, 1);
});

test('quote resolves ID and numeric price, rejects unconfirmed or ambiguous selections', () => {
  const { context } = makeApi();
  const request = (modelId, type) => JSON.parse(context.doGet({ parameter: { action: 'quote', modelId, type } }).text);
  assert.equal(request('M001', 'ТО 30 000').price, 18926.5);
  assert.equal(request('M001', 'ТО 30 000').priceId, 'P0002');
  assert.equal(request('M001', 'ТО 45 000').ok, false);
  assert.equal(request('M002', 'ТО 15 000').ok, false);
  assert.equal(request('M001', 'unknown').ok, false);
  assert.equal(context.doGet({ parameter: { action: 'catalog', callback: 'alert(1)' } }).text, 'Invalid callback');
});

test('promotions list only active rows, ordered with their current prices and contents', () => {
  const { context, tables } = makeApi();
  const offers = () => JSON.parse(context.doGet({ parameter: { action: 'offers' } }).text).offers;
  assert.deepEqual([...offers().map(row => row.offerId)], ['O003', 'O001']);
  assert.deepEqual([...offers()[1].items], ['Осмотр двигателя', 'Проверка ошибок']);
  tables.Акции.push(['O004', 'Замена масла', 1200, true, 3]);
  assert.equal(offers().length, 2); // Public list is cached briefly.
});

test('missing promotion sheet or header is named in the API response', () => {
  const { context, tables } = makeApi();
  const get = () => JSON.parse(context.doGet({ parameter: { action: 'offers' } }).text);
  delete tables.Состав_акций;
  assert.equal(get().error, 'Не найден лист: Состав_акций');
  tables.Состав_акций = [['offer_id', 'порядок', 'пункт']];
  tables.Акции[0][3] = 'активность';
  assert.equal(get().error, 'Не найден столбец: активна');
});

test('promotion lead checks current activation and price before sending', () => {
  const { context, tables, telegramMessages } = makeApi();
  const submit = (overrides = {}) => JSON.parse(context.doPost({ parameter: {
    action: 'lead', kind: 'offer', nonce: 'booking_123456789000_test',
    name: 'Анна', phone: '+79991234567', consent: 'yes', offerId: 'O001', expectedPrice: '2999',
    ...overrides,
  } }).html.match(/postMessage\((\{.*?\}),"\*"\)/)[1]);
  tables.Акции[1][2] = 3199;
  assert.equal(submit().code, 'PRICE_CHANGED');
  assert.equal(telegramMessages.length, 0);
  assert.equal(submit({ expectedPrice: '3199' }).ok, true);
  assert.match(telegramMessages[0].body.text, /Диагностика двигателя/);
  assert.match(telegramMessages[0].body.text, /3199 ₽/);
  tables.Акции[1][3] = false;
  assert.equal(submit({ nonce: 'booking_123456789001_test', expectedPrice: '3199' }).code, 'OFFER_UNAVAILABLE');
  assert.equal(telegramMessages.length, 1);
});

test('Telegram configuration and delivery errors return diagnostic codes without credentials', () => {
  const { context, telegram } = makeApi();
  const lead = nonce => JSON.parse(context.doPost({ parameter: {
    action: 'lead', kind: 'offer', nonce, name: 'Анна', phone: '+79991234567',
    consent: 'yes', offerId: 'O001', expectedPrice: '2999',
  } }).html.match(/postMessage\((\{.*?\}),"\*"\)/)[1]);
  telegram.chatId = '';
  assert.equal(lead('booking_123456789010_test').code, 'TELEGRAM_NOT_CONFIGURED');
  telegram.chatId = '1234';
  telegram.status = 401;
  assert.equal(lead('booking_123456789011_test').code, 'TELEGRAM_BAD_TOKEN');
  telegram.status = 400;
  assert.equal(lead('booking_123456789012_test').code, 'TELEGRAM_BAD_CHAT');
});

test('version endpoint and rejected lead always expose a safe diagnostic code', () => {
  const { context } = makeApi();
  const version = JSON.parse(context.doGet({ parameter: { action: 'version' } }).text);
  assert.equal(version.version, '2026-09-26.2');
  const html = context.doPost({ parameter: { action: 'lead', nonce: 'booking_123456789020_test' } }).html;
  assert.match(html, /"code":"INVALID_FORM"/);
  assert.match(html, /"version":"2026-09-26.2"/);
});

test('lead status confirms delivery by nonce without exposing customer details', () => {
  const { context } = makeApi();
  const nonce = 'booking_123456789099_test';
  const status = value => JSON.parse(context.doGet({ parameter: { action: 'leadStatus', nonce: value } }).text);
  assert.equal(status(nonce).status, 'pending');
  assert.equal(status('invalid').ok, false);
  context.doPost({ parameter: { action: 'lead', kind: 'offer', nonce,
    name: 'Анна', phone: '+79991234567', consent: 'yes', offerId: 'O001', expectedPrice: '2999' } });
  const result = status(nonce);
  assert.equal(result.status, 'sent');
  assert.equal(JSON.stringify(result).includes('Анна'), false);
});
