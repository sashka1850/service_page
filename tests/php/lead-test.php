<?php
declare(strict_types=1);
require __DIR__.'/../../api/lead-lib.php';
function check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function rejects(callable $fn, string $code): void {
    try { $fn(); } catch (LeadError $e) { check($e->getMessage() === $code, 'wrong error: '.$e->getMessage()); return; }
    throw new RuntimeException('expected '.$code);
}
$form = ['nonce'=>'booking_'.str_repeat('a',32),'name'=>'Анна','phone'=>'89991234567','kind'=>'callback','consent'=>'yes','consentVersion'=>SCT_CONSENT_VERSION,'website'=>''];
$lead = leadValidate($form);
check($lead['phone'] === '+79991234567','phone normalization');
check(strpos(leadMessage($lead,null),'Анна') !== false,'callback message');
foreach ([['consent'=>'no'],['website'=>'spam'],['nonce'=>[]]] as $change) rejects(fn()=>leadValidate(array_replace($form,$change)),'INVALID_FORM');
rejects(fn()=>leadValidate(array_replace($form,['name'=>'A'])),'INVALID_NAME');
rejects(fn()=>leadValidate(array_replace($form,['phone'=>'123'])),'INVALID_PHONE');
rejects(fn()=>leadValidate(array_replace($form,['kind'=>'custom','request'=>''])),'INVALID_REQUEST');
$repair = leadValidate(array_replace($form,['kind'=>'repair','workId'=>'W001','classId'=>'sedan','expectedPrice'=>500]));
$query = leadQuoteParams($repair);
check(!isset($query['phone'],$query['name'],$query['nonce'],$query['consent']), 'PII must never reach Google');
check(count($query) === 4 && $query['action'] === 'bookingQuote','quote allowlist');
$quote = ['ok'=>true,'price'=>500,'lines'=>['Работа: фильтр']];
check(strpos(leadMessage($repair,$quote),'500 ₽') !== false,'authoritative price');
rejects(fn()=>leadMessage($repair,array_replace($quote,['price'=>600])),'PRICE_CHANGED');
rejects(fn()=>leadMessage($repair,['ok'=>false,'code'=>'REPAIR_UNAVAILABLE']),'REPAIR_UNAVAILABLE');
rejects(fn()=>leadMessage($repair,['ok'=>false,'error'=>'private server trace']),'PRICE_SERVICE_UNAVAILABLE');
rejects(fn()=>leadValidate(array_replace($form,['kind'=>'offer','offerId'=>'O001','expectedPrice'=>[]])),'PRICE_CHANGED');
echo "PHP lead validation and quote tests passed\n";

rejects(fn()=>leadValidate(array_replace($form,['consentVersion'=>'old'])),'CONSENT_OUTDATED');
