import json,hashlib
from pathlib import Path
p=Path(__file__).resolve().parent.parent
c=json.loads((p/'catalog.json').read_text());assert len(c)==1025 and len({x['id'] for x in c})==1025
assert all('proxy' not in x for x in c)
m=json.loads((p/'generated/card-resources/manifest.json').read_text())
for kind in ['alternatives','proxies']:
 f=p/'generated/card-resources'/m[kind].split('/')[-1];b=f.read_bytes();assert hashlib.sha256(b).hexdigest()[:16] in f.name
 d=json.loads(b);assert d['schema']==1 and d['dataVersion']==m['dataVersion']
 if kind=='proxies':
  for row in d['prints'].values():assert 0<=row[0]<len(d['sets']) and all(isinstance(x,str) and x.strip()==x and x for x in row[1:])
print('Card resource validation passed')
