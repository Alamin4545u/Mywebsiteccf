// 1. CONFIGURATION
const SUPABASE_URL = 'https://jnoavdzcbmskwoectioc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impub2F2ZHpjYm1za3dvZWN0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4MDA4ODcsImV4cCI6MjA3OTM3Njg4N30.x3O1xvNMQfqLZ507nfgDcjFJ3faen-uq6l7mrx47NH8';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const tg = window.Telegram.WebApp;
tg.expand();

// State
let user = null;
let config = {};
let isVpnAllowed = true; 
let spinReward = 0;
let isSpinning = false;
let wMethod = null, wAmount = null;

// 2. INITIALIZATION
async function initApp() {
    console.log("App Starting...");

    // A. Fetch Config & IP
    const [cfgRes, ipRes] = await Promise.all([
        db.from('app_config').select('*'),
        fetch('https://ipinfo.io/json?token=1151161c93b97a').catch(e => null)
    ]);

    if(cfgRes.data) cfgRes.data.forEach(c => config[c.key] = c.value);
    
    // Set UI Text
    document.getElementById('home-notice').innerText = config.home_notice || 'Welcome';
    document.getElementById('daily-text').innerText = config.daily_checkin_reward;
    document.getElementById('ref-bonus').innerText = config.refer_bonus_fixed;
    document.getElementById('ref-comm').innerText = config.refer_commission_percent;
    document.getElementById('vpn-allowed-list').innerText = config.allowed_countries;

    // B. VPN Validation
    if(ipRes && ipRes.ok) {
        const ipData = await ipRes.json();
        if(config.vpn_required === 'true') {
            const allowed = (config.allowed_countries || '').split(',').map(s => s.trim());
            if(!allowed.includes(ipData.country)) {
                isVpnAllowed = false;
                document.getElementById('vpn-screen').style.display = 'flex';
                return;
            }
        }
    }

    // C. Authentication & Anti-Cheat
    const tgUser = tg.initDataUnsafe.user || {id: Math.floor(Math.random()*10000000), first_name: "Test User"};
    const startParam = tg.initDataUnsafe.start_param; // Referrer ID

    // Device ID Generation
    let deviceId = localStorage.getItem('uid_device_x');
    if(!deviceId) { 
        deviceId = crypto.randomUUID(); 
        localStorage.setItem('uid_device_x', deviceId); 
    }

    // Check DB for User
    const { data: exist } = await db.from('users').select('*').eq('telegram_id', tgUser.id).single();

    if(!exist) {
        console.log("Creating New User...");
        
        // Check if Device ID already exists in DB (Anti-Cheat)
        const { data: dupe } = await db.from('users').select('id').eq('device_id', deviceId);
        const isFake = (dupe && dupe.length > 0); // True if device used before

        // Validate Referrer ID
        let referrer = null;
        if(startParam && startParam != tgUser.id) {
            referrer = parseInt(startParam); // Ensure Number
        }

        // Insert New User
        const { data: newUser, error } = await db.from('users').insert([{
            telegram_id: tgUser.id,
            first_name: tgUser.first_name,
            device_id: deviceId,
            is_fake_account: isFake,
            referrer_id: referrer
        }]).select().single();

        if(error) console.error("Signup Error:", error);
        user = newUser;

        // REFERRAL BONUS LOGIC
        if(newUser && newUser.referrer_id) {
            if(!isFake) {
                // Valid Refer: Add Balance to Referrer
                console.log("Processing Valid Referral...");
                const { data: refUser } = await db.from('users').select('balance, telegram_id').eq('telegram_id', newUser.referrer_id).single();
                
                if(refUser) {
                    const bonus = parseFloat(config.refer_bonus_fixed || 0);
                    const newBal = parseFloat(refUser.balance) + bonus;
                    await db.from('users').update({balance: newBal}).eq('telegram_id', refUser.telegram_id);
                }
            } else {
                // Fake Refer: Increase Fake Count
                console.log("Fake Referral Detected.");
                const { data: refUser } = await db.from('users').select('fake_ref_count, telegram_id').eq('telegram_id', newUser.referrer_id).single();
                if(refUser) {
                    await db.from('users').update({fake_ref_count: (refUser.fake_ref_count || 0) + 1}).eq('telegram_id', refUser.telegram_id);
                }
            }
        }
    } else {
        user = exist;
        // Check Ban Status
        if(user.is_banned) {
            document.getElementById('ban-screen').style.display = 'flex';
            return;
        }
    }

    updateUI();
    loadTasks();
    loadMethods();
    loadHistory();
    loadReferrals();
}

