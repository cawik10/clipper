(()=>{"use strict";module.exports=[53878,a=>{let b=new Uint8Array(16),c=[];for(let a=0;a<256;++a)c.push((a+256).toString(16).slice(1));a.s(["f",0,function(a,d,e){return d||a||!crypto.randomUUID?function(a,d,e){let f=(a=a||{}).random??a.rng?.()??crypto.getRandomValues(b);if(f.length<16)throw Error("Random bytes length must be >= 16");if(f[6]=15&f[6]|64,f[8]=63&f[8]|128,d){if((e=e||0)<0||e+16>d.length)throw RangeError(`UUID byte range ${e}:${e+15} is out of buffer bounds`);for(let a=0;a<16;++a)d[e+a]=f[a];return d}return function(a,b=0){return(c[a[b+0]]+c[a[b+1]]+c[a[b+2]]+c[a[b+3]]+"-"+c[a[b+4]]+c[a[b+5]]+"-"+c[a[b+6]]+c[a[b+7]]+"-"+c[a[b+8]]+c[a[b+9]]+"-"+c[a[b+10]]+c[a[b+11]]+c[a[b+12]]+c[a[b+13]]+c[a[b+14]]+c[a[b+15]]).toLowerCase()}(f)}(a,d,e):crypto.randomUUID()}],53878)},74351,a=>a.a(async(b,c)=>{try{var d=a.i(51674),e=a.i(94758),f=a.i(84030),g=b([e]);async function h(a){return(await e.f.execute(a)).rows}[e]=g.then?(await g)():g;let B=a=>{let b=Number(a);return Number.isFinite(b)?b:0},C=null;function i(){return C||(C=(async()=>{await e.f.execute(d.B`
        CREATE TABLE IF NOT EXISTS admin_users (
          telegram_user_id text PRIMARY KEY,
          chat_id text,
          username text,
          first_name text,
          last_name text,
          is_banned boolean NOT NULL DEFAULT false,
          ban_reason text,
          banned_at timestamp,
          banned_by text,
          quota_override integer,
          first_seen timestamp NOT NULL DEFAULT now(),
          last_seen timestamp NOT NULL DEFAULT now()
        )
      `),await e.f.execute(d.B`
        CREATE TABLE IF NOT EXISTS admin_broadcasts (
          id serial PRIMARY KEY,
          admin_id text NOT NULL,
          message text NOT NULL,
          total integer NOT NULL DEFAULT 0,
          sent integer NOT NULL DEFAULT 0,
          failed integer NOT NULL DEFAULT 0,
          created_at timestamp NOT NULL DEFAULT now(),
          finished_at timestamp
        )
      `)})().catch(a=>{throw C=null,a})),C}function j(){let a=d.B.raw(`'${(0,f.M)()}'`),b=(0,f.p)();return d.B`(date_trunc(${a}, now() AT TIME ZONE ${b}::text) AT TIME ZONE ${b}::text)`}let D=d.B`
  SELECT telegram_user_id AS id FROM user_settings
  UNION SELECT telegram_user_id FROM clip_jobs
  UNION SELECT telegram_user_id FROM admin_users
`;async function k(a,b){await i(),await e.f.execute(d.B`
    INSERT INTO admin_users (telegram_user_id, chat_id, username, first_name, last_name)
    VALUES (${String(a.id)}, ${void 0!==b?String(b):null},
            ${a.username??null}, ${a.first_name??null}, ${a.last_name??null})
    ON CONFLICT (telegram_user_id) DO UPDATE SET
      chat_id = COALESCE(EXCLUDED.chat_id, admin_users.chat_id),
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      last_seen = now()
  `)}async function l(a){await i();let b=(await h(d.B`
    SELECT is_banned, ban_reason, quota_override FROM admin_users WHERE telegram_user_id = ${a}
  `))[0];return{banned:!!b?.is_banned,banReason:b?.ban_reason??null,quotaOverride:b?.quota_override===null||b?.quota_override===void 0?null:B(b.quota_override)}}async function m(a,b,c,f){await i(),await e.f.execute(d.B`
    INSERT INTO admin_users (telegram_user_id, is_banned, ban_reason, banned_at, banned_by)
    VALUES (${a}, ${b}, ${b?f??null:null}, ${b?d.B`now()`:null}, ${b?c:null})
    ON CONFLICT (telegram_user_id) DO UPDATE SET
      is_banned = EXCLUDED.is_banned,
      ban_reason = EXCLUDED.ban_reason,
      banned_at = EXCLUDED.banned_at,
      banned_by = EXCLUDED.banned_by
  `)}async function n(a,b){await i(),await e.f.execute(d.B`
    INSERT INTO admin_users (telegram_user_id, quota_override)
    VALUES (${a}, ${b})
    ON CONFLICT (telegram_user_id) DO UPDATE SET quota_override = EXCLUDED.quota_override
  `)}function o(a){return null===a?(0,f.x)():a}async function p(a){let b=await h(d.B`
    SELECT count(*)::int AS c FROM clip_jobs
    WHERE telegram_user_id = ${a}
      AND status <> 'error'
      AND created_at >= ${j()}
  `);return B(b[0]?.c)}async function q(a,b={}){let c=!1!==b.checkQuota;try{if((0,f.N)(a))return{allowed:!0,used:0,limit:0};let b=await l(a);if(b.banned)return{allowed:!1,reason:"banned",banReason:b.banReason,used:0,limit:0};let d=o(b.quotaOverride);if(!c||d<=0)return{allowed:!0,used:0,limit:d};let e=await p(a);if(e>=d)return{allowed:!1,reason:"quota",used:e,limit:d};return{allowed:!0,used:e,limit:d}}catch(a){return console.error("[admin] checkUserAccess gagal (fail-open):",a),{allowed:!0,used:0,limit:0}}}function r(a){return{id:String(a.id),username:a.username??null,firstName:a.first_name??null,lastName:a.last_name??null,banned:!!a.is_banned,banReason:a.ban_reason??null,quotaOverride:null===a.quota_override||void 0===a.quota_override?null:B(a.quota_override),lastSeen:a.last_seen?new Date(a.last_seen):null,firstSeen:a.first_seen?new Date(a.first_seen):null,totalJobs:B(a.total_jobs),usedInPeriod:B(a.used),youtubeConnected:!!a.yt}}let E=d.B`
  SELECT i.id, au.username, au.first_name, au.last_name, au.is_banned, au.ban_reason,
         au.quota_override, au.last_seen, au.first_seen,
         (SELECT count(*) FROM clip_jobs j WHERE j.telegram_user_id = i.id) AS total_jobs,
         (SELECT count(*) FROM clip_jobs j WHERE j.telegram_user_id = i.id AND j.status <> 'error'
            AND j.created_at >= ${j()}) AS used,
         EXISTS (SELECT 1 FROM youtube_tokens y WHERE y.telegram_user_id = i.id) AS yt
  FROM (${D}) i
  LEFT JOIN admin_users au ON au.telegram_user_id = i.id
`;async function s(a,b){await i();let c=Math.max(0,a)*b,[e,f]=await Promise.all([h(d.B`
      ${E}
      ORDER BY COALESCE(au.last_seen, '1970-01-01'::timestamp) DESC, i.id
      LIMIT ${b} OFFSET ${c}
    `),h(d.B`SELECT count(*)::int AS c FROM (${D}) t`)]);return{users:e.map(r),total:B(f[0]?.c)}}async function t(a){await i();let b=await h(d.B`${E} WHERE i.id = ${a}`);return b[0]?r(b[0]):null}async function u(a){let b=a.trim();if(/^\d+$/.test(b))return b;if(b.startsWith("@")&&b.length>1){await i();let a=await h(d.B`
      SELECT telegram_user_id FROM admin_users WHERE lower(username) = ${b.slice(1).toLowerCase()} LIMIT 1
    `);return a[0]?String(a[0].telegram_user_id):null}return null}function v(a){return a.username?`@${a.username}`:[a.firstName,a.lastName].filter(Boolean).join(" ")||a.id}async function w(a,b){try{return await a}catch(a){return console.error("[admin] query statistik gagal:",a),b}}async function x(){await i();let a=async a=>B((await h(a))[0]?.c),[b,c,e,f,g,k,l,m,n,o,p,q,r,s,t]=await Promise.all([w(a(d.B`SELECT count(*)::int AS c FROM (${D}) t`),0),w(a(d.B`SELECT count(*)::int AS c FROM user_settings WHERE created_at > now() - interval '24 hours'`),0),w(a(d.B`SELECT count(*)::int AS c FROM user_settings WHERE created_at > now() - interval '7 days'`),0),w(a(d.B`
        SELECT count(*)::int AS c FROM (
          SELECT telegram_user_id FROM clip_jobs WHERE created_at > now() - interval '24 hours'
          UNION SELECT telegram_user_id FROM admin_users WHERE last_seen > now() - interval '24 hours'
        ) t`),0),w(a(d.B`SELECT count(*)::int AS c FROM admin_users WHERE is_banned`),0),w(a(d.B`SELECT count(*)::int AS c FROM youtube_tokens`),0),w(a(d.B`SELECT count(*)::int AS c FROM clip_jobs`),0),w(a(d.B`SELECT count(*)::int AS c FROM clip_jobs WHERE created_at > now() - interval '24 hours'`),0),w(a(d.B`SELECT count(*)::int AS c FROM clip_jobs WHERE created_at >= ${j()}`),0),w(a(d.B`SELECT count(*)::int AS c FROM clip_jobs WHERE status = 'error' AND updated_at > now() - interval '24 hours'`),0),w(a(d.B`SELECT COALESCE(sum(jsonb_array_length(clips)), 0)::int AS c FROM clip_jobs WHERE jsonb_typeof(clips) = 'array'`),0),w(a(d.B`SELECT count(*)::int AS c FROM uploaded_videos WHERE upload_status = 'done'`),0),w(h(d.B`SELECT status, count(*)::int AS c FROM clip_jobs GROUP BY status ORDER BY c DESC`),[]),w(h(d.B`
        SELECT j.telegram_user_id AS id, au.username, au.first_name, count(*)::int AS c
        FROM clip_jobs j LEFT JOIN admin_users au ON au.telegram_user_id = j.telegram_user_id
        WHERE j.created_at >= ${j()}
        GROUP BY j.telegram_user_id, au.username, au.first_name
        ORDER BY c DESC LIMIT 5`),[]),w(h(d.B`
        SELECT job_id, error_message, updated_at FROM clip_jobs
        WHERE status = 'error' ORDER BY updated_at DESC LIMIT 3`),[])]);return{totalUsers:b,newUsers24h:c,newUsers7d:e,active24h:f,bannedUsers:g,youtubeConnected:k,jobsTotal:l,jobs24h:m,jobsPeriod:n,jobsByStatus:r.map(a=>({status:String(a.status),count:B(a.c)})),errors24h:o,totalClips:p,uploadsDone:q,topUsers:s.map(a=>({id:String(a.id),label:v({id:String(a.id),username:a.username??null,firstName:a.first_name??null,lastName:null}),jobs:B(a.c)})),errorSamples:t.map(a=>({jobId:String(a.job_id),message:String(a.error_message??""),at:new Date(a.updated_at)}))}}async function y(){await i();let a=(0,f.L)().includeBanned;return(await h(d.B`
    SELECT i.id AS user_id, COALESCE(au.chat_id, i.id) AS chat_id
    FROM (${D}) i
    LEFT JOIN admin_users au ON au.telegram_user_id = i.id
    WHERE ${a?d.B`true`:d.B`COALESCE(au.is_banned, false) = false`}
      AND i.id ~ '^[0-9]+$'
  `)).map(a=>({userId:String(a.user_id),chatId:String(a.chat_id)}))}async function z(a,b,c){await i();let e=await h(d.B`
    INSERT INTO admin_broadcasts (admin_id, message, total) VALUES (${a}, ${b}, ${c})
    RETURNING id
  `);return B(e[0]?.id)}async function A(a,b,c){await e.f.execute(d.B`
    UPDATE admin_broadcasts SET sent = ${b}, failed = ${c}, finished_at = now() WHERE id = ${a}
  `)}a.s(["R",0,q,"E",0,z,"W",0,v,"n",0,o,"_",0,i,"N",0,A,"Q",0,y,"x",0,x,"g",0,t,"u",0,s,"G",0,u,"s",0,m,"S",0,n,"K",0,k]),c()}catch(a){c(a)}},!1),56294,a=>a.a(async(b,c)=>{try{var d=a.i(77136),e=a.i(54799),f=a.i(84030),g=a.i(74351),h=a.i(25622),i=b([g]);[g]=i.then?(await i)():i;let C=`🛠️ <b>Admin Panel</b>

/admin — panel utama (tombol)
/admin stats — statistik global
/admin users [halaman] — daftar user
/admin user &lt;id|@username&gt; — detail user
/admin ban &lt;id|@username&gt; [alasan]
/admin unban &lt;id|@username&gt;
/admin quota &lt;id|@username&gt; &lt;angka|default|unlimited&gt;
/broadcast &lt;pesan&gt; — kirim ke semua user`;function j(a){if(!a||isNaN(a.getTime()))return"-";try{return a.toLocaleString("id-ID",{timeZone:(0,f.p)(),hour12:!1,dateStyle:"short",timeStyle:"short"})}catch{return a.toISOString()}}function k(a){if(!a||isNaN(a.getTime()))return"-";let b=Math.max(0,Math.floor((Date.now()-a.getTime())/1e3));return b<60?"baru saja":b<3600?`${Math.floor(b/60)} mnt lalu`:b<86400?`${Math.floor(b/3600)} jam lalu`:`${Math.floor(b/86400)} hari lalu`}let D={done:"✅",error:"❌",queued:"⏳",clips_ready:"🎞",skipped:"⏭"};async function l(){let a=await (0,g.x)();return{text:`🛠️ <b>Admin Panel</b>

👥 User: <b>${a.totalUsers}</b> (aktif 24 jam: ${a.active24h})
🎬 Job ${(0,f.W)()} ini: <b>${a.jobsPeriod}</b> • 24 jam: ${a.jobs24h}
❌ Error 24 jam: <b>${a.errors24h}</b>
🚫 User diban: <b>${a.bannedUsers}</b>

Pilih menu di bawah, atau ketik /admin help untuk daftar perintah.`,kb:new d.InlineKeyboard().text("📊 Statistik","adm:stats").text("👥 Daftar User","adm:users:0").row().text("📢 Broadcast","adm:bc").text("⚙️ Konfigurasi","adm:cfg").row().text("🔄 Refresh","adm:main")}}async function m(){var a;let b,c,e,i=await (0,g.x)(),j=i.jobsByStatus.length?i.jobsByStatus.map(a=>`${D[a.status]??"⚙️"} ${(0,h.F)(a.status)} ${a.count}`).join(" • "):"-",l=i.topUsers.length?i.topUsers.map((a,b)=>`${b+1}. ${(0,h.F)(a.label)} — ${a.jobs} job`).join("\n"):"-",m=i.errorSamples.length?i.errorSamples.map(a=>`• <code>${(0,h.F)(a.jobId.slice(0,8))}</code> ${(0,h.F)(k(a.at))}: ${(0,h.F)(a.message.slice(0,80))}`).join("\n"):"-",n=process.memoryUsage();return{text:`📊 <b>Statistik Global</b>

<b>👥 User</b>
Total: <b>${i.totalUsers}</b> • Aktif 24 jam: <b>${i.active24h}</b>
Baru: ${i.newUsers24h} (24 jam) • ${i.newUsers7d} (7 hari)
Diban: ${i.bannedUsers} • YouTube terhubung: ${i.youtubeConnected}

<b>🎬 Job</b>
Total: <b>${i.jobsTotal}</b> • 24 jam: ${i.jobs24h} • ${(0,f.W)()} ini: ${i.jobsPeriod}
Status: ${j}
Error 24 jam: <b>${i.errors24h}</b>

<b>✂️ Hasil</b>
Klip dibuat: <b>${i.totalClips}</b> • Upload YouTube sukses: <b>${i.uploadsDone}</b>

<b>🏆 Top user ${(0,f.W)()} ini</b>
${l}

<b>🧾 Error job terbaru</b>
${m}

<b>🖥 Server</b>
Uptime: ${b=Math.floor((a=process.uptime())/86400),c=Math.floor(a%86400/3600),e=Math.floor(a%3600/60),`${b?`${b}h `:""}${c}j ${e}m`} • RAM: ${Math.round(n.rss/1048576)} MB`,kb:new d.InlineKeyboard().text("🔄 Refresh","adm:stats").text("⬅️ Menu","adm:main")}}async function n(a){let b=(0,f.R)(),c=a=>Math.max(1,Math.ceil(a/b)),{users:e,total:i}=await (0,g.u)(a,b);a>0&&!e.length&&(a=c(i)-1,{users:e,total:i}=await (0,g.u)(a,b));let j=e.map((c,d)=>{let e,f,i=`${c.banned?" 🚫":""}${c.youtubeConnected?" ▶️":""}`;return`${a*b+d+1}. <b>${(0,h.F)((0,g.W)(c))}</b> <code>${c.id}</code>${i}
    📦 ${c.totalJobs} job • kuota ${(0,h.F)((e=(0,g.n)(c.quotaOverride),f=null!==c.quotaOverride?" (custom)":"",`${c.usedInPeriod}/${e>0?e:"∞"}${f}`))} • ${(0,h.F)(k(c.lastSeen))}`}),l=`👥 <b>Daftar User</b> (hal. ${a+1}/${c(i)} • total ${i})
🚫 diban • ▶️ YouTube terhubung

`+(j.join("\n")||"Belum ada user."),m=new d.InlineKeyboard;return e.forEach((b,c)=>{let d=(0,g.W)(b).slice(0,18);m.text(`${b.banned?"🚫":"👤"} ${d}`,`adm:u:${b.id}:${a}`),c%2==1&&m.row()}),e.length%2==1&&m.row(),a>0&&m.text("◀️",`adm:users:${a-1}`),m.text("⬅️ Menu","adm:main"),(a+1)*b<i&&m.text("▶️",`adm:users:${a+1}`),{text:l,kb:m}}async function o(a,b){let c=await (0,g.g)(a);if(!c)return{text:`❌ User <code>${(0,h.F)(a)}</code> tidak ditemukan.`,kb:new d.InlineKeyboard().text("⬅️ Daftar",`adm:users:${b}`)};let e=(0,g.n)(c.quotaOverride),i=`👤 <b>${(0,h.F)((0,g.W)(c))}</b>
ID: <code>${c.id}</code>${(0,f.N)(c.id)?" (admin)":""}
Status: ${c.banned?`🚫 <b>DIBAN</b>${c.banReason?` — ${(0,h.F)(c.banReason)}`:""}`:"✅ aktif"}
YouTube: ${c.youtubeConnected?"✅ terhubung":"❌ belum"}

📦 Total job: <b>${c.totalJobs}</b>
🎟 Kuota per ${(0,f.W)()}: <b>${c.usedInPeriod}/${e>0?e:"∞"}</b>${null!==c.quotaOverride?" (custom)":` (default${(0,f.x)()>0?"":": tanpa batas"})`}
🕒 Pertama terlihat: ${(0,h.F)(j(c.firstSeen))}
🕒 Terakhir aktif: ${(0,h.F)(j(c.lastSeen))} (${(0,h.F)(k(c.lastSeen))})`,l=new d.InlineKeyboard;return c.banned?l.text("✅ Unban",`adm:unban:${c.id}:${b}`):(0,f.N)(c.id)||l.text("🚫 Ban",`adm:ban:${c.id}:${b}`),l.row().text("🎟 3",`adm:q:${c.id}:3:${b}`).text("5",`adm:q:${c.id}:5:${b}`).text("10",`adm:q:${c.id}:10:${b}`).text("25",`adm:q:${c.id}:25:${b}`).text("50",`adm:q:${c.id}:50:${b}`).row().text("♾ Unlimited",`adm:q:${c.id}:u:${b}`).text("↩️ Default",`adm:q:${c.id}:d:${b}`).row().text("🔄 Refresh",`adm:u:${c.id}:${b}`).text("⬅️ Daftar",`adm:users:${b}`),{text:i,kb:l}}function p(){let a=(0,f.L)();return{text:`📢 <b>Broadcast</b>

Kirim pesan ke semua user:
<code>/broadcast Halo semua! Ada fitur baru 🎉</code>

${a.confirm?"Kamu akan diminta konfirmasi sebelum pesan dikirim.":"Pesan langsung dikirim tanpa konfirmasi."}
User yang diban ${a.includeBanned?"ikut":"tidak"} menerima broadcast.`,kb:new d.InlineKeyboard().text("⬅️ Menu","adm:main")}}async function q(a,b){let c={parse_mode:"HTML",reply_markup:b.kb,link_preview_options:{is_disabled:!0}};if(a.callbackQuery)try{await a.editMessageText(b.text,c);return}catch(a){if(a instanceof d.GrammyError&&/not modified/i.test(a.description))return}await a.reply(b.text,c)}async function r(a,b){await a.reply(b,{parse_mode:"HTML",link_preview_options:{is_disabled:!0}})}async function s(a){return!!((0,f.e)()&&(0,f.N)(a.from?.id))||(a.callbackQuery?await a.answerCallbackQuery({text:f.P.notAdmin,show_alert:!0}).catch(()=>{}):await a.reply(f.P.notAdmin).catch(()=>{}),!1)}async function t(a,b,c,d){if(c&&(0,f.N)(b))return"❌ Tidak bisa memblokir sesama admin.";if(await (0,g.s)(b,c,String(a.from?.id),d),(0,f.F)()){let e=c?d?f.P.bannedWithReason(d):f.P.banned:f.P.unbanned;await a.api.sendMessage(b,e).catch(()=>{})}return c?`🚫 User <code>${b}</code> diblokir.`:`✅ User <code>${b}</code> dibuka blokirnya.`}function u(a){let b=a.trim().toLowerCase();if(["default","reset","d"].includes(b))return null;if(["unlimited","inf","∞","u","0"].includes(b))return 0;if(/^\d+$/.test(b)){let a=parseInt(b,10);return a>0&&a<=1e6?a:void 0}}function v(a,b){let c=null===b?`default (${(0,f.x)()>0?(0,f.x)():"tanpa batas"})`:0===b?"tanpa batas":`${b} per ${(0,f.W)()}`;return`🎟 Kuota user <code>${a}</code> diatur ke <b>${c}</b>.`}let E=new Map,F=!1;function w(a){let b=(0,f.L)().header;return b?`${b}

${a}`:a}let G=a=>new Promise(b=>setTimeout(b,a));async function x(a,b,c){for(let e=0;e<2;e++)try{return await a.sendMessage(b,c,{link_preview_options:{is_disabled:!0}}),!0}catch(a){if(a instanceof d.GrammyError&&429===a.error_code&&0===e){let b=Number(a.parameters?.retry_after??3);await G((b+1)*1e3);continue}break}return!1}async function y(a,b,c,d){F=!0;try{let e=(0,f.L)(),h=await (0,g.Q)(),i=await (0,g.E)(c,d,h.length),j=w(d),k=0,l=0;for(let b of h)await x(a,b.chatId,j)?k++:l++,e.delayMs&&await G(e.delayMs);await (0,g.N)(i,k,l).catch(()=>{}),await a.sendMessage(b,`📢 <b>Broadcast selesai</b>

✅ Terkirim: <b>${k}</b>
❌ Gagal: <b>${l}</b> (biasanya user yang memblokir bot)
👥 Total penerima: ${h.length}`,{parse_mode:"HTML"}).catch(()=>{})}catch(d){console.error("[admin] broadcast gagal:",d),await (0,h.m)("Broadcast",d,{userId:c}),await a.sendMessage(b,"❌ Broadcast gagal, cek log server.").catch(()=>{})}finally{F=!1}}async function z(a,b){if(F)return void await a.reply("⏳ Masih ada broadcast yang berjalan. Tunggu sampai selesai.");let c=await (0,g.Q)();await a.reply(`🚀 Broadcast dimulai ke ${c.length} user... Laporan akan dikirim setelah selesai.`),y(a.api,a.chat.id,String(a.from.id),b)}async function A(a,b){let c=await (0,g.R)(b);return!!c.allowed||("banned"===c.reason?await a.reply(c.banReason?f.P.bannedWithReason(c.banReason):f.P.banned).catch(()=>{}):await a.reply(f.P.quotaExceeded(c.used,c.limit,(0,f.W)())).catch(()=>{}),!1)}async function B(a,b,c){await a.reply(b,{parse_mode:"HTML",reply_markup:c,link_preview_options:{is_disabled:!0}})}a.s(["N",0,A,"Q",0,function(a){a.command("admin",async a=>{if(!await s(a))return;let[b="",...c]=String(a.match||"").trim().split(/\s+/).filter(Boolean);try{switch(b.toLowerCase()){case"":case"panel":return q(a,await l());case"help":default:return void await r(a,C);case"stats":return q(a,await m());case"users":{let b=Math.max(0,(parseInt(c[0]??"1",10)||1)-1);return q(a,await n(b))}case"user":case"ban":case"unban":case"quota":{if(!c[0])return void await r(a,`Format salah.

${C}`);let d=await (0,g.G)(c[0]);if(!d)return void await r(a,`❌ User <code>${(0,h.F)(c[0])}</code> tidak ditemukan. Pakai ID angka atau @username yang pernah chat dengan bot.`);if("user"===b)return q(a,await o(d,0));if("ban"===b)return void await r(a,await t(a,d,!0,c.slice(1).join(" ")||void 0));if("unban"===b)return void await r(a,await t(a,d,!1));let e=u(c[1]??"");if(void 0===e)return void await r(a,"Format: <code>/admin quota &lt;id|@username&gt; &lt;angka|default|unlimited&gt;</code>");return await (0,g.S)(d,e),void await r(a,v(d,e))}}}catch(b){console.error("[admin] /admin gagal:",b),await (0,h.m)("/admin",b,{userId:a.from?.id}),await a.reply("❌ Terjadi kesalahan saat memproses perintah admin.").catch(()=>{})}}),a.command("broadcast",async a=>{if(!await s(a))return;let b=String(a.match||"").trim(),c=(0,f.L)();if(!b)return q(a,p());if(b.length>c.maxChars)return void await a.reply(`❌ Pesan terlalu panjang (${b.length}/${c.maxChars} karakter).`);try{if(!c.confirm)return await z(a,b);for(let[a,b]of E)Date.now()-b.at>6e5&&E.delete(a);let f=(0,e.randomBytes)(4).toString("hex");E.set(f,{adminId:String(a.from.id),text:b,at:Date.now()});let i=await (0,g.Q)();await B(a,`📢 <b>Konfirmasi Broadcast</b>

Penerima: <b>${i.length}</b> user

<b>Pratinjau:</b>
──────────
${(0,h.F)(w(b))}
──────────

Kirim sekarang?`,new d.InlineKeyboard().text("✅ Kirim",`adm:bcs:${f}`).text("❌ Batal",`adm:bcc:${f}`))}catch(b){console.error("[admin] /broadcast gagal:",b),await (0,h.m)("/broadcast",b,{userId:a.from?.id}),await a.reply("❌ Gagal menyiapkan broadcast.").catch(()=>{})}}),a.callbackQuery(/^adm:/,async a=>{if(!await s(a))return;let b=a.callbackQuery.data.split(":"),c=b[1];try{switch(c){case"main":return await a.answerCallbackQuery(),q(a,await l());case"stats":return await a.answerCallbackQuery(),q(a,await m());case"cfg":let e,i,j;return await a.answerCallbackQuery(),q(a,(e=(0,f.K)(),i=(0,f.L)(),j=(0,f.x)(),{text:`⚙️ <b>Konfigurasi Admin</b>
<i>Ubah lewat Railway Variables</i>

👮 Admin: <code>${(0,h.F)((0,f.Q)().join(", "))}</code> (<code>ADMIN_TELEGRAM_IDS</code>)

<b>🎟 Kuota</b>
Default: <b>${j>0?j:"tanpa batas"}</b> (<code>ADMIN_DEFAULT_QUOTA</code>)
Periode: <b>${(0,f.M)()}</b> • zona waktu ${(0,h.F)((0,f.p)())}
Admin bebas kuota: ${(0,f.V)()?"✅":"❌"}

<b>🚨 Notifikasi error</b>
Status: ${e.enabled?"✅ aktif":"❌ nonaktif"} (<code>ADMIN_ERROR_NOTIFY</code>)
Dedupe: ${e.dedupeSeconds} dtk • maks ${e.maxPerMinute}/menit

<b>📢 Broadcast</b>
Konfirmasi: ${i.confirm?"✅":"❌"} • jeda ${i.delayMs} ms • sertakan user diban: ${i.includeBanned?"✅":"❌"}`,kb:new d.InlineKeyboard().text("⬅️ Menu","adm:main")}));case"bc":return await a.answerCallbackQuery(),q(a,p());case"users":return await a.answerCallbackQuery(),q(a,await n(parseInt(b[2]??"0",10)||0));case"u":return await a.answerCallbackQuery(),q(a,await o(b[2],parseInt(b[3]??"0",10)||0));case"ban":case"unban":{let d=await t(a,b[2],"ban"===c);return await a.answerCallbackQuery({text:d.replace(/<[^>]+>/g,""),show_alert:!1}),q(a,await o(b[2],parseInt(b[3]??"0",10)||0))}case"q":{let c=u(b[3]??"");if(void 0===c)return void await a.answerCallbackQuery({text:"Nilai kuota tidak valid",show_alert:!0});return await (0,g.S)(b[2],c),await a.answerCallbackQuery({text:v(b[2],c).replace(/<[^>]+>/g,"")}),q(a,await o(b[2],parseInt(b[4]??"0",10)||0))}case"bcs":{let c=E.get(b[2]);if(!c||c.adminId!==String(a.from.id)||Date.now()-c.at>6e5)return void await a.answerCallbackQuery({text:"Broadcast kedaluwarsa. Kirim ulang /broadcast.",show_alert:!0});return E.delete(b[2]),await a.answerCallbackQuery({text:"Memulai broadcast..."}),await a.editMessageReplyMarkup({reply_markup:new d.InlineKeyboard}).catch(()=>{}),await z(a,c.text)}case"bcc":E.delete(b[2]),await a.answerCallbackQuery({text:"Dibatalkan"}),await a.editMessageText("❌ Broadcast dibatalkan.").catch(()=>{});return;default:await a.answerCallbackQuery()}}catch(b){console.error("[admin] callback gagal:",b),await (0,h.m)("Admin callback",b,{userId:a.from?.id}),await a.answerCallbackQuery({text:"Terjadi kesalahan",show_alert:!0}).catch(()=>{})}})},"o",0,function(a){a.use(async(a,b)=>{let c=a.from;if(!c||c.is_bot)return b();try{await (0,g.K)(c,a.chat?.type==="private"?a.chat.id:void 0)}catch(a){console.error("[admin] trackUser gagal:",a)}if(!(0,f.N)(c.id)){let b=await (0,g.R)(String(c.id),{checkQuota:!1});if(!b.allowed&&"banned"===b.reason){try{a.callbackQuery?await a.answerCallbackQuery({text:f.P.banned,show_alert:!0}):a.chat?.type==="private"&&await a.reply(b.banReason?f.P.bannedWithReason(b.banReason):f.P.banned)}catch{}return}}return b()})}]),c()}catch(a){c(a)}},!1),93015,a=>a.a(async(b,c)=>{try{var d=a.i(77136),e=a.i(53153),f=a.i(72063),g=a.i(49592),h=a.i(36529),i=a.i(70042),j=a.i(93371),k=b([e,f,g,j]);[e,f,g,j]=k.then?(await k)():k;let p={parse_mode:"HTML",link_preview_options:{is_disabled:!0}};async function l(a){let b=await (0,e.getOrCreateUserState)(a),c=new d.InlineKeyboard().text("🔄 Sync Views","an_sync").text("🧠 Pelajari Sekarang","an_learn").row().text(`📅 Laporan Mingguan: ${b.weeklyReportEnabled?"ON ✅":"OFF ⛔"}`,"an_weekly").row().text(`🤖 Smart Learning: ${b.learningEnabled?"ON ✅":"OFF ⛔"}`,"an_learning");return b.learnedPrompt&&c.row().text("🗑 Reset Hasil Belajar","an_reset"),c}function m(a){let b="learned"===a.status||"pending"===a.status?"🧠":"ℹ️",c=`${b} <b>${(0,f.e)(a.message)}</b>`;return a.prompt&&(c+=`

🎯 <b>Arahan niche baru:</b>
<i>"${(0,f.e)(a.prompt)}"</i>`,a.topNiche&&(c+=`

🏆 Niche terbaik: <b>${(0,f.e)(a.topNiche)}</b>`),a.insights?.length&&(c+=`

💡 <b>Temuan AI:</b>
${a.insights.map(a=>`▫️ ${(0,f.e)(a)}`).join("\n")}`),c+=`

<i>Metode: ${"ai"===a.method?"analisis AI":"heuristik (AI tidak tersedia)"} \xb7 sampel ${a.sampleSize} klip</i>`),c}async function n(a,b){let c=await (0,e.syncUserStats)(b);if(!c.tracked)return"ℹ️ Belum ada klip yang terupload ke YouTube. Proses video dulu & hubungkan YouTube lewat /connect.";let d=`🔄 <b>Sync selesai</b>
• Klip dilacak: ${c.tracked}${c.newClips?` (+${c.newClips} baru)`:""}
• Views terbaca: ${c.updated}`;return c.unreadable&&(d+=`
• Tidak terbaca: ${c.unreadable} (private/draft?)

💡 Kirim /connect lagi untuk memberi izin baca statistik, atau set <code>YOUTUBE_API_KEY</code> di Railway untuk video public/unlisted.`,c.note&&(d+=`
<i>${(0,f.e)(c.note.slice(0,220))}</i>`)),d}async function o(a,b,c,d){let g=a.chat?.id?.toString()??null;await (0,e.getOrCreateUserState)(b,g);let i=null;if(d){let c=await (0,e.getLastSyncAt)(b);(!c||Date.now()-c.getTime()>6e4*Math.min((0,h.W)(),30))&&(i=await a.reply("⏳ Mengambil statistik terbaru dari YouTube..."),await (0,e.syncUserStats)(b).catch(a=>console.warn("[analytics] sync saat /analytics gagal:",a)))}let j=await (0,f.I)(b,{days:c}),k=`

📅 <i>Laporan mingguan otomatis: ${(0,f.e)((0,f.X)())}</i>`;i&&a.chat&&await a.api.deleteMessage(a.chat.id,i.message_id).catch(()=>{}),await a.reply((j+k).slice(0,4e3),{...p,reply_markup:await l(b)})}a.s(["f",0,function(a){a.command("analytics",async a=>{let b=a.from?.id?.toString();if(!b)return;if(!(0,h._)())return void await a.reply("📈 Fitur AI Analytics sedang dinonaktifkan oleh admin (<code>ANALYTICS_ENABLED=false</code>).",p);let[c,...d]=(a.match||"").toString().trim().split(/\s+/),k=(c||"").toLowerCase();await (0,e.getOrCreateUserState)(b,a.chat?.id?.toString()??null);try{if(!k)return await o(a,b,null,!0);if(/^\d+$/.test(k)){let c=Math.min(365,Math.max(1,parseInt(k,10)));return await o(a,b,c,!0)}if("sync"===k)return void await a.reply(await n(a,b),p);if("learn"===k){let c=await a.reply("🧠 AI sedang mempelajari klip suksesmu...");await (0,e.syncUserStats)(b).catch(()=>{});let d=await (0,g.b)(b,{force:!0});a.chat&&await a.api.deleteMessage(a.chat.id,c.message_id).catch(()=>{}),await a.reply(m(d),p);return}if("apply"===k){let c=await (0,g.v)(b);await a.reply(c?`✅ <b>Hasil belajar diterapkan!</b>
<i>"${(0,f.e)(c.prompt)}"</i>`:"ℹ️ Tidak ada hasil belajar yang menunggu persetujuan.",p);return}if("reset"===k){await (0,g.f)(b),await a.reply("↩️ Hasil belajar dihapus. AI kembali memakai DEFAULT_NICHE_PROMPT / niche kustommu.",p);return}if("weekly"===k||"learning"===k){let c=/^(on|aktif|nyala|1|true)$/i.test(d[0]||""),f=/^(off|mati|0|false)$/i.test(d[0]||"");if(!c&&!f)return void await a.reply(`Gunakan: <code>/analytics ${k} on</code> atau <code>/analytics ${k} off</code>`,p);await (0,e.patchUserState)(b,"weekly"===k?{weeklyReportEnabled:c}:{learningEnabled:c}),await a.reply("weekly"===k?`📅 Laporan mingguan otomatis: <b>${c?"ON":"OFF"}</b>`:`🤖 Smart Learning: <b>${c?"ON":"OFF"}</b>`,p);return}if("retitle"===k){if(!(0,i.o)())return void await a.reply("🩺 <b>Auto-Title Doctor</b> sedang nonaktif.\nAdmin bisa menyalakannya dengan <code>ANALYTICS_AUTO_RETITLE_LOW_VIEWS=true</code> di Railway Variables.",p);if("run"===(d[0]||"").toLowerCase()){let c=await a.reply("🩺 Memeriksa klip ber-views rendah...");await (0,e.syncUserStats)(b).catch(()=>{});let d=await (0,j.L)(b,{force:!0});a.chat&&await a.api.deleteMessage(a.chat.id,c.message_id).catch(()=>{}),await a.reply(`🩺 <b>Selesai</b>
• Kandidat: ${d.candidates}
• ${d.dryRun?"Disimulasikan":"Judul diganti"}: ${d.retitled}
• Gagal: ${d.failed}`+(d.skipped?`
<i>${(0,f.e)(d.skipped)}</i>`:"")+(d.errors.length?`
<i>${(0,f.e)(d.errors[0].slice(0,200))}</i>`:""),p);return}let[c,g]=await Promise.all([(0,j.r)(b),(0,j.H)(b,5)]),h=g.map(a=>{let b="success"===a.status?"✅":"dry_run"===a.status?"🧪":"⚠️";return`${b} <a href="https://youtu.be/${a.youtubeVideoId}">${a.youtubeVideoId}</a>: ${(0,f.e)(a.oldTitle.slice(0,40))} → <b>${(0,f.e)((a.newTitle||a.error||"-").slice(0,60))}</b>`});await a.reply("🩺 <b>Auto-Title Doctor</b> — ON ✅"+((0,i.K)()?" (mode simulasi)":"")+`
<i>Aturan: ${(0,f.e)((0,j.c)())}</i>

`+`Diganti: <b>${c.success}</b> \xb7 Simulasi: ${c.dryRun} \xb7 Gagal: ${c.failed}`+(h.length?`

${h.join("\n")}`:"\n\nBelum ada riwayat.")+"\n\n<code>/analytics retitle run</code> — periksa &amp; perbaiki sekarang",p);return}if("views"===k){let c=d[0]||"",f=parseInt((d[1]||"").replace(/[.,_]/g,""),10),g=c.match(/(?:youtu\.be\/|v=|shorts\/)([A-Za-z0-9_-]{11})/)?.[1]??(/^[A-Za-z0-9_-]{11}$/.test(c)?c:void 0);if(!g||isNaN(f)||f<0)return void await a.reply("Format: <code>/analytics views &lt;videoId atau link&gt; &lt;jumlah views&gt;</code>",p);let h=await (0,e.setManualViews)(b,g,f);await a.reply(h?`✅ Views <code>${g}</code> diset ke <b>${f.toLocaleString("id-ID")}</b>.`:"❌ Video tidak ditemukan di daftar klipmu.",p);return}await a.reply("📈 <b>AI Analytics</b>\n\n<code>/analytics</code> — laporan performa\n<code>/analytics 30</code> — klip 30 hari terakhir\n<code>/analytics sync</code> — tarik views terbaru\n<code>/analytics learn</code> — AI belajar sekarang\n<code>/analytics apply</code> — terapkan hasil belajar\n<code>/analytics reset</code> — hapus hasil belajar\n<code>/analytics weekly on|off</code> — laporan mingguan\n<code>/analytics learning on|off</code> — Smart Learning\n<code>/analytics views &lt;id&gt; &lt;jumlah&gt;</code> — isi views manual\n<code>/analytics retitle</code> — 🩺 Auto-Title Doctor (status &amp; riwayat)\n<code>/analytics retitle run</code> — 🩺 perbaiki judul klip ber-views rendah sekarang",p)}catch(b){console.error("[analytics] /analytics error:",b),await a.reply(`❌ Gagal memproses /analytics: ${(0,f.e)(b instanceof Error?b.message:String(b))}`,p)}}),a.callbackQuery("an_sync",async a=>{let b=a.from.id.toString();await a.answerCallbackQuery("🔄 Menyinkronkan...");try{await a.reply(await n(a,b),p),await o(a,b,null,!1)}catch(b){await a.reply(`❌ Sync gagal: ${(0,f.e)(b instanceof Error?b.message:String(b))}`,p)}}),a.callbackQuery("an_learn",async a=>{let b=a.from.id.toString();await a.answerCallbackQuery("🧠 AI sedang belajar...");try{await (0,e.syncUserStats)(b).catch(()=>{});let c=await (0,g.b)(b,{force:!0});await a.reply(m(c),p)}catch(b){await a.reply(`❌ Gagal belajar: ${(0,f.e)(b instanceof Error?b.message:String(b))}`,p)}}),a.callbackQuery("an_weekly",async a=>{let b=a.from.id.toString(),c=await (0,e.getOrCreateUserState)(b);await (0,e.patchUserState)(b,{weeklyReportEnabled:!c.weeklyReportEnabled}),await a.answerCallbackQuery(`Laporan mingguan ${!c.weeklyReportEnabled?"ON":"OFF"}${(0,h.a)()?"":" (dimatikan admin)"}`),await a.editMessageReplyMarkup({reply_markup:await l(b)}).catch(()=>{})}),a.callbackQuery("an_learning",async a=>{let b=a.from.id.toString(),c=await (0,e.getOrCreateUserState)(b);await (0,e.patchUserState)(b,{learningEnabled:!c.learningEnabled}),await a.answerCallbackQuery(`Smart Learning ${!c.learningEnabled?"ON":"OFF"}${(0,h.q)()?"":" (dimatikan admin)"}`),await a.editMessageReplyMarkup({reply_markup:await l(b)}).catch(()=>{})}),a.callbackQuery("an_reset",async a=>{let b=a.from.id.toString();await (0,g.f)(b),await a.answerCallbackQuery("↩️ Hasil belajar dihapus"),await a.editMessageReplyMarkup({reply_markup:await l(b)}).catch(()=>{}),await a.reply("↩️ Hasil belajar dihapus. AI kembali memakai DEFAULT_NICHE_PROMPT / niche kustommu.")})}]),c()}catch(a){c(a)}},!1),51806,a=>a.a(async(b,c)=>{try{var d=a.i(77136),e=a.i(53153),f=a.i(72063),g=a.i(96304),h=a.i(49689),i=b([e,f,g]);[e,f,g]=i.then?(await i)():i;let j={parse_mode:"HTML",link_preview_options:{is_disabled:!0}};a.s(["f",0,function(a){a.command("prune",async a=>{let b=a.from?.id?.toString();if(!b)return;if(!(0,h.$)())return void await a.reply("✂️ <b>Auto-Prune Klip Gagal</b> sedang nonaktif.\nAdmin bisa menyalakannya dengan <code>AUTO_PRUNE_ENABLED=true</code> di Railway Variables.",j);let c=(a.match||"").toString().trim().split(/\s+/)[0].toLowerCase();try{if("run"===c){let c=await a.reply("✂️ Memeriksa klip yang performanya gagal...");await (0,e.syncUserStats)(b).catch(()=>{});let d=await (0,g.K)(b,{notify:!1});a.chat&&await a.api.deleteMessage(a.chat.id,c.message_id).catch(()=>{}),await a.reply(`✂️ <b>Selesai</b>
• Klip memenuhi kriteria (menunggu keputusan): ${d.candidates}
• Usulan baru: ${d.suggested}`+(d.skipped?`
<i>${(0,f.e)(d.skipped)}</i>`:"")+(d.errors.length?`
<i>${(0,f.e)(d.errors[0].slice(0,200))}</i>`:"")+(d.candidates?"\n\nKetik <code>/prune list</code> untuk melihat & memutuskan.":""),j);return}if("list"===c){let c=await (0,g.N)(b,2*(0,h.j)());if(!c.length)return void await a.reply("✅ Tidak ada usulan yang menunggu keputusan.",j);let d=(await (0,g.Q)(b)).pending;await (0,g.r)(b,c,{totalPending:d,readableCount:0});return}let[d,i]=await Promise.all([(0,g.Q)(b),(0,g.A)(b,5)]),k={hidden:"🙈",deleted:"🗑",kept:"✅"},l=i.map(a=>`${k[a.status]||"•"} ${(0,f.e)(a.title.slice(0,50))} (${a.views} views)`);await a.reply(`✂️ <b>Auto-Prune Klip Gagal</b> — ON ✅
<i>Aturan: ${(0,f.e)((0,h.S)())}</i>
<i>Tombol: ${(0,h.M)().map(a=>"hide"===a?`sembunyikan → ${(0,h.x)()}`:"hapus").join(", ")}</i>

Menunggu keputusan: <b>${d.pending}</b> \xb7 Disembunyikan: ${d.hidden} \xb7 Dihapus: ${d.deleted} \xb7 Dipertahankan: ${d.kept}`+(l.length?`

<b>Keputusan terakhir</b>
${l.join("\n")}`:"")+"\n\n<code>/prune list</code> — lihat usulan\n<code>/prune run</code> — cari klip gagal sekarang\n<i>Bot hanya mengusulkan; kamu yang memutuskan.</i>",j)}catch(b){console.error("[auto-prune] /prune gagal:",b),await a.reply("⚠️ Terjadi kesalahan saat memproses /prune. Coba lagi sebentar lagi.")}}),a.callbackQuery(/^prune:(h|d|dc|k|b):(\d+)$/,async a=>{let b=a.from?.id?.toString(),[,c,e]=a.match,i=parseInt(e,10);if(b)try{if("d"===c&&(0,h.O)()){let c=await (0,g.k)(b,i);if(!c||"pending"!==c.status)return void await a.answerCallbackQuery({text:"Usulan sudah diputuskan."});let e=new d.InlineKeyboard().text("🗑 Ya, hapus permanen",`prune:dc:${i}`).text("↩️ Batal",`prune:b:${i}`);await a.answerCallbackQuery(),await a.editMessageText(`${(0,g.b)(c)}

${h.i.confirmDelete}`,{...j,reply_markup:e});return}if("b"===c){let c=await (0,g.k)(b,i);await a.answerCallbackQuery({text:"Dibatalkan"}),c&&await a.editMessageText((0,g.b)(c),{...j,reply_markup:(0,g.$)(i)});return}await a.answerCallbackQuery({text:"Memproses..."});let e=await (0,g.j)(b,i,"h"===c?"hide":"k"===c?"keep":"delete");e.ok&&e.row?await a.editMessageText(`${(0,g.b)(e.row)}

${e.message}`,{...j,reply_markup:void 0}):e.row&&e.status&&"pending"!==e.status?await a.editMessageText(`${(0,g.b)(e.row)}

ℹ️ ${(0,f.e)(e.message)}`,{...j,reply_markup:void 0}):(await a.reply(`⚠️ ${(0,f.e)(e.message)}`,j),e.row&&await a.editMessageReplyMarkup({reply_markup:(0,g.$)(i)}).catch(()=>{}))}catch(b){console.error("[auto-prune] tombol gagal:",b),await a.answerCallbackQuery({text:"Terjadi kesalahan, coba lagi."}).catch(()=>{})}})}]),c()}catch(a){c(a)}},!1),94251,a=>{a.i(66554);let b={welcome:`🤖 *AutoClip Bot* — Video Clipper Otomatis

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
• YouTube: ${a.youtubeConnected?"✅ Terhubung":"❌ Belum terhubung"}`,resultSummary:a=>{let b=`🎉 *Proses Selesai!*

`;return b+=`Berhasil membuat ${a.length} klip YouTube Shorts:

`,a.forEach((a,c)=>{b+=`*Klip ${c+1}:* ${a.title.slice(0,50)}
⏱ Durasi: ${a.duration}s | 🔥 Viral Score: ${a.viralScore}/10`,a.hasThumbnail&&(b+=` | 🖼✅`),a.hasZoom&&(b+=` | 🔍✅`),a.hasWatermark&&(b+=` | 💧✅`),b+=`
`,a.youtubeUrl&&(b+=`🔗 ${a.youtubeUrl}
`),b+="\n"}),b+=`📺 Cek YouTube Studio untuk melihat Draft!`}};a.s(["M",0,function(a){let b=Math.floor(a/60),c=Math.floor(a%60);return 0===b?`${c}s`:`${b}m ${c}s`},"h",0,function(a){return({youtube:"📺",facebook:"📘",tiktok:"🎵",instagram:"📸",twitter:"🐦",unknown:"🌐"})[a.toLowerCase()]||"🌐"},"Z",0,b])},25101,a=>a.a(async(b,c)=>{try{var d=a.i(77136),e=a.i(72063),f=a.i(23833),g=a.i(10675),h=a.i(96203),i=b([e,f,h]);[e,f,h]=i.then?(await i)():i;let k={parse_mode:"HTML",link_preview_options:{is_disabled:!0}},l=`

🚨 *Post-Upload Claim Monitor:*
/claims - Status klaim video & rasio klaim per channel sumber
/blacklist - Lihat / tambah / hapus channel sumber yang di-blacklist`,m={block:"⛔ block (job ditolak)",warn:"⚠️ warn (peringatan saja)",off:"⚪ off (hanya dicatat)"};function j(a){let b;return`${a.blacklisted?"⛔":a.ratioPercent>=30?"🔴":a.claims>0?"🟡":"🟢"} <b>${(0,e.e)(a.channelName.slice(0,40))}</b>
    ${b=Math.round(Math.min(100,Math.max(0,a.ratioPercent))/10),"▰".repeat(b)+"▱".repeat(10-b)} ${a.ratioPercent}% (${a.claims}/${a.clips} klip)`}a.s(["m",0,l,"g",0,function(a){a.command("claims",async a=>{let b=a.from?.id?.toString();if(!b)return;if(!(0,g.a)())return void await a.reply("🚨 <b>Post-Upload Claim Monitor</b> sedang nonaktif.\nAdmin bisa menyalakannya dengan <code>CLAIM_MONITOR_ENABLED=true</code> di Railway Variables.",k);let c=(a.match||"").toString().trim().split(/\s+/)[0].toLowerCase();try{if("run"===c||"cek"===c){let c=await a.reply("🚨 Mengecek status video di YouTube..."),d=await (0,f.E)({userId:b,force:!0,notify:!1});a.chat&&await a.api.deleteMessage(a.chat.id,c.message_id).catch(()=>{});let g=(await (0,f.Q)(b)).pending;await a.reply(`🚨 <b>Pengecekan selesai</b>
• Video dicek: ${d.checked}
• Klaim baru: ${d.newClaims} \xb7 dilepas: ${d.cleared}
• Video sudah hilang: ${d.missing}
• Channel di-auto-blacklist: ${d.blacklisted}`+(d.errors.length?`
<i>⚠️ ${(0,e.e)(d.errors[0].slice(0,200))}</i>`:"")+(g?`

<b>${g}</b> klip menunggu keputusan — ketik <code>/claims list</code>.`:"\n\n✅ Tidak ada klip yang menunggu keputusan."),k);return}if("list"===c){let c=await (0,f.c)(b,2*(0,g.I)());if(!c.length)return void await a.reply("✅ Tidak ada klaim yang menunggu keputusan.",k);let d=(await (0,f.Q)(b)).pending;await (0,f.q)(b,c,d);return}if("channels"===c||"channel"===c||"rasio"===c){let c=await (0,f.O)(b);if(!c.length)return void await a.reply("ℹ️ Belum ada data. Rasio muncul setelah klip dari source channel dicek (<code>/claims run</code>).",k);await a.reply(`📊 <b>Rasio Klaim per Source Channel</b>
<i>Auto-blacklist: ${(0,g.x)()?(0,e.e)((0,g.D)()):"nonaktif"}</i>

`+c.slice(0,20).map(j).join("\n\n"),k);return}let[d,h,i]=await Promise.all([(0,f.Q)(b),(0,f.s)(b,5),(0,f.O)(b)]),l={private:"🔒",unlisted:"🔗",deleted:"🗑",ignored:"🙈"},m=h.map(a=>`${l[a.actionStatus]||"•"} ${(0,e.e)(a.title.slice(0,50))}`),n=i.filter(a=>a.claims>0).slice(0,3);await a.reply(`🚨 <b>Post-Upload Claim Monitor</b> — ON ✅
<i>Cek tiap ${(0,g.G)()} menit \xb7 sinyal: ${(0,g.c)().join(", ")}</i>
<i>Tombol: ${(0,g.g)().map(a=>"delete"===a?"hapus":`private → ${(0,g.F)()}`).join(", ")}, abaikan</i>

📹 Video dipantau: <b>${d.tracked}</b> (sudah dicek: ${d.checked})
🚩 Kena klaim/pembatasan: <b>${d.claimed}</b> \xb7 menunggu keputusan: <b>${d.pending}</b>
🔒 Private: ${d.privated} \xb7 🗑 Dihapus: ${d.deleted} \xb7 🙈 Diabaikan: ${d.ignored}`+(n.length?`

<b>Channel paling sering diklaim</b>
${n.map(j).join("\n")}`:"")+(m.length?`

<b>Keputusan terakhir</b>
${m.join("\n")}`:"")+"\n\n<code>/claims list</code> — lihat alert menunggu\n<code>/claims channels</code> — rasio per channel\n<code>/claims run</code> — cek sekarang\n<code>/blacklist</code> — channel yang diblokir\n<i>Bot hanya memberi alert; kamu yang memutuskan lewat tombol.</i>",k)}catch(b){console.error("[claim-monitor] /claims gagal:",b),await a.reply("⚠️ Terjadi kesalahan saat memproses /claims. Coba lagi sebentar lagi.")}}),a.command("blacklist",async a=>{let b=a.from?.id?.toString();if(!b)return;let[c,...d]=(a.match||"").toString().trim().split(/\s+/),i=(c||"").toLowerCase(),j=d.join(" ").trim();try{if("add"===i||"tambah"===i){if(!j)return void await a.reply("Format: <code>/blacklist add @namachannel</code> (boleh juga ID UCxxx, nama, atau URL channel)",k);let c=await (0,f.g)(b,j);await a.reply(c.added?`⛔ <code>${(0,e.e)(c.label)}</code> masuk blacklist.`+(c.pausedMonitors?`
⏸ ${c.pausedMonitors} Auto-Monitor untuk channel ini dijeda.`:""):`ℹ️ <code>${(0,e.e)(c.label)}</code> sudah ada di blacklist.`,k);return}if("remove"===i||"hapus"===i||"del"===i){if(!j)return void await a.reply("Format: <code>/blacklist remove &lt;nomor | channel&gt;</code>",k);let c=await (0,h.removeBlacklistEntry)(b,j);await a.reply(c?`✅ <code>${(0,e.e)(c.channelName||c.channelKey)}</code> dikeluarkan dari blacklist.
<i>Auto-Monitor yang sempat dijeda bisa dinyalakan lagi lewat /monitoron.</i>`:"❌ Tidak ditemukan di blacklist-mu. Cek nomor lewat /blacklist (entri dari env hanya bisa diubah di Railway Variables).",k);return}let c=await (0,h.listBlacklist)(b),d=(0,g.t)(),l=[`⛔ <b>Blacklist Source Channel</b> (mode: <code>${m[(0,g.r)()]}</code>)
`];l.push(`<b>Milikmu</b> (${c.length}):
`+(c.length?c.map((a,b)=>`${b+1}. <code>${(0,e.e)(a.channelName||a.channelKey)}</code> — ${"auto"===a.origin?`🤖 auto (${a.claims}/${a.clips} klip, ${a.ratioPercent}%)`:"✍️ manual"}`).join("\n"):"— kosong —")),l.push(`
<b>Global (env CLAIM_BLACKLIST_CHANNELS)</b> (${d.length}):
`+(d.length?d.map(a=>`• <code>${(0,e.e)(a)}</code>`).join("\n"):"— kosong —")),l.push(`
🤖 Auto-blacklist: <b>${(0,g.x)()?"aktif":"nonaktif"}</b>`+((0,g.x)()?`
<i>${(0,e.e)((0,g.D)())}</i>`:"")),l.push(`
➕ <code>/blacklist add @channel</code>
➖ <code>/blacklist remove 1</code>
📊 <code>/claims channels</code> — lihat rasio klaim

Channel di blacklist tidak diproses lagi (job ditolak Source Guard & Auto-Monitor dijeda). Channel whitelist / milik sendiri tidak pernah di-auto-blacklist.`),await a.reply(l.join("\n"),k)}catch(b){console.error("[claim-monitor] /blacklist gagal:",b),await a.reply(`❌ Gagal: ${(0,e.e)(b instanceof Error?b.message:String(b))}`,k)}}),a.callbackQuery(/^claim:(d|dc|p|i|b):(\d+)$/,async a=>{let b=a.from?.id?.toString(),[,c,h]=a.match,i=parseInt(h,10);if(b)try{if("d"===c&&(0,g.Z)()){let c=await (0,f.V)(b,i);if(!c||"pending"!==c.actionStatus)return void await a.answerCallbackQuery({text:"Alert sudah diputuskan."});let e=new d.InlineKeyboard().text("🗑 Ya, hapus permanen",`claim:dc:${i}`).text("↩️ Batal",`claim:b:${i}`);await a.answerCallbackQuery(),await a.editMessageText(`${(0,f.U)(c)}

${g.$.confirmDelete}`,{...k,reply_markup:e});return}if("b"===c){let c=await (0,f.V)(b,i);await a.answerCallbackQuery({text:"Dibatalkan"}),c&&await a.editMessageText((0,f.U)(c),{...k,reply_markup:(0,f.N)(i)});return}await a.answerCallbackQuery({text:"Memproses..."});let h=await (0,f.f)(b,i,"p"===c?"private":"i"===c?"ignore":"delete");h.ok&&h.row?await a.editMessageText(`${(0,f.U)(h.row)}

${h.message}`,{...k,reply_markup:void 0}):h.row&&h.status&&"pending"!==h.status?await a.editMessageText(`${(0,f.U)(h.row)}

ℹ️ ${(0,e.e)(h.message)}`,{...k,reply_markup:void 0}):(await a.reply(`⚠️ ${(0,e.e)(h.message)}`,k),h.row&&await a.editMessageReplyMarkup({reply_markup:(0,f.N)(i)}).catch(()=>{}))}catch(b){console.error("[claim-monitor] tombol gagal:",b),await a.answerCallbackQuery({text:"Terjadi kesalahan, coba lagi."}).catch(()=>{})}}),a.callbackQuery(/^bl:rm:(\d+)$/,async a=>{let b=a.from?.id?.toString(),[,c]=a.match;if(b)try{let d=await (0,h.removeBlacklistById)(b,parseInt(c,10));await a.answerCallbackQuery({text:d?"Dikeluarkan dari blacklist":"Sudah tidak ada di blacklist"}),d?await a.editMessageText(`✅ <b>${(0,e.e)(d.channelName||d.channelKey)}</b> dikeluarkan dari blacklist.
<i>Auto-Monitor yang sempat dijeda bisa dinyalakan lagi lewat /monitoron.</i>`,{...k,reply_markup:void 0}):await a.editMessageReplyMarkup({reply_markup:void 0}).catch(()=>{})}catch(b){console.error("[claim-monitor] tombol blacklist gagal:",b),await a.answerCallbackQuery({text:"Terjadi kesalahan, coba lagi."}).catch(()=>{})}})}]),c()}catch(a){c(a)}},!1),96236,a=>a.a(async(b,c)=>{try{var d=a.i(93321),e=a.i(94758),f=a.i(37137),g=a.i(74351),h=a.i(72063),i=a.i(84857),j=a.i(4442),k=b([e,g,h,j]);function l(a){let b=Math.round(Math.min(100,Math.max(0,a))/10);return"█".repeat(b)+"░".repeat(10-b)}function m(a){return`${(0,h.e)(a.model)} <i>(${(0,h.e)(a.provider)})</i>`}function n(a){return a>=1e6?`${(a/1e6).toFixed(2)}M`:a>=1e3?`${(a/1e3).toFixed(1)}K`:String(a)}async function o(a){let b=new Map,c=a.filter(a=>/^-?\d+$/.test(a));if(!c.length)return b;try{for(let a of(await (0,g._)(),await e.f.select().from(f.I).where((0,d.y)(f.I.telegramUserId,c)))){let c=a.username?`@${a.username}`:[a.firstName,a.lastName].filter(Boolean).join(" ");c&&b.set(a.telegramUserId,c)}}catch{}return b}async function p(a){let{userId:b=null,days:c}=a,d=(0,j.M)(c),e=(0,j.N)(),[f,g,k,n,p]=await Promise.all([(0,j.j)(e,b),(0,j.j)(d,b),(0,j.b)(d,b),(0,j.E)(d,b),(0,j.Z)(b)]),q=b?"akunmu":"semua user",r=[a.weekly?`💰 <b>Biaya AI Mingguan</b> — ${q}`:`💰 <b>Biaya AI</b> — ${q}`,`🗓 <i>${c} hari terakhir</i>`,""];r.push("📊 <b>Ringkasan</b>"),r.push(`• Hari ini: <b>${(0,h.e)((0,j.i)(f.cost))}</b> (${f.calls} panggilan AI)`),r.push(`• ${c} hari: <b>${(0,h.e)((0,j.i)(g.cost))}</b> (${g.calls} panggilan \xb7 ${g.jobs} job)`),g.jobs>0&&r.push(`• Rata-rata per job: <b>${(0,h.e)((0,j.i)(g.jobCost/g.jobs))}</b>`),r.push("");let s=function(a,b){let c=[],d=(0,i.r)(),e=`reset ${a.resetAt.toLocaleTimeString("id-ID",{timeZone:(0,i.k)(),hour:"2-digit",minute:"2-digit"})} (${(0,i.k)()})`;if("global"===b){if(a.dailyLimit>0){let b="global"===a.scope?"⏸️":a.percent>=80?"⚠️":"💳";c.push(`${b} Batas harian: <b>${(0,j.x)(a.dailyLimit)}</b> — terpakai ${(0,j.x)(a.spentToday)} (${Math.round(a.percent)}%)`,`<code>${l(a.percent)}</code> <i>${e}</i>`)}else c.push("💳 Batas harian: <b>tanpa batas</b> (set <code>DAILY_BUDGET_USD</code>)");return a.userLimit>0&&c.push(`👤 Batas per user: <b>${(0,j.x)(a.userLimit)}</b>/hari`),"warn"===d&&c.push("<i>Mode warn: hanya notifikasi, AI tidak dijeda.</i>"),"off"===d&&c.push("<i>Mode off: batas tidak diberlakukan.</i>"),a.allowed||c.push(`⏸️ <b>AI sedang DIJEDA.</b> ${(0,h.e)((0,j.W)(a))}`),c}if(a.userLimit>0&&null!==a.userSpentToday){let b=a.userSpentToday/a.userLimit*100;c.push(`${"user"===a.scope?"⏸️":"💳"} Batas harianmu: <b>${(0,j.x)(a.userLimit)}</b> — terpakai ${(0,j.x)(a.userSpentToday)} (${Math.round(b)}%)`,`<code>${l(b)}</code> <i>${e}</i>`)}return a.allowed||c.push(`⏸️ <b>AI sedang dijeda.</b> ${"user"===a.scope?"Batas harianmu tercapai.":"Batas harian bot tercapai."} Coba lagi setelah reset.`),c}(p,b?"user":"global");if(s.length&&r.push(...s,""),!g.calls)return r.push("Belum ada biaya AI tercatat di periode ini. Kirim link video ke bot — biaya tiap job akan muncul di sini."),r.join("\n");if(r.push("🧩 <b>Per Fitur</b>"),k.forEach(a=>{let b=g.cost>0?Math.round(a.cost/g.cost*100):0;r.push(`• ${(0,h.e)((0,i.U)(a.feature))} — ${(0,j.x)(a.cost)} (${b}%) \xb7 ${a.calls}\xd7`)}),r.push(""),r.push("🤖 <b>Per Model</b>"),n.slice(0,(0,i.f)()).forEach(a=>{r.push(`• ${m(a)} — <b>${(0,j.x)(a.cost)}</b> \xb7 ${a.calls}\xd7${a.estimated?" ≈":""}`)}),n.some(a=>a.estimated)&&r.push("<i>≈ = token/harga diperkirakan (model belum ada di tabel harga).</i>"),!b){let a=await (0,j.C)(d,(0,i.f)()),b=await o(a.map(a=>a.userId));r.push("","👥 <b>Pemakai Terbesar</b>"),a.forEach((a,c)=>{let d=b.get(a.userId);r.push(`${c+1}. <code>${(0,h.e)(a.userId)}</code>${d?` ${(0,h.e)(d)}`:""} — <b>${(0,j.x)(a.cost)}</b> \xb7 ${a.jobs} job`)})}return r.join("\n")}async function q(a){let b=await (0,j.E)((0,j.M)(a.days),a.userId??null),c=["🤖 <b>Perbandingan Model</b>",`🗓 <i>${a.days} hari terakhir</i>`,""];if(!b.length)return c.push("Belum ada data. Proses beberapa video dulu, lalu bandingkan biaya tiap model di sini."),c.join("\n");let d=b.reduce((a,b)=>a+b.cost,0);return b.forEach(a=>{let b=d>0?Math.round(a.cost/d*100):0;c.push(`<b>${m(a)}</b>${a.estimated?" ≈":""}`);let e=[`${(0,j.x)(a.cost)} (${b}%)`,`${a.calls} panggilan`,`${(0,j.x)(a.cost/Math.max(1,a.calls))}/panggilan`];if(a.jobs>0&&e.push(`${(0,j.x)(a.cost/a.jobs)}/job`),c.push(`   ${e.join(" · ")}`),a.audioSeconds>0){var f;c.push(`   🎧 ${(f=a.audioSeconds)>=3600?`${(f/3600).toFixed(2)} jam`:`${Math.round(f/60)} mnt`} audio \xb7 ${(0,j.x)(a.cost/a.audioSeconds*3600)}/jam`)}else c.push(`   🔤 ${n(a.inputTokens)} token masuk \xb7 ${n(a.outputTokens)} keluar`)}),c.push("","💡 <i>Untuk mencoba model lain, ubah GEMINI_MODEL / GROQ_MODEL / GROQ_WHISPER_MODEL / AI_PROVIDER_ORDER di Railway Variables, proses beberapa video, lalu bandingkan biaya per job di sini.</i>"),c.join("\n")}async function r(a){let b=a.limit??8,c=await (0,j.U)(a.userId??null,b),d=["🧾 <b>Biaya per Job</b>",`<i>${c.length} job terakhir</i>`,""];if(!c.length)return d.push("Belum ada job dengan biaya AI tercatat."),d.join("\n");let e=a.userId?new Map:await o(c.map(a=>a.userId||"").filter(Boolean));return c.forEach((b,c)=>{var f;let g=(0,h.e)((f=b.title||`Job ${b.jobId.slice(0,8)}`).length>48?`${f.slice(0,47)}…`:f),k=b.at.toLocaleString("id-ID",{timeZone:(0,i.k)(),day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}),l=[`${b.calls} panggilan`];b.clips&&l.push(`${b.clips} klip \xb7 ${(0,j.x)(b.cost/b.clips)}/klip`),d.push(`${c+1}. <b>${g}</b>`),d.push(`   ${(0,h.e)((0,j.i)(b.cost))} \xb7 ${l.join(" · ")}`);let m=!a.userId&&b.userId?` \xb7 👤 ${(0,h.e)(e.get(b.userId)||b.userId)}`:"";d.push(`   <i>${k}${b.status?` \xb7 ${(0,h.e)(b.status)}`:""}${m}</i>`)}),d.join("\n")}async function s(a){let b=await (0,j.C)((0,j.M)(a),15),c=["👥 <b>Biaya per User</b>",`🗓 <i>${a} hari terakhir</i>`,""];if(!b.length)return c.push("Belum ada data."),c.join("\n");let d=await o(b.map(a=>a.userId)),e=b.reduce((a,b)=>a+b.cost,0);return b.forEach((a,b)=>{let e=d.get(a.userId);c.push(`${b+1}. <code>${(0,h.e)(a.userId)}</code>${e?` ${(0,h.e)(e)}`:""}
   <b>${(0,h.e)((0,j.i)(a.cost))}</b> \xb7 ${a.jobs} job \xb7 ${a.calls} panggilan`+(a.jobs>0?` \xb7 ${(0,j.x)(a.cost/a.jobs)}/job`:""))}),c.push("",`Total: <b>${(0,h.e)((0,j.i)(e))}</b>`),c.push("<i>Data ini berguna untuk menentukan harga langganan bila bot dijual sebagai layanan.</i>"),c.join("\n")}async function t(a){let b=["🏷️ <b>Harga Model yang Dipakai</b>",""];for(let c of a){let a=(0,i.u)(c.model,c.kind),d="audio"===c.kind?`${(0,j.x)(a.perHour??0)}/jam audio`:`${(0,j.x)(a.in??0)} masuk \xb7 ${(0,j.x)(a.out??0)} keluar per 1 juta token`,e="override"===a.source?"override env":"unknown"===a.source?"⚠️ tidak dikenal (perkiraan)":"tabel bawaan";b.push(`• <b>${(0,h.e)(c.label)}</b>: <code>${(0,h.e)(c.model)}</code>
   ${d} <i>(${e})</i>`)}return b.push("","<i>Ubah harga tanpa deploy: <code>COST_PRICE_OVERRIDES</code> di Railway Variables, atau edit MODEL_PRICES di src/lib/cost-config.ts.</i>"),b.join("\n")}[e,g,h,j]=k.then?(await k)():k,a.s(["H",0,p,"h",0,r,"W",0,q,"F",0,t,"w",0,s]),c()}catch(a){c(a)}},!1),63719,a=>a.a(async(b,c)=>{try{var d=a.i(84030),e=a.i(12698),f=a.i(84857),g=a.i(96236),h=a.i(4442),i=b([e,g,h]);[e,g,h]=i.then?(await i)():i;let m={parse_mode:"HTML",link_preview_options:{is_disabled:!0}},n=`

💰 *Cost Tracker:*
/cost - Biaya AI (OpenAI/Gemini/Whisper) per job & per user
/cost models - Bandingkan biaya per model
/cost jobs - Biaya per job terbaru`;async function j(a,b){await a.reply(b.slice(0,4e3),m)}async function k(a,b){let c=await (0,h.o)({userId:b});return!!c.allowed||(await a.reply("user"===c.scope?f.M.userPaused:f.M.globalPaused,m).catch(()=>{}),!1)}function l(a,b){let c=parseInt(a??"",10);return Number.isFinite(c)?Math.min(90,Math.max(1,c)):b}a.s(["_",0,n,"g",0,k,"O",0,function(a){a.command("cost",async a=>{let b=a.from?.id?.toString();if(!b)return;if(!(0,f.J)())return void await j(a,"💰 <b>Cost Tracker</b> sedang nonaktif.\nAdmin bisa menyalakannya dengan <code>COST_TRACKER_ENABLED=true</code> di Railway Variables.");let c=(0,d.N)(b),h=(a.match||"").toString().trim().toLowerCase().split(/\s+/).filter(Boolean),i=h[0]||"",k=(0,f.b)();try{if(!i||/^\d+$/.test(i)){let d=l(i,k);await j(a,await (0,g.H)({userId:c?null:b,days:d}));return}if("me"===i)return void await j(a,await (0,g.H)({userId:b,days:l(h[1],k)}));if("models"===i||"model"===i)return void await j(a,await (0,g.W)({userId:c?null:b,days:l(h[1],30)}));if("jobs"===i||"job"===i){let d=Math.min(20,Math.max(1,parseInt(h[1]??"",10)||8));await j(a,await (0,g.h)({userId:c?null:b,limit:d}));return}if("users"===i||"user"===i||"price"===i||"harga"===i){if(!c)return void await j(a,"🔒 Perintah ini khusus admin.");if("users"===i||"user"===i)return void await j(a,await (0,g.w)(l(h[1],k)));await j(a,await (0,g.F)([{label:"Gemini (teks)",model:(0,e.R)(),kind:"text"},{label:"Groq (teks)",model:(0,e.a)(),kind:"text"},{label:"Groq Whisper",model:(0,e.v)(),kind:"audio"},{label:"OpenAI (analisis)",model:"gpt-4o-mini",kind:"text"},{label:"OpenAI Whisper",model:"whisper-1",kind:"audio"}]));return}await j(a,"💰 <b>Cost Tracker</b>\n\n<code>/cost</code> — ringkasan biaya AI\n<code>/cost 30</code> — periode 30 hari\n<code>/cost models</code> — bandingkan biaya per model\n<code>/cost jobs</code> — biaya per job terbaru\n"+(c?"<code>/cost me</code> — biaya akunmu saja\n<code>/cost users</code> — biaya per user\n<code>/cost price</code> — harga model yang dipakai\n":""))}catch(b){console.error("[cost] /cost gagal:",b),await a.reply("⚠️ Terjadi kesalahan saat memproses /cost. Coba lagi sebentar lagi.")}})}]),c()}catch(a){c(a)}},!1),5270,a=>{function b(){let a=(process.env.TELEGRAM_PROGRESS_SHOW_ELAPSED||"true").toLowerCase().trim();return"false"!==a&&"0"!==a&&"off"!==a}function c(a){switch(a){case"done":return"✅";case"active":return"⏳";case"error":return"❌";default:return"⬜"}}function d(a,b=12){let c=Math.round(Math.max(0,Math.min(100,a))/100*b);return`[${"▓".repeat(c)}${"░".repeat(b-c)}]`}function e(a){let b=Math.max(0,Math.floor(a/1e3)),c=Math.floor(b/60);return`${c.toString().padStart(2,"0")}:${(b%60).toString().padStart(2,"0")}`}function f(a){if(!a.length)return 0;let b=a.length,c=0;for(let b of a)"done"===b.status?c+=1:"active"===b.status&&(c+=(b.percent??0)/100);return Math.round(c/b*100)}a.s(["p",0,[{id:"downloading",label:"Download video",icon:"⬇️"},{id:"transcribing",label:"Transkripsi audio",icon:"🎙️"},{id:"analyzing",label:"Analisis momen viral (AI)",icon:"🧠"},{id:"clipping",label:"Potong & edit klip",icon:"✂️"},{id:"scheduling",label:"Pilih jadwal upload",icon:"🗓️"},{id:"uploading_youtube",label:"Upload ke YouTube",icon:"📤"},{id:"uploading_drive",label:"Upload ke Google Drive",icon:"☁️"},{id:"done",label:"Selesai",icon:"🎉"}],"h",0,function(){let a=process.env.TELEGRAM_PROGRESS_MIN_INTERVAL_MS,b=a?parseInt(a,10):0/0;return!isNaN(b)&&b>=300&&b<=1e4?b:1500},"K",0,function(){let a=(process.env.TELEGRAM_PROGRESS_ENABLED||"true").toLowerCase().trim();return"false"!==a&&"0"!==a&&"off"!==a},"f",0,function(a){return"compact"==("compact"===(process.env.TELEGRAM_PROGRESS_STYLE||"checklist").toLowerCase().trim()?"compact":"checklist")?function(a){let{title:g,steps:h,startedAt:i,footerNote:j}=a,k=h.find(a=>"active"===a.status)||h.find(a=>"error"===a.status),l=f(h),m=[];return m.push(`🎬 *${g}*`),k&&m.push(`${c(k.status)} ${k.icon} ${k.label}${k.detail?` — ${k.detail}`:""}`),m.push(`${d(l)} ${l}%`),b()&&m.push(`⏱ ${e(Date.now()-i)}`),j&&m.push(j),m.join("\n")}(a):function(a){let g,{title:h,jobLabel:i,steps:j,startedAt:k,footerNote:l}=a,m=[];if(m.push(`🎬 *Progres Job* — ${h}`),i&&m.push(i),"false"!==(g=(process.env.TELEGRAM_PROGRESS_SHOW_BAR||"true").toLowerCase().trim())&&"0"!==g&&"off"!==g){let a=f(j);m.push(`${d(a)} ${a}%`)}for(let a of(m.push(""),j)){let b=`${c(a.status)} ${a.icon} ${a.label}`;"active"===a.status&&"number"==typeof a.percent&&(b+=` — ${a.percent}%`),m.push(b),"active"===a.status&&a.detail&&m.push(`   ↳ ${a.detail}`),"error"===a.status&&a.detail&&m.push(`   ↳ ⚠️ ${a.detail}`)}return b()&&(m.push(""),m.push(`⏱ Berjalan ${e(Date.now()-k)}`)),l&&(m.push(""),m.push(l)),m.join("\n")}(a)}])},93065,a=>a.a(async(b,c)=>{try{var d=a.i(93321),e=a.i(30385),f=a.i(51674),g=a.i(94758),h=a.i(37137),i=a.i(4442),j=a.i(34707),k=b([g,i]);[g,i]=k.then?(await k)():k;let s=null;function l(){return s||(s=(async()=>{await g.f.execute(f.B`
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
      `)})().catch(a=>{throw s=null,a})),s}async function m(b,c){let d=`Kamu adalah ahli strategi konten YouTube Shorts/TikTok. Niche/topik konten: "${b||"umum / belum ditentukan"}". Platform: ${c}. Sebutkan ${(0,j.d)()} jam terbaik (format angka 0-23, waktu lokal audiens Indonesia WIB) untuk mem-publish video pendek agar mendapat views & engagement maksimal. Balas HANYA dengan JSON: {"hours": [number,...], "reason": "alasan singkat 1-2 kalimat dalam Bahasa Indonesia"}.`;if(!(await (0,i.o)()).allowed)return null;if(process.env.OPENAI_API_KEY)try{let b=new(await a.A(13599)).default({apiKey:process.env.OPENAI_API_KEY}),c=await b.chat.completions.create({model:"gpt-4o-mini",messages:[{role:"system",content:"Kamu ahli strategi konten sosial media. Balas hanya JSON valid."},{role:"user",content:d}],temperature:.4,max_tokens:300,response_format:{type:"json_object"}}),e=c.choices[0]?.message?.content||"{}";await (0,i.X)({provider:"openai",model:"gpt-4o-mini",feature:"schedule",inputTokens:c.usage?.prompt_tokens,outputTokens:c.usage?.completion_tokens,inputChars:d.length,outputChars:e.length});let f=JSON.parse(e),g=n(f.hours);if(g.length)return{hours:g,reason:String(f.reason||"").slice(0,300)}}catch(a){console.error("[scheduler] OpenAI hour recommendation failed:",a)}if(process.env.GEMINI_API_KEY)try{let{GoogleGenerativeAI:b}=await a.A(46538),c=new b(process.env.GEMINI_API_KEY).getGenerativeModel({model:"gemini-3.1-flash-lite"}),e=await c.generateContent(d+"\n\nBALAS HANYA DENGAN JSON."),f=e.response.text(),g=e.response.usageMetadata;await (0,i.X)({provider:"gemini",model:"gemini-3.1-flash-lite",feature:"schedule",inputTokens:g?.promptTokenCount,outputTokens:g?(g.candidatesTokenCount??0)+(g.thoughtsTokenCount??0):void 0,inputChars:d.length,outputChars:f.length});let h=f.match(/\{[\s\S]*\}/);if(h){let a=JSON.parse(h[0]),b=n(a.hours);if(b.length)return{hours:b,reason:String(a.reason||"").slice(0,300)}}}catch(a){console.error("[scheduler] Gemini hour recommendation failed:",a)}return null}function n(a){return Array.isArray(a)?Array.from(new Set(a.map(a=>Math.round(Number(a))).filter(a=>Number.isFinite(a)&&a>=0&&a<=23))).slice(0,(0,j.d)()):[]}async function o(a,b="youtube"){let c=(0,j.E)(a),d=await m(a||"",b).catch(()=>null),e=d?.hours?.length?d.hours:c.hours,f=d?.reason||`Berdasarkan niche "${c.label}", jam-jam ini biasanya punya tingkat engagement tertinggi untuk Shorts.`;return{slots:(function(a){let b=(0,j.F)(),c=new Date,d=(0,j.$)(),e=[];for(let f=0;f<=Math.min(2,d);f++)for(let d of a){let a=function(a,b,c,d){let e=new Date(a.getTime()+864e5*c),f=new Intl.DateTimeFormat("en-US",{timeZone:b,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(e),g=Date.UTC(Number(f.find(a=>"year"===a.type)?.value),Number(f.find(a=>"month"===a.type)?.value)-1,Number(f.find(a=>"day"===a.type)?.value),d,0,0),h=d-Number(new Intl.DateTimeFormat("en-US",{timeZone:b,hour:"2-digit",hour12:!1}).format(new Date(g)));return h>12&&(h-=24),h<-12&&(h+=24),new Date(g+36e5*h)}(c,b,f,d);a.getTime()>c.getTime()+6e4&&e.push(a)}e.sort((a,b)=>a.getTime()-b.getTime());let f=[];for(let a of e)f.some(b=>6e4>Math.abs(b.getTime()-a.getTime()))||f.push(a);return f.slice(0,(0,j.d)())})(e).map(a=>({date:a,label:p(a),reason:f})),reason:f,nicheLabel:c.label}}function p(a){var b;let c=(0,j.F)();return new Intl.DateTimeFormat("id-ID",{timeZone:c,weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(a)+" "+((b=c).includes("Jakarta")?"WIB":b.includes("Makassar")?"WITA":b.includes("Jayapura")?"WIT":b)}async function q(a){return await l(),(await g.f.insert(h.e).values({jobId:a.jobId,telegramUserId:a.telegramUserId,telegramChatId:a.telegramChatId,mode:a.mode,scheduledAt:a.scheduledAt,recommendationReason:a.recommendationReason||null,status:"pending"}).returning())[0]}async function r(a){return await l(),g.f.select().from(h.e).where((0,d.b)((0,d.u)(h.e.telegramUserId,a),(0,d.u)(h.e.status,"pending"))).orderBy((0,e.M)(h.e.scheduledAt))}a.s(["d",0,q,"b",0,p,"R",0,o,"f",0,r]),c()}catch(a){c(a)}},!1),67721,a=>a.a(async(b,c)=>{try{var d=a.i(72063),e=a.i(47272),f=a.i(44966),g=b([d,e]);[d,e]=g.then?(await g)():g;let i={parse_mode:"HTML",link_preview_options:{is_disabled:!0}},j=`

🛡️ *Source Credit & Copyright Guard:*
/sourceguard - Status & konfigurasi pengaman hak cipta
/whitelist - Lihat / tambah / hapus channel yang diizinkan`,k={warn:"⚠️ warn (hanya peringatan)",block:"⛔ block (blokir pelanggaran)",off:"⚪ off (guard mati)"};function h(a){return a?"✅ aktif":"❌ nonaktif"}a.s(["$",0,j,"H",0,function(a){a.command("sourceguard",async a=>{let b=(0,f.E)(),c="Statistik belum tersedia.";try{let a=await (0,e.H)();c=`24 jam terakhir → ✅ lolos: <b>${a.last24h.allowed}</b> • ⚠️ peringatan: <b>${a.last24h.warned}</b> • ⛔ diblokir: <b>${a.last24h.blocked}</b>
Total pengecekan tercatat: <b>${a.total}</b>`}catch(a){console.error("[source-guard] stats gagal:",a)}await a.reply(`🛡️ <b>Source Credit &amp; Copyright Guard</b>

Mode: <b>${(0,d.e)(k[b.mode])}</b> • Cakupan: <code>${b.scope}</code>
Kredit sumber di deskripsi: ${h(b.creditEnabled)} (${b.creditPosition})
<code>${(0,d.e)(b.creditTemplate)}</code>
Whitelist channel: ${b.whitelist.length} dari env${b.whitelistRequired?" • <b>wajib</b>":""} • channel milik sendiri: ${h(b.allowOwnChannel)}
Batas klip / video sumber / hari: <b>${0===b.maxClipsPerSourcePerDay?"tanpa batas":b.maxClipsPerSourcePerDay}</b> (zona ${(0,d.e)(b.timezone)})
Skip video bertanda Content ID: ${h(b.skipContentId)}

${c}

<b>Cara ubah (Railway Variables):</b>
• <code>SOURCE_CREDIT_ENABLED</code> = true / false
• <code>COPYRIGHT_GUARD_MODE</code> = warn | block | off
• <code>COPYRIGHT_WHITELIST_CHANNELS</code> = UCxxx,@handle,nama
• <code>COPYRIGHT_MAX_CLIPS_PER_SOURCE_PER_DAY</code> = angka (0 = tanpa batas)
• <code>COPYRIGHT_SKIP_CONTENT_ID</code> = true / false

ℹ️ Mode <b>warn</b> hanya memberi peringatan; ganti ke <b>block</b> agar video bermasalah benar-benar di-skip. Deteksi Content ID berbasis sinyal (musik berlisensi, penanda deskripsi) — bukan jaminan 100%. Kelola whitelist: /whitelist`,i)}),a.command("whitelist",async a=>{let b=a.from?.id?.toString();if(!b)return;let[c,...g]=(a.match||"").toString().trim().split(/\s+/),h=(c||"").toLowerCase(),j=g.join(" ").trim();try{if("add"===h||"tambah"===h){if(!j)return void await a.reply("Format: <code>/whitelist add @namachannel</code> (boleh juga ID UCxxx, nama, atau URL channel)",i);let c=await (0,e.i)(b,j);await a.reply(c.added?`✅ <code>${(0,d.e)(c.entry)}</code> ditambahkan ke whitelist.`:`ℹ️ <code>${(0,d.e)(c.entry)}</code> sudah ada di whitelist.`,i);return}if("remove"===h||"hapus"===h||"del"===h){if(!j)return void await a.reply("Format: <code>/whitelist remove &lt;nomor | channel&gt;</code>",i);let c=await (0,e.q)(b,j);await a.reply(c?`🗑 <code>${(0,d.e)(c)}</code> dihapus dari whitelist-mu.`:"❌ Tidak ditemukan di whitelist-mu. Cek nomor lewat /whitelist (entri dari env hanya bisa diubah di Railway Variables).",i);return}let c=await (0,e.O)(b),g=(0,f.M)(),k=(0,f.Q)()?await (0,e.l)(b):[],l=[`🛡️ <b>Whitelist Channel</b> (mode guard: <code>${(0,f.b)()}</code>)
`];l.push(`<b>Milikmu</b> (${c.length}):
`+(c.length?c.map((a,b)=>`${b+1}. <code>${(0,d.e)(a.label||a.entry)}</code>`).join("\n"):"— kosong —")),l.push(`
<b>Global (env COPYRIGHT_WHITELIST_CHANNELS)</b> (${g.length}):
`+(g.length?g.map(a=>`• <code>${(0,d.e)(a)}</code>`).join("\n"):"— kosong —")),l.push(`
<b>Channel YouTube milikmu (otomatis)</b>: `+(k.length?`<code>${(0,d.e)(k.slice(0,3).join(", "))}</code>`:"tidak terdeteksi (kirim /connect ulang bila perlu izin baca)")),l.push(`
➕ <code>/whitelist add @channel</code>
➖ <code>/whitelist remove 1</code>

Whitelist aktif bila ada isinya atau <code>COPYRIGHT_WHITELIST_REQUIRED=true</code>. Video dari channel di luar daftar diberi peringatan (mode warn) atau di-skip (mode block).`),await a.reply(l.join("\n"),i)}catch(b){console.error("[source-guard] /whitelist gagal:",b),await a.reply(`❌ Gagal: ${(0,d.e)(b instanceof Error?b.message:String(b))}`,i)}})}]),c()}catch(a){c(a)}},!1),29068,a=>a.a(async(b,c)=>{try{var d=a.i(68265);a.i(94251);var e=b([d]);[d]=e.then?(await e)():e,a.s(["bot",()=>d.f]),c()}catch(a){c(a)}},!1),68265,a=>a.a(async(b,c)=>{try{var d=a.i(77136),e=a.i(94758),f=a.i(37137),g=a.i(93321),h=a.i(30385),i=a.i(53878),j=a.i(73351),k=a.i(55592),l=a.i(94251),m=a.i(66765),n=a.i(38073),o=a.i(34707),p=a.i(93065),q=a.i(66554),r=a.i(83755),s=a.i(15633),t=a.i(93015),u=a.i(51806),v=a.i(67721),w=a.i(25101),x=a.i(63719),y=a.i(51533),z=a.i(88534),A=a.i(14776),B=a.i(2701),C=a.i(22734),D=a.i(56262),E=a.i(96186),F=a.i(41442),G=a.i(56104),H=a.i(70123),I=a.i(79193),J=a.i(56294),K=a.i(25622),L=b([e,j,m,n,p,r,s,t,u,v,w,x,A,H,J]);[e,j,m,n,p,r,s,t,u,v,w,x,A,H,J]=L.then?(await L)():L;let Z=process.env.TELEGRAM_BOT_TOKEN||"placeholder_token_for_build",$=new d.Bot(Z);(0,J.o)($);let _=/https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be|youtube\.com\/shorts|facebook\.com\/(watch|video)|fb\.watch|tiktok\.com\/@[^/]+\/video|instagram\.com\/(reel|p|tv))[^\s]*/i;async function M(a){let b=(0,q.o)(),c=a.from?.id?.toString(),h=b;if(c){let a=await e.f.select().from(f.Y).where((0,g.u)(f.Y.telegramUserId,c));h=a[0]?.clipDuration??b}let i=new d.InlineKeyboard;q.r.forEach(a=>{let b=a===h?`✅ ${a}s`:`${a} detik`;i.text(b,`set_duration_${a}`)}),await a.reply(`⏱ *Konfigurasi Durasi Klip:*

Aktif (env \`CLIP_DURATION\`): *${b} detik*
Setting akunmu: *${h} detik*

*Cara Ubah (2 metode):*

*1️⃣ Railway Variables (global, semua user):*
  Set variabel \`CLIP_DURATION\` di Railway Dashboard
  Contoh: \`CLIP_DURATION=20\`   klip 20 detik
• Nilai valid: \`${q.r.join("`, `")}\`
• Tidak perlu redeploy — langsung berlaku

*2️⃣ Per-akun via /settings atau /duration (tombol di bawah):*
• Tekan tombol durasi yang diinginkan
• Berlaku untuk akun Telegram kamu saja

📋 *Pilihan durasi tersedia:*
`+q.r.map(a=>`• ${a} detik`).join("\n")+`

💡 ENV var \`CLIP_DURATION\` jadi default untuk user baru; setting akun selalu dipakai setelah dipilih.`,{parse_mode:"Markdown",reply_markup:i})}async function N(a){let b=a.from?.id?.toString();if(!b)return;let c=await e.f.select().from(f.Y).where((0,g.u)(f.Y.telegramUserId,b)),h=c[0]?.nichePrompt??null,i=new d.InlineKeyboard;y.k.forEach((a,b)=>{i.text(`${a.emoji} ${a.label}`,`niche_preset_${b}`),b%2==1&&i.row()}),i.row().text("↩️ Reset ke Default","niche_reset"),await a.reply(`🎯 *Custom Niche Prompt*

Arahkan AI Analysis supaya fokus memilih momen sesuai niche kontenmu, misal "fokus ke momen lucu" atau "fokus ke insight bisnis".

Status saat ini: *${(0,y.L)(h)}*

*Cara mengatur:*
• Pilih salah satu preset di bawah, atau
• Kirim \`/niche <prompt bebas>\`
  Contoh: \`/niche fokus ke insight bisnis\`
• Kembali ke default: \`/niche reset\`

💡 Admin juga bisa set default global untuk semua user via Railway Variables: \`DEFAULT_NICHE_PROMPT\`.`,{parse_mode:"Markdown",reply_markup:i})}async function O(a,b,c){let e,f=a.chat?.id;if(!f)return;let g=(0,D.h)(),h=c||g.animation,i=await a.api.sendMessage(f,`⏳ Membuat preview style *${b}*...`,{parse_mode:"Markdown"});try{e=await (0,E.g)(b,c?{animation:c}:{}),await a.api.sendVideo(f,new d.InputFile(e),{caption:`💬 *Preview Subtitle: ${D.u[b].label}*
${D.u[b].description}

Animasi: \`${h}\` • Posisi: \`${g.position}\`
Warna: \`${g.color}\` • Highlight: \`${g.highlightColor}\`

Pakai style ini: set \`SUBTITLE_STYLE\` = \`${b}\` di Railway Variables`,parse_mode:"Markdown",width:540,height:960,supports_streaming:!0})}catch(b){console.error("[subtitle] preview gagal:",b),await a.api.sendMessage(f,"❌ Preview gagal dibuat. Pastikan FFmpeg (dengan libass) terinstall di server.")}finally{try{e&&C.default.existsSync(e)&&C.default.unlinkSync(e)}catch{}try{await a.api.deleteMessage(f,i.message_id)}catch{}}}$.command("start",async a=>{await Y(a.from?.id?.toString()||""),await a.reply(l.Z.welcome,{parse_mode:"Markdown",reply_markup:new d.InlineKeyboard().text("🎬 Cara Pakai","help").text("🔗 Hubungkan YouTube","connect").row().text("⚙️ Pengaturan","settings").text("📋 Riwayat","history").row().text("☁️ Google Drive","drive_menu").text("📡 Auto-Monitor","monitors_menu")})}),$.command("help",async a=>{await a.reply(l.Z.help+aa+ab+ac+v.$+w.m+x._,{parse_mode:"Markdown"})}),$.command("connect",async a=>{await U(a)}),$.command("disconnect",async a=>{let b=a.from?.id?.toString();b&&(await e.f.delete(f.f).where((0,g.u)(f.f.telegramUserId,b)),await e.f.update(f.Y).set({youtubeConnected:!1,updatedAt:new Date}).where((0,g.u)(f.Y.telegramUserId,b)),await a.reply("✅ Akun YouTube berhasil diputus."))}),$.command("status",async a=>{let b=a.from?.id?.toString();if(!b)return;let c=await e.f.select().from(f.V).where((0,g.u)(f.V.telegramUserId,b)).orderBy((0,h.A)(f.V.createdAt)).limit(5);if(!c.length)return void await a.reply("📊 Belum ada riwayat pemrosesan video.");let d="📊 *Status Pemrosesan Terakhir:*\n\n";c.forEach(a=>{let b="done"===a.status?"✅":"clips_ready"===a.status?"🎬":"error"===a.status?"❌":"⏳",c=a.errorMessage?a.errorMessage.replace(/[_*[\]()~`>#+\-=|{}.!]/g,""):"";d+=`${b} *Video*
Status: \`${a.status}\`
`,c&&(d+=`Error: ${c}
`),d+=`Waktu: ${new Date(a.createdAt).toLocaleString("id-ID")}

`}),await a.reply(d,{parse_mode:"Markdown"})}),$.command("settings",async a=>{await W(a)}),$.command("history",async a=>{await X(a)}),$.command("cancel",async a=>{await a.reply("⛔ Proses tidak bisa dibatalkan secara manual. Tunggu hingga selesai atau error.")}),$.command("clips",async a=>{let b=(0,q.c)(),c=a.from?.id?.toString(),h=b;if(c){let a=await e.f.select().from(f.Y).where((0,g.u)(f.Y.telegramUserId,c));h=a[0]?.maxClips??b}await a.reply(`✂️ *Konfigurasi Jumlah Klip AutoClip:*

Aktif (env \`MAX_CLIPS\`): *${b} klip*
Setting akunmu: *${h} klip*

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

💡 ENV var \`MAX_CLIPS\` selalu override setting per-akun.`,{parse_mode:"Markdown",reply_markup:new d.InlineKeyboard().text("1️⃣","set_clips_1").text("2️⃣","set_clips_2").text("3️⃣","set_clips_3").text("4️⃣","set_clips_4").text("5️⃣","set_clips_5").row().text("6 klip","set_clips_6").text("7 klip","set_clips_7").text("8 klip","set_clips_8").text("9 klip","set_clips_9").text("10 klip","set_clips_10")})}),$.command("duration",async a=>{await M(a)}),$.command("niche",async a=>{let b=a.from?.id?.toString();if(!b)return;let c=(a.match||"").toString().trim();if(!c)return void await N(a);if(/^(reset|off|default|hapus|matikan)$/i.test(c)){await (0,s.O)(b);let c=(0,y.E)();await a.reply(`↩️ Niche prompt direset.

`+(c?`AI sekarang memakai default global: *"${c}"*`:"AI sekarang memilih momen viral secara umum (tanpa arahan khusus)."),{parse_mode:"Markdown"});return}let d=await (0,s.P)(b,c);await a.reply(`✅ *Niche Prompt diset!*

AI Analysis sekarang akan diarahkan dengan fokus:
*"${d}"*

💡 Berlaku untuk video berikutnya yang kamu kirim. Reset kapan saja dengan \`/niche reset\`.`,{parse_mode:"Markdown"})}),$.callbackQuery(/^niche_preset_(\d+)$/,async a=>{let b=a.from.id.toString(),c=y.k[parseInt(a.match[1],10)];if(!c)return void await a.answerCallbackQuery("❌ Preset tidak ditemukan");let d=await (0,s.P)(b,c.prompt);await a.answerCallbackQuery(`✅ Niche diset: ${c.label}`),await a.editMessageText(`✅ *Niche Prompt diset ke "${c.label}"!*

AI Analysis sekarang akan diarahkan dengan fokus:
*"${d}"*

💡 Ubah lagi kapan saja lewat /niche.`,{parse_mode:"Markdown"})}),$.callbackQuery("niche_reset",async a=>{let b=a.from.id.toString();await (0,s.O)(b);let c=(0,y.E)();await a.answerCallbackQuery("↩️ Niche direset"),await a.editMessageText(`↩️ Niche prompt direset.

`+(c?`AI sekarang memakai default global: *"${c}"*`:"AI sekarang memilih momen viral secara umum (tanpa arahan khusus)."),{parse_mode:"Markdown"})}),$.callbackQuery("niche_menu",async a=>{await a.answerCallbackQuery(),await N(a)}),(0,t.f)($),(0,u.f)($),(0,v.H)($),(0,w.g)($),(0,x.O)($),(0,J.Q)($),$.command("dupfilter",async a=>{let b=(0,z.h)(),c=await (0,A.A)();await a.reply(`🧹 *Duplicate/Repetitive Clip Filter*

Status: ${b.enabled?"✅ Aktif":"❌ Nonaktif"}
Cakupan pembanding: *${(0,z.E)(b.scope)}* (\`${b.scope}\`)
Ambang kemiripan teks: ${Math.round(100*b.textThreshold)}%
Ambang overlap waktu: ${Math.round(100*b.timeOverlapThreshold)}%
Lookback: ${0===b.lookbackDays?"tanpa batas":`${b.lookbackDays} hari terakhir`}

📊 Total klip disaring (semua user): *${c.totalSkipped}*
📊 Total sidik jari klip tersimpan: *${c.totalFingerprints}*

Fitur ini otomatis mencegah AutoClip membuat klip dengan konten mirip/berulang ketika source video yang sama diproses lebih dari sekali.

*Cara Ubah (Railway Variables):*
• \`DUPLICATE_FILTER_ENABLED\` = \`true\` / \`false\`
• \`DUPLICATE_FILTER_SCOPE\` = \`source\` | \`user\` | \`global\`
• \`DUPLICATE_FILTER_TEXT_THRESHOLD\` = \`0.0\` sampai \`1.0\` (default 0.72)
• \`DUPLICATE_FILTER_TIME_OVERLAP_THRESHOLD\` = \`0.0\` sampai \`1.0\` (default 0.6)
• \`DUPLICATE_FILTER_LOOKBACK_DAYS\` = jumlah hari, \`0\` = tanpa batas (default 30)`,{parse_mode:"Markdown"})}),$.command("jadwal",async a=>{let b=a.from?.id?.toString();if(!b)return;let c=await (0,p.f)(b);if(!c.length)return void await a.reply("🗓 Belum ada video yang dijadwalkan.");let d="🗓 *Antrean Jadwal Upload Anda:*\n\n";c.forEach((a,b)=>{d+=`${b+1}. Waktu: ${(0,p.b)(new Date(a.scheduledAt))} (Mode: ${a.mode})
`}),await a.reply(d,{parse_mode:"Markdown"})}),$.command("mode",async a=>{let b=(0,q._)(),c=(0,q.y)(b);await a.reply(`📐 *Mode Aspect Ratio 9:16 Aktif:*

Mode: *${c}* (\`${b}\`)

*Semua Mode:*
• \`blur\` → 🌀 Background blur (REKOMENDASI)
• \`crop\` → ✂️ Center crop
• \`pad\` → ⬛ Black bars
• \`stretch\` → ↔️ Stretch paksa
• \`none\` → 📐 Original ratio

Ubah: set \`ASPECT_RATIO_MODE=blur\` di Railway Variables`,{parse_mode:"Markdown"})}),$.command("thumbnail",async a=>{let b=(0,q.e)(),c=(0,q.w)(b.mode);await a.reply(`🖼 *Konfigurasi Thumbnail:*

Status: ${b.enabled?"✅ Aktif":"❌ Nonaktif"}
Mode: *${c}* (\`${b.mode}\`)
Kualitas: ${b.quality}/31
Resolusi: ${b.width}\xd7${0===b.height?"auto":b.height}

*Cara Ubah (Railway Variables):*
• \`THUMBNAIL_ENABLED\` = \`true\` / \`false\`
• \`THUMBNAIL_MODE\` = \`middle\` | \`best\` | \`start\` | \`custom\`
• \`THUMBNAIL_QUALITY\` = \`1\` sampai \`31\`
• \`THUMBNAIL_WIDTH\` = lebar (default: 1280)
• \`THUMBNAIL_HEIGHT\` = tinggi (default: 720)
• \`THUMBNAIL_OFFSET_SECONDS\` = detik (untuk mode custom)`,{parse_mode:"Markdown"})}),$.command("watermark",async a=>{let b=(0,q.K)(),c=(0,q.Z)(b.position);await a.reply(`💧 *Konfigurasi Watermark:*

Status: ${b.enabled?"✅ Aktif":"❌ Nonaktif"}
Teks: \`${b.text}\`
Posisi: *${c}* (\`${b.position}\`)
Font Size: ${b.fontSize}px
Warna: ${b.color} (opacity: ${b.opacity})
Kotak: ${b.box?"✅ Ada":"❌ Tidak"}
`+(b.imagePath?`Gambar: \`${b.imagePath}\`
`:"")+`
*Cara Ubah (Railway Variables):*
`+"• `WATERMARK_ENABLED` = `true` / `false`\n• `WATERMARK_TEXT` = `@NamaChannel` ← *teks watermark Anda*\n• `WATERMARK_POSITION` = `topleft` | `topright` | `bottomleft` | `bottomright` | `center`\n• `WATERMARK_FONT_SIZE` = ukuran font (default: 32)\n• `WATERMARK_COLOR` = `white` / `yellow` / `#FF0000`\n• `WATERMARK_OPACITY` = `0.0` sampai `1.0` (default: 0.85)\n• `WATERMARK_BOX` = `true` / `false` (kotak background)\n• `WATERMARK_BOX_COLOR` = `black@0.4` (transparansi kotak)\n• `WATERMARK_IMAGE_PATH` = path ke file logo PNG (opsional)\n• `WATERMARK_IMAGE_SCALE` = `0.15` (skala gambar, 0.01-1.0)",{parse_mode:"Markdown"})}),$.command("zoom",async a=>{let b=(0,q.n)(),c=(0,q.z)(b.type);await a.reply(`🔍 *Konfigurasi Zoom Effect pada Highlight:*

Status: ${b.enabled?"✅ Aktif":"❌ Nonaktif"}
Mode: \`${b.mode}\` (auto/always/never)
Tipe: *${c}* (\`${b.type}\`)
Intensitas: ${b.intensity}\xd7 (1.0 = tidak zoom, 1.3 = kuat)
Durasi: ${b.duration} detik
Min Score (auto): ${b.minScore}/10

*Cara Ubah (Railway Variables):*
• \`ZOOM_EFFECT_ENABLED\` = \`true\` / \`false\`
• \`ZOOM_EFFECT_MODE\` = \`auto\` | \`always\` | \`never\`
• \`ZOOM_EFFECT_TYPE\` = \`in\` | \`out\` | \`in-out\` | \`pulse\`
• \`ZOOM_EFFECT_INTENSITY\` = \`1.05\` (subtle) sampai \`1.3\` (strong)
• \`ZOOM_EFFECT_DURATION\` = durasi dalam detik (default: 2.0)
• \`ZOOM_EFFECT_MIN_SCORE\` = min viral score 1-10 (default: 7)`,{parse_mode:"Markdown"})}),$.command("autoreframe",async a=>{let b=(0,B.P)(),c=(0,B.B)(b.backend);await a.reply(`🎯 *Auto-Reframe Speaker Tracking:*

Status: ${b.enabled?"✅ Aktif":"❌ Nonaktif"}
Backend deteksi wajah: *${c}*
Sample rate: ${b.sampleFps} fps
Smoothing: ${b.smoothing} (0=responsif, 0.95=sangat halus)
Padding wajah: ${b.padding}
Fallback kalau wajah tidak terdeteksi: \`${b.fallbackMode}\`

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

💡 Tidak ada wajah terdeteksi / backend error → otomatis fallback ke crop statis, proses tetap aman.`,{parse_mode:"Markdown"})}),$.command("subtitle",async a=>{let b=String(a.match||"").toLowerCase().split(/\s+/).filter(Boolean),c=b.find(a=>(0,D.y)("hormozi"===a?"alex-hormozi":a)),e=b.find(a=>(0,D.H)(a));if(c)return void await O(a,"hormozi"===c?"alex-hormozi":c,e);let f=(0,D.h)(),g=new d.InlineKeyboard;D.b.forEach((a,b)=>{g.text(`${a===f.style?"✅ ":""}${D.u[a].label}`,`sub_prev_${a}`),b%2==1&&g.row()}),await a.reply(`💬 *Subtitle / Caption Burn-In:*

Status: ${f.enabled?"✅ Aktif":"❌ Nonaktif"}
Style: *${(0,D.U)(f.style)}* (\`${f.style}\`)
Ukuran font: ${f.fontSize}px • Font: \`${f.font}\`
Warna: \`${f.color}\` • Highlight: \`${f.highlightColor}\`
Posisi: *${(0,D.D)(f.position)}* (\`${f.position}\`)
Maks kata/baris: ${f.maxWordsPerLine}
Animasi: \`${f.animation}\`

*Style tersedia:*
`+D.b.map(a=>`• \`${a}\` → ${D.u[a].description}`).join("\n")+"\n\n*Preview:* tekan tombol di bawah, atau ketik `/subtitle karaoke`, `/subtitle alex-hormozi fade`.\n\n"+`*Cara Ubah (Railway Variables):*
`+"• `SUBTITLE_ENABLED` = `true` / `false`\n"+`• \`SUBTITLE_STYLE\` = ${D.b.map(a=>`\`${a}\``).join(" | ")}
`+"• `SUBTITLE_FONT_SIZE` = ukuran dasar (default: 48)\n• `SUBTITLE_COLOR` = `white` / `#FFFFFF`\n• `SUBTITLE_HIGHLIGHT_COLOR` = `yellow` / `#FFE500`\n"+`• \`SUBTITLE_POSITION\` = ${D.W.map(a=>`\`${a}\``).join(" | ")}
`+"• `SUBTITLE_MAX_WORDS_PER_LINE` = 1-8 (default: 4)\n"+`• \`SUBTITLE_ANIMATION\` = ${D.Q.map(a=>`\`${a}\``).join(" | ")}

`+"ℹ️ Subtitle memakai timestamp per kata dari Whisper (butuh `OPENAI_API_KEY` atau `GROQ_API_KEY`). Tanpa transkripsi, klip tetap dibuat tanpa subtitle.",{parse_mode:"Markdown",reply_markup:g})}),$.callbackQuery(RegExp(`^sub_prev_(${D.b.join("|")})$`),async a=>{let b=a.match[1];await a.answerCallbackQuery({text:`Membuat preview ${b}...`}),await O(a,b)}),$.command("hook",async a=>{let b=(0,F.U)();await a.reply(`🪝 *AI Hook Overlay (Teks Pembuka):*

Status: ${b.enabled?"✅ Aktif":"❌ Nonaktif"}
Style: *${(0,F.p)(b.style)}* (\`${b.style}\`)
Durasi: ${b.duration} detik pertama
Font: ${b.fontSize}px • Warna: \`${b.color}\` • Latar: \`${b.bgColor}\`

*Style tersedia:*
`+F.P.map(a=>`• \`${a}\` → ${F.g[a].description}`).join("\n")+`

*Contoh hook AI:*
`+`• "Kamu gak akan percaya apa yang terjadi selanjutnya..."
`+`• "99% orang salah soal ini!"
`+`• "Ini rahasia yang CEO gak mau kamu tahu"

`+`*Cara Ubah (Railway Variables):*
`+"• `HOOK_ENABLED` = `true` / `false`\n• `HOOK_DURATION` = detik (default: 2)\n"+`• \`HOOK_STYLE\` = ${F.P.map(a=>`\`${a}\``).join(" | ")}
`+"• `HOOK_FONT_SIZE` = ukuran font (default: 56)\n• `HOOK_COLOR` = `white` / `#FFFFFF`\n• `HOOK_BG_COLOR` = `#FF0000`\n\nℹ️ Hook dibuat AI bersamaan dengan analisis momen viral, lalu di-render ke video lewat FFmpeg.",{parse_mode:"Markdown"})}),$.command("autocomment",async a=>{let b=(0,G.q)(),c=(0,G.c)();await a.reply(`💬 *Auto-First Comment (Pancingan Algoritma):*

Status: ${b?"✅ Aktif":"❌ Nonaktif"}
Gaya: *${(0,G.s)()}* (\`${(0,G.h)()}\`)
Maks panjang: ${(0,G.L)()} karakter
Suffix: ${c?`\`${c.replace(/`/g,"'")}\``:"—"}
Video target: ${(0,G._)().join(", ")}
Percobaan: ${(0,G.S)()}x • Jeda setelah upload: ${(0,G.t)()} dtk
Komentar cadangan: ${(0,G.v)()?"✅":"❌"} • Link untuk pin: ${(0,G.C)()?"✅":"❌"}

*Gaya tersedia:*
`+G.Z.map(a=>`• \`${a}\` → ${G.w[a].description}`).join("\n")+`

*Contoh komentar:*
`+G.a.map(a=>`• "${P(a)}"`).join("\n")+`

*Cara Ubah (Railway Variables):*
`+"• `YOUTUBE_AUTO_COMMENT_ENABLED` = `true` / `false`\n"+`• \`YOUTUBE_AUTO_COMMENT_STYLE\` = ${G.Z.map(a=>`\`${a}\``).join(" | ")}
`+"• `YOUTUBE_AUTO_COMMENT_SUFFIX` = teks tambahan (mis. Full video di channel @kamu)\n• `YOUTUBE_AUTO_COMMENT_PROMPT` = arahan tambahan untuk AI\n\nℹ️ AI membuat komentar bersamaan dengan analisis klip, lalu bot memposting via `commentThreads.insert` setelah video terupload. Butuh izin baru: kirim /connect sekali lagi setelah fitur diaktifkan. YouTube API tidak bisa mem-pin otomatis — bot mengirim link komentar untuk kamu pin manual.",{parse_mode:"Markdown"})}),$.command("introoutro",async a=>{let b=(0,q.E)();await a.reply(`🎬 *Konfigurasi Intro / Outro Otomatis:*

*INTRO:*
Status: ${b.introEnabled?"✅ Aktif":"❌ Nonaktif"}
`+(b.introVideoPath?`File: \`${b.introVideoPath}\`
`:`Mode: Auto-generate (${b.introDuration}s)
`)+`Teks: \`${b.introText}\`
`+`Warna BG: \`${b.introColor}\`

`+`*OUTRO:*
`+`Status: ${b.outroEnabled?"✅ Aktif":"❌ Nonaktif"}
`+(b.outroVideoPath?`File: \`${b.outroVideoPath}\`
`:`Mode: Auto-generate (${b.outroDuration}s)
`)+`Teks: \`${b.outroText}\`
`+`Warna BG: \`${b.outroColor}\`

`+`*Cara Ubah (Railway Variables):*
`+"• `INTRO_ENABLED` = `true` / `false`\n• `INTRO_VIDEO_PATH` = path ke file intro.mp4 (opsional)\n• `INTRO_DURATION` = durasi intro otomatis dalam detik (default: 3)\n• `INTRO_TEXT` = teks pada intro otomatis\n• `INTRO_COLOR` = warna background (`#000000` = hitam)\n• `OUTRO_ENABLED` = `true` / `false`\n• `OUTRO_VIDEO_PATH` = path ke file outro.mp4 (opsional)\n• `OUTRO_DURATION` = durasi outro otomatis dalam detik (default: 3)\n"+`• \`OUTRO_TEXT\` = teks pada outro (misal: \`Subscribe! 🔔\`)
`+"• `OUTRO_COLOR` = warna background outro\n\n"+`💡 *Tips:* Jika tidak ada file video, intro/outro akan di-generate otomatis menggunakan FFmpeg dengan teks yang Anda set.`,{parse_mode:"Markdown"})});let aa=`

☁️ *Google Drive (auto-upload)*
/drive — status & hubungkan akun
/drivefolder <link> — ganti folder tujuan
/driveon /driveoff — nyalakan/matikan auto-upload`,ab=`

📡 *Auto-Monitor Channel/Playlist*
/monitor <link> — pantau channel/playlist, auto-clip tiap ada upload baru
/monitors — lihat & kelola daftar yang dipantau
/unmonitor <id> — berhenti memantau
/monitoron /monitoroff <id> — nyala/matikan sementara
/monitorinterval <id> <menit> — ubah jeda pengecekan
/monitorupload <id> on|off — atur auto-upload YouTube`,ac=`

💬 *Auto-First Comment*
/autocomment — info komentar pancingan otomatis di video yang diupload`;function P(a){return a.replace(/([_*`\[\]])/g,"\\$1")}async function Q(a){let b=a.from?.id?.toString();if(!b)return;if(!(0,r.D)())return void await a.reply(`☁️ *Google Drive belum dikonfigurasi di server.*

Set variabel berikut di Railway:
• \`GOOGLE_CLIENT_ID\`
• \`GOOGLE_CLIENT_SECRET\`
• \`GOOGLE_REDIRECT_URI\`

Lalu aktifkan *Google Drive API* di Google Cloud Console.`,{parse_mode:"Markdown"});let c=await (0,r.h)(b),e=new d.InlineKeyboard,f=`☁️ *Google Drive Auto-Upload*

`;c.globallyEnabled||(f+="⛔ Fitur dimatikan oleh admin (`GOOGLE_DRIVE_ENABLED=false`).\n\n"),c.connected?(f+=`Status: ✅ Terhubung${c.email?` (\`${P(c.email)}\`)`:""}
Auto-upload: *${c.autoUpload?"✅ Aktif":"❌ Nonaktif"}*
📁 Folder: *${P(c.folderLabel)}*
🗂 Subfolder per video: *${c.subfolderPerJob?"Ya":"Tidak"}*
🔗 Link: *${"anyone"===c.share?"Siapa saja yang punya link":"Privat"}*

*Ganti folder tujuan:*
\`/drivefolder https://drive.google.com/drive/folders/XXXX\`
\`/drivefolder reset\` → kembali ke default

*Ganti akun Google:* tekan "Ganti Akun" lalu login dengan akun lain.`,e.text(c.autoUpload?"⏸ Matikan Auto-Upload":"▶️ Nyalakan Auto-Upload","drive_toggle").row(),c.folderUrl&&e.url("📂 Buka Folder",c.folderUrl).row(),"user"===c.folderSource&&e.text("↩️ Reset Folder","drive_reset_folder").row(),e.url("🔄 Ganti Akun",(0,r.$)(b)).row(),e.text("🔌 Putuskan Drive","drive_disconnect")):(f+=`Status: ❌ Belum terhubung

Hubungkan akun Google agar setiap klip hasil AutoClip otomatis tersimpan di Drive-mu.`,e.url("🔗 Hubungkan Google Drive",(0,r.$)(b))),await a.reply(f,{parse_mode:"Markdown",reply_markup:e})}async function R(a,b){let c=a.from?.id?.toString();if(!c)return;let d=parseInt((a.match||"").toString().trim(),10);if(!d)return void await a.reply(`Gunakan: \`/monitor${b?"on":"off"} <id>\` (lihat id lewat /monitors)`,{parse_mode:"Markdown"});let e=await (0,H.q)(d,c,b);await a.reply(e?`✅ Monitor #${d} ${b?"diaktifkan 🟢":"dinonaktifkan ⏸"}.`:`❌ Monitor #${d} tidak ditemukan.`)}async function S(a,b){let c=a.from?.id?.toString(),h=a.chat?.id?.toString(),k=a.message?.message_id;if(!c||!h)return;await Y(c);let m=(0,j.y)(b);if("unknown"===m)return void await a.reply(l.Z.invalidUrl,{parse_mode:"Markdown"});if(!await (0,J.N)(a,c)||!await (0,x.g)(a,c))return;let n=(0,i.f)();await e.f.insert(f.V).values({jobId:n,telegramUserId:c,telegramChatId:h,telegramMessageId:k,sourceUrl:b,platform:m,status:"queued"});let o=(await e.f.select().from(f.f).where((0,g.u)(f.f.telegramUserId,c))).length>0,p=(0,q._)(),s=(0,q.y)(p),t=(0,q.K)(),u=(0,q.n)(),v=(0,q.E)(),w=(0,q.c)(),y=await (0,r.h)(c).catch(()=>null),z=y?.configured&&y.globallyEnabled?`
☁️ Google Drive: *${y.connected?y.autoUpload?"✅ Auto-upload aktif":"⏸ Dimatikan":"❌ Belum terhubung (/drive)"}*`:"",A=`📐 Mode 9:16: *${s}*
✂️ AutoClip: *${w} klip* (ubah: \`MAX_CLIPS\` atau /clips)
💧 Watermark: *${t.enabled?`✅ "${t.text}"`:"❌ Nonaktif"}*
🔍 Zoom Effect: *${u.enabled?`✅ ${u.mode} (${u.type})`:"❌ Nonaktif"}*
🎬 Intro/Outro: *${v.introEnabled||v.outroEnabled?"✅ Aktif":"❌ Nonaktif"}*`+z;o?await a.reply(`${(0,l.h)(m)} *Video terdeteksi!*

Platform: ${m.toUpperCase()}
URL: \`${b.slice(0,50)}${b.length>50?"...":""}\`

${A}

Pilih format output:`,{parse_mode:"Markdown",reply_markup:new d.InlineKeyboard().text(`📱 Vertikal 9:16 (${s})`,`process_v_${n}`).row().text("🎬 Original (Keep Ratio)",`process_o_${n}`)}):await a.reply(`${(0,l.h)(m)} *Video terdeteksi!*

⚠️ YouTube belum terhubung. Klip akan dikirim ke Telegram saja.

${A}

Hubungkan YouTube untuk auto-upload ke YouTube Studio!`,{parse_mode:"Markdown",reply_markup:new d.InlineKeyboard().url("🔗 Hubungkan YouTube",await V(c)).row().text("▶️ Proses Tanpa YouTube",`process_${n}`)})}async function T(a,b,c=!0){let h=a.chat?.id;if(!h)return;let i=(await e.f.select().from(f.V).where((0,g.u)(f.V.jobId,b)))[0],j=i?`${(0,l.h)(i.platform)}${i.platform.toUpperCase()}`:"Video",k=i?.sourceUrl?`  \`${i.sourceUrl.slice(0,60)}${i.sourceUrl.length>60?"...":""}\``:void 0,q=new n.f({api:a.api,chatId:h,jobId:b,title:j,jobLabel:k});await q.start();let r=async(a,b,c)=>{(b&&b.replace(/([_*`\[\]])/g,"\\$1"),"error"===a)?await q.fail(b):await q.update(c?.step??a,{detail:b,percent:c?.percent})};try{(0,o.q)()?await (0,m.processClipsOnly)(b,r):await (0,m.processJob)(b,r);let c=(await e.f.select().from(f.V).where((0,g.u)(f.V.jobId,b)))[0];if(("done"===c.status||"clips_ready"===c.status)&&c.clips){let i=c.clips.filter(a=>a.filePath);await q.finishSuccess(`  *${i.length} klip berhasil dibuat!* Mengirim ke chat...`);for(let b=0;b<i.length;b++){let c=i[b];if(!c.filePath||!C.default.existsSync(c.filePath))continue;let e=[`  Klip ${b+1}/${i.length}`,`  ${c.title}`,"",`  Durasi: ${c.duration}s`,`  Viral Score: ${c.viralScore}/10`,`  ${c.reason}`,c.thumbnailPath?"  Thumbnail: ✅":"",c.youtubeUrl?`
  YouTube: ${c.youtubeUrl}`:"",c.driveUrl?`
  Drive: ${c.driveUrl}`:""].join("\n").trim();try{c.thumbnailPath&&C.default.existsSync(c.thumbnailPath)&&await a.api.sendPhoto(h,new d.InputFile(c.thumbnailPath),{caption:`  Thumbnail Klip ${b+1}`,parse_mode:"HTML"}),await a.api.sendVideo(h,new d.InputFile(c.filePath),{caption:e,parse_mode:"HTML"})}catch(a){console.error(`Failed to send clip ${b+1}:`,a)}}if("clips_ready"===c.status){let i=await e.f.select().from(f.Y).where((0,g.u)(f.Y.telegramUserId,h.toString())),j=await (0,p.R)(i[0]?.nichePrompt,c.platform),k=new d.InlineKeyboard;k.text("🚀 Post Sekarang",`publish_now_${b}`).row(),j.slots.forEach(a=>{k.text(`🤖 AI: ${a.label}`,`sched_ai_${a.date.getTime()}_${b}`).row()});let l=j.reason.replace(/[_*[\]()~`>#+\-=|{}.!]/g," ");await a.api.sendMessage(h,`✅ *Klip Siap!*

🤖 *Rekomendasi AI (${j.nicheLabel}):*
${l}

Kapan klip ingin dipublish ke YouTube?`,{parse_mode:"Markdown",reply_markup:k})}else{let b=i.some(a=>a.youtubeUrl),c=new d.InlineKeyboard;b&&c.url("  Buka YouTube Studio","https://studio.youtube.com/channel/videos/upload").row(),c.text("  Proses Video Lain","help"),await a.api.sendMessage(h,l.Z.resultSummary(i.map(a=>({title:a.title,duration:a.duration,youtubeUrl:a.youtubeUrl,viralScore:a.viralScore,hasThumbnail:!!(a.thumbnailPath&&C.default.existsSync(a.thumbnailPath))}))),{parse_mode:"Markdown",reply_markup:c})}setTimeout(()=>{i.forEach(a=>{if(a.filePath&&C.default.existsSync(a.filePath))try{C.default.unlinkSync(a.filePath)}catch{}if(a.thumbnailPath&&C.default.existsSync(a.thumbnailPath))try{C.default.unlinkSync(a.thumbnailPath)}catch{}})},3e4)}else if("error"===c.status){let a=(c.errorMessage||"Terjadi kesalahan tidak diketahui").replace(/[_*[\]()~`>#+\-=|{}.!]/g," ");await q.finishError(a,{reply_markup:new d.InlineKeyboard().text("🔄 Coba Lagi",`retry_job_${b}`)})}}catch(c){let a=(c instanceof Error?c.message:String(c)).replace(/[_*[\]()~`>#+\-=|{}.!]/g," ");await q.finishError(a,{reply_markup:new d.InlineKeyboard().text("🔄 Coba Lagi",`retry_job_${b}`)}).catch(()=>{})}}async function U(a){let b=a.from?.id?.toString();if(!b)return;let c=await V(b);await a.reply(l.Z.connecting,{parse_mode:"Markdown",reply_markup:new d.InlineKeyboard().url("🔗 Login ke YouTube Studio",c).row().text("ℹ️ Bantuan","help")})}async function V(a){try{return(0,k.f)(a)}catch{return"https://accounts.google.com"}}async function W(a){let b=a.from?.id?.toString();if(!b)return;await Y(b);let c=(await e.f.select().from(f.Y).where((0,g.u)(f.Y.telegramUserId,b)))[0],h=await e.f.select().from(f.f).where((0,g.u)(f.f.telegramUserId,b)),i=(0,q._)(),j=(0,q.y)(i),k=(0,q.K)(),m=(0,q.n)(),n=(0,q.E)(),o=(0,q.c)(),p=(0,q.o)(),r=c.clipDuration||p,s=`

*Fitur Aktif:*
• Mode 9:16: *${j}*
• AutoClip: *${o} klip* (env \`MAX_CLIPS\`   /clips untuk ubah)
• Durasi Klip: *${r} detik* (env \`CLIP_DURATION\`   /duration untuk ubah)
• Watermark: *${k.enabled?`"${k.text}" @ ${k.position}`:"Nonaktif"}*
• Zoom Effect: *${m.enabled?`${m.mode} (${m.type})`:"Nonaktif"}*
• Intro: *${n.introEnabled?`✅ "${n.introText}"`:"❌"}* | Outro: *${n.outroEnabled?`✅ "${n.outroText}"`:"❌"}*
• 🎯 Niche Prompt: *${(0,y.L)(c.nichePrompt)}*
• 🧹 Duplicate Filter: *${(0,z.h)().enabled?`✅ Aktif (${(0,z.h)().scope})`:"❌ Nonaktif"}*

_Gunakan /clips /duration /watermark /zoom /introoutro /thumbnail /mode /niche /dupfilter untuk info detail_`,t=new d.InlineKeyboard;q.r.forEach(a=>{t.text(a===r?`✅ ${a}s`:`${a}s`,`set_duration_${a}`)}),await a.reply(l.Z.settings({maxClips:c.maxClips||o,clipDuration:r,minDuration:c.minDuration||20,maxDuration:c.maxDuration||40,defaultPrivacy:c.defaultPrivacy||"private",youtubeConnected:h.length>0})+s,{parse_mode:"Markdown",reply_markup:new d.InlineKeyboard().text("1️⃣ Klip","set_clips_1").text("2️⃣ Klip","set_clips_2").text("3️⃣ Klip","set_clips_3").text("4️⃣ Klip","set_clips_4").text("5️⃣ Klip ⭐","set_clips_5").row().append(t).row().text("🔒 Private","set_privacy_private").text("🔗 Unlisted","set_privacy_unlisted").text("🌐 Public","set_privacy_public").row().text("🎯 Niche Prompt","niche_menu").row().text("🔗 Hubungkan YouTube","connect").text("☁️ Google Drive","drive_menu")})}async function X(a){let b=a.from?.id?.toString();if(!b)return;let c=await e.f.select().from(f.V).where((0,g.u)(f.V.telegramUserId,b)).orderBy((0,h.A)(f.V.createdAt)).limit(10);if(!c.length)return void await a.reply("📭 Belum ada riwayat. Kirim link video untuk memulai!",{reply_markup:new d.InlineKeyboard().text("📚 Panduan","help")});let i={queued:"⏳",downloading:"⬇️",analyzing:"🧠",clipping:"✂️",uploading:"📤",done:"✅",error:"❌"},j=`📋 *Riwayat (${c.length} job terbaru):*

`;c.forEach((a,b)=>{let c=a.clips||[],d=c.filter(a=>a.youtubeUrl).length;j+=`${b+1}. ${i[a.status]||"❓"} *${(a.videoTitle||"Video").slice(0,35)}*
 ${(0,l.h)(a.platform)} ${a.platform} | ${a.status}`,"done"===a.status&&c.length&&(j+=` | ${c.length} klip`,d&&(j+=` (${d} di YT)`)),j+=`
`}),await a.reply(j,{parse_mode:"Markdown"})}async function Y(a){if(a&&!(await e.f.select().from(f.Y).where((0,g.u)(f.Y.telegramUserId,a))).length){let b=(0,q.c)(),c=(0,q.o)(),{min:d,max:g}=(0,q.D)(c);await e.f.insert(f.Y).values({telegramUserId:a,maxClips:b,clipDuration:c,minDuration:d,maxDuration:g,defaultPrivacy:"private",language:"id"})}}$.command("drive",async a=>{await Q(a)}),$.command("driveon",async a=>{let b=a.from?.id?.toString();b&&((await (0,r.h)(b)).connected?(await (0,r.S)(b,!0),await a.reply("✅ Auto-upload Google Drive *diaktifkan*.",{parse_mode:"Markdown"})):await Q(a))}),$.command("driveoff",async a=>{let b=a.from?.id?.toString();b&&((await (0,r.h)(b)).connected?(await (0,r.S)(b,!1),await a.reply("⏸ Auto-upload Google Drive *dimatikan*. Nyalakan lagi dengan /driveon.",{parse_mode:"Markdown"})):await a.reply("☁️ Google Drive belum terhubung."))}),$.command("drivedisconnect",async a=>{let b=a.from?.id?.toString();b&&(await (0,r.C)(b),await a.reply("✅ Google Drive berhasil diputus. Hubungkan lagi lewat /drive."))}),$.command("drivefolder",async a=>{let b=a.from?.id?.toString();if(!b)return;let c=(a.match||"").toString().trim(),d=await (0,r.h)(b);if(!d.connected)return void await Q(a);if(!c)return void await a.reply(`📁 *Folder tujuan saat ini:* ${P(d.folderLabel)}

Ganti dengan:
\`/drivefolder <link folder Google Drive>\`
Kembali ke default:
\`/drivefolder reset\``,{parse_mode:"Markdown"});if(/^(reset|default)$/i.test(c)){await (0,r.f)(b);let c=await (0,r.h)(b);await a.reply(`↩️ Folder direset ke default: *${P(c.folderLabel)}*`,{parse_mode:"Markdown"});return}try{let d=await (0,r.b)(b,c);await a.reply(`✅ Folder tujuan diganti ke: *${P(d.name)}*
Klip berikutnya akan masuk ke folder ini.`,{parse_mode:"Markdown"})}catch(b){await a.reply(`❌ ${b instanceof Error?b.message:String(b)}`)}}),$.callbackQuery("drive_menu",async a=>{await a.answerCallbackQuery(),await Q(a)}),$.callbackQuery("drive_toggle",async a=>{let b=a.from.id.toString(),c=await (0,r.h)(b);c.connected?(await (0,r.S)(b,!c.autoUpload),await a.answerCallbackQuery(!c.autoUpload?"✅ Auto-upload aktif":"⏸ Auto-upload mati"),await a.editMessageReplyMarkup({reply_markup:new d.InlineKeyboard}).catch(()=>{}),await Q(a)):await a.answerCallbackQuery("Drive belum terhubung")}),$.callbackQuery("drive_reset_folder",async a=>{await a.answerCallbackQuery("↩️ Folder direset"),await (0,r.f)(a.from.id.toString()),await a.editMessageReplyMarkup({reply_markup:new d.InlineKeyboard}).catch(()=>{}),await Q(a)}),$.callbackQuery("drive_disconnect",async a=>{await a.answerCallbackQuery("🔌 Drive diputus"),await (0,r.C)(a.from.id.toString()),await a.editMessageText("✅ Google Drive berhasil diputus. Hubungkan lagi kapan saja lewat /drive.")}),$.callbackQuery("monitors_menu",async a=>{await a.answerCallbackQuery();let b=a.from?.id?.toString();if(!b)return;let c=await (0,H.r)(b);if(!c.length)return void await a.reply("📡 *Auto-Monitor Channel/Playlist*\n\nBelum ada channel/playlist yang dipantau.\n\nKirim: `/monitor <link channel atau playlist YouTube>` untuk mulai memantau secara otomatis!",{parse_mode:"Markdown"});let d="📡 *Channel/Playlist yang Dipantau:*\n\n";c.forEach(a=>{d+=`*#${a.id}* — ${P(a.title||a.externalId)}
   ${a.enabled?"🟢 Aktif":"⏸ Nonaktif"} • cek tiap ${a.intervalMinutes} menit • upload: ${a.autoUpload?"✅":"❌"}

`}),d+="Kelola: `/unmonitor <id>` | Ubah cek: `/monitorinterval <id> <menit>`",await a.reply(d,{parse_mode:"Markdown"})}),$.command("monitor",async a=>{let b=a.from?.id?.toString(),c=a.chat?.id?.toString();if(!b||!c)return;if(!(0,I.E)())return void await a.reply("📡 Fitur Auto-Monitor sedang dinonaktifkan oleh admin (`CHANNEL_MONITOR_ENABLED=false`).",{parse_mode:"Markdown"});let d=(a.match||"").toString().trim();if(!d)return void await a.reply("📡 *Auto-Monitor Channel/Playlist*\n\nKirim: `/monitor <link channel atau playlist YouTube>`\n\nContoh:\n`/monitor https://www.youtube.com/@namachannel`\n`/monitor https://www.youtube.com/playlist?list=PLxxxxxx`\n\nBot akan otomatis mengecek upload baru secara berkala dan langsung memotong + mengupload klip TANPA kamu perlu kirim link lagi. Lihat daftar: /monitors",{parse_mode:"Markdown"});let e=await (0,H.g)(b),f=(0,I.R)();if(e>=f)return void await a.reply(`❌ Batas maksimal *${f} channel/playlist* per akun sudah tercapai. Hapus salah satu dulu dengan /unmonitor.`,{parse_mode:"Markdown"});let g=await a.reply("🔎 Mengecek & mendaftarkan channel/playlist...");try{let e=await (0,H.Y)({telegramUserId:b,telegramChatId:c,url:d});await a.api.editMessageText(c,g.message_id,`✅ *Berhasil dipantau!*

📡 ${P(e.title||e.externalId)}
Jenis: ${"playlist"===e.sourceType?"Playlist":"Channel"}
Cek tiap: ${e.intervalMinutes} menit
Auto-upload: ${e.autoUpload?"✅ Aktif":"❌ Nonaktif"}

Upload baru akan otomatis di-clip & dikirim ke chat ini — tidak perlu kirim link manual lagi!

Kelola: /monitors`,{parse_mode:"Markdown"})}catch(b){await a.api.editMessageText(c,g.message_id,`❌ Gagal mendaftarkan: ${b instanceof Error?b.message:String(b)}

Pastikan link channel/playlist valid. Kalau channel pakai @handle baru, coba juga versi link \`/channel/UCxxxx\`.`,{parse_mode:"Markdown"}).catch(()=>{})}}),$.command("monitors",async a=>{let b=a.from?.id?.toString();if(!b)return;let c=await (0,H.r)(b);if(!c.length)return void await a.reply("📡 Belum ada channel/playlist yang dipantau.\n\nTambahkan dengan: `/monitor <link>`",{parse_mode:"Markdown"});let d="📡 *Channel/Playlist yang Dipantau:*\n\n";c.forEach(a=>{d+=`*#${a.id}* — ${P(a.title||a.externalId)}
   ${a.enabled?"🟢 Aktif":"⏸ Nonaktif"} • cek tiap ${a.intervalMinutes} menit • upload: ${a.autoUpload?"✅":"❌"} • ${a.totalVideosProcessed} video diproses
`,a.lastCheckedAt&&(d+=`   Cek terakhir: ${new Date(a.lastCheckedAt).toLocaleString("id-ID")}
`),a.lastError&&(d+=`   ⚠️ Error terakhir: ${P(a.lastError).slice(0,120)}
`),d+="\n"}),d+="Kelola:\n`/unmonitor <id>` — hapus\n`/monitoron <id>` / `/monitoroff <id>` — nyala/matikan\n`/monitorinterval <id> <menit>` — ubah jeda cek\n`/monitorupload <id> on|off` — atur auto-upload YouTube",await a.reply(d,{parse_mode:"Markdown"})}),$.command("unmonitor",async a=>{let b=a.from?.id?.toString();if(!b)return;let c=parseInt((a.match||"").toString().trim(),10);if(!c)return void await a.reply("Gunakan: `/unmonitor <id>` (lihat id lewat /monitors)",{parse_mode:"Markdown"});let d=await (0,H.y)(c,b);await a.reply(d?`✅ Monitor #${c} dihapus.`:`❌ Monitor #${c} tidak ditemukan.`)}),$.command("monitoron",async a=>{await R(a,!0)}),$.command("monitoroff",async a=>{await R(a,!1)}),$.command("monitorinterval",async a=>{let b=a.from?.id?.toString();if(!b)return;let[c,d]=(a.match||"").toString().trim().split(/\s+/),e=parseInt(c,10),f=parseInt(d,10);if(!e||!f)return void await a.reply("Gunakan: `/monitorinterval <id> <menit>` — contoh: `/monitorinterval 1 15`",{parse_mode:"Markdown"});let g=await (0,H.h)(e,b,f);await a.reply(g?`✅ Monitor #${e} akan dicek tiap ${f} menit.`:`❌ Monitor #${e} tidak ditemukan.`)}),$.command("monitorupload",async a=>{let b=a.from?.id?.toString();if(!b)return;let[c,d]=(a.match||"").toString().trim().split(/\s+/),e=parseInt(c,10);if(!e||!/^(on|off)$/i.test(d||""))return void await a.reply("Gunakan: `/monitorupload <id> on|off`",{parse_mode:"Markdown"});let f=await (0,H.s)(e,b,/^on$/i.test(d));await a.reply(f?`✅ Auto-upload monitor #${e} di-set ke ${/^on$/i.test(d)?"ON ✅":"OFF ❌"}.`:`❌ Monitor #${e} tidak ditemukan.`)}),$.on("message:text",async a=>{let b=a.message.text,c=b.match(_);if(!c){if(b.startsWith("/"))return;await a.reply("Kirim link video YouTube, Facebook, TikTok, atau Instagram untuk mulai! 🎬\n\nGunakan /help untuk panduan lengkap.",{reply_markup:new d.InlineKeyboard().text("📚 Panduan","help").text("🔗 Hubungkan YouTube","connect")});return}await S(a,c[0])}),$.callbackQuery("help",async a=>{await a.answerCallbackQuery(),await a.reply(l.Z.help,{parse_mode:"Markdown"})}),$.callbackQuery("connect",async a=>{await a.answerCallbackQuery(),await U(a)}),$.callbackQuery("settings",async a=>{await a.answerCallbackQuery(),await W(a)}),$.callbackQuery("history",async a=>{await a.answerCallbackQuery(),await X(a)}),$.callbackQuery(/^set_clips_(\d+)$/,async a=>{let b=a.from.id.toString(),c=parseInt(a.match[1]);if(c<1||c>10)return void await a.answerCallbackQuery("❌ Nilai tidak valid (1-10)");await a.answerCallbackQuery(`✅ Maksimal klip diset ke ${c}`),await e.f.update(f.Y).set({maxClips:c,updatedAt:new Date}).where((0,g.u)(f.Y.telegramUserId,b));let d=(0,q.c)();await a.editMessageText(`✅ Setting akun: Maksimal *${c} klip* per video.

💡 Catatan: env var \`MAX_CLIPS=${d}\` selalu override setting ini.`,{parse_mode:"Markdown"})}),$.callbackQuery(/^set_duration_(\d+)$/,async a=>{let b=a.from.id.toString(),c=parseInt(a.match[1],10);if(!(0,q.h)(c))return void await a.answerCallbackQuery(`❌ Nilai tidak valid (pilih: ${q.r.join(", ")})`);let{min:d,max:h}=(0,q.D)(c);await a.answerCallbackQuery(`✅ Durasi klip diset ke ${c} detik`),await e.f.update(f.Y).set({clipDuration:c,minDuration:d,maxDuration:h,updatedAt:new Date}).where((0,g.u)(f.Y.telegramUserId,b));let i=(0,q.o)();await a.editMessageText(`✅ Setting akun: Durasi klip *${c} detik* per Shorts.

💡 Catatan: env var \`CLIP_DURATION=${i}\` dipakai sebagai default untuk user baru.`,{parse_mode:"Markdown"})}),$.callbackQuery(/^set_privacy_(private|unlisted|public)$/,async a=>{let b=a.from.id.toString(),c=a.match[1];await a.answerCallbackQuery(`✅ Privacy diset ke ${c}`),await e.f.update(f.Y).set({defaultPrivacy:c,updatedAt:new Date}).where((0,g.u)(f.Y.telegramUserId,b)),await a.editMessageText(`✅ Privacy video diset ke: *${c}*`,{parse_mode:"Markdown"})}),$.callbackQuery(/^retry_job_(.+)$/,async a=>{let b=a.match[1];(await a.answerCallbackQuery("🔄 Mencoba ulang..."),(await e.f.select().from(f.V).where((0,g.u)(f.V.jobId,b))).length)?(await e.f.update(f.V).set({status:"queued",errorMessage:null,updatedAt:new Date}).where((0,g.u)(f.V.jobId,b)),await T(a,b,!0)):await a.reply("❌ Job tidak ditemukan.")}),$.callbackQuery(/^process_v_(.+)$/,async a=>{let b=a.match[1];await a.answerCallbackQuery("  Memproses video..."),await a.editMessageText("  Memulai proses... Mohon tunggu!",{parse_mode:"Markdown"}),T(a,b,!0).catch(console.error)}),$.callbackQuery(/^process_o_(.+)$/,async a=>{let b=a.match[1];await a.answerCallbackQuery("  Memproses video..."),await a.editMessageText("  Memulai proses... Mohon tunggu!",{parse_mode:"Markdown"}),T(a,b,!1).catch(console.error)}),$.callbackQuery(/^process_(.+)$/,async a=>{let b=a.match[1];b.startsWith("v_")||b.startsWith("o_")||(await a.answerCallbackQuery("  Memproses video..."),await a.editMessageText("  Memulai proses... Mohon tunggu!",{parse_mode:"Markdown"}),T(a,b,!0).catch(console.error))}),$.catch(a=>{console.error("Bot error:",a),(0,K.m)("Bot error",a.error??a,{userId:a.ctx?.from?.id})}),$.callbackQuery(/^publish_now_(.+)$/,async a=>{let b=a.match[1];await a.editMessageReplyMarkup({reply_markup:new d.InlineKeyboard}),await a.reply("🚀 Memulai upload ke YouTube...");try{await (0,m.publishJobClips)(b),await a.reply("✅ Upload selesai! Cek Draft YouTube Studio Anda.")}catch(b){await a.reply("❌ Upload gagal: "+String(b))}}),$.callbackQuery(/^sched_ai_(\d+)_(.+)$/,async a=>{let b=parseInt(a.match[1],10),c=a.match[2],e=a.from.id.toString();await a.answerCallbackQuery("🗓 Menjadwalkan klip..."),await a.editMessageReplyMarkup({reply_markup:new d.InlineKeyboard});let f=new Date(b);await (0,p.d)({jobId:c,telegramUserId:e,telegramChatId:a.chat?.id?.toString()||e,mode:"ai_recommended",scheduledAt:f}),await a.reply(`✅ *Berhasil Dijadwalkan!*

Klip akan di-upload otomatis pada:
🗓 *${(0,p.b)(f)}*`,{parse_mode:"Markdown"})}),a.s(["f",0,$]),c()}catch(a){c(a)}},!1),38073,a=>a.a(async(b,c)=>{try{var d=a.i(51674),e=a.i(94758),f=a.i(37137),g=a.i(5270),h=b([e]);function i(a){return a?a.replace(/([_*`\[])/g,"\\$1"):""}[e]=h.then?(await h)():h;let j=null;a.s(["f",0,class{api;chatId;jobId;title;jobLabel;steps;order;messageId=null;startedAt=Date.now();lastEditAt=0;lastText="";finished=!1;pendingTimer=null;enabled;constructor(a){this.api=a.api,this.chatId=a.chatId,this.jobId=a.jobId,this.title=a.title,this.jobLabel=a.jobLabel,this.enabled=(0,g.K)(),this.order=g.p.map(a=>a.id),this.steps=new Map(g.p.map(a=>[a.id,{...a,status:"pending",detail:void 0,percent:void 0}]))}isEnabled(){return this.enabled}getMessageId(){return this.messageId}async start(){let a,b=this.enabled?this.render():"⏳ *Memproses...*";try{a=await this.api.sendMessage(this.chatId,b,{parse_mode:"Markdown"})}catch(c){if((c instanceof Error?c.message:String(c)).includes("can't parse entities")){let c=b.replace(/[*_`\\]/g,"");a=await this.api.sendMessage(this.chatId,c)}else throw c}return this.messageId=a.message_id,this.lastText=b,this.messageId}render(a){let b=[...this.steps.values()].map(a=>({...a,label:i(a.label),detail:a.detail?i(a.detail):void 0}));return(0,g.f)({title:i(this.title),jobLabel:this.jobLabel?i(this.jobLabel):void 0,steps:b,startedAt:this.startedAt,footerNote:a?i(a):void 0})}async safeEditMessage(a,b){if(!this.messageId)return;let c=a.length>3900?a.slice(0,3900)+"\n\n... _(pesan dipotong)_":a;try{await this.api.editMessageText(this.chatId,this.messageId,c,{parse_mode:"Markdown",...b})}catch(d){let a=d instanceof Error?d.message:String(d);if(a.includes("message is not modified"))return;if(a.includes("can't parse entities"))try{let a=c.replace(/[*_`\\]/g,"");await this.api.editMessageText(this.chatId,this.messageId,a,{...b});return}catch(a){console.warn("[progress-tracker] gagal fallback edit pesan:",a);return}console.warn("[progress-tracker] gagal edit pesan:",a)}}async persist(a){try{await (!j&&(j=(async()=>{await e.f.execute(d.B`
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
      `)})().catch(a=>{throw j=null,a})),j),await e.f.insert(f.X).values({jobId:this.jobId,stepId:a.id,stepLabel:a.label,state:a.status,message:a.detail||null,percent:"number"==typeof a.percent?Math.round(a.percent):null})}catch(a){console.error("[progress-tracker] gagal menyimpan event:",a)}}async update(a,b={}){if(this.finished)return;let c=this.steps.get(a);c||(c={id:a,label:b.detail||a,icon:"🔹",status:"pending"},this.steps.set(a,c),this.order.push(a));let d=this.order.indexOf(a);if(d>=0)for(let a=0;a<d;a++){let b=this.steps.get(this.order[a]);b&&"done"!==b.status&&"error"!==b.status&&(b.status="done")}c.status=b.status||"active",b.detail&&(c.detail=b.detail),"number"==typeof b.percent&&(c.percent=Math.max(0,Math.min(100,Math.round(b.percent)))),await this.persist(c),await this.scheduleFlush()}async fail(a){if(this.finished)return;let b=[...this.steps.values()].find(a=>"active"===a.status)||[...this.steps.values()].find(a=>"pending"===a.status);b&&(b.status="error",b.detail=a,await this.persist(b)),await this.scheduleFlush()}async scheduleFlush(){if(!this.enabled)return;let a=Date.now(),b=(0,g.h)(),c=a-this.lastEditAt;if(c<b){this.pendingTimer&&clearTimeout(this.pendingTimer),this.pendingTimer=setTimeout(()=>{this.flush().catch(()=>{})},b-c);return}await this.flush()}async flush(a){if(!this.messageId)return;this.pendingTimer&&(clearTimeout(this.pendingTimer),this.pendingTimer=null);let b=a??this.render();b!==this.lastText&&(this.lastEditAt=Date.now(),this.lastText=b,await this.safeEditMessage(b))}async finishSuccess(a,b){if(this.finished)return;for(let a of this.steps.values())"error"!==a.status&&(a.status="done");if(this.finished=!0,!this.enabled||!this.messageId)return;let c=this.render(a);this.lastEditAt=Date.now(),this.lastText=c,await this.safeEditMessage(c,b)}async finishError(a,b){if(this.finished){this.messageId&&await this.safeEditMessage(this.render(`❌ ${a}`),b);return}let c=[...this.steps.values()].find(a=>"active"===a.status)||[...this.steps.values()].find(a=>"pending"===a.status);if(c&&(c.status="error",c.detail=a),this.finished=!0,!this.enabled||!this.messageId)return;let d=this.render(`❌ ${a}`);this.lastEditAt=Date.now(),this.lastText=d,await this.safeEditMessage(d,b)}}]),c()}catch(a){c(a)}},!1),15633,a=>a.a(async(b,c)=>{try{var d=a.i(94758),e=a.i(37137),f=a.i(93321),g=a.i(66554),h=a.i(51533),i=b([d]);async function j(a,b){let c=await d.f.select().from(e.Y).where((0,f.u)(e.Y.telegramUserId,a));if(c.length>0)return c[0];let i=(0,g.o)(),{min:j,max:k}=(0,g.D)(i);return(await d.f.insert(e.Y).values({telegramUserId:a,maxClips:(0,g.c)(),clipDuration:i,minDuration:j,maxDuration:k,defaultPrivacy:"private",language:"id",nichePrompt:(0,h.J)((0,h.E)())}).returning())[0]}async function k(a,b){await j(a);let c=(0,h.J)(b);return await m(a,{nichePrompt:c}),c}async function l(a){await m(a,{nichePrompt:null})}async function m(a,b){await d.f.update(e.Y).set({...b,updatedAt:new Date}).where((0,f.u)(e.Y.telegramUserId,a))}[d]=i.then?(await i)():i,a.s(["O",0,l,"P",0,k]),c()}catch(a){c(a)}},!1),55592,a=>{var b=a.i(80182),c=a.i(36529),d=a.i(70042),e=a.i(49689),f=a.i(56104),g=a.i(10675);a.s(["f",0,function(a){return new b.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,process.env.GOOGLE_REDIRECT_URI).generateAuthUrl({access_type:"offline",scope:Array.from(new Set(["https://www.googleapis.com/auth/youtube.upload",...(0,c.v)()?["https://www.googleapis.com/auth/youtube.readonly"]:[],...(0,d.l)()?[d.N]:[],...(0,e.b)()?[e.T]:[],...(0,f.B)()?[f.D]:[],...(0,g.S)()?[g.E]:[]])),state:a,prompt:"consent"})}])}]})();

//# sourceMappingURL=_1by8ki588vu1i._.js.map