const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('app.js','utf8');
const hitTest=source.match(/function debugTileAtPoint\(x,y\)\{.*?\nfunction moveDebugPeek\(x,y\)\{.*?\n/)[0];
function tile(name,left){return{debugPokemon:{name,image:'https://cards.test/'+name+'/high.webp'},classList:{add(){},remove(){}},getBoundingClientRect:()=>({left,right:left+90,top:100,bottom:230}),closest(selector){return selector==='#grid .tile'?this:null}}}
function hitHarness(){const first=tile('first',0),second=tile('second',100),ctx={debugPeekSession:{image:{},tile:first},debugPeekSerial:0,document:{elementFromPoint:()=>first,querySelectorAll:()=>[first,second]}};ctx.paintDebugPeek=(p,t)=>{ctx.paint=[p.name,t]};vm.createContext(ctx);vm.runInContext(hitTest+';globalThis.move=moveDebugPeek;',ctx);return{ctx,first,second}}
test('scrub follows the tile under the finger even when iOS keeps the original tile captured',()=>{const h=hitHarness();h.ctx.move(145,160);assert.equal(h.ctx.paint[0],'second');assert.equal(h.ctx.paint[1],h.second)});
test('scrub ignores points in tile gutters and keeps the current preview',()=>{const h=hitHarness();h.ctx.move(95,160);assert.equal(h.ctx.paint,undefined);assert.equal(h.ctx.debugPeekSession.tile,h.first)});
