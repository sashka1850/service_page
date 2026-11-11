<?php
// COPY OUTSIDE THE PUBLIC WEB DIRECTORY; never commit the filled configuration.
return [
    'token' => 'REPLACE_WITH_BOT_TOKEN',
    'chat_id' => 'REPLACE_WITH_CHAT_ID',
    'origin' => 'https://sct-52.ru',
    'google_api_url' => 'https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec',
    'storage_dir' => __DIR__.'/state',
    'state_key' => 'REPLACE_WITH_RANDOM_SECRET_AT_LEAST_32_CHARACTERS',
];
