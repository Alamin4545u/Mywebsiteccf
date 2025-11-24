// CONFIGURATION
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // এখানে আপনার সুপাবেস URL দিন
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY'; // এখানে আপনার সুপাবেস Key দিন

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const tg = window.Telegram.WebApp;

// Init
tg.expand();
let user = null;
let config = {};
let currentTask = null;
let selectedMethod = "";

// 1. INITIALIZE APP
async function init() {
    // Load Config first
    const { data: cfg } = await db.from('app_config').select('*');
    if(cfg) cfg.forEach(c => config[c.key] = c.value);

    // Update UI Texts
    document.getElementById('notice-text').innerText = config.home_notice || 'Welcome';
    document.getElementById('daily-amt').innerText = config.daily_reward || '0';
    document.getElementById('ref-bonus').innerText = config.refer_bonus || '0';
    document.getElementById('vpn-list').innerText = config.allowed_countries || 'Global';

    // Auth User
    const tgUser = tg.initDataUnsafe.user || { id: 123456, first_name: "TestUser", username: "tester" };
    let refId = tg.initDataUnsafe.start_param; 
    let deviceId = "dev_" + tgUser.id; // Simple device tracking (Allowed multi-account on logic)

    // Check DB
    const { data: exist } = await db.from('users').select('*').eq('telegram_id', tgUser.id).single();

    if (!exist) {
        // Register New User (Multiple accounts allowed on same device as requested)
        const { data: newUser } = await db.from('users').insert([{
            telegram_id: tgUser.id,
            first_name: tgUser.first_name,
            username: tgUser.username,
            referrer_id: refId ? parseInt(refId) : null,
            device_id: deviceId, 
            balance: 0.00
        }]).select().single();
        user = newUser;
        
        // Give Bonus to Referrer
        if(refId) {
            const bonus = parseFloat(config.refer_bonus || 0);
            const { data: rUser } = await db.from('users').select('balance').eq('telegram_id', refId).single();
            if(rUser) await db.from('users').update({ balance: rUser.balance + bonus }).eq('telegram_id', refId);
        }
    } else {
        user = exist;
    }

    updateUI();
    loadTasks();
    loadMethods();
    checkVPN(); // Initial Check
}

// 2. VPN CHECKER (Strict)
async function checkVPN() {
    if(config.vpn_required !== 'true') return true;
    
    try {
        const res = await fetch('https://ipinfo.io/json?token=YOUR_IPINFO_TOKEN'); // ipinfo.io টোকেন দিবেন ভালো রেটের জন্য
        const data = await res.json();
        const userCountry = data.country.toUpperCase();
        const allowed = (config.allowed_countries || "").toUpperCase().split(',');

        if(!allowed.includes(userCountry)) {
            document.getElementById('vpn-screen').classList.add('open');
            return false;
        }
        return true;
    } catch(e) {
        // If fetch fails, we assume no internet or blocking -> show block screen safe side
        // Or handle gracefully. Here assuming strict:
        return true; // Dev mode: true, Production: false
    }
}

// 3. AD SHOW LOGIC (The Gatekeeper)
async function showAd() {
    tg.MainButton.showProgress();
    tg.MainButton.setText("LOADING AD...");
    tg.MainButton.show();

    return new Promise((resolve, reject) => {
        // VPN Re-check before showing ad
        checkVPN().then(isValid => {
            if(!isValid) {
                tg.MainButton.hide();
                reject("VPN Error");
                return;
            }

            // Simulate Ad Network Call
            // যদি আপনার GigaPub বা অন্য Ad Network থাকে, তাদের Show function এখানে কল করবেন
            console.log("Showing Ad...");
            
            setTimeout(() => {
                // Ad Finished successfully
                tg.MainButton.hide();
                resolve(true); 
            }, 4000); // 4 সেকেন্ড অ্যাড দেখাবে (Simulated)
        });
    });
}

// 4. DAILY CHECKIN
async function dailyCheckin() {
    const today = new Date().toISOString().split('T')[0];
    if(user.last_checkin === today) return tg.showAlert("Already claimed today!");

    try {
        await showAd(); // Wait for Ad First
        
        // If Ad Success -> Add Balance
        const reward = parseFloat(config.daily_reward);
        const newBal = parseFloat(user.balance) + reward;
        
        await db.from('users').update({ balance: newBal, last_checkin: today }).eq('telegram_id', user.telegram_id);
        user.balance = newBal;
        user.last_checkin = today;
        updateUI();
        tg.showAlert(`Success! Added ৳${reward}`);
    } catch(e) {
        tg.showAlert("Ad failed to load. No reward.");
    }
}

