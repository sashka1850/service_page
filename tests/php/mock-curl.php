<?php
// Loaded only by the isolated test server started with php -n (no real cURL).
foreach (['CURLOPT_RETURNTRANSFER','CURLOPT_CONNECTTIMEOUT','CURLOPT_TIMEOUT','CURLOPT_FOLLOWLOCATION','CURLOPT_MAXREDIRS','CURLOPT_PROTOCOLS','CURLOPT_REDIR_PROTOCOLS','CURLOPT_SSL_VERIFYPEER','CURLOPT_SSL_VERIFYHOST','CURLOPT_POST','CURLOPT_HTTPHEADER','CURLOPT_POSTFIELDS','CURLINFO_HTTP_CODE','CURLPROTO_HTTPS'] as $i=>$name) define($name,$i+1);
function curl_init($url) { return (object)['url'=>$url,'options'=>[],'status'=>200]; }
function curl_setopt_array($ch,$options) { $ch->options = $options + $ch->options; return true; }
function curl_exec($ch) {
    $dir = getenv('SCT_TEST_DIR');
    $mode = trim(file_get_contents($dir.'/mode'));
    file_put_contents($dir.'/calls',json_encode(['url'=>$ch->url,'payload'=>$ch->options[CURLOPT_POSTFIELDS] ?? null])."\n",FILE_APPEND);
    if (strpos($ch->url,'script.google.com') !== false) {
        return json_encode(['ok'=>true,'price'=>500,'lines'=>['Работа: фильтр']]);
    }
    if ($mode === 'timeout') { $ch->status=0; return false; }
    if ($mode === 'reject') { $ch->status=403; return '{"ok":false}'; }
    return '{"ok":true,"result":{"message_id":123}}';
}
function curl_getinfo($ch,$key) { return $ch->status; }
function curl_close($ch) {}
