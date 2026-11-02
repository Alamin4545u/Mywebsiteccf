(() => {
  const $ = id => document.getElementById(id);
  const modelSelect = $('modelSelect'), messagesEl = $('messages'), welcome = $('welcome');
  const input = $('messageInput'), form = $('chatForm'), sendBtn = $('sendBtn');
  const historyKey = 'nexora_agentrouter_chats_v2';
  let chats = loadChats(), activeId = null, busy = false;
  function loadChats(){try{return JSON.parse(localStorage.getItem(historyKey)||'[]')}catch(e){return[]}}
  function saveChats(){localStorage.setItem(historyKey,JSON.stringify(chats))}
  function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
  function setStatus(type,label){const s=$('status');s.className='status '+type;s.innerHTML='<i></i> '+label}
  function current(){return chats.find(c=>c.id===activeId)}
  function newChat(){const c={id:String(Date.now()),title:'New chat',messages:[],updated:Date.now()};chats.unshift(c);activeId=c.id;saveChats();render();renderHistory();input.focus()}
  function renderHistory(){const el=$('historyList');el.innerHTML='';chats.forEach(c=>{const b=document.createElement('button');b.className='history-item'+(c.id===activeId?' active':'');b.textContent='▤  '+c.title;b.onclick=()=>{activeId=c.id;render();renderHistory();closeSidebar()};el.appendChild(b)})}
  function render(){const c=current();messagesEl.innerHTML='';welcome.style.display=c&&c.messages.length?'none':'block';if(!c)return;c.messages.forEach((m,i)=>addMessage(m.role,m.content,i,false));scrollBottom()}
  function addMessage(role,content,index,scroll=true){const wrap=document.createElement('div');wrap.className='message '+(role==='user'?'user':'assistant');const avatar=document.createElement('div');avatar.className='avatar';avatar.textContent=role==='user'?'Y':'✳';const body=document.createElement('div');body.className='message-body';body.textContent=content;wrap.append(avatar,body);if(role==='assistant'){const actions=document.createElement('div');actions.className='message-actions';const copy=document.createElement('button');copy.textContent='Copy';copy.onclick=()=>{navigator.clipboard?.writeText(content).then(()=>toast('Copied')).catch(()=>toast('Copy not available'))};actions.append(copy);body.append(actions)}messagesEl.appendChild(wrap);if(scroll)scrollBottom();return body}
  function scrollBottom(){const area=$('chatArea');area.scrollTop=area.scrollHeight}
  async function loadModels(){setStatus('', 'Connecting');modelSelect.innerHTML='<option value="">Loading models…</option>';try{const r=await fetch('api/models.php',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load models');modelSelect.innerHTML='';if(!Array.isArray(d.models)||!d.models.length){modelSelect.innerHTML='<option value="">No models found</option>';throw new Error('No models returned by AgentRouter. Check API key and account access.')}d.models.forEach(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=m.name;modelSelect.appendChild(o)});if(d.defaultModel&&[...modelSelect.options].some(o=>o.value===d.defaultModel))modelSelect.value=d.defaultModel;setStatus('ok','Online');}catch(e){modelSelect.innerHTML='<option value="">Models unavailable</option>';setStatus('bad','Offline');toast(e.message);console.error(e)}}
  async function send(text){if(busy)return;const message=(text||input.value).trim();if(!message)return;if(!modelSelect.value){toast('Select a model first. If no models appear, check API setup.');return}if(!current())newChat();const c=current();c.messages.push({role:'user',content:message});if(c.messages.length===1)c.title=message.slice(0,38)+(message.length>38?'…':'');c.updated=Date.now();input.value='';input.style.height='auto';saveChats();render();renderHistory();busy=true;sendBtn.disabled=true;const pending=addMessage('assistant','Thinking…');pending.classList.add('typing');try{const response=await fetch('api/chat.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:modelSelect.value,messages:c.messages})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');c.messages.push({role:'assistant',content:data.reply});saveChats();render();}catch(e){pending.classList.remove('typing');pending.textContent='Error: '+e.message;toast(e.message)}finally{busy=false;sendBtn.disabled=false;input.focus()}}
  form.addEventListener('submit',e=>{e.preventDefault();send()});
  input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,180)+'px'});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
  $('newChat').onclick=newChat;$('newChatTop').onclick=newChat;
  $('clearHistory').onclick=()=>{if(confirm('Delete all saved chats from this browser?')){chats=[];activeId=null;saveChats();render();renderHistory()}};
  $('openSidebar').onclick=()=>$('sidebar').classList.add('open');$('closeSidebar').onclick=closeSidebar;
  function closeSidebar(){$('sidebar').classList.remove('open')}
  document.querySelectorAll('.suggestion').forEach(b=>b.onclick=()=>{input.value=b.dataset.prompt;input.focus();input.dispatchEvent(new Event('input'))});
  if(chats.length){activeId=chats[0].id;render()}else{newChat()}renderHistory();loadModels();
})();