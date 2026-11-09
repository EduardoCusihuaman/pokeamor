"""Offline, deterministic generator. Inputs are checked into data/. Never queries APIs."""
import json,hashlib,gzip
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
def raw(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def build():
 catalog=json.loads((ROOT/'data/catalog.json').read_text())
 curated=json.loads((ROOT/'data/alternatives-curated.json').read_text())
 records=json.loads((ROOT/'data/card-metadata/proxies.json').read_text())
 records.update(json.loads((ROOT/'data/proxy-overrides.json').read_text()))
 pokemon={}
 by={str(p['id']):p for p in catalog}
 for pid,rows in curated['pokemon'].items():
  accepted=[r for r in rows if r.get('enabled')]
  assert pid in by and len(accepted)<=2
  assert len({r['printId'] for r in accepted})==len(accepted)
  for r in accepted:
   assert r.get('technicalCheck')
   assert r['printId'] in records
  if accepted:pokemon[pid]=[[r['printId'],r['image'],r['rarity'],r.get('artist','')] for r in accepted]
 sets=sorted({r['set'] for r in records.values()})
 prints={pid:[sets.index(r['set']),r['number'],r['name']] for pid,r in sorted(records.items())}
 version=hashlib.sha256(raw([catalog,pokemon,sets,prints])).hexdigest()[:16]
 out=ROOT/'generated/card-resources';out.mkdir(parents=True,exist_ok=True)
 manifest={'schema':1,'dataVersion':version};report={'species':len(pokemon),'alternatives':sum(map(len,pokemon.values())),'proxies':len(prints),'unresolved':[p['id'] for p in catalog if p.get('card') not in records],'sizes':{}}
 for kind,body in [('alternatives',{'pokemon':pokemon}),('proxies',{'sets':sets,'prints':prints})]:
  content=raw({'schema':1,'dataVersion':version,**body});name=f'{kind}.{hashlib.sha256(content).hexdigest()[:16]}.json'
  (out/name).write_bytes(content);manifest[kind]='/data/'+name;report['sizes'][kind]={'bytes':len(content),'gzip':len(gzip.compress(content,mtime=0))}
 (out/'manifest.json').write_bytes(raw(manifest));(out/'report.json').write_bytes(raw(report))
 keep={manifest[kind].split('/')[-1] for kind in ('alternatives','proxies')}
 for f in out.glob('*.json'):
  if f.name.startswith(('alternatives.','proxies.')) and f.name not in keep:f.unlink()
 print(json.dumps(report))
if __name__=='__main__':build()
