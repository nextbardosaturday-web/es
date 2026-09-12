(function(){
  const nativeFetch = window.fetch.bind(window);
  const pageRevision = "20260812-holdload4";
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function isMatchData(input){
    const u = typeof input === "string" ? input : (input && input.url) || "";
    return /(?:^|\/)data\/matches\//.test(u);
  }
  function bust(input, attempt){
    const raw = typeof input === "string" ? input : input.url;
    const u = new URL(raw, location.href);
    u.searchParams.set("_loadrev", `${pageRevision}_${attempt}_${Date.now()}`);
    return u.href;
  }
  window.fetch = async function(input, init){
    if(!isMatchData(input)) return nativeFetch(input, init);
    let lastError;
    for(let attempt=0; attempt<3; attempt++){
      const controller = new AbortController();
      const timeout = setTimeout(()=>controller.abort(new DOMException("match data timeout","TimeoutError")), 20000);
      try{
        const opts = Object.assign({}, init || {}, {
          cache: "no-store",
          signal: controller.signal,
          headers: Object.assign({}, (init && init.headers) || {}, {"Cache-Control":"no-cache","Pragma":"no-cache"})
        });
        const response = await nativeFetch(bust(input, attempt), opts);
        clearTimeout(timeout);
        if(response.ok) return response;
        lastError = new Error(`HTTP ${response.status}`);
      }catch(e){
        clearTimeout(timeout);
        lastError = e;
      }
      if(attempt<2) await sleep(250*(attempt+1));
    }
    throw lastError || new Error("match data load failed");
  };
})();
