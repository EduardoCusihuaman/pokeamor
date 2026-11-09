"""Join exact Spanish standard printings to Malie's TCGL material assets. No rarity inference."""
import json,re,unicodedata,urllib.request,urllib.error,concurrent.futures
from pathlib import Path
root=Path(__file__).resolve().parent.parent
cache=root.parent/'malie-cache';cache.mkdir(exist_ok=True)
base='https://cdn.malie.io/file/malie-io/tcgl/export/'
headers={'User-Agent':'Pokeamor/1.0 (+https://pokeamor-cartas.h4lconn.chatgpt.site)','Accept':'application/json'}
index_path=root.parent/'malie-index.json'
if not index_path.exists():index_path.write_bytes(urllib.request.urlopen(urllib.request.Request(base+'index.json',headers=headers),timeout=35).read())
index=json.load(open(index_path));catalog=json.load(open(root/'catalog.json'))
def set_key(cid):
 s=cid.rsplit('-',1)[0]
 if s=='sv10.5b':return 'zsv10-5'
 if s=='sv10.5w':return 'rsv10-5'
 if s=='svp':return 'svbsp'
 m=re.fullmatch(r'(sv|me)0*(\d+)(?:\.(\d+))?',s)
 return m[1]+str(int(m[2]))+('-'+m[3] if m[3] else '') if m else None
keys={set_key(c['card']) for c in catalog if c['card']};keys={k for k in keys if k in index['es-ES']}
def get(k):
 entry=index['es-ES'][k];target=cache/(entry['hash']+'.json')
 try:
  if not target.exists():target.write_bytes(urllib.request.urlopen(urllib.request.Request(base+entry['path'],headers=headers),timeout=35).read())
  return k,json.load(open(target))
 except Exception as e:print('Could not load',k,type(e).__name__,flush=True);return k,[]
sets=dict(concurrent.futures.ThreadPoolExecutor(6).map(get,sorted(keys)))
profiles={};routes={};counts={};shiny=[]
spanish_path=root.parent/'spanish-cards.json'
if not spanish_path.exists():spanish_path.write_bytes(urllib.request.urlopen(urllib.request.Request('https://api.tcgdex.net/v2/es/cards',headers=headers),timeout=35).read())
spanish={c['id']:c for c in json.load(open(spanish_path))}
def normalized(s):return re.sub(r'[^a-z0-9]+',' ',''.join(c for c in unicodedata.normalize('NFKD',s.casefold()) if not unicodedata.combining(c))).strip()
supported={'SUN_PILLAR','SV_HOLO','SV_ULTRA','FLAT_SILVER'}
for p in catalog:
 if p['image'].startswith('/materials/'):
  image=spanish.get(p['card'],{}).get('image');p['image']=image+'/high.webp' if image else ''
 p['surface']={'scope':'artwork' if not p['card'] else 'digital' if '/tcgp/' in p['image'] else 'physical','status':'not-applicable' if not p['card'] else 'unverified','effect':'none'}
 k=set_key(p['card']) if p['card'] else None
 if k not in sets:continue
 try:num=int(p['card'].rsplit('-',1)[1])
 except:continue
 candidates=[c for c in sets[k] if c.get('collector_number',{}).get('numeric')==num and c.get('lang')=='es-ES' and '_std_' in c.get('ext',{}).get('tcgl',{}).get('longFormID','')]
 if len(candidates)!=1:continue
 c=candidates[0]
 if not re.search(r'(?<![a-z0-9])'+re.escape(normalized(p['name']))+r'(?![a-z0-9])',normalized(c['name'])):
  print('Name mismatch skipped',p['card'],p['name'],c['name'],flush=True);continue
 if 'SHINY' in c.get('tags',[]):shiny.append(p['card']);continue
 foil=c.get('foil');imgs=c['images']['tcgl']['png'];export=index['es-ES'][k];version=export['path'].split('/')[0]+'-'+export['hash'][:12]
 common={'scope':'physical','status':'matched-tcgl','provider':'malie.io','language':'es-ES','cardId':p['card'],'source':base+export['path'],'sourceHash':export['hash'],'printingId':c.get('ext',{}).get('tcgl',{}).get('longFormID'),'effect':'none'}
 if not foil:
  p['surface']={**common,'status':'confirmed-nonfoil','type':'NONE'};counts['NONE']=counts.get('NONE',0)+1;continue
 kind=foil.get('type');maskType=foil.get('mask');etched=maskType=='ETCHED'
 if kind not in supported or not imgs.get('foil') or (etched and not imgs.get('etch')):
  p['surface']={**common,'type':kind,'maskType':maskType};continue
 prefix='/materials/'+version+'/'+p['card']+'/'
 assets={name:prefix+name+'.png' for name in ['front','foil']+(['etch'] if etched else [])}
 # Front and material files are from the same Spanish standard printing.
 for name,path in assets.items():
  url=imgs[name]
  assert url.startswith('https://cdn.malie.io/file/malie-io/tcgl/cards/png/es/')
  routes[path]={'url':url,'contentType':'image/png'}
 p['surface']={**common,'status':'material-matched','effect':'asset-foil','type':kind,'maskType':maskType,'etched':etched,'assets':assets}
 p['fallbackImage']=p['image'];p['image']=assets['front']
 profiles[p['card']]={'name':c['name'],'set':k,'collectorNumber':num,'lang':c['lang'],'foil':foil,'source':common['source'],'printingId':common['printingId'],'images':imgs,'sourceHash':export['hash']}
 counts[kind]=counts.get(kind,0)+1
(root/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False))
(root/'materials.json').write_text(json.dumps(routes,ensure_ascii=False))
(root/'materials-evidence.json').write_text(json.dumps(profiles,ensure_ascii=False,indent=2))
print('Profiles:',len(profiles),'asset routes:',len(routes),'by type:',counts,'shiny excluded:',shiny,flush=True)
