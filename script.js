// --- CONFIGURATION ---
const _URL = 'https://uzrxrnqdozmuycxqtwkg.supabase.co';
const _KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6cnhybnFkb3ptdXljeHF0d2tnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0NzE1NzcsImV4cCI6MjA3OTA0NzU3N30.QttTbmRVeC7RsdHLJKIOccb4qTVCUEleZk3sIwHVVqQ';

const supabase = window.supabase.createClient(_URL, _KEY);
const tg = window.Telegram.WebApp;
tg.expand();

// State
let user = null;
let dbUser = null;
let config = {};
let userCountry = 'BD'; // Default to BD
let currentQuiz = [];
let quizIndex = 0;
let score = 0;
let isSpinning = false;

// --- DEVICE FINGERPRINTING (Anti-Cheat) ---
function getDeviceID() {
    const ua = navigator.userAgent;
    const screenRes = screen.width + 'x' + screen.height;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return btoa(ua + screenRes + timezone).substring(0, 25);
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Telegram User Get
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) user = tg.initDataUnsafe.user;
    else user = { id: 12345678, first_name: 'Demo User', username: 'demo' };

    // 2. IP Detection for Country
    try {
        let res = await fetch('https://ipapi.co/json/');
        let ipData = await res.json();
        userCountry = ipData.country_code; // AU, CA, BD
    } catch (e) { console.log('IP Error, using default'); }

    // 3. Load Config from DB
    let { data: conf } = await supabase.from('app_config').select('*').single();
    config = conf;

    // 4. Sync User with DB
    await syncUser();
});

async function syncUser() {
    const today = new Date().toISOString().split('T')[0];
    const deviceId = getDeviceID();
    const startParam = tg.initDataUnsafe.start_param; // Referral ID

    let { data, error } = await supabase.from('users').select('*').eq('telegram_id', user.id).single();

    if (!data) {
        // New User: Check for Device Duplicate (Fake Refer Prevention)
        const { data: cheat } = await supabase.from('users').select('id').eq('device_id', deviceId).single();
        
        let referrer = null;
        if (startParam && startParam != user.id && !cheat) {
            referrer = parseInt(startParam);
        } else if (cheat) {
            console.log("Fake Refer Detected: Device already exists.");
        }

        const { data: newUser } = await supabase.from('users').insert([{
            telegram_id: user.id,
            first_name: user.first_name,
            photo_url: user.photo_url || '',
            country: userCountry,
            device_id: deviceId,
            referred_by: referrer,
            spins_left: config.daily_spin_limit
        }]).select().single();
        dbUser = newUser;
    } else {
        // Existing User: Daily Reset & Country Update
        const updates = {};
        if (data.last_active_date !== today) {
            updates.last_active_date = today;
            updates.spins_left = config.daily_spin_limit;
        }
        if (data.country !== userCountry) updates.country = userCountry;
        
        if (Object.keys(updates).length > 0) {
            await supabase.from('users').update(updates).eq('telegram_id', user.id);
            Object.assign(data, updates);
        }
        dbUser = data;
    }
    updateUI();
}

function updateUI() {
    if (!dbUser) return;
    document.getElementById('headName').innerText = user.first_name;
    document.getElementById('headBal').innerText = dbUser.balance.toFixed(2);
    document.getElementById('userCountry').innerText = userCountry;
    
    document.getElementById('profName').innerText = user.first_name;
    document.getElementById('profBal').innerText = dbUser.balance.toFixed(2);
    document.getElementById('refBal').innerText = dbUser.referral_income.toFixed(2);
    document.getElementById('profCountry').innerText = userCountry;
    document.getElementById('spinLeft').innerText = dbUser.spins_left;
    
    // Refer Link
    document.getElementById('refLink').value = `https://t.me/YOUR_BOT_USERNAME?start=${user.id}`;
    
    // Images
    const p = user.photo_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById('headImg').src = p;
    document.getElementById('profImg').src = p;
}

// --- REWARD SYSTEM (Country Based) ---
function getReward(type) { // type: 'spin' or 'quiz'
    let amount = 0;
    if (userCountry === 'AU') amount = type === 'spin' ? config.au_spin_reward : config.au_quiz_reward;
    else if (userCountry === 'CA') amount = type === 'spin' ? config.ca_spin_reward : config.ca_quiz_reward;
    else amount = type === 'spin' ? config.bd_spin_reward : config.bd_quiz_reward; // Default BD
    return amount;
}

