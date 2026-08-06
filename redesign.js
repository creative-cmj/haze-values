/* Haze Atlas visual redesign layer. Keeps legacy routes/data intact while replacing presentation. */
const RD_VERSION='3.0.0';
const rdGet=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const rdSet=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const rdIconPaths={
  home:'<path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6"/>',
  values:'<path d="M4 5h16v14H4zM8 9h8M8 13h5M8 17h7"/>',
  power:'<path d="m13 2-8 11h6l-1 9 8-12h-6z"/>',
  trade:'<path d="M4 7h13m0 0-3-3m3 3-3 3M20 17H7m0 0 3-3m-3 3 3 3"/>',
  collection:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8v8H8z"/>',
  fruit:'<path d="M12 7c-5 0-8 3-8 7s3 7 8 7 8-3 8-7-3-7-8-7Z"/><path d="M12 7c0-3 2-5 5-5M12 7c-1-3-4-4-6-3"/>',
  crown:'<path d="m3 7 4 4 5-7 5 7 4-4-2 12H5z"/>',
  sword:'<path d="m14 4 6-2-2 6L8 18l-4 2 2-4zM13 9l2 2M4 14l6 6"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4z"/>',
  ticket:'<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4zM12 7v10"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  book:'<path d="M4 5a3 3 0 0 1 3-3h5v18H7a3 3 0 0 0-3 2zM20 5a3 3 0 0 0-3-3h-5v18h5a3 3 0 0 1 3 2z"/>',
  map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',
  ship:'<path d="M4 14h16l-3 6H7zM8 14V5h7l3 4H8M12 5V2"/>',
  tool:'<path d="M14 6a4 4 0 0 0-5-3l3 3-3 3-3-3a4 4 0 0 0 5 5l7 7 2-2-7-7a4 4 0 0 0 1-3Z"/>',
  compare:'<path d="M8 4h12M8 4l3-3M8 4l3 3M16 20H4m12 0-3-3m3 3-3 3"/>',
  heart:'<path d="M20 8c0 6-8 11-8 11S4 14 4 8a4 4 0 0 1 7-3l1 1 1-1a4 4 0 0 1 7 3Z"/>',
  news:'<path d="M4 5h16v14H4zM8 9h8M8 13h8M8 17h5"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A8 8 0 0 0 15 6l-.3-2.6h-4L10.4 6A8 8 0 0 0 9 7.1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1A8 8 0 0 0 10.4 18l.3 2.6h4L15 18a8 8 0 0 0 1.5-1.1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  chevron:'<path d="m9 18 6-6-6-6"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 9a7 7 0 0 1 12-2l2 5M18 15a7 7 0 0 1-12 2l-2-5"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
};
function rdIcon(name,label=''){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${rdIconPaths[name]||rdIconPaths.compass}</svg>${label?`<span class="sr-only">${esc(label)}</span>`:''}`}
function rdPoster(clip){return clip?.file?`./power-posters/${clip.file.replace(/\.webm$/i,'.webp')}`:''}
function rdRelative(value){if(!value)return 'Not checked yet';const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));if(seconds<45)return 'Checked just now';if(seconds<3600)return `Checked ${Math.floor(seconds/60)} minute${seconds<120?'':'s'} ago`;if(seconds<86400)return `Checked ${Math.floor(seconds/3600)} hour${seconds<7200?'':'s'} ago`;return `Checked ${Math.floor(seconds/86400)} day${seconds<172800?'':'s'} ago`}
function rdFormatValue(value){return Number.isFinite(value)?new Intl.NumberFormat('en-US',{notation:value>=1000000?'compact':'standard',maximumFractionDigits:1}).format(value):'—'}
function rdUniqueItems(){return [...data.items.reduce((map,item)=>(map.has(item.id)||map.set(item.id,item),map),new Map()).values()]}
function rdChanges(){return rdGet('haze-value-changelog-v4',[])}
function rdTrackSnapshot(nextData){if(!nextData?.items?.length)return;const previous=rdGet('haze-value-snapshot-v4',null),now=new Date().toISOString(),items=[...nextData.items.reduce((m,x)=>(m.has(x.id)||m.set(x.id,x),m),new Map()).values()],current=Object.fromEntries(items.map(x=>[x.id,{id:x.id,name:x.name,category:x.category,value:x.value,valueText:x.valueText,demand:x.demand,checkedAt:now}]));if(previous){const changes=[];for(const item of items){const old=previous[item.id];if(!old)continue;if(old.value!==item.value||old.valueText!==item.valueText||old.demand!==item.demand){const direction=(item.value||0)>(old.value||0)?'up':(item.value||0)<(old.value||0)?'down':'same';changes.push({id:item.id,name:item.name,category:item.category,previousValue:old.value,previousText:old.valueText||'Unlisted',value:item.value,valueText:item.valueText||'Unlisted',previousDemand:old.demand,demand:item.demand,direction,updatedAt:now})}}if(changes.length){const merged=[...changes,...rdChanges()].slice(0,300);rdSet('haze-value-changelog-v4',merged);rdShowUpdateNotice(changes.length,now)}}rdSet('haze-value-snapshot-v4',current)}
function rdArt(item){const detail=trello?.items?.[item.id];return detail?.image?`./item-thumbnails/${encodeURIComponent(item.id)}.webp`:fallbackArt?.has(item.id)?`./item-thumbnails/${encodeURIComponent(item.id)}.svg`:'./trello-images/item-placeholder.webp'}
function rdDashboard(){const items=rdUniqueItems(),listed=items.filter(x=>x.value!=null),changes=rdChanges(),groups=enhanceReady?galleryGroups().toSorted((a,b)=>(b.latest||0)-(a.latest||0)):[],freshGroups=groups.slice(0,6),collectionItems=items.filter(x=>atlasCollection[x.id]?.owned),collectionValue=collectionItems.reduce((sum,x)=>sum+(x.value||0),0),missingBuilds=[...new Set(savedBuilds.flatMap(b=>Object.values(b.parts||{})).filter(Boolean).filter(id=>!atlasCollection[id]?.owned))],wanted=items.filter(x=>atlasCollection[x.id]?.wanted),favoritesOwned=collectionItems.filter(x=>atlasCollection[x.id]?.favorite),snapshotRows=changes.length?changes.slice(0,6):listed.toSorted((a,b)=>(b.value||0)-(a.value||0)).slice(0,6),snapshotTitle=changes.length?'Recently updated values':'Current value snapshot';const codes=typeof parseOfficialCodes==='function'?parseOfficialCodes().slice(0,6):[];
return `<div class="atlas-dashboard">
<section class="atlas-hero"><div class="hero-compass" aria-hidden="true"></div><div class="hero-copy"><p class="eyebrow">THE COMPLETE HAZE SEAS COMPANION</p><h1>Haze Atlas</h1><p>Values, official powers, codes, builds, trading tools, and collection tracking—charted in one fast, reliable pirate database.</p><div class="hero-actions"><button class="primary" data-rd-page="items">Explore values</button><button class="secondary" data-rd-page="codes">Redeem codes</button><button class="secondary" data-rd-page="trade">Trade calculator</button></div></div></section>
<section class="dashboard-actions" aria-label="Quick navigation">${[['values','items','Values',`${items.length} tracked items`],['power','gallery','Powers',`${mediaManifest.items.length} official videos`],['ticket','codes','Codes',`${typeof parseOfficialCodes==='function'?parseOfficialCodes().length:0} redeemables`],['trade','trade','Trade',`${savedOffers.length} saved offers`]].map(([icon,target,label,meta])=>`<button class="dashboard-action" data-rd-page="${target}">${rdIcon(icon)}<b>${label}</b><small>${meta}</small></button>`).join('')}</section>
${codes.length?`<section class="panel codes-strip"><div class="panel-title"><h2>Active codes</h2><button type="button" data-rd-page="codes">View all →</button></div><div class="codes-strip-list">${codes.map((c,i)=>`<article class="code-tile"><div class="code-tile-header"><img src="${rdCodeArt(i)}" alt="" class="code-tile-art" loading="lazy"><div class="code-tile-body"><code class="code-tile-code">${esc(c.code)}</code><p class="code-tile-reward">${esc(c.reward)}</p></div></div><button type="button" class="code-tile-copy" data-copy-code="${esc(c.code)}" aria-label="Copy code ${esc(c.code)}">Copy</button></article>`).join('')}</div><p class="panel-note codes-strip-note">Official Trello · tap <strong>Copy</strong> · redeem in-game via Menu → gift box</p></section>`:''}
<div class="dashboard-columns"><div class="dashboard-stack"><section class="panel"><div class="panel-title"><h2>${snapshotTitle}</h2><button data-rd-changelog>${changes.length?'Open changelog':'About updates'} →</button></div><div class="compact-value-list">${snapshotRows.map(change=>{const item=items.find(x=>x.id===change.id)||change,isChange='updatedAt'in change;return `<button class="compact-value-row" data-item="${esc(item.id)}"><img loading="lazy" src="${rdArt(item)}" alt=""><span><b>${esc(item.name)}</b><small>${esc(item.category)} · ${esc(item.demand||'Unknown demand')}${isChange?` · ${rdRelative(change.updatedAt).replace('Checked ','')}`:''}</small></span><span><strong>${esc(item.valueText||change.valueText||'Unlisted')}</strong>${isChange?`<small class="value-change ${change.direction}">${esc(change.previousText)} →</small>`:''}</span></button>`}).join('')}</div></section>
<section class="panel"><div class="panel-title"><h2>Newly added powers</h2><button data-rd-page="gallery">View all →</button></div>${freshGroups.length?`<div class="new-power-strip">${freshGroups.map(g=>`<button class="mini-poster" data-open-media="${esc(g.name)}"><img loading="lazy" src="${rdPoster(g.clips[0])}" alt="${esc(g.name)} power poster"><div><b>${esc(g.name)}</b><small>${esc(g.categories.join(' · '))} · ${g.clips.length} videos</small></div></button>`).join('')}</div>`:'<div class="dashboard-empty">The official power catalog is loading. Its newest movesets will appear here.</div>'}</section></div>
<aside class="dashboard-stack">
<section class="panel"><div class="panel-title"><h2>Your collection</h2><button type="button" data-rd-page="collection">Open →</button></div>${collectionItems.length?`<div class="collection-summary"><div><small>Owned</small><strong>${collectionItems.length}</strong></div><div><small>Completion</small><strong>${Math.round(collectionItems.length/items.length*100)}%</strong></div><div><small>Total value</small><strong>${rdFormatValue(collectionValue)}</strong></div><div><small>Favorites</small><strong>${favoritesOwned.length}</strong></div></div><p class="panel-note">${missingBuilds.length} missing saved-build part${missingBuilds.length===1?'':'s'} · ${wanted.length} trade goal${wanted.length===1?'':'s'}</p>`:`<div class="dashboard-empty"><b>Start charting your inventory.</b><p class="panel-note">Mark items as owned, wanted, or for trade to unlock collection totals and build progress.</p><button class="secondary" data-rd-page="collection">Start collection</button></div>`}</section>
<section class="panel panel-compact"><div class="panel-title"><h2>Official links</h2></div><div class="official-links">${[['Play Haze Seas','https://www.roblox.com/games/6918802270/Haze-Seas'],['Discord','https://discord.gg/hazeseas'],['Trello','https://trello.com/b/nn8bpTB0/haze-seas-official-trello'],['X / Twitter','https://x.com/Haze_Seas']].map(([label,href])=>`<a href="${href}" target="_blank" rel="noopener"><span>${esc(label)}</span><em>↗</em></a>`).join('')}</div></section>
<section class="panel panel-compact source-status-panel"><div class="panel-title"><h2>Source status</h2></div><div class="source-status-row"><span class="status-live-dot" aria-hidden="true"></span><div><strong>${esc(data.sync?.status||'Snapshot ready')}</strong><p class="panel-note" data-relative-time="${esc(data.sync?.lastChecked||data.updatedAt)}">${rdRelative(data.sync?.lastChecked||data.updatedAt)}</p></div></div><button type="button" class="secondary source-refresh-btn" data-rd-refresh>${rdIcon('refresh')}<span>Reload snapshot</span></button></section>
</aside></div>
<footer class="atlas-site-footer" aria-label="About this companion">
  <div class="footer-notes">
    <div class="footer-note"><small>Affiliation</small><span>Fan-made companion — not affiliated with Roblox or Haze Studios</span></div>
    <div class="footer-note"><small>Values</small><span>Community value-list estimates for trading context</span></div>
    <div class="footer-note"><small>Gameplay</small><span>Official Haze Seas Trello for systems &amp; guides</span></div>
  </div>
</footer>
</div>`}

function rdSidebarButton(pageName,icon,label,badge=''){const fav=pageName==='favorites',count=String(badge??''),showBadge=count!==''&&count!=='0';return `<button type="button" data-page="${pageName}" class="nav-item" aria-label="${esc(label)}" title="${esc(label)}"><span class="nav-icon">${rdIcon(icon)}</span><span class="nav-label">${esc(label)}</span>${fav||showBadge?`<i class="nav-badge${showBadge?'':' is-empty'}" ${fav?'id="favCount"':''}>${showBadge?esc(count):''}</i>`:''}</button>`}
function rdLinkIsActive(pageName){return pageName===page||(typeof page==='string'&&pageName===page)}
function rdSidebar(){const mark=document.querySelector('.brand-mark');if(mark)mark.innerHTML='<img src="assets/haze-atlas-icon.webp" alt="" width="32" height="32">';const collapse=$('#collapse');if(collapse){collapse.innerHTML=rdIcon('chevron');collapse.setAttribute('aria-label','Collapse sidebar');collapse.title='Collapse sidebar';collapse.classList.add('nav-collapse-btn')}
const reopen=$('#sidebarToggle');if(reopen){reopen.innerHTML=rdIcon('menu');reopen.setAttribute('aria-label','Expand sidebar')}
const nav=$('#nav');if(!nav)return;
const favCount=typeof favorites!=='undefined'&&Array.isArray(favorites)?String(favorites.length):'';
const groups=[
  ['browse','Browse values',[
    ['fruits','fruit','Fruits'],
    ['swords','sword','Weapons'],
    ['accessories','crown','Accessories'],
    ['misc items','compass','Materials'],
    ['gamepasses','ticket','Gamepasses'],
    ['perm fruits (robux)','fruit','Perm fruits'],
    ['updates','clock','Value changes']
  ]],
  ['world','World & guide',[
    ['codes','ticket','Codes'],
    ['systems','book','Game systems'],
    ['content:Bosses','compass','Bosses'],
    ['content:Sea Events','ship','Sea events'],
    ['content:Races','user','Races'],
    ['content:Fighting Styles','sword','Fighting styles'],
    ['content:Sea 1 Locations','map','Sea 1'],
    ['content:Sea 2 Locations','map','Sea 2'],
    ['content:Sea 3 Locations','map','Sea 3'],
    ['content:NPCs','user','NPCs'],
    ['content:Skill Trainers','book','Skill trainers'],
    ['content:Fishing','compass','Fishing'],
    ['content:Ships','ship','Ships'],
    ['releases','clock','Release tracker'],
    ['news','news','What’s new']
  ]],
  ['tools','Tools',[
    ['builds','tool','Build planner'],
    ['mastery','compass','Mastery XP'],
    ['compare','compare','Compare'],
    ['timers','clock','Boss timers'],
    ['ideas','trade','Trade ideas'],
    ['history','clock','Trade history'],
    ['dataStatus','news','Data status']
  ]],
  ['you','You',[
    ['favorites','heart','Favorites',favCount],
    ['tutorial','book','Trading guide']
  ]]
];
const defaults={browse:true,world:false,tools:false,you:false};
const state={...defaults,...rdGet('haze-nav-groups-v2',{})};
// Keep the section that owns the current page open so users never land “lost”.
for(const [id,,links] of groups){if(links.some(([pageName])=>rdLinkIsActive(pageName)))state[id]=true}
nav.innerHTML=`
  <div class="nav-section nav-primary-section">
    <p class="nav-section-label">Main</p>
    <div class="nav-primary">
      ${rdSidebarButton('home','home','Home')}
      ${rdSidebarButton('items','values','Values')}
      ${rdSidebarButton('gallery','power','Powers')}
      ${rdSidebarButton('trade','trade','Trade')}
      ${rdSidebarButton('collection','collection','Collection')}
    </div>
  </div>
  ${groups.map(([id,label,links])=>`
    <section class="nav-group ${state[id]?'open':''}" data-nav-group="${id}">
      <button type="button" class="nav-group-toggle" aria-expanded="${state[id]?'true':'false'}">
        <span class="nav-group-title">${esc(label)}</span>
        <span class="nav-group-meta">${links.length}</span>
        <span class="nav-group-chevron" aria-hidden="true">${rdIcon('chevron')}</span>
      </button>
      <div class="nav-group-links" role="group" aria-label="${esc(label)}">
        ${links.map(([pageName,icon,labelText,badge])=>rdSidebarButton(pageName,icon,labelText,badge||'')).join('')}
      </div>
    </section>`).join('')}
`;
if(!nav.dataset.navBound){
  nav.dataset.navBound='true';
  nav.addEventListener('click',event=>{
    const toggle=event.target.closest('.nav-group-toggle');
    if(toggle){
      event.preventDefault();
      event.stopPropagation();
      const section=toggle.closest('.nav-group');
      const id=section.dataset.navGroup;
      const open=!section.classList.contains('open');
      section.classList.toggle('open',open);
      toggle.setAttribute('aria-expanded',open?'true':'false');
      const next={...rdGet('haze-nav-groups-v2',defaults),[id]:open};
      rdSet('haze-nav-groups-v2',next);
      return;
    }
    if(event.target.closest('[data-page]')&&innerWidth<=820)rdToggleMobileNav(false);
  });
}
const foot=document.querySelector('.sidebar-foot');
if(foot&&!foot.dataset.polished){
  foot.dataset.polished='true';
  foot.innerHTML=`
    <div class="sidebar-foot-inner">
      <button type="button" data-page="settings" class="nav-item nav-settings" aria-label="Settings" title="Settings">
        <span class="nav-icon">${rdIcon('settings')}</span>
        <span class="nav-label">Settings</span>
      </button>
      <p class="nav-source-note">Values · community list<br>Guides · official Trello</p>
    </div>`;
  foot.querySelector('[data-page="settings"]').onclick=()=>go('settings');
}
rdSyncNavigation()}
function rdPaintRefresh(){const refresh=$('#refresh');if(!refresh)return;const busy=refresh.classList.contains('is-busy')||refresh.disabled;refresh.className='topbar-btn topbar-btn-icon';refresh.type='button';refresh.setAttribute('aria-label',busy?'Checking for updates…':'Reload value snapshot');refresh.title=busy?'Checking…':'Reload snapshot';refresh.innerHTML=`${rdIcon('refresh')}<span class="sr-only">${busy?'Checking':'Refresh'}</span>`}
function rdCompactRelative(value){
  if(!value)return 'Ready';
  const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));
  if(seconds<45)return 'Just now';
  if(seconds<3600)return `${Math.floor(seconds/60)}m ago`;
  if(seconds<86400)return `${Math.floor(seconds/3600)}h ago`;
  return `${Math.floor(seconds/86400)}d ago`;
}
function rdPaintStatus(){const updated=$('#updated');if(!updated)return;const when=data?.sync?.lastChecked||data?.updatedAt||'';updated.removeAttribute('data-relative-time');updated.className='topbar-status';const label=rdCompactRelative(when);updated.innerHTML=`<span class="topbar-status-dot" aria-hidden="true"></span><span class="topbar-status-text">${esc(label)}</span>`;updated.title=when?`Last checked ${new Date(when).toLocaleString()}`:'Data status'}
function rdTopbar(){
  const bar=document.querySelector('.topbar');
  if(!bar||bar.dataset.redesigned)return;
  bar.dataset.redesigned='true';

  // Preserve live nodes the app already wires up.
  const menu=bar.querySelector('.mobile-menu');
  const search=bar.querySelector('.search-wrap');
  const refresh=bar.querySelector('#refresh');
  const updated=bar.querySelector('#updated');
  const notice=bar.querySelector('#notice');
  const settings=bar.querySelector('[data-page="settings"]');

  // Symmetric shell: left rail | centered search | right actions
  const left=document.createElement('div');
  left.className='topbar-left';
  const center=document.createElement('div');
  center.className='topbar-center';
  const right=document.createElement('div');
  right.className='topbar-right';
  const tools=document.createElement('div');
  tools.className='top-tools';
  tools.setAttribute('role','toolbar');
  tools.setAttribute('aria-label','App actions');

  menu.className='topbar-btn topbar-btn-icon mobile-menu';
  menu.type='button';
  menu.innerHTML=rdIcon('menu');
  menu.setAttribute('aria-label','Open navigation');
  menu.title='Menu';

  const mobileSearch=document.createElement('button');
  mobileSearch.type='button';
  mobileSearch.className='topbar-btn topbar-btn-icon mobile-search-button';
  mobileSearch.setAttribute('aria-label','Open search');
  mobileSearch.title='Search';
  mobileSearch.innerHTML=rdIcon('search');

  search.classList.add('topbar-search');
  const searchIcon=search.querySelector('span')||document.createElement('span');
  searchIcon.className='search-icon';
  searchIcon.innerHTML=rdIcon('search');
  if(!searchIcon.parentElement)search.prepend(searchIcon);
  const input=search.querySelector('input');
  input.placeholder='Search values, powers, codes, guides…';
  input.setAttribute('aria-label','Search Haze Atlas');
  const clear=search.querySelector('#clearSearch');
  if(clear){
    clear.className='search-clear';
    clear.type='button';
    clear.setAttribute('aria-label','Clear search');
    clear.innerHTML='×';
  }
  // Subtle desktop shortcut chip
  let kbd=search.querySelector('.search-kbd');
  if(!kbd){
    kbd=document.createElement('kbd');
    kbd.className='search-kbd';
    kbd.textContent=navigator.platform?.toLowerCase().includes('mac')?'⌘K':'Ctrl K';
    search.append(kbd);
  }

  refresh.className='topbar-btn topbar-btn-icon';
  notice.className='topbar-btn topbar-btn-icon';
  notice.type='button';
  notice.innerHTML=rdIcon('news');
  notice.setAttribute('aria-label','Recent value changes');
  notice.title='Recent changes';
  settings.className='topbar-btn topbar-btn-icon';
  settings.type='button';
  settings.innerHTML=rdIcon('settings');
  settings.setAttribute('aria-label','Settings');
  settings.title='Settings';

  left.append(menu,mobileSearch);
  center.append(search);
  // Status sits outside the icon cluster so the right rail stays balanced.
  tools.append(refresh,notice,settings);
  right.append(updated,tools);

  bar.replaceChildren(left,center,right);
  rdPaintRefresh();
  rdPaintStatus();

  // Keep refresh icon stable when legacy refresh() rewrites button content.
  new MutationObserver(()=>{
    if(!refresh.querySelector('svg'))rdPaintRefresh();
  }).observe(refresh,{childList:true,characterData:true,subtree:true});

  // Hide clear until there is text; hide kbd while typing.
  const syncSearchChrome=()=>{
    const has=!!input.value;
    search.classList.toggle('has-value',has);
    search.classList.toggle('is-focused',document.activeElement===input);
  };
  input.addEventListener('input',syncSearchChrome);
  input.addEventListener('focus',syncSearchChrome);
  input.addEventListener('blur',syncSearchChrome);
  syncSearchChrome();

  notice.onclick=rdOpenChangelog;
  settings.onclick=()=>go('settings');
  mobileSearch.onclick=rdOpenSearchSheet;
  menu.onclick=()=>rdToggleMobileNav(true);
}
function rdToggleMobileNav(open){let backdrop=document.querySelector('#mobileNavBackdrop');if(!backdrop){backdrop=document.createElement('button');backdrop.id='mobileNavBackdrop';backdrop.setAttribute('aria-label','Close navigation');document.body.append(backdrop);backdrop.onclick=()=>rdToggleMobileNav(false)}document.body.classList.toggle('mobile-nav-open',open);backdrop.hidden=!open}
function rdMobileBottom(){const bottom=document.querySelector('.mobile-bottom');if(!bottom)return;const icons={home:'home',items:'values',gallery:'power',trade:'trade',collection:'collection'};bottom.querySelectorAll('[data-page]').forEach(button=>{const label=button.querySelector('span')?.textContent||button.dataset.page;button.innerHTML=rdIcon(icons[button.dataset.page])+
`<span>${esc(label)}</span>`;button.setAttribute('aria-label',label);button.classList.toggle('active',button.dataset.page===page)})}
function rdSyncNavigation(){document.querySelectorAll('#nav [data-page],.sidebar-foot [data-page],.mobile-bottom [data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
// Ensure the section that owns the active page is expanded so the active item is visible.
document.querySelectorAll('#nav .nav-group').forEach(section=>{
  const owns=[...section.querySelectorAll('[data-page]')].some(el=>el.dataset.page===page);
  if(owns&&!section.classList.contains('open')){
    section.classList.add('open');
    section.querySelector('.nav-group-toggle')?.setAttribute('aria-expanded','true');
  }
});
const badge=$('#favCount');
if(badge){const n=typeof favorites!=='undefined'?favorites.length:0;badge.textContent=n||'';badge.classList.toggle('is-empty',!n)}
rdPaintRefresh();
rdPaintStatus()}

function rdShowUpdateNotice(count,when){if(!count)return;const signature=`${when}:${count}`;if(rdGet('haze-update-dismissed-v1','')===signature)return;document.querySelector('#redesignNotice')?.remove();const notice=document.createElement('aside');notice.id='redesignNotice';notice.dataset.signature=signature;notice.setAttribute('role','status');notice.innerHTML=`<span class="notice-icon">${rdIcon('refresh')}</span><span class="notice-copy"><b>${count} value${count===1?'':'s'} updated</b><small>${rdRelative(when)}</small></span><span class="notice-actions"><button data-rd-changelog>View changes</button><button class="notice-dismiss" aria-label="Dismiss update notification">×</button></span>`;($('#view')||document.body).prepend(notice);notice.querySelector('[data-rd-changelog]').onclick=rdOpenChangelog;notice.querySelector('.notice-dismiss').onclick=()=>{rdSet('haze-update-dismissed-v1',signature);notice.remove()}}
function rdToast(message){if(/^Updated:/i.test(message))return;const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(rdToast.timer);rdToast.timer=setTimeout(()=>el.classList.remove('show'),3600)}
function rdChangelogRows(){const q=(document.querySelector('#changeSearch')?.value||'').toLowerCase(),category=document.querySelector('#changeCategory')?.value||'all',direction=document.querySelector('#changeDirection')?.value||'all',days=Number(document.querySelector('#changeDate')?.value||0),cutoff=days?Date.now()-days*86400000:0;return rdChanges().filter(x=>(!q||`${x.name} ${x.category}`.toLowerCase().includes(q))&&(category==='all'||x.category===category)&&(direction==='all'||x.direction===direction)&&(!cutoff||new Date(x.updatedAt).getTime()>=cutoff))}
function rdRenderChangelog(){const list=document.querySelector('.changelog-list');if(!list)return;const rows=rdChangelogRows();list.innerHTML=rows.length?rows.map(change=>{const item=data.items.find(x=>x.id===change.id)||change;return `<button class="change-row" data-item="${esc(change.id)}"><img loading="lazy" src="${rdArt(item)}" alt=""><span><b>${esc(change.name)}</b><small>${esc(change.category)} · ${rdRelative(change.updatedAt).replace('Checked ','')} · Demand ${esc(change.previousDemand||'—')} → ${esc(change.demand||'—')}</small></span><span class="change-values"><strong class="change-direction ${change.direction}">${esc(change.valueText)}</strong><del>${esc(change.previousText)}</del></span></button>`}).join(''):`<div class="dashboard-empty"><b>No recorded value changes yet.</b><br>Haze Atlas stores real differences when a newer official snapshot changes value or demand. Nothing is fabricated for a first-time visitor.</div>`;list.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>{document.querySelector('#changelogDrawer')?.close();detail(b.dataset.item)})}
function rdOpenChangelog(){let dialog=document.querySelector('#changelogDrawer');if(!dialog){dialog=document.createElement('dialog');dialog.id='changelogDrawer';dialog.className='changelog-drawer';dialog.setAttribute('aria-label','Recent value snapshot changes');document.body.append(dialog)}const categories=[...new Set(rdChanges().map(x=>x.category))].sort();dialog.innerHTML=`<div class="drawer-shell"><header class="drawer-head"><div><p class="eyebrow">SNAPSHOT VALUE HISTORY</p><h2>Recent changes</h2><p class="muted">Changes recorded when bundled value snapshots differ on this device. Last checked ${esc(new Date(data.sync?.lastChecked||data.updatedAt).toLocaleString())}. ${data.source?`<a href="${esc(data.source)}" target="_blank" rel="noopener">Open raw source</a>`:''}</p></div><button class="drawer-close" aria-label="Close changelog">×</button></header><div class="drawer-filters"><input id="changeSearch" placeholder="Search changed items…" aria-label="Search changelog"><select id="changeCategory" aria-label="Filter changelog category"><option value="all">All categories</option>${categories.map(x=>`<option>${esc(x)}</option>`).join('')}</select><select id="changeDate" aria-label="Filter changelog date"><option value="0">All dates</option><option value="1">Past 24 hours</option><option value="7">Past 7 days</option><option value="30">Past 30 days</option></select><select id="changeDirection" aria-label="Filter change direction"><option value="all">All changes</option><option value="up">Increased</option><option value="down">Decreased</option><option value="same">Demand only</option></select></div><div class="changelog-list"></div></div>`;dialog.querySelector('.drawer-close').onclick=()=>dialog.close();dialog.querySelectorAll('input,select').forEach(x=>x.oninput=rdRenderChangelog);rdRenderChangelog();if(!dialog.open)dialog.showModal()}

function rdCollectionState(group){const keys=new Set([group.name,...group.clips.flatMap(x=>x.cards)].map(norm));for(const item of data.items){if(keys.has(norm(item.name))){const rec=atlasCollection[item.id]||{};if(rec.favorite)return'favorite';if(rec.owned)return'owned';if(rec.wanted)return'wanted'}}return'none'}
function rdGalleryFiltered(){const q=(featureState.galleryQuery||'').toLowerCase(),min=Number(featureState.galleryVideoMin||0),state=featureState.galleryCollection||'all';let groups=galleryGroups().filter(g=>(featureState.galleryCategory==='all'||g.categories.includes(featureState.galleryCategory))&&(featureState.galleryFresh==='all'||(g.latest&&Date.now()-g.latest<45*86400000))&&g.clips.length>=min&&(state==='all'||rdCollectionState(g)===state)&&(!q||g.name.toLowerCase().includes(q)||g.clips.some(c=>c.cards.join(' ').toLowerCase().includes(q))));groups.sort(featureState.gallerySort==='videos'?((a,b)=>b.clips.length-a.clips.length):featureState.gallerySort==='newest'?((a,b)=>(b.latest||0)-(a.latest||0)):((a,b)=>a.name.localeCompare(b.name)));return groups}
function rdActiveFilters(){const chips=[];if(featureState.galleryCategory!=='all')chips.push(['category',featureState.galleryCategory]);if(featureState.galleryFresh!=='all')chips.push(['fresh','New only']);if(featureState.galleryVideoMin)chips.push(['videos',`${featureState.galleryVideoMin}+ videos`]);if(featureState.galleryCollection&&featureState.galleryCollection!=='all')chips.push(['collection',title(featureState.galleryCollection)]);return chips}
function rdPosterMarkup(group){const poster=rdPoster(group.clips[0]);return poster?`<img loading="lazy" src="${poster}" alt="${esc(group.name)} official gameplay poster" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><div class="poster-fallback" hidden><span>${esc(group.name)}</span></div>`:`<div class="poster-fallback"><span>${esc(group.name)}</span></div>`}
function rdPowerGallery(){
  featureState.galleryView=featureState.galleryView||rdGet('haze-gallery-view-v1','grid');
  featureState.galleryVideoMin=featureState.galleryVideoMin||0;
  featureState.galleryCollection=featureState.galleryCollection||'all';
  const groups=enhanceReady?rdGalleryFiltered():[],totalVideos=groups.reduce((sum,g)=>sum+g.clips.length,0),size=24,pages=Math.max(1,Math.ceil(groups.length/size));
  featureState.galleryPage=Math.min(featureState.galleryPage,pages);
  const shown=groups.slice((featureState.galleryPage-1)*size,featureState.galleryPage*size),chips=rdActiveFilters();
  const filters=`<section class="panel gallery-filter-shell"><div class="gallery-filter-row"><input id="gallerySearch" value="${esc(featureState.galleryQuery||'')}" placeholder="Search powers or forms…" aria-label="Search power gallery"><select id="galleryCategory" aria-label="Power category"><option value="all">All categories</option>${['Fruits','Forms','Swords','Fighting Styles','Races','Abilities'].map(x=>`<option ${featureState.galleryCategory===x?'selected':''}>${x}</option>`).join('')}</select><select id="galleryFresh" aria-label="New status"><option value="all">Any date</option><option value="new" ${featureState.galleryFresh==='new'?'selected':''}>New only</option></select><select class="desktop-extra-filter" id="galleryVideoMin" aria-label="Minimum video count"><option value="0">Any video count</option>${[3,5,8].map(x=>`<option value="${x}" ${Number(featureState.galleryVideoMin)===x?'selected':''}>${x}+ videos</option>`).join('')}</select><select class="desktop-extra-filter" id="galleryCollection" aria-label="Collection state"><option value="all">Any collection state</option>${['owned','wanted','favorite'].map(x=>`<option value="${x}" ${featureState.galleryCollection===x?'selected':''}>${title(x)}</option>`).join('')}</select><select id="gallerySort" aria-label="Sort powers"><option value="name" ${featureState.gallerySort==='name'?'selected':''}>Name</option><option value="videos" ${featureState.gallerySort==='videos'?'selected':''}>Most videos</option><option value="newest" ${featureState.gallerySort==='newest'?'selected':''}>Newest</option></select><button class="mobile-filter-trigger" id="mobileGalleryFilters">Filters${chips.length?` (${chips.length})`:''}</button><div class="view-toggle" aria-label="Gallery view"><button data-gallery-view="grid" class="${featureState.galleryView==='grid'?'active':''}" aria-label="Poster grid">▦</button><button data-gallery-view="list" class="${featureState.galleryView==='list'?'active':''}" aria-label="Compact list">☷</button></div></div>${chips.length?`<div class="filter-chip-row">${chips.map(([key,label])=>`<button class="filter-chip" data-clear-gallery-filter="${key}">${esc(label)} ×</button>`).join('')}<button class="filter-clear" id="clearGalleryFilters">Clear all</button></div>`:''}</section>`;
  let body='';
  if(!enhanceReady)body=loadingState('Loading official poster catalog…');
  else if(!shown.length)body=emptyState('No powers match those filters.','Remove a filter or clear the search.');
  else{
    body=featureState.galleryView==='list'?`<div class="power-gallery-list">${shown.map(g=>`<article class="power-list-row"><img loading="lazy" src="${rdPoster(g.clips[0])}" alt="${esc(g.name)} poster"><div><h3>${esc(g.name)} ${g.latest&&Date.now()-g.latest<45*86400000?'<span class="new-badge">NEW</span>':''}</h3><p>${esc(g.categories.join(' · '))}</p></div><span class="list-count">${g.clips.length} videos</span><button class="secondary" data-open-media="${esc(g.name)}">View moves</button></article>`).join('')}</div>`:`<div class="power-gallery-grid">${shown.map(g=>`<article class="power-gallery-card"><div class="gallery-card-art">${rdPosterMarkup(g)}<span class="count-badge">${g.clips.length} videos</span>${g.latest&&Date.now()-g.latest<45*86400000?'<span class="new-badge">NEW</span>':''}</div><div class="power-card-copy"><h3>${esc(g.name)}</h3><p>${g.categories.map(c=>`<span class="pill">${esc(c)}</span>`).join(' ')}</p><button class="primary gallery-card-open" data-open-media="${esc(g.name)}">View moves</button></div></article>`).join('')}</div>`;
    body+=`<nav class="pagination" aria-label="Power gallery pages"><button class="secondary" data-gallery-page="${featureState.galleryPage-1}" ${featureState.galleryPage===1?'disabled':''}>← Previous</button><span>Page ${featureState.galleryPage} of ${pages} · ${groups.length} powers</span><button class="secondary" data-gallery-page="${featureState.galleryPage+1}" ${featureState.galleryPage===pages?'disabled':''}>Next →</button></nav>`;
  }
  return `<div class="page-head"><div><p class="eyebrow">OFFICIAL GAMEPLAY ARCHIVE</p><h1>Power Gallery</h1><p class="muted">Browse complete movesets through cached posters. Videos load only when you open one.</p></div><div class="gallery-header-meta"><span class="source-chip">${groups.length} powers</span><span class="source-chip">${totalVideos} videos</span></div></div>${filters}${body}`;
}
function rdOpenFilterSheet(){let dialog=document.querySelector('#galleryFilterSheet');if(!dialog){dialog=document.createElement('dialog');dialog.id='galleryFilterSheet';dialog.className='gallery-filter-sheet';dialog.setAttribute('aria-label','Haze Atlas controls');document.body.append(dialog)}dialog.innerHTML=`<div class="sheet-handle"></div><header class="sheet-head"><div><p class="eyebrow">POWER GALLERY</p><h2>Filters</h2></div><button class="drawer-close" aria-label="Close filters">×</button></header><div class="sheet-controls"><label><span>Category</span><select data-sheet-filter="galleryCategory"><option value="all">All categories</option>${['Fruits','Forms','Swords','Fighting Styles','Races','Abilities'].map(x=>`<option ${featureState.galleryCategory===x?'selected':''}>${x}</option>`).join('')}</select></label><label><span>New status</span><select data-sheet-filter="galleryFresh"><option value="all">Any date</option><option value="new" ${featureState.galleryFresh==='new'?'selected':''}>New only</option></select></label><label><span>Video count</span><select data-sheet-filter="galleryVideoMin"><option value="0">Any count</option>${[3,5,8].map(x=>`<option value="${x}" ${Number(featureState.galleryVideoMin)===x?'selected':''}>${x}+ videos</option>`).join('')}</select></label><label><span>Collection</span><select data-sheet-filter="galleryCollection"><option value="all">Any state</option>${['owned','wanted','favorite'].map(x=>`<option value="${x}" ${featureState.galleryCollection===x?'selected':''}>${title(x)}</option>`).join('')}</select></label><label><span>Sort</span><select data-sheet-filter="gallerySort"><option value="name" ${featureState.gallerySort==='name'?'selected':''}>Name</option><option value="videos" ${featureState.gallerySort==='videos'?'selected':''}>Most videos</option><option value="newest" ${featureState.gallerySort==='newest'?'selected':''}>Newest</option></select></label><button class="primary" id="applyGallerySheet">Show results</button></div>`;dialog.querySelector('.drawer-close').onclick=()=>dialog.close();dialog.querySelectorAll('[data-sheet-filter]').forEach(select=>select.onchange=()=>{featureState[select.dataset.sheetFilter]=select.dataset.sheetFilter==='galleryVideoMin'?Number(select.value):select.value;featureState.galleryPage=1});dialog.querySelector('#applyGallerySheet').onclick=()=>{dialog.close();render()};dialog.showModal()}

function rdOpenViewer(name,index=0){const clips=relatedClips(name);if(!clips.length)return rdToast('No official previews found');const safeIndex=Math.max(0,Math.min(index,clips.length-1)),clip=clips[safeIndex],category=classifyPower(clip.cards[0]),dialog=document.querySelector('#mediaViewer')||rdCreateViewer();dialog.dataset.name=name;dialog.dataset.index=String(safeIndex);dialog.querySelector('.viewer-body').innerHTML=`<header class="viewer-top"><div class="viewer-title"><p class="eyebrow">${esc(category)} · MOVE ${safeIndex+1} OF ${clips.length}</p><h2>${esc(name)}</h2><div class="viewer-meta"><span>${esc(clip.cards.join(' · '))}</span><span>${clips.length} official videos</span></div></div><button class="viewer-close" aria-label="Close video viewer">×</button></header><div class="viewer-stage"><video controls playsinline preload="metadata" poster="${rdPoster(clip)}"><source src="./power-media/${esc(clip.file)}" type="video/webm"></video><button class="viewer-fullscreen" aria-label="Enter full screen">⛶</button></div><div class="viewer-rail" aria-label="Related moves">${clips.map((item,i)=>`<button class="viewer-thumb ${i===safeIndex?'selected':''}" data-viewer-index="${i}" aria-label="Open move ${i+1}"><img loading="lazy" src="${rdPoster(item)}" alt=""><span>Move ${i+1} · ${esc(item.cards.join(' / '))}</span></button>`).join('')}</div><footer class="viewer-foot"><p class="muted">Use ← and → to move through this moveset.</p><div class="viewer-actions"><button class="secondary" data-viewer-step="-1" ${safeIndex===0?'disabled':''}>← Previous</button><button class="secondary" data-viewer-step="1" ${safeIndex===clips.length-1?'disabled':''}>Next →</button></div></footer>`;dialog.querySelector('.viewer-close').onclick=()=>dialog.close();dialog.querySelectorAll('[data-viewer-index]').forEach(button=>button.onclick=()=>rdOpenViewer(name,Number(button.dataset.viewerIndex)));dialog.querySelectorAll('[data-viewer-step]').forEach(button=>button.onclick=()=>rdOpenViewer(name,safeIndex+Number(button.dataset.viewerStep)));dialog.querySelector('.viewer-fullscreen').onclick=()=>{const stage=dialog.querySelector('.viewer-stage');if(stage.requestFullscreen)stage.requestFullscreen()};if(!dialog.open)dialog.showModal()}
function rdCreateViewer(){const dialog=document.createElement('dialog');dialog.id='mediaViewer';dialog.className='media-viewer';dialog.setAttribute('aria-label','Power video viewer');dialog.innerHTML='<div class="viewer-body"></div>';document.body.append(dialog);let startX=0;dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft')rdViewerStep(-1);if(event.key==='ArrowRight')rdViewerStep(1)});dialog.addEventListener('touchstart',event=>{startX=event.changedTouches[0].clientX},{passive:true});dialog.addEventListener('touchend',event=>{const delta=event.changedTouches[0].clientX-startX;if(Math.abs(delta)>55)rdViewerStep(delta<0?1:-1)},{passive:true});return dialog}
function rdViewerStep(delta){const dialog=document.querySelector('#mediaViewer');if(!dialog?.open)return;const index=Number(dialog.dataset.index),name=dialog.dataset.name,count=relatedClips(name).length,next=index+delta;if(next>=0&&next<count)rdOpenViewer(name,next)}
function rdOpenSearchSheet(){let dialog=document.querySelector('#globalSearchSheet');if(!dialog){dialog=document.createElement('dialog');dialog.id='globalSearchSheet';dialog.className='gallery-filter-sheet';dialog.setAttribute('aria-label','Haze Atlas controls');document.body.append(dialog)}dialog.innerHTML=`<div class="sheet-handle"></div><header class="sheet-head"><h2>Search Haze Atlas</h2><button class="drawer-close" aria-label="Close search">×</button></header><div class="sheet-controls"><input id="mobileGlobalSearch" placeholder="Search items, powers, values, and guides…" aria-label="Search Haze Atlas"><button class="primary" id="showMobileSearchResults">Show results</button></div>`;dialog.querySelector('.drawer-close').onclick=()=>dialog.close();const input=dialog.querySelector('input');input.oninput=()=>{const desktop=$('#search');desktop.value=input.value;desktop.dispatchEvent(new Event('input',{bubbles:true}))};dialog.querySelector('#showMobileSearchResults').onclick=()=>dialog.close();dialog.showModal();requestAnimationFrame(()=>input.focus())}

function rdBind(){document.querySelectorAll('[data-rd-page]').forEach(button=>button.onclick=()=>go(button.dataset.rdPage));document.querySelectorAll('[data-rd-refresh]').forEach(button=>button.onclick=()=>$('#refresh')?.click());document.querySelectorAll('[data-rd-changelog]').forEach(button=>button.onclick=rdOpenChangelog);document.querySelectorAll('[data-copy-code]').forEach(button=>button.onclick=async event=>{
    event.preventDefault();
    event.stopPropagation();
    const code=button.dataset.copyCode;
    try{
      await navigator.clipboard.writeText(code);
      const original=button.textContent;
      button.classList.add('is-copied');
      button.textContent=button.classList.contains('code-tile-copy')||button.classList.contains('code-card-copy')?'Copied':'✓';
      rdToast(`Copied ${code}`);
      clearTimeout(button._copyTimer);
      button._copyTimer=setTimeout(()=>{button.classList.remove('is-copied');button.textContent=original||'Copy';},1600);
    }catch{rdToast('Could not copy code')}
  });document.querySelectorAll('[data-open-media]').forEach(button=>button.onclick=()=>rdOpenViewer(button.dataset.openMedia));document.querySelectorAll('[data-gallery-view]').forEach(button=>button.onclick=()=>{featureState.galleryView=button.dataset.galleryView;rdSet('haze-gallery-view-v1',featureState.galleryView);render()});document.querySelectorAll('[data-clear-gallery-filter]').forEach(button=>button.onclick=()=>{const key=button.dataset.clearGalleryFilter;if(key==='category')featureState.galleryCategory='all';if(key==='fresh')featureState.galleryFresh='all';if(key==='videos')featureState.galleryVideoMin=0;if(key==='collection')featureState.galleryCollection='all';featureState.galleryPage=1;render()});if($('#clearGalleryFilters'))$('#clearGalleryFilters').onclick=()=>{Object.assign(featureState,{galleryCategory:'all',galleryFresh:'all',galleryVideoMin:0,galleryCollection:'all',galleryPage:1});render()};if($('#mobileGalleryFilters'))$('#mobileGalleryFilters').onclick=rdOpenFilterSheet;if($('#gallerySearch'))$('#gallerySearch').oninput=e=>{featureState.galleryQuery=e.target.value;featureState.galleryPage=1;clearTimeout(rdBind.searchTimer);rdBind.searchTimer=setTimeout(()=>{render();const next=$('#gallerySearch');next?.focus();next?.setSelectionRange(next.value.length,next.value.length)},180)};if($('#galleryVideoMin'))$('#galleryVideoMin').onchange=e=>{featureState.galleryVideoMin=Number(e.target.value);featureState.galleryPage=1;render()};if($('#galleryCollection'))$('#galleryCollection').onchange=e=>{featureState.galleryCollection=e.target.value;featureState.galleryPage=1;render()};rdSyncNavigation()}

function rdInstall(){rdSidebar();rdTopbar();setTimeout(rdMobileBottom,0);const originalRefresh=window.haze.refresh.bind(window.haze);window.haze.refresh=async(...args)=>{const result=await originalRefresh(...args);const payload=result?.data?result.data:result;setTimeout(()=>rdTrackSnapshot({...payload,items:typeof normalizedItems==='function'?normalizedItems(payload.items||[]):payload.items}),0);return result};toast=rdToast;home=rdDashboard;powerGalleryPage=rdPowerGallery;if(typeof enhancedPages==='object')enhancedPages.gallery=rdPowerGallery;openMediaViewer=rdOpenViewer;createMediaViewer=rdCreateViewer;const previousRender=render;render=function(){previousRender();rdBind();rdMobileBottom()};window.render=render;const timer=setInterval(()=>{if(typeof data==='object'&&data?.items?.length&&typeof trello==='object'){clearInterval(timer);rdSyncNavigation();render();rdTrackSnapshot(data);setInterval(()=>{
        document.querySelectorAll('[data-relative-time]').forEach(el=>{
          if(el.id==='updated'||el.classList.contains('topbar-status'))return;
          el.textContent=rdRelative(el.dataset.relativeTime);
        });
        rdPaintStatus();
      },60000)}},50)}
document.addEventListener('DOMContentLoaded',rdInstall);
