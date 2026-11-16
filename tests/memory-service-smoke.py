"""Run on the VPS with /etc/fino-memory.env loaded. Synthetic data only."""
import json, os, time, urllib.request, uuid, statistics
base = os.environ.get('FINO_MEMORY_URL', 'http://127.0.0.1:8842')
key = os.environ['FINO_MEMORY_KEY']
def call(path, body):
    start=time.monotonic()
    request=urllib.request.Request(base+path, data=json.dumps(body).encode(), headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
    with urllib.request.urlopen(request, timeout=180) as response: value=json.load(response)
    return value, round(time.monotonic()-start,3)
report={'search':[]}
scope='verification:'+uuid.uuid4().hex
try:
    result,elapsed=call('/index',{'scope':scope,'facts':[{'id':'ar','text':'يفضل سامر كتابة المقالات باللهجة الشامية وباختصار.'},{'id':'en','text':'Sam uses a bicycle for commuting.'}]})
    for query in ['بأي لهجة أكتب المحتوى؟','What language should the articles use?','How does Sam travel to work?']:
        result,elapsed=call('/search',{'scope':scope,'query':query})
        expected='en' if 'travel' in query else 'ar'
        report['search'].append({'query':query,'seconds':elapsed,'pass':result.get('ids',[None])[0]==expected,'result':result})
    call('/index',{'scope':scope,'facts':[{'id':'en','text':'Sam walks to work.'}]})
    result,_=call('/search',{'scope':scope,'query':'المقالات باللهجة الشامية'})
    assert 'ar' not in result['ids'], 'Deleted memory remained searchable'
finally:
    call('/index',{'scope':scope,'facts':[]})
print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
assert all(r['pass'] for r in report['search']), 'Memory quality gate failed'