function updateUI() {
    if(!user) return;
    document.getElementById('user-name').innerText = user.first_name;
    document.getElementById('user-id').innerText = user.telegram_id;
    document.getElementById('header-balance').innerText = user.balance.toFixed(2);
    document.getElementById('wallet-balance').innerText = user.balance.toFixed(2);
    document.getElementById('ref-link').innerText = `https://t.me/${config.bot_username}?start=${user.telegram_id}`;
}

// 3. REFERRALS LIST
async function loadReferrals() {
    const { data: refs } = await db.from('users').select('*').eq('referrer_id', user.telegram_id).order('created_at', {ascending:false}).limit(50);
    const c = document.getElementById('referral-list');
    c.innerHTML = '';
    if(refs && refs.length) {
        refs.forEach(r => {
            const status = r.is_fake_account 
                ? '<span class="text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 text-[10px]">Fake</span>' 
                : '<span class="text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20 text-[10px]">Valid</span>';
            c.innerHTML += `<div class="glass-panel p-2 flex justify-between items-center text-xs"><div><b>${r.first_name}</b><br><span class="text-gray-500">${new Date(r.created_at).toLocaleDateString()}</span></div>${status}</div>`;
        });
    } else {
        c.innerHTML = '<div class="text-center text-xs text-gray-500 py-4">No referrals yet. Share your link!</div>';
    }
}

// 4. TASKS
async function loadTasks() {
    const { data: tasks } = await db.from('tasks').select('*').eq('is_active', true).order('id');
    const c = document.getElementById('task-container');
    c.innerHTML = '';
    if(tasks) tasks.forEach(t => {
        c.innerHTML += `<div class="glass-panel p-4 flex justify-between items-center"><div class="flex gap-3 items-center"><div class="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center"><i class="${t.icon_class||'fas fa-star'} text-blue-400"></i></div><div><h3 class="font-bold text-sm">${t.title}</h3><p class="text-[10px] text-gray-400">Earn ৳${t.reward}</p></div></div><button onclick="startTask('${t.type}',${t.reward})" class="bg-blue-600 px-4 py-1.5 rounded text-xs font-bold shadow hover:bg-blue-700">Start</button></div>`;
    });
}

window.startTask = (type, reward) => {
    if(!isVpnAllowed) return tg.showAlert("VPN Required!");
    if(type==='spin') { spinReward=reward; document.getElementById('spin-modal').classList.add('open'); }
    else { 
        if(window.showGiga) window.showGiga().then(()=>giveReward(reward)).catch(()=>giveReward(reward)); 
        else { tg.showAlert("Ad Loading..."); setTimeout(()=>giveReward(reward), 1500); }
    }
}
window.dailyCheckin = () => startTask('ad', config.daily_checkin_reward);

// 5. SPIN & REWARD
window.executeSpin = () => {
    if(isSpinning) return; isSpinning=true; document.getElementById('spin-btn').disabled=true;
    const w = document.getElementById('wheel-element'); w.style.transform=`rotate(${Math.floor(3000+Math.random()*3000)}deg)`;
    setTimeout(()=>{
        if(window.showGiga) window.showGiga().then(()=>giveReward(spinReward)).catch(()=>giveReward(spinReward));
        else giveReward(spinReward);
        isSpinning=false; w.style.transition='none'; w.style.transform='rotate(0deg)';
        setTimeout(()=>{ w.style.transition='transform 4s'; document.getElementById('spin-btn').disabled=false; document.getElementById('spin-modal').classList.remove('open'); },100);
    },4000);
}

