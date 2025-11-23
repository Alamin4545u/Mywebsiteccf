// 1. CONFIGURATION
const SUPABASE_URL = 'https://jnoavdzcbmskwoectioc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impub2F2ZHpjYm1za3dvZWN0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4MDA4ODcsImV4cCI6MjA3OTM3Njg4N30.x3O1xvNMQfqLZ507nfgDcjFJ3faen-uq6l7mrx47NH8';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const tg = window.Telegram.WebApp;

// Initialize
tg.expand();
tg.enableClosingConfirmation();

// Global State
let user = null;
let config = {};
let wMethod = null;
let wAmount = null;
let spinRewardTemp = 0;

// ==========================================
// CORE APP LOGIC
// ==========================================

async function initApp() {
    console.log("App Initializing...");

    // A. Fetch Config
    const { data: cfgData } = await db.from('app_config').select('*');
    if(cfgData) cfgData.forEach(c => config[c.key] = c.value);
    
    // UI Updates
    document.getElementById('home-notice').innerText = config.home_notice || 'Welcome';
    document.getElementById('daily-text').innerText = config.daily_checkin_reward || '0';
    document.getElementById('ref-bonus').innerText = config.refer_bonus_fixed || '0';
    document.getElementById('ref-comm').innerText = config.refer_commission_percent || '0';
    document.getElementById('vpn-allowed-list').innerText = config.allowed_countries || 'Global';

    // B. AUTHENTICATION & REFERRAL FIX
    const tgUser = tg.initDataUnsafe.user || {id: 777000, first_name: "Guest"};
    
    // *** CRITICAL FIX: GET REFERRAL ID ***
    // Telegram sends 'start_param' when opening via link t.me/bot?start=123
    let startParam = tg.initDataUnsafe.start_param; 
    
    // Device ID for Anti-Cheat
    let deviceId = localStorage.getItem('device_id');
    if(!deviceId) { deviceId = crypto.randomUUID(); localStorage.setItem('device_id', deviceId); }

    // Check if User Exists
    const { data: exist } = await db.from('users').select('*').eq('telegram_id', tgUser.id).single();

    if (!exist) {
        console.log("New User Detected. Registering...");
        await registerUser(tgUser, deviceId, startParam);
    } else {
        console.log("Existing User Login.");
        user = exist;
        if(user.is_banned) {
            document.body.innerHTML = '<div class="flex h-screen items-center justify-center text-red-500 font-bold">ACCOUNT BANNED</div>';
            return;
        }
        updateUI();
    }

    // Load Data
    loadTasks();
    loadReferrals();
    loadWallet();
}

async function registerUser(tgUser, deviceId, referrerId) {
    // 1. Validate Referrer (Prevent Self-Referral)
    let validReferrer = null;
    if (referrerId && parseInt(referrerId) !== tgUser.id) {
        // Check if referrer exists in DB
        const { data: refCheck } = await db.from('users').select('id').eq('telegram_id', referrerId).single();
        if (refCheck) validReferrer = parseInt(referrerId);
    }

    // 2. Check Device ID (Anti-Cheat)
    const { data: deviceCheck } = await db.from('users').select('id').eq('device_id', deviceId);
    const isFake = (deviceCheck && deviceCheck.length > 0);

    // 3. Create User
    const { data: newUser, error } = await db.from('users').insert([{
        telegram_id: tgUser.id,
        first_name: tgUser.first_name,
        device_id: deviceId,
        referrer_id: validReferrer,
        is_fake_account: isFake,
        balance: 0.00
    }]).select().single();

    if (error) {
        console.error("Reg Error:", error);
        tg.showAlert("Registration Failed!");
        return;
    }

    user = newUser;
    updateUI();

    // 4. *** GIVE REFERRAL BONUS ***
    if (validReferrer && !isFake) {
        const bonus = parseFloat(config.refer_bonus_fixed || 0);
        if (bonus > 0) {
            // Fetch Referrer
            const { data: refUser } = await db.from('users').select('balance, telegram_id').eq('telegram_id', validReferrer).single();
            if (refUser) {
                const newBal = parseFloat(refUser.balance) + bonus;
                await db.from('users').update({ balance: newBal }).eq('telegram_id', validReferrer);
                console.log(`Referral Bonus ৳${bonus} sent to ${validReferrer}`);
            }
        }
    }
}

