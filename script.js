// --- CONFIGURATION ---
const _URL = 'https://uzrxrnqdozmuycxqtwkg.supabase.co';
const _KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6cnhybnFkb3ptdXljeHF0d2tnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0NzE1NzcsImV4cCI6MjA3OTA0NzU3N30.QttTbmRVeC7RsdHLJKIOccb4qTVCUEleZk3sIwHVVqQ';

const supabase = window.supabase.createClient(_URL, _KEY);
const tg = window.Telegram.WebApp;
tg.expand();

// Global Variables
let user = { id: 0, first_name: 'Guest', photo_url: '' };
let dbUser = null;
let appConfig = { daily_spin_limit: 10, quiz_view_count: 5, min_withdraw: 3000, conversion_rate: 'Loading...' };
let currentQuiz = [];
let quizIndex = 0;
let score = 0;
let spinning = false;

// --- INIT APP ---
document.addEventListener('DOMContentLoaded', async () => {
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        user = tg.initDataUnsafe.user;
    } else {
        user = { id: 123456, first_name: 'Demo User', photo_url: 'https://cdn-icons-png.flaticon.com/512/149/149071.png' };
    }

    document.getElementById('headerName').innerText = user.first_name;
    document.getElementById('headerId').innerText = user.id;
    document.getElementById('profileName').innerText = user.first_name;
    const photo = user.photo_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById('headerImg').src = photo;
    document.getElementById('profileImg').src = photo;

    await fetchConfig();
    await syncUser();
});

// --- DB FUNCTIONS ---
async function fetchConfig() {
    const { data } = await supabase.from('app_config').select('*').eq('id', 1).single();
    if(data) {
        appConfig = data;
        document.getElementById('rateText').innerText = data.conversion_rate;
    }
}

async function syncUser() {
    let { data } = await supabase.from('users').select('*').eq('telegram_id', user.id).single();
    const today = new Date().toISOString().split('T')[0];

    if (!data) {
        const { data: newUser } = await supabase.from('users').insert([{
            telegram_id: user.id, first_name: user.first_name, photo_url: user.photo_url || '',
            last_active_date: today, spins_left: appConfig.daily_spin_limit
        }]).select().single();
        dbUser = newUser;
    } else {
        if (data.last_active_date !== today) {
            await supabase.from('users').update({ spins_left: appConfig.daily_spin_limit, last_active_date: today }).eq('telegram_id', user.id);
            data.spins_left = appConfig.daily_spin_limit;
        }
        if (data.photo_url !== user.photo_url) {
            await supabase.from('users').update({ photo_url: user.photo_url }).eq('telegram_id', user.id);
        }
        dbUser = data;
    }
    updateUI();
}

function updateUI() {
    if(!dbUser) return;
    document.getElementById('headerBalance').innerText = dbUser.balance;
    document.getElementById('profileBalanceDisp').innerText = dbUser.balance;
    document.getElementById('profileQuizCount').innerText = dbUser.quizzes_played;
    document.getElementById('spinCount').innerText = dbUser.spins_left;
}

function navTo(pageId, navId) {
    document.querySelectorAll('.pages').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(navId) document.getElementById(navId).classList.add('active');
}

async function loadLeaderboard() {
    const list = document.getElementById('leaderboardList');
    list.innerHTML = '<center>Loading...</center>';
    const { data } = await supabase.from('users').select('first_name, balance, photo_url').order('balance', { ascending: false }).limit(10);
    if (data) {
        list.innerHTML = '';
        data.forEach((u, i) => {
            list.innerHTML += `
            <div class="leaderboard-item">
                <div style="display:flex; align-items:center; gap:10px;">
                    <b style="color:var(--primary)">#${i + 1}</b>
                    <img src="${u.photo_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:30px; height:30px; border-radius:50%;">
                    <span>${u.first_name}</span>
                </div>
                <b style="color:#ffd700">${u.balance} 🪙</b>
            </div>`;
        });
    }
}

async function startQuiz(cat) {
    Swal.showLoading();
    const { data } = await supabase.from('questions').select('*').eq('category', cat);
    Swal.close();
    if(data && data.length > 0) {
        currentQuiz = data.map(q => ({ q: q.question, o: q.options, a: q.answer }));
    } else {
        if(typeof fallbackQuizDB !== 'undefined' && fallbackQuizDB[cat]) currentQuiz = fallbackQuizDB[cat];
        else return Swal.fire('দুঃখিত', 'এই ক্যাটাগরিতে প্রশ্ন নেই!', 'error');
    }
    currentQuiz = currentQuiz.sort(() => 0.5 - Math.random()).slice(0, appConfig.quiz_view_count);
    quizIndex = 0; score = 0;
    document.getElementById('qTotal').innerText = currentQuiz.length;
    document.getElementById('quizModal').style.display = "flex";
    loadQuestion();
}