async function giveReward(amt) {
    const val = parseFloat(amt);
    const newBal = parseFloat(user.balance) + val;
    await db.from('users').update({balance: newBal, total_ads_viewed: (user.total_ads_viewed||0)+1}).eq('telegram_id', user.telegram_id);
    
    // Commission Logic
    if(user.referrer_id && config.refer_commission_percent > 0) {
        const comm = (val * parseFloat(config.refer_commission_percent)) / 100;
        const { data: r } = await db.from('users').select('balance').eq('telegram_id', user.referrer_id).single();
        if(r) await db.from('users').update({balance: r.balance+comm}).eq('telegram_id', user.referrer_id);
    }
    user.balance = newBal; updateUI(); tg.showAlert(`Success! Earned ৳${val}`);
}

// 6. WALLET & EXTRAS
async function loadMethods() {
    const { data } = await db.from('payment_methods').select('*').eq('is_active', true);
    const c = document.getElementById('method-container'); c.innerHTML='';
    if(data) data.forEach(m => c.innerHTML += `<div onclick="setMethod('${m.name}')" id="opt-${m.name}" class="select-box glass-panel p-2 flex flex-col items-center cursor-pointer"><img src="${m.logo_url}" class="h-6"><span class="text-[10px] font-bold mt-1">${m.name}</span></div>`);
}
window.setMethod = (m) => { wMethod=m; document.querySelectorAll('.select-box').forEach(e=>{if(e.id.startsWith('opt'))e.classList.remove('active')}); document.getElementById(`opt-${m}`).classList.add('active'); }
window.setAmount = (a) => { wAmount=a; document.querySelectorAll('.select-box').forEach(e=>{if(e.id.startsWith('amt'))e.classList.remove('active')}); document.getElementById(`amt-${a}`).classList.add('active'); }
window.withdraw = async () => {
    const num = document.getElementById('wallet-phone').value;
    if(!wMethod || !wAmount || !num) return tg.showAlert("Fill all fields!");
    if(user.balance < wAmount) return tg.showAlert("Insufficient balance!");
    await db.from('users').update({balance: user.balance-wAmount}).eq('telegram_id', user.telegram_id);
    await db.from('withdrawals').insert([{telegram_id: user.telegram_id, method: wMethod, amount: wAmount, number: num}]);
    user.balance-=wAmount; updateUI(); loadHistory(); tg.showAlert("Request Submitted!");
}
async function loadHistory() {
    const { data } = await db.from('withdrawals').select('*').eq('telegram_id', user.telegram_id).order('created_at', {ascending:false}).limit(5);
    document.getElementById('history-list').innerHTML = data ? data.map(i=>`<div class="glass-panel p-2 flex justify-between text-xs"><span>${i.method} - ${i.amount}</span><span class="${i.status=='paid'?'text-green-400':'text-yellow-400'}">${i.status}</span></div>`).join(''):'';
}

// 7. NAVIGATION
window.nav = (id, el) => { document.querySelectorAll('.page-section').forEach(p=>p.classList.remove('active-page')); document.getElementById(id).classList.add('active-page'); document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active')); el.classList.add('active'); }
window.copyRef = () => navigator.clipboard.writeText(document.getElementById('ref-link').innerText);
window.openSupport = () => tg.openTelegramLink(config.support_link);
window.openLeaderboard = async () => { document.getElementById('leader-modal').classList.add('open'); const {data} = await db.from('users').select('first_name,balance').order('balance',{ascending:false}).limit(10); document.getElementById('lb-list').innerHTML = data.map((u,i)=>`<div class="flex justify-between bg-slate-800 p-2 rounded text-xs"><span>#${i+1} ${u.first_name}</span><span class="text-green-400">৳${u.balance.toFixed(2)}</span></div>`).join(''); }

initApp();
