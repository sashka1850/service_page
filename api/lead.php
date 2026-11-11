<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__.'/lead-lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function respond(array $result, int $status = 200): void {
    http_response_code($status);
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function saveState($file, array $state): void {
    $json = json_encode($state, JSON_THROW_ON_ERROR);
    if (!rewind($file) || !ftruncate($file, 0) || fwrite($file, $json) !== strlen($json) || !fflush($file)) throw new LeadError('STORAGE_UNAVAILABLE');
}
function outsidePublic(string $path): bool {
    $root = realpath($_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__));
    return $root !== false && $path !== $root && strpos($path, $root.DIRECTORY_SEPARATOR) !== 0;
}
$file = null;
$telegramAttempted = false;
try {
    $configPath = realpath(getenv('SCT_CONFIG_PATH') ?: dirname(__DIR__, 2).'/sct-private/config.php');
    if (!$configPath || !outsidePublic($configPath)) throw new LeadError('SERVER_NOT_CONFIGURED');
    $config = require $configPath;
    if (!is_array($config) || !function_exists('curl_init')) throw new LeadError('SERVER_NOT_CONFIGURED');
    foreach (['token','chat_id','origin','google_api_url','storage_dir','state_key'] as $key) if (!is_string($config[$key] ?? null) || $config[$key] === '') throw new LeadError('SERVER_NOT_CONFIGURED');
    if (!preg_match('/^[0-9]+:[A-Za-z0-9_-]+$/D', $config['token']) || strlen($config['state_key']) < 32 || !preg_match('~^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$~D', $config['google_api_url'])) throw new LeadError('SERVER_NOT_CONFIGURED');
    $dir = realpath($config['storage_dir']);
    if (!$dir || !outsidePublic($dir) || !is_writable($dir)) throw new LeadError('STORAGE_UNAVAILABLE');
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if ($method !== 'GET' && $method !== 'POST') { header('Allow: GET, POST'); respond(['ok'=>false,'status'=>'failed','code'=>'METHOD_NOT_ALLOWED'],405); }
    if ($method === 'POST' && ($_SERVER['HTTP_ORIGIN'] ?? '') !== $config['origin']) respond(['ok'=>false,'status'=>'failed','code'=>'INVALID_ORIGIN'],403);
    if ($method === 'POST') {
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 16384) throw new LeadError('INVALID_FORM');
        $raw = file_get_contents('php://input', false, null, 0, 16385);
        if (!is_string($raw) || strlen($raw) > 16384) throw new LeadError('INVALID_FORM');
        $p = json_decode($raw, true);
        if (!is_array($p)) throw new LeadError('INVALID_FORM');
        $lead = leadValidate($p);
        $nonce = $lead['nonce'];
    } else {
        $nonce = leadField($_GET, 'nonce', 100);
        if (($_GET['action'] ?? '') !== 'status' || !preg_match('/^booking_[a-f0-9]{32}$/D', $nonce)) throw new LeadError('INVALID_FORM');
    }
    $file = fopen($dir.'/lead-state.json', 'c+');
    if (!$file || !flock($file, LOCK_EX | LOCK_NB)) throw new LeadError('SERVER_BUSY');
    @chmod($dir.'/lead-state.json',0600);
    $rawState = stream_get_contents($file);
    $state = $rawState === '' ? ['leads'=>[], 'rates'=>[]] : json_decode($rawState,true);
    if (!is_array($state) || !isset($state['leads'],$state['rates'])) throw new LeadError('STORAGE_UNAVAILABLE');
    $beforeCleanup = $state;
    $now = time();
    foreach ($state['leads'] as $id=>$entry) if ($entry['at'] < $now-30*86400) unset($state['leads'][$id]);
    foreach ($state['rates'] as $id=>$entry) if ($entry['at'] < $now-600) unset($state['rates'][$id]);
    if ($state !== $beforeCleanup) saveState($file, $state);
    $entry = $state['leads'][$nonce] ?? null;
    if ($method === 'GET') respond(['ok'=>($entry['status'] ?? '') === 'sent', 'status'=>$entry['status'] ?? 'unknown', 'code'=>$entry['code'] ?? null]);
    $fingerprint = hash_hmac('sha256', json_encode($lead, JSON_THROW_ON_ERROR), $config['state_key']);
    if ($entry) {
        if (!hash_equals($entry['fingerprint'], $fingerprint)) throw new LeadError('INVALID_FORM');
        respond(['ok'=>$entry['status'] === 'sent', 'status'=>$entry['status'], 'code'=>$entry['code'] ?? null]);
    }
    // Do not trust forwarded IP headers. No IP, phone, name or message is stored.
    $ip = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', $config['state_key']);
    foreach ([$ip=>5,'global'=>15] as $bucket=>$limit) {
        $rate = $state['rates'][$bucket] ?? ['at'=>$now,'count'=>0];
        if ($rate['count'] >= $limit) throw new LeadError('RATE_LIMITED');
    }
    foreach ([$ip,'global'] as $bucket) {
        $rate = $state['rates'][$bucket] ?? ['at'=>$now,'count'=>0];
        $rate['count']++;
        $state['rates'][$bucket] = $rate;
    }
    saveState($file,$state);
    $quote = null;
    if (!in_array($lead['kind'],['callback','custom'],true)) {
        $reply = leadHttp($config['google_api_url'].'?'.http_build_query(leadQuoteParams($lead),'','&',PHP_QUERY_RFC3986));
        if ($reply['status'] !== 200) throw new LeadError('PRICE_SERVICE_UNAVAILABLE');
        $quote = $reply['body'];
    }
    $lead['consentAt'] = gmdate('Y-m-d\TH:i:s\Z', $now);
    $text = leadMessage($lead,$quote);
    // Persist before contacting Telegram. Ambiguous network failures never auto-resend.
    $state['leads'][$nonce] = ['at'=>$now,'status'=>'unknown','fingerprint'=>$fingerprint,
        'consent'=>['version'=>$lead['consentVersion'],'accepted_at'=>$lead['consentAt']]];
    saveState($file,$state);
    $telegramAttempted = true;
    $reply = leadHttp('https://api.telegram.org/bot'.$config['token'].'/sendMessage', ['chat_id'=>$config['chat_id'],'text'=>$text]);
    if ($reply['status'] === 200 && ($reply['body']['ok'] ?? false) === true) {
        $state['leads'][$nonce]['status'] = 'sent';
    } elseif (is_array($reply['body']) && ($reply['body']['ok'] ?? null) === false) {
        $state['leads'][$nonce]['status'] = 'failed';
        $state['leads'][$nonce]['code'] = 'TELEGRAM_REJECTED';
    }
    saveState($file,$state);
    $entry = $state['leads'][$nonce];
    respond(['ok'=>$entry['status'] === 'sent','status'=>$entry['status'],'code'=>$entry['code'] ?? null]);
} catch (LeadError $e) {
    $code = $e->getMessage();
    respond(['ok'=>false,'status'=>$telegramAttempted ? 'unknown' : 'failed','code'=>$code], $code === 'RATE_LIMITED' ? 429 : 400);
} catch (Throwable $e) {
    // Never log exception text: upstream URLs can contain the bot token.
    respond(['ok'=>false,'status'=>isset($nonce,$state['leads'][$nonce]) ? 'unknown' : 'failed','code'=>'SERVER_ERROR'],503);
}
