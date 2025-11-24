// ==========================================
// 1. CONFIGURATION (আপনার দেওয়া কী বসানো হয়েছে)
// ==========================================
const SUPABASE_URL = 'https://jnoavdzcbmskwoectioc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impub2F2ZHpjYm1za3dvZWN0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4MDA4ODcsImV4cCI6MjA3OTM3Njg4N30.x3O1xvNMQfqLZ507nfgDcjFJ3faen-uq6l7mrx47NH8';
const IPINFO_TOKEN = '1151161c93b97a'; // আপনার দেওয়া IP API Key

// Global Variables
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const tg = window.Telegram.WebApp;
let user = null;
let config = {};
let wMethod = null;
let spinReward = 0;

// ==========================================
// 2. INITIALIZATION
// ==========================================
window.onload = async function() {
    tg.expand();
    tg.enableClosingConfirmation();
    
    // কনফিগারেশন লোড (ডাটাবেস থেকে)
    const { data: cfg } = await db.from('app_config').select('*');
    if(cfg) cfg.forEach(c => config[c.key] = c.value);
    
    // UI টেক্সট আপডেট
    document.getElementById('notice').innerText = config.home_notice || 'Welcome';
    document.getElementById('daily-reward').innerText = config.daily_reward || '0';
    document.getElementById('ref-bonus').innerText = config.refer_bonus || '0';
    document.getElementById('vpn-countries').innerText = config.allowed_countries || 'Global';
    document.getElementById('min-ref').innerText = config.min_refer_withdraw || 2;

    // ইউজার অথেন্টিকেশন
    const tgUser = tg.initDataUnsafe.user || { id: 777000, first_name: "Guest" };
    const refParam = tg.initDataUnsafe.start_param;
    let deviceId = localStorage.getItem('did');
    if(!deviceId) { deviceId = 'dev_' + Date.now() + Math.random(); localStorage.setItem('did', deviceId); }

    // ইউজার চেক
    const { data: exist } = await db.from('users').select('*').eq('telegram_id', tgUser.id).single();

    if(!exist) {
        // নতুন ইউজার রেজিস্টার
        const { data: newUser } = await db.from('users').insert([{
            telegram_id: tgUser.id,
            first_name: tgUser.first_name,
            referrer_id: refParam && refParam != tgUser.id ? parseInt(refParam) : null,
            device_id: deviceId,
            balance: 0
        }]).select().single();
        user = newUser;

        // রেফার বোনাস দেওয়া
        if(refParam && refParam != tgUser.id) {
            const bonus = parseFloat(config.refer_bonus || 0);
            const { data: rUser } = await db.from('users').select('balance').eq('telegram_id', refParam).single();
            if(rUser) await db.from('users').update({ balance: rUser.balance + bonus }).eq('telegram_id', refParam);
        }
    } else {
        user = exist;
    }

    // সব ডাটা লোড
    updateUI();
    loadTasks();
    loadWalletData();
    
    // লোডিং স্ক্রিন বন্ধ
    document.getElementById('loading-screen').style.display = 'none';

    // ভিপিএন চেক
    checkVPN();
};

function updateUI() {
    if(!user) return;
    document.getElementById('u-name').innerText = user.first_name;
    document.getElementById('u-id').innerText = user.telegram_id;
    document.getElementById('balance').innerText = parseFloat(user.balance).toFixed(2);
    document.getElementById('w-bal').innerText = parseFloat(user.balance).toFixed(2);
    
    const botName = config.bot_username || "GigaEarnBot";
    document.getElementById('ref-link').innerText = `https://t.me/${botName}?start=${user.telegram_id}`;
    
    // রেফার কাউন্ট লোড (সঠিক কোয়েরি)
    db.from('users').select('*', { count: 'exact', head: true }).eq('referrer_id', user.telegram_id)
        .then(res => document.getElementById('ref-count').innerText = res.count || 0);
    
    // রেফার লিস্ট লোড
    loadRefList();
}

async function loadRefList() {
    const { data: refs } = await db.from('users').select('first_name, telegram_id').eq('referrer_id', user.telegram_id).limit(10);
    const div = document.getElementById('ref-list');
    div.innerHTML = refs && refs.length ? refs.map(r => `<div class="glass p-2 flex justify-between"><span>${r.first_name}</span><span class="text-green-400">+৳${config.refer_bonus}</span></div>`).join('') : '<p class="text-center text-gray-500 py-2">No referrals yet</p>';
}