function updateUI() {
    if(!user) return;
    document.getElementById('user-name').innerText = user.first_name;
    document.getElementById('user-id').innerText = user.telegram_id;
    document.getElementById('header-balance').innerText = user.balance.toFixed(2);
    document.getElementById('wallet-balance').innerText = user.balance.toFixed(2);
    
    // Dynamic Referral Link
    const botUser = config.bot_username || "YourBotName";
    document.getElementById('ref-link').innerText = `https://t.me/${botUser}?start=${user.telegram_id}`;
}

// ==========================================
// VPN & TASK SYSTEM
// ==========================================

async function checkVPN() {
    if(config.vpn_required !== 'true') return true;
    try {
        const res = await fetch('https://ipinfo.io/json?token=1151161c93b97a');
        const data = await res.json();
        const allowed = (config.allowed_countries || '').split(',').map(s => s.trim().toUpperCase());
        
        if(allowed.includes(data.country.toUpperCase())) return true;
        
        document.getElementById('vpn-screen').classList.add('open');
        return false;
    } catch(e) {
        tg.showAlert("Internet Connection Error!");
        return false;
    }
}

async function loadTasks() {
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
                    <p class="text-[10px] text-gray-400">Limit: ${t.daily_limit || 1}/day</p>
                </div>
            </div>
            <button onclick="startTask('${t.type}', ${t.reward})" 
                class="bg-blue-600 px-4 py-1.5 rounded text-xs font-bold shadow hover:bg-blue-700 active:scale-95 transition">
                +৳${t.reward}
            </button>
        </div>`;
    });
}

window.startTask = async (type, reward) => {
    // 1. Check VPN
    tg.MainButton.showProgress();
    const vpnOk = await checkVPN();
    tg.MainButton.hideProgress();
    if(!vpnOk) return;

    if(type === 'spin') {
        spinRewardTemp = reward;
        document.getElementById('spin-modal').classList.add('open');
    } else {
        if(window.showGiga) {
            window.showGiga().then(() => giveReward(reward)).catch(() => giveReward(reward));
        } else {
            tg.showAlert("Ad Loading...");
            setTimeout(() => giveReward(reward), 2000);
        }
    }
}

// *** REWARD & COMMISSION LOGIC ***
async function giveReward(amount) {
    const val = parseFloat(amount);
    
    // 1. Add Balance to User
    const newBal = parseFloat(user.balance) + val;
    await db.from('users').update({ balance: newBal }).eq('telegram_id', user.telegram_id);
    user.balance = newBal;
    updateUI();
    tg.showAlert(`Earned ৳${val}`);

    // 2. Give Commission to Referrer
    if (user.referrer_id && config.refer_commission_percent > 0) {
        const commPercent = parseFloat(config.refer_commission_percent);
        const commission = (val * commPercent) / 100;
        
        if (commission > 0) {
            const { data: r } = await db.from('users').select('balance').eq('telegram_id', user.referrer_id).single();
            if (r) {
                await db.from('users').update({ balance: r.balance + commission }).eq('telegram_id', user.referrer_id);
            }
        }
    }
}

// ==========================================
// EXTRAS: SPIN, DAILY, REFERRAL LIST
// ==========================================

window.executeSpin = () => {
    document.getElementById('spin-btn').disabled = true;
    setTimeout(() => {
        document.getElementById('spin-result').classList.remove('hidden');
        document.getElementById('spin-win-amt').innerText = spinRewardTemp;
        giveReward(spinRewardTemp);
        setTimeout(() => {
            document.getElementById('spin-modal').classList.remove('open');
            document.getElementById('spin-result').classList.add('hidden');
            document.getElementById('spin-btn').disabled = false;
        }, 2000);
    }, 2000);
}

window.dailyCheckin = async () => {
    const today = new Date().toDateString();
    if (user.last_checkin === today) return tg.showAlert("Already collected today!");
    
    const vpnOk = await checkVPN();
    if(!vpnOk) return;

    const reward = parseFloat(config.daily_checkin_reward);
    await db.from('users').update({ balance: user.balance + reward, last_checkin: today }).eq('telegram_id', user.telegram_id);
    
    user.balance += reward;
    user.last_checkin = today;
    updateUI();
    tg.showAlert(`Daily Bonus ৳${reward} Added!`);
}

async function loadReferrals() {
    const { data: refs } = await db.from('users').select('*').eq('referrer_id', user.telegram_id).order('created_at', {ascending:false});
    const c = document.getElementById('referral-list');
    c.innerHTML = '';
    
    if(refs && refs.length > 0) {
        refs.forEach(r => {
            const status = r.is_fake_account ? '<span class="text-red-400">Fake</span>' : '<span class="text-green-400">Valid</span>';
            c.innerHTML += `<div class="glass-panel p-2 flex justify-between items-center text-xs"><div><b>${r.first_name}</b></div>${status}</div>`;
        });
    } else {
        c.innerHTML = '<div class="text-center text-xs text-gray-500 py-4">No referrals yet. Share your link!</div>';
    }
}

window.openLeaderboard = async () => {
    document.getElementById('leader-modal').classList.add('open');
    const {data} = await db.from('users').select('first_name,balance').order('balance',{ascending:false}).limit(10);
    document.getElementById('lb-list').innerHTML = data.map((u,i)=>`<div class="flex justify-between bg-slate-800 p-2 rounded text-xs"><span>#${i+1} ${u.first_name}</span><span class="text-green-400">৳${u.balance.toFixed(2)}</span></div>`).join('');
}

