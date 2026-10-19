// PAYLAŞ: internet varken her açılışta en yeni sürümü yükler, yoksa cihazdaki kopyayla açılır.
const VERSION='paylas-v4';
const OCRC='paylas-ocr';
const FONTS='paylas-fonts';
const SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const FONT_CSS='https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Unbounded:wght@700;800&display=swap';
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()))});
async function cacheFonts(){
  try{
    const fc=await caches.open(FONTS);
    if(await fc.match(FONT_CSS,{ignoreVary:true}))return;
    const res=await fetch(FONT_CSS);if(!res.ok)return;
    await fc.put(FONT_CSS,res.clone());
    const css=await res.text();
    const urls=[...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m=>m[1]))];
    await Promise.all(urls.map(u=>fetch(u,{mode:'cors'}).then(r=>r.ok?fc.put(u,r):null).catch(()=>null)));
  }catch(e){}
}
self.addEventListener('activate',e=>{e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==VERSION&&k!==FONTS&&k!==OCRC).map(k=>caches.delete(k)));
  await self.clients.claim();
  await cacheFonts();
})())});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.hostname==='fonts.gstatic.com'||url.hostname==='fonts.googleapis.com'){
    e.respondWith((async()=>{
      const fc=await caches.open(FONTS);
      const hit=await fc.match(req,{ignoreVary:true});
      if(hit)return hit;
      try{const res=await fetch(req);if(res.ok||res.type==='opaque')fc.put(req,res.clone());return res}catch(err){return Response.error()}
    })());
    return;
  }
  if(url.hostname==='cdn.jsdelivr.net'){
    // fiş okuma paketi: bir kez indir, sonra cihazdan (internetsiz de çalışsın)
    e.respondWith((async()=>{
      const oc=await caches.open(OCRC);
      const hit=await oc.match(req);
      if(hit)return hit;
      const res=await fetch(req);if(res.ok||res.type==='opaque')e.waitUntil(oc.put(req,res.clone()));return res;
    })());
    return;
  }
  if(url.origin!==self.location.origin)return;
  const isPage=req.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('.html')||url.pathname.endsWith('.webmanifest');
  if(isPage){
    // sayfa: önce internet (her zaman en yeni sürüm), olmazsa cihazdaki kopya
    e.respondWith((async()=>{
      const c=await caches.open(VERSION);
      try{
        const res=await fetch(url.href,{cache:'no-cache'});
        if(res.ok){const copy=res.clone();e.waitUntil(Promise.all([c.put(url.href,copy.clone()),c.put(new URL('./index.html',self.registration.scope).href,copy)]))}
        return res;
      }catch(err){
        return (await c.match(url.href,{ignoreSearch:true}))||(await c.match('./index.html'))||(await c.match('./'))||Response.error();
      }
    })());
    return;
  }
  // simgeler ve diğer dosyalar: hızlı açılış için cihazdaki kopya, arkada güncelle
  const work=(async()=>{
    const c=await caches.open(VERSION);
    const hit=await c.match(req,{ignoreSearch:true});
    const net=fetch(req,{cache:'no-cache'}).then(async res=>{if(res.ok)await c.put(req,res.clone());return res}).catch(()=>hit||Response.error());
    return {hit,net};
  })();
  e.respondWith(work.then(({hit,net})=>hit||net));
  e.waitUntil(work.then(({net})=>net).catch(()=>{}));
});
