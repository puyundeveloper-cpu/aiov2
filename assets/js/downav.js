(() => {
  const form=document.getElementById('downloadForm'); if(!form)return;
  const input=document.getElementById('urlInput'),submitBtn=document.getElementById('submitBtn'),status=document.getElementById('status'),result=document.getElementById('result');
  const overlay=document.getElementById('downloadOverlay'),downloadTitle=document.getElementById('downloadTitle'),downloadText=document.getElementById('downloadText');
  const trackingParams=/^(utm_[a-z]+|fbclid|gclid|igsh|igshid|si|is_from_webapp|is_copy_url|feature|source|share_id)$/i;
  const audioExt=/\.(mp3|m4a|aac|ogg|opus|wav|flac)(?:$|\?)/i;
  const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
  const cleanUrl=raw=>{const u=new URL(raw.trim());const q=new URLSearchParams();for(const [k,v] of u.searchParams)if(!trackingParams.test(k))q.set(k,v);u.search=q.toString();return u.toString()};
  const pickUrl=(v,depth=0)=>{if(!v||depth>6)return'';if(typeof v==='string')return/^https?:\/\//i.test(v)?v:'';if(typeof v!=='object')return'';for(const k of ['url','downloadUrl','download_url','fileUrl','file_url','directUrl','direct_url','link','href','src','no_watermark','nowm','best','hd','mp4','mp3','audio','video','file']){const x=pickUrl(v[k],depth+1);if(x)return x}return''};
  const typeOf=(item,url)=>{const x=String(item?.type||item?.mime||item?.format||'').toLowerCase();return x.includes('audio')||audioExt.test(url)?'audio':'video'};
  const labelOf=(item,type)=>String(item?.label||item?.quality||item?.resolution||item?.name||item?.format||type).replace(/_/g,' ');
  function normalize(raw){
    const root=raw?.result??raw?.data??raw,d=root&&typeof root==='object'?root:{};let all=[];
    for(const source of [d.medias,d.media,d.items,d.formats,d.downloads,d.links])if(Array.isArray(source))all.push(...source);
    for(const [key,forced] of [['video','video'],['videoUrl','video'],['video_url','video'],['audio','audio'],['audioUrl','audio'],['audio_url','audio'],['music','audio'],['downloadUrl','video'],['download_url','video'],['no_watermark','video'],['nowm','video'],['watermark','video'],['wm','video']])if(d[key])all.push({url:pickUrl(d[key]),type:forced,quality:key});
    const seen=new Set(),items=[];for(const item of all){const url=pickUrl(item?.url?item:item);if(!url||seen.has(url))continue;seen.add(url);const type=typeOf(item,url);items.push({url,type,label:labelOf(item,type),raw:String(item?.quality||item?.resolution||item?.name||item?.format||'').toLowerCase(),primary:!!(item?.primary||item?.preferred||item?.isBest)})}
    const videos=items.filter(x=>x.type==='video'),audios=items.filter(x=>x.type==='audio');
    const hd=videos.find(x=>/no.?watermark|nowm|without.?watermark/.test(x.raw))||videos.find(x=>/1080|720|hd|best|original|main|utama/.test(x.raw))||videos[0];
    const audio=audios.find(x=>/mp3/.test(x.raw)||/\.mp3(?:$|\?)/i.test(x.url))||audios[0];
    const downloads=[];if(hd)downloads.push({...hd,label:'hd no watermark'});if(audio)downloads.push({...audio,label:'audio'});
    const title=String(d.title||d.desc||d.caption||d.description||d.name||'hasil download').trim();const author=typeof d.author==='string'?d.author:d.author?.username?`@${d.author.username}`:d.author?.nickname||d.username||'';const thumb=pickUrl(d.thumbnail||d.thumb||d.cover||d.image||'');const duration=Number(d.duration);const chips=[];if(d.source)chips.push(String(d.source));if(Number.isFinite(duration)&&duration>0)chips.push(`${Math.round(duration>1000?duration/1000:duration)}s`);return{title,author,thumb,chips,downloads};
  }
  const proxy=u=>`/api/media?url=${encodeURIComponent(u)}`;
  const filename=(name,type)=>`${String(name||'downav-file').normalize('NFKD').replace(/[^\p{L}\p{N}\s_-]+/gu,'').trim().replace(/\s+/g,'-').slice(0,80)||'downav-file'}.${type==='audio'?'mp3':'mp4'}`;
  const downloadUrl=(u,title,type)=>`/api/download?url=${encodeURIComponent(u)}&filename=${encodeURIComponent(filename(title,type))}&type=${type}`;
  function renderPreview(item,thumb){if(!item)return thumb?`<div class="preview"><img src="${esc(proxy(thumb))}" alt="preview"></div>`:'';if(item.type==='audio')return`<div class="preview"><audio controls preload="metadata" src="${esc(proxy(item.url))}"></audio></div>`;return`<div class="preview" data-player><video id="previewVideo" preload="metadata" playsinline src="${esc(proxy(item.url))}"></video><button class="video-play" type="button" aria-label="putar video"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6c0 .7.8 1.1 1.4.7l10-6.8c.5-.4.5-1.1 0-1.5l-10-6.8C8.8 4.1 8 4.5 8 5.2Z"/></svg></button></div>`}
  function setupPreview(){const box=result.querySelector('[data-player]'),video=result.querySelector('#previewVideo'),play=result.querySelector('.video-play');if(!box||!video||!play)return;const sync=()=>box.classList.toggle('is-playing',!video.paused);play.onclick=()=>video.paused?video.play().catch(()=>{}):video.pause();video.onclick=()=>video.paused?video.play().catch(()=>{}):video.pause();video.addEventListener('play',sync);video.addEventListener('pause',sync);video.addEventListener('ended',sync);sync()}
  let downloadFrame;
  function showDownload(label,url){
    downloadTitle.textContent=`mengunduh ${label}`;
    downloadText.textContent='menyiapkan file media...';
    overlay.hidden=false;
    if(!downloadFrame){
      downloadFrame=document.createElement('iframe');
      downloadFrame.name='downav-download-frame';
      downloadFrame.title='downav download';
      downloadFrame.setAttribute('aria-hidden','true');
      downloadFrame.style.cssText='position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;border:0;opacity:0;pointer-events:none';
      document.body.appendChild(downloadFrame);
    }
    downloadFrame.src=url;
    setTimeout(()=>downloadText.textContent='file sedang dikirim ke folder Download.',700);
    setTimeout(()=>overlay.hidden=true,3200);
  }
  function render(data,sourceUrl){const p=normalize(data);if(!p.downloads.length)throw new Error('server tidak menemukan hd no watermark atau audio.');const main=p.downloads.find(x=>x.type==='video')||p.downloads[0];const chips=p.chips.map(x=>`<span class="chip">${esc(x)}</span>`).join('');const options=p.downloads.map(item=>`<article class="option"><div><p class="option-name">${esc(item.label)}</p><p class="option-type">${item.type==='audio'?'mp3 audio':'mp4 video'}</p></div><a class="action download" href="${esc(downloadUrl(item.url,p.title,item.type))}" data-download="${esc(item.label)}">download ↓</a></article>`).join('');result.innerHTML=`${renderPreview(main,p.thumb)}<div class="result-content"><div class="content-head"><div><h2 class="title">${esc(p.title)}</h2>${p.author?`<p class="author">${esc(p.author)}</p>`:''}</div><span class="media-badge">${main.type}</span></div><div class="chips">${chips}</div><div class="options">${options}</div><div class="source"><span>processed by downav</span><a href="${esc(sourceUrl)}" target="_blank" rel="noopener">source ↗</a></div></div>`;result.hidden=false;setupPreview();setTimeout(()=>result.scrollIntoView({behavior:'smooth',block:'start'}),120);result.querySelectorAll('[data-download]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();showDownload(a.dataset.download,a.href)}))}
  const setStatus=(msg='',type='')=>{status.className=`status${type?' '+type:''}`;status.innerHTML=msg};
  async function resolve(url){const r=await fetch(`/api/resolve?url=${encodeURIComponent(url)}`,{headers:{Accept:'application/json'},cache:'no-store'});const p=await r.json().catch(()=>null);if(!r.ok||!p?.ok)throw new Error(p?.message||`server mengembalikan ${r.status}`);return p.data}
  form.addEventListener('submit',async e=>{e.preventDefault();const raw=input.value.trim();if(!raw)return;let url;try{url=cleanUrl(raw)}catch{setStatus('masukkan link http atau https yang valid.','error');return}submitBtn.disabled=true;result.hidden=true;setStatus('<span class="spinner"></span>memproses link...');try{render(await resolve(url),url);setStatus('selesai.','ok')}catch(err){setStatus(esc(err.message||'gagal memproses link.'),'error')}finally{submitBtn.disabled=false}});
})();
