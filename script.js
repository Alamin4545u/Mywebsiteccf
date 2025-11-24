// 1. CONFIGURATION
// আপনার Supabase URL এবং Key এখানে দিন
const SUPABASE_URL = 'https://jnoavdzcbmskwoectioc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impub2F2ZHpjYm1za3dvZWN0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4MDA4ODcsImV4cCI6MjA3OTM3Njg4N30.x3O1xvNMQfqLZ507nfgDcjFJ3faen-uq6l7mrx47NH8';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const tg = window.Telegram.WebApp;

// Initialize Telegram
tg.expand();
tg.enableClosingConfirmation();

// Global Variables
let user = null;
let config = {};
let wMethod = null;
let wAmount = null;
let spinRewardTemp = 0;

// ==========================================
// INITIALIZATION
// ==========================================

async function initApp() {
    console.log("App Initializing...");

    // 1. Load Config
    const { data: cfgData } = await db.from('app_config').select('*');
    if(cfgData) cfgData.forEach(c => config[c.key] = c.value);

    // Update UI Texts
    document.getElementById('home-notice').innerText = config.home_notice || 'Welcome to Giga Earn!';
    document.getElementById('daily-text').innerText = config.daily_checkin_reward || '0';
    document.getElementById('ref-bonus').innerText = config.refer_bonus_fixed || '0';
    document.getElementById('ref-comm').innerText = config.refer_commission_percent || '0';
    document.getElementById('vpn-allowed-list').innerText = config.allowed_countries || 'Global';

    // 2. Auth & Referral Logic
    const tgUser = tg.initDataUnsafe.user || { id: 777000, first_name: "Guest", username: "guest" };
    
    // *** FIX 1: REFERRAL PARAM CAPTURE ***
    // টেলিগ্রাম লিংক থেকে 'start_param' নেওয়া হচ্ছে (যেমন: ?start=12345)
    let referrerId = tg.initDataUnsafe.start_param; 

    let deviceId = localStorage.getItem('device_id');
    if(!deviceId) { 
        deviceId = crypto.randomUUID(); 
        localStorage.setItem('device_id', deviceId); 
    }

    // Check if User Exists
    const { data: exist } = await db.from('users').select('*').eq('telegram_id', tgUser.id).single();

    if (!exist) {
        // নতুন ইউজার রেজিস্ট্রেশন
        await registerUser(tgUser, deviceId, referrerId);
    } else {
        // পুরাতন ইউজার লগইন
        user = exist;
        if(user.is_banned) {
            document.body.innerHTML = '<div class="flex h-screen items-center justify-center text-red-500 font-bold">ACCOUNT BANNED</div>';
            return;
        }
        updateUI();
    }

    // Load Data
    loadTasks();
    loadReferrals(); // রিফার লিস্ট লোড হবে
    loadWallet();
}

