// Deploy with: supabase functions deploy sync-snapshot
// Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY only as Supabase function secrets.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async req => {
  const auth=req.headers.get('Authorization')||'';
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token=auth.replace(/^Bearer\s+/,''); const {data:{user}}=await admin.auth.getUser(token);
  const {data:profile}=user?await admin.from('profiles').select('role').eq('id',user.id).maybeSingle():{data:null};
  if(profile?.role!=='admin') return new Response('Forbidden',{status:403});
  // The GitHub workflow remains the source fetcher. This endpoint records an audited published snapshot.
  const body=await req.json();
  const {error}=await admin.from('value_snapshots').insert({source:'github-actions',payload:body,created_by:user.id});
  if(error) return Response.json({error:error.message},{status:400});
  await admin.from('sync_runs').insert({status:'success',summary:{items:(body.items||[]).length},finished_at:new Date().toISOString(),created_by:user.id});
  return Response.json({ok:true});
});
