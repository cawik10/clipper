(()=>{"use strict";module.exports=[44644,e=>e.a(async(a,t)=>{try{var i=e.i(18899),n=e.i(79371),s=e.i(66908),r=a([n]);async function u(e){return(await n.f.execute(e)).rows}[n]=r.then?(await r)():r;let w=e=>{let a=Number(e);return Number.isFinite(a)?a:0},I=null;function o(){return I||(I=(async()=>{await n.f.execute(i.B`
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
      `),await n.f.execute(i.B`
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
      `)})().catch(e=>{throw I=null,e})),I}function l(){let e=i.B.raw(`'${(0,s.M)()}'`),a=(0,s.p)();return i.B`(date_trunc(${e}, now() AT TIME ZONE ${a}::text) AT TIME ZONE ${a}::text)`}let y=i.B`
  SELECT telegram_user_id AS id FROM user_settings
  UNION SELECT telegram_user_id FROM clip_jobs
  UNION SELECT telegram_user_id FROM admin_users
`;async function d(e,a){await o(),await n.f.execute(i.B`
    INSERT INTO admin_users (telegram_user_id, chat_id, username, first_name, last_name)
    VALUES (${String(e.id)}, ${void 0!==a?String(a):null},
            ${e.username??null}, ${e.first_name??null}, ${e.last_name??null})
    ON CONFLICT (telegram_user_id) DO UPDATE SET
      chat_id = COALESCE(EXCLUDED.chat_id, admin_users.chat_id),
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      last_seen = now()
  `)}async function c(e){await o();let a=(await u(i.B`
    SELECT is_banned, ban_reason, quota_override FROM admin_users WHERE telegram_user_id = ${e}
  `))[0];return{banned:!!a?.is_banned,banReason:a?.ban_reason??null,quotaOverride:a?.quota_override===null||a?.quota_override===void 0?null:w(a.quota_override)}}async function b(e,a,t,s){await o(),await n.f.execute(i.B`
    INSERT INTO admin_users (telegram_user_id, is_banned, ban_reason, banned_at, banned_by)
    VALUES (${e}, ${a}, ${a?s??null:null}, ${a?i.B`now()`:null}, ${a?t:null})
    ON CONFLICT (telegram_user_id) DO UPDATE SET
      is_banned = EXCLUDED.is_banned,
      ban_reason = EXCLUDED.ban_reason,
      banned_at = EXCLUDED.banned_at,
      banned_by = EXCLUDED.banned_by
  `)}async function E(e,a){await o(),await n.f.execute(i.B`
    INSERT INTO admin_users (telegram_user_id, quota_override)
    VALUES (${e}, ${a})
    ON CONFLICT (telegram_user_id) DO UPDATE SET quota_override = EXCLUDED.quota_override
  `)}function _(e){return null===e?(0,s.x)():e}async function m(e){let a=await u(i.B`
    SELECT count(*)::int AS c FROM clip_jobs
    WHERE telegram_user_id = ${e}
      AND status <> 'error'
      AND created_at >= ${l()}
  `);return w(a[0]?.c)}async function $(e,a={}){let t=!1!==a.checkQuota;try{if((0,s.N)(e))return{allowed:!0,used:0,limit:0};let a=await c(e);if(a.banned)return{allowed:!1,reason:"banned",banReason:a.banReason,used:0,limit:0};let i=_(a.quotaOverride);if(!t||i<=0)return{allowed:!0,used:0,limit:i};let n=await m(e);if(n>=i)return{allowed:!1,reason:"quota",used:n,limit:i};return{allowed:!0,used:n,limit:i}}catch(e){return console.error("[admin] checkUserAccess gagal (fail-open):",e),{allowed:!0,used:0,limit:0}}}function p(e){return{id:String(e.id),username:e.username??null,firstName:e.first_name??null,lastName:e.last_name??null,banned:!!e.is_banned,banReason:e.ban_reason??null,quotaOverride:null===e.quota_override||void 0===e.quota_override?null:w(e.quota_override),lastSeen:e.last_seen?new Date(e.last_seen):null,firstSeen:e.first_seen?new Date(e.first_seen):null,totalJobs:w(e.total_jobs),usedInPeriod:w(e.used),youtubeConnected:!!e.yt}}let A=i.B`
  SELECT i.id, au.username, au.first_name, au.last_name, au.is_banned, au.ban_reason,
         au.quota_override, au.last_seen, au.first_seen,
         (SELECT count(*) FROM clip_jobs j WHERE j.telegram_user_id = i.id) AS total_jobs,
         (SELECT count(*) FROM clip_jobs j WHERE j.telegram_user_id = i.id AND j.status <> 'error'
            AND j.created_at >= ${l()}) AS used,
         EXISTS (SELECT 1 FROM youtube_tokens y WHERE y.telegram_user_id = i.id) AS yt
  FROM (${y}) i
  LEFT JOIN admin_users au ON au.telegram_user_id = i.id
`;async function h(e,a){await o();let t=Math.max(0,e)*a,[n,s]=await Promise.all([u(i.B`
      ${A}
      ORDER BY COALESCE(au.last_seen, '1970-01-01'::timestamp) DESC, i.id
      LIMIT ${a} OFFSET ${t}
    `),u(i.B`SELECT count(*)::int AS c FROM (${y}) t`)]);return{users:n.map(p),total:w(s[0]?.c)}}async function f(e){await o();let a=await u(i.B`${A} WHERE i.id = ${e}`);return a[0]?p(a[0]):null}async function g(e){let a=e.trim();if(/^\d+$/.test(a))return a;if(a.startsWith("@")&&a.length>1){await o();let e=await u(i.B`
      SELECT telegram_user_id FROM admin_users WHERE lower(username) = ${a.slice(1).toLowerCase()} LIMIT 1
    `);return e[0]?String(e[0].telegram_user_id):null}return null}function S(e){return e.username?`@${e.username}`:[e.firstName,e.lastName].filter(Boolean).join(" ")||e.id}async function L(e,a){try{return await e}catch(e){return console.error("[admin] query statistik gagal:",e),a}}async function T(){await o();let e=async e=>w((await u(e))[0]?.c),[a,t,n,s,r,d,c,b,E,_,m,$,p,h,f]=await Promise.all([L(e(i.B`SELECT count(*)::int AS c FROM (${y}) t`),0),L(e(i.B`SELECT count(*)::int AS c FROM user_settings WHERE created_at > now() - interval '24 hours'`),0),L(e(i.B`SELECT count(*)::int AS c FROM user_settings WHERE created_at > now() - interval '7 days'`),0),L(e(i.B`
        SELECT count(*)::int AS c FROM (
          SELECT telegram_user_id FROM clip_jobs WHERE created_at > now() - interval '24 hours'
          UNION SELECT telegram_user_id FROM admin_users WHERE last_seen > now() - interval '24 hours'
        ) t`),0),L(e(i.B`SELECT count(*)::int AS c FROM admin_users WHERE is_banned`),0),L(e(i.B`SELECT count(*)::int AS c FROM youtube_tokens`),0),L(e(i.B`SELECT count(*)::int AS c FROM clip_jobs`),0),L(e(i.B`SELECT count(*)::int AS c FROM clip_jobs WHERE created_at > now() - interval '24 hours'`),0),L(e(i.B`SELECT count(*)::int AS c FROM clip_jobs WHERE created_at >= ${l()}`),0),L(e(i.B`SELECT count(*)::int AS c FROM clip_jobs WHERE status = 'error' AND updated_at > now() - interval '24 hours'`),0),L(e(i.B`SELECT COALESCE(sum(jsonb_array_length(clips)), 0)::int AS c FROM clip_jobs WHERE jsonb_typeof(clips) = 'array'`),0),L(e(i.B`SELECT count(*)::int AS c FROM uploaded_videos WHERE upload_status = 'done'`),0),L(u(i.B`SELECT status, count(*)::int AS c FROM clip_jobs GROUP BY status ORDER BY c DESC`),[]),L(u(i.B`
        SELECT j.telegram_user_id AS id, au.username, au.first_name, count(*)::int AS c
        FROM clip_jobs j LEFT JOIN admin_users au ON au.telegram_user_id = j.telegram_user_id
        WHERE j.created_at >= ${l()}
        GROUP BY j.telegram_user_id, au.username, au.first_name
        ORDER BY c DESC LIMIT 5`),[]),L(u(i.B`
        SELECT job_id, error_message, updated_at FROM clip_jobs
        WHERE status = 'error' ORDER BY updated_at DESC LIMIT 3`),[])]);return{totalUsers:a,newUsers24h:t,newUsers7d:n,active24h:s,bannedUsers:r,youtubeConnected:d,jobsTotal:c,jobs24h:b,jobsPeriod:E,jobsByStatus:p.map(e=>({status:String(e.status),count:w(e.c)})),errors24h:_,totalClips:m,uploadsDone:$,topUsers:h.map(e=>({id:String(e.id),label:S({id:String(e.id),username:e.username??null,firstName:e.first_name??null,lastName:null}),jobs:w(e.c)})),errorSamples:f.map(e=>({jobId:String(e.job_id),message:String(e.error_message??""),at:new Date(e.updated_at)}))}}async function R(){await o();let e=(0,s.L)().includeBanned;return(await u(i.B`
    SELECT i.id AS user_id, COALESCE(au.chat_id, i.id) AS chat_id
    FROM (${y}) i
    LEFT JOIN admin_users au ON au.telegram_user_id = i.id
    WHERE ${e?i.B`true`:i.B`COALESCE(au.is_banned, false) = false`}
      AND i.id ~ '^[0-9]+$'
  `)).map(e=>({userId:String(e.user_id),chatId:String(e.chat_id)}))}async function j(e,a,t){await o();let n=await u(i.B`
    INSERT INTO admin_broadcasts (admin_id, message, total) VALUES (${e}, ${a}, ${t})
    RETURNING id
  `);return w(n[0]?.id)}async function O(e,a,t){await n.f.execute(i.B`
    UPDATE admin_broadcasts SET sent = ${a}, failed = ${t}, finished_at = now() WHERE id = ${e}
  `)}e.s(["R",0,$,"E",0,j,"W",0,S,"n",0,_,"_",0,o,"N",0,O,"Q",0,R,"x",0,T,"g",0,f,"u",0,h,"G",0,g,"s",0,b,"S",0,E,"K",0,d]),t()}catch(e){t(e)}},!1),67251,e=>e.a(async(a,t)=>{try{var i=e.i(75225),n=e.i(79371),s=e.i(18916),r=e.i(66908),u=e.i(44644),o=e.i(13832),l=e.i(56922),d=e.i(35284),c=a([n,u,o,d]);function b(e){let a=Math.round(Math.min(100,Math.max(0,e))/10);return"█".repeat(a)+"░".repeat(10-a)}function E(e){return`${(0,o.e)(e.model)} <i>(${(0,o.e)(e.provider)})</i>`}function _(e){return e>=1e6?`${(e/1e6).toFixed(2)}M`:e>=1e3?`${(e/1e3).toFixed(1)}K`:String(e)}async function m(e){let a=new Map,t=e.filter(e=>/^-?\d+$/.test(e));if(!t.length)return a;try{for(let e of(await (0,u._)(),await n.f.select().from(s.I).where((0,i.y)(s.I.telegramUserId,t)))){let t=e.username?`@${e.username}`:[e.firstName,e.lastName].filter(Boolean).join(" ");t&&a.set(e.telegramUserId,t)}}catch{}return a}async function $(e){let{userId:a=null,days:t}=e,i=(0,d.M)(t),n=(0,d.N)(),[s,r,u,c,_]=await Promise.all([(0,d.j)(n,a),(0,d.j)(i,a),(0,d.b)(i,a),(0,d.E)(i,a),(0,d.Z)(a)]),$=a?"akunmu":"semua user",p=[e.weekly?`💰 <b>Biaya AI Mingguan</b> — ${$}`:`💰 <b>Biaya AI</b> — ${$}`,`🗓 <i>${t} hari terakhir</i>`,""];p.push("📊 <b>Ringkasan</b>"),p.push(`• Hari ini: <b>${(0,o.e)((0,d.i)(s.cost))}</b> (${s.calls} panggilan AI)`),p.push(`• ${t} hari: <b>${(0,o.e)((0,d.i)(r.cost))}</b> (${r.calls} panggilan \xb7 ${r.jobs} job)`),r.jobs>0&&p.push(`• Rata-rata per job: <b>${(0,o.e)((0,d.i)(r.jobCost/r.jobs))}</b>`),p.push("");let h=function(e,a){let t=[],i=(0,l.r)(),n=`reset ${e.resetAt.toLocaleTimeString("id-ID",{timeZone:(0,l.k)(),hour:"2-digit",minute:"2-digit"})} (${(0,l.k)()})`;if("global"===a){if(e.dailyLimit>0){let a="global"===e.scope?"⏸️":e.percent>=80?"⚠️":"💳";t.push(`${a} Batas harian: <b>${(0,d.x)(e.dailyLimit)}</b> — terpakai ${(0,d.x)(e.spentToday)} (${Math.round(e.percent)}%)`,`<code>${b(e.percent)}</code> <i>${n}</i>`)}else t.push("💳 Batas harian: <b>tanpa batas</b> (set <code>DAILY_BUDGET_USD</code>)");return e.userLimit>0&&t.push(`👤 Batas per user: <b>${(0,d.x)(e.userLimit)}</b>/hari`),"warn"===i&&t.push("<i>Mode warn: hanya notifikasi, AI tidak dijeda.</i>"),"off"===i&&t.push("<i>Mode off: batas tidak diberlakukan.</i>"),e.allowed||t.push(`⏸️ <b>AI sedang DIJEDA.</b> ${(0,o.e)((0,d.W)(e))}`),t}if(e.userLimit>0&&null!==e.userSpentToday){let a=e.userSpentToday/e.userLimit*100;t.push(`${"user"===e.scope?"⏸️":"💳"} Batas harianmu: <b>${(0,d.x)(e.userLimit)}</b> — terpakai ${(0,d.x)(e.userSpentToday)} (${Math.round(a)}%)`,`<code>${b(a)}</code> <i>${n}</i>`)}return e.allowed||t.push(`⏸️ <b>AI sedang dijeda.</b> ${"user"===e.scope?"Batas harianmu tercapai.":"Batas harian bot tercapai."} Coba lagi setelah reset.`),t}(_,a?"user":"global");if(h.length&&p.push(...h,""),!r.calls)return p.push("Belum ada biaya AI tercatat di periode ini. Kirim link video ke bot — biaya tiap job akan muncul di sini."),p.join("\n");if(p.push("🧩 <b>Per Fitur</b>"),u.forEach(e=>{let a=r.cost>0?Math.round(e.cost/r.cost*100):0;p.push(`• ${(0,o.e)((0,l.U)(e.feature))} — ${(0,d.x)(e.cost)} (${a}%) \xb7 ${e.calls}\xd7`)}),p.push(""),p.push("🤖 <b>Per Model</b>"),c.slice(0,(0,l.f)()).forEach(e=>{p.push(`• ${E(e)} — <b>${(0,d.x)(e.cost)}</b> \xb7 ${e.calls}\xd7${e.estimated?" ≈":""}`)}),c.some(e=>e.estimated)&&p.push("<i>≈ = token/harga diperkirakan (model belum ada di tabel harga).</i>"),!a){let e=await (0,d.C)(i,(0,l.f)()),a=await m(e.map(e=>e.userId));p.push("","👥 <b>Pemakai Terbesar</b>"),e.forEach((e,t)=>{let i=a.get(e.userId);p.push(`${t+1}. <code>${(0,o.e)(e.userId)}</code>${i?` ${(0,o.e)(i)}`:""} — <b>${(0,d.x)(e.cost)}</b> \xb7 ${e.jobs} job`)})}return p.join("\n")}async function p(e){let a=await (0,d.E)((0,d.M)(e.days),e.userId??null),t=["🤖 <b>Perbandingan Model</b>",`🗓 <i>${e.days} hari terakhir</i>`,""];if(!a.length)return t.push("Belum ada data. Proses beberapa video dulu, lalu bandingkan biaya tiap model di sini."),t.join("\n");let i=a.reduce((e,a)=>e+a.cost,0);return a.forEach(e=>{let a=i>0?Math.round(e.cost/i*100):0;t.push(`<b>${E(e)}</b>${e.estimated?" ≈":""}`);let n=[`${(0,d.x)(e.cost)} (${a}%)`,`${e.calls} panggilan`,`${(0,d.x)(e.cost/Math.max(1,e.calls))}/panggilan`];if(e.jobs>0&&n.push(`${(0,d.x)(e.cost/e.jobs)}/job`),t.push(`   ${n.join(" · ")}`),e.audioSeconds>0){var s;t.push(`   🎧 ${(s=e.audioSeconds)>=3600?`${(s/3600).toFixed(2)} jam`:`${Math.round(s/60)} mnt`} audio \xb7 ${(0,d.x)(e.cost/e.audioSeconds*3600)}/jam`)}else t.push(`   🔤 ${_(e.inputTokens)} token masuk \xb7 ${_(e.outputTokens)} keluar`)}),t.push("","💡 <i>Untuk mencoba model lain, ubah GEMINI_MODEL / GROQ_MODEL / GROQ_WHISPER_MODEL / AI_PROVIDER_ORDER di Railway Variables, proses beberapa video, lalu bandingkan biaya per job di sini.</i>"),t.join("\n")}async function h(e){let a=e.limit??8,t=await (0,d.U)(e.userId??null,a),i=["🧾 <b>Biaya per Job</b>",`<i>${t.length} job terakhir</i>`,""];if(!t.length)return i.push("Belum ada job dengan biaya AI tercatat."),i.join("\n");let n=e.userId?new Map:await m(t.map(e=>e.userId||"").filter(Boolean));return t.forEach((a,t)=>{var s;let r=(0,o.e)((s=a.title||`Job ${a.jobId.slice(0,8)}`).length>48?`${s.slice(0,47)}…`:s),u=a.at.toLocaleString("id-ID",{timeZone:(0,l.k)(),day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}),c=[`${a.calls} panggilan`];a.clips&&c.push(`${a.clips} klip \xb7 ${(0,d.x)(a.cost/a.clips)}/klip`),i.push(`${t+1}. <b>${r}</b>`),i.push(`   ${(0,o.e)((0,d.i)(a.cost))} \xb7 ${c.join(" · ")}`);let b=!e.userId&&a.userId?` \xb7 👤 ${(0,o.e)(n.get(a.userId)||a.userId)}`:"";i.push(`   <i>${u}${a.status?` \xb7 ${(0,o.e)(a.status)}`:""}${b}</i>`)}),i.join("\n")}async function f(e){let a=await (0,d.C)((0,d.M)(e),15),t=["👥 <b>Biaya per User</b>",`🗓 <i>${e} hari terakhir</i>`,""];if(!a.length)return t.push("Belum ada data."),t.join("\n");let i=await m(a.map(e=>e.userId)),n=a.reduce((e,a)=>e+a.cost,0);return a.forEach((e,a)=>{let n=i.get(e.userId);t.push(`${a+1}. <code>${(0,o.e)(e.userId)}</code>${n?` ${(0,o.e)(n)}`:""}
   <b>${(0,o.e)((0,d.i)(e.cost))}</b> \xb7 ${e.jobs} job \xb7 ${e.calls} panggilan`+(e.jobs>0?` \xb7 ${(0,d.x)(e.cost/e.jobs)}/job`:""))}),t.push("",`Total: <b>${(0,o.e)((0,d.i)(n))}</b>`),t.push("<i>Data ini berguna untuk menentukan harga langganan bila bot dijual sebagai layanan.</i>"),t.join("\n")}async function g(e){let a=["🏷️ <b>Harga Model yang Dipakai</b>",""];for(let t of e){let e=(0,l.s)(t.model,t.kind),i="audio"===t.kind?`${(0,d.x)(e.perHour??0)}/jam audio`:`${(0,d.x)(e.in??0)} masuk \xb7 ${(0,d.x)(e.out??0)} keluar per 1 juta token`,n="override"===e.source?"override env":"unknown"===e.source?"⚠️ tidak dikenal (perkiraan)":"tabel bawaan";a.push(`• <b>${(0,o.e)(t.label)}</b>: <code>${(0,o.e)(t.model)}</code>
   ${i} <i>(${n})</i>`)}return a.push("","<i>Ubah harga tanpa deploy: <code>COST_PRICE_OVERRIDES</code> di Railway Variables, atau edit MODEL_PRICES di src/lib/cost-config.ts.</i>"),a.join("\n")}async function S(e){if(!(0,l.J)()||!(0,l.Q)())return"";let a=(0,l.b)(),t=(0,d.M)(a),i=await (0,d.j)(t,e),n=(0,r.N)(e);if(!i.calls&&!n)return"";let s=["","",`💰 <b>Biaya AI — ${a} hari terakhir</b>`];if(i.calls){let[a,n]=await Promise.all([(0,d.b)(t,e),(0,d.E)(t,e)]);s.push(`• Akunmu: <b>${(0,o.e)((0,d.i)(i.cost))}</b> \xb7 ${i.jobs} job${i.jobs?` \xb7 ≈${(0,o.e)((0,d.x)(i.jobCost/i.jobs))}/job`:""}`),a.slice(0,3).forEach(e=>s.push(`  ▫️ ${(0,o.e)((0,l.U)(e.feature))}: ${(0,d.x)(e.cost)}`)),n.slice(0,3).forEach(e=>s.push(`  ▫️ ${(0,o.e)(e.model)}: ${(0,d.x)(e.cost)}`))}else s.push("• Akunmu: belum ada biaya AI.");if(n){let[e,a,i]=await Promise.all([(0,d.j)(t,null),(0,d.C)(t,(0,l.f)()),(0,d.Z)(null)]);if(s.push(`• Semua user: <b>${(0,o.e)((0,d.i)(e.cost))}</b> \xb7 ${e.jobs} job \xb7 ${e.calls} panggilan`),a.length){let e=await m(a.map(e=>e.userId));a.forEach((a,t)=>s.push(`  ${t+1}. ${(0,o.e)(e.get(a.userId)||a.userId)} — ${(0,d.x)(a.cost)} (${a.jobs} job)`))}(0,l.t)()>0&&s.push(`• Batas harian ${(0,d.x)(i.dailyLimit)} — hari ini terpakai ${(0,d.x)(i.spentToday)} (${Math.round(i.percent)}%)`),(0,l.W)()>0&&s.push(`• Batas per user: ${(0,d.x)((0,l.W)())}/hari`)}return s.push("<i>Detail lengkap: /cost</i>"),s.join("\n")}[n,u,o,d]=c.then?(await c)():c,e.s(["H",0,$,"h",0,h,"W",0,p,"F",0,g,"w",0,f,"e",0,S]),t()}catch(e){t(e)}},!1)]})();

//# sourceMappingURL=src_lib_0m48sgir5tlca._.js.map