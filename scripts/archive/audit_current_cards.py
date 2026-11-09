import json,urllib.request,concurrent.futures
cat=json.load(open('catalog.json'))
def get(p):
 try:return json.loads(urllib.request.urlopen('https://api.tcgdex.net/v2/es/cards/'+p['card'],timeout=30).read())
 except:return None
def suspicious(p):
 d=get(p)
 if not isinstance(d,dict):return None
 # Tera cards expose Terapagos as a cameo in TCGdex; the card itself can still be named only "X ex".
 if 1024 in (d.get('cameoDexIds') or []):return (p,d)
 return None
with concurrent.futures.ThreadPoolExecutor(max_workers=32) as ex:
 out=[x for x in ex.map(suspicious,cat) if x]
json.dump([{'pokemon':p,'detail':d} for p,d in out],open('current-suspicious.json','w'),ensure_ascii=False)
print(len(out))
for p,d in out:print(p['id'],p['name'],p['card'],d.get('name'),d.get('rarity'),d.get('cameoDexIds'))
