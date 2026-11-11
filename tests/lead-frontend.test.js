import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const source = readFileSync(new URL('../src/app.js', import.meta.url),'utf8');
const code = source.slice(source.indexOf('async function leadRequest('),source.indexOf('\nloadCatalog();'));
function setup(reply = {ok:true,status:'sent'}) {
  const handlers = {}, requests = [], states = [];
  const context = vm.createContext({
    URL, AbortController, setTimeout, clearTimeout, crypto:webcrypto,
    location:{href:'https://sct-52.ru/',origin:'https://sct-52.ru'},config:{leadApiUrl:'./api/lead.php'},
    bookingForm:{addEventListener:(type,fn)=>handlers[type]=fn},
    bookingResultCheck:{addEventListener:(_,fn)=>handlers.check=fn},
    bookingName:{value:'Анна'},bookingPhone:{value:'+79991234567'},
    $:()=>({value:''}), phoneDigits:v=>v, updateBookingValidity:()=>true,
    selectedBooking:{kind:'maintenance',modelId:'M001',type:'ТО',priceId:'P0001'},
    bookingPending:false,bookingSent:false,activeBookingNonce:null,
    showBookingResult:state=>states.push(state),
    fetch:async (url, options)=>{ requests.push({url:String(url),...options});return {ok:true,json:async()=>reply}; }
  });
  vm.runInContext(code,context);
  return {context,handlers,requests,states};
}
test('booking sends contacts to same-origin PHP and cannot submit twice',async()=>{
  const {context,handlers,requests,states}=setup();
  await handlers.submit({preventDefault(){}});
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'https://sct-52.ru/api/lead.php');
  const body=JSON.parse(requests[0].body);
  assert.equal(body.name,'Анна'); assert.equal(body.priceId,'P0001');
  assert.match(body.nonce,/^booking_[a-f0-9]{32}$/);
  assert.deepEqual(states,['sending','success']);
  assert.equal(context.bookingPending,false);
  await handlers.submit({preventDefault(){}});
  assert.equal(requests.length,1);
});
test('status check uses PHP and contains only an opaque nonce',async()=>{
  const {context,handlers,requests,states}=setup({ok:false,status:'unknown'});
  context.activeBookingNonce='booking_'+'a'.repeat(32);
  await handlers.check();
  assert.equal(requests[0].method,'GET');
  assert.equal(new URL(requests[0].url).searchParams.get('action'),'status');
  assert.equal(requests[0].body,undefined);
  assert.deepEqual(states,['sending','uncertain']);
});
test('network failure prevents automatic resend and ignores late reply after close',async()=>{
  const {context,handlers,states}=setup();
  context.fetch=async()=>{throw new Error('network')};
  await handlers.submit({preventDefault(){}});
  assert.equal(context.bookingSent,true);
  assert.deepEqual(states,['sending','uncertain']);
  const next=setup();
  next.context.fetch=async()=>{next.context.activeBookingNonce=null;return {ok:true,json:async()=>({ok:true,status:'sent'})};};
  await next.handlers.submit({preventDefault(){}});
  assert.deepEqual(next.states,['sending']);
});
test('changed price allows correction and cross-origin lead endpoints are rejected',async()=>{
  const {context,handlers,requests,states}=setup({ok:false,status:'failed',code:'PRICE_CHANGED'});
  await handlers.submit({preventDefault(){}});
  assert.equal(context.bookingSent,false);
  assert.deepEqual(states,['sending','failure']);
  const next=setup();next.context.config.leadApiUrl='https://script.google.com/exec';
  await next.handlers.submit({preventDefault(){}});
  assert.equal(next.requests.length,0);
});
