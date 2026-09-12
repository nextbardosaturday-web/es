// Match-scoped compatibility adapter: existing local readers still request JSON.
// Successful bundles are shared across the replay and sequence views.
(() => {
 const nativeFetch=globalThis.fetch.bind(globalThis),cache=new Map();
 function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
 async function unpack(buffer){
  const v=new DataView(buffer);if(v.byteLength<30||v.getUint32(0,true)!==0x04034b50||v.getUint16(8,true)!==8||v.getUint16(6,true)!==0)throw new Error('対応していないZIP形式です');
  const start=30+v.getUint16(26,true)+v.getUint16(28,true),size=v.getUint32(18,true),expected=v.getUint32(22,true);
  if(start+size>buffer.byteLength||expected>512*1024*1024)throw new Error('ZIPサイズが不正です');
  const stream=new Blob([buffer.slice(start,start+size)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
  if(bytes.length!==expected||crc32(bytes)!==v.getUint32(14,true))throw new Error('ZIPデータが破損しています');
  return JSON.parse(new TextDecoder().decode(bytes));
 }
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
  const match=url.pathname.match(/^(.*\/data\/matches)\/([\w-]+)\/([^/]+\.json)$/);
  if(url.origin!==location.origin||!match||(init?.method||input?.method||'GET')!=='GET')return nativeFetch(input,init);
  const archive=new URL(`${match[1]}/${match[2]}.zip`,url).href;
  if(!cache.has(archive)){
   const promise=nativeFetch(archive,{cache:'no-cache',signal:init?.signal}).then(async r=>{
    if(r.status===404)return null;
    if(!r.ok)throw new Error(`試合ZIPの読込失敗: HTTP ${r.status}`);
    return unpack(await r.arrayBuffer());
   });cache.set(archive,promise);promise.catch(()=>cache.delete(archive));
  }
  const bundle=await cache.get(archive);
  if(bundle===null){cache.delete(archive);return nativeFetch(input,init);}
  if(!Object.hasOwn(bundle,match[3]))return new Response('Not found',{status:404});
  return new Response(JSON.stringify(bundle[match[3]]),{headers:{'Content-Type':'application/json'}});
 };
})();
