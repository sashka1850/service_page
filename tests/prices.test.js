import test from 'node:test';
import assert from 'node:assert/strict';
import {getPrice} from '../src/data.js';
test('Prices match the nine original model quotes', () => {
  for (const [brand, model, price] of [
    ['Hyundai','Solaris',12000], ['Hyundai','Tucson',13000], ['Hyundai','Santa Fe',18000],
    ['Kia','Rio',11500], ['Kia','K5',13500], ['Kia','Sorento',17500],
    ['Genesis','G70',17000], ['Genesis','G80',25000], ['Genesis','G90',35000],
  ]) assert.equal(getPrice(brand,model),price);
});
test('Incomplete or mismatched selections cannot produce a quote', () => {
  for (const [brand,model] of [['',''],['Hyundai',''],['Kia','Solaris'],['Unknown','Rio'],['__proto__','toString']]) assert.equal(getPrice(brand,model),null);
});
