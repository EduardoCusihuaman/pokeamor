"""Resolve printed card names and PTCGL set codes, never guess from TCGdex IDs."""
import json, urllib.request, concurrent.futures
from pathlib import Path
root=Path(__file__).resolve().parent.parent
catalog=json.loads((root/'catalog.json').read_text())
cards={c['id']:c for c in json.loads((root.parent/'allcards.json').read_text())['data']['cards']}
sets=sorted({p['card'].rsplit('-',1)[0] for p in catalog if p.get('card')})
def get(set_id):
 try:
  data=json.load(urllib.request.urlopen('https://api.tcgdex.net/v2/en/sets/'+set_id,timeout=25))
  return set_id,data if isinstance(data,dict) else {}
 except Exception:return set_id,{}
cache=root/'proxy-set-metadata.json'
if cache.exists():metadata=json.loads(cache.read_text())
else:
 with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
  metadata=dict(pool.map(get,sets))
overrides={'sv08.5':'PRE','swsh10.5':'PGO','sma':'HIF'}
missing=[]
for p in catalog:
 p.pop('proxy',None)
 if not p.get('card'):missing.append(p['id']);continue
 set_id,number=p['card'].rsplit('-',1)
 data=metadata.get(set_id,{})
 code=overrides.get(set_id) or data.get('abbreviation',{}).get('official') or data.get('tcgOnline')
 card=cards.get(p['card'])
 if not code or not card:missing.append(p['id']);continue
 # Numeric collector numbers lose padding; TG/GG/RC/SV prefixes remain intact.
 if number.isdigit():number=str(int(number))
 p['proxy']={'name':card['name'],'set':code,'number':number}
(root/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n')
(root/'proxy-set-metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,separators=(',',':'))+'\n')
print('Resolved',len(catalog)-len(missing),'Unresolved',len(missing),missing)
