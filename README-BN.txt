AGENTROUTER AI CHAT — PHP PACKAGE

১) ZIP Extract করে একটি ফোল্ডারে রাখুন।
২) config.php খুলে নতুন AgentRouter API key বসান।
৩) PHP Server Ready অ্যাপে এই প্রজেক্টের ROOT folder / document root নির্বাচন করুন।
   ROOT folder-এ index.php, config.php, style.css, script.js এবং api folder থাকবে।
৪) PHP Server Ready-তে server START করুন।
৫) অ্যাপের দেখানো local URL (যেমন http://127.0.0.1:PORT/) Chrome-এ খুলুন।
   File Manager থেকে index.php-তে ট্যাপ করে খুলবেন না। PHP server ছাড়া PHP execute হবে না।
৬) cURL extension enabled থাকতে হবে।

SSL / CA CERTIFICATE:
- Package-এ cacert.pem থাকলে সেটি config.php-এর পাশেই রাখুন।
- যদি cacert.pem না থাকে বা PHP Server Ready-তে CA error দেখায়, অফিসিয়াল CA bundle
  https://curl.se/ca/cacert.pem থেকে ডাউনলোড করে project root-এ cacert.pem নামে রাখুন।
- SSL verification কোডে চালু রাখা হয়েছে; নিরাপত্তার জন্য এটি বন্ধ করবেন না।

পরীক্ষা:
- Browser-এ /api/diagnostic.php খুললে PHP, cURL এবং CA bundle status দেখা যাবে।
- /api/models.php GET করে model list পরীক্ষা করা যাবে।
- API key কখনো কাউকে পাঠাবেন না, screenshot-এ দেখাবেন না।
- এই package PHP server-এ চালানোর জন্য; GitHub Pages বা file:// দিয়ে PHP চলবে না।
