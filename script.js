// 1. CONFIGURATION
const SUPABASE_URL = 'https://jnoavdzcbmskwoectioc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impub2F2ZHpjYm1za3dvZWN0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4MDA4ODcsImV4cCI6MjA3OTM3Njg4N30.x3O1xvNMQfqLZ507nfgDcjFJ3faen-uq6l7mrx47NH8';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const tg = window.Telegram.WebApp;

// Initialize Telegram
tg.expand();
tg.enableClosingConfirmation();

// Global Variables
let user = null;
let config = {}; // Basic config cache
let wMethod = null;
let wAmount = null;
let spinRewardTemp = 0;

// ==========================================
// INITIALIZATION
// ==========================================

async function initApp() {
    console.log("App Initializing...");

    // 1. Load Initial Config
    await fetchConfig(); 

    // 2. Auth & Referral Logic
    const tgUser = tg.initDataUnsafe.user || { id: 777000, first_name: "Guest", username: "guest" };
    let referrerId = tg.initDataUnsafe.start_param; 
    let deviceId = localStorage.getItem('device_id');
    
    if(!deviceId) { 
        deviceId = crypto.randomUUID(); 
        localStorage.setItem('device_id', deviceId); 
    }

    // Check User
    const { data: exist } = await db.from('users').select('*').eq('telegram_id', tgUser.id).single();

    if (!exist) {
        await registerUser(tgUser, deviceId, referrerId);
    } else {
        user = exist;
        if(user.is_banned) {
            document.body.innerHTML = '<div class="flex h-screen items-center justify-center text-red-500 font-bold">ACCOUNT BANNED</div>';
            return;
        }
        updateUI();
    }

    loadTasks();
    loadReferrals();
    loadWallet();
}

// Function to fetch latest settings from DB
async function fetchConfig() {
    const { data: cfgData } = await db.from('app_config').select('*');
    if(cfgData) {
        cfgData.forEach(c => config[c.key] = c.value);
        
        // Update UI elements immediately
        if(document.getElementById('home-notice')) 
            document.getElementById('home-notice').innerText = config.home_notice || 'Welcome!';
        
        if(document.getElementById('vpn-allowed-list'))
            document.getElementById('vpn-allowed-list').innerText = config.allowed_countries || 'Global';
            
        document.getElementById('daily-text').innerText = config.daily_checkin_reward || '0';
        document.getElementById('ref-bonus').innerText = config.refer_bonus_fixed || '0';
        document.getElementById('ref-comm').innerText = config.refer_commission_percent || '0';
    }
}