// 5. TASK SYSTEM
async function loadTasks() {
    const { data: tasks } = await db.from('tasks').select('*').eq('is_active', true);
    const container = document.getElementById('task-list');
    container.innerHTML = '';

    tasks.forEach(t => {
        container.innerHTML += `
        <div class="glass-panel p-4 flex justify-between items-center">
            <div class="flex items-center gap-3">
                <i class="${t.icon_class} text-2xl text-blue-400"></i>
                <div><h4 class="font-bold text-sm">${t.title}</h4><p class="text-[10px]">Reward: ৳${t.reward}</p></div>
            </div>
            <button onclick="startTask('${t.type}', ${t.reward})" class="bg-blue-600 px-4 py-1.5 rounded text-xs font-bold">START</button>
        </div>`;
    });
}

window.startTask = async (type, reward) => {
    if(type === 'spin') {
        currentTask = { reward: reward };
        document.getElementById('spin-modal').classList.add('open');
    } else {
        // Watch Video / Other
        try {
            await showAd(); // Watch Ad
            addReward(reward);
        } catch(e) {}
    }
}

// Spin Logic
window.doSpin = async () => {
    document.getElementById('spin-btn').disabled = true;
    document.getElementById('spin-wheel').classList.add('animate-spin'); // Faster spin
    
    try {
        await showAd(); // Ad First
        document.getElementById('spin-wheel').classList.remove('animate-spin');
        addReward(currentTask.reward);
        closeSpin();
    } catch(e) {
        document.getElementById('spin-btn').disabled = false;
        document.getElementById('spin-wheel').classList.remove('animate-spin');
    }
}

async function addReward(amount) {
    const newBal = parseFloat(user.balance) + parseFloat(amount);
    await db.from('users').update({ balance: newBal }).eq('telegram_id', user.telegram_id);
    user.balance = newBal;
    updateUI();
    tg.showAlert(`Task Completed! +৳${amount}`);
}

// 6. WITHDRAWAL SYSTEM (With Requirement)
async function requestWithdraw() {
    const amt = parseFloat(document.getElementById('w-amount').value);
    const num = document.getElementById('w-number').value;

    if(!selectedMethod || !amt || !num) return tg.showAlert("Fill all fields.");
    if(user.balance < amt) return tg.showAlert("Insufficient balance.");

    // CHECK REFERRAL COUNT (Minimum 2)
    const { count } = await db.from('users').select('*', { count: 'exact', head: true }).eq('referrer_id', user.telegram_id);
    
    if(count < 2) {
        tg.showAlert(`Withdraw Failed! You need at least 2 referrals. Current: ${count}`);
        return;
    }

    // Proceed
    const newBal = user.balance - amt;
    await db.from('users').update({ balance: newBal }).eq('telegram_id', user.telegram_id);
    await db.from('withdrawals').insert([{
        telegram_id: user.telegram_id,
        method: selectedMethod,
        number: num,
        amount: amt
    }]);
    
    user.balance = newBal;
    updateUI();
    tg.showAlert("Withdrawal Request Submitted!");
    loadHistory();
}

// Helpers
function updateUI() {
    document.getElementById('u-name').innerText = user.first_name;
    document.getElementById('u-id').innerText = user.telegram_id;
    document.getElementById('u-bal').innerText = parseFloat(user.balance).toFixed(2);
    document.getElementById('w-bal').innerText = parseFloat(user.balance).toFixed(2);
    
    const botUser = config.bot_username || "bot";
    document.getElementById('ref-link').innerText = `https://t.me/${botUser}?start=${user.telegram_id}`;
    
    // Load Ref Count
    db.from('users').select('*', { count: 'exact', head: true }).eq('referrer_id', user.telegram_id)
      .then(({count}) => document.getElementById('ref-count').innerText = count);
}

async function loadMethods() {
    const { data } = await db.from('payment_methods').select('*').eq('is_active', true);
    const div = document.getElementById('pay-methods');
    div.innerHTML = '';
    data.forEach(m => {
        div.innerHTML += `<div onclick="selPay('${m.name}', this)" class="glass-panel p-2 flex flex-col items-center cursor-pointer border border-transparent hover:border-blue-500">
            <img src="${m.logo_url}" class="h-8 object-contain">
            <span class="text-[10px] mt-1">${m.name}</span>
        </div>`;
    });
}
window.selPay = (name, el) => {
    selectedMethod = name;
    document.querySelectorAll('#pay-methods > div').forEach(d => d.classList.remove('border-blue-500'));
    el.classList.add('border-blue-500');
}
window.nav = (id, el) => {
    document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active-page'));
    document.getElementById(id).classList.add('active-page');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active', 'text-blue-500'));
    el.classList.add('active', 'text-blue-500');
}
window.copyRef = () => { navigator.clipboard.writeText(document.getElementById('ref-link').innerText); tg.showAlert("Copied!"); }
window.closeSpin = () => { document.getElementById('spin-modal').classList.remove('open'); document.getElementById('spin-btn').disabled = false; }
window.openSupport = () => tg.openTelegramLink(config.support_link);

// Start
init();