async function registerUser(tgUser, deviceId, refId) {
    let validReferrer = null;

    // *** FIX 1 (Part 2): Validate Referrer ***
    // নিজের আইডি নিজে রেফার হিসেবে ব্যবহার করতে পারবে না
    if (refId && parseInt(refId) !== tgUser.id) {
        const { data: refCheck } = await db.from('users').select('id').eq('telegram_id', refId).single();
        if (refCheck) validReferrer = parseInt(refId);
    }

    // Device Check (Anti-cheat)
    const { data: deviceCheck } = await db.from('users').select('id').eq('device_id', deviceId);
    const isFake = (deviceCheck && deviceCheck.length > 0);

    // Insert New User
    const { data: newUser, error } = await db.from('users').insert([{
        telegram_id: tgUser.id,
        first_name: tgUser.first_name,
        username: tgUser.username,
        device_id: deviceId,
        referrer_id: validReferrer, // ডাটাবেসে রেফার আইডি সেভ হচ্ছে
        is_fake_account: isFake,
        balance: 0.00
    }]).select().single();

    if (error) {
        tg.showAlert("Registration Error!");
        return;
    }

    user = newUser;
    updateUI();

    // *** FIX 1 (Part 3): Give Referral Bonus Immediately ***
    if (validReferrer && !isFake) {
        const bonus = parseFloat(config.refer_bonus_fixed || 0);
        if (bonus > 0) {
            // রেফারার এর ডাটা আনা এবং ব্যালেন্স বাড়ানো
            const { data: rUser } = await db.from('users').select('balance').eq('telegram_id', validReferrer).single();
            if (rUser) {
                await db.from('users').update({ 
                    balance: rUser.balance + bonus 
                }).eq('telegram_id', validReferrer);
                console.log("Bonus sent to referrer");
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
    const botName = config.bot_username || "GigaEarnBot"; 
    document.getElementById('ref-link').innerText = `https://t.me/${botName}?start=${user.telegram_id}`;
}

// ==========================================
// TASKS & SPIN LOGIC
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

window.startTask = async (type, reward) => {
    // VPN Check
    if(config.vpn_required === 'true') {
        const res = await fetch('https://ipinfo.io/json?token=1151161c93b97a').catch(()=>null);
        if(!res) return tg.showAlert("Network Error");
        const data = await res.json();
        const allowed = (config.allowed_countries || '').toUpperCase().split(',');
        if(!allowed.includes(data.country)) {
            document.getElementById('vpn-screen').classList.add('open');
            return;
        }
    }

    // *** FIX 2: SPIN DELAY LOGIC ***
    if(type === 'spin') {
        spinRewardTemp = reward;
        document.getElementById('spin-modal').classList.add('open');
        document.getElementById('spin-result').classList.add('hidden');
        document.getElementById('spin-btn').disabled = false;
        document.getElementById('spin-icon').classList.remove('fa-spin');
    } else {
        // Ad Logic
        if(window.showGiga) {
            window.showGiga().then(() => giveReward(reward)).catch(() => giveReward(reward));
        } else {
            tg.showAlert("Loading Ad...");
            setTimeout(() => giveReward(reward), 3000); // 3 সেকেন্ড পর এড হবে
        }
    }
}

// Spin Button Click Function
window.executeSpin = () => {
    const btn = document.getElementById('spin-btn');
    const icon = document.getElementById('spin-icon');
    
    // 1. বাটন ডিজেবল এবং চাকা ঘোরা শুরু
    btn.disabled = true;
    icon.classList.add('fa-spin'); // FontAwesome spin animation
    icon.style.animationDuration = "0.5s";

    // 2. ওয়েট করা (টাকা এখনো এড হয়নি)
    setTimeout(() => {
        // ৩ সেকেন্ড পর ঘোরা থামবে
        icon.style.animationDuration = "0s"; 
        
        // রেজাল্ট দেখাবে
        document.getElementById('spin-result').classList.remove('hidden');
        document.getElementById('spin-win-amt').innerText = spinRewardTemp;

        // *** FIX 2: REWARD GIVEN HERE AFTER SPIN ***
        // এখন ব্যালেন্স এড হবে
        giveReward(spinRewardTemp);

    }, 3000); // 3000ms = 3 Seconds Delay
}

window.closeSpin = () => {
    document.getElementById('spin-modal').classList.remove('open');
}

async function giveReward(amount) {
    const val = parseFloat(amount);
    
    // ব্যালেন্স আপডেট
    const newBal = parseFloat(user.balance) + val;
    await db.from('users').update({ balance: newBal }).eq('telegram_id', user.telegram_id);
    user.balance = newBal;
    updateUI();
    tg.showAlert(`Congrats! Received ৳${val}`);

    // Commission Logic (রেফারার কমিশন)
    if (user.referrer_id && config.refer_commission_percent > 0) {
        const comm = (val * parseFloat(config.refer_commission_percent)) / 100;
        if(comm > 0) {
            const {data: r} = await db.from('users').select('balance').eq('telegram_id', user.referrer_id).single();
            if(r) await db.from('users').update({ balance: r.balance + comm }).eq('telegram_id', user.referrer_id);
        }
    }
}

// ==========================================
// REFERRAL PAGE & LOAD
// ==========================================

async function loadReferrals() {
    // *** FIX: Show Referral List Properly ***
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

// ==========================================
// WALLET & WITHDRAW (With Restriction)
// ==========================================

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

// *** FIX 3: WITHDRAW RESTRICTION ***
window.withdraw = async () => {
    // 1. Input Check
    const num = document.getElementById('wallet-phone').value;
    if(!wMethod || !wAmount || !num) return tg.showAlert("Please select Method, Amount & Number");

    // 2. Balance Check
    if(user.balance < wAmount) return tg.showAlert("Insufficient Balance!");

    tg.MainButton.showProgress();

    // 3. CHECK REFERRAL COUNT (Minimum 2 Required)
    const { count } = await db.from('users')
        .select('*', { count: 'exact', head: true }) // শুধু কাউন্ট নিবে
        .eq('referrer_id', user.telegram_id);

    tg.MainButton.hideProgress();

    if (count < 2) {
        // ২টির কম রেফার থাকলে উইথড্র হবে না
        tg.showAlert(`⚠️ You need minimum 2 Referrals to withdraw!\nCurrent Referrals: ${count}`);
        return; 
    }

    // 4. Proceed Withdraw
    const newBal = user.balance - wAmount;
    
    // ব্যালেন্স কমানো
    await db.from('users').update({ balance: newBal }).eq('telegram_id', user.telegram_id);
    user.balance = newBal;
    
    // রিকোয়েস্ট জমা দেওয়া
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

// Utils
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

// Start
initApp();
