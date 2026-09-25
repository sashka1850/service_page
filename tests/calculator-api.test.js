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
  };
  const cache = new Map();
  const telegramMessages = [];
  const context = vm.createContext({
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => tables[name] && ({ getDataRange: () => ({ getValues: () => tables[name] }) }) }) },
    ContentService: { MimeType: { JAVASCRIPT: 'js', JSON: 'json', TEXT: 'text' }, createTextOutput: text => ({ setMimeType: mime => ({ text, mime }) }) },
    HtmlService: { XFrameOptionsMode: { ALLOWALL: 'allow' }, createHtmlOutput: html => ({ setXFrameOptionsMode: () => ({ html }) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => ({ TELEGRAM_BOT_TOKEN: 'fake-test-token', TELEGRAM_CHAT_ID: '1234' })[key] }) },
    UrlFetchApp: { fetch: (url, options) => {
      telegramMessages.push({ url, body: JSON.parse(options.payload) });
      return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' };
    } },
    console,
  });
  vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), context);
  return { context, tables, telegramMessages };
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
