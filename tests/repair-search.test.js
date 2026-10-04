import test from 'node:test';
import assert from 'node:assert/strict';
import { searchWorks } from '../src/repair.js';
const works = [
  { workId: 'W001', title: 'Стойка стабилизатора передняя — с/у', prices: { sedan: 1500, suv: 2000 } },
  { workId: 'W002', title: 'Колёса — балансировка', prices: { suv: 1000 } },
];
test('search matches all word fragments in any order, ignoring case and ё', () => {
  assert.equal(searchWorks(works, 'sedan', 'СТАБ стой')[0].workId, 'W001');
  assert.equal(searchWorks(works, 'suv', 'колеса')[0].workId, 'W002');
  assert.equal(searchWorks(works, 'sedan', 'колеса').length, 0);
  assert.equal(searchWorks(works, 'sedan', 'стой задняя').length, 0);
  assert.equal(searchWorks(works, 'suv', '').length, 2);
});