// ==========================================
// WALLET SYSTEM
// ==========================================

async function loadWallet() {
    // Load Methods from DB
    const { data: methods } = await db.from('payment_methods').select('*').eq('is_active', true);
    const c = document.getElementById('method-container');
    c.innerHTML = '';
    
    if(methods) methods.forEach(m => {
        c.innerHTML += `
        <div onclick="setMethod('${m.name}')" id="opt-${m.name}" class="select-box glass-panel p-2 flex flex-col items-center cursor-pointer rounded-lg hover:bg-slate-700">
            <img src="${m.logo_url}" class="h-6 mb-1 object-contain">
            <span class="text-[10px] font-bold">${m.name}</span>
        </div>`;
    });

    // Load History
    const { data: hist } = await db.from('withdrawals').select('*').eq('telegram_id', user.telegram_id).order('created_at', {ascending:false}).limit(5);
    const h = document.getElementById('history-list');
    h.innerHTML = hist ? hist.map(i=>`<div class="glass-panel p-2 flex justify-between text-xs"><span>${i.method} - ৳${i.amount}</span><span class="${i.status=='paid'?'text-green-400':i.status=='pending'?'text-yellow-400':'text-red-400'} uppercase">${i.status}</span></div>`).join('') : '';
}

window.setMethod = (m) => {
    wMethod = m;
    document.querySelectorAll('.select-box').forEach(e => { if(e.id.startsWith('opt')) e.classList.remove('active'); });
    document.getElementById(`opt-${m}`).classList.add('active');
}

window.setAmount = (a) => {
    wAmount = a;
    document.querySelectorAll('.select-box').forEach(e => { if(e.id.startsWith('amt')) e.classList.remove('active'); });
    document.getElementById(`amt-${a}`).classList.add('active');
}

window.withdraw = async () => {
    const num = document.getElementById('wallet-phone').value;
    if(!wMethod || !wAmount || !num) return tg.showAlert("Fill all fields!");
    if(user.balance < wAmount) return tg.showAlert("Insufficient balance!");

    // Deduct
    const newBal = user.balance - wAmount;
    await db.from('users').update({ balance: newBal }).eq('telegram_id', user.telegram_id);
    user.balance = newBal;
    
    // Insert Request
    await db.from('withdrawals').insert([{
        telegram_id: user.telegram_id,
        method: wMethod,
        amount: wAmount,
        number: num,
        status: 'pending'
    }]);

    updateUI();
    loadWallet(); // Reload history
    tg.showAlert("Request Submitted!");
}

// Navigation & Utils
window.nav = (id, el) => { 
    document.querySelectorAll('.page-section').forEach(p=>p.classList.remove('active-page')); 
    document.getElementById(id).classList.add('active-page'); 
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active')); 
    el.classList.add('active'); 
}
window.copyRef = () => { navigator.clipboard.writeText(document.getElementById('ref-link').innerText); tg.showAlert("Link Copied!"); }
window.openSupport = () => tg.openTelegramLink(config.support_link);

// START APP
initApp();
