<?php
declare(strict_types=1);

const SCT_CONSENT_VERSION = '2026-11-11.1';

final class LeadError extends RuntimeException {}
function leadField(array $p, string $key, int $max = 200): string {
    $v = $p[$key] ?? '';
    if (!is_string($v) || strlen($v) > $max || !preg_match('//u', $v)) throw new LeadError('INVALID_FORM');
    return trim($v);
}
function leadValidate(array $p): array {
    $nonce = leadField($p, 'nonce', 100);
    if (!preg_match('/^booking_[a-f0-9]{32}$/D', $nonce)) throw new LeadError('INVALID_FORM');
    if (leadField($p, 'consent') !== 'yes' || leadField($p, 'website') !== '') throw new LeadError('INVALID_FORM');
    if (leadField($p, 'consentVersion', 40) !== SCT_CONSENT_VERSION) throw new LeadError('CONSENT_OUTDATED');
    $name = preg_replace('/\s+/u', ' ', leadField($p, 'name', 320));
    if (!preg_match("/^[\p{L}][\p{L}\s.'-]{1,79}$/uD", $name)) throw new LeadError('INVALID_NAME');
    $phone = preg_replace('/\D/', '', leadField($p, 'phone', 40));
    if (strlen($phone) === 10 && $phone[0] === '9') $phone = '7' . $phone;
    if (strlen($phone) === 11 && $phone[0] === '8') $phone = '7' . substr($phone, 1);
    if (!preg_match('/^7[0-9]{10}$/D', $phone)) throw new LeadError('INVALID_PHONE');
    $kind = leadField($p, 'kind', 20);
    if (!in_array($kind, ['callback','custom','maintenance','offer','repair'], true)) throw new LeadError('INVALID_KIND');
    $r = ['nonce'=>$nonce, 'name'=>$name, 'phone'=>'+'.$phone, 'kind'=>$kind, 'consentVersion'=>SCT_CONSENT_VERSION];
    if ($kind === 'custom') {
        $r['request'] = leadField($p, 'request', 4000);
        if ($r['request'] === '' || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f]/', $r['request']) || preg_match_all('/./us', $r['request']) > 1000) throw new LeadError('INVALID_REQUEST');
    }
    $keys = ['maintenance'=>['modelId','type','priceId'], 'offer'=>['offerId'], 'repair'=>['workId','classId']];
    foreach ($keys[$kind] ?? [] as $key) {
        $r[$key] = leadField($p, $key);
        if ($r[$key] === '') throw new LeadError('INVALID_QUOTE');
    }
    if (in_array($kind, ['offer','repair'], true)) {
        $price = $p['expectedPrice'] ?? null;
        if ((!is_string($price) && !is_int($price) && !is_float($price)) || !is_numeric($price) || !is_finite((float)$price) || (float)$price < 0) throw new LeadError('PRICE_CHANGED');
        $r['expectedPrice'] = (float)$price;
    }
    return $r;
}
/** Only explicitly selected service fields can reach Google's public quote API. */
function leadQuoteParams(array $p): array {
    $r = ['action'=>'bookingQuote', 'kind'=>$p['kind']];
    foreach (['modelId','type','priceId','offerId','workId','classId'] as $key) if (isset($p[$key])) $r[$key] = $p[$key];
    return $r;
}
function leadMessage(array $p, ?array $quote): string {
    $titles = ['callback'=>'Заказ обратного звонка','custom'=>'Новая заявка: автомобиля нет в списке','maintenance'=>'Новая заявка на ТО','offer'=>'Новая заявка по акции','repair'=>'Новая заявка на ремонт'];
    $lines = [$titles[$p['kind']], 'Имя: '.$p['name'], 'Телефон: '.$p['phone']];
    if ($p['kind'] === 'custom') $lines[] = 'Запрос: '.$p['request'];
    if (!in_array($p['kind'], ['callback','custom'], true)) {
        if (!$quote || ($quote['ok'] ?? false) !== true) {
            $code = $quote['code'] ?? 'PRICE_SERVICE_UNAVAILABLE';
            throw new LeadError(in_array($code, ['INVALID_QUOTE','OFFER_UNAVAILABLE','REPAIR_UNAVAILABLE'], true) ? $code : 'PRICE_SERVICE_UNAVAILABLE');
        }
        $price = $quote['price'] ?? null;
        if (!is_numeric($price) || !is_finite((float)$price) || (float)$price < 0 || !is_array($quote['lines'] ?? null)) throw new LeadError('PRICE_SERVICE_UNAVAILABLE');
        if (isset($p['expectedPrice']) && abs($p['expectedPrice'] - (float)$price) > 0.001) throw new LeadError('PRICE_CHANGED');
        foreach ($quote['lines'] as $line) {
            if (!is_string($line) || strlen($line) > 1500) throw new LeadError('PRICE_SERVICE_UNAVAILABLE');
            $lines[] = $line;
        }
        $lines[] = 'Стоимость: '.$price.' ₽';
    }
    $lines[] = 'Согласие на обработку данных: да';
    $lines[] = 'Версия согласия: '.$p['consentVersion'];
    if (isset($p['consentAt'])) $lines[] = 'Дата согласия (UTC): '.$p['consentAt'];
    $lines[] = 'ID заявки: '.$p['nonce'];
    $text = implode("\n", $lines);
    if (preg_match_all('/./us', $text) > 4000) throw new LeadError('INVALID_REQUEST');
    return $text;
}
/** TLS stays enabled; only Google read requests follow HTTPS redirects. */
function leadHttp(string $url, ?array $payload = null): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>5,
        CURLOPT_TIMEOUT=>15, CURLOPT_FOLLOWLOCATION=>$payload === null, CURLOPT_MAXREDIRS=>3,
        CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS=>CURLPROTO_HTTPS,
        CURLOPT_SSL_VERIFYPEER=>true, CURLOPT_SSL_VERIFYHOST=>2]);
    if ($payload !== null) curl_setopt_array($ch, [CURLOPT_POST=>true,
        CURLOPT_HTTPHEADER=>['Content-Type: application/json'], CURLOPT_POSTFIELDS=>json_encode($payload, JSON_THROW_ON_ERROR)]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status'=>$status, 'body'=>is_string($body) ? json_decode($body, true) : null];
}
