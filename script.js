// 1. CONFIGURATION
const SUPABASE_URL = 'https://jnoavdzcbmskwoectioc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impub2F2ZHpjYm1za3dvZWN0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4MDA4ODcsImV4cCI6MjA3OTM3Njg4N30.x3O1xvNMQfqLZ507nfgDcjFJ3faen-uq6l7mrx47NH8';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const tg = window.Telegram.WebApp;
tg.expand();

// State
let user = null;
let config = {};
let spinReward = 0;
let isSpinning = false;
// Wallet State
let wMethod = null;
let wAmount = null;

// 2. INITIALIZATION
async function initApp() {
    console.log("App Starting...");

    // A. Fetch Config
    const { data: cfgData } = await db.from('app_config').select('*');
    if(cfgData) cfgData.forEach(c => config[c.key] = c.value);
    
    // Set UI Text from Config
    document.getElementById('home-notice').innerText = config.home_notice || 'Welcome';
    document.getElementById('daily-text').innerText = config.daily_checkin_reward || '0';
    document.getElementById('ref-bonus').innerText = config.refer_bonus_fixed || '0';
    document.getElementById('ref-comm').innerText = config.refer_commission_percent || '0';
    document.getElementById('vpn-allowed-list').innerText = config.allowed_countries || 'Global';

    // B. Authentication & Referral Fix
    const tgUser = tg.initDataUnsafe.user || {id: 1888, first_name: "Demo User"};
    const startParam = tg.initDataUnsafe.start_param; // সঠিকভাবে রেফার প্যারামিটার ধরা

    // Device ID Generation (For Anti-Cheat)
    let deviceId = localStorage.getItem('uid_device_x');
    if(!deviceId) { 
        deviceId = crypto.randomUUID(); 
        localStorage.setItem('uid_device_x', deviceId); 
    }

    // Check DB for User
    const { data: exist } = await db.from('users').select('*').eq('telegram_id', tgUser.id).single();

    if(!exist) {
        console.log("Creating New User...");
        
        // Anti-Cheat: Check if Device ID already exists
        const { data: dupe } = await db.from('users').select('id').eq('device_id', deviceId);
        const isFake = (dupe && dupe.length > 0);

        // Referral Handling
        let referrer = null;
        if(startParam && startParam != tgUser.id) {
            // Verify referrer actually exists
            const { data: refCheck } = await db.from('users').select('id').eq('telegram_id', startParam).single();
            if(refCheck) referrer = parseInt(startParam);
        }

        // Insert New User
        const { data: newUser, error } = await db.from('users').insert([{
            telegram_id: tgUser.id,
            first_name: tgUser.first_name,
            device_id: deviceId,
            is_fake_account: isFake,
            referrer_id: referrer,
            balance: 0
        }]).select().single();

        if(error) console.error("Signup Error:", error);
        user = newUser;

        // GIVE BONUS TO REFERRER (FIXED)
        if(referrer && !isFake) {
            const { data: refUser } = await db.from('users').select('balance, telegram_id').eq('telegram_id', referrer).single();
            if(refUser) {
                const bonus = parseFloat(config.refer_bonus_fixed || 0);
                const newBal = parseFloat(refUser.balance) + bonus;
                await db.from('users').update({balance: newBal}).eq('telegram_id', refUser.telegram_id);
            }
        }
    } else {
        user = exist;
        if(user.is_banned) {
            document.body.innerHTML = "<h1 style='color:red;text-align:center;margin-top:50px'>BANNED</h1>";
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

// 3. VPN CHECKER FUNCTION (Checks only when called)
async function checkVPN() {
    if(config.vpn_required !== 'true') return true;

    try {
        const res = await fetch('https://ipinfo.io/json?token=1151161c93b97a');
        const data = await res.json();
        const allowed = (config.allowed_countries || '').split(',').map(s => s.trim().toUpperCase());
        const myCountry = data.country.toUpperCase();
        
        if(allowed.includes(myCountry)) return true;
        
        // Show VPN Modal if failed
        document.getElementById('vpn-screen').classList.add('open');
        return false;
    } catch(e) {
        tg.showAlert("Network Error! Check connection.");
        return false;
    }
}

// 4. TASKS SYSTEM
async function loadTasks() {
    // Admin panel থেকে Task Limit সেট করা থাকলে সেটা DB তে থাকবে
    const { data: tasks } = await db.from('tasks').select('*').eq('is_active', true).order('reward');
    const c = document.getElementById('task-container');
    c.innerHTML = '';
    if(tasks) tasks.forEach(t => {
        c.innerHTML += `
        <div class="glass-panel p-4 flex justify-between items-center">
            <div class="flex gap-3 items-center">
                <div class="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <i class="${t.icon_class||'fas fa-star'} text-blue-400"></i>
                </div>
                <div>
                    <h3 class="font-bold text-sm">${t.title}</h3>
                    <p class="text-[10px] text-gray-400">Limit: ${t.daily_limit || 'Unlimited'}</p>
                </div>
            </div>
            <button onclick="startTask('${t.type}', ${t.reward}, ${t.id}, ${t.daily_limit})" 
                class="bg-blue-600 px-4 py-1.5 rounded text-xs font-bold shadow hover:bg-blue-700">
                +৳${t.reward}
            </button>
        </div>`;
    });
}

// TASK START LOGIC (With VPN & Limit Check)
window.startTask = async (type, reward, taskId, limit) => {
    // 1. VPN Check First
    tg.MainButton.showProgress();
    const vpnOk = await checkVPN(); 
    tg.MainButton.hideProgress();
    
    if(!vpnOk) return; // VPN না থাকলে এখানেই স্টপ

    // 2. Limit Check (Optional: You can add DB check here for task_logs)
    
    if(type === 'spin') { 
        spinReward = reward; 
        document.getElementById('spin-modal').classList.add('open'); 
    } else { 
        // 3. Show Ad
        if(window.showGiga) {
            window.showGiga().then(() => giveReward(reward)).catch(() => giveReward(reward)); 
        } else { 
            tg.showAlert("Ad Loading..."); 
            setTimeout(() => giveReward(reward), 1500); 
        }
    }
}

// DAILY CHECKIN (With VPN Check)
window.dailyCheckin = async () => {
    // Check if already done today
    const today = new Date().toDateString();
    if(user.last_checkin === today) return tg.showAlert("Already checked in today!");

    // VPN Check
    const vpnOk = await checkVPN();
    if(!vpnOk) return;

    const reward = parseFloat(config.daily_checkin_reward);
    
    await db.from('users').update({
        balance: user.balance + reward,
        last_checkin: today
    }).eq('telegram_id', user.telegram_id);
    
    user.balance += reward;
    user.last_checkin = today;
    updateUI();
    tg.showAlert(`Bonus ৳${reward} Added!`);
}

// REWARD HANDLING
async function giveReward(amt) {
    const val = parseFloat(amt);
    const newBal = parseFloat(user.balance) + val;
    await db.from('users').update({balance: newBal}).eq('telegram_id', user.telegram_id);
    
    // Commission to Referrer (FIXED)
    if(user.referrer_id && config.refer_commission_percent > 0) {
        const comm = (val * parseFloat(config.refer_commission_percent)) / 100;
        const { data: r } = await db.from('users').select('balance').eq('telegram_id', user.referrer_id).single();
        if(r) await db.from('users').update({balance: r.balance + comm}).eq('telegram_id', user.referrer_id);
    }
    user.balance = newBal; 
    updateUI(); 
    tg.showAlert(`Success! Earned ৳${val}`);
}

// 5. WALLET SYSTEM (আগের মত সিলেকশন মেথড)
async function loadMethods() {
    const { data } = await db.from('payment_methods').select('*').eq('is_active', true);
    const c = document.getElementById('method-container'); 
    c.innerHTML='';
    if(data) data.forEach(m => {
        c.innerHTML += `
        <div onclick="setMethod('${m.name}')" id="opt-${m.name}" class="select-box glass-panel p-2 flex flex-col items-center cursor-pointer">
            <img src="${m.logo_url}" class="h-6">
            <span class="text-[10px] font-bold mt-1">${m.name}</span>
        </div>`;
    });
}

// সিলেকশন ফাংশনগুলো আগের মত ফিরিয়ে আনা হলো
window.setMethod = (m) => { 
    wMethod = m; 
    document.querySelectorAll('.select-box').forEach(e => {
        if(e.id.startsWith('opt')) e.classList.remove('active');
    }); 
    document.getElementById(`opt-${m}`).classList.add('active'); 
}

window.setAmount = (a) => { 
    wAmount = a; 
    document.querySelectorAll('.select-box').forEach(e => {
        if(e.id.startsWith('amt')) e.classList.remove('active');
    }); 
    document.getElementById(`amt-${a}`).classList.add('active'); 
}

window.withdraw = async () => {
    const num = document.getElementById('wallet-phone').value;
    
    if(!wMethod) return tg.showAlert("Please select a payment method!");
    if(!wAmount) return tg.showAlert("Please select an amount!");
    if(!num) return tg.showAlert("Enter your wallet number!");
    
    if(user.balance < wAmount) return tg.showAlert("Insufficient balance!");

    // Update Balance
    await db.from('users').update({balance: user.balance - wAmount}).eq('telegram_id', user.telegram_id);
    
    // Create Withdrawal
    await db.from('withdrawals').insert([{
        telegram_id: user.telegram_id, 
        method: wMethod, 
        amount: wAmount, 
        number: num,
        status: 'pending'
    }]);

    user.balance -= wAmount; 
    updateUI(); 
    loadHistory(); 
    tg.showAlert("Withdrawal Request Submitted!");
}

async function loadHistory() {
    const { data } = await db.from('withdrawals').select('*').eq('telegram_id', user.telegram_id).order('created_at', {ascending:false}).limit(5);
    document.getElementById('history-list').innerHTML = data ? data.map(i=>`<div class="glass-panel p-2 flex justify-between text-xs"><span>${i.method} - ৳${i.amount}</span><span class="${i.status=='paid'?'text-green-400':'text-yellow-400'}">${i.status}</span></div>`).join(''):'';
}

// REFERRAL LIST LOAD
async function loadReferrals() {
    const { data: refs } = await db.from('users').select('*').eq('referrer_id', user.telegram_id).order('created_at', {ascending:false}).limit(50);
    const c = document.getElementById('referral-list');
    c.innerHTML = '';
    if(refs && refs.length) {
        refs.forEach(r => {
            const status = r.is_fake_account 
                ? '<span class="text-red-400">Fake</span>' 
                : '<span class="text-green-400">Valid</span>';
            c.innerHTML += `<div class="glass-panel p-2 flex justify-between items-center text-xs"><div><b>${r.first_name}</b></div>${status}</div>`;
        });
    } else {
        c.innerHTML = '<div class="text-center text-xs text-gray-500 py-4">No referrals yet.</div>';
    }
}

// EXTRAS
window.executeSpin = () => {
    if(isSpinning) return; 
    isSpinning=true; 
    document.getElementById('spin-btn').disabled=true;
    const w = document.getElementById('wheel-element'); 
    w.style.transform=`rotate(${Math.floor(3000+Math.random()*3000)}deg)`;
    
    setTimeout(()=>{
        if(window.showGiga) window.showGiga().then(()=>giveReward(spinReward)).catch(()=>giveReward(spinReward));
        else giveReward(spinReward);
        isSpinning=false; 
        w.style.transition='none'; w.style.transform='rotate(0deg)';
        setTimeout(()=>{ w.style.transition='transform 4s'; document.getElementById('spin-btn').disabled=false; document.getElementById('spin-modal').classList.remove('open'); },100);
    }, 4000);
}

window.nav = (id, el) => { document.querySelectorAll('.page-section').forEach(p=>p.classList.remove('active-page')); document.getElementById(id).classList.add('active-page'); document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active')); el.classList.add('active'); }
window.copyRef = () => { navigator.clipboard.writeText(document.getElementById('ref-link').innerText); tg.showAlert("Copied!"); }
window.openSupport = () => tg.openTelegramLink(config.support_link);
window.openLeaderboard = async () => { document.getElementById('leader-modal').classList.add('open'); const {data} = await db.from('users').select('first_name,balance').order('balance',{ascending:false}).limit(10); document.getElementById('lb-list').innerHTML = data.map((u,i)=>`<div class="flex justify-between bg-slate-800 p-2 rounded text-xs"><span>#${i+1} ${u.first_name}</span><span class="text-green-400">৳${u.balance.toFixed(2)}</span></div>`).join(''); }

initApp();