async function addBalance(type) {
    const amount = getReward(type);
    
    // 1. User Update
    const updates = { balance: dbUser.balance + amount };
    if(type === 'spin') updates.spins_left = dbUser.spins_left - 1;
    
    await supabase.from('users').update(updates).eq('telegram_id', user.id);
    
    // 2. Referral Commission (10%)
    if (dbUser.referred_by) {
        const comm = (amount * config.referral_commission) / 100;
        const { data: upline } = await supabase.from('users').select('balance, referral_income').eq('telegram_id', dbUser.referred_by).single();
        if (upline) {
            await supabase.from('users').update({
                balance: upline.balance + comm,
                referral_income: upline.referral_income + comm
            }).eq('telegram_id', dbUser.referred_by);
        }
    }

    Swal.fire('অভিনন্দন', `আপনি ৳${amount.toFixed(2)} জিতেছেন!`, 'success');
    syncUser(); // Reload data
}

// --- SPIN ---
function doSpin() {
    if (isSpinning) return;
    if (dbUser.spins_left <= 0) return Swal.fire('Limit', 'আজকের স্পিন শেষ!', 'error');

    isSpinning = true;
    document.getElementById('spinBtn').disabled = true;
    const wheel = document.getElementById('wheel');
    const deg = Math.floor(3000 + Math.random() * 3000);
    wheel.style.transform = `rotate(${deg}deg)`;

    setTimeout(() => {
        isSpinning = false;
        if (window.showGiga) window.showGiga().then(() => addBalance('spin')).catch(() => addBalance('spin'));
        else addBalance('spin');
        
        wheel.style.transition = 'none';
        wheel.style.transform = 'rotate(0deg)';
        setTimeout(() => {
            wheel.style.transition = 'transform 4s ease-out';
            document.getElementById('spinBtn').disabled = false;
        }, 100);
    }, 4000);
}

// --- QUIZ ---
async function startQuiz(cat) {
    // Fetch from DB
    const { data } = await supabase.from('questions').select('*').eq('category', cat);
    
    if (data && data.length > 0) currentQuiz = data;
    else if (typeof fallbackQuizDB !== 'undefined') currentQuiz = fallbackQuizDB[cat] || [];
    else return Swal.fire('Error', 'No questions found', 'error');

    if(currentQuiz.length === 0) return Swal.fire('Sorry', 'No questions', 'info');

    // Take random 5
    currentQuiz = currentQuiz.sort(() => 0.5 - Math.random()).slice(0, 5);
    quizIndex = 0; score = 0;
    document.getElementById('qTotal').innerText = currentQuiz.length;
    document.getElementById('quizModal').style.display = 'flex';
    loadQ();
}

function loadQ() {
    if(quizIndex >= currentQuiz.length) { endQuiz(); return; }
    const q = currentQuiz[quizIndex];
    document.getElementById('qText').innerText = q.question || q.q; // Support both DB and local format
    document.getElementById('qIdx').innerText = quizIndex + 1;
    
    const div = document.getElementById('qOptions');
    div.innerHTML = '';
    const opts = q.options || q.o;
    const ans = q.answer !== undefined ? q.answer : q.a;

    opts.forEach((o, i) => {
        const b = document.createElement('button');
        b.className = 'opt-btn'; b.innerText = o;
        b.onclick = () => {
            document.querySelectorAll('.opt-btn').forEach(btn => btn.disabled = true);
            if(i === ans) { b.classList.add('correct'); score++; }
            else { b.classList.add('wrong'); }
            setTimeout(() => { quizIndex++; loadQ(); }, 1000);
        };
        div.appendChild(b);
    });
}

function endQuiz() {
    document.getElementById('quizModal').style.display = 'none';
    if(score >= 3) { // Need 3 correct to get reward
        if (window.showGiga) window.showGiga().then(() => addBalance('quiz')).catch(() => addBalance('quiz'));
        else addBalance('quiz');
    } else {
        Swal.fire('Failed', 'মিনিমাম ৩টি সঠিক উত্তর দিতে হবে!', 'warning');
    }
}

// --- WITHDRAW ---
async function withdraw() {
    const amt = parseFloat(document.getElementById('wAmount').value);
    const num = document.getElementById('wNumber').value;
    const method = document.getElementById('wMethod').value;

    if(amt < config.min_withdraw) return Swal.fire('Error', `মিনিমাম ৳${config.min_withdraw}`, 'error');
    if(amt > dbUser.balance) return Swal.fire('Error', 'ব্যালেন্স নেই', 'error');
    if(!num) return Swal.fire('Error', 'নাম্বার দিন', 'error');

    await supabase.from('users').update({ balance: dbUser.balance - amt }).eq('telegram_id', user.id);
    await supabase.from('withdrawals').insert({
        telegram_id: user.id, amount: amt, method: method, number: num, country: userCountry
    });
    
    syncUser();
    Swal.fire('Success', 'রিকোয়েস্ট পাঠানো হয়েছে!', 'success');
}

// --- UTILS ---
function nav(id, el) {
    document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(el) el.classList.add('active');
}
function copyRef() {
    const txt = document.getElementById('refLink');
    txt.select(); document.execCommand('copy');
    Swal.fire('Copied!', '', 'success');
                          }