// ==========================================
// 3. VPN CHECKER (With IPInfo Key)
// ==========================================
async function checkVPN() {
    if(config.vpn_required !== 'true') return true;
    
    try {
        const res = await fetch(`https://ipinfo.io/json?token=${IPINFO_TOKEN}`);
        const data = await res.json();
        const userCountry = data.country ? data.country.toUpperCase() : 'XX';
        const allowed = (config.allowed_countries || 'US,CA,GB').toUpperCase().split(',');

        if(!allowed.includes(userCountry)) {
            document.getElementById('vpn-modal').style.display = 'flex';
            return false;
        }
        return true;
    } catch(e) {
        console.error("VPN Check Failed", e);
        // নেটওয়ার্ক এরর হলে ধরে নিচ্ছি ভিপিএন নেই বা সমস্যা
        document.getElementById('vpn-modal').style.display = 'flex';
        return false;
    }
}

// ==========================================
// 4. AD SYSTEM (First Ad, Then Reward)
// ==========================================
window.showAd = async function() {
    tg.MainButton.showProgress();
    tg.MainButton.setText("LOADING AD...");
    tg.MainButton.show();
    
    return new Promise((resolve) => {
        // ভিপিএন আবার চেক করা
        checkVPN().then(ok => {
            if(!ok) { tg.MainButton.hide(); resolve(false); return; }

            // অ্যাড সিমুলেশন (৩ সেকেন্ড)
            setTimeout(() => {
                tg.MainButton.hide();
                resolve(true); // অ্যাড দেখা সম্পন্ন
            }, 3000);
        });
    });
};

// ==========================================
// 5. TASKS & SPIN LOGIC
// ==========================================
async function loadTasks() {
    const { data: tasks } = await db.from('tasks').select('*').eq('is_active', true).order('reward');
    const div = document.getElementById('task-list');
    div.innerHTML = '';
    
    if(tasks) tasks.forEach(t => {
        div.innerHTML += `
        <div class="glass p-4 flex justify-between items-center">
            <div class="flex gap-3 items-center">
                <div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                    <i class="${t.icon_class || 'fas fa-star'} text-yellow-400"></i>
                </div>
                <div><p class="font-bold text-sm text-white">${t.title}</p><p class="text-xs text-gray-400">Reward: ৳${t.reward}</p></div>
            </div>
            <button onclick="window.doTask('${t.type}', ${t.reward})" class="bg-blue-600 active:bg-blue-700 px-4 py-1.5 rounded-lg text-xs font-bold transition">Start</button>
        </div>`;
    });
}

window.doTask = async function(type, reward) {
    if(type === 'spin') {
        spinReward = reward;
        document.getElementById('spin-modal').style.display = 'flex';
        document.getElementById('spin-status').innerText = "Watch Ad first to unlock Spin!";
        document.getElementById('spin-btn').innerText = "WATCH AD & SPIN";
        document.getElementById('spin-btn').disabled = false;
        document.getElementById('spin-icon').classList.remove('fa-spin');
    } else {
        // ভিডিও বা অন্য টাস্ক
        const watched = await window.showAd();
        if(watched) {
            addBalance(reward);
            tg.showAlert(`Task Completed! Received ৳${reward}`);
        }
    }
};

// স্পিন লজিক (Ad -> Spin -> Money)
window.startSpinProcess = async function() {
    const btn = document.getElementById('spin-btn');
    
    // ১. আগে অ্যাড দেখাবে
    const watched = await window.showAd();
    if(!watched) return;

    // ২. অ্যাড দেখা শেষ, এখন চাকা ঘুরবে
    btn.disabled = true;
    btn.innerText = "SPINNING...";
    const icon = document.getElementById('spin-icon');
    icon.classList.add('fa-spin'); 
    icon.style.animationDuration = '0.5s'; // জোরে ঘুরবে
    document.getElementById('spin-status').innerText = "Good Luck...";

    // ৩. ২ সেকেন্ড পর রেজাল্ট
    setTimeout(() => {
        icon.classList.remove('fa-spin');
        icon.style.animationDuration = ''; 
        document.getElementById('spin-status').innerText = `CONGRATS! YOU WON ৳${spinReward}`;
        addBalance(spinReward);
        btn.innerText = "DONE";
        
        setTimeout(() => {
            document.getElementById('spin-modal').style.display = 'none';
        }, 1500);
    }, 2000);
};

