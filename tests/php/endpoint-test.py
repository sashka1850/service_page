"""Exercise HTTP endpoint, persistent deduplication, unknown delivery and rate limits.
All upstream calls are mocked; no real Telegram messages or Google requests.
"""
import json, os, pathlib, socket, subprocess, tempfile, time, urllib.request, urllib.error
root = pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory() as tmp:
    private = pathlib.Path(tmp)
    (private/'mode').write_text('sent')
    (private/'calls').write_text('')
    config = private/'config.php'
    config.write_text("<?php return " + "['token'=>'123:fake','chat_id'=>'123','origin'=>'https://sct-52.ru','google_api_url'=>'https://script.google.com/macros/s/fake/exec','storage_dir'=>__DIR__,'state_key'=>'" + 'a'*64 + "'];")
    with socket.socket() as s:
        s.bind(('127.0.0.1',0)); port = s.getsockname()[1]
    env = dict(os.environ, SCT_CONFIG_PATH=str(config), SCT_TEST_DIR=tmp)
    proc = subprocess.Popen(['php','-n','-d','auto_prepend_file='+str(root/'tests/php/mock-curl.php'),'-S',f'127.0.0.1:{port}','-t',str(root)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    url = f'http://127.0.0.1:{port}/api/lead.php'
    def request(data=None, query='', origin='https://sct-52.ru'):
        req = urllib.request.Request(url+query, data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','Origin':origin})
        try:
            response = urllib.request.urlopen(req,timeout=5)
        except urllib.error.HTTPError as e:
            response = e
        return response.code,json.loads(response.read())
    def form(n=1, **changes):
        return dict(nonce='booking_'+f'{n:032x}',name='Анна',phone='+79991234567',kind='callback',consent='yes',website='',**changes)
    def calls(): return [json.loads(x) for x in (private/'calls').read_text().splitlines()]
    def reset():
        (private/'lead-state.json').unlink(missing_ok=True)
        (private/'calls').write_text('')
    try:
        for _ in range(100):
            try:
                request(query='?action=status&nonce=booking_'+'a'*32); break
            except OSError: time.sleep(.05)
        else: raise RuntimeError('PHP server did not start')
        assert request(form(),origin='https://evil.example')[0] == 403
        assert request(form())[1]['status'] == 'sent'
        assert request(form())[1]['status'] == 'sent'
        assert len(calls()) == 1, 'duplicate must not send twice'
        assert request(query='?action=status&nonce='+form()['nonce'])[1]['status'] == 'sent'
        state = (private/'lead-state.json').read_text()
        assert 'Анна' not in state and '79991234567' not in state
        reset()
        repair = form(2, workId='W001',classId='sedan',expectedPrice=500)
        repair['kind'] = 'repair'
        assert request(repair)[1]['status'] == 'sent'
        google = calls()[0]['url']
        assert 'bookingQuote' in google and all(x not in google for x in ['phone','name','nonce','79991234567'])
        repair['nonce'] = form(3)['nonce']; repair['expectedPrice'] = 600
        assert request(repair)[1]['code'] == 'PRICE_CHANGED'
        assert len([x for x in calls() if 'api.telegram.org' in x['url']]) == 1
        reset(); (private/'mode').write_text('timeout')
        assert request(form())[1]['status'] == 'unknown'
        assert request(form())[1]['status'] == 'unknown'
        assert len(calls()) == 1
        reset(); (private/'mode').write_text('reject')
        assert request(form())[1]['status'] == 'failed'
        assert request(form())[1]['code'] == 'TELEGRAM_REJECTED'
        reset(); (private/'mode').write_text('sent')
        for n in range(5): assert request(form(n))[1]['status'] == 'sent'
        assert request(form(6))[0] == 429
        assert len(calls()) == 5
        print('PHP HTTP integration tests passed')
    finally:
        proc.terminate(); proc.wait(timeout=5)
