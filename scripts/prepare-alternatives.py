import json,urllib.request,concurrent.futures,io
from pathlib import Path
from PIL import Image
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--cards',required=True);parser.add_argument('--sets',required=True);args=parser.parse_args()
p=Path(__file__).resolve().parent.parent;d=p/'data';(d/'card-metadata').mkdir(parents=True,exist_ok=True)
c=json.loads((p/'catalog.json').read_text());records=json.loads((d/'card-metadata/proxies.json').read_text())
overrides={'sv08.5-146':{'name':'Flareon ex','set':'PRE','number':'146'},'swsh10.5-076':{'name':'Dragonite V','set':'PGO','number':'76'}}
(d/'proxy-overrides.json').write_text(json.dumps(overrides,indent=2))
allcards=json.loads(Path(args.cards).read_text())['data']['cards'];sets=json.loads(Path(args.sets).read_text())
by={x['id']:x for x in c};jobs=[]
for x in allcards:
 ids=x.get('dexId') or []
 if len(ids)!=1 or ids[0] not in by:continue
 base=by[ids[0]]
 # Only ordinary Illustration Rare cards with the exact species name. Excludes ex/SIR Tera and shiny families.
 if x.get('rarity','').lower()!='illustration rare' or x['name'].casefold()!=base['name'].casefold() or x['id']==base.get('card') or not x.get('image'):continue
 sid,num=x['id'].rsplit('-',1);s=sets.get(sid,{})
 code=s.get('abbreviation',{}).get('official') or s.get('tcgOnline')
 if code:jobs.append((x,code,num))
def verify(job):
 x,code,num=job
 try:
  detail=json.load(urllib.request.urlopen('https://api.tcgdex.net/v2/es/cards/'+x['id'],timeout=12))
  if not isinstance(detail,dict) or detail.get('dexId')!=x['dexId'] or len(detail.get('dexId',[]))!=1:return None
  if detail.get('variants',{}).get('firstEdition'):pass
  if detail.get('cameoDexIds') and 1024 in detail['cameoDexIds']:return None
  image=detail.get('image')
  if not image or '/es/' not in image:return None
  url=image+'/high.webp';b=urllib.request.urlopen(url,timeout=12).read();im=Image.open(io.BytesIO(b));im.verify()
  return x['dexId'][0],{'printId':x['id'],'image':url,'rarity':detail.get('rarity',x['rarity']),'artist':detail.get('illustrator',''),'approved':True,'verification':{'source':'TCGdex ES + EN','imageDecoded':True,'rule':'single-species exact-name ordinary Illustration Rare; no ex/SIR/shiny rarity'}},{'name':x['name'],'set':code,'number':str(int(num)) if num.isdigit() else num}
 except Exception:return None
pokemon={};accepted=0
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
 for result in pool.map(verify,sorted(jobs,key=lambda j:j[0]['id'])):
  if not result:continue
  pid,row,proxy=result
  if len(pokemon.get(str(pid),[]))>=2:continue
  pokemon.setdefault(str(pid),[]).append(row);records[row['printId']]=proxy;accepted+=1
(d/'alternatives-curated.json').write_text(json.dumps({'schema':1,'pokemon':pokemon},ensure_ascii=False,indent=2))
(d/'card-metadata/proxies.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))

print('Candidates',len(jobs),'accepted',accepted,'species',len(pokemon))