// ডেইলি চেকইন
window.doDaily = async function() {
    const today = new Date().toDateString();
    if(user.last_checkin === today) return tg.showAlert("Come back tomorrow!");
    
    const watched = await window.showAd();
    if(watched) {
        const reward = parseFloat(config.daily_reward);
        addBalance(reward);
        await db.from('users').update({ last_checkin: today }).eq('id', user.id);
        user.last_checkin = today;
        tg.showAlert(`Daily Bonus ৳${reward} Added!`);
    }
};

async function addBalance(amt) {
    const newBal = parseFloat(user.balance) + parseFloat(amt);
    await db.from('users').update({ balance: newBal }).eq('id', user.id);
    user.balance = newBal;
    updateUI();
}

// ==========================================
// 6. WALLET & WITHDRAW (With Restriction)
// ==========================================
async function loadWalletData() {
    const { data: methods } = await db.from('payment_methods').select('*').eq('is_active', true);
    const mDiv = document.getElementById('methods');
    mDiv.innerHTML = '';
    methods.forEach(m => {
        mDiv.innerHTML += `<div onclick="window.selMethod('${m.name}', this)" class="glass p-3 flex flex-col items-center cursor-pointer border border-transparent hover:border-blue-500 transition rounded-lg">
            <img src="${m.logo_url}" class="h-6 mb-1 object-contain">
            <span class="text-[10px] font-bold">${m.name}</span>
        </div>`;
    });

    const { data: hist } = await db.from('withdrawals').select('*').eq('telegram_id', user.telegram_id).order('created_at', {ascending:false});
    const hDiv = document.getElementById('history');
    hDiv.innerHTML = hist && hist.length ? hist.map(h => `<div class="glass p-2 flex justify-between rounded items-center">
        <span class="font-bold">${h.method}</span>
        <span>৳${h.amount}</span>
        <span class="text-[10px] uppercase px-2 py-0.5 rounded ${h.status==='paid'?'bg-green-500/20 text-green-400':'bg-yellow-500/20 text-yellow-400'}">${h.status}</span>
    </div>`).join('') : '<p class="text-center text-gray-500">No history found</p>';
}

window.selMethod = function(name, el) {
    wMethod = name;
    document.querySelectorAll('#methods > div').forEach(d => d.classList.remove('border-blue-500'));
    el.classList.add('border-blue-500');
};

window.doWithdraw = async function() {
    const amt = document.getElementById('w-amount').value;
    const num = document.getElementById('w-number').value;
    
    if(!wMethod || !amt || !num) return tg.showAlert("Please fill all fields!");
    if(parseFloat(user.balance) < amt) return tg.showAlert("Insufficient Balance!");

    tg.MainButton.showProgress();

    // রেফার কাউন্ট চেক (ডাটাবেস থেকে)
    const { count } = await db.from('users').select('*', { count: 'exact', head: true }).eq('referrer_id', user.telegram_id);
    const minRef = parseInt(config.min_refer_withdraw || 2);
    
    tg.MainButton.hideProgress();

    if(count < minRef) {
        tg.showAlert(`Withdraw Failed!\nYou have ${count} referrals.\nNeed minimum ${minRef} referrals.`);
        return;
    }

    // ব্যালেন্স কাটা
    const newBal = user.balance - amt;
    await db.from('users').update({ balance: newBal }).eq('id', user.id);
    
    // রিকোয়েস্ট জমা দেওয়া
    await db.from('withdrawals').insert([{ telegram_id: user.telegram_id, method: wMethod, number: num, amount: amt }]);
    
    user.balance = newBal;
    updateUI();
    loadWalletData();
    tg.showAlert("Withdrawal Request Submitted Successfully!");
};

// ==========================================
// 7. NAVIGATION & UTILS
// ==========================================
window.nav = function(pageId, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    
    if(btn) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
};

window.copyRef = function() {
    navigator.clipboard.writeText(document.getElementById('ref-link').innerText);
    tg.showAlert("Referral Link Copied!");
};

window.openLink = function(url) { 
    if(url) tg.openTelegramLink(url); 
};
