import json,urllib.request,concurrent.futures,io,math
from PIL import Image
cat=json.load(open('catalog.json'));all={x['id']:x for x in json.load(open('/workspace/scratch/7eeb77f0c3b2/allcards.json'))['data']['cards']}
target=[p for p in cat if p.get('rarity') in {'Ultra Rare','Ultra Rara','Secret Rare','Hyper rare','Holo Rare VMAX','Holo Rare VSTAR'}]
def scan(p):
 try:
  d=all[p['card']];u=d['image'].replace('/en/','/es/')+'/high.png';im=Image.open(io.BytesIO(urllib.request.urlopen(u,timeout=20).read())).convert('HSV').resize((64,90));px=list(im.getdata());
  gold=sum(1 for h,s,v in px if .07*255<h<.18*255 and s>90 and v>120)/len(px)
  hues=[int(h/16) for h,s,v in px if s>55 and v>90];counts=[hues.count(i) for i in range(16)];total=sum(counts);ent=-sum((n/total)*math.log(n/total) for n in counts if n) / math.log(16) if total else 0
  return p['id'],p['name'],p['card'],round(gold,3),round(ent,3)
 except:return None
with concurrent.futures.ThreadPoolExecutor(max_workers=24) as ex:r=[x for x in ex.map(scan,target) if x]
r.sort(key=lambda x:(x[3]+x[4],x[3]),reverse=True);json.dump(r,open('surface-scan.json','w'),indent=2);print('\n'.join(map(str,r[:30])))
