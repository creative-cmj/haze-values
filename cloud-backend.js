/* Haze Atlas optional cloud backend. This stays safe and local-only until public Supabase config is supplied. */
(async () => {
  const config = window.HAZE_SUPABASE_CONFIG || {};
  const configured = /^https:\/\//.test(config.url || '') && !!config.anonKey;
  let client = null, session = null, saveTimer = null;
  const keys = ['haze-favorites','haze-trade-history','haze-recent-items','haze-settings','haze-atlas.event-timer'];
  const localPayload = () => ({version: 1, updatedAt: new Date().toISOString(), state: Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]))});
  const applyPayload = payload => {
    if (!payload?.state || typeof payload.state !== 'object') return false;
    keys.forEach(k => { const value = payload.state[k]; if (typeof value === 'string') localStorage.setItem(k, value); else if (value == null) localStorage.removeItem(k); });
    return true;
  };
  const api = window.HazeCloud = {
    configured, get session(){ return session; }, get status(){ return !configured ? 'not configured' : session ? 'saved' : 'signed out'; },
    async init(){
      if (!configured) return null;
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      client = createClient(config.url, config.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data } = await client.auth.getSession(); session = data.session;
      client.auth.onAuthStateChange((_event, next) => { session = next; window.dispatchEvent(new Event('hazecloudchange')); });
      return session;
    },
    async signUp(email,password){ if(!client) throw new Error('Cloud save is not configured.'); const {data,error}=await client.auth.signUp({email,password}); if(error) throw error; if(data.user) await client.from('profiles').upsert({id:data.user.id,display_name:email.split('@')[0]},{onConflict:'id'}); return data; },
    async signIn(email,password){ if(!client) throw new Error('Cloud save is not configured.'); const {data,error}=await client.auth.signInWithPassword({email,password}); if(error) throw error; session=data.session; await api.load(); return data; },
    async signOut(){ if(client) await client.auth.signOut(); session=null; window.dispatchEvent(new Event('hazecloudchange')); },
    async load(){ if(!client||!session) return null; const {data,error}=await client.from('user_states').select('payload,updated_at').eq('user_id',session.user.id).maybeSingle(); if(error) throw error; const remote=data?.payload; if(remote && Date.parse(remote.updatedAt||0)>Date.parse(localPayload().updatedAt||0)) { applyPayload(remote); location.reload(); } else await api.save(); return remote; },
    async save(){ if(!client||!session) return; const payload=localPayload(); const {error}=await client.from('user_states').upsert({user_id:session.user.id,payload,updated_at:payload.updatedAt},{onConflict:'user_id'}); if(error) throw error; window.dispatchEvent(new Event('hazecloudchange')); },
    queueSave(){ if(!session) return; clearTimeout(saveTimer); saveTimer=setTimeout(()=>api.save().catch(console.error),700); },
    isAdmin: async()=>{ if(!client||!session) return false; const {data}=await client.from('profiles').select('role').eq('id',session.user.id).maybeSingle(); return data?.role==='admin'; }
  };
  if (configured) { await api.init(); const originalSet=localStorage.setItem.bind(localStorage), originalRemove=localStorage.removeItem.bind(localStorage); localStorage.setItem=(k,v)=>{originalSet(k,v); if(keys.includes(k)) api.queueSave();}; localStorage.removeItem=k=>{originalRemove(k); if(keys.includes(k)) api.queueSave();}; }
})();