async function registerUser(tgUser, deviceId, refId) {
    let validReferrer = null;
    if (refId && parseInt(refId) !== tgUser.id) {
        const { data: refCheck } = await db.from('users').select('id').eq('telegram_id', refId).single();
        if (refCheck) validReferrer = parseInt(refId);
    }

    const { data: deviceCheck } = await db.from('users').select('id').eq('device_id', deviceId);
    const isFake = (deviceCheck && deviceCheck.length > 0);

    const { data: newUser, error } = await db.from('users').insert([{
        telegram_id: tgUser.id,
        first_name: tgUser.first_name,
        username: tgUser.username,
        device_id: deviceId,
        referrer_id: validReferrer,
        is_fake_account: isFake,
        balance: 0.00
    }]).select().single();

    if (error) {
        tg.showAlert("Registration Error!");
        return;
    }

    user = newUser;
    updateUI();

    if (validReferrer && !isFake) {
        const bonus = parseFloat(config.refer_bonus_fixed || 0);
        if (bonus > 0) {
            const { data: rUser } = await db.from('users').select('balance').eq('telegram_id', validReferrer).single();
            if (rUser) {
                await db.from('users').update({ balance: rUser.balance + bonus }).eq('telegram_id', validReferrer);
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
    const botName = config.bot_username || "GigaEarnBot"; 
    document.getElementById('ref-link').innerText = `https://t.me/${botName}?start=${user.telegram_id}`;
}

// ==========================================
// TASKS & REAL-TIME VPN CHECK
// ==========================================

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

// *** NEW FUNCTION: Real-time VPN Check ***
async function checkRealTimeVPN() {
    // 1. ডাটাবেস থেকে লেটেস্ট সেটিং আনা (ক্যাশ বাদ দিয়ে)
    const { data: vpnData } = await db.from('app_config')
        .select('value')
        .eq('key', 'allowed_countries')
        .single();
        
    const allowedCountries = vpnData ? vpnData.value : (config.allowed_countries || 'GLOBAL');
    
    // Update UI with fresh list
    document.getElementById('vpn-allowed-list').innerText = allowedCountries;

    // 2. ইউজারের আইপি চেক করা
    try {
        const res = await fetch('https://ipinfo.io/json?token=1151161c93b97a');
        const data = await res.json();
        const userCountry = data.country.toUpperCase();
        const allowedList = allowedCountries.toUpperCase().split(',').map(c => c.trim());

        if (!allowedList.includes(userCountry)) {
            // মিলেনি, তাই ওয়ার্নিং দেখাবে
            document.getElementById('vpn-screen').classList.add('open');
            return false;
        }
        return true;
    } catch (e) {
        tg.showAlert("Network Error! Check internet.");
        return false;
    }
}

window.startTask = async (type, reward) => {
    tg.MainButton.showProgress();

    // *** STEP 1: চেক করুন ভিপিএন রিকোয়্যারড কিনা ***
    // আমরা লেটেস্ট কনফিগ আবার চেক করছি
    const { data: vpnReq } = await db.from('app_config').select('value').eq('key', 'vpn_required').single();
    const isVpnOn = vpnReq ? vpnReq.value === 'true' : false;

    if(isVpnOn) {
        const vpnOk = await checkRealTimeVPN(); // এখানে লাইভ চেক হবে
        if(!vpnOk) {
            tg.MainButton.hideProgress();
            return; 
        }
    }

    tg.MainButton.hideProgress();

    // *** STEP 2: টাস্ক শুরু ***
    if(type === 'spin') {
        spinRewardTemp = reward;
        document.getElementById('spin-modal').classList.add('open');
        document.getElementById('spin-result').classList.add('hidden');
        document.getElementById('spin-btn').disabled = false;
        document.getElementById('spin-icon').classList.remove('fa-spin');
    } else {
        if(window.showGiga) {
            window.showGiga().then(() => giveReward(reward)).catch(() => giveReward(reward));
        } else {
            tg.showAlert("Loading Ad...");
            setTimeout(() => giveReward(reward), 3000); 
        }
    }
}

window.executeSpin = () => {
    const btn = document.getElementById('spin-btn');
    const icon = document.getElementById('spin-icon');
    
    btn.disabled = true;
    icon.classList.add('fa-spin'); 
    icon.style.animationDuration = "0.5s";

    setTimeout(() => {
        icon.style.animationDuration = "0s"; 
        document.getElementById('spin-result').classList.remove('hidden');
        document.getElementById('spin-win-amt').innerText = spinRewardTemp;
        giveReward(spinRewardTemp);
    }, 3000);
}

window.closeSpin = () => {
    document.getElementById('spin-modal').classList.remove('open');
}

async function giveReward(amount) {
    const val = parseFloat(amount);
    const newBal = parseFloat(user.balance) + val;
    await db.from('users').update({ balance: newBal }).eq('telegram_id', user.telegram_id);
    user.balance = newBal;
    updateUI();
    tg.showAlert(`Congrats! Received ৳${val}`);

    if (user.referrer_id && config.refer_commission_percent > 0) {
        const comm = (val * parseFloat(config.refer_commission_percent)) / 100;
        if(comm > 0) {
            const {data: r} = await db.from('users').select('balance').eq('telegram_id', user.referrer_id).single();
            if(r) await db.from('users').update({ balance: r.balance + comm }).eq('telegram_id', user.referrer_id);
        }
    }
}

// ==========================================
// OTHER FUNCTIONS (Referral, Wallet)
// ==========================================

async function loadReferrals() {
    const { data: refs, count } = await db.from('users')
        .select('*', { count: 'exact' })
        .eq('referrer_id', user.telegram_id)
        .order('created_at', {ascending:false});
    
    document.getElementById('ref-count-display').innerText = count || 0;
    const c = document.getElementById('referral-list');
    c.innerHTML = '';

    if(refs && refs.length > 0) {
        refs.forEach(r => {
            c.innerHTML += `
            <div class="glass-panel p-3 flex justify-between items-center text-xs">
                <div class="flex gap-2 items-center">
                    <i class="fas fa-user-circle text-2xl text-gray-400"></i>
                    <div>
                        <p class="font-bold text-white">${r.first_name}</p>
                        <p class="text-[10px] text-gray-500">ID: ${r.telegram_id}</p>
                    </div>
                </div>
                <span class="text-green-400 font-bold">+৳${config.refer_bonus_fixed}</span>
            </div>`;
        });
    } else {
        c.innerHTML = '<div class="text-center text-xs text-gray-500 py-4">No referrals found yet.</div>';
    }
}

async function loadWallet() {
    const { data: methods } = await db.from('payment_methods').select('*').eq('is_active', true);
    const c = document.getElementById('method-container');
    c.innerHTML = '';
    
    if(methods) methods.forEach(m => {
        c.innerHTML += `
        <div onclick="setMethod('${m.name}')" id="opt-${m.name}" class="select-box glass-panel p-2 flex flex-col items-center cursor-pointer rounded-lg">
            <img src="${m.logo_url}" class="h-8 mb-1 object-contain">
            <span class="text-[10px] font-bold">${m.name}</span>
        </div>`;
    });

    const { data: hist } = await db.from('withdrawals').select('*').eq('telegram_id', user.telegram_id).order('created_at', {ascending:false}).limit(5);
    document.getElementById('history-list').innerHTML = hist ? hist.map(i=>`<div class="glass-panel p-2 flex justify-between text-xs mb-1"><span>${i.method} - ৳${i.amount}</span><span class="${i.status=='paid'?'text-green-400':'text-yellow-400'} uppercase">${i.status}</span></div>`).join('') : '';
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
    if(!wMethod || !wAmount || !num) return tg.showAlert("Please select Method, Amount & Number");
    if(user.balance < wAmount) return tg.showAlert("Insufficient Balance!");

    tg.MainButton.showProgress();

    const { count } = await db.from('users').select('*', { count: 'exact', head: true }).eq('referrer_id', user.telegram_id);
    tg.MainButton.hideProgress();

    if (count < 2) {
        tg.showAlert(`⚠️ You need minimum 2 Referrals to withdraw!\nCurrent Referrals: ${count}`);
        return; 
    }

    const newBal = user.balance - wAmount;
    await db.from('users').update({ balance: newBal }).eq('telegram_id', user.telegram_id);
    user.balance = newBal;
    
    await db.from('withdrawals').insert([{
        telegram_id: user.telegram_id,
        method: wMethod,
        amount: wAmount,
        number: num,
        status: 'pending'
    }]);

    updateUI();
    loadWallet();
    tg.showAlert("Withdrawal Request Successful!");
}

window.nav = (id, el) => { 
    document.querySelectorAll('.page-section').forEach(p=>p.classList.remove('active-page')); 
    document.getElementById(id).classList.add('active-page'); 
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active')); 
    el.classList.add('active'); 
}
window.copyRef = () => { navigator.clipboard.writeText(document.getElementById('ref-link').innerText); tg.showAlert("Link Copied!"); }
window.dailyCheckin = async () => {
    const today = new Date().toDateString();
    if (user.last_checkin === today) return tg.showAlert("Come back tomorrow!");
    const r = parseFloat(config.daily_checkin_reward);
    await db.from('users').update({ balance: user.balance + r, last_checkin: today }).eq('telegram_id', user.telegram_id);
    user.balance += r; user.last_checkin = today;
    updateUI(); tg.showAlert(`Daily Bonus ৳${r} Claimed!`);
}
window.openSupport = () => tg.openTelegramLink(config.support_link || "https://t.me/your_support");
window.openLeaderboard = async () => {
    document.getElementById('leader-modal').classList.add('open');
    const {data} = await db.from('users').select('first_name,balance').order('balance',{ascending:false}).limit(10);
    document.getElementById('lb-list').innerHTML = data.map((u,i)=>`<div class="flex justify-between bg-slate-800 p-2 rounded text-xs"><span>#${i+1} ${u.first_name}</span><span class="text-green-400">৳${u.balance.toFixed(2)}</span></div>`).join('');
}

initApp();
