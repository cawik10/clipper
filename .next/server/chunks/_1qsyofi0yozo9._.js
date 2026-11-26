(()=>{"use strict";module.exports=[95031,a=>{let e=new Uint8Array(16),t=[];for(let a=0;a<256;++a)t.push((a+256).toString(16).slice(1));a.s(["f",0,function(a,i,n){return i||a||!crypto.randomUUID?function(a,i,n){let r=(a=a||{}).random??a.rng?.()??crypto.getRandomValues(e);if(r.length<16)throw Error("Random bytes length must be >= 16");if(r[6]=15&r[6]|64,r[8]=63&r[8]|128,i){if((n=n||0)<0||n+16>i.length)throw RangeError(`UUID byte range ${n}:${n+15} is out of buffer bounds`);for(let a=0;a<16;++a)i[n+a]=r[a];return i}return function(a,e=0){return(t[a[e+0]]+t[a[e+1]]+t[a[e+2]]+t[a[e+3]]+"-"+t[a[e+4]]+t[a[e+5]]+"-"+t[a[e+6]]+t[a[e+7]]+"-"+t[a[e+8]]+t[a[e+9]]+"-"+t[a[e+10]]+t[a[e+11]]+t[a[e+12]]+t[a[e+13]]+t[a[e+14]]+t[a[e+15]]).toLowerCase()}(r)}(a,i,n):crypto.randomUUID()}],95031)},33541,a=>a.a(async(e,t)=>{try{var i=a.i(77136),n=a.i(54799),r=a.i(89578),o=a.i(7082),l=a.i(27065),s=e([o]);[o]=s.then?(await s)():s;let S=`🛠️ <b>Admin Panel</b>

/admin — panel utama (tombol)
/admin stats — statistik global
/admin users [halaman] — daftar user
/admin user &lt;id|@username&gt; — detail user
/admin ban &lt;id|@username&gt; [alasan]
/admin unban &lt;id|@username&gt;
/admin quota &lt;id|@username&gt; &lt;angka|default|unlimited&gt;
/broadcast &lt;pesan&gt; — kirim ke semua user`;function u(a){if(!a||isNaN(a.getTime()))return"-";try{return a.toLocaleString("id-ID",{timeZone:(0,r.p)(),hour12:!1,dateStyle:"short",timeStyle:"short"})}catch{return a.toISOString()}}function d(a){if(!a||isNaN(a.getTime()))return"-";let e=Math.max(0,Math.floor((Date.now()-a.getTime())/1e3));return e<60?"baru saja":e<3600?`${Math.floor(e/60)} mnt lalu`:e<86400?`${Math.floor(e/3600)} jam lalu`:`${Math.floor(e/86400)} hari lalu`}let E={done:"✅",error:"❌",queued:"⏳",clips_ready:"🎞",skipped:"⏭"};async function c(){let a=await (0,o.x)();return{text:`🛠️ <b>Admin Panel</b>

👥 User: <b>${a.totalUsers}</b> (aktif 24 jam: ${a.active24h})
🎬 Job ${(0,r.W)()} ini: <b>${a.jobsPeriod}</b> • 24 jam: ${a.jobs24h}
❌ Error 24 jam: <b>${a.errors24h}</b>
🚫 User diban: <b>${a.bannedUsers}</b>

Pilih menu di bawah, atau ketik /admin help untuk daftar perintah.`,kb:new i.InlineKeyboard().text("📊 Statistik","adm:stats").text("👥 Daftar User","adm:users:0").row().text("📢 Broadcast","adm:bc").text("⚙️ Konfigurasi","adm:cfg").row().text("🔄 Refresh","adm:main")}}async function m(){var a;let e,t,n,s=await (0,o.x)(),u=s.jobsByStatus.length?s.jobsByStatus.map(a=>`${E[a.status]??"⚙️"} ${(0,l.escapeHtmlText)(a.status)} ${a.count}`).join(" • "):"-",c=s.topUsers.length?s.topUsers.map((a,e)=>`${e+1}. ${(0,l.escapeHtmlText)(a.label)} — ${a.jobs} job`).join("\n"):"-",m=s.errorSamples.length?s.errorSamples.map(a=>`• <code>${(0,l.escapeHtmlText)(a.jobId.slice(0,8))}</code> ${(0,l.escapeHtmlText)(d(a.at))}: ${(0,l.escapeHtmlText)(a.message.slice(0,80))}`).join("\n"):"-",p=process.memoryUsage();return{text:`📊 <b>Statistik Global</b>

<b>👥 User</b>
Total: <b>${s.totalUsers}</b> • Aktif 24 jam: <b>${s.active24h}</b>
Baru: ${s.newUsers24h} (24 jam) • ${s.newUsers7d} (7 hari)
Diban: ${s.bannedUsers} • YouTube terhubung: ${s.youtubeConnected}

<b>🎬 Job</b>
Total: <b>${s.jobsTotal}</b> • 24 jam: ${s.jobs24h} • ${(0,r.W)()} ini: ${s.jobsPeriod}
Status: ${u}
Error 24 jam: <b>${s.errors24h}</b>

<b>✂️ Hasil</b>
Klip dibuat: <b>${s.totalClips}</b> • Upload YouTube sukses: <b>${s.uploadsDone}</b>

<b>🏆 Top user ${(0,r.W)()} ini</b>
${c}

<b>🧾 Error job terbaru</b>
${m}

<b>🖥 Server</b>
Uptime: ${e=Math.floor((a=process.uptime())/86400),t=Math.floor(a%86400/3600),n=Math.floor(a%3600/60),`${e?`${e}h `:""}${t}j ${n}m`} • RAM: ${Math.round(p.rss/1048576)} MB`,kb:new i.InlineKeyboard().text("🔄 Refresh","adm:stats").text("⬅️ Menu","adm:main")}}async function p(a){let e=(0,r.R)(),t=a=>Math.max(1,Math.ceil(a/e)),{users:n,total:s}=await (0,o.u)(a,e);a>0&&!n.length&&(a=t(s)-1,{users:n,total:s}=await (0,o.u)(a,e));let u=n.map((t,i)=>{let n,r,s=`${t.banned?" 🚫":""}${t.youtubeConnected?" ▶️":""}`;return`${a*e+i+1}. <b>${(0,l.escapeHtmlText)((0,o.W)(t))}</b> <code>${t.id}</code>${s}
    📦 ${t.totalJobs} job • kuota ${(0,l.escapeHtmlText)((n=(0,o.n)(t.quotaOverride),r=null!==t.quotaOverride?" (custom)":"",`${t.usedInPeriod}/${n>0?n:"∞"}${r}`))} • ${(0,l.escapeHtmlText)(d(t.lastSeen))}`}),c=`👥 <b>Daftar User</b> (hal. ${a+1}/${t(s)} • total ${s})
🚫 diban • ▶️ YouTube terhubung

`+(u.join("\n")||"Belum ada user."),m=new i.InlineKeyboard;return n.forEach((e,t)=>{let i=(0,o.W)(e).slice(0,18);m.text(`${e.banned?"🚫":"👤"} ${i}`,`adm:u:${e.id}:${a}`),t%2==1&&m.row()}),n.length%2==1&&m.row(),a>0&&m.text("◀️",`adm:users:${a-1}`),m.text("⬅️ Menu","adm:main"),(a+1)*e<s&&m.text("▶️",`adm:users:${a+1}`),{text:c,kb:m}}async function k(a,e){let t=await (0,o.g)(a);if(!t)return{text:`❌ User <code>${(0,l.escapeHtmlText)(a)}</code> tidak ditemukan.`,kb:new i.InlineKeyboard().text("⬅️ Daftar",`adm:users:${e}`)};let n=(0,o.n)(t.quotaOverride),s=`👤 <b>${(0,l.escapeHtmlText)((0,o.W)(t))}</b>
ID: <code>${t.id}</code>${(0,r.N)(t.id)?" (admin)":""}
Status: ${t.banned?`🚫 <b>DIBAN</b>${t.banReason?` — ${(0,l.escapeHtmlText)(t.banReason)}`:""}`:"✅ aktif"}
YouTube: ${t.youtubeConnected?"✅ terhubung":"❌ belum"}

📦 Total job: <b>${t.totalJobs}</b>
🎟 Kuota per ${(0,r.W)()}: <b>${t.usedInPeriod}/${n>0?n:"∞"}</b>${null!==t.quotaOverride?" (custom)":` (default${(0,r.x)()>0?"":": tanpa batas"})`}
🕒 Pertama terlihat: ${(0,l.escapeHtmlText)(u(t.firstSeen))}
🕒 Terakhir aktif: ${(0,l.escapeHtmlText)(u(t.lastSeen))} (${(0,l.escapeHtmlText)(d(t.lastSeen))})`,c=new i.InlineKeyboard;return t.banned?c.text("✅ Unban",`adm:unban:${t.id}:${e}`):(0,r.N)(t.id)||c.text("🚫 Ban",`adm:ban:${t.id}:${e}`),c.row().text("🎟 3",`adm:q:${t.id}:3:${e}`).text("5",`adm:q:${t.id}:5:${e}`).text("10",`adm:q:${t.id}:10:${e}`).text("25",`adm:q:${t.id}:25:${e}`).text("50",`adm:q:${t.id}:50:${e}`).row().text("♾ Unlimited",`adm:q:${t.id}:u:${e}`).text("↩️ Default",`adm:q:${t.id}:d:${e}`).row().text("🔄 Refresh",`adm:u:${t.id}:${e}`).text("⬅️ Daftar",`adm:users:${e}`),{text:s,kb:c}}function b(){let a=(0,r.L)();return{text:`📢 <b>Broadcast</b>

Kirim pesan ke semua user:
<code>/broadcast Halo semua! Ada fitur baru 🎉</code>

${a.confirm?"Kamu akan diminta konfirmasi sebelum pesan dikirim.":"Pesan langsung dikirim tanpa konfirmasi."}
User yang diban ${a.includeBanned?"ikut":"tidak"} menerima broadcast.`,kb:new i.InlineKeyboard().text("⬅️ Menu","adm:main")}}async function h(a,e){let t={parse_mode:"HTML",reply_markup:e.kb,link_preview_options:{is_disabled:!0}};if(a.callbackQuery)try{await a.editMessageText(e.text,t);return}catch(a){if(a instanceof i.GrammyError&&/not modified/i.test(a.description))return}await a.reply(e.text,t)}async function w(a,e){await a.reply(e,{parse_mode:"HTML",link_preview_options:{is_disabled:!0}})}async function g(a){return!!((0,r.e)()&&(0,r.N)(a.from?.id))||(a.callbackQuery?await a.answerCallbackQuery({text:r.P.notAdmin,show_alert:!0}).catch(()=>{}):await a.reply(r.P.notAdmin).catch(()=>{}),!1)}async function f(a,e,t,i){if(t&&(0,r.N)(e))return"❌ Tidak bisa memblokir sesama admin.";if(await (0,o.s)(e,t,String(a.from?.id),i),(0,r.F)()){let n=t?i?r.P.bannedWithReason(i):r.P.banned:r.P.unbanned;await a.api.sendMessage(e,n).catch(()=>{})}return t?`🚫 User <code>${e}</code> diblokir.`:`✅ User <code>${e}</code> dibuka blokirnya.`}function y(a){let e=a.trim().toLowerCase();if(["default","reset","d"].includes(e))return null;if(["unlimited","inf","∞","u","0"].includes(e))return 0;if(/^\d+$/.test(e)){let a=parseInt(e,10);return a>0&&a<=1e6?a:void 0}}function $(a,e){let t=null===e?`default (${(0,r.x)()>0?(0,r.x)():"tanpa batas"})`:0===e?"tanpa batas":`${e} per ${(0,r.W)()}`;return`🎟 Kuota user <code>${a}</code> diatur ke <b>${t}</b>.`}let C=new Map,x=!1;function _(a){let e=(0,r.L)().header;return e?`${e}

${a}`:a}let O=a=>new Promise(e=>setTimeout(e,a));async function T(a,e,t){for(let n=0;n<2;n++)try{return await a.sendMessage(e,t,{link_preview_options:{is_disabled:!0}}),!0}catch(a){if(a instanceof i.GrammyError&&429===a.error_code&&0===n){let e=Number(a.parameters?.retry_after??3);await O((e+1)*1e3);continue}break}return!1}async function I(a,e,t,i){x=!0;try{let n=(0,r.L)(),l=await (0,o.Q)(),s=await (0,o.E)(t,i,l.length),u=_(i),d=0,c=0;for(let e of l)await T(a,e.chatId,u)?d++:c++,n.delayMs&&await O(n.delayMs);await (0,o.N)(s,d,c).catch(()=>{}),await a.sendMessage(e,`📢 <b>Broadcast selesai</b>

✅ Terkirim: <b>${d}</b>
❌ Gagal: <b>${c}</b> (biasanya user yang memblokir bot)
👥 Total penerima: ${l.length}`,{parse_mode:"HTML"}).catch(()=>{})}catch(i){console.error("[admin] broadcast gagal:",i),await (0,l.reportError)("Broadcast",i,{userId:t}),await a.sendMessage(e,"❌ Broadcast gagal, cek log server.").catch(()=>{})}finally{x=!1}}async function M(a,e){if(x)return void await a.reply("⏳ Masih ada broadcast yang berjalan. Tunggu sampai selesai.");let t=await (0,o.Q)();await a.reply(`🚀 Broadcast dimulai ke ${t.length} user... Laporan akan dikirim setelah selesai.`),I(a.api,a.chat.id,String(a.from.id),e)}async function A(a,e){let t=await (0,o.R)(e);return!!t.allowed||("banned"===t.reason?await a.reply(t.banReason?r.P.bannedWithReason(t.banReason):r.P.banned).catch(()=>{}):await a.reply(r.P.quotaExceeded(t.used,t.limit,(0,r.W)())).catch(()=>{}),!1)}async function v(a,e,t){await a.reply(e,{parse_mode:"HTML",reply_markup:t,link_preview_options:{is_disabled:!0}})}a.s(["N",0,A,"Q",0,function(a){a.command("admin",async a=>{if(!await g(a))return;let[e="",...t]=String(a.match||"").trim().split(/\s+/).filter(Boolean);try{switch(e.toLowerCase()){case"":case"panel":return h(a,await c());case"help":default:return void await w(a,S);case"stats":return h(a,await m());case"users":{let e=Math.max(0,(parseInt(t[0]??"1",10)||1)-1);return h(a,await p(e))}case"user":case"ban":case"unban":case"quota":{if(!t[0])return void await w(a,`Format salah.

${S}`);let i=await (0,o.G)(t[0]);if(!i)return void await w(a,`❌ User <code>${(0,l.escapeHtmlText)(t[0])}</code> tidak ditemukan. Pakai ID angka atau @username yang pernah chat dengan bot.`);if("user"===e)return h(a,await k(i,0));if("ban"===e)return void await w(a,await f(a,i,!0,t.slice(1).join(" ")||void 0));if("unban"===e)return void await w(a,await f(a,i,!1));let n=y(t[1]??"");if(void 0===n)return void await w(a,"Format: <code>/admin quota &lt;id|@username&gt; &lt;angka|default|unlimited&gt;</code>");return await (0,o.S)(i,n),void await w(a,$(i,n))}}}catch(e){console.error("[admin] /admin gagal:",e),await (0,l.reportError)("/admin",e,{userId:a.from?.id}),await a.reply("❌ Terjadi kesalahan saat memproses perintah admin.").catch(()=>{})}}),a.command("broadcast",async a=>{if(!await g(a))return;let e=String(a.match||"").trim(),t=(0,r.L)();if(!e)return h(a,b());if(e.length>t.maxChars)return void await a.reply(`❌ Pesan terlalu panjang (${e.length}/${t.maxChars} karakter).`);try{if(!t.confirm)return await M(a,e);for(let[a,e]of C)Date.now()-e.at>6e5&&C.delete(a);let r=(0,n.randomBytes)(4).toString("hex");C.set(r,{adminId:String(a.from.id),text:e,at:Date.now()});let s=await (0,o.Q)();await v(a,`📢 <b>Konfirmasi Broadcast</b>

Penerima: <b>${s.length}</b> user

<b>Pratinjau:</b>
──────────
${(0,l.escapeHtmlText)(_(e))}
──────────

Kirim sekarang?`,new i.InlineKeyboard().text("✅ Kirim",`adm:bcs:${r}`).text("❌ Batal",`adm:bcc:${r}`))}catch(e){console.error("[admin] /broadcast gagal:",e),await (0,l.reportError)("/broadcast",e,{userId:a.from?.id}),await a.reply("❌ Gagal menyiapkan broadcast.").catch(()=>{})}}),a.callbackQuery(/^adm:/,async a=>{if(!await g(a))return;let e=a.callbackQuery.data.split(":"),t=e[1];try{switch(t){case"main":return await a.answerCallbackQuery(),h(a,await c());case"stats":return await a.answerCallbackQuery(),h(a,await m());case"cfg":let n,s,u;return await a.answerCallbackQuery(),h(a,(n=(0,r.K)(),s=(0,r.L)(),u=(0,r.x)(),{text:`⚙️ <b>Konfigurasi Admin</b>
<i>Ubah lewat Railway Variables</i>

👮 Admin: <code>${(0,l.escapeHtmlText)((0,r.Q)().join(", "))}</code> (<code>ADMIN_TELEGRAM_IDS</code>)

<b>🎟 Kuota</b>
Default: <b>${u>0?u:"tanpa batas"}</b> (<code>ADMIN_DEFAULT_QUOTA</code>)
Periode: <b>${(0,r.M)()}</b> • zona waktu ${(0,l.escapeHtmlText)((0,r.p)())}
Admin bebas kuota: ${(0,r.V)()?"✅":"❌"}

<b>🚨 Notifikasi error</b>
Status: ${n.enabled?"✅ aktif":"❌ nonaktif"} (<code>ADMIN_ERROR_NOTIFY</code>)
Dedupe: ${n.dedupeSeconds} dtk • maks ${n.maxPerMinute}/menit

<b>📢 Broadcast</b>
Konfirmasi: ${s.confirm?"✅":"❌"} • jeda ${s.delayMs} ms • sertakan user diban: ${s.includeBanned?"✅":"❌"}`,kb:new i.InlineKeyboard().text("⬅️ Menu","adm:main")}));case"bc":return await a.answerCallbackQuery(),h(a,b());case"users":return await a.answerCallbackQuery(),h(a,await p(parseInt(e[2]??"0",10)||0));case"u":return await a.answerCallbackQuery(),h(a,await k(e[2],parseInt(e[3]??"0",10)||0));case"ban":case"unban":{let i=await f(a,e[2],"ban"===t);return await a.answerCallbackQuery({text:i.replace(/<[^>]+>/g,""),show_alert:!1}),h(a,await k(e[2],parseInt(e[3]??"0",10)||0))}case"q":{let t=y(e[3]??"");if(void 0===t)return void await a.answerCallbackQuery({text:"Nilai kuota tidak valid",show_alert:!0});return await (0,o.S)(e[2],t),await a.answerCallbackQuery({text:$(e[2],t).replace(/<[^>]+>/g,"")}),h(a,await k(e[2],parseInt(e[4]??"0",10)||0))}case"bcs":{let t=C.get(e[2]);if(!t||t.adminId!==String(a.from.id)||Date.now()-t.at>6e5)return void await a.answerCallbackQuery({text:"Broadcast kedaluwarsa. Kirim ulang /broadcast.",show_alert:!0});return C.delete(e[2]),await a.answerCallbackQuery({text:"Memulai broadcast..."}),await a.editMessageReplyMarkup({reply_markup:new i.InlineKeyboard}).catch(()=>{}),await M(a,t.text)}case"bcc":C.delete(e[2]),await a.answerCallbackQuery({text:"Dibatalkan"}),await a.editMessageText("❌ Broadcast dibatalkan.").catch(()=>{});return;default:await a.answerCallbackQuery()}}catch(e){console.error("[admin] callback gagal:",e),await (0,l.reportError)("Admin callback",e,{userId:a.from?.id}),await a.answerCallbackQuery({text:"Terjadi kesalahan",show_alert:!0}).catch(()=>{})}})},"o",0,function(a){a.use(async(a,e)=>{let t=a.from;if(!t||t.is_bot)return e();try{await (0,o.K)(t,a.chat?.type==="private"?a.chat.id:void 0)}catch(a){console.error("[admin] trackUser gagal:",a)}if(!(0,r.N)(t.id)){let e=await (0,o.R)(String(t.id),{checkQuota:!1});if(!e.allowed&&"banned"===e.reason){try{a.callbackQuery?await a.answerCallbackQuery({text:r.P.banned,show_alert:!0}):a.chat?.type==="private"&&await a.reply(e.banReason?r.P.bannedWithReason(e.banReason):r.P.banned)}catch{}return}}return e()})}]),t()}catch(a){t(a)}},!1),19470,a=>a.a(async(e,t)=>{try{var i=a.i(77136),n=a.i(30993),r=a.i(58802),o=a.i(83492),l=a.i(92330),s=a.i(41167),u=a.i(63821),d=e([n,r,o,u]);[n,r,o,u]=d.then?(await d)():d;let b={parse_mode:"HTML",link_preview_options:{is_disabled:!0}};async function c(a){let e=await (0,n.getOrCreateUserState)(a),t=new i.InlineKeyboard().text("🔄 Sync Views","an_sync").text("🧠 Pelajari Sekarang","an_learn").row().text(`📅 Laporan Mingguan: ${e.weeklyReportEnabled?"ON ✅":"OFF ⛔"}`,"an_weekly").row().text(`🤖 Smart Learning: ${e.learningEnabled?"ON ✅":"OFF ⛔"}`,"an_learning");return e.learnedPrompt&&t.row().text("🗑 Reset Hasil Belajar","an_reset"),t}function m(a){let e="learned"===a.status||"pending"===a.status?"🧠":"ℹ️",t=`${e} <b>${(0,r.e)(a.message)}</b>`;return a.prompt&&(t+=`

🎯 <b>Arahan niche baru:</b>
<i>"${(0,r.e)(a.prompt)}"</i>`,a.topNiche&&(t+=`

🏆 Niche terbaik: <b>${(0,r.e)(a.topNiche)}</b>`),a.insights?.length&&(t+=`

💡 <b>Temuan AI:</b>
${a.insights.map(a=>`▫️ ${(0,r.e)(a)}`).join("\n")}`),t+=`

<i>Metode: ${"ai"===a.method?"analisis AI":"heuristik (AI tidak tersedia)"} \xb7 sampel ${a.sampleSize} klip</i>`),t}async function p(a,e){let t=await (0,n.syncUserStats)(e);if(!t.tracked)return"ℹ️ Belum ada klip yang terupload ke YouTube. Proses video dulu & hubungkan YouTube lewat /connect.";let i=`🔄 <b>Sync selesai</b>
• Klip dilacak: ${t.tracked}${t.newClips?` (+${t.newClips} baru)`:""}
• Views terbaca: ${t.updated}`;return t.unreadable&&(i+=`
• Tidak terbaca: ${t.unreadable} (private/draft?)

💡 Kirim /connect lagi untuk memberi izin baca statistik, atau set <code>YOUTUBE_API_KEY</code> di Railway untuk video public/unlisted.`,t.note&&(i+=`
<i>${(0,r.e)(t.note.slice(0,220))}</i>`)),i}async function k(a,e,t,i){let o=a.chat?.id?.toString()??null;await (0,n.getOrCreateUserState)(e,o);let s=null;if(i){let t=await (0,n.getLastSyncAt)(e);(!t||Date.now()-t.getTime()>6e4*Math.min((0,l.W)(),30))&&(s=await a.reply("⏳ Mengambil statistik terbaru dari YouTube..."),await (0,n.syncUserStats)(e).catch(a=>console.warn("[analytics] sync saat /analytics gagal:",a)))}let u=await (0,r.I)(e,{days:t}),d=`

📅 <i>Laporan mingguan otomatis: ${(0,r.e)((0,r.X)())}</i>`;s&&a.chat&&await a.api.deleteMessage(a.chat.id,s.message_id).catch(()=>{}),await a.reply((u+d).slice(0,4e3),{...b,reply_markup:await c(e)})}a.s(["f",0,function(a){a.command("analytics",async a=>{let e=a.from?.id?.toString();if(!e)return;if(!(0,l._)())return void await a.reply("📈 Fitur AI Analytics sedang dinonaktifkan oleh admin (<code>ANALYTICS_ENABLED=false</code>).",b);let[t,...i]=(a.match||"").toString().trim().split(/\s+/),d=(t||"").toLowerCase();await (0,n.getOrCreateUserState)(e,a.chat?.id?.toString()??null);try{if(!d)return await k(a,e,null,!0);if(/^\d+$/.test(d)){let t=Math.min(365,Math.max(1,parseInt(d,10)));return await k(a,e,t,!0)}if("sync"===d)return void await a.reply(await p(a,e),b);if("learn"===d){let t=await a.reply("🧠 AI sedang mempelajari klip suksesmu...");await (0,n.syncUserStats)(e).catch(()=>{});let i=await (0,o.b)(e,{force:!0});a.chat&&await a.api.deleteMessage(a.chat.id,t.message_id).catch(()=>{}),await a.reply(m(i),b);return}if("apply"===d){let t=await (0,o.v)(e);await a.reply(t?`✅ <b>Hasil belajar diterapkan!</b>
<i>"${(0,r.e)(t.prompt)}"</i>`:"ℹ️ Tidak ada hasil belajar yang menunggu persetujuan.",b);return}if("reset"===d){await (0,o.f)(e),await a.reply("↩️ Hasil belajar dihapus. AI kembali memakai DEFAULT_NICHE_PROMPT / niche kustommu.",b);return}if("weekly"===d||"learning"===d){let t=/^(on|aktif|nyala|1|true)$/i.test(i[0]||""),r=/^(off|mati|0|false)$/i.test(i[0]||"");if(!t&&!r)return void await a.reply(`Gunakan: <code>/analytics ${d} on</code> atau <code>/analytics ${d} off</code>`,b);await (0,n.patchUserState)(e,"weekly"===d?{weeklyReportEnabled:t}:{learningEnabled:t}),await a.reply("weekly"===d?`📅 Laporan mingguan otomatis: <b>${t?"ON":"OFF"}</b>`:`🤖 Smart Learning: <b>${t?"ON":"OFF"}</b>`,b);return}if("retitle"===d){if(!(0,s.o)())return void await a.reply("🩺 <b>Auto-Title Doctor</b> sedang nonaktif.\nAdmin bisa menyalakannya dengan <code>ANALYTICS_AUTO_RETITLE_LOW_VIEWS=true</code> di Railway Variables.",b);if("run"===(i[0]||"").toLowerCase()){let t=await a.reply("🩺 Memeriksa klip ber-views rendah...");await (0,n.syncUserStats)(e).catch(()=>{});let i=await (0,u.L)(e,{force:!0});a.chat&&await a.api.deleteMessage(a.chat.id,t.message_id).catch(()=>{}),await a.reply(`🩺 <b>Selesai</b>
• Kandidat: ${i.candidates}
• ${i.dryRun?"Disimulasikan":"Judul diganti"}: ${i.retitled}
• Gagal: ${i.failed}`+(i.skipped?`
<i>${(0,r.e)(i.skipped)}</i>`:"")+(i.errors.length?`
<i>${(0,r.e)(i.errors[0].slice(0,200))}</i>`:""),b);return}let[t,o]=await Promise.all([(0,u.r)(e),(0,u.H)(e,5)]),l=o.map(a=>{let e="success"===a.status?"✅":"dry_run"===a.status?"🧪":"⚠️";return`${e} <a href="https://youtu.be/${a.youtubeVideoId}">${a.youtubeVideoId}</a>: ${(0,r.e)(a.oldTitle.slice(0,40))} → <b>${(0,r.e)((a.newTitle||a.error||"-").slice(0,60))}</b>`});await a.reply("🩺 <b>Auto-Title Doctor</b> — ON ✅"+((0,s.K)()?" (mode simulasi)":"")+`
<i>Aturan: ${(0,r.e)((0,u.c)())}</i>

`+`Diganti: <b>${t.success}</b> \xb7 Simulasi: ${t.dryRun} \xb7 Gagal: ${t.failed}`+(l.length?`

${l.join("\n")}`:"\n\nBelum ada riwayat.")+"\n\n<code>/analytics retitle run</code> — periksa &amp; perbaiki sekarang",b);return}if("views"===d){let t=i[0]||"",r=parseInt((i[1]||"").replace(/[.,_]/g,""),10),o=t.match(/(?:youtu\.be\/|v=|shorts\/)([A-Za-z0-9_-]{11})/)?.[1]??(/^[A-Za-z0-9_-]{11}$/.test(t)?t:void 0);if(!o||isNaN(r)||r<0)return void await a.reply("Format: <code>/analytics views &lt;videoId atau link&gt; &lt;jumlah views&gt;</code>",b);let l=await (0,n.setManualViews)(e,o,r);await a.reply(l?`✅ Views <code>${o}</code> diset ke <b>${r.toLocaleString("id-ID")}</b>.`:"❌ Video tidak ditemukan di daftar klipmu.",b);return}await a.reply("📈 <b>AI Analytics</b>\n\n<code>/analytics</code> — laporan performa\n<code>/analytics 30</code> — klip 30 hari terakhir\n<code>/analytics sync</code> — tarik views terbaru\n<code>/analytics learn</code> — AI belajar sekarang\n<code>/analytics apply</code> — terapkan hasil belajar\n<code>/analytics reset</code> — hapus hasil belajar\n<code>/analytics weekly on|off</code> — laporan mingguan\n<code>/analytics learning on|off</code> — Smart Learning\n<code>/analytics views &lt;id&gt; &lt;jumlah&gt;</code> — isi views manual\n<code>/analytics retitle</code> — 🩺 Auto-Title Doctor (status &amp; riwayat)\n<code>/analytics retitle run</code> — 🩺 perbaiki judul klip ber-views rendah sekarang",b)}catch(e){console.error("[analytics] /analytics error:",e),await a.reply(`❌ Gagal memproses /analytics: ${(0,r.e)(e instanceof Error?e.message:String(e))}`,b)}}),a.callbackQuery("an_sync",async a=>{let e=a.from.id.toString();await a.answerCallbackQuery("🔄 Menyinkronkan...");try{await a.reply(await p(a,e),b),await k(a,e,null,!1)}catch(e){await a.reply(`❌ Sync gagal: ${(0,r.e)(e instanceof Error?e.message:String(e))}`,b)}}),a.callbackQuery("an_learn",async a=>{let e=a.from.id.toString();await a.answerCallbackQuery("🧠 AI sedang belajar...");try{await (0,n.syncUserStats)(e).catch(()=>{});let t=await (0,o.b)(e,{force:!0});await a.reply(m(t),b)}catch(e){await a.reply(`❌ Gagal belajar: ${(0,r.e)(e instanceof Error?e.message:String(e))}`,b)}}),a.callbackQuery("an_weekly",async a=>{let e=a.from.id.toString(),t=await (0,n.getOrCreateUserState)(e);await (0,n.patchUserState)(e,{weeklyReportEnabled:!t.weeklyReportEnabled}),await a.answerCallbackQuery(`Laporan mingguan ${!t.weeklyReportEnabled?"ON":"OFF"}${(0,l.a)()?"":" (dimatikan admin)"}`),await a.editMessageReplyMarkup({reply_markup:await c(e)}).catch(()=>{})}),a.callbackQuery("an_learning",async a=>{let e=a.from.id.toString(),t=await (0,n.getOrCreateUserState)(e);await (0,n.patchUserState)(e,{learningEnabled:!t.learningEnabled}),await a.answerCallbackQuery(`Smart Learning ${!t.learningEnabled?"ON":"OFF"}${(0,l.q)()?"":" (dimatikan admin)"}`),await a.editMessageReplyMarkup({reply_markup:await c(e)}).catch(()=>{})}),a.callbackQuery("an_reset",async a=>{let e=a.from.id.toString();await (0,o.f)(e),await a.answerCallbackQuery("↩️ Hasil belajar dihapus"),await a.editMessageReplyMarkup({reply_markup:await c(e)}).catch(()=>{}),await a.reply("↩️ Hasil belajar dihapus. AI kembali memakai DEFAULT_NICHE_PROMPT / niche kustommu.")})}]),t()}catch(a){t(a)}},!1),16884,a=>a.a(async(e,t)=>{try{var i=a.i(77136),n=a.i(30993),r=a.i(58802),o=a.i(12677),l=a.i(39272),s=e([n,r,o]);[n,r,o]=s.then?(await s)():s;let u={parse_mode:"HTML",link_preview_options:{is_disabled:!0}};a.s(["f",0,function(a){a.command("prune",async a=>{let e=a.from?.id?.toString();if(!e)return;if(!(0,l.$)())return void await a.reply("✂️ <b>Auto-Prune Klip Gagal</b> sedang nonaktif.\nAdmin bisa menyalakannya dengan <code>AUTO_PRUNE_ENABLED=true</code> di Railway Variables.",u);let t=(a.match||"").toString().trim().split(/\s+/)[0].toLowerCase();try{if("run"===t){let t=await a.reply("✂️ Memeriksa klip yang performanya gagal...");await (0,n.syncUserStats)(e).catch(()=>{});let i=await (0,o.K)(e,{notify:!1});a.chat&&await a.api.deleteMessage(a.chat.id,t.message_id).catch(()=>{}),await a.reply(`✂️ <b>Selesai</b>
• Klip memenuhi kriteria (menunggu keputusan): ${i.candidates}
• Usulan baru: ${i.suggested}`+(i.skipped?`
<i>${(0,r.e)(i.skipped)}</i>`:"")+(i.errors.length?`
<i>${(0,r.e)(i.errors[0].slice(0,200))}</i>`:"")+(i.candidates?"\n\nKetik <code>/prune list</code> untuk melihat & memutuskan.":""),u);return}if("list"===t){let t=await (0,o.N)(e,2*(0,l.j)());if(!t.length)return void await a.reply("✅ Tidak ada usulan yang menunggu keputusan.",u);let i=(await (0,o.Q)(e)).pending;await (0,o.r)(e,t,{totalPending:i,readableCount:0});return}let[i,s]=await Promise.all([(0,o.Q)(e),(0,o.A)(e,5)]),d={hidden:"🙈",deleted:"🗑",kept:"✅"},c=s.map(a=>`${d[a.status]||"•"} ${(0,r.e)(a.title.slice(0,50))} (${a.views} views)`);await a.reply(`✂️ <b>Auto-Prune Klip Gagal</b> — ON ✅
<i>Aturan: ${(0,r.e)((0,l.S)())}</i>
<i>Tombol: ${(0,l.M)().map(a=>"hide"===a?`sembunyikan → ${(0,l.x)()}`:"hapus").join(", ")}</i>

Menunggu keputusan: <b>${i.pending}</b> \xb7 Disembunyikan: ${i.hidden} \xb7 Dihapus: ${i.deleted} \xb7 Dipertahankan: ${i.kept}`+(c.length?`

<b>Keputusan terakhir</b>
${c.join("\n")}`:"")+"\n\n<code>/prune list</code> — lihat usulan\n<code>/prune run</code> — cari klip gagal sekarang\n<i>Bot hanya mengusulkan; kamu yang memutuskan.</i>",u)}catch(e){console.error("[auto-prune] /prune gagal:",e),await a.reply("⚠️ Terjadi kesalahan saat memproses /prune. Coba lagi sebentar lagi.")}}),a.callbackQuery(/^prune:(h|d|dc|k|b):(\d+)$/,async a=>{let e=a.from?.id?.toString(),[,t,n]=a.match,s=parseInt(n,10);if(e)try{if("d"===t&&(0,l.O)()){let t=await (0,o.k)(e,s);if(!t||"pending"!==t.status)return void await a.answerCallbackQuery({text:"Usulan sudah diputuskan."});let n=new i.InlineKeyboard().text("🗑 Ya, hapus permanen",`prune:dc:${s}`).text("↩️ Batal",`prune:b:${s}`);await a.answerCallbackQuery(),await a.editMessageText(`${(0,o.b)(t)}

${l.i.confirmDelete}`,{...u,reply_markup:n});return}if("b"===t){let t=await (0,o.k)(e,s);await a.answerCallbackQuery({text:"Dibatalkan"}),t&&await a.editMessageText((0,o.b)(t),{...u,reply_markup:(0,o.$)(s)});return}await a.answerCallbackQuery({text:"Memproses..."});let n=await (0,o.j)(e,s,"h"===t?"hide":"k"===t?"keep":"delete");n.ok&&n.row?await a.editMessageText(`${(0,o.b)(n.row)}

${n.message}`,{...u,reply_markup:void 0}):n.row&&n.status&&"pending"!==n.status?await a.editMessageText(`${(0,o.b)(n.row)}

ℹ️ ${(0,r.e)(n.message)}`,{...u,reply_markup:void 0}):(await a.reply(`⚠️ ${(0,r.e)(n.message)}`,u),n.row&&await a.editMessageReplyMarkup({reply_markup:(0,o.$)(s)}).catch(()=>{}))}catch(e){console.error("[auto-prune] tombol gagal:",e),await a.answerCallbackQuery({text:"Terjadi kesalahan, coba lagi."}).catch(()=>{})}})}]),t()}catch(a){t(a)}},!1),37539,a=>{a.i(73716);let e={welcome:`🤖 *AutoClip Bot* — Video Clipper Otomatis

Halo! Saya bot *@cawikdurung* yang bisa memotong video panjang menjadi klip pendek viral untuk YouTube Shorts secara otomatis!

*Cara Penggunaan:*
1. Kirim link video (YouTube, Facebook, TikTok, Instagram)
2. Bot akan menganalisis dan memilih momen terbaik
3. Video akan dipotong sesuai durasi pilihanmu (15/20/30/40/60 detik, default 30s)
4. Upload langsung ke YouTube sebagai Draft
5. Langsung set auto-monitor biar gak kirim link manual

*Perintah:*
/start - Menu utama
/help - Panduan lengkap
/connect - Hubungkan YouTube
/settings - Pengaturan bot
/status - Cek status
/history - Riwayat klip
/clips - Info & cara ubah jumlah klip
/duration - Info & cara ubah durasi klip (15/20/30/40/60s)
/watermark - Info watermark config
/zoom - Info zoom effect config
/subtitle - Info & preview style subtitle (caption burn-in)
/hook - Info AI Hook Overlay (teks pembuka)
/introoutro - Info intro/outro config
/thumbnail - Info thumbnail config
/mode - Info aspect ratio
/niche - Atur Custom Niche Prompt untuk AI Analysis 
/analytics - Laporan performa klip + AI Smart Learning ✨ Baru!
/prune - Usulan sembunyikan/hapus klip sepi (Auto-Prune) ✨ Baru!
/dupfilter - Info Duplicate/Repetitive Clip Filter ✨ Baru!
/jadwal - Lihat & batalkan antrean jadwal upload ✨ Baru!
/monitor <link> - Pantau channel/playlist ✨ Baru!
/monitors - Kelola daftar pantauan ✨ Baru!
/claims - Info Post-Upload Claim Monitor ✨ Baru!

Kirim link video untuk mulai! 🎬`,help:`📚 *Panduan AutoClip Bot*

*Platform yang Didukung:*
• 📺 YouTube (termasuk video panjang)
• 📘 Facebook
• 🎵 TikTok
• 📸 Instagram Reels/Video

*Proses Otomatis:*
1. *Download* - Video diunduh dari platform
2. *Transkripsi* - Audio ditranskripsi ke teks
3. *Analisis AI* - Momen viral diidentifikasi
4. *Pemotongan* - Video dipotong sesuai durasi pilihan (15/20/30/40/60 detik)
5. *Zoom Effect* - Auto zoom pada highlight moment ✨
6. *Watermark* - Watermark custom ditambahkan ✨
7. *Intro/Outro* - Ditambahkan jika aktif ✨
8. *Thumbnail* - Thumbnail auto-generate ✨
9. *Upload* - Langsung upload ke YouTube Studio

*Format Output 9:16:*
• 🌀 Mode aktif bisa diubah via \`ASPECT_RATIO_MODE\`

*Perintah Info Konfigurasi:*
/clips - Info & cara ubah jumlah klip (default: 5)
/duration - Info & cara ubah durasi klip (15/20/30/40/60s, default: 30s)
/mode - Info aspect ratio mode
/thumbnail - Info thumbnail config
/watermark - Info watermark config
/zoom - Info zoom effect config
/subtitle - Info & preview style subtitle (caption burn-in)
/hook - Info AI Hook Overlay (teks pembuka)
/introoutro - Info intro/outro config
/niche - Atur Custom Niche Prompt (fokus AI Analysis) ✨ Baru!
/analytics - Laporan performa klip + AI Smart Learning ✨ Baru!
/prune - Usulan sembunyikan/hapus klip sepi (Auto-Prune) ✨ Baru!
/dupfilter - Info Duplicate/Repetitive Clip Filter (anti klip mirip/berulang) ✨ Baru!
/jadwal - Lihat antrean jadwal upload otomatis ✨ Baru!

*Ketentuan:*
• Durasi klip: pilih salah satu dari 15 / 20 / 30 / 40 / 60 detik (lihat /duration)
• Format output: Vertikal 9:16 (1080x1920)
• Maksimal klip: lihat /settings (default 5, ubah via \`MAX_CLIPS\`)

Tips: Video dengan dialog, tips, atau momen emosional menghasilkan klip terbaik!`,connecting:`🔗 *Menghubungkan YouTube Studio...*

Klik tombol di bawah untuk login ke akun Google/YouTube Anda.

Izin yang diperlukan:
• Upload video (sebagai Draft)
• Kelola video YouTube

Setelah login, klip akan otomatis tersimpan sebagai Draft di YouTube Studio.`,error:a=>`❌ *Terjadi Kesalahan*

${a}

Coba lagi atau hubungi /help untuk bantuan.`,invalidUrl:`❌ *URL Tidak Valid*

Kirim link video yang valid dari:
• YouTube (youtube.com/watch?v=... atau youtu.be/...)
• Facebook (facebook.com/watch/...)
• TikTok (tiktok.com/@.../video/...)
• Instagram (instagram.com/reel/...)`,settings:a=>`⚙️ *Pengaturan Bot*
• Maksimal Klip: ${a.maxClips} (ubah dengan tombol di bawah, atau set \`MAX_CLIPS\` di Railway)
• Durasi Klip: ${a.clipDuration} detik — pilihan: 15/20/30/40/60 (ubah dengan tombol di bawah, atau /duration)
• Rentang toleransi AI: ${a.minDuration}-${a.maxDuration} detik
• Privacy Default: ${a.defaultPrivacy}
• YouTube: ${a.youtubeConnected?"✅ Terhubung":"❌ Belum terhubung"}`,resultSummary:a=>{let e=`🎉 *Proses Selesai!*

`;return e+=`Berhasil membuat ${a.length} klip YouTube Shorts:

`,a.forEach((a,t)=>{e+=`*Klip ${t+1}:* ${a.title.slice(0,50)}
⏱ Durasi: ${a.duration}s | 🔥 Viral Score: ${a.viralScore}/10`,a.hasThumbnail&&(e+=` | 🖼✅`),a.hasZoom&&(e+=` | 🔍✅`),a.hasWatermark&&(e+=` | 💧✅`),e+=`
`,a.youtubeUrl&&(e+=`🔗 ${a.youtubeUrl}
`),e+="\n"}),e+=`📺 Cek YouTube Studio untuk melihat Draft!`}};a.s(["M",0,function(a){let e=Math.floor(a/60),t=Math.floor(a%60);return 0===e?`${t}s`:`${e}m ${t}s`},"h",0,function(a){return({youtube:"📺",facebook:"📘",tiktok:"🎵",instagram:"📸",twitter:"🐦",unknown:"🌐"})[a.toLowerCase()]||"🌐"},"Z",0,e])},27781,a=>a.a(async(e,t)=>{try{var i=a.i(77136),n=a.i(58802),r=a.i(88711),o=a.i(48558),l=a.i(44120),s=e([n,r,l]);[n,r,l]=s.then?(await s)():s;let d={parse_mode:"HTML",link_preview_options:{is_disabled:!0}},c=`

🚨 *Post-Upload Claim Monitor:*
/claims - Status klaim video & rasio klaim per channel sumber
/blacklist - Lihat / tambah / hapus channel sumber yang di-blacklist`,m={block:"⛔ block (job ditolak)",warn:"⚠️ warn (peringatan saja)",off:"⚪ off (hanya dicatat)"};function u(a){let e;return`${a.blacklisted?"⛔":a.ratioPercent>=30?"🔴":a.claims>0?"🟡":"🟢"} <b>${(0,n.e)(a.channelName.slice(0,40))}</b>
    ${e=Math.round(Math.min(100,Math.max(0,a.ratioPercent))/10),"▰".repeat(e)+"▱".repeat(10-e)} ${a.ratioPercent}% (${a.claims}/${a.clips} klip)`}a.s(["m",0,c,"g",0,function(a){a.command("claims",async a=>{let e=a.from?.id?.toString();if(!e)return;if(!(0,o.a)())return void await a.reply("🚨 <b>Post-Upload Claim Monitor</b> sedang nonaktif.\nAdmin bisa menyalakannya dengan <code>CLAIM_MONITOR_ENABLED=true</code> di Railway Variables.",d);let t=(a.match||"").toString().trim().split(/\s+/)[0].toLowerCase();try{if("run"===t||"cek"===t){let t=await a.reply("🚨 Mengecek status video di YouTube..."),i=await (0,r.E)({userId:e,force:!0,notify:!1});a.chat&&await a.api.deleteMessage(a.chat.id,t.message_id).catch(()=>{});let o=(await (0,r.Q)(e)).pending;await a.reply(`🚨 <b>Pengecekan selesai</b>
• Video dicek: ${i.checked}
• Klaim baru: ${i.newClaims} \xb7 dilepas: ${i.cleared}
• Video sudah hilang: ${i.missing}
• Channel di-auto-blacklist: ${i.blacklisted}`+(i.errors.length?`
<i>⚠️ ${(0,n.e)(i.errors[0].slice(0,200))}</i>`:"")+(o?`

<b>${o}</b> klip menunggu keputusan — ketik <code>/claims list</code>.`:"\n\n✅ Tidak ada klip yang menunggu keputusan."),d);return}if("list"===t){let t=await (0,r.c)(e,2*(0,o.I)());if(!t.length)return void await a.reply("✅ Tidak ada klaim yang menunggu keputusan.",d);let i=(await (0,r.Q)(e)).pending;await (0,r.q)(e,t,i);return}if("channels"===t||"channel"===t||"rasio"===t){let t=await (0,r.O)(e);if(!t.length)return void await a.reply("ℹ️ Belum ada data. Rasio muncul setelah klip dari source channel dicek (<code>/claims run</code>).",d);await a.reply(`📊 <b>Rasio Klaim per Source Channel</b>
<i>Auto-blacklist: ${(0,o.x)()?(0,n.e)((0,o.D)()):"nonaktif"}</i>

`+t.slice(0,20).map(u).join("\n\n"),d);return}let[i,l,s]=await Promise.all([(0,r.Q)(e),(0,r.s)(e,5),(0,r.O)(e)]),c={private:"🔒",unlisted:"🔗",deleted:"🗑",ignored:"🙈"},m=l.map(a=>`${c[a.actionStatus]||"•"} ${(0,n.e)(a.title.slice(0,50))}`),p=s.filter(a=>a.claims>0).slice(0,3);await a.reply(`🚨 <b>Post-Upload Claim Monitor</b> — ON ✅
<i>Cek tiap ${(0,o.G)()} menit \xb7 sinyal: ${(0,o.b)().join(", ")}</i>
<i>Tombol: ${(0,o.g)().map(a=>"delete"===a?"hapus":`private → ${(0,o.F)()}`).join(", ")}, abaikan</i>

📹 Video dipantau: <b>${i.tracked}</b> (sudah dicek: ${i.checked})
🚩 Kena klaim/pembatasan: <b>${i.claimed}</b> \xb7 menunggu keputusan: <b>${i.pending}</b>
🔒 Private: ${i.privated} \xb7 🗑 Dihapus: ${i.deleted} \xb7 🙈 Diabaikan: ${i.ignored}`+(p.length?`

<b>Channel paling sering diklaim</b>
${p.map(u).join("\n")}`:"")+(m.length?`

<b>Keputusan terakhir</b>
${m.join("\n")}`:"")+"\n\n<code>/claims list</code> — lihat alert menunggu\n<code>/claims channels</code> — rasio per channel\n<code>/claims run</code> — cek sekarang\n<code>/blacklist</code> — channel yang diblokir\n<i>Bot hanya memberi alert; kamu yang memutuskan lewat tombol.</i>",d)}catch(e){console.error("[claim-monitor] /claims gagal:",e),await a.reply("⚠️ Terjadi kesalahan saat memproses /claims. Coba lagi sebentar lagi.")}}),a.command("blacklist",async a=>{let e=a.from?.id?.toString();if(!e)return;let[t,...i]=(a.match||"").toString().trim().split(/\s+/),s=(t||"").toLowerCase(),u=i.join(" ").trim();try{if("add"===s||"tambah"===s){if(!u)return void await a.reply("Format: <code>/blacklist add @namachannel</code> (boleh juga ID UCxxx, nama, atau URL channel)",d);let t=await (0,r.g)(e,u);await a.reply(t.added?`⛔ <code>${(0,n.e)(t.label)}</code> masuk blacklist.`+(t.pausedMonitors?`
⏸ ${t.pausedMonitors} Auto-Monitor untuk channel ini dijeda.`:""):`ℹ️ <code>${(0,n.e)(t.label)}</code> sudah ada di blacklist.`,d);return}if("remove"===s||"hapus"===s||"del"===s){if(!u)return void await a.reply("Format: <code>/blacklist remove &lt;nomor | channel&gt;</code>",d);let t=await (0,l.removeBlacklistEntry)(e,u);await a.reply(t?`✅ <code>${(0,n.e)(t.channelName||t.channelKey)}</code> dikeluarkan dari blacklist.
<i>Auto-Monitor yang sempat dijeda bisa dinyalakan lagi lewat /monitoron.</i>`:"❌ Tidak ditemukan di blacklist-mu. Cek nomor lewat /blacklist (entri dari env hanya bisa diubah di Railway Variables).",d);return}let t=await (0,l.listBlacklist)(e),i=(0,o.u)(),c=[`⛔ <b>Blacklist Source Channel</b> (mode: <code>${m[(0,o.r)()]}</code>)
`];c.push(`<b>Milikmu</b> (${t.length}):
`+(t.length?t.map((a,e)=>`${e+1}. <code>${(0,n.e)(a.channelName||a.channelKey)}</code> — ${"auto"===a.origin?`🤖 auto (${a.claims}/${a.clips} klip, ${a.ratioPercent}%)`:"✍️ manual"}`).join("\n"):"— kosong —")),c.push(`
<b>Global (env CLAIM_BLACKLIST_CHANNELS)</b> (${i.length}):
`+(i.length?i.map(a=>`• <code>${(0,n.e)(a)}</code>`).join("\n"):"— kosong —")),c.push(`
🤖 Auto-blacklist: <b>${(0,o.x)()?"aktif":"nonaktif"}</b>`+((0,o.x)()?`
<i>${(0,n.e)((0,o.D)())}</i>`:"")),c.push(`
➕ <code>/blacklist add @channel</code>
➖ <code>/blacklist remove 1</code>
📊 <code>/claims channels</code> — lihat rasio klaim

Channel di blacklist tidak diproses lagi (job ditolak Source Guard & Auto-Monitor dijeda). Channel whitelist / milik sendiri tidak pernah di-auto-blacklist.`),await a.reply(c.join("\n"),d)}catch(e){console.error("[claim-monitor] /blacklist gagal:",e),await a.reply(`❌ Gagal: ${(0,n.e)(e instanceof Error?e.message:String(e))}`,d)}}),a.callbackQuery(/^claim:(d|dc|p|i|b):(\d+)$/,async a=>{let e=a.from?.id?.toString(),[,t,l]=a.match,s=parseInt(l,10);if(e)try{if("d"===t&&(0,o.Z)()){let t=await (0,r.V)(e,s);if(!t||"pending"!==t.actionStatus)return void await a.answerCallbackQuery({text:"Alert sudah diputuskan."});let n=new i.InlineKeyboard().text("🗑 Ya, hapus permanen",`claim:dc:${s}`).text("↩️ Batal",`claim:b:${s}`);await a.answerCallbackQuery(),await a.editMessageText(`${(0,r.U)(t)}

${o.$.confirmDelete}`,{...d,reply_markup:n});return}if("b"===t){let t=await (0,r.V)(e,s);await a.answerCallbackQuery({text:"Dibatalkan"}),t&&await a.editMessageText((0,r.U)(t),{...d,reply_markup:(0,r.N)(s)});return}await a.answerCallbackQuery({text:"Memproses..."});let l=await (0,r.f)(e,s,"p"===t?"private":"i"===t?"ignore":"delete");l.ok&&l.row?await a.editMessageText(`${(0,r.U)(l.row)}

${l.message}`,{...d,reply_markup:void 0}):l.row&&l.status&&"pending"!==l.status?await a.editMessageText(`${(0,r.U)(l.row)}

ℹ️ ${(0,n.e)(l.message)}`,{...d,reply_markup:void 0}):(await a.reply(`⚠️ ${(0,n.e)(l.message)}`,d),l.row&&await a.editMessageReplyMarkup({reply_markup:(0,r.N)(s)}).catch(()=>{}))}catch(e){console.error("[claim-monitor] tombol gagal:",e),await a.answerCallbackQuery({text:"Terjadi kesalahan, coba lagi."}).catch(()=>{})}}),a.callbackQuery(/^bl:rm:(\d+)$/,async a=>{let e=a.from?.id?.toString(),[,t]=a.match;if(e)try{let i=await (0,l.removeBlacklistById)(e,parseInt(t,10));await a.answerCallbackQuery({text:i?"Dikeluarkan dari blacklist":"Sudah tidak ada di blacklist"}),i?await a.editMessageText(`✅ <b>${(0,n.e)(i.channelName||i.channelKey)}</b> dikeluarkan dari blacklist.
<i>Auto-Monitor yang sempat dijeda bisa dinyalakan lagi lewat /monitoron.</i>`,{...d,reply_markup:void 0}):await a.editMessageReplyMarkup({reply_markup:void 0}).catch(()=>{})}catch(e){console.error("[claim-monitor] tombol blacklist gagal:",e),await a.answerCallbackQuery({text:"Terjadi kesalahan, coba lagi."}).catch(()=>{})}})}]),t()}catch(a){t(a)}},!1),40046,a=>a.a(async(e,t)=>{try{var i=a.i(89578),n=a.i(30043),r=a.i(60321),o=a.i(39096),l=a.i(40685),s=e([n,o,l]);[n,o,l]=s.then?(await s)():s;let m={parse_mode:"HTML",link_preview_options:{is_disabled:!0}},p=`

💰 *Cost Tracker:*
/cost - Biaya AI (OpenAI/Gemini/Whisper) per job & per user
/cost models - Bandingkan biaya per model
/cost jobs - Biaya per job terbaru`;async function u(a,e){await a.reply(e.slice(0,4e3),m)}async function d(a,e){let t=await (0,l.o)({userId:e});return!!t.allowed||(await a.reply("user"===t.scope?r.M.userPaused:r.M.globalPaused,m).catch(()=>{}),!1)}function c(a,e){let t=parseInt(a??"",10);return Number.isFinite(t)?Math.min(90,Math.max(1,t)):e}a.s(["_",0,p,"g",0,d,"O",0,function(a){a.command("cost",async a=>{let e=a.from?.id?.toString();if(!e)return;if(!(0,r.J)())return void await u(a,"💰 <b>Cost Tracker</b> sedang nonaktif.\nAdmin bisa menyalakannya dengan <code>COST_TRACKER_ENABLED=true</code> di Railway Variables.");let t=(0,i.N)(e),l=(a.match||"").toString().trim().toLowerCase().split(/\s+/).filter(Boolean),s=l[0]||"",d=(0,r.b)();try{if(!s||/^\d+$/.test(s)){let i=c(s,d);await u(a,await (0,o.H)({userId:t?null:e,days:i}));return}if("me"===s)return void await u(a,await (0,o.H)({userId:e,days:c(l[1],d)}));if("models"===s||"model"===s)return void await u(a,await (0,o.W)({userId:t?null:e,days:c(l[1],30)}));if("jobs"===s||"job"===s){let i=Math.min(20,Math.max(1,parseInt(l[1]??"",10)||8));await u(a,await (0,o.h)({userId:t?null:e,limit:i}));return}if("users"===s||"user"===s||"price"===s||"harga"===s){if(!t)return void await u(a,"🔒 Perintah ini khusus admin.");if("users"===s||"user"===s)return void await u(a,await (0,o.w)(c(l[1],d)));await u(a,await (0,o.F)([{label:"Gemini (teks)",model:(0,n.R)(),kind:"text"},{label:"Groq (teks)",model:(0,n.a)(),kind:"text"},{label:"Groq Whisper",model:(0,n.v)(),kind:"audio"},{label:"OpenAI (analisis)",model:"gpt-4o-mini",kind:"text"},{label:"OpenAI Whisper",model:"whisper-1",kind:"audio"}]));return}await u(a,"💰 <b>Cost Tracker</b>\n\n<code>/cost</code> — ringkasan biaya AI\n<code>/cost 30</code> — periode 30 hari\n<code>/cost models</code> — bandingkan biaya per model\n<code>/cost jobs</code> — biaya per job terbaru\n"+(t?"<code>/cost me</code> — biaya akunmu saja\n<code>/cost users</code> — biaya per user\n<code>/cost price</code> — harga model yang dipakai\n":""))}catch(e){console.error("[cost] /cost gagal:",e),await a.reply("⚠️ Terjadi kesalahan saat memproses /cost. Coba lagi sebentar lagi.")}})}]),t()}catch(a){t(a)}},!1),57961,a=>{function e(){let a=(process.env.TELEGRAM_PROGRESS_SHOW_ELAPSED||"true").toLowerCase().trim();return"false"!==a&&"0"!==a&&"off"!==a}function t(a){switch(a){case"done":return"✅";case"active":return"⏳";case"error":return"❌";default:return"⬜"}}function i(a,e=12){let t=Math.round(Math.max(0,Math.min(100,a))/100*e);return`[${"▓".repeat(t)}${"░".repeat(e-t)}]`}function n(a){let e=Math.max(0,Math.floor(a/1e3)),t=Math.floor(e/60);return`${t.toString().padStart(2,"0")}:${(e%60).toString().padStart(2,"0")}`}function r(a){if(!a.length)return 0;let e=a.length,t=0;for(let e of a)"done"===e.status?t+=1:"active"===e.status&&(t+=(e.percent??0)/100);return Math.round(t/e*100)}a.s(["p",0,[{id:"downloading",label:"Download video",icon:"⬇️"},{id:"transcribing",label:"Transkripsi audio",icon:"🎙️"},{id:"analyzing",label:"Analisis momen viral (AI)",icon:"🧠"},{id:"clipping",label:"Potong & edit klip",icon:"✂️"},{id:"scheduling",label:"Pilih jadwal upload",icon:"🗓️"},{id:"uploading_youtube",label:"Upload ke YouTube",icon:"📤"},{id:"uploading_drive",label:"Upload ke Google Drive",icon:"☁️"},{id:"done",label:"Selesai",icon:"🎉"}],"h",0,function(){let a=process.env.TELEGRAM_PROGRESS_MIN_INTERVAL_MS,e=a?parseInt(a,10):0/0;return!isNaN(e)&&e>=300&&e<=1e4?e:1500},"K",0,function(){let a=(process.env.TELEGRAM_PROGRESS_ENABLED||"true").toLowerCase().trim();return"false"!==a&&"0"!==a&&"off"!==a},"f",0,function(a){return"compact"==("compact"===(process.env.TELEGRAM_PROGRESS_STYLE||"checklist").toLowerCase().trim()?"compact":"checklist")?function(a){let{title:o,steps:l,startedAt:s,footerNote:u}=a,d=l.find(a=>"active"===a.status)||l.find(a=>"error"===a.status),c=r(l),m=[];return m.push(`🎬 *${o}*`),d&&m.push(`${t(d.status)} ${d.icon} ${d.label}${d.detail?` — ${d.detail}`:""}`),m.push(`${i(c)} ${c}%`),e()&&m.push(`⏱ ${n(Date.now()-s)}`),u&&m.push(u),m.join("\n")}(a):function(a){let o,{title:l,jobLabel:s,steps:u,startedAt:d,footerNote:c}=a,m=[];if(m.push(`🎬 *Progres Job* — ${l}`),s&&m.push(s),"false"!==(o=(process.env.TELEGRAM_PROGRESS_SHOW_BAR||"true").toLowerCase().trim())&&"0"!==o&&"off"!==o){let a=r(u);m.push(`${i(a)} ${a}%`)}for(let a of(m.push(""),u)){let e=`${t(a.status)} ${a.icon} ${a.label}`;"active"===a.status&&"number"==typeof a.percent&&(e+=` — ${a.percent}%`),m.push(e),"active"===a.status&&a.detail&&m.push(`   ↳ ${a.detail}`),"error"===a.status&&a.detail&&m.push(`   ↳ ⚠️ ${a.detail}`)}return e()&&(m.push(""),m.push(`⏱ Berjalan ${n(Date.now()-d)}`)),c&&(m.push(""),m.push(c)),m.join("\n")}(a)}])},92739,a=>a.a(async(e,t)=>{try{var i=a.i(36763),n=a.i(96918),r=a.i(33102),o=a.i(33680),l=a.i(30298),s=a.i(40685),u=a.i(10792),d=e([o,s]);[o,s]=d.then?(await d)():d;let g=null;function c(){return g||(g=(async()=>{await o.f.execute(r.B`
        CREATE TABLE IF NOT EXISTS scheduled_uploads (
          id serial PRIMARY KEY,
          job_id text NOT NULL,
          telegram_user_id text NOT NULL,
          telegram_chat_id text NOT NULL,
          mode text NOT NULL DEFAULT 'custom',
          scheduled_at timestamp NOT NULL,
          status text NOT NULL DEFAULT 'pending',
          recommendation_reason text,
          attempts integer NOT NULL DEFAULT 0,
          error_message text,
          processed_at timestamp,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `)})().catch(a=>{throw g=null,a})),g}async function m(e,t){let i=`Kamu adalah ahli strategi konten YouTube Shorts/TikTok. Niche/topik konten: "${e||"umum / belum ditentukan"}". Platform: ${t}. Sebutkan ${(0,u.d)()} jam terbaik (format angka 0-23, waktu lokal audiens Indonesia WIB) untuk mem-publish video pendek agar mendapat views & engagement maksimal. Balas HANYA dengan JSON: {"hours": [number,...], "reason": "alasan singkat 1-2 kalimat dalam Bahasa Indonesia"}.`;if(!(await (0,s.o)()).allowed)return null;if(process.env.OPENAI_API_KEY)try{let e=new(await a.A(13599)).default({apiKey:process.env.OPENAI_API_KEY}),t=await e.chat.completions.create({model:"gpt-4o-mini",messages:[{role:"system",content:"Kamu ahli strategi konten sosial media. Balas hanya JSON valid."},{role:"user",content:i}],temperature:.4,max_tokens:300,response_format:{type:"json_object"}}),n=t.choices[0]?.message?.content||"{}";await (0,s.X)({provider:"openai",model:"gpt-4o-mini",feature:"schedule",inputTokens:t.usage?.prompt_tokens,outputTokens:t.usage?.completion_tokens,inputChars:i.length,outputChars:n.length});let r=JSON.parse(n),o=p(r.hours);if(o.length)return{hours:o,reason:String(r.reason||"").slice(0,300)}}catch(a){console.error("[scheduler] OpenAI hour recommendation failed:",a)}if(process.env.GEMINI_API_KEY)try{let{GoogleGenerativeAI:e}=await a.A(46538),t=new e(process.env.GEMINI_API_KEY).getGenerativeModel({model:"gemini-3.1-flash-lite"}),n=await t.generateContent(i+"\n\nBALAS HANYA DENGAN JSON."),r=n.response.text(),o=n.response.usageMetadata;await (0,s.X)({provider:"gemini",model:"gemini-3.1-flash-lite",feature:"schedule",inputTokens:o?.promptTokenCount,outputTokens:o?(o.candidatesTokenCount??0)+(o.thoughtsTokenCount??0):void 0,inputChars:i.length,outputChars:r.length});let l=r.match(/\{[\s\S]*\}/);if(l){let a=JSON.parse(l[0]),e=p(a.hours);if(e.length)return{hours:e,reason:String(a.reason||"").slice(0,300)}}}catch(a){console.error("[scheduler] Gemini hour recommendation failed:",a)}return null}function p(a){return Array.isArray(a)?Array.from(new Set(a.map(a=>Math.round(Number(a))).filter(a=>Number.isFinite(a)&&a>=0&&a<=23))).slice(0,(0,u.d)()):[]}async function k(a,e="youtube"){let t=(0,u.E)(a),i=await m(a||"",e).catch(()=>null),n=i?.hours?.length?i.hours:t.hours,r=i?.reason||`Berdasarkan niche "${t.label}", jam-jam ini biasanya punya tingkat engagement tertinggi untuk Shorts.`;return{slots:(function(a){let e=(0,u.F)(),t=new Date,i=(0,u.$)(),n=[];for(let r=0;r<=Math.min(2,i);r++)for(let i of a){let a=function(a,e,t,i){let n=new Date(a.getTime()+864e5*t),r=new Intl.DateTimeFormat("en-US",{timeZone:e,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(n),o=Date.UTC(Number(r.find(a=>"year"===a.type)?.value),Number(r.find(a=>"month"===a.type)?.value)-1,Number(r.find(a=>"day"===a.type)?.value),i,0,0),l=i-Number(new Intl.DateTimeFormat("en-US",{timeZone:e,hour:"2-digit",hour12:!1}).format(new Date(o)));return l>12&&(l-=24),l<-12&&(l+=24),new Date(o+36e5*l)}(t,e,r,i);a.getTime()>t.getTime()+6e4&&n.push(a)}n.sort((a,e)=>a.getTime()-e.getTime());let r=[];for(let a of n)r.some(e=>6e4>Math.abs(e.getTime()-a.getTime()))||r.push(a);return r.slice(0,(0,u.d)())})(n).map(a=>({date:a,label:b(a),reason:r})),reason:r,nicheLabel:t.label}}function b(a){var e;let t=(0,u.F)();return new Intl.DateTimeFormat("id-ID",{timeZone:t,weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(a)+" "+((e=t).includes("Jakarta")?"WIB":e.includes("Makassar")?"WITA":e.includes("Jayapura")?"WIT":e)}async function h(a){return await c(),(await o.f.insert(l.e).values({jobId:a.jobId,telegramUserId:a.telegramUserId,telegramChatId:a.telegramChatId,mode:a.mode,scheduledAt:a.scheduledAt,recommendationReason:a.recommendationReason||null,status:"pending"}).returning())[0]}async function w(a){return await c(),o.f.select().from(l.e).where((0,i.b)((0,i.u)(l.e.telegramUserId,a),(0,i.u)(l.e.status,"pending"))).orderBy((0,n.M)(l.e.scheduledAt))}a.s(["d",0,h,"b",0,b,"R",0,k,"f",0,w]),t()}catch(a){t(a)}},!1),40581,a=>a.a(async(e,t)=>{try{var i=a.i(58802),n=a.i(71629),r=a.i(99472),o=e([i,n]);[i,n]=o.then?(await o)():o;let s={parse_mode:"HTML",link_preview_options:{is_disabled:!0}},u=`

🛡️ *Source Credit & Copyright Guard:*
/sourceguard - Status & konfigurasi pengaman hak cipta
/whitelist - Lihat / tambah / hapus channel yang diizinkan`,d={warn:"⚠️ warn (hanya peringatan)",block:"⛔ block (blokir pelanggaran)",off:"⚪ off (guard mati)"};function l(a){return a?"✅ aktif":"❌ nonaktif"}a.s(["$",0,u,"H",0,function(a){a.command("sourceguard",async a=>{let e=(0,r.E)(),t="Statistik belum tersedia.";try{let a=await (0,n.H)();t=`24 jam terakhir → ✅ lolos: <b>${a.last24h.allowed}</b> • ⚠️ peringatan: <b>${a.last24h.warned}</b> • ⛔ diblokir: <b>${a.last24h.blocked}</b>
Total pengecekan tercatat: <b>${a.total}</b>`}catch(a){console.error("[source-guard] stats gagal:",a)}await a.reply(`🛡️ <b>Source Credit &amp; Copyright Guard</b>

Mode: <b>${(0,i.e)(d[e.mode])}</b> • Cakupan: <code>${e.scope}</code>
Kredit sumber di deskripsi: ${l(e.creditEnabled)} (${e.creditPosition})
<code>${(0,i.e)(e.creditTemplate)}</code>
Whitelist channel: ${e.whitelist.length} dari env${e.whitelistRequired?" • <b>wajib</b>":""} • channel milik sendiri: ${l(e.allowOwnChannel)}
Batas klip / video sumber / hari: <b>${0===e.maxClipsPerSourcePerDay?"tanpa batas":e.maxClipsPerSourcePerDay}</b> (zona ${(0,i.e)(e.timezone)})
Skip video bertanda Content ID: ${l(e.skipContentId)}

${t}

<b>Cara ubah (Railway Variables):</b>
• <code>SOURCE_CREDIT_ENABLED</code> = true / false
• <code>COPYRIGHT_GUARD_MODE</code> = warn | block | off
• <code>COPYRIGHT_WHITELIST_CHANNELS</code> = UCxxx,@handle,nama
• <code>COPYRIGHT_MAX_CLIPS_PER_SOURCE_PER_DAY</code> = angka (0 = tanpa batas)
• <code>COPYRIGHT_SKIP_CONTENT_ID</code> = true / false

ℹ️ Mode <b>warn</b> hanya memberi peringatan; ganti ke <b>block</b> agar video bermasalah benar-benar di-skip. Deteksi Content ID berbasis sinyal (musik berlisensi, penanda deskripsi) — bukan jaminan 100%. Kelola whitelist: /whitelist`,s)}),a.command("whitelist",async a=>{let e=a.from?.id?.toString();if(!e)return;let[t,...o]=(a.match||"").toString().trim().split(/\s+/),l=(t||"").toLowerCase(),u=o.join(" ").trim();try{if("add"===l||"tambah"===l){if(!u)return void await a.reply("Format: <code>/whitelist add @namachannel</code> (boleh juga ID UCxxx, nama, atau URL channel)",s);let t=await (0,n.i)(e,u);await a.reply(t.added?`✅ <code>${(0,i.e)(t.entry)}</code> ditambahkan ke whitelist.`:`ℹ️ <code>${(0,i.e)(t.entry)}</code> sudah ada di whitelist.`,s);return}if("remove"===l||"hapus"===l||"del"===l){if(!u)return void await a.reply("Format: <code>/whitelist remove &lt;nomor | channel&gt;</code>",s);let t=await (0,n.q)(e,u);await a.reply(t?`🗑 <code>${(0,i.e)(t)}</code> dihapus dari whitelist-mu.`:"❌ Tidak ditemukan di whitelist-mu. Cek nomor lewat /whitelist (entri dari env hanya bisa diubah di Railway Variables).",s);return}let t=await (0,n.O)(e),o=(0,r.M)(),d=(0,r.Q)()?await (0,n.l)(e):[],c=[`🛡️ <b>Whitelist Channel</b> (mode guard: <code>${(0,r.b)()}</code>)
`];c.push(`<b>Milikmu</b> (${t.length}):
`+(t.length?t.map((a,e)=>`${e+1}. <code>${(0,i.e)(a.label||a.entry)}</code>`).join("\n"):"— kosong —")),c.push(`
<b>Global (env COPYRIGHT_WHITELIST_CHANNELS)</b> (${o.length}):
`+(o.length?o.map(a=>`• <code>${(0,i.e)(a)}</code>`).join("\n"):"— kosong —")),c.push(`
<b>Channel YouTube milikmu (otomatis)</b>: `+(d.length?`<code>${(0,i.e)(d.slice(0,3).join(", "))}</code>`:"tidak terdeteksi (kirim /connect ulang bila perlu izin baca)")),c.push(`
➕ <code>/whitelist add @channel</code>
➖ <code>/whitelist remove 1</code>

Whitelist aktif bila ada isinya atau <code>COPYRIGHT_WHITELIST_REQUIRED=true</code>. Video dari channel di luar daftar diberi peringatan (mode warn) atau di-skip (mode block).`),await a.reply(c.join("\n"),s)}catch(e){console.error("[source-guard] /whitelist gagal:",e),await a.reply(`❌ Gagal: ${(0,i.e)(e instanceof Error?e.message:String(e))}`,s)}})}]),t()}catch(a){t(a)}},!1),62948,a=>a.a(async(e,t)=>{try{var i=a.i(77136),n=a.i(33680),r=a.i(30298),o=a.i(36763),l=a.i(96918),s=a.i(95031),u=a.i(647),d=a.i(98466),c=a.i(37539),m=a.i(56980),p=a.i(71601),k=a.i(10792),b=a.i(92739),h=a.i(73716),w=a.i(38141),g=a.i(82498),f=a.i(19470),y=a.i(16884),$=a.i(40581),_=a.i(27781),T=a.i(40046),I=a.i(67370),M=a.i(99350),A=a.i(7729),v=a.i(70932),S=a.i(22734),E=a.i(88610),C=a.i(8990),x=a.i(33791),O=a.i(57676),L=a.i(19942),P=a.i(83061),U=a.i(33541),R=a.i(27065),D=e([n,u,m,p,b,w,g,f,y,$,_,T,A,L,U]);[n,u,m,p,b,w,g,f,y,$,_,T,A,L,U]=D.then?(await D)():D;let Z=process.env.TELEGRAM_BOT_TOKEN||"placeholder_token_for_build",X=new i.Bot(Z);(0,U.o)(X);let J=/https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be|youtube\.com\/shorts|facebook\.com\/(watch|video)|fb\.watch|tiktok\.com\/@[^/]+\/video|instagram\.com\/(reel|p|tv))[^\s]*/i;async function N(a){let e=(0,h.o)(),t=a.from?.id?.toString(),l=e;if(t){let a=await n.f.select().from(r.Y).where((0,o.u)(r.Y.telegramUserId,t));l=a[0]?.clipDuration??e}let s=new i.InlineKeyboard;h.r.forEach(a=>{let e=a===l?`✅ ${a}s`:`${a} detik`;s.text(e,`set_duration_${a}`)}),await a.reply(`⏱ *Konfigurasi Durasi Klip:*

Aktif (env \`CLIP_DURATION\`): *${e} detik*
Setting akunmu: *${l} detik*

*Cara Ubah (2 metode):*

*1️⃣ Railway Variables (global, semua user):*
  Set variabel \`CLIP_DURATION\` di Railway Dashboard
  Contoh: \`CLIP_DURATION=20\`   klip 20 detik
• Nilai valid: \`${h.r.join("`, `")}\`
• Tidak perlu redeploy — langsung berlaku

*2️⃣ Per-akun via /settings atau /duration (tombol di bawah):*
• Tekan tombol durasi yang diinginkan
• Berlaku untuk akun Telegram kamu saja

📋 *Pilihan durasi tersedia:*
`+h.r.map(a=>`• ${a} detik`).join("\n")+`

💡 ENV var \`CLIP_DURATION\` jadi default untuk user baru; setting akun selalu dipakai setelah dipilih.`,{parse_mode:"Markdown",reply_markup:s})}async function j(a){let e=a.from?.id?.toString();if(!e)return;let t=await n.f.select().from(r.Y).where((0,o.u)(r.Y.telegramUserId,e)),l=t[0]?.nichePrompt??null,s=new i.InlineKeyboard;I.k.forEach((a,e)=>{s.text(`${a.emoji} ${a.label}`,`niche_preset_${e}`),e%2==1&&s.row()}),s.row().text("↩️ Reset ke Default","niche_reset"),await a.reply(`🎯 *Custom Niche Prompt*

Arahkan AI Analysis supaya fokus memilih momen sesuai niche kontenmu, misal "fokus ke momen lucu" atau "fokus ke insight bisnis".

Status saat ini: *${(0,I.L)(l)}*

*Cara mengatur:*
• Pilih salah satu preset di bawah, atau
• Kirim \`/niche <prompt bebas>\`
  Contoh: \`/niche fokus ke insight bisnis\`
• Kembali ke default: \`/niche reset\`

💡 Admin juga bisa set default global untuk semua user via Railway Variables: \`DEFAULT_NICHE_PROMPT\`.`,{parse_mode:"Markdown",reply_markup:s})}async function K(a,e,t){let n,r=a.chat?.id;if(!r)return;let o=(0,E.h)(),l=t||o.animation,s=await a.api.sendMessage(r,`⏳ Membuat preview style *${e}*...`,{parse_mode:"Markdown"});try{n=await (0,C.g)(e,t?{animation:t}:{}),await a.api.sendVideo(r,new i.InputFile(n),{caption:`💬 *Preview Subtitle: ${E.u[e].label}*
${E.u[e].description}

Animasi: \`${l}\` • Posisi: \`${o.position}\`
Warna: \`${o.color}\` • Highlight: \`${o.highlightColor}\`

Pakai style ini: set \`SUBTITLE_STYLE\` = \`${e}\` di Railway Variables`,parse_mode:"Markdown",width:540,height:960,supports_streaming:!0})}catch(e){console.error("[subtitle] preview gagal:",e),await a.api.sendMessage(r,"❌ Preview gagal dibuat. Pastikan FFmpeg (dengan libass) terinstall di server.")}finally{try{n&&S.default.existsSync(n)&&S.default.unlinkSync(n)}catch{}try{await a.api.deleteMessage(r,s.message_id)}catch{}}}X.command("start",async a=>{await q(a.from?.id?.toString()||""),await a.reply(c.Z.welcome,{parse_mode:"Markdown",reply_markup:new i.InlineKeyboard().text("🎬 Cara Pakai","help").text("🔗 Hubungkan YouTube","connect").row().text("⚙️ Pengaturan","settings").text("📋 Riwayat","history").row().text("☁️ Google Drive","drive_menu").text("📡 Auto-Monitor","monitors_menu")})}),X.command("help",async a=>{await a.reply(c.Z.help+aa+ae+at+$.$+_.m+T._,{parse_mode:"Markdown"})}),X.command("connect",async a=>{await H(a)}),X.command("disconnect",async a=>{let e=a.from?.id?.toString();e&&(await n.f.delete(r.f).where((0,o.u)(r.f.telegramUserId,e)),await n.f.update(r.Y).set({youtubeConnected:!1,updatedAt:new Date}).where((0,o.u)(r.Y.telegramUserId,e)),await a.reply("✅ Akun YouTube berhasil diputus."))}),X.command("status",async a=>{let e=a.from?.id?.toString();if(!e)return;let t=await n.f.select().from(r.V).where((0,o.u)(r.V.telegramUserId,e)).orderBy((0,l.A)(r.V.createdAt)).limit(5);if(!t.length)return void await a.reply("📊 Belum ada riwayat pemrosesan video.");let i="📊 *Status Pemrosesan Terakhir:*\n\n";t.forEach(a=>{let e="done"===a.status?"✅":"clips_ready"===a.status?"🎬":"error"===a.status?"❌":"⏳",t=a.errorMessage?a.errorMessage.replace(/[_*[\]()~`>#+\-=|{}.!]/g,""):"";i+=`${e} *Video*
Status: \`${a.status}\`
`,t&&(i+=`Error: ${t}
`),i+=`Waktu: ${new Date(a.createdAt).toLocaleString("id-ID")}

`}),await a.reply(i,{parse_mode:"Markdown"})}),X.command("settings",async a=>{await W(a)}),X.command("history",async a=>{await z(a)}),X.command("cancel",async a=>{await a.reply("⛔ Proses tidak bisa dibatalkan secara manual. Tunggu hingga selesai atau error.")}),X.command("clips",async a=>{let e=(0,h.c)(),t=a.from?.id?.toString(),l=e;if(t){let a=await n.f.select().from(r.Y).where((0,o.u)(r.Y.telegramUserId,t));l=a[0]?.maxClips??e}await a.reply(`✂️ *Konfigurasi Jumlah Klip AutoClip:*

Aktif (env \`MAX_CLIPS\`): *${e} klip*
Setting akunmu: *${l} klip*

*Cara Ubah (2 metode):*

*1️⃣ Railway Variables (global, semua user):*
  Set variabel \`MAX_CLIPS\` di Railway Dashboard
  Contoh: \`MAX_CLIPS=5\`   5 klip per video
• Rentang valid: \`1\` sampai \`10\`
• Tidak perlu redeploy — langsung berlaku

*2️⃣ Per-akun via /settings (tombol di bawah):*
• Tekan tombol jumlah klip yang diinginkan
• Berlaku untuk akun Telegram kamu saja

📋 *Semua nilai yang tersedia:*
• 1 klip — cepat, 1 momen terbaik
• 2 klip — standar minimal
• 3 klip — sebelumnya default
• 4 klip — lebih banyak pilihan
• *5 klip — default baru ⭐*
• 6-10 klip — maksimal (butuh lebih lama)

💡 ENV var \`MAX_CLIPS\` selalu override setting per-akun.`,{parse_mode:"Markdown",reply_markup:new i.InlineKeyboard().text("1️⃣","set_clips_1").text("2️⃣","set_clips_2").text("3️⃣","set_clips_3").text("4️⃣","set_clips_4").text("5️⃣","set_clips_5").row().text("6 klip","set_clips_6").text("7 klip","set_clips_7").text("8 klip","set_clips_8").text("9 klip","set_clips_9").text("10 klip","set_clips_10")})}),X.command("duration",async a=>{await N(a)}),X.command("niche",async a=>{let e=a.from?.id?.toString();if(!e)return;let t=(a.match||"").toString().trim();if(!t)return void await j(a);if(/^(reset|off|default|hapus|matikan)$/i.test(t)){await (0,g.O)(e);let t=(0,I.E)();await a.reply(`↩️ Niche prompt direset.

`+(t?`AI sekarang memakai default global: *"${t}"*`:"AI sekarang memilih momen viral secara umum (tanpa arahan khusus)."),{parse_mode:"Markdown"});return}let i=await (0,g.P)(e,t);await a.reply(`✅ *Niche Prompt diset!*

AI Analysis sekarang akan diarahkan dengan fokus:
*"${i}"*

💡 Berlaku untuk video berikutnya yang kamu kirim. Reset kapan saja dengan \`/niche reset\`.`,{parse_mode:"Markdown"})}),X.callbackQuery(/^niche_preset_(\d+)$/,async a=>{let e=a.from.id.toString(),t=I.k[parseInt(a.match[1],10)];if(!t)return void await a.answerCallbackQuery("❌ Preset tidak ditemukan");let i=await (0,g.P)(e,t.prompt);await a.answerCallbackQuery(`✅ Niche diset: ${t.label}`),await a.editMessageText(`✅ *Niche Prompt diset ke "${t.label}"!*

AI Analysis sekarang akan diarahkan dengan fokus:
*"${i}"*

💡 Ubah lagi kapan saja lewat /niche.`,{parse_mode:"Markdown"})}),X.callbackQuery("niche_reset",async a=>{let e=a.from.id.toString();await (0,g.O)(e);let t=(0,I.E)();await a.answerCallbackQuery("↩️ Niche direset"),await a.editMessageText(`↩️ Niche prompt direset.

`+(t?`AI sekarang memakai default global: *"${t}"*`:"AI sekarang memilih momen viral secara umum (tanpa arahan khusus)."),{parse_mode:"Markdown"})}),X.callbackQuery("niche_menu",async a=>{await a.answerCallbackQuery(),await j(a)}),(0,f.f)(X),(0,y.f)(X),(0,$.H)(X),(0,_.g)(X),(0,T.O)(X),(0,U.Q)(X),X.command("dupfilter",async a=>{let e=(0,M.h)(),t=await (0,A.A)();await a.reply(`🧹 *Duplicate/Repetitive Clip Filter*

Status: ${e.enabled?"✅ Aktif":"❌ Nonaktif"}
Cakupan pembanding: *${(0,M.E)(e.scope)}* (\`${e.scope}\`)
Ambang kemiripan teks: ${Math.round(100*e.textThreshold)}%
Ambang overlap waktu: ${Math.round(100*e.timeOverlapThreshold)}%
Lookback: ${0===e.lookbackDays?"tanpa batas":`${e.lookbackDays} hari terakhir`}

📊 Total klip disaring (semua user): *${t.totalSkipped}*
📊 Total sidik jari klip tersimpan: *${t.totalFingerprints}*

Fitur ini otomatis mencegah AutoClip membuat klip dengan konten mirip/berulang ketika source video yang sama diproses lebih dari sekali.

*Cara Ubah (Railway Variables):*
• \`DUPLICATE_FILTER_ENABLED\` = \`true\` / \`false\`
• \`DUPLICATE_FILTER_SCOPE\` = \`source\` | \`user\` | \`global\`
• \`DUPLICATE_FILTER_TEXT_THRESHOLD\` = \`0.0\` sampai \`1.0\` (default 0.72)
• \`DUPLICATE_FILTER_TIME_OVERLAP_THRESHOLD\` = \`0.0\` sampai \`1.0\` (default 0.6)
• \`DUPLICATE_FILTER_LOOKBACK_DAYS\` = jumlah hari, \`0\` = tanpa batas (default 30)`,{parse_mode:"Markdown"})}),X.command("jadwal",async a=>{let e=a.from?.id?.toString();if(!e)return;let t=await (0,b.f)(e);if(!t.length)return void await a.reply("🗓 Belum ada video yang dijadwalkan.");let i="🗓 *Antrean Jadwal Upload Anda:*\n\n";t.forEach((a,e)=>{i+=`${e+1}. Waktu: ${(0,b.b)(new Date(a.scheduledAt))} (Mode: ${a.mode})
`}),await a.reply(i,{parse_mode:"Markdown"})}),X.command("mode",async a=>{let e=(0,h._)(),t=(0,h.y)(e);await a.reply(`📐 *Mode Aspect Ratio 9:16 Aktif:*

Mode: *${t}* (\`${e}\`)

*Semua Mode:*
• \`blur\` → 🌀 Background blur (REKOMENDASI)
• \`crop\` → ✂️ Center crop
• \`pad\` → ⬛ Black bars
• \`stretch\` → ↔️ Stretch paksa
• \`none\` → 📐 Original ratio

Ubah: set \`ASPECT_RATIO_MODE=blur\` di Railway Variables`,{parse_mode:"Markdown"})}),X.command("thumbnail",async a=>{let e=(0,h.e)(),t=(0,h.w)(e.mode);await a.reply(`🖼 *Konfigurasi Thumbnail:*

Status: ${e.enabled?"✅ Aktif":"❌ Nonaktif"}
Mode: *${t}* (\`${e.mode}\`)
Kualitas: ${e.quality}/31
Resolusi: ${e.width}\xd7${0===e.height?"auto":e.height}

*Cara Ubah (Railway Variables):*
• \`THUMBNAIL_ENABLED\` = \`true\` / \`false\`
• \`THUMBNAIL_MODE\` = \`middle\` | \`best\` | \`start\` | \`custom\`
• \`THUMBNAIL_QUALITY\` = \`1\` sampai \`31\`
• \`THUMBNAIL_WIDTH\` = lebar (default: 1280)
• \`THUMBNAIL_HEIGHT\` = tinggi (default: 720)
• \`THUMBNAIL_OFFSET_SECONDS\` = detik (untuk mode custom)`,{parse_mode:"Markdown"})}),X.command("watermark",async a=>{let e=(0,h.K)(),t=(0,h.Z)(e.position);await a.reply(`💧 *Konfigurasi Watermark:*

Status: ${e.enabled?"✅ Aktif":"❌ Nonaktif"}
Teks: \`${e.text}\`
Posisi: *${t}* (\`${e.position}\`)
Font Size: ${e.fontSize}px
Warna: ${e.color} (opacity: ${e.opacity})
Kotak: ${e.box?"✅ Ada":"❌ Tidak"}
`+(e.imagePath?`Gambar: \`${e.imagePath}\`
`:"")+`
*Cara Ubah (Railway Variables):*
`+"• `WATERMARK_ENABLED` = `true` / `false`\n• `WATERMARK_TEXT` = `@NamaChannel` ← *teks watermark Anda*\n• `WATERMARK_POSITION` = `topleft` | `topright` | `bottomleft` | `bottomright` | `center`\n• `WATERMARK_FONT_SIZE` = ukuran font (default: 32)\n• `WATERMARK_COLOR` = `white` / `yellow` / `#FF0000`\n• `WATERMARK_OPACITY` = `0.0` sampai `1.0` (default: 0.85)\n• `WATERMARK_BOX` = `true` / `false` (kotak background)\n• `WATERMARK_BOX_COLOR` = `black@0.4` (transparansi kotak)\n• `WATERMARK_IMAGE_PATH` = path ke file logo PNG (opsional)\n• `WATERMARK_IMAGE_SCALE` = `0.15` (skala gambar, 0.01-1.0)",{parse_mode:"Markdown"})}),X.command("zoom",async a=>{let e=(0,h.n)(),t=(0,h.z)(e.type);await a.reply(`🔍 *Konfigurasi Zoom Effect pada Highlight:*

Status: ${e.enabled?"✅ Aktif":"❌ Nonaktif"}
Mode: \`${e.mode}\` (auto/always/never)
Tipe: *${t}* (\`${e.type}\`)
Intensitas: ${e.intensity}\xd7 (1.0 = tidak zoom, 1.3 = kuat)
Durasi: ${e.duration} detik
Min Score (auto): ${e.minScore}/10

*Cara Ubah (Railway Variables):*
• \`ZOOM_EFFECT_ENABLED\` = \`true\` / \`false\`
• \`ZOOM_EFFECT_MODE\` = \`auto\` | \`always\` | \`never\`
• \`ZOOM_EFFECT_TYPE\` = \`in\` | \`out\` | \`in-out\` | \`pulse\`
• \`ZOOM_EFFECT_INTENSITY\` = \`1.05\` (subtle) sampai \`1.3\` (strong)
• \`ZOOM_EFFECT_DURATION\` = durasi dalam detik (default: 2.0)
• \`ZOOM_EFFECT_MIN_SCORE\` = min viral score 1-10 (default: 7)`,{parse_mode:"Markdown"})}),X.command("autoreframe",async a=>{let e=(0,v.P)(),t=(0,v.B)(e.backend);await a.reply(`🎯 *Auto-Reframe Speaker Tracking:*

Status: ${e.enabled?"✅ Aktif":"❌ Nonaktif"}
Backend deteksi wajah: *${t}*
Sample rate: ${e.sampleFps} fps
Smoothing: ${e.smoothing} (0=responsif, 0.95=sangat halus)
Padding wajah: ${e.padding}
Fallback kalau wajah tidak terdeteksi: \`${e.fallbackMode}\`

ℹ️ Fitur ini menggantikan *center crop statis* dengan crop dinamis yang mengikuti wajah/pembicara aktif — HANYA berlaku saat \`ASPECT_RATIO_MODE=crop\`.

*Cara Aktifkan (Railway Variables):*
• \`ASPECT_RATIO_MODE\` = \`crop\`
• \`AUTO_REFRAME_ENABLED\` = \`true\`

*Konfigurasi Lanjutan (opsional):*
• \`AUTO_REFRAME_BACKEND\` = \`opencv\` | \`none\`
• \`AUTO_REFRAME_SAMPLE_FPS\` = angka (default: 2)
• \`AUTO_REFRAME_SMOOTHING\` = 0.0-0.95 (default: 0.8)
• \`AUTO_REFRAME_PADDING\` = 0.0-1.5 (default: 0.35)
• \`AUTO_REFRAME_FALLBACK_MODE\` = \`blur\`|\`crop\`|\`pad\`|\`stretch\`|\`none\`

💡 Tidak ada wajah terdeteksi / backend error → otomatis fallback ke crop statis, proses tetap aman.`,{parse_mode:"Markdown"})}),X.command("subtitle",async a=>{let e=String(a.match||"").toLowerCase().split(/\s+/).filter(Boolean),t=e.find(a=>(0,E.y)("hormozi"===a?"alex-hormozi":a)),n=e.find(a=>(0,E.H)(a));if(t)return void await K(a,"hormozi"===t?"alex-hormozi":t,n);let r=(0,E.h)(),o=new i.InlineKeyboard;E.b.forEach((a,e)=>{o.text(`${a===r.style?"✅ ":""}${E.u[a].label}`,`sub_prev_${a}`),e%2==1&&o.row()}),await a.reply(`💬 *Subtitle / Caption Burn-In:*

Status: ${r.enabled?"✅ Aktif":"❌ Nonaktif"}
Style: *${(0,E.U)(r.style)}* (\`${r.style}\`)
Ukuran font: ${r.fontSize}px • Font: \`${r.font}\`
Warna: \`${r.color}\` • Highlight: \`${r.highlightColor}\`
Posisi: *${(0,E.D)(r.position)}* (\`${r.position}\`)
Maks kata/baris: ${r.maxWordsPerLine}
Animasi: \`${r.animation}\`

*Style tersedia:*
`+E.b.map(a=>`• \`${a}\` → ${E.u[a].description}`).join("\n")+"\n\n*Preview:* tekan tombol di bawah, atau ketik `/subtitle karaoke`, `/subtitle alex-hormozi fade`.\n\n"+`*Cara Ubah (Railway Variables):*
`+"• `SUBTITLE_ENABLED` = `true` / `false`\n"+`• \`SUBTITLE_STYLE\` = ${E.b.map(a=>`\`${a}\``).join(" | ")}
`+"• `SUBTITLE_FONT_SIZE` = ukuran dasar (default: 48)\n• `SUBTITLE_COLOR` = `white` / `#FFFFFF`\n• `SUBTITLE_HIGHLIGHT_COLOR` = `yellow` / `#FFE500`\n"+`• \`SUBTITLE_POSITION\` = ${E.W.map(a=>`\`${a}\``).join(" | ")}
`+"• `SUBTITLE_MAX_WORDS_PER_LINE` = 1-8 (default: 4)\n"+`• \`SUBTITLE_ANIMATION\` = ${E.Q.map(a=>`\`${a}\``).join(" | ")}

`+"ℹ️ Subtitle memakai timestamp per kata dari Whisper (butuh `OPENAI_API_KEY` atau `GROQ_API_KEY`). Tanpa transkripsi, klip tetap dibuat tanpa subtitle.",{parse_mode:"Markdown",reply_markup:o})}),X.callbackQuery(RegExp(`^sub_prev_(${E.b.join("|")})$`),async a=>{let e=a.match[1];await a.answerCallbackQuery({text:`Membuat preview ${e}...`}),await K(a,e)}),X.command("hook",async a=>{let e=(0,x.U)();await a.reply(`🪝 *AI Hook Overlay (Teks Pembuka):*

Status: ${e.enabled?"✅ Aktif":"❌ Nonaktif"}
Style: *${(0,x.p)(e.style)}* (\`${e.style}\`)
Durasi: ${e.duration} detik pertama
Font: ${e.fontSize}px • Warna: \`${e.color}\` • Latar: \`${e.bgColor}\`

*Style tersedia:*
`+x.P.map(a=>`• \`${a}\` → ${x.g[a].description}`).join("\n")+`

*Contoh hook AI:*
`+`• "Kamu gak akan percaya apa yang terjadi selanjutnya..."
`+`• "99% orang salah soal ini!"
`+`• "Ini rahasia yang CEO gak mau kamu tahu"

`+`*Cara Ubah (Railway Variables):*
`+"• `HOOK_ENABLED` = `true` / `false`\n• `HOOK_DURATION` = detik (default: 2)\n"+`• \`HOOK_STYLE\` = ${x.P.map(a=>`\`${a}\``).join(" | ")}
`+"• `HOOK_FONT_SIZE` = ukuran font (default: 56)\n• `HOOK_COLOR` = `white` / `#FFFFFF`\n• `HOOK_BG_COLOR` = `#FF0000`\n\nℹ️ Hook dibuat AI bersamaan dengan analisis momen viral, lalu di-render ke video lewat FFmpeg.",{parse_mode:"Markdown"})}),X.command("autocomment",async a=>{let e=(0,O.q)(),t=(0,O.c)();await a.reply(`💬 *Auto-First Comment (Pancingan Algoritma):*

Status: ${e?"✅ Aktif":"❌ Nonaktif"}
Gaya: *${(0,O.s)()}* (\`${(0,O.h)()}\`)
Maks panjang: ${(0,O.L)()} karakter
Suffix: ${t?`\`${t.replace(/`/g,"'")}\``:"—"}
Video target: ${(0,O._)().join(", ")}
Percobaan: ${(0,O.S)()}x • Jeda setelah upload: ${(0,O.t)()} dtk
Komentar cadangan: ${(0,O.v)()?"✅":"❌"} • Link untuk pin: ${(0,O.C)()?"✅":"❌"}

*Gaya tersedia:*
`+O.Z.map(a=>`• \`${a}\` → ${O.w[a].description}`).join("\n")+`

*Contoh komentar:*
`+O.a.map(a=>`• "${B(a)}"`).join("\n")+`

*Cara Ubah (Railway Variables):*
`+"• `YOUTUBE_AUTO_COMMENT_ENABLED` = `true` / `false`\n"+`• \`YOUTUBE_AUTO_COMMENT_STYLE\` = ${O.Z.map(a=>`\`${a}\``).join(" | ")}
`+"• `YOUTUBE_AUTO_COMMENT_SUFFIX` = teks tambahan (mis. Full video di channel @kamu)\n• `YOUTUBE_AUTO_COMMENT_PROMPT` = arahan tambahan untuk AI\n\nℹ️ AI membuat komentar bersamaan dengan analisis klip, lalu bot memposting via `commentThreads.insert` setelah video terupload. Butuh izin baru: kirim /connect sekali lagi setelah fitur diaktifkan. YouTube API tidak bisa mem-pin otomatis — bot mengirim link komentar untuk kamu pin manual.",{parse_mode:"Markdown"})}),X.command("introoutro",async a=>{let e=(0,h.E)();await a.reply(`🎬 *Konfigurasi Intro / Outro Otomatis:*

*INTRO:*
Status: ${e.introEnabled?"✅ Aktif":"❌ Nonaktif"}
`+(e.introVideoPath?`File: \`${e.introVideoPath}\`
`:`Mode: Auto-generate (${e.introDuration}s)
`)+`Teks: \`${e.introText}\`
`+`Warna BG: \`${e.introColor}\`

`+`*OUTRO:*
`+`Status: ${e.outroEnabled?"✅ Aktif":"❌ Nonaktif"}
`+(e.outroVideoPath?`File: \`${e.outroVideoPath}\`
`:`Mode: Auto-generate (${e.outroDuration}s)
`)+`Teks: \`${e.outroText}\`
`+`Warna BG: \`${e.outroColor}\`

`+`*Cara Ubah (Railway Variables):*
`+"• `INTRO_ENABLED` = `true` / `false`\n• `INTRO_VIDEO_PATH` = path ke file intro.mp4 (opsional)\n• `INTRO_DURATION` = durasi intro otomatis dalam detik (default: 3)\n• `INTRO_TEXT` = teks pada intro otomatis\n• `INTRO_COLOR` = warna background (`#000000` = hitam)\n• `OUTRO_ENABLED` = `true` / `false`\n• `OUTRO_VIDEO_PATH` = path ke file outro.mp4 (opsional)\n• `OUTRO_DURATION` = durasi outro otomatis dalam detik (default: 3)\n"+`• \`OUTRO_TEXT\` = teks pada outro (misal: \`Subscribe! 🔔\`)
`+"• `OUTRO_COLOR` = warna background outro\n\n"+`💡 *Tips:* Jika tidak ada file video, intro/outro akan di-generate otomatis menggunakan FFmpeg dengan teks yang Anda set.`,{parse_mode:"Markdown"})});let aa=`

☁️ *Google Drive (auto-upload)*
/drive — status & hubungkan akun
/drivefolder <link> — ganti folder tujuan
/driveon /driveoff — nyalakan/matikan auto-upload`,ae=`

📡 *Auto-Monitor Channel/Playlist*
/monitor <link> — pantau channel/playlist, auto-clip tiap ada upload baru
/monitors — lihat & kelola daftar yang dipantau
/unmonitor <id> — berhenti memantau
/monitoron /monitoroff <id> — nyala/matikan sementara
/monitorinterval <id> <menit> — ubah jeda pengecekan
/monitorupload <id> on|off — atur auto-upload YouTube`,at=`

💬 *Auto-First Comment*
/autocomment — info komentar pancingan otomatis di video yang diupload`;function B(a){return a.replace(/([_*`\[\]])/g,"\\$1")}async function F(a){let e=a.from?.id?.toString();if(!e)return;if(!(0,w.D)())return void await a.reply(`☁️ *Google Drive belum dikonfigurasi di server.*

Set variabel berikut di Railway:
• \`GOOGLE_CLIENT_ID\`
• \`GOOGLE_CLIENT_SECRET\`
• \`GOOGLE_REDIRECT_URI\`

Lalu aktifkan *Google Drive API* di Google Cloud Console.`,{parse_mode:"Markdown"});let t=await (0,w.h)(e),n=new i.InlineKeyboard,r=`☁️ *Google Drive Auto-Upload*

`;t.globallyEnabled||(r+="⛔ Fitur dimatikan oleh admin (`GOOGLE_DRIVE_ENABLED=false`).\n\n"),t.connected?(r+=`Status: ✅ Terhubung${t.email?` (\`${B(t.email)}\`)`:""}
Auto-upload: *${t.autoUpload?"✅ Aktif":"❌ Nonaktif"}*
📁 Folder: *${B(t.folderLabel)}*
🗂 Subfolder per video: *${t.subfolderPerJob?"Ya":"Tidak"}*
🔗 Link: *${"anyone"===t.share?"Siapa saja yang punya link":"Privat"}*

*Ganti folder tujuan:*
\`/drivefolder https://drive.google.com/drive/folders/XXXX\`
\`/drivefolder reset\` → kembali ke default

*Ganti akun Google:* tekan "Ganti Akun" lalu login dengan akun lain.`,n.text(t.autoUpload?"⏸ Matikan Auto-Upload":"▶️ Nyalakan Auto-Upload","drive_toggle").row(),t.folderUrl&&n.url("📂 Buka Folder",t.folderUrl).row(),"user"===t.folderSource&&n.text("↩️ Reset Folder","drive_reset_folder").row(),n.url("🔄 Ganti Akun",(0,w.$)(e)).row(),n.text("🔌 Putuskan Drive","drive_disconnect")):(r+=`Status: ❌ Belum terhubung

Hubungkan akun Google agar setiap klip hasil AutoClip otomatis tersimpan di Drive-mu.`,n.url("🔗 Hubungkan Google Drive",(0,w.$)(e))),await a.reply(r,{parse_mode:"Markdown",reply_markup:n})}async function Y(a,e){let t=a.from?.id?.toString();if(!t)return;let i=parseInt((a.match||"").toString().trim(),10);if(!i)return void await a.reply(`Gunakan: \`/monitor${e?"on":"off"} <id>\` (lihat id lewat /monitors)`,{parse_mode:"Markdown"});let n=await (0,L.q)(i,t,e);await a.reply(n?`✅ Monitor #${i} ${e?"diaktifkan 🟢":"dinonaktifkan ⏸"}.`:`❌ Monitor #${i} tidak ditemukan.`)}async function Q(a,e){let t=a.from?.id?.toString(),l=a.chat?.id?.toString(),d=a.message?.message_id;if(!t||!l)return;await q(t);let m=(0,u.y)(e);if("unknown"===m)return void await a.reply(c.Z.invalidUrl,{parse_mode:"Markdown"});if(!await (0,U.N)(a,t)||!await (0,T.g)(a,t))return;let p=(0,s.f)();await n.f.insert(r.V).values({jobId:p,telegramUserId:t,telegramChatId:l,telegramMessageId:d,sourceUrl:e,platform:m,status:"queued"});let k=(await n.f.select().from(r.f).where((0,o.u)(r.f.telegramUserId,t))).length>0,b=(0,h._)(),g=(0,h.y)(b),f=(0,h.K)(),y=(0,h.n)(),$=(0,h.E)(),_=(0,h.c)(),I=await (0,w.h)(t).catch(()=>null),M=I?.configured&&I.globallyEnabled?`
☁️ Google Drive: *${I.connected?I.autoUpload?"✅ Auto-upload aktif":"⏸ Dimatikan":"❌ Belum terhubung (/drive)"}*`:"",A=`📐 Mode 9:16: *${g}*
✂️ AutoClip: *${_} klip* (ubah: \`MAX_CLIPS\` atau /clips)
💧 Watermark: *${f.enabled?`✅ "${f.text}"`:"❌ Nonaktif"}*
🔍 Zoom Effect: *${y.enabled?`✅ ${y.mode} (${y.type})`:"❌ Nonaktif"}*
🎬 Intro/Outro: *${$.introEnabled||$.outroEnabled?"✅ Aktif":"❌ Nonaktif"}*`+M;k?await a.reply(`${(0,c.h)(m)} *Video terdeteksi!*

Platform: ${m.toUpperCase()}
URL: \`${e.slice(0,50)}${e.length>50?"...":""}\`

${A}

Pilih format output:`,{parse_mode:"Markdown",reply_markup:new i.InlineKeyboard().text(`📱 Vertikal 9:16 (${g})`,`process_v_${p}`).row().text("🎬 Original (Keep Ratio)",`process_o_${p}`)}):await a.reply(`${(0,c.h)(m)} *Video terdeteksi!*

⚠️ YouTube belum terhubung. Klip akan dikirim ke Telegram saja.

${A}

Hubungkan YouTube untuk auto-upload ke YouTube Studio!`,{parse_mode:"Markdown",reply_markup:new i.InlineKeyboard().url("🔗 Hubungkan YouTube",await V(t)).row().text("▶️ Proses Tanpa YouTube",`process_${p}`)})}async function G(a,e,t=!0){let l=a.chat?.id;if(!l)return;let s=(await n.f.select().from(r.V).where((0,o.u)(r.V.jobId,e)))[0],u=s?`${(0,c.h)(s.platform)}${s.platform.toUpperCase()}`:"Video",d=s?.sourceUrl?`  \`${s.sourceUrl.slice(0,60)}${s.sourceUrl.length>60?"...":""}\``:void 0,h=new p.f({api:a.api,chatId:l,jobId:e,title:u,jobLabel:d});await h.start();let w=async(a,e,t)=>{(e&&e.replace(/([_*`\[\]])/g,"\\$1"),"error"===a)?await h.fail(e):await h.update(t?.step??a,{detail:e,percent:t?.percent})};try{(0,k.q)()?await (0,m.processClipsOnly)(e,w):await (0,m.processJob)(e,w);let t=(await n.f.select().from(r.V).where((0,o.u)(r.V.jobId,e)))[0];if(("done"===t.status||"clips_ready"===t.status)&&t.clips){let s=t.clips.filter(a=>a.filePath);await h.finishSuccess(`  *${s.length} klip berhasil dibuat!* Mengirim ke chat...`);for(let e=0;e<s.length;e++){let t=s[e];if(!t.filePath||!S.default.existsSync(t.filePath))continue;let n=[`  Klip ${e+1}/${s.length}`,`  ${t.title}`,"",`  Durasi: ${t.duration}s`,`  Viral Score: ${t.viralScore}/10`,`  ${t.reason}`,t.thumbnailPath?"  Thumbnail: ✅":"",t.youtubeUrl?`
  YouTube: ${t.youtubeUrl}`:"",t.driveUrl?`
  Drive: ${t.driveUrl}`:""].join("\n").trim();try{t.thumbnailPath&&S.default.existsSync(t.thumbnailPath)&&await a.api.sendPhoto(l,new i.InputFile(t.thumbnailPath),{caption:`  Thumbnail Klip ${e+1}`,parse_mode:"HTML"}),await a.api.sendVideo(l,new i.InputFile(t.filePath),{caption:n,parse_mode:"HTML"})}catch(a){console.error(`Failed to send clip ${e+1}:`,a)}}if("clips_ready"===t.status){let s=await n.f.select().from(r.Y).where((0,o.u)(r.Y.telegramUserId,l.toString())),u=await (0,b.R)(s[0]?.nichePrompt,t.platform),d=new i.InlineKeyboard;d.text("🚀 Post Sekarang",`publish_now_${e}`).row(),u.slots.forEach(a=>{d.text(`🤖 AI: ${a.label}`,`sched_ai_${a.date.getTime()}_${e}`).row()});let c=u.reason.replace(/[_*[\]()~`>#+\-=|{}.!]/g," ");await a.api.sendMessage(l,`✅ *Klip Siap!*

🤖 *Rekomendasi AI (${u.nicheLabel}):*
${c}

Kapan klip ingin dipublish ke YouTube?`,{parse_mode:"Markdown",reply_markup:d})}else{let e=s.some(a=>a.youtubeUrl),t=new i.InlineKeyboard;e&&t.url("  Buka YouTube Studio","https://studio.youtube.com/channel/videos/upload").row(),t.text("  Proses Video Lain","help"),await a.api.sendMessage(l,c.Z.resultSummary(s.map(a=>({title:a.title,duration:a.duration,youtubeUrl:a.youtubeUrl,viralScore:a.viralScore,hasThumbnail:!!(a.thumbnailPath&&S.default.existsSync(a.thumbnailPath))}))),{parse_mode:"Markdown",reply_markup:t})}setTimeout(()=>{s.forEach(a=>{if(a.filePath&&S.default.existsSync(a.filePath))try{S.default.unlinkSync(a.filePath)}catch{}if(a.thumbnailPath&&S.default.existsSync(a.thumbnailPath))try{S.default.unlinkSync(a.thumbnailPath)}catch{}})},3e4)}else if("error"===t.status){let a=(t.errorMessage||"Terjadi kesalahan tidak diketahui").replace(/[_*[\]()~`>#+\-=|{}.!]/g," ");await h.finishError(a,{reply_markup:new i.InlineKeyboard().text("🔄 Coba Lagi",`retry_job_${e}`)})}}catch(t){let a=(t instanceof Error?t.message:String(t)).replace(/[_*[\]()~`>#+\-=|{}.!]/g," ");await h.finishError(a,{reply_markup:new i.InlineKeyboard().text("🔄 Coba Lagi",`retry_job_${e}`)}).catch(()=>{})}}async function H(a){let e=a.from?.id?.toString();if(!e)return;let t=await V(e);await a.reply(c.Z.connecting,{parse_mode:"Markdown",reply_markup:new i.InlineKeyboard().url("🔗 Login ke YouTube Studio",t).row().text("ℹ️ Bantuan","help")})}async function V(a){try{return(0,d.f)(a)}catch{return"https://accounts.google.com"}}async function W(a){let e=a.from?.id?.toString();if(!e)return;await q(e);let t=(await n.f.select().from(r.Y).where((0,o.u)(r.Y.telegramUserId,e)))[0],l=await n.f.select().from(r.f).where((0,o.u)(r.f.telegramUserId,e)),s=(0,h._)(),u=(0,h.y)(s),d=(0,h.K)(),m=(0,h.n)(),p=(0,h.E)(),k=(0,h.c)(),b=(0,h.o)(),w=t.clipDuration||b,g=`

*Fitur Aktif:*
• Mode 9:16: *${u}*
• AutoClip: *${k} klip* (env \`MAX_CLIPS\`   /clips untuk ubah)
• Durasi Klip: *${w} detik* (env \`CLIP_DURATION\`   /duration untuk ubah)
• Watermark: *${d.enabled?`"${d.text}" @ ${d.position}`:"Nonaktif"}*
• Zoom Effect: *${m.enabled?`${m.mode} (${m.type})`:"Nonaktif"}*
• Intro: *${p.introEnabled?`✅ "${p.introText}"`:"❌"}* | Outro: *${p.outroEnabled?`✅ "${p.outroText}"`:"❌"}*
• 🎯 Niche Prompt: *${(0,I.L)(t.nichePrompt)}*
• 🧹 Duplicate Filter: *${(0,M.h)().enabled?`✅ Aktif (${(0,M.h)().scope})`:"❌ Nonaktif"}*

_Gunakan /clips /duration /watermark /zoom /introoutro /thumbnail /mode /niche /dupfilter untuk info detail_`,f=new i.InlineKeyboard;h.r.forEach(a=>{f.text(a===w?`✅ ${a}s`:`${a}s`,`set_duration_${a}`)}),await a.reply(c.Z.settings({maxClips:t.maxClips||k,clipDuration:w,minDuration:t.minDuration||20,maxDuration:t.maxDuration||40,defaultPrivacy:t.defaultPrivacy||"private",youtubeConnected:l.length>0})+g,{parse_mode:"Markdown",reply_markup:new i.InlineKeyboard().text("1️⃣ Klip","set_clips_1").text("2️⃣ Klip","set_clips_2").text("3️⃣ Klip","set_clips_3").text("4️⃣ Klip","set_clips_4").text("5️⃣ Klip ⭐","set_clips_5").row().append(f).row().text("🔒 Private","set_privacy_private").text("🔗 Unlisted","set_privacy_unlisted").text("🌐 Public","set_privacy_public").row().text("🎯 Niche Prompt","niche_menu").row().text("🔗 Hubungkan YouTube","connect").text("☁️ Google Drive","drive_menu")})}async function z(a){let e=a.from?.id?.toString();if(!e)return;let t=await n.f.select().from(r.V).where((0,o.u)(r.V.telegramUserId,e)).orderBy((0,l.A)(r.V.createdAt)).limit(10);if(!t.length)return void await a.reply("📭 Belum ada riwayat. Kirim link video untuk memulai!",{reply_markup:new i.InlineKeyboard().text("📚 Panduan","help")});let s={queued:"⏳",downloading:"⬇️",analyzing:"🧠",clipping:"✂️",uploading:"📤",done:"✅",error:"❌"},u=`📋 *Riwayat (${t.length} job terbaru):*

`;t.forEach((a,e)=>{let t=a.clips||[],i=t.filter(a=>a.youtubeUrl).length;u+=`${e+1}. ${s[a.status]||"❓"} *${(a.videoTitle||"Video").slice(0,35)}*
 ${(0,c.h)(a.platform)} ${a.platform} | ${a.status}`,"done"===a.status&&t.length&&(u+=` | ${t.length} klip`,i&&(u+=` (${i} di YT)`)),u+=`
`}),await a.reply(u,{parse_mode:"Markdown"})}async function q(a){if(a&&!(await n.f.select().from(r.Y).where((0,o.u)(r.Y.telegramUserId,a))).length){let e=(0,h.c)(),t=(0,h.o)(),{min:i,max:o}=(0,h.D)(t);await n.f.insert(r.Y).values({telegramUserId:a,maxClips:e,clipDuration:t,minDuration:i,maxDuration:o,defaultPrivacy:"private",language:"id"})}}X.command("drive",async a=>{await F(a)}),X.command("driveon",async a=>{let e=a.from?.id?.toString();e&&((await (0,w.h)(e)).connected?(await (0,w.S)(e,!0),await a.reply("✅ Auto-upload Google Drive *diaktifkan*.",{parse_mode:"Markdown"})):await F(a))}),X.command("driveoff",async a=>{let e=a.from?.id?.toString();e&&((await (0,w.h)(e)).connected?(await (0,w.S)(e,!1),await a.reply("⏸ Auto-upload Google Drive *dimatikan*. Nyalakan lagi dengan /driveon.",{parse_mode:"Markdown"})):await a.reply("☁️ Google Drive belum terhubung."))}),X.command("drivedisconnect",async a=>{let e=a.from?.id?.toString();e&&(await (0,w.C)(e),await a.reply("✅ Google Drive berhasil diputus. Hubungkan lagi lewat /drive."))}),X.command("drivefolder",async a=>{let e=a.from?.id?.toString();if(!e)return;let t=(a.match||"").toString().trim(),i=await (0,w.h)(e);if(!i.connected)return void await F(a);if(!t)return void await a.reply(`📁 *Folder tujuan saat ini:* ${B(i.folderLabel)}

Ganti dengan:
\`/drivefolder <link folder Google Drive>\`
Kembali ke default:
\`/drivefolder reset\``,{parse_mode:"Markdown"});if(/^(reset|default)$/i.test(t)){await (0,w.f)(e);let t=await (0,w.h)(e);await a.reply(`↩️ Folder direset ke default: *${B(t.folderLabel)}*`,{parse_mode:"Markdown"});return}try{let i=await (0,w.b)(e,t);await a.reply(`✅ Folder tujuan diganti ke: *${B(i.name)}*
Klip berikutnya akan masuk ke folder ini.`,{parse_mode:"Markdown"})}catch(e){await a.reply(`❌ ${e instanceof Error?e.message:String(e)}`)}}),X.callbackQuery("drive_menu",async a=>{await a.answerCallbackQuery(),await F(a)}),X.callbackQuery("drive_toggle",async a=>{let e=a.from.id.toString(),t=await (0,w.h)(e);t.connected?(await (0,w.S)(e,!t.autoUpload),await a.answerCallbackQuery(!t.autoUpload?"✅ Auto-upload aktif":"⏸ Auto-upload mati"),await a.editMessageReplyMarkup({reply_markup:new i.InlineKeyboard}).catch(()=>{}),await F(a)):await a.answerCallbackQuery("Drive belum terhubung")}),X.callbackQuery("drive_reset_folder",async a=>{await a.answerCallbackQuery("↩️ Folder direset"),await (0,w.f)(a.from.id.toString()),await a.editMessageReplyMarkup({reply_markup:new i.InlineKeyboard}).catch(()=>{}),await F(a)}),X.callbackQuery("drive_disconnect",async a=>{await a.answerCallbackQuery("🔌 Drive diputus"),await (0,w.C)(a.from.id.toString()),await a.editMessageText("✅ Google Drive berhasil diputus. Hubungkan lagi kapan saja lewat /drive.")}),X.callbackQuery("monitors_menu",async a=>{await a.answerCallbackQuery();let e=a.from?.id?.toString();if(!e)return;let t=await (0,L.r)(e);if(!t.length)return void await a.reply("📡 *Auto-Monitor Channel/Playlist*\n\nBelum ada channel/playlist yang dipantau.\n\nKirim: `/monitor <link channel atau playlist YouTube>` untuk mulai memantau secara otomatis!",{parse_mode:"Markdown"});let i="📡 *Channel/Playlist yang Dipantau:*\n\n";t.forEach(a=>{i+=`*#${a.id}* — ${B(a.title||a.externalId)}
   ${a.enabled?"🟢 Aktif":"⏸ Nonaktif"} • cek tiap ${a.intervalMinutes} menit • upload: ${a.autoUpload?"✅":"❌"}

`}),i+="Kelola: `/unmonitor <id>` | Ubah cek: `/monitorinterval <id> <menit>`",await a.reply(i,{parse_mode:"Markdown"})}),X.command("monitor",async a=>{let e=a.from?.id?.toString(),t=a.chat?.id?.toString();if(!e||!t)return;if(!(0,P.E)())return void await a.reply("📡 Fitur Auto-Monitor sedang dinonaktifkan oleh admin (`CHANNEL_MONITOR_ENABLED=false`).",{parse_mode:"Markdown"});let i=(a.match||"").toString().trim();if(!i)return void await a.reply("📡 *Auto-Monitor Channel/Playlist*\n\nKirim: `/monitor <link channel atau playlist YouTube>`\n\nContoh:\n`/monitor https://www.youtube.com/@namachannel`\n`/monitor https://www.youtube.com/playlist?list=PLxxxxxx`\n\nBot akan otomatis mengecek upload baru secara berkala dan langsung memotong + mengupload klip TANPA kamu perlu kirim link lagi. Lihat daftar: /monitors",{parse_mode:"Markdown"});let n=await (0,L.g)(e),r=(0,P.R)();if(n>=r)return void await a.reply(`❌ Batas maksimal *${r} channel/playlist* per akun sudah tercapai. Hapus salah satu dulu dengan /unmonitor.`,{parse_mode:"Markdown"});let o=await a.reply("🔎 Mengecek & mendaftarkan channel/playlist...");try{let n=await (0,L.Y)({telegramUserId:e,telegramChatId:t,url:i});await a.api.editMessageText(t,o.message_id,`✅ *Berhasil dipantau!*

📡 ${B(n.title||n.externalId)}
Jenis: ${"playlist"===n.sourceType?"Playlist":"Channel"}
Cek tiap: ${n.intervalMinutes} menit
Auto-upload: ${n.autoUpload?"✅ Aktif":"❌ Nonaktif"}

Upload baru akan otomatis di-clip & dikirim ke chat ini — tidak perlu kirim link manual lagi!

Kelola: /monitors`,{parse_mode:"Markdown"})}catch(e){await a.api.editMessageText(t,o.message_id,`❌ Gagal mendaftarkan: ${e instanceof Error?e.message:String(e)}

Pastikan link channel/playlist valid. Kalau channel pakai @handle baru, coba juga versi link \`/channel/UCxxxx\`.`,{parse_mode:"Markdown"}).catch(()=>{})}}),X.command("monitors",async a=>{let e=a.from?.id?.toString();if(!e)return;let t=await (0,L.r)(e);if(!t.length)return void await a.reply("📡 Belum ada channel/playlist yang dipantau.\n\nTambahkan dengan: `/monitor <link>`",{parse_mode:"Markdown"});let i="📡 *Channel/Playlist yang Dipantau:*\n\n";t.forEach(a=>{i+=`*#${a.id}* — ${B(a.title||a.externalId)}
   ${a.enabled?"🟢 Aktif":"⏸ Nonaktif"} • cek tiap ${a.intervalMinutes} menit • upload: ${a.autoUpload?"✅":"❌"} • ${a.totalVideosProcessed} video diproses
`,a.lastCheckedAt&&(i+=`   Cek terakhir: ${new Date(a.lastCheckedAt).toLocaleString("id-ID")}
`),a.lastError&&(i+=`   ⚠️ Error terakhir: ${B(a.lastError).slice(0,120)}
`),i+="\n"}),i+="Kelola:\n`/unmonitor <id>` — hapus\n`/monitoron <id>` / `/monitoroff <id>` — nyala/matikan\n`/monitorinterval <id> <menit>` — ubah jeda cek\n`/monitorupload <id> on|off` — atur auto-upload YouTube",await a.reply(i,{parse_mode:"Markdown"})}),X.command("unmonitor",async a=>{let e=a.from?.id?.toString();if(!e)return;let t=parseInt((a.match||"").toString().trim(),10);if(!t)return void await a.reply("Gunakan: `/unmonitor <id>` (lihat id lewat /monitors)",{parse_mode:"Markdown"});let i=await (0,L.y)(t,e);await a.reply(i?`✅ Monitor #${t} dihapus.`:`❌ Monitor #${t} tidak ditemukan.`)}),X.command("monitoron",async a=>{await Y(a,!0)}),X.command("monitoroff",async a=>{await Y(a,!1)}),X.command("monitorinterval",async a=>{let e=a.from?.id?.toString();if(!e)return;let[t,i]=(a.match||"").toString().trim().split(/\s+/),n=parseInt(t,10),r=parseInt(i,10);if(!n||!r)return void await a.reply("Gunakan: `/monitorinterval <id> <menit>` — contoh: `/monitorinterval 1 15`",{parse_mode:"Markdown"});let o=await (0,L.h)(n,e,r);await a.reply(o?`✅ Monitor #${n} akan dicek tiap ${r} menit.`:`❌ Monitor #${n} tidak ditemukan.`)}),X.command("monitorupload",async a=>{let e=a.from?.id?.toString();if(!e)return;let[t,i]=(a.match||"").toString().trim().split(/\s+/),n=parseInt(t,10);if(!n||!/^(on|off)$/i.test(i||""))return void await a.reply("Gunakan: `/monitorupload <id> on|off`",{parse_mode:"Markdown"});let r=await (0,L.s)(n,e,/^on$/i.test(i));await a.reply(r?`✅ Auto-upload monitor #${n} di-set ke ${/^on$/i.test(i)?"ON ✅":"OFF ❌"}.`:`❌ Monitor #${n} tidak ditemukan.`)}),X.on("message:text",async a=>{let e=a.message.text,t=e.match(J);if(!t){if(e.startsWith("/"))return;await a.reply("Kirim link video YouTube, Facebook, TikTok, atau Instagram untuk mulai! 🎬\n\nGunakan /help untuk panduan lengkap.",{reply_markup:new i.InlineKeyboard().text("📚 Panduan","help").text("🔗 Hubungkan YouTube","connect")});return}await Q(a,t[0])}),X.callbackQuery("help",async a=>{await a.answerCallbackQuery(),await a.reply(c.Z.help,{parse_mode:"Markdown"})}),X.callbackQuery("connect",async a=>{await a.answerCallbackQuery(),await H(a)}),X.callbackQuery("settings",async a=>{await a.answerCallbackQuery(),await W(a)}),X.callbackQuery("history",async a=>{await a.answerCallbackQuery(),await z(a)}),X.callbackQuery(/^set_clips_(\d+)$/,async a=>{let e=a.from.id.toString(),t=parseInt(a.match[1]);if(t<1||t>10)return void await a.answerCallbackQuery("❌ Nilai tidak valid (1-10)");await a.answerCallbackQuery(`✅ Maksimal klip diset ke ${t}`),await n.f.update(r.Y).set({maxClips:t,updatedAt:new Date}).where((0,o.u)(r.Y.telegramUserId,e));let i=(0,h.c)();await a.editMessageText(`✅ Setting akun: Maksimal *${t} klip* per video.

💡 Catatan: env var \`MAX_CLIPS=${i}\` selalu override setting ini.`,{parse_mode:"Markdown"})}),X.callbackQuery(/^set_duration_(\d+)$/,async a=>{let e=a.from.id.toString(),t=parseInt(a.match[1],10);if(!(0,h.h)(t))return void await a.answerCallbackQuery(`❌ Nilai tidak valid (pilih: ${h.r.join(", ")})`);let{min:i,max:l}=(0,h.D)(t);await a.answerCallbackQuery(`✅ Durasi klip diset ke ${t} detik`),await n.f.update(r.Y).set({clipDuration:t,minDuration:i,maxDuration:l,updatedAt:new Date}).where((0,o.u)(r.Y.telegramUserId,e));let s=(0,h.o)();await a.editMessageText(`✅ Setting akun: Durasi klip *${t} detik* per Shorts.

💡 Catatan: env var \`CLIP_DURATION=${s}\` dipakai sebagai default untuk user baru.`,{parse_mode:"Markdown"})}),X.callbackQuery(/^set_privacy_(private|unlisted|public)$/,async a=>{let e=a.from.id.toString(),t=a.match[1];await a.answerCallbackQuery(`✅ Privacy diset ke ${t}`),await n.f.update(r.Y).set({defaultPrivacy:t,updatedAt:new Date}).where((0,o.u)(r.Y.telegramUserId,e)),await a.editMessageText(`✅ Privacy video diset ke: *${t}*`,{parse_mode:"Markdown"})}),X.callbackQuery(/^retry_job_(.+)$/,async a=>{let e=a.match[1];(await a.answerCallbackQuery("🔄 Mencoba ulang..."),(await n.f.select().from(r.V).where((0,o.u)(r.V.jobId,e))).length)?(await n.f.update(r.V).set({status:"queued",errorMessage:null,updatedAt:new Date}).where((0,o.u)(r.V.jobId,e)),await G(a,e,!0)):await a.reply("❌ Job tidak ditemukan.")}),X.callbackQuery(/^process_v_(.+)$/,async a=>{let e=a.match[1];await a.answerCallbackQuery("  Memproses video..."),await a.editMessageText("  Memulai proses... Mohon tunggu!",{parse_mode:"Markdown"}),G(a,e,!0).catch(console.error)}),X.callbackQuery(/^process_o_(.+)$/,async a=>{let e=a.match[1];await a.answerCallbackQuery("  Memproses video..."),await a.editMessageText("  Memulai proses... Mohon tunggu!",{parse_mode:"Markdown"}),G(a,e,!1).catch(console.error)}),X.callbackQuery(/^process_(.+)$/,async a=>{let e=a.match[1];e.startsWith("v_")||e.startsWith("o_")||(await a.answerCallbackQuery("  Memproses video..."),await a.editMessageText("  Memulai proses... Mohon tunggu!",{parse_mode:"Markdown"}),G(a,e,!0).catch(console.error))}),X.catch(a=>{console.error("Bot error:",a),(0,R.reportError)("Bot error",a.error??a,{userId:a.ctx?.from?.id})}),X.callbackQuery(/^publish_now_(.+)$/,async a=>{let e=a.match[1];await a.editMessageReplyMarkup({reply_markup:new i.InlineKeyboard}),await a.reply("🚀 Memulai upload ke YouTube...");try{await (0,m.publishJobClips)(e),await a.reply("✅ Upload selesai! Cek Draft YouTube Studio Anda.")}catch(e){await a.reply("❌ Upload gagal: "+String(e))}}),X.callbackQuery(/^sched_ai_(\d+)_(.+)$/,async a=>{let e=parseInt(a.match[1],10),t=a.match[2],n=a.from.id.toString();await a.answerCallbackQuery("🗓 Menjadwalkan klip..."),await a.editMessageReplyMarkup({reply_markup:new i.InlineKeyboard});let r=new Date(e);await (0,b.d)({jobId:t,telegramUserId:n,telegramChatId:a.chat?.id?.toString()||n,mode:"ai_recommended",scheduledAt:r}),await a.reply(`✅ *Berhasil Dijadwalkan!*

Klip akan di-upload otomatis pada:
🗓 *${(0,b.b)(r)}*`,{parse_mode:"Markdown"})}),a.s(["f",0,X]),t()}catch(a){t(a)}},!1),71601,a=>a.a(async(e,t)=>{try{var i=a.i(33102),n=a.i(33680),r=a.i(30298),o=a.i(57961),l=e([n]);function s(a){return a?a.replace(/([_*`\[])/g,"\\$1"):""}[n]=l.then?(await l)():l;let u=null;a.s(["f",0,class{api;chatId;jobId;title;jobLabel;steps;order;messageId=null;startedAt=Date.now();lastEditAt=0;lastText="";finished=!1;pendingTimer=null;enabled;constructor(a){this.api=a.api,this.chatId=a.chatId,this.jobId=a.jobId,this.title=a.title,this.jobLabel=a.jobLabel,this.enabled=(0,o.K)(),this.order=o.p.map(a=>a.id),this.steps=new Map(o.p.map(a=>[a.id,{...a,status:"pending",detail:void 0,percent:void 0}]))}isEnabled(){return this.enabled}getMessageId(){return this.messageId}async start(){let a,e=this.enabled?this.render():"⏳ *Memproses...*";try{a=await this.api.sendMessage(this.chatId,e,{parse_mode:"Markdown"})}catch(t){if((t instanceof Error?t.message:String(t)).includes("can't parse entities")){let t=e.replace(/[*_`\\]/g,"");a=await this.api.sendMessage(this.chatId,t)}else throw t}return this.messageId=a.message_id,this.lastText=e,this.messageId}render(a){let e=[...this.steps.values()].map(a=>({...a,label:s(a.label),detail:a.detail?s(a.detail):void 0}));return(0,o.f)({title:s(this.title),jobLabel:this.jobLabel?s(this.jobLabel):void 0,steps:e,startedAt:this.startedAt,footerNote:a?s(a):void 0})}async safeEditMessage(a,e){if(!this.messageId)return;let t=a.length>3900?a.slice(0,3900)+"\n\n... _(pesan dipotong)_":a;try{await this.api.editMessageText(this.chatId,this.messageId,t,{parse_mode:"Markdown",...e})}catch(i){let a=i instanceof Error?i.message:String(i);if(a.includes("message is not modified"))return;if(a.includes("can't parse entities"))try{let a=t.replace(/[*_`\\]/g,"");await this.api.editMessageText(this.chatId,this.messageId,a,{...e});return}catch(a){console.warn("[progress-tracker] gagal fallback edit pesan:",a);return}console.warn("[progress-tracker] gagal edit pesan:",a)}}async persist(a){try{await (!u&&(u=(async()=>{await n.f.execute(i.B`
        CREATE TABLE IF NOT EXISTS job_progress_events (
          id serial PRIMARY KEY,
          job_id text NOT NULL,
          step_id text NOT NULL,
          step_label text NOT NULL,
          state text NOT NULL,
          message text,
          percent integer,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `)})().catch(a=>{throw u=null,a})),u),await n.f.insert(r.X).values({jobId:this.jobId,stepId:a.id,stepLabel:a.label,state:a.status,message:a.detail||null,percent:"number"==typeof a.percent?Math.round(a.percent):null})}catch(a){console.error("[progress-tracker] gagal menyimpan event:",a)}}async update(a,e={}){if(this.finished)return;let t=this.steps.get(a);t||(t={id:a,label:e.detail||a,icon:"🔹",status:"pending"},this.steps.set(a,t),this.order.push(a));let i=this.order.indexOf(a);if(i>=0)for(let a=0;a<i;a++){let e=this.steps.get(this.order[a]);e&&"done"!==e.status&&"error"!==e.status&&(e.status="done")}t.status=e.status||"active",e.detail&&(t.detail=e.detail),"number"==typeof e.percent&&(t.percent=Math.max(0,Math.min(100,Math.round(e.percent)))),await this.persist(t),await this.scheduleFlush()}async fail(a){if(this.finished)return;let e=[...this.steps.values()].find(a=>"active"===a.status)||[...this.steps.values()].find(a=>"pending"===a.status);e&&(e.status="error",e.detail=a,await this.persist(e)),await this.scheduleFlush()}async scheduleFlush(){if(!this.enabled)return;let a=Date.now(),e=(0,o.h)(),t=a-this.lastEditAt;if(t<e){this.pendingTimer&&clearTimeout(this.pendingTimer),this.pendingTimer=setTimeout(()=>{this.flush().catch(()=>{})},e-t);return}await this.flush()}async flush(a){if(!this.messageId)return;this.pendingTimer&&(clearTimeout(this.pendingTimer),this.pendingTimer=null);let e=a??this.render();e!==this.lastText&&(this.lastEditAt=Date.now(),this.lastText=e,await this.safeEditMessage(e))}async finishSuccess(a,e){if(this.finished)return;for(let a of this.steps.values())"error"!==a.status&&(a.status="done");if(this.finished=!0,!this.enabled||!this.messageId)return;let t=this.render(a);this.lastEditAt=Date.now(),this.lastText=t,await this.safeEditMessage(t,e)}async finishError(a,e){if(this.finished){this.messageId&&await this.safeEditMessage(this.render(`❌ ${a}`),e);return}let t=[...this.steps.values()].find(a=>"active"===a.status)||[...this.steps.values()].find(a=>"pending"===a.status);if(t&&(t.status="error",t.detail=a),this.finished=!0,!this.enabled||!this.messageId)return;let i=this.render(`❌ ${a}`);this.lastEditAt=Date.now(),this.lastText=i,await this.safeEditMessage(i,e)}}]),t()}catch(a){t(a)}},!1),82498,a=>a.a(async(e,t)=>{try{var i=a.i(33680),n=a.i(30298),r=a.i(36763),o=a.i(73716),l=a.i(67370),s=e([i]);async function u(a,e){let t=await i.f.select().from(n.Y).where((0,r.u)(n.Y.telegramUserId,a));if(t.length>0)return t[0];let s=(0,o.o)(),{min:u,max:d}=(0,o.D)(s);return(await i.f.insert(n.Y).values({telegramUserId:a,maxClips:(0,o.c)(),clipDuration:s,minDuration:u,maxDuration:d,defaultPrivacy:"private",language:"id",nichePrompt:(0,l.J)((0,l.E)())}).returning())[0]}async function d(a,e){await u(a);let t=(0,l.J)(e);return await m(a,{nichePrompt:t}),t}async function c(a){await m(a,{nichePrompt:null})}async function m(a,e){await i.f.update(n.Y).set({...e,updatedAt:new Date}).where((0,r.u)(n.Y.telegramUserId,a))}[i]=s.then?(await s)():s,a.s(["O",0,c,"P",0,d]),t()}catch(a){t(a)}},!1),98466,a=>{var e=a.i(80182),t=a.i(92330),i=a.i(41167),n=a.i(39272),r=a.i(57676),o=a.i(48558);a.s(["f",0,function(a){return new e.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,process.env.GOOGLE_REDIRECT_URI).generateAuthUrl({access_type:"offline",scope:Array.from(new Set(["https://www.googleapis.com/auth/youtube.upload",...(0,t.v)()?["https://www.googleapis.com/auth/youtube.readonly"]:[],...(0,i.l)()?[i.N]:[],...(0,n.b)()?[n.T]:[],...(0,r.B)()?[r.D]:[],...(0,o.S)()?[o.E]:[]])),state:a,prompt:"consent"})}])}]})();

//# sourceMappingURL=_1qsyofi0yozo9._.js.map