function loadQuestion() {
    if (quizIndex >= currentQuiz.length) { endQuiz(); return; }
    const q = currentQuiz[quizIndex];
    document.getElementById('qText').innerText = q.q;
    document.getElementById('qIndex').innerText = quizIndex + 1;
    const div = document.getElementById('qOptions');
    div.innerHTML = '';
    q.o.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'quiz-option';
        btn.innerText = opt;
        btn.onclick = () => checkAns(i, q.a, btn);
        div.appendChild(btn);
    });
}

function checkAns(sel, cor, btn) {
    const all = document.querySelectorAll('.quiz-option');
    all.forEach(b => b.disabled = true);
    if(sel === cor) { btn.classList.add('correct'); score++; }
    else { btn.classList.add('wrong'); all[cor].classList.add('correct'); }
    setTimeout(() => { quizIndex++; loadQuestion(); }, 1000);
}

function endQuiz() {
    document.getElementById('quizModal').style.display = "none";
    const reward = score * 5; 
    if(window.showGiga) window.showGiga().then(() => addBalance(reward, true)).catch(() => addBalance(reward, true));
    else addBalance(reward, true);
}

async function addBalance(amt, isQuiz) {
    const updates = { balance: dbUser.balance + amt };
    if(isQuiz) updates.quizzes_played = dbUser.quizzes_played + 1;
    else updates.spins_left = dbUser.spins_left - 1;
    await supabase.from('users').update(updates).eq('telegram_id', user.id);
    Swal.fire('অভিনন্দন!', `আপনি ${amt} কয়েন পেয়েছেন!`, 'success');
    syncUser();
}

function doSpin() {
    if (spinning) return;
    if (dbUser.spins_left <= 0) return Swal.fire('দুঃখিত', 'আজকের স্পিন শেষ!', 'error');
    spinning = true;
    document.getElementById('spinTrigger').disabled = true;
    const wheel = document.getElementById('wheel');
    const rot = Math.floor(3000 + Math.random() * 3000);
    wheel.style.transform = `rotate(${rot}deg)`;

    setTimeout(() => {
        spinning = false;
        const min = appConfig.spin_reward_min || 5;
        const max = appConfig.spin_reward_max || 50;
        const points = Math.floor(Math.random() * (max - min + 1)) + min;
        if(window.showGiga) window.showGiga().then(() => addBalance(points, false)).catch(() => addBalance(points, false));
        else addBalance(points, false);
        wheel.style.transition = 'none';
        wheel.style.transform = 'rotate(0deg)';
        setTimeout(() => {
            wheel.style.transition = 'transform 4s cubic-bezier(0.33, 1, 0.68, 1)';
            document.getElementById('spinTrigger').disabled = false;
        }, 100);
    }, 4000);
}

async function submitWithdraw() {
    const amt = parseInt(document.getElementById('wAmount').value);
    const num = document.getElementById('wNumber').value;
    const mth = document.getElementById('wMethod').value;
    const min = appConfig.min_withdraw || 3000;
    if(!amt || amt < min) return Swal.fire('Error', `মিনিমাম ${min} কয়েন লাগবে`, 'error');
    if(amt > dbUser.balance) return Swal.fire('Error', 'পর্যাপ্ত ব্যালেন্স নেই', 'error');
    if(!num) return Swal.fire('Error', 'নাম্বার দিন', 'error');
    await supabase.from('users').update({ balance: dbUser.balance - amt }).eq('telegram_id', user.id);
    await supabase.from('withdrawals').insert([{ telegram_id: user.id, amount: amt, method: mth, number: num }]);
    syncUser();
    Swal.fire('সফল!', 'রিকোয়েস্ট এডমিনের কাছে পাঠানো হয়েছে।', 'success');
}

// --- AGGRESSIVE AUTO ADS (3 Seconds Loop) ---
let autoAdInterval = null;

function toggleAutoAds() {
    if (autoAdInterval) {
        // বন্ধ করা হচ্ছে
        clearInterval(autoAdInterval);
        autoAdInterval = null;
        Swal.fire({
            icon: 'info',
            title: 'অটো অ্যাড বন্ধ!',
            text: 'অটোমেটিক অ্যাড লুপ বন্ধ করা হয়েছে।',
            timer: 2000,
            showConfirmButton: false
        });
    } else {
        // চালু করা হচ্ছে
        Swal.fire({
            icon: 'success',
            title: 'অটো অ্যাড চালু!',
            text: 'প্রতি ৩ সেকেন্ড পর পর অ্যাড কমান্ড পাঠানো হবে।',
            timer: 2000,
            showConfirmButton: false
        });
        
        // সাথে সাথে একবার কল
        triggerAd();

        // ৩ সেকেন্ড পর পর লুপ চলবে (আগের অ্যাড ক্লোজ হলো কি না সেটা দেখবে না)
        autoAdInterval = setInterval(() => {
            triggerAd();
        }, 3000);
    }
}

function triggerAd() {
    if (window.showGiga) {
        // এখানে .then() বা .catch() এর জন্য অপেক্ষা করা হবে না
        // সরাসরি ফায়ার করা হবে
        window.showGiga().catch((e) => {
            console.log("Ad overlapped or error:", e);
        });
    }
}
