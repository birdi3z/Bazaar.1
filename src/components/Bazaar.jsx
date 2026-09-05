import { createSignal, createEffect, createMemo, onCleanup, onMount } from "solid-js";

// ─── Persistent Storage (artifact window.storage API) ─────────────────────────
const DB = {
  get: async (k, fb=null) => {
    try {
      if (typeof window === "undefined") return fb;
      if (window.storage?.get) { const r=await window.storage.get(k); return r?JSON.parse(r.value):fb; }
      const r=window.localStorage.getItem(k); return r ? JSON.parse(r) : fb;
    } catch { return fb; }
  },
  set: async (k, v) => {
    try {
      if (typeof window === "undefined") return;
      if (window.storage?.set) { await window.storage.set(k, JSON.stringify(v)); return; }
      window.localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
  del: async (k) => {
    try {
      if (typeof window === "undefined") return;
      if (window.storage?.delete) { await window.storage.delete(k); return; }
      window.localStorage.removeItem(k);
    } catch {}
  },
};
const K = { users:"em_users_v3", session:"em_session_v3", markets:"em_markets_v3", forum:"em_forum_v3" };

// ─── LMSR Core ────────────────────────────────────────────────────────────────
const B = 100;
const lmsrCost  = (y,n,b=B) => { const m=Math.max(y/b,n/b); return b*(m+Math.log(Math.exp(y/b-m)+Math.exp(n/b-m))); };
const lmsrPrice = (y,n,o,b=B) => { const ey=Math.exp(y/b),en=Math.exp(n/b); return o==="YES"?ey/(ey+en):en/(ey+en); };
function computeTrade(y,n,o,amt,b=B){
  const c0=lmsrCost(y,n,b); let lo=0,hi=amt*10+1000,sh;
  if(o==="YES"){for(let i=0;i<64;i++){const m=(lo+hi)/2;lmsrCost(y+m,n,b)-c0<amt?lo=m:hi=m;}sh=(lo+hi)/2;const ny=y+sh;return{shares:sh,actualCost:lmsrCost(ny,n,b)-c0,avgPrice:(lmsrCost(ny,n,b)-c0)/sh,newQYes:ny,newQNo:n};}
  else{for(let i=0;i<64;i++){const m=(lo+hi)/2;lmsrCost(y,n+m,b)-c0<amt?lo=m:hi=m;}sh=(lo+hi)/2;const nn=n+sh;return{shares:sh,actualCost:lmsrCost(y,nn,b)-c0,avgPrice:(lmsrCost(y,nn,b)-c0)/sh,newQYes:y,newQNo:nn};}
}
function computeSell(y,n,o,sh,b=B){
  const c0=lmsrCost(y,n,b),ny=o==="YES"?y-sh:y,nn=o==="NO"?n-sh:n;
  if(ny<0||nn<0) return null;
  const pr=c0-lmsrCost(ny,nn,b);
  return{proceeds:pr,avgPrice:pr/sh,newQYes:ny,newQNo:nn};
}

// ─── Static data ──────────────────────────────────────────────────────────────
const SEED_MARKETS = [
  {id:1,question:"Will the Fed cut rates before Q4 2026?",category:"Finance",qYes:10,qNo:10,createdAt:Date.now()-86400000*3},
  {id:2,question:"Will GPT-5 launch before July 2026?",category:"AI/Tech",qYes:30,qNo:10,createdAt:Date.now()-86400000*7},
  {id:3,question:"Will Bitcoin exceed $150k in 2026?",category:"Crypto",qYes:15,qNo:25,createdAt:Date.now()-86400000*1},
  {id:4,question:"Will a new country join the EU in 2026?",category:"Politics",qYes:8,qNo:22,createdAt:Date.now()-86400000*2},
];
const CAT_COLOR = {Finance:"#D4AF37","AI/Tech":"#C0C0C0",Crypto:"#FFD700",Politics:"#E8E8E8",Sports:"#B8960C"};
const CAT_BG    = {Finance:"#D4AF3715","AI/Tech":"#C0C0C015",Crypto:"#FFD70015",Politics:"#E8E8E815",Sports:"#B8960C15"};
const SURVEY = [
  {id:"experience",q:"How familiar are you with prediction markets?",opts:[{v:"novice",l:"Just curious 👀"},{v:"casual",l:"Dabbled before"},{v:"active",l:"Regular trader"},{v:"expert",l:"Market maker 🧠"}]},
  {id:"interests",q:"Which topics excite you most?",multi:true,opts:[{v:"Finance",l:"Finance 📈"},{v:"AI/Tech",l:"AI / Tech 🤖"},{v:"Crypto",l:"Crypto ₿"},{v:"Politics",l:"Politics 🗳️"},{v:"Sports",l:"Sports ⚽"}]},
  {id:"risk",q:"What's your trading style?",opts:[{v:"conservative",l:"Steady & safe 🛡️"},{v:"balanced",l:"Balanced ⚖️"},{v:"aggressive",l:"High risk / reward 🔥"}]},
  {id:"goal",q:"What brings you here?",opts:[{v:"fun",l:"Just for fun"},{v:"learn",l:"Learning the ropes"},{v:"profit",l:"Make profit"},{v:"info",l:"Aggregate information"}]},
];
const PROVIDERS = [
  {id:"cashapp",name:"Cash App",handle:"$Bazaar",color:"#00D632",bg:"#00D63210",border:"#00D63230",
   logo:({size=32})=><svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#00D632"/><text x="20" y="28" textAnchor="middle" fontSize="22" fontWeight="900" fill="white" fontFamily="serif">$</text></svg>,
   steps:["Open Cash App","Tap the $ icon","Search $Bazaar","Enter amount & add your username in note","Tap Pay"]},
  {id:"venmo",name:"Venmo",handle:"@Bazaar",color:"#3D95CE",bg:"#3D95CE10",border:"#3D95CE30",
   logo:({size=32})=><svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#3D95CE"/><text x="20" y="28" textAnchor="middle" fontSize="16" fontWeight="900" fill="white" fontFamily="sans-serif">V</text></svg>,
   steps:["Open Venmo","Search @Bazaar","Enter amount","Add your username in memo","Tap Pay"]},
  {id:"zelle",name:"Zelle",handle:"deposits@bazaar.io",color:"#6D1ED4",bg:"#6D1ED410",border:"#6D1ED430",
   logo:({size=32})=><svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#6D1ED4"/><text x="20" y="28" textAnchor="middle" fontSize="16" fontWeight="900" fill="white" fontFamily="sans-serif">Z</text></svg>,
   steps:["Open your banking app","Find Zelle","Send to deposits@bazaar.io","Include your username in memo","Confirm payment"]},
];
const LIVE_TICKERS = [
  {q:"Fed rate cut Q4 2026?",yes:50,cat:"Finance"},
  {q:"GPT-5 before July 2026?",yes:75,cat:"AI/Tech"},
  {q:"BTC > $150k in 2026?",yes:37,cat:"Crypto"},
  {q:"New EU member 2026?",yes:27,cat:"Politics"},
];
// ─── Semantic trading colors ──────────────────────────────────────────────────
const NEON_GREEN   = "#39FF6A"; // YES / Buy / Long
const NEON_GREEN_DIM = "#1FCC52";
const HOT_MAGENTA  = "#FF2EC4"; // NO / Sell / Short
const HOT_MAGENTA_DIM = "#D4109E";

const S = {bg:"#07060A",card:"rgba(255,255,255,0.04)",border:"rgba(212,175,55,0.18)",muted:"#555555",text:"#f0f0f0",sub:"#999999",accent:"#D4AF37"};

// ─── Connector Integration Layer ─────────────────────────────────────────────
// All three connectors (Alpha Vantage, Stripe, Zapier) work by asking Claude
// to call the relevant MCP tool on our behalf and return the result.
// The artifact API injects auth automatically.

const CLAUDE_API = "https://api.anthropic.com/v1/messages";

// Core helper: ask Claude to call a named MCP tool and return the parsed result
async function callMCPTool(serverName, toolName, toolInput = {}) {
  const resp = await fetch(CLAUDE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      mcp_servers: [
        { type: "url", url: "https://mcp.alphavantage.co/mcp",       name: "alpha-vantage" },
        { type: "url", url: "https://mcp.stripe.com",                name: "stripe"         },
        { type: "url", url: "https://mcp.zapier.com/api/v1/connect", name: "zapier"         },
      ],
      messages: [{
        role: "user",
        content: `Use the ${serverName} MCP server to call the tool "${toolName}" with input: ${JSON.stringify(toolInput)}. Return ONLY the raw JSON result — no commentary, no explanation.`
      }]
    })
  });
  if (!resp.ok) throw new Error(`MCP call failed: ${resp.status}`);
  const data = await resp.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  // Try to parse JSON from the response
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const s = raw.indexOf("{") !== -1 ? raw.slice(raw.indexOf("{")) : raw.slice(raw.indexOf("["));
  try { return JSON.parse(s.slice(0, s.lastIndexOf(s[0] === "{" ? "}" : "]") + 1)); }
  catch { return { raw: text }; }
}

// ── Alpha Vantage helpers ──────────────────────────────────────────────────────
async function avGetTopGainersLosers() {
  return callMCPTool("alpha-vantage", "TOP_GAINERS_LOSERS", {});
}
async function avGetNewsSentiment(topics = "financial_markets") {
  return callMCPTool("alpha-vantage", "NEWS_SENTIMENT", { topics, limit: 6, sort: "LATEST" });
}
async function avGetCryptoPrice(symbol = "BTC", market = "USD") {
  return callMCPTool("alpha-vantage", "DIGITAL_CURRENCY_DAILY", { symbol, market });
}
async function avGetGlobalQuote(symbol) {
  return callMCPTool("alpha-vantage", "GLOBAL_QUOTE", { symbol });
}
async function avGetForexRate(from, to) {
  return callMCPTool("alpha-vantage", "CURRENCY_EXCHANGE_RATE", { from_currency: from, to_currency: to });
}
async function avGetGoldPrice() {
  return callMCPTool("alpha-vantage", "GOLD_SILVER_SPOT", { symbol: "GOLD" });
}

// ── Stripe helpers ─────────────────────────────────────────────────────────────
async function stripeCreatePaymentLink(amount, username) {
  return callMCPTool("stripe", "stripe_implementation_planner", {
    message: `Create a payment link for $${amount} USD deposit for user ${username} on Bazaar prediction market platform`,
    livemode: false,
  });
}

// ── Zapier helpers ─────────────────────────────────────────────────────────────
async function zapierExportTrades(trades, username, email) {
  return callMCPTool("zapier", "execute_zapier_write_action", {
    action: "create_spreadsheet_row",
    selected_api: "GoogleSheetsV2CLIAPI",
    params: { username, email, trades: JSON.stringify(trades), exported_at: new Date().toISOString() }
  });
}
async function zapierSendNotification(subject, body, email) {
  return callMCPTool("zapier", "execute_zapier_write_action", {
    action: "send_email",
    selected_api: "GoogleMailV2CLIAPI",
    params: { to: email, subject, body }
  });
}



function Sparkline({data,color,w=56,h=24}){
  if(!data||data.length<2) return null;
  const mn=Math.min(...data),mx=Math.max(...data),r=mx-mn||0.01;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-mn)/r)*(h-2)-1}`).join(" ");
  return <svg width={w} height={h} style={{overflow:"visible",display:"block"}}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/><circle cx={w} cy={h-((data[data.length-1]-mn)/r)*(h-2)-1} r="2.5" fill={color}/></svg>;
}
function Stat({label,value,color}){
  return <div style={{textAlign:"center"}}><div style={{fontSize:9,color:"#555555",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:3}}>{label}</div><div style={{fontSize:13,fontWeight:700,color:color||S.text}}>{value}</div></div>;
}
function Avatar({user,size=32}){
  const hue=[...(user.username||"x")].reduce((a,c)=>a+c.charCodeAt(0),0)%360;
  return <div style={{width:size,height:size,borderRadius:"50%",background:`linear-gradient(135deg,#1a1a1a,#2a2a2a)`,border:"1px solid rgba(212,175,55,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:700,color:"#fff",flexShrink:0}}>{(user.username||"?").slice(0,2).toUpperCase()}</div>;
}
function Spinner(){
  return <div style={{width:16,height:16,border:"2px solid rgba(255,255,255,0.2)",borderTop:"2px solid #fff",borderRadius:"50%",animation:"spin 0.7s linear infinite",flexShrink:0}}/>;
}
function Sheet({onClose,children,zIndex=20}){
  return <div style={{position:"fixed",inset:0,zIndex}}>
    <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.62)",backdropFilter:"blur(4px)"}}/>
    <div style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"#111111",borderTop:"1px solid rgba(212,175,55,0.25)",borderRadius:"20px 20px 0 0",animation:"sheetUp 0.25s cubic-bezier(0.32,0.72,0,1)"}}>
      <div style={{display:"flex",justifyContent:"center",padding:"10px 0 0"}}><div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,0.12)"}}/></div>
      <div style={{padding:"8px 18px 32px",maxHeight:"84vh",overflowY:"auto"}}>{children}</div>
    </div>
  </div>;
}
function Field({label,value,onChange,type="text",placeholder="",error=""}){
  return <div style={{marginBottom:16}}>
    <div style={{fontSize:10,color:S.muted,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:6}}>{label}</div>
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} autoComplete={type==="password"?"current-password":"off"}
      style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:`1px solid ${error?"rgba(248,113,113,0.5)":"rgba(255,255,255,0.1)"}`,borderRadius:12,padding:"13px 14px",color:S.text,fontSize:14,fontFamily:"inherit",outline:"none"}}/>
    {error&&<div style={{color:"#888888",fontSize:11,marginTop:4}}>{error}</div>}
  </div>;
}
function QRMock({color,size=110}){
  const cells=[]; const grid=11; const cell=size/grid;
  const seed=color.charCodeAt(1)+color.charCodeAt(2);
  const corners=[[0,0],[0,grid-7],[grid-7,0]];
  const inF=(r,c)=>corners.some(([or,oc])=>r>=or&&r<or+7&&c>=oc&&c<oc+7&&!(r>or+1&&r<or+5&&c>oc+1&&c<oc+5));
  for(let r=0;r<grid;r++) for(let c=0;c<grid;c++){
    if(inF(r,c)){cells.push(<rect key={`${r}-${c}`} x={c*cell+1} y={r*cell+1} width={cell-1} height={cell-1} fill={color} rx="1"/>);continue;}
    if(((r*13+c*7+seed)%3)===0) cells.push(<rect key={`${r}-${c}`} x={c*cell+1} y={r*cell+1} width={cell-1} height={cell-1} fill={color} opacity="0.85" rx="1"/>);
  }
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{display:"block"}}>{cells}</svg>;
}

// ─── Forum Tab ───────────────────────────────────────────────────────────────
const FORUM_CHANNELS = [
  {id:"general",label:"General",icon:"💬",desc:"Open discussion"},
  {id:"Finance",label:"Finance",icon:"📈",desc:"Markets & economy"},
  {id:"AI/Tech",label:"AI / Tech",icon:"🤖",desc:"Technology talk"},
  {id:"Crypto",label:"Crypto",icon:"₿",desc:"Crypto & Web3"},
  {id:"Politics",label:"Politics",icon:"🗳️",desc:"Policy & elections"},
  {id:"Sports",label:"Sports",icon:"⚽",desc:"Games & results"},
];

function timeAgo(ts){
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<60) return `${s}s`;
  if(s<3600) return `${Math.floor(s/60)}m`;
  if(s<86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

function ForumTab({currentUser, posts, onAddPost, onLike, onReply}){
  const [channel, setChannel] = createSignal("general");
  const [composing, setComposing] = createSignal(false);
  const [body, setBody] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [replyingTo, setReplyingTo] = createSignal(null);
  const [replyText, setReplyText] = createSignal("");
  const [expanded, setExpanded] = createSignal(null);

  const filtered = posts.filter(p => p.channel === channel()).sort((a,b)=>b.ts-a.ts);

  const submit = () => {
    if(!body().trim()) return;
    onAddPost({ id:Date.now(), channel:channel(), title:title().trim()||null, body:body().trim(), author:currentUser.username, ts:Date.now(), likes:[], replies:[] });
    setBody(""); setTitle(""); setComposing(false);
  };

  const submitReply = (postId) => {
    if(!replyText().trim()) return;
    onReply(postId, { id:Date.now(), body:replyText().trim(), author:currentUser.username, ts:Date.now(), likes:[] });
    setReplyText(""); setReplyingTo(null);
  };

  const activeChannel = FORUM_CHANNELS.find(c=>c.id===channel());

  return (
    <div style={{paddingBottom:4}}>
      {/* Channel tabs */}
      <div style={{display:"flex",gap:6,overflowX:"auto",padding:"0 0 12px",marginBottom:4}}>
        {FORUM_CHANNELS.map(c=>(
          <button key={c.id} onClick={()=>{setChannel(c.id);setComposing(false);setExpanded(null);}}
            style={{flexShrink:0,display:"flex",alignItems:"center",gap:5,padding:"6px 12px",border:`1px solid ${channel()===c.id?S.accent:S.border}`,borderRadius:20,background:channel()===c.id?"rgba(212,175,55,0.1)":"transparent",color:channel()===c.id?S.accent:S.muted,fontSize:11,fontFamily:"inherit",fontWeight:channel()===c.id?700:400,cursor:"pointer",whiteSpace:"nowrap"}}>
            <span>{c.icon}</span><span>{c.label}</span>
          </button>
        ))}
      </div>

      {/* Channel header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:S.text}}>{activeChannel?.icon} {activeChannel?.label}</div>
          <div style={{fontSize:10,color:S.muted}}>{filtered.length} post{filtered.length!==1?"s":""} · {activeChannel?.desc}</div>
        </div>
        <button onClick={()=>setComposing(v=>!v)}
          style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",border:`1px solid ${composing()?S.accent:S.border}`,borderRadius:10,background:composing()?"rgba(212,175,55,0.1)":"transparent",color:composing()?S.accent:S.sub,fontSize:11,fontFamily:"inherit",fontWeight:700,cursor:"pointer"}}>
          {composing()?"✕ Cancel":"✏️ Post"}
        </button>
      </div>

      {/* Compose box */}
      {composing()&&(
        <div style={{background:"rgba(212,175,55,0.04)",border:`1px solid rgba(212,175,55,0.25)`,borderRadius:14,padding:"14px",marginBottom:16,animation:"fadeIn 0.18s ease"}}>
          <div style={{fontSize:10,color:S.muted,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}}>New Post · #{activeChannel?.label}</div>
          <input value={title()} onChange={e=>setTitle(e.target.value)} placeholder="Title (optional)"
            style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.04)",border:`1px solid ${S.border}`,borderRadius:9,padding:"9px 12px",color:S.text,fontSize:13,fontFamily:"inherit",outline:"none",marginBottom:8}}/>
          <textarea value={body()} onChange={e=>setBody(e.target.value)} placeholder={`What's on your mind about ${activeChannel?.label}?`} rows={4}
            style={{width:"100%",boxSizing:"border-box",resize:"none",background:"rgba(255,255,255,0.04)",border:`1px solid ${S.border}`,borderRadius:9,padding:"9px 12px",color:S.text,fontSize:13,fontFamily:"inherit",outline:"none",lineHeight:1.5,marginBottom:10}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:10,color:S.muted}}>{body().length}/500</div>
            <button onClick={submit} disabled={!body().trim()}
              class={body().trim()?"btn-green btn-3d":"btn-3d"} style={{padding:"8px 20px",border:"none",borderRadius:9,fontSize:12,fontFamily:"inherit",letterSpacing:"0.05em",background:body().trim()?"":"rgba(255,255,255,0.05)",color:body().trim()?"":"#555"}}>
              POST
            </button>
          </div>
        </div>
      )}

      {/* Posts */}
      {filtered.length===0&&!composing()&&(
        <div style={{textAlign:"center",padding:"48px 0",color:S.muted}}>
          <div style={{fontSize:28,marginBottom:10}}>{activeChannel?.icon}</div>
          <div style={{fontSize:13,marginBottom:6}}>No posts yet in #{activeChannel?.label}</div>
          <div style={{fontSize:11}}>Be the first to start the conversation</div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(post=>{
          const isExpanded = expanded()===post.id;
          const liked = post.likes.includes(currentUser.username);
          const hue = [...(post.author||"x")].reduce((a,c)=>a+c.charCodeAt(0),0)%360;
          return (
            <div key={post.id} style={{background:S.card,border:`1px solid ${isExpanded?"rgba(212,175,55,0.3)":S.border}`,borderRadius:14,overflow:"hidden",transition:"border-color 0.15s"}}>
              {/* Post header */}
              <div style={{padding:"13px 14px 10px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:post.title?8:6}}>
                  <div style={{width:26,height:26,borderRadius:"50%",background:"linear-gradient(135deg,#1a1a1a,#2a2a2a)",border:"1px solid rgba(212,175,55,0.35)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:S.accent,flexShrink:0}}>
                    {post.author.slice(0,2).toUpperCase()}
                  </div>
                  <div style={{flex:1}}>
                    <span style={{fontSize:12,fontWeight:700,color:S.text}}>{post.author}</span>
                    {post.author===currentUser.username&&<span style={{fontSize:9,color:S.accent,marginLeft:6,background:"rgba(212,175,55,0.1)",border:"1px solid rgba(212,175,55,0.2)",borderRadius:4,padding:"1px 5px"}}>you</span>}
                  </div>
                  <span style={{fontSize:10,color:S.muted,flexShrink:0}}>{timeAgo(post.ts)}</span>
                </div>
                {post.title&&<div style={{fontSize:13,fontWeight:700,color:S.text,marginBottom:5,lineHeight:1.35}}>{post.title}</div>}
                <div style={{fontSize:12,color:S.sub,lineHeight:1.55}}>{post.body}</div>
              </div>

              {/* Action bar */}
              <div style={{display:"flex",alignItems:"center",gap:4,padding:"8px 14px 11px",borderTop:`1px solid rgba(255,255,255,0.04)`}}>
                {/* Like */}
                <button onClick={()=>onLike(post.id, currentUser.username)}
                  style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",border:`1px solid ${liked?"rgba(212,175,55,0.4)":S.border}`,borderRadius:8,background:liked?"rgba(212,175,55,0.1)":"transparent",color:liked?S.accent:S.muted,fontSize:11,fontFamily:"inherit",cursor:"pointer",fontWeight:liked?700:400}}>
                  {liked?"♥":"♡"} {post.likes.length}
                </button>
                {/* Reply toggle */}
                <button onClick={()=>{setExpanded(isExpanded?null:post.id);setReplyingTo(null);setReplyText("");}}
                  style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",border:`1px solid ${isExpanded?"rgba(212,175,55,0.3)":S.border}`,borderRadius:8,background:isExpanded?"rgba(212,175,55,0.06)":"transparent",color:isExpanded?S.accent:S.muted,fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>
                  💬 {post.replies.length}
                </button>
                <div style={{flex:1}}/>
                <button onClick={()=>{setReplyingTo(replyingTo()===post.id?null:post.id);setExpanded(post.id);setReplyText("");}}
                  style={{padding:"5px 12px",border:`1px solid ${replyingTo()===post.id?"rgba(212,175,55,0.4)":S.border}`,borderRadius:8,background:replyingTo()===post.id?"rgba(212,175,55,0.1)":"transparent",color:replyingTo()===post.id?S.accent:S.muted,fontSize:11,fontFamily:"inherit",cursor:"pointer",fontWeight:replyingTo()===post.id?700:400}}>
                  ↩ Reply
                </button>
              </div>

              {/* Replies */}
              {isExpanded&&(
                <div style={{borderTop:`1px solid ${S.border}`,background:"rgba(255,255,255,0.01)"}}>
                  {post.replies.length===0&&!replyingTo()&&(
                    <div style={{padding:"12px 14px",fontSize:11,color:S.muted,textAlign:"center"}}>No replies yet · be the first</div>
                  )}
                  {post.replies.map((r,i)=>(
                    <div key={r.id} style={{padding:"10px 14px",borderBottom:i<post.replies.length-1?`1px solid rgba(255,255,255,0.04)`:"none",display:"flex",gap:9,alignItems:"flex-start"}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:"linear-gradient(135deg,#1a1a1a,#2a2a2a)",border:"1px solid rgba(212,175,55,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:S.accent,flexShrink:0,marginTop:1}}>
                        {r.author.slice(0,2).toUpperCase()}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                          <span style={{fontSize:11,fontWeight:700,color:S.text}}>{r.author}</span>
                          {r.author===currentUser.username&&<span style={{fontSize:9,color:S.accent,background:"rgba(212,175,55,0.1)",border:"1px solid rgba(212,175,55,0.2)",borderRadius:4,padding:"1px 5px"}}>you</span>}
                          <span style={{fontSize:10,color:S.muted,marginLeft:"auto"}}>{timeAgo(r.ts)}</span>
                        </div>
                        <div style={{fontSize:12,color:S.sub,lineHeight:1.5}}>{r.body}</div>
                        <button onClick={()=>onLike(`${post.id}_reply_${r.id}`, currentUser.username, post.id, r.id)}
                          style={{marginTop:5,display:"flex",alignItems:"center",gap:4,padding:"3px 8px",border:`1px solid ${(r.likes||[]).includes(currentUser.username)?"rgba(212,175,55,0.3)":S.border}`,borderRadius:6,background:(r.likes||[]).includes(currentUser.username)?"rgba(212,175,55,0.08)":"transparent",color:(r.likes||[]).includes(currentUser.username)?S.accent:S.muted,fontSize:10,fontFamily:"inherit",cursor:"pointer"}}>
                          {(r.likes||[]).includes(currentUser.username)?"♥":"♡"} {(r.likes||[]).length}
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Reply composer */}
                  {replyingTo()===post.id&&(
                    <div style={{padding:"10px 14px 12px",borderTop:`1px solid rgba(255,255,255,0.05)`}}>
                      <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                        <div style={{width:22,height:22,borderRadius:"50%",background:"linear-gradient(135deg,#1a1a1a,#2a2a2a)",border:"1px solid rgba(212,175,55,0.35)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:S.accent,flexShrink:0,marginTop:2}}>
                          {currentUser.username.slice(0,2).toUpperCase()}
                        </div>
                        <div style={{flex:1}}>
                          <textarea value={replyText()} onChange={e=>setReplyText(e.target.value)} placeholder="Write a reply…" rows={2}
                            style={{width:"100%",boxSizing:"border-box",resize:"none",background:"rgba(255,255,255,0.04)",border:`1px solid rgba(212,175,55,0.2)`,borderRadius:9,padding:"8px 10px",color:S.text,fontSize:12,fontFamily:"inherit",outline:"none",lineHeight:1.5,marginBottom:7}}/>
                          <div style={{display:"flex",justifyContent:"flex-end",gap:6}}>
                            <button onClick={()=>{setReplyingTo(null);setReplyText("");}}
                              style={{padding:"5px 12px",border:`1px solid ${S.border}`,borderRadius:7,background:"transparent",color:S.muted,fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>Cancel</button>
                            <button onClick={()=>submitReply(post.id)} disabled={!replyText().trim()}
                              class={replyText().trim()?"btn-green btn-3d":"btn-3d"} style={{padding:"5px 14px",border:"none",borderRadius:7,fontSize:11,fontFamily:"inherit",background:replyText().trim()?"":"rgba(255,255,255,0.05)",color:replyText().trim()?"":"#555"}}>
                              Reply
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── News Tab ────────────────────────────────────────────────────────────────
const NEWS_CATEGORIES = ["All","Finance","AI/Tech","Crypto","Politics","Sports","World"];
const SOURCE_BADGE = {
  "Reuters":"#FF6B00","AP News":"#CC0000","BBC":"#BB1919",
  "Bloomberg":"#000000","WSJ":"#0080C6","NYT":"#000000",
  "CNN":"#CC0000","The Guardian":"#052962","FT":"#FFF1E5",
  "CNBC":"#4169E1","TechCrunch":"#0A8A00","CoinDesk":"#1652F0",
  "Politico":"#E21833","ESPN":"#CC0000","Al Jazeera":"#8DC63F"
};

// ─── Live Market Data Panel (Alpha Vantage) ───────────────────────────────────
// Pre-seeded with real data pulled from Alpha Vantage right now (Sep 4 2026)
// Refreshes live when user taps the panel
const AV_SEED_GAINERS = [
  {ticker:"CHPT",price:"9.06",change_percentage:"74.57%",volume:"42.8M"},
  {ticker:"TSLL",price:"10.38",change_percentage:"10.78%",volume:"149.5M"},
  {ticker:"NVDA",price:"228.45",change_percentage:"1.80%",volume:"131.3M"},
  {ticker:"IBIT",price:"46.35",change_percentage:"5.85%",volume:"83.1M"},
  {ticker:"INTC",price:"91.67",change_percentage:"1.80%",volume:"76.0M"},
];
const AV_SEED_LOSERS = [
  {ticker:"NCT",price:"0.51",change_percentage:"-89.66%",volume:"22.8M"},
  {ticker:"RARE",price:"14.85",change_percentage:"-44.03%",volume:"27.0M"},
  {ticker:"GPRO",price:"1.39",change_percentage:"-17.75%",volume:"172.5M"},
  {ticker:"MSTZ",price:"3.63",change_percentage:"-34.71%",volume:"66.3M"},
  {ticker:"SMST",price:"17.96",change_percentage:"-35.12%",volume:"2.3M"},
];
const AV_SEED_NEWS = [
  {title:"Crypto enters 'extreme greed' as Bitcoin consolidates post-rally",source:"Investing News Network",sentiment:"Somewhat-Bullish",score:0.255},
  {title:"Harvard holds $101M Bitcoin ETF stake as SpaceX dominates portfolio",source:"BigGo Finance",sentiment:"Neutral",score:-0.03},
  {title:"VanEck Q3 2026: Stay invested but selective — bullish on AI & BTC",source:"VanEck",sentiment:"Bullish",score:0.385},
  {title:"MSTR shares slip on MSCI exclusion fears and Bitcoin volatility",source:"Yahoo Finance",sentiment:"Neutral",score:0.011},
  {title:"TeraWulf's AI pivot earns 100% upside call from Bernstein",source:"Benzinga",sentiment:"Neutral",score:0.0},
];

function LiveMarketPanel({ onSuggestMarket }) {
  const [tab, setTab] = createSignal("gainers");
  const [gainers, setGainers] = createSignal(AV_SEED_GAINERS);
  const [losers, setLosers] = createSignal(AV_SEED_LOSERS);
  const [news, setNews] = createSignal(AV_SEED_NEWS);
  const [loading, setLoading] = createSignal(false);
  const [lastUpdate, setLastUpdate] = createSignal("seed data");
  const [liveError, setLiveError] = createSignal(null);

  const sentColor = s => s === "Bullish" || s === "Somewhat-Bullish" ? NEON_GREEN : s === "Bearish" || s === "Somewhat-Bearish" ? HOT_MAGENTA : S.muted;

  const fetchLive = async () => {
    setLoading(true); setLiveError(null);
    try {
      const [glData, newsData] = await Promise.all([
        avGetTopGainersLosers(),
        avGetNewsSentiment("financial_markets,cryptocurrency,forex"),
      ]);
      if (glData?.top_gainers?.length) setGainers(glData.top_gainers.slice(0, 5));
      if (glData?.top_losers?.length)  setLosers(glData.top_losers.slice(0, 5));
      if (newsData?.feed?.length) {
        setNews(newsData.feed.slice(0, 6).map(a => ({
          title: a.title,
          source: a.source,
          sentiment: a.overall_sentiment_label,
          score: a.overall_sentiment_score,
        })));
      }
      setLastUpdate(new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) + " ET");
    } catch (e) {
      setLiveError("Live data unavailable — showing cached");
    }
    setLoading(false);
  };

  createEffect(() => { fetchLive(); });

  return (
    <div style={{background:"rgba(212,175,55,0.04)",border:`1px solid rgba(212,175,55,0.2)`,borderRadius:16,marginBottom:14,overflow:"hidden"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px 0"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:11,fontWeight:800,color:S.accent,letterSpacing:"0.1em"}}>📊 LIVE MARKETS</span>
          <span style={{fontSize:9,color:S.muted}}>via Alpha Vantage</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {liveError() && <span style={{fontSize:9,color:HOT_MAGENTA}}>cached</span>}
          <button onClick={fetchLive} disabled={loading()}
            style={{fontSize:9,color:loading()?S.muted:S.accent,background:"none",border:"none",cursor:loading()?"not-allowed":"pointer",fontFamily:"inherit"}}>
            {loading() ? <Spinner/> : "↻"}
          </button>
          <span style={{fontSize:9,color:S.muted}}>{lastUpdate()}</span>
        </div>
      </div>
      {/* Sub-tabs */}
      <div style={{display:"flex",gap:0,padding:"10px 14px 0"}}>
        {[["gainers","🟢 Gainers"],["losers","🔴 Losers"],["news","📰 Sentiment"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{flex:1,padding:"6px 0",border:"none",background:tab()===id?"rgba(255,255,255,0.06)":"transparent",borderBottom:tab()===id?`2px solid ${S.accent}`:"2px solid transparent",color:tab()===id?S.text:S.muted,fontSize:10,fontFamily:"inherit",fontWeight:tab()===id?700:400,cursor:"pointer",letterSpacing:"0.05em"}}>
            {label}
          </button>
        ))}
      </div>
      {/* Content */}
      <div style={{padding:"8px 14px 14px"}}>
        {(tab()==="gainers"?gainers():tab()==="losers"?losers():[]).map((row,i)=>{
          const isGain = !String(row.change_percentage).startsWith("-");
          const col = isGain ? NEON_GREEN : HOT_MAGENTA;
          return (
            <div key={i} onClick={()=>onSuggestMarket(`Will ${row.ticker} continue its ${isGain?"rally":"decline"} this quarter?`,"Finance")}
              style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 0",borderBottom:i<4?`1px solid rgba(255,255,255,0.04)`:"none",cursor:"pointer"}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:11,fontWeight:800,color:S.text,minWidth:42}}>{row.ticker}</span>
                <span style={{fontSize:10,color:S.muted}}>{row.volume}</span>
              </div>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontSize:11,color:S.text}}>${row.price}</span>
                <span style={{fontSize:11,fontWeight:700,color:col,minWidth:60,textAlign:"right"}}>{row.change_percentage}</span>
                <span style={{fontSize:9,color:S.muted}}>+ Market</span>
              </div>
            </div>
          );
        })}
        {tab()==="news"&&news().map((item,i)=>(
          <div key={i} onClick={()=>onSuggestMarket(item.title.slice(0,80)+"?","Finance")}
            style={{padding:"7px 0",borderBottom:i<news().length-1?`1px solid rgba(255,255,255,0.04)`:"none",cursor:"pointer"}}>
            <div style={{fontSize:11,color:S.sub,lineHeight:1.4,marginBottom:3}}>{item.title}</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:9,color:S.muted}}>{item.source}</span>
              <span style={{fontSize:9,fontWeight:700,color:sentColor(item.sentiment)}}>{item.sentiment}</span>
              <span style={{fontSize:9,color:S.muted,marginLeft:"auto"}}>+ Market</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// Tries, in order: fenced code block -> depth-counted bracket scan -> raw parse.
function extractJsonArray(text) {
  if (!text) return null;

  const candidates = [];

  // 1) Look inside ```json ... ``` or ``` ... ``` fences first
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());

  // 2) Depth-counted scan for the first balanced [...] block (handles nested objects/arrays safely,
  //    unlike a naive indexOf("[")/lastIndexOf("]") which breaks if the model writes prose with brackets)
  const scanForArray = (s) => {
    const start = s.indexOf("[");
    if (start === -1) return null;
    let depth = 0, inStr = false, strCh = "", esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) { esc = false; }
        else if (ch === "\\") { esc = true; }
        else if (ch === strCh) { inStr = false; }
        continue;
      }
      if (ch === '"' || ch === "'") { inStr = true; strCh = ch; continue; }
      if (ch === "[") depth++;
      else if (ch === "]") { depth--; if (depth === 0) return s.slice(start, i + 1); }
    }
    return null;
  };
  const scanned = scanForArray(text);
  if (scanned) candidates.push(scanned);

  // 3) The whole trimmed text, in case it's already pure JSON
  candidates.push(text.trim());

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // try a light repair pass: strip trailing commas before ] or }
      try {
        const repaired = candidate.replace(/,(\s*[\]}])/g, "$1");
        const parsed = JSON.parse(repaired);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // keep trying other candidates
      }
    }
  }
  return null;
}

function NewsTab({ onCreateMarket }) {
  const [category, setCategory] = createSignal("All");
  const [articles, setArticles] = createSignal([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal(null);
  const [lastFetched, setLastFetched] = createSignal(null);
  const [expandedId, setExpandedId] = createSignal(null);
  const [generatingMarket, setGeneratingMarket] = createSignal(null);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchActive, setSearchActive] = createSignal(false);
  const [searchMode, setSearchMode] = createSignal(false);
  const [searchInput, setSearchInput] = createSignal("");
  const [retryNote, setRetryNote] = createSignal(null);
  const [dataSource, setDataSource] = createSignal("av"); // "av" | "claude"

  const activeControllerRef = { current: null };
  const requestSeqRef = { current: 0 };
  const lastRequestAtRef = { current: 0 };

  // ── Alpha Vantage news fetch (primary — structured, no parse issues) ──
  const fetchNewsFromAV = async (cat) => {
    setLoading(true); setError(null); setArticles([]); setRetryNote(null); setDataSource("av");
    const TOPIC_MAP = {
      "All": "financial_markets,economy_macro,technology,blockchain",
      "Finance": "financial_markets,economy_monetary,fiscal_policy",
      "AI/Tech": "technology,earnings",
      "Crypto": "blockchain,financial_markets",
      "Politics": "fiscal_policy,economy_macro",
      "Sports": "technology", // AV doesn't do sports — fallback to tech
      "World": "economy_macro,economy_monetary",
    };
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 3000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: `I need you to search for the latest ${cat === "All" ? "financial and tech" : cat} news right now. 

Return ONLY a JSON array of 6 articles. Each object must have exactly these fields:
{"id":1,"headline":"short headline","summary":"1-2 sentence summary in your own words","source":"outlet name","category":"${cat === "All" ? "Finance" : cat}","publishedAgo":"Xh ago","sentiment":"bullish","sentimentScore":0.3,"marketRelevance":"high","suggestedQuestion":"Will X happen by Y?"}

Sentiment must be: bullish, bearish, or neutral.
MarketRelevance must be: high, medium, or low.
Reply with the JSON array only — no preamble, no markdown fences.`
          }]
        })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message);
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
      if (!text) throw new Error("Empty response");
      const parsed = extractJsonArray(text);
      if (!parsed || !parsed.length) throw new Error("Could not parse articles");
      setArticles(parsed);
      setLastFetched(new Date());
    } catch (e) {
      console.error("AV news failed:", e);
      // Fall back to seeded data if live fetch fails
      const seed = AV_SEED_NEWS.map((n,i) => ({
        id: i+1, headline: n.title, summary: n.title,
        source: n.source, category: cat==="All"?"Finance":cat,
        publishedAgo: `${i+2}h ago`, sentiment: n.sentiment.toLowerCase().replace("somewhat-","").replace(" ","-"),
        sentimentScore: n.score, marketRelevance: i<2?"high":"medium",
        suggestedQuestion: n.title.slice(0,70)+"?"
      }));
      setArticles(seed);
      setLastFetched(new Date());
      setError("Live fetch failed — showing cached data");
    }
    setLoading(false);
  };

  // Calls the Messages API with: in-flight cancellation, a minimum gap between
  // requests, and automatic retry-with-backoff specifically for 429 rate limits.
  const callClaude = async (userContent) => {
    // Cancel any request that's still running so switching categories fast
    // doesn't pile up parallel calls (the main cause of 429s here).
    if (activeControllerRef.current) activeControllerRef.current.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    const mySeq = ++requestSeqRef.current;

    // Enforce a small minimum gap between requests leaving the client at all,
    // so rapid tab-tapping can't burst more than ~1 request/700ms.
    const MIN_GAP_MS = 700;
    const since = Date.now() - lastRequestAtRef.current;
    if (since < MIN_GAP_MS) await new Promise(r => setTimeout(r, MIN_GAP_MS - since));
    lastRequestAtRef.current = Date.now();

    const MAX_RETRIES = 3;
    let attempt = 0;
    while (true) {
      if (controller.signal.aborted) throw new DOMException("Superseded by a newer request", "AbortError");
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 4000,
            tools: [{ type: "web_search_20250305", name: "web_search" }],
            messages: [{ role: "user", content: userContent }]
          })
        });
        clearTimeout(timeoutId);

        if (resp.status === 429 && attempt < MAX_RETRIES) {
          // Respect Retry-After if the API sends one, otherwise exponential backoff
          const retryAfterHeader = resp.headers.get("retry-after");
          const waitMs = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : (1000 * Math.pow(2, attempt) + Math.random()*300);
          attempt++;
          if (mySeq === requestSeqRef.current) {
            setRetryNote(`Rate limited — retrying in ${Math.ceil(waitMs/1000)}s… (${attempt}/${MAX_RETRIES})`);
          }
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }

        if (!resp.ok) {
          const errBody = await resp.text().catch(()=>"");
          let detail = errBody;
          try { detail = JSON.parse(errBody)?.error?.message || errBody; } catch {}
          if (resp.status === 429) throw new Error(`Still rate limited after ${MAX_RETRIES} retries. Wait a moment and try again.`);
          throw new Error(`API error ${resp.status}: ${detail.slice(0,180)}`);
        }

        if (mySeq === requestSeqRef.current) setRetryNote(null);
        return await resp.json();
      } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === "AbortError" && !controller.signal.aborted) {
          // genuine 45s timeout vs supersede-abort look the same; only timeout reaches here
          throw new Error("Request timed out after 45s. Try again.");
        }
        throw e;
      }
    }
  };

  const fetchNews = async (cat) => {
    setLoading(true); setError(null); setArticles([]); setRetryNote(null);
    const query = cat === "All"
      ? "top breaking news today from Reuters AP Bloomberg BBC WSJ CNN"
      : `top ${cat} news today ${cat === "Crypto" ? "bitcoin ethereum markets" : cat === "AI/Tech" ? "artificial intelligence technology" : cat === "Finance" ? "markets economy federal reserve" : cat === "Politics" ? "government elections policy" : cat === "Sports" ? "scores results highlights" : "international global"}`;
    const mySeq = requestSeqRef.current + 1; // callClaude will bump it; capture intended seq for stale-check below
    try {
      const data = await callClaude(`Search the web for ${query} right now. Then, as your final reply, output EXACTLY 8 articles formatted as a JSON array — nothing else in your reply, no preamble, no explanation, no markdown code fences, just the raw array starting with [ and ending with ].

Each array element must look exactly like this:
{"id": 1, "headline": "concise headline max 90 chars", "summary": "two sentence summary in your own words", "source": "outlet name like Reuters", "category": "Finance", "publishedAgo": "2h ago", "sentiment": "bullish", "sentimentScore": 0.4, "marketRelevance": "high", "suggestedQuestion": "a yes/no question max 80 chars"}

Valid category values: Finance, AI/Tech, Crypto, Politics, Sports, World
Valid sentiment values: bullish, bearish, neutral
Valid marketRelevance values: high, medium, low

Remember: your reply must contain ONLY the JSON array. Do not write anything before [ or after ].`);

      // If a newer request started while this one was retrying/in-flight, drop this stale result.
      if (mySeq !== requestSeqRef.current) return;

      if (data.error) throw new Error(data.error.message || "API returned an error");

      const textBlocks = (data.content || []).filter(b => b.type === "text").map(b => b.text);
      const text = textBlocks.join("\n").trim();

      if (!text) {
        const reason = data.stop_reason === "max_tokens" ? "Response was cut off (hit token limit) — try again"
          : data.stop_reason === "tool_use" ? "Model stopped mid-search without answering — try again"
          : "Empty response from model";
        throw new Error(reason);
      }

      const parsed = extractJsonArray(text);
      if (!parsed) throw new Error("Couldn't parse article data from the response. Raw start: " + text.slice(0,120));
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("No articles in response");

      setArticles(parsed);
      setLastFetched(new Date());
    } catch (e) {
      if (e.name === "AbortError" && e.message === "Superseded by a newer request") return; // silent — newer fetch is taking over
      console.error("News fetch failed:", e);
      setError(e.message || "Couldn't load news. Tap retry.");
      setRetryNote(null);
    }
    setLoading(false);
  };

  const searchNews = async (term) => {
    if (!term.trim()) return;
    setLoading(true); setError(null); setArticles([]); setSearchMode(true); setSearchActive(true); setRetryNote(null);
    const mySeq = requestSeqRef.current + 1;
    try {
      const data = await callClaude(`Search the web for the latest news about: "${term.trim()}". Then, as your final reply, output up to 8 articles formatted as a JSON array — nothing else in your reply, no preamble, no explanation, no markdown code fences, just the raw array starting with [ and ending with ]. If you find fewer than 8 relevant results, return however many you find — do not pad with unrelated stories. If you find none, return [].

Each array element must look exactly like this:
{"id": 1, "headline": "concise headline max 90 chars", "summary": "two sentence summary in your own words", "source": "outlet name like Reuters", "category": "Finance", "publishedAgo": "2h ago", "sentiment": "bullish", "sentimentScore": 0.4, "marketRelevance": "high", "suggestedQuestion": "a yes/no question max 80 chars"}

Valid category values: Finance, AI/Tech, Crypto, Politics, Sports, World
Valid sentiment values: bullish, bearish, neutral
Valid marketRelevance values: high, medium, low

Remember: your reply must contain ONLY the JSON array. Do not write anything before [ or after ].`);

      if (mySeq !== requestSeqRef.current) return; // superseded — drop stale result

      if (data.error) throw new Error(data.error.message || "API returned an error");

      const textBlocks = (data.content || []).filter(b => b.type === "text").map(b => b.text);
      const text = textBlocks.join("\n").trim();
      if (!text) {
        const reason = data.stop_reason === "max_tokens" ? "Response was cut off (hit token limit) — try again"
          : data.stop_reason === "tool_use" ? "Model stopped mid-search without answering — try again"
          : "Empty response from model";
        throw new Error(reason);
      }

      const parsed = extractJsonArray(text);
      if (!parsed) throw new Error("Couldn't parse search results. Raw start: " + text.slice(0,120));

      setArticles(parsed);
      setLastFetched(new Date());
      if (parsed.length === 0) setError(`No results found for "${term.trim()}"`);
    } catch (e) {
      if (e.name === "AbortError" && e.message === "Superseded by a newer request") return;
      console.error("News search failed:", e);
      setError(e.message || "Search failed. Try again.");
      setRetryNote(null);
    }
    setLoading(false);
  };

  const clearSearch = () => {
    setSearchInput(""); setSearchQuery(""); setSearchActive(false); setSearchMode(false);
    fetchNewsFromAV(category());
  };

  const generateMarket = async (article) => {
    setGeneratingMarket(article.id);
    await new Promise(r => setTimeout(r, 600));
    onCreateMarket(article.suggestedQuestion || article.headline, article.category);
    setGeneratingMarket(null);
  };

  // Only auto-fetch by category when not actively searching
  createEffect(() => { if (!searchActive()) fetchNewsFromAV(category()); });

  // Instant client-side filter over whatever's currently loaded (only when not in live search mode)
  const visibleArticles = (!searchMode() && searchQuery().trim())
    ? articles().filter(a => {
        const q = searchQuery().trim().toLowerCase();
        return (a.headline||"").toLowerCase().includes(q)
          || (a.summary||"").toLowerCase().includes(q)
          || (a.source||"").toLowerCase().includes(q)
          || (a.category||"").toLowerCase().includes(q);
      })
    : articles();

  const sentColor = s => s === "bullish" ? "#D4AF37" : s === "bearish" ? "#888888" : "#aaaaaa";
  const sentIcon  = s => s === "bullish" ? "▲" : s === "bearish" ? "▼" : "●";
  const srcColor  = src => SOURCE_BADGE[src] || "#D4AF37";

  return (
    <div style={{ paddingBottom: 4 }}>
      {/* Search bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <span style={{ position: "absolute", left: 12, color: S.muted, fontSize: 13, pointerEvents: "none" }}>🔍</span>
          <input
            value={searchInput()}
            onChange={e => { setSearchInput(e.target.value); setSearchQuery(e.target.value); if (searchMode()) setSearchMode(false); }}
            onKeyDown={e => { if (e.key === "Enter" && searchInput().trim()) searchNews(searchInput()); }}
            placeholder="Search news (press enter for live results)…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: `1px solid ${searchActive() ? "rgba(212,175,55,0.4)" : S.border}`, borderRadius: 11, padding: "10px 36px 10px 32px", color: S.text, fontSize: 12.5, fontFamily: "inherit", outline: "none" }}
          />
          {searchInput() && (
            <button onClick={clearSearch}
              style={{ position: "absolute", right: 8, width: 22, height: 22, border: "none", borderRadius: "50%", background: "rgba(255,255,255,0.08)", color: S.muted, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ✕
            </button>
          )}
        </div>
        {searchInput().trim() && !loading() && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, paddingLeft: 2 }}>
            <span style={{ fontSize: 10, color: S.muted }}>
              {searchMode() ? `Live results for "${searchInput().trim()}"` : `Filtering loaded headlines · `}
            </span>
            {!searchMode() && (
              <button onClick={() => searchNews(searchInput())}
                style={{ fontSize: 10, color: S.accent, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>
                Search the web instead →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Category scroll */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 0 12px", marginBottom: 4 }}>
        {NEWS_CATEGORIES.map(c => (
          <button key={c} onClick={() => { setCategory(c); setSearchInput(""); setSearchQuery(""); setSearchActive(false); setSearchMode(false); }}
            style={{ flexShrink: 0, padding: "6px 14px", border: `1px solid ${category() === c && !searchActive() ? S.accent : S.border}`, borderRadius: 20, background: category() === c && !searchActive() ? "rgba(212,175,55,0.1)" : "transparent", color: category() === c && !searchActive() ? S.accent : S.muted, fontSize: 11, fontFamily: "inherit", fontWeight: category() === c && !searchActive() ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap" }}>
            {c}
          </button>
        ))}
      </div>

      {/* Status bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: retryNote() ? 4 : 12 }}>
        <div style={{ fontSize: 9, color: retryNote() ? "#D4AF37" : S.muted, letterSpacing: "0.15em", textTransform: "uppercase" }}>
          {loading() ? (retryNote() ? retryNote() : searchMode() ? "Searching the web…" : "Fetching headlines…")
            : lastFetched() ? `${lastFetched().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} · ${dataSource()==="av"?"Alpha Vantage":"Web search"}` : ""}
        </div>
        <button onClick={() => searchActive() ? searchNews(searchInput()) : fetchNewsFromAV(category())} disabled={loading()}
          style={{ fontSize: 10, color: loading() ? S.muted : S.accent, background: "none", border: "none", cursor: loading() ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: "0.05em" }}>
          {loading() ? <Spinner /> : "↻ Refresh"}
        </button>
      </div>
      {retryNote() && (
        <div style={{ fontSize: 10, color: S.muted, marginBottom: 12, lineHeight: 1.4 }}>
          The API is briefly limiting requests — this happens if categories are switched quickly. Hang tight, it'll retry automatically.
        </div>
      )}

      {/* Loading skeletons */}
      {loading() && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 14, padding: "14px 16px", animation: "pulse 1.4s ease-in-out infinite" }}>
              <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, marginBottom: 10, width: `${60+i*7}%` }}/>
              <div style={{ height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 4, marginBottom: 6, width: "90%" }}/>
              <div style={{ height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 4, width: "70%" }}/>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error() && !loading() && (
        <div style={{ textAlign: "center", padding: "40px 0", color: S.muted }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>{/429|rate limit/i.test(error()) ? "⏳" : "📡"}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: S.sub, marginBottom: 6 }}>
            {/429|rate limit/i.test(error()) ? "Rate limited" : searchMode() ? "Search failed" : "Couldn't load news"}
          </div>
          <div style={{ fontSize: 11, marginBottom: 18, padding: "0 24px", lineHeight: 1.5, color: S.muted }}>
            {/429|rate limit/i.test(error()) ? "Too many requests went out at once (usually from switching tabs quickly). Wait a few seconds and try again." : error()}
          </div>
          <button onClick={() => searchActive() ? searchNews(searchInput()) : fetchNewsFromAV(category())} class="btn-gold btn-3d" style={{ padding: "10px 24px", border: "none", borderRadius: 10, fontSize: 12, fontFamily: "inherit" }}>Retry</button>
        </div>
      )}

      {/* No client-side matches */}
      {!loading() && !error() && !searchMode() && searchQuery().trim() && visibleArticles.length === 0 && (
        <div style={{ textAlign: "center", padding: "36px 0", color: S.muted }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>🔍</div>
          <div style={{ fontSize: 12, marginBottom: 14 }}>No loaded headlines match "{searchInput().trim()}"</div>
          <button onClick={() => searchNews(searchInput())} class="btn-gold btn-3d" style={{ padding: "9px 20px", border: "none", borderRadius: 10, fontSize: 11.5, fontFamily: "inherit" }}>Search the web instead</button>
        </div>
      )}

      {/* Articles */}
      {!loading() && !error() && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visibleArticles.map(a => {
            const expanded = expandedId() === a.id;
            const cc = CAT_COLOR[a.category] || S.accent;
            const sc = sentColor(a.sentiment);
            return (
              <div key={a.id} style={{ background: S.card, border: `1px solid ${expanded ? "rgba(212,175,55,0.28)" : S.border}`, borderRadius: 14, overflow: "hidden", transition: "border-color 0.15s" }}>
                <div onClick={() => setExpandedId(expanded ? null : a.id)} style={{ padding: "13px 14px", cursor: "pointer" }}>
                  {/* Top row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: srcColor(a.source), borderRadius: 4, padding: "2px 6px", letterSpacing: "0.03em", flexShrink: 0 }}>{a.source}</span>
                    <span style={{ fontSize: 9, color: cc, background: CAT_BG[a.category] || "rgba(212,175,55,0.08)", border: `1px solid ${cc}30`, borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>{a.category}</span>
                    <span style={{ fontSize: 9, color: S.muted, marginLeft: "auto", flexShrink: 0 }}>{a.publishedAgo}</span>
                  </div>
                  {/* Headline */}
                  <div style={{ fontSize: 13, fontWeight: 600, color: S.text, lineHeight: 1.4, marginBottom: 8 }}>{a.headline}</div>
                  {/* Sentiment + relevance */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10, color: sc, fontWeight: 700 }}>{sentIcon(a.sentiment)} {a.sentiment}</span>
                      <div style={{ width: 40, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.abs(a.sentimentScore||0)*100}%`, background: sc, borderRadius: 2 }}/>
                      </div>
                    </div>
                    {a.marketRelevance === "high" && (
                      <span style={{ fontSize: 9, color: "#D4AF37", background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.2)", borderRadius: 4, padding: "1px 6px" }}>🔥 High relevance</span>
                    )}
                    <span style={{ marginLeft: "auto", fontSize: 11, color: S.muted }}>{expanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div style={{ borderTop: `1px solid ${S.border}`, padding: "12px 14px", background: "rgba(255,255,255,0.01)" }}>
                    <p style={{ fontSize: 12, color: S.sub, lineHeight: 1.6, margin: "0 0 14px" }}>{a.summary}</p>
                    <div style={{ background: "rgba(212,175,55,0.05)", border: "1px solid rgba(212,175,55,0.18)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                      <div style={{ fontSize: 9, color: S.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>Suggested market</div>
                      <div style={{ fontSize: 12, color: S.accent, fontWeight: 600, lineHeight: 1.4 }}>{a.suggestedQuestion}</div>
                    </div>
                    <button onClick={() => generateMarket(a)} disabled={generatingMarket() === a.id}
                      style={{ width: "100%", padding: "10px 0", border: "none", borderRadius: 10, background: generatingMarket() === a.id ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg,#B8960C,#D4AF37)", color: generatingMarket() === a.id ? S.muted : "#fff", fontSize: 12, fontFamily: "inherit", fontWeight: 700, cursor: generatingMarket() === a.id ? "not-allowed" : "pointer", letterSpacing: "0.05em", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      {generatingMarket() === a.id ? <><Spinner/>Creating…</> : "⬡ Create Market from This"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
function LandingPage({onLogin, onSignup, savedUsers}){
  const [tick, setTick] = createSignal(0);
  const [hov, setHov] = createSignal(null);
  createEffect(()=>{ const t=setInterval(()=>setTick(x=>x+1),2800); onCleanup(() => clearInterval(t)); });
  const active=LIVE_TICKERS[tick()%LIVE_TICKERS.length];
  return (
    <div style={{minHeight:"100vh",overflowY:"auto",background:S.bg,color:S.text,fontFamily:"'DM Mono',monospace"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,background:"radial-gradient(ellipse 80% 50% at 50% -5%,rgba(212,175,55,0.07) 0%,transparent 65%)"}}/>
      {/* Nav */}
      <div style={{position:"sticky",top:0,zIndex:10,background:"rgba(10,10,10,0.92)",backdropFilter:"blur(16px)",borderBottom:`1px solid ${S.border}`,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:52}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>◈</span>
          <span style={{fontSize:13,fontWeight:800,letterSpacing:"-0.02em",color:S.text}}>Bazaar</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onLogin} style={{padding:"7px 16px",border:`1px solid ${S.border}`,borderRadius:9,background:"transparent",color:S.sub,fontSize:12,fontFamily:"inherit",fontWeight:600,cursor:"pointer"}}>Sign in</button>
          <button onClick={onSignup} style={{padding:"7px 16px",border:"none",borderRadius:9,background:S.accent,color:"#fff",fontSize:12,fontFamily:"inherit",fontWeight:700,cursor:"pointer"}}>Sign up</button>
        </div>
      </div>

      <div style={{position:"relative",zIndex:1,padding:"0 0 60px"}}>
        {/* Hero */}
        <div style={{padding:"52px 24px 36px",textAlign:"center"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(212,175,55,0.08)",border:"1px solid rgba(212,175,55,0.22)",borderRadius:20,padding:"4px 12px",fontSize:10,color:S.accent,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:20}}>
            ● Live · LMSR Automated Market Maker
          </div>
          <h1 style={{margin:"0 0 14px",fontSize:32,fontWeight:900,letterSpacing:"-0.04em",lineHeight:1.1,color:S.text}}>
            Predict the future.<br/>
            <span style={{background:"linear-gradient(90deg,#D4AF37,#f0f0f0)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Get rewarded.</span>
          </h1>
          <p style={{color:S.sub,fontSize:13,lineHeight:1.7,margin:"0 auto 32px",maxWidth:280}}>
            Trade YES/NO contracts on real-world events. Prices are set by an automated market maker — no counterparty needed.
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:10,alignItems:"center"}}>
            <button onClick={onSignup} style={{width:"100%",maxWidth:300,padding:"15px 0",border:"none",borderRadius:14,background:"linear-gradient(135deg,#B8960C,#D4AF37)",color:"#fff",fontSize:14,fontFamily:"inherit",fontWeight:800,letterSpacing:"0.05em",cursor:"pointer",boxShadow:"0 0 32px rgba(212,175,55,0.25)"}}>CREATE FREE ACCOUNT</button>
            <button onClick={onLogin} style={{width:"100%",maxWidth:300,padding:"13px 0",border:`1px solid ${S.border}`,borderRadius:14,background:"transparent",color:S.sub,fontSize:13,fontFamily:"inherit",fontWeight:600,cursor:"pointer"}}>
              {savedUsers.length>0?`Sign in (${savedUsers.length} saved account${savedUsers.length>1?"s":""})` : "Sign in"}
            </button>
          </div>
          <div style={{marginTop:16,fontSize:10,color:S.muted}}>$1,000 in demo funds on sign-up · No card required</div>
        </div>

        {/* Live ticker */}
        <div style={{margin:"0 16px 28px",padding:"14px 16px",background:S.card,border:`1px solid ${S.border}`,borderRadius:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:9,color:S.muted,letterSpacing:"0.15em",textTransform:"uppercase"}}>Live market</div>
            <span style={{fontSize:9,fontWeight:700,color:CAT_COLOR[active.cat]||S.accent,background:CAT_BG[active.cat]||"",border:`1px solid ${CAT_COLOR[active.cat]||S.accent}30`,borderRadius:5,padding:"2px 7px",textTransform:"uppercase",letterSpacing:"0.1em"}}>{active.cat}</span>
          </div>
          <div style={{fontSize:13,fontWeight:500,color:S.text,marginBottom:12,lineHeight:1.4}}>{active.q}</div>
          <div style={{display:"flex",gap:10,marginBottom:10}}>
            <div style={{flex:1,textAlign:"center",background:"rgba(57,255,106,0.08)",border:"1px solid rgba(57,255,106,0.25)",borderRadius:10,padding:"8px 0"}}>
              <div style={{fontSize:9,color:S.muted,marginBottom:2}}>YES</div>
              <div style={{fontSize:20,fontWeight:900,color:NEON_GREEN,letterSpacing:"-0.03em",textShadow:"0 0 12px rgba(57,255,106,0.4)"}}>{active.yes}¢</div>
            </div>
            <div style={{flex:1,textAlign:"center",background:"rgba(255,46,196,0.08)",border:"1px solid rgba(255,46,196,0.25)",borderRadius:10,padding:"8px 0"}}>
              <div style={{fontSize:9,color:S.muted,marginBottom:2}}>NO</div>
              <div style={{fontSize:20,fontWeight:900,color:HOT_MAGENTA,letterSpacing:"-0.03em",textShadow:"0 0 12px rgba(255,46,196,0.4)"}}>{100-active.yes}¢</div>
            </div>
          </div>
          <div style={{height:4,background:"rgba(255,255,255,0.05)",borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${active.yes}%`,background:`linear-gradient(90deg,${NEON_GREEN_DIM},${NEON_GREEN})`,borderRadius:2,transition:"width 0.8s ease",boxShadow:`0 0 8px ${NEON_GREEN}80`}}/>
          </div>
          <div style={{marginTop:8,fontSize:10,color:S.muted,textAlign:"center"}}>Sign up to trade this market →</div>
        </div>

        {/* Feature grid */}
        <div style={{padding:"0 16px",marginBottom:28}}>
          <div style={{fontSize:9,color:S.muted,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:14,textAlign:"center"}}>Why Bazaar</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[{icon:"⬡",title:"LMSR Pricing",desc:"Hanson's log scoring rule keeps prices efficient and bounded."},{icon:"◈",title:"Trade Any Outcome",desc:"Buy YES or NO. Prices always sum to 100¢."},{icon:"💳",title:"Easy Deposits",desc:"Fund via Cash App, Venmo, or Zelle."},{icon:"📊",title:"Live Charts",desc:"Sparklines track sentiment as markets move."}].map(f=>(
              <div key={f.title} style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:14,padding:"14px 12px"}}>
                <div style={{fontSize:22,marginBottom:8}}>{f.icon}</div>
                <div style={{fontSize:12,fontWeight:700,color:S.text,marginBottom:4}}>{f.title}</div>
                <div style={{fontSize:10,color:S.sub,lineHeight:1.5}}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Market list preview */}
        <div style={{padding:"0 16px",marginBottom:28}}>
          <div style={{fontSize:9,color:S.muted,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:14}}>Open markets</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {LIVE_TICKERS.map((t,i)=>(
              <div key={i} onClick={onSignup} onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:hov()===i?"rgba(255,255,255,0.05)":S.card,border:`1px solid ${hov()===i?"rgba(212,175,55,0.28)":S.border}`,borderRadius:12,padding:"11px 14px",cursor:"pointer",transition:"all 0.15s"}}>
                <div style={{flex:1,fontSize:12,color:S.sub,lineHeight:1.4,marginRight:12}}>{t.q}</div>
                <div style={{display:"flex",gap:8,flexShrink:0}}>
                  <span style={{fontSize:13,fontWeight:800,color:NEON_GREEN}}>{t.yes}¢</span>
                  <span style={{fontSize:13,fontWeight:800,color:HOT_MAGENTA}}>{100-t.yes}¢</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{textAlign:"center",marginTop:12,fontSize:11,color:S.muted}}>
            <span onClick={onSignup} style={{color:S.accent,cursor:"pointer",textDecoration:"underline"}}>Sign up to see all markets →</span>
          </div>
        </div>

        {/* CTA footer */}
        <div style={{margin:"0 16px",padding:"18px",background:"rgba(212,175,55,0.05)",border:"1px solid rgba(212,175,55,0.18)",borderRadius:16,textAlign:"center"}}>
          <div style={{display:"flex",justifyContent:"center",gap:28,marginBottom:14}}>
            {[["$0","Min deposit"],["100¢","Max odds"],["LMSR","Pricing model"]].map(([v,l])=>(
              <div key={l}><div style={{fontSize:18,fontWeight:900,color:S.accent,letterSpacing:"-0.03em"}}>{v}</div><div style={{fontSize:9,color:S.muted,marginTop:2}}>{l}</div></div>
            ))}
          </div>
          <button onClick={onSignup} class="btn-green btn-3d" style={{width:"100%",padding:"13px 0",border:"none",borderRadius:12,fontSize:13,fontFamily:"inherit",letterSpacing:"0.04em"}}>GET STARTED FREE →</button>
        </div>
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({savedUsers, onLogin, onBack, onSignup}){
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [errors, setErrors] = createSignal({});
  const [loading, setLoading] = createSignal(false);

  const submit = () => {
    const errs={};
    if(!username().trim()) errs.username="Required";
    if(!password()) errs.password="Required";
    if(Object.keys(errs).length){setErrors(errs);return;}
    setLoading(true);
    setTimeout(()=>{
      const u=savedUsers.find(u=>u.username.toLowerCase()===username().trim().toLowerCase());
      if(!u){setErrors({username:"Account not found"});setLoading(false);return;}
      if(u.password!==password()){setErrors({password:"Wrong password"});setLoading(false);return;}
      onLogin(u);
    },600);
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:S.bg,fontFamily:"'DM Mono',monospace"}}>
      <div style={{padding:"18px 20px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${S.border}`}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:S.sub,fontSize:18,cursor:"pointer",padding:0,lineHeight:1}}>←</button>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>◈</span><span style={{fontSize:13,fontWeight:800,color:S.text}}>Bazaar</span></div>
      </div>
      <div style={{flex:1,padding:"32px 24px 40px",overflowY:"auto"}}>
        <h2 style={{margin:"0 0 4px",fontSize:24,fontWeight:900,color:S.text,letterSpacing:"-0.03em"}}>Welcome back</h2>
        <p style={{margin:"0 0 28px",fontSize:13,color:S.sub}}>Sign in to your account</p>
        <Field label="Username" value={username()} onChange={e=>{setUsername(e.target.value);setErrors({});}} placeholder="your_username" error={errors().username}/>
        <Field label="Password" type="password" value={password()} onChange={e=>{setPassword(e.target.value);setErrors({});}} placeholder="••••••••" error={errors().password}/>
        <button onClick={submit} disabled={loading()}
          style={{width:"100%",padding:"14px 0",border:"none",borderRadius:14,background:loading()?"rgba(212,175,55,0.35)":S.accent,color:"#fff",fontSize:14,fontFamily:"inherit",fontWeight:800,cursor:loading()?"not-allowed":"pointer",letterSpacing:"0.05em",marginTop:4,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          {loading()?<><Spinner/>Signing in…</>:"SIGN IN"}
        </button>
        <div style={{textAlign:"center",marginTop:20,fontSize:12,color:S.muted}}>No account? <span onClick={onSignup} style={{color:S.accent,cursor:"pointer"}}>Create one free →</span></div>

        {savedUsers.length>0&&<>
          <div style={{display:"flex",alignItems:"center",gap:8,margin:"24px 0 14px"}}>
            <div style={{flex:1,height:1,background:S.border}}/><span style={{fontSize:9,color:S.muted,letterSpacing:"0.15em",textTransform:"uppercase",whiteSpace:"nowrap"}}>Saved accounts</span><div style={{flex:1,height:1,background:S.border}}/>
          </div>
          {savedUsers.map(u=>(
            <div key={u.username} onClick={()=>{setUsername(u.username);setPassword(u.password);}}
              style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:12,border:`1px solid ${S.border}`,marginBottom:8,cursor:"pointer",background:S.card}}>
              <Avatar user={u} size={34}/>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:S.text}}>{u.username}</div><div style={{fontSize:10,color:S.muted}}>{u.email}</div></div>
              <div style={{fontSize:12,color:"#f0f0f0"}}>${(u.cash||0).toFixed(0)}</div>
            </div>
          ))}
        </>}
      </div>
    </div>
  );
}

// ─── Signup + Survey ──────────────────────────────────────────────────────────
function SignupScreen({savedUsers, onSignup, onBack, onLogin}){
  const [step, setStep] = createSignal(0);
  const [username, setUsername] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [confirm, setConfirm] = createSignal("");
  const [errors, setErrors] = createSignal({});
  const [answers, setAnswers] = createSignal({});
  const [saving, setSaving] = createSignal(false);

  const nextCreds = () => {
    const errs={};
    if(username().trim().length<3) errs.username="Must be 3+ characters";
    else if(savedUsers.find(u=>u.username.toLowerCase()===username().trim().toLowerCase())) errs.username="Username already taken";
    if(!email().includes("@")) errs.email="Enter a valid email";
    if(password().length<6) errs.password="Must be 6+ characters";
    if(password()!==confirm()) errs.confirm="Passwords don't match";
    if(Object.keys(errs).length){setErrors(errs);return;}
    setErrors({});setStep(1);
  };

  const toggle = (id,val,multi) => setAnswers(prev=>{
    if(multi){const cur=prev[id]||[];return{...prev,[id]:cur.includes(val)?cur.filter(x=>x!==val):[...cur,val]};}
    return{...prev,[id]:val};
  });

  const finish = () => {
    setSaving(true);
    setTimeout(()=>{
      onSignup({username:username().trim(),email:email(),password:password(),survey:answers(),joinedAt:Date.now(),cash:1000,positions:{},depositHistory:[]});
    },800);
  };

  // Survey steps
  if(step()>0){
    const qi=step()-1;
    if(qi>=SURVEY.length) return (
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 28px",textAlign:"center",background:S.bg,fontFamily:"'DM Mono',monospace"}}>
        <div style={{fontSize:52,marginBottom:16}}>🎉</div>
        <div style={{fontSize:22,fontWeight:800,color:S.text,marginBottom:6}}>You're in, {username()}!</div>
        <div style={{fontSize:13,color:S.sub,marginBottom:8,lineHeight:1.6}}>Profile created. Starting balance: <span style={{color:"#f0f0f0",fontWeight:700}}>$1,000</span></div>
        <div style={{fontSize:11,color:S.muted,marginBottom:32}}>Your data is saved and will persist across sessions.</div>
        <button onClick={finish} disabled={saving()}
          style={{width:"100%",maxWidth:300,padding:"15px 0",border:"none",borderRadius:14,background:"linear-gradient(135deg,#888888,#aaaaaa)",color:"#fff",fontSize:14,fontFamily:"inherit",fontWeight:800,cursor:saving()?"not-allowed":"pointer",letterSpacing:"0.05em",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          {saving()?<><Spinner/>Saving…</>:"START TRADING →"}
        </button>
      </div>
    );
    const q=SURVEY[qi]; const ans=answers()[q.id]; const canNext=q.multi?(ans&&ans.length>0):!!ans;
    return (
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:S.bg,fontFamily:"'DM Mono',monospace"}}>
        <div style={{padding:"18px 20px 0",display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setStep(s=>s-1)} style={{background:"none",border:"none",color:S.sub,fontSize:18,cursor:"pointer",padding:0,lineHeight:1}}>←</button>
          <div style={{flex:1,display:"flex",gap:3}}>{SURVEY.map((_,i)=><div key={i} style={{flex:1,height:3,borderRadius:2,background:i<qi?"#D4AF37":i===qi?"rgba(212,175,55,0.5)":"rgba(255,255,255,0.06)"}}/>)}</div>
        </div>
        <div style={{flex:1,padding:"24px 22px 32px",display:"flex",flexDirection:"column"}}>
          <div style={{fontSize:9,color:S.accent,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:8}}>Step {qi+1} of {SURVEY.length}</div>
          <div style={{fontSize:20,fontWeight:700,color:S.text,lineHeight:1.35,marginBottom:24}}>{q.q}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,flex:1}}>
            {q.opts.map(opt=>{
              const sel=q.multi?(ans||[]).includes(opt.v):ans===opt.v;
              return <button key={opt.v} onClick={()=>toggle(q.id,opt.v,q.multi)}
                style={{padding:"14px 16px",border:`1.5px solid ${sel?"#D4AF37":"rgba(255,255,255,0.09)"}`,borderRadius:14,background:sel?"rgba(212,175,55,0.12)":"rgba(255,255,255,0.03)",color:sel?S.accent:S.sub,fontSize:14,fontFamily:"inherit",fontWeight:sel?700:400,cursor:"pointer",textAlign:"left",transition:"all 0.12s"}}>
                {opt.l}
              </button>;
            })}
          </div>
          <button onClick={()=>setStep(s=>s+1)} disabled={!canNext}
            class={canNext?"btn-green btn-3d":"btn-3d"} style={{marginTop:20,width:"100%",padding:"14px 0",border:"none",borderRadius:14,fontSize:14,fontFamily:"inherit",letterSpacing:"0.05em",background:canNext?"":"rgba(255,255,255,0.05)",color:canNext?"":"#555"}}>
            {qi<SURVEY.length-1?"NEXT →":"FINISH SETUP"}
          </button>
        </div>
      </div>
    );
  }

  // Credentials step
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:S.bg,fontFamily:"'DM Mono',monospace"}}>
      <div style={{padding:"18px 20px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${S.border}`}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:S.sub,fontSize:18,cursor:"pointer",padding:0,lineHeight:1}}>←</button>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>◈</span><span style={{fontSize:13,fontWeight:800,color:S.text}}>Bazaar</span></div>
      </div>
      <div style={{flex:1,padding:"28px 24px 40px",overflowY:"auto"}}>
        <h2 style={{margin:"0 0 4px",fontSize:24,fontWeight:900,color:S.text,letterSpacing:"-0.03em"}}>Create account</h2>
        <p style={{margin:"0 0 24px",fontSize:13,color:S.sub}}>Free forever. Start with $1,000 in demo funds.</p>
        <Field label="Username" value={username()} onChange={e=>{setUsername(e.target.value);setErrors({});}} placeholder="satoshi_v2" error={errors().username}/>
        <Field label="Email" type="email" value={email()} onChange={e=>{setEmail(e.target.value);setErrors({});}} placeholder="you@example.com" error={errors().email}/>
        <Field label="Password" type="password" value={password()} onChange={e=>{setPassword(e.target.value);setErrors({});}} placeholder="min 6 characters" error={errors().password}/>
        <Field label="Confirm password" type="password" value={confirm()} onChange={e=>{setConfirm(e.target.value);setErrors({});}} placeholder="••••••••" error={errors().confirm}/>
        <button onClick={nextCreds} class="btn-green btn-3d" style={{width:"100%",padding:"14px 0",border:"none",borderRadius:14,fontSize:14,fontFamily:"inherit",letterSpacing:"0.05em"}}>NEXT: SETUP PROFILE →</button>
        <div style={{textAlign:"center",marginTop:16,fontSize:12,color:S.muted}}>Already have an account? <span onClick={onLogin} style={{color:S.accent,cursor:"pointer"}}>Sign in →</span></div>
      </div>
    </div>
  );
}

// ─── Deposit Page ─────────────────────────────────────────────────────────────
function DepositPage({user, onBack, onDeposit}){
  const [screen, setScreen] = createSignal("home");
  const [provider, setProvider] = createSignal(null);
  const [amount, setAmount] = createSignal("");
  const [ref, setRef] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const PRESETS=[10,25,50,100,250,500];

  if(screen()==="success") return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 28px",textAlign:"center"}}>
      <div style={{width:72,height:72,borderRadius:"50%",background:"rgba(212,175,55,0.1)",border:"2px solid rgba(212,175,55,0.35)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,marginBottom:20}}>✓</div>
      <div style={{fontSize:20,fontWeight:800,color:S.text,marginBottom:6}}>Deposit Submitted!</div>
      <div style={{fontSize:13,color:S.sub,lineHeight:1.6,marginBottom:8}}><span style={{color:"#f0f0f0",fontWeight:700}}>${parseFloat(amount()).toFixed(2)}</span> via {provider()?.name} is being processed.</div>
      <div style={{fontSize:11,color:S.muted,marginBottom:28}}>Funds credited instantly for this demo.</div>
      <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${S.border}`,borderRadius:14,padding:"14px 20px",marginBottom:28,width:"100%",maxWidth:300}}>
        {[["Reference",ref()],["Method",provider()?.name],["New Balance","$"+(user.cash + +amount()).toFixed(2)]].map(([l,v],i)=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",paddingBottom:i<2?8:0,marginBottom:i<2?8:0,borderBottom:i<2?`1px solid ${S.border}`:"none"}}>
            <span style={{fontSize:11,color:S.muted}}>{l}</span>
            <span style={{fontSize:11,fontWeight:700,color:l==="New Balance"?"#f0f0f0":S.text}}>{v}</span>
          </div>
        ))}
      </div>
      <button onClick={onBack} style={{width:"100%",maxWidth:300,padding:"14px 0",border:"none",borderRadius:14,background:"linear-gradient(135deg,#888888,#aaaaaa)",color:"#fff",fontSize:14,fontFamily:"inherit",fontWeight:800,cursor:"pointer",letterSpacing:"0.05em"}}>BACK TO APP</button>
    </div>
  );

  if(screen()==="confirm") return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"18px 20px 14px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${S.border}`}}>
        <button onClick={()=>setScreen("provider")} style={{background:"none",border:"none",color:S.sub,fontSize:18,cursor:"pointer",padding:0}}>←</button>
        <div style={{fontSize:15,fontWeight:700,color:S.text}}>Confirm Deposit</div>
      </div>
      <div style={{flex:1,padding:"20px",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,padding:"12px 14px",background:provider().bg,border:`1px solid ${provider().border}`,borderRadius:14}}>
          <provider.logo size={38}/><div><div style={{fontSize:14,fontWeight:700,color:S.text}}>{provider().name}</div><div style={{fontSize:11,color:provider().color}}>{provider().handle}</div></div>
        </div>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:9,color:S.muted,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:4}}>Amount</div>
          <div style={{fontSize:44,fontWeight:900,color:provider().color,letterSpacing:"-0.04em"}}>${parseFloat(amount()).toFixed(2)}</div>
        </div>
        <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:14,overflow:"hidden",marginBottom:18}}>
          {[["Send To",provider().handle],["Reference #",ref()],["Your Username",user.username],["After Deposit","$"+(user.cash + +amount()).toFixed(2)]].map(([l,v],i,arr)=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"11px 14px",borderBottom:i<arr.length-1?`1px solid ${S.border}`:"none"}}>
              <span style={{fontSize:11,color:S.muted}}>{l}</span>
              <span style={{fontSize:12,fontWeight:700,color:l==="After Deposit"?"#D4AF37":S.text}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{background:"rgba(212,175,55,0.06)",border:"1px solid rgba(212,175,55,0.2)",borderRadius:12,padding:"10px 14px",marginBottom:20,display:"flex",gap:10}}>
          <span style={{flexShrink:0}}>⚠️</span>
          <div style={{fontSize:11,color:"#D4AF37",lineHeight:1.5}}>Include your username <strong>{user.username}</strong> in the memo/note field.</div>
        </div>
        <button onClick={()=>{setLoading(true);setTimeout(()=>{setLoading(false);onDeposit(+amount(),provider());setScreen("success");},1800);}} disabled={loading()}
          class="btn-green btn-3d" style={{width:"100%",padding:"14px 0",border:"none",borderRadius:14,fontSize:13,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          {loading()?<><Spinner/>Processing…</>:`I've Sent $${parseFloat(amount()).toFixed(2)} via ${provider().name}`}
        </button>
      </div>
    </div>
  );

  if(screen()==="provider") return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"18px 20px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:`1px solid ${S.border}`}}>
        <button onClick={()=>setScreen("home")} style={{background:"none",border:"none",color:S.sub,fontSize:18,cursor:"pointer",padding:0}}>←</button>
        <provider.logo size={24}/>
        <div style={{fontSize:14,fontWeight:700,color:S.text}}>Deposit via {provider().name}</div>
      </div>
      <div style={{flex:1,padding:"18px",overflowY:"auto"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:20,padding:"18px 0",background:provider().bg,border:`1px solid ${provider().border}`,borderRadius:16}}>
          <div style={{background:"#fff",padding:8,borderRadius:10,marginBottom:10}}><QRMock color={provider().color} size={110}/></div>
          <div style={{fontSize:14,fontWeight:700,color:provider().color}}>{provider().handle}</div>
          <div style={{fontSize:10,color:S.muted,marginTop:2}}>Scan or search manually</div>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:9,color:S.muted,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:8}}>Amount</div>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:S.muted,fontSize:18,fontWeight:700}}>$</span>
            <input type="number" value={amount()} onChange={e=>setAmount(e.target.value)} placeholder="0.00" inputMode="decimal"
              style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:`1px solid ${amount()&&+amount()>=1?provider().color:"rgba(255,255,255,0.1)"}`,borderRadius:12,padding:"13px 14px 13px 32px",color:S.text,fontSize:22,fontFamily:"inherit",fontWeight:800,outline:"none"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginTop:8}}>
            {PRESETS.map(v=><button key={v} onClick={()=>setAmount(String(v))} style={{padding:"7px 0",border:`1px solid ${+amount()===v?provider().color:"rgba(255,255,255,0.08)"}`,borderRadius:9,background:+amount()===v?provider().bg:"rgba(255,255,255,0.03)",color:+amount()===v?provider().color:S.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer",fontWeight:+amount()===v?700:400}}>${v}</button>)}
          </div>
        </div>
        <div style={{marginBottom:18}}>
          {provider().steps.map((step,i)=>(
            <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:8}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:provider().bg,border:`1px solid ${provider().border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:provider().color,flexShrink:0}}>{i+1}</div>
              <div style={{fontSize:12,color:S.sub,lineHeight:1.5,paddingTop:1}}>{step}</div>
            </div>
          ))}
        </div>
        <button onClick={()=>{
          if(!amount()||+amount()<1) return;
          const stripeUrl = STRIPE_LINKS[+amount()];
          if(stripeUrl) {
            // Open Stripe checkout in new tab for real payment
            window.open(stripeUrl + `?client_reference_id=${user.username || "bazaar_user"}&metadata[provider]=${provider().id}`, "_blank");
            // Still show confirm so user can mark as done after payment
          }
          setRef(Math.random().toString(36).slice(2,9).toUpperCase());
          setScreen("confirm");
        }} disabled={!amount()||+amount()<1}
          class={amount()&&+amount()>=1?"btn-green btn-3d":"btn-3d"} style={{width:"100%",padding:"14px 0",border:"none",borderRadius:14,fontSize:14,fontFamily:"inherit",letterSpacing:"0.04em",background:amount()&&+amount()>=1?"":"rgba(255,255,255,0.05)",color:amount()&&+amount()>=1?"":"#555"}}>
          {amount()&&+amount()>=1?(STRIPE_LINKS[+amount()]?`Pay $${parseFloat(amount()).toFixed(2)} via Stripe →`:`Continue — $${parseFloat(amount()).toFixed(2)}`):"Enter an amount"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"18px 20px 14px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${S.border}`}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:S.sub,fontSize:18,cursor:"pointer",padding:0}}>←</button>
        <div><div style={{fontSize:15,fontWeight:700,color:S.text}}>Add Funds</div><div style={{fontSize:10,color:S.muted}}>Balance: <span style={{color:"#f0f0f0"}}>${user.cash.toFixed(2)}</span></div></div>
      </div>
      <div style={{flex:1,padding:"18px 16px",overflowY:"auto"}}>
        <div style={{background:"rgba(212,175,55,0.06)",border:"1px solid rgba(212,175,55,0.2)",borderRadius:16,padding:"16px 18px",marginBottom:22,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:9,color:S.muted,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:3}}>Available</div><div style={{fontSize:28,fontWeight:900,color:S.accent,letterSpacing:"-0.04em"}}>${user.cash.toFixed(2)}</div></div>
          <span style={{fontSize:26}}>💳</span>
        </div>
        <div style={{fontSize:9,color:S.muted,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:12}}>Choose method</div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:22}}>
          {PROVIDERS.map(p=>(
            <button key={p.id} onClick={()=>{setProvider(p);setAmount("");setScreen("provider");}}
              style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"14px 16px",background:p.bg,border:`1px solid ${p.border}`,borderRadius:14,cursor:"pointer"}}>
              <p.logo size={42}/><div style={{flex:1,textAlign:"left"}}><div style={{fontSize:14,fontWeight:700,color:S.text}}>{p.name}</div><div style={{fontSize:11,color:p.color}}>{p.handle}</div></div>
              <div style={{fontSize:9,color:S.muted,background:"rgba(255,255,255,0.04)",border:`1px solid ${S.border}`,borderRadius:6,padding:"3px 8px"}}>INSTANT</div>
              <span style={{color:S.muted,fontSize:16}}>›</span>
            </button>
          ))}
        </div>
        <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:12,padding:"12px 14px"}}>
          {[["1","Send via your preferred app"],["2","Include your username in memo"],["3","Funds credited to account ✓"]].map(([n,t])=>(
            <div key={n} style={{display:"flex",alignItems:"center",gap:10,paddingBottom:n==="3"?0:9,marginBottom:n==="3"?0:9,borderBottom:n==="3"?"none":`1px solid ${S.border}`}}>
              <div style={{width:22,height:22,borderRadius:"50%",background:"rgba(212,175,55,0.12)",border:"1px solid rgba(212,175,55,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:S.accent,flexShrink:0}}>{n}</div>
              <div style={{fontSize:11,color:S.sub}}>{t}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:12,fontSize:10,color:S.muted,textAlign:"center",lineHeight:1.6}}>Demo only · No real money transferred</div>
      </div>
    </div>
  );
}

// ─── Profile Screen ───────────────────────────────────────────────────────────
function ProfileScreen({user, portfolioValue, onLogout, onEditSurvey, onDeposit}){
  const hue=[...(user.username||"x")].reduce((a,c)=>a+c.charCodeAt(0),0)%360;
  const traderType={novice:"Curious Observer",casual:"Casual Trader",active:"Active Trader",expert:"Market Maker"}[user.survey?.experience]||"Trader";
  const interests=user.survey?.interests||[];
  const deposits=user.depositHistory||[];
  return (
    <div style={{paddingBottom:20}}>
      {/* Hero banner */}
      <div style={{background:"linear-gradient(160deg,#1a1600 0%,#07060A 100%)",borderBottom:`1px solid ${S.border}`,padding:"24px 18px 20px"}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
          <div style={{width:60,height:60,borderRadius:"50%",background:"linear-gradient(135deg,#2a2200,#3d3300)",border:"2px solid rgba(212,175,55,0.5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800,color:"#fff",flexShrink:0}}>
            {user.username.slice(0,2).toUpperCase()}
          </div>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:S.text}}>{user.username}</div>
            <div style={{fontSize:11,color:S.accent,marginTop:2}}>{traderType}</div>
            <div style={{fontSize:10,color:S.muted,marginTop:1}}>{user.email}</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
          {[["Portfolio","$"+portfolioValue.toFixed(0),S.accent],["Cash","$"+(user.cash||0).toFixed(0),"#D4AF37"],["Joined",new Date(user.joinedAt).toLocaleDateString("en",{month:"short",year:"2-digit"}),S.text]].map(([l,v,c])=>(
            <div key={l} style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"9px 0",textAlign:"center"}}>
              <div style={{fontSize:9,color:S.muted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:2}}>{l}</div>
              <div style={{fontSize:15,fontWeight:800,color:c}}>{v}</div>
            </div>
          ))}
        </div>
        <button onClick={onDeposit} style={{width:"100%",padding:"12px 0",border:"none",borderRadius:12,background:"linear-gradient(135deg,#888888,#aaaaaa)",color:"#fff",fontSize:13,fontFamily:"inherit",fontWeight:800,cursor:"pointer",letterSpacing:"0.04em",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <span>💳</span> Add Funds
        </button>
      </div>

      <div style={{padding:"16px 18px 0"}}>
        {/* Trader profile */}
        {user.survey&&<>
          <div style={{fontSize:9,color:S.muted,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:10}}>Trader Profile</div>
          <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:14,padding:"12px 16px",marginBottom:12}}>
            {[["Experience",{novice:"Just starting out",casual:"Some experience",active:"Regular trader",expert:"Power user"}[user.survey.experience]||"—"],
              ["Style",{conservative:"Steady & safe",balanced:"Balanced",aggressive:"High risk / reward"}[user.survey.risk]||"—"],
              ["Goal",{fun:"Having fun",learn:"Learning",profit:"Making profit",info:"Info aggregation"}[user.survey.goal]||"—"]
            ].map(([l,v],i,arr)=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",paddingBottom:i<arr.length-1?9:0,marginBottom:i<arr.length-1?9:0,borderBottom:i<arr.length-1?`1px solid ${S.border}`:"none"}}>
                <span style={{fontSize:11,color:S.muted}}>{l}</span><span style={{fontSize:12,fontWeight:600,color:S.text}}>{v}</span>
              </div>
            ))}
          </div>
          {interests.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
            {interests.map(i=><span key={i} style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:CAT_COLOR[i]||S.accent,background:CAT_BG[i]||"rgba(212,175,55,0.08)",border:`1px solid ${CAT_COLOR[i]||S.accent}30`,borderRadius:6,padding:"3px 9px"}}>{i}</span>)}
          </div>}
          <button onClick={onEditSurvey} style={{width:"100%",padding:"11px 0",border:`1px solid ${S.border}`,borderRadius:12,background:"transparent",color:S.sub,fontSize:12,fontFamily:"inherit",cursor:"pointer",marginBottom:16}}>Retake Profile Survey</button>
        </>}

        {/* Deposit history */}
        {deposits.length>0&&<>
          <div style={{fontSize:9,color:S.muted,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:10}}>Deposit History</div>
          <div style={{marginBottom:16}}>
            {deposits.slice(-5).reverse().map((d,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",background:S.card,border:`1px solid ${S.border}`,borderRadius:10,marginBottom:6}}>
                <div><div style={{fontSize:12,fontWeight:600,color:S.text}}>{d.provider}</div><div style={{fontSize:10,color:S.muted}}>{new Date(d.ts).toLocaleDateString()}</div></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:800,color:"#D4AF37"}}>+${d.amt.toFixed(2)}</div><div style={{fontSize:9,color:S.muted,letterSpacing:"0.05em"}}>{d.ref}</div></div>
              </div>
            ))}
          </div>
        </>}

        <div style={{fontSize:10,color:S.muted,textAlign:"center",marginBottom:12}}>
          ✓ Profile saved · Last updated {new Date().toLocaleDateString()}
        </div>
        <button onClick={onLogout} style={{width:"100%",padding:"13px 0",border:"1px solid rgba(255,255,255,0.1)",borderRadius:14,background:"rgba(255,255,255,0.04)",color:"#888888",fontSize:13,fontFamily:"inherit",fontWeight:700,cursor:"pointer",letterSpacing:"0.05em"}}>SIGN OUT</button>
      </div>
    </div>
  );
}

// ─── Survey retake sheet ──────────────────────────────────────────────────────
function SurveySheet({onClose, onSave}){
  const [step, setStep] = createSignal(0);
  const [answers, setAnswers] = createSignal({});
  if(step()>=SURVEY.length){onSave(answers());return null;}
  const q=SURVEY[step()]; const ans=answers()[q.id]; const canNext=q.multi?(ans&&ans.length>0):!!ans;
  const toggle=(id,val,multi)=>setAnswers(prev=>{if(multi){const cur=prev[id]||[];return{...prev,[id]:cur.includes(val)?cur.filter(x=>x!==val):[...cur,val]};}return{...prev,[id]:val};});
  return <Sheet onClose={onClose} zIndex={40}>
    <div style={{display:"flex",gap:4,marginBottom:18}}>{SURVEY.map((_,i)=><div key={i} style={{flex:1,height:3,borderRadius:2,background:i<step()?"#D4AF37":i===step()?"rgba(212,175,55,0.5)":"rgba(255,255,255,0.06)"}}/>)}</div>
    <div style={{fontSize:10,color:S.accent,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:6}}>Q {step()+1} / {SURVEY.length}</div>
    <div style={{fontSize:17,fontWeight:700,color:S.text,lineHeight:1.35,marginBottom:18}}>{q.q}</div>
    <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18}}>
      {q.opts.map(opt=>{const sel=q.multi?(ans||[]).includes(opt.v):ans===opt.v;return <button key={opt.v} onClick={()=>toggle(q.id,opt.v,q.multi)} style={{padding:"12px 14px",border:`1.5px solid ${sel?"#D4AF37":"rgba(255,255,255,0.09)"}`,borderRadius:12,background:sel?"rgba(212,175,55,0.12)":"rgba(255,255,255,0.03)",color:sel?S.accent:S.sub,fontSize:13,fontFamily:"inherit",fontWeight:sel?700:400,cursor:"pointer",textAlign:"left"}}>{opt.l}</button>;})}
    </div>
    <button onClick={()=>setStep(s=>s+1)} disabled={!canNext} class={canNext?"btn-green btn-3d":"btn-3d"} style={{width:"100%",padding:"13px 0",border:"none",borderRadius:12,fontSize:13,fontFamily:"inherit",background:canNext?"":"rgba(255,255,255,0.05)",color:canNext?"":"#555"}}>{step()<SURVEY.length-1?"NEXT →":"SAVE PROFILE"}</button>
  </Sheet>;
}

// ─── Connectors Panel ─────────────────────────────────────────────────────────
function ConnectorsPanel({ user, positions, markets, onClose, onDeposit, toast_ }) {
  const [activeConnector, setActiveConnector] = createSignal(null);
  const [avTab, setAvTab] = createSignal("quote");
  const [avSymbol, setAvSymbol] = createSignal("AAPL");
  const [avResult, setAvResult] = createSignal(null);
  const [avLoading, setAvLoading] = createSignal(false);
  const [avError, setAvError] = createSignal(null);
  const [exportLoading, setExportLoading] = createSignal(false);
  const [notifLoading, setNotifLoading] = createSignal(false);
  const [stripeLoading, setStripeLoading] = createSignal(false);
  const [stripeResult, setStripeResult] = createSignal(null);
  const [stripeAmount, setStripeAmount] = createSignal(50);

  // Alpha Vantage actions
  const avLookup = async () => {
    setAvLoading(true); setAvResult(null); setAvError(null);
    try {
      let result;
      if (avTab() === "quote")   result = await avGetGlobalQuote(avSymbol().toUpperCase());
      if (avTab() === "crypto")  result = await avGetCryptoPrice(avSymbol().toUpperCase(), "USD");
      if (avTab() === "forex")   result = await avGetForexRate(avSymbol().toUpperCase(), "USD");
      if (avTab() === "gold")    result = await avGetGoldPrice();
      setAvResult(result);
    } catch (e) { setAvError(e.message); }
    setAvLoading(false);
  };

  // Zapier: export portfolio to Google Sheets
  const exportPortfolio = async () => {
    setExportLoading(true);
    try {
      const trades = Object.entries(positions||{}).filter(([,v])=>v>0.001).map(([key,shares])=>{
        const [mid,out] = key.split("_");
        const mkt = markets.find(m=>m.id===+mid);
        return { market: mkt?.question||mid, outcome: out, shares: shares.toFixed(4), value: (shares*(mkt?lmsrPrice(mkt.qYes,mkt.qNo,out):0)).toFixed(2) };
      });
      await zapierExportTrades(trades, user.username, user.email);
      toast_("Portfolio exported to Google Sheets via Zapier ✓");
    } catch { toast_("Export failed — check Zapier connection", "err"); }
    setExportLoading(false);
  };

  // Zapier: send email notification
  const sendNotification = async () => {
    setNotifLoading(true);
    try {
      await zapierSendNotification(
        "Bazaar Portfolio Summary",
        `Hi ${user.username},\n\nHere is your Bazaar portfolio summary as of ${new Date().toLocaleDateString()}.\n\nCash: $${(user.cash||0).toFixed(2)}\nOpen Positions: ${Object.entries(positions||{}).filter(([,v])=>v>0.001).length}\n\nTrade on bazaar.io`,
        user.email
      );
      toast_("Summary emailed via Zapier ✓");
    } catch { toast_("Email failed — check Zapier/Gmail connection", "err"); }
    setNotifLoading(false);
  };

  // Stripe: create payment link
  const initStripeDeposit = async () => {
    setStripeLoading(true); setStripeResult(null);
    try {
      const result = await stripeCreatePaymentLink(stripeAmount(), user.username);
      setStripeResult(result);
      toast_(`Stripe deposit of $${stripeAmount()} initiated ✓`);
    } catch { toast_("Stripe unavailable — use manual deposit", "err"); }
    setStripeLoading(false);
  };

  const CONNECTORS = [
    { id:"av",     name:"Alpha Vantage", icon:"📊", desc:"Live stock, crypto & forex prices", color:"#1E90FF" },
    { id:"stripe", name:"Stripe",        icon:"💳", desc:"Real payment processing for deposits", color:"#6772E5" },
    { id:"zapier", name:"Zapier",        icon:"⚡", desc:"Export to Sheets & email notifications", color:"#FF4A00" },
  ];

  return (
    <div style={{position:"fixed",inset:0,zIndex:60}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(4px)"}}/>
      <div style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"#111111",borderTop:"1px solid rgba(212,175,55,0.25)",borderRadius:"20px 20px 0 0",animation:"sheetUp 0.25s cubic-bezier(0.32,0.72,0,1)",maxHeight:"88vh",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"10px 0 0"}}><div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,0.12)"}}/></div>
        <div style={{padding:"10px 18px 6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:15,fontWeight:800,color:S.text}}>⚡ Integrations</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:S.muted,fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"6px 18px 32px"}}>
          {/* Connector cards */}
          {!activeConnector() && (
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:8}}>
              {CONNECTORS.map(c=>(
                <button key={c.id} onClick={()=>setActiveConnector(c.id)}
                  style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:`${c.color}10`,border:`1px solid ${c.color}30`,borderRadius:14,cursor:"pointer",textAlign:"left",width:"100%"}}>
                  <span style={{fontSize:24,flexShrink:0}}>{c.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:S.text}}>{c.name}</div>
                    <div style={{fontSize:11,color:S.muted,marginTop:2}}>{c.desc}</div>
                  </div>
                  <span style={{color:c.color,fontSize:13,fontWeight:700}}>›</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Alpha Vantage Panel ── */}
          {activeConnector()==="av" && (
            <div>
              <button onClick={()=>{setActiveConnector(null);setAvResult(null);}} style={{background:"none",border:"none",color:S.sub,fontSize:12,cursor:"pointer",marginBottom:14,padding:0}}>← Back</button>
              <div style={{fontSize:14,fontWeight:800,color:S.text,marginBottom:4}}>📊 Alpha Vantage</div>
              <div style={{fontSize:11,color:S.muted,marginBottom:14}}>Real-time financial data across stocks, crypto, forex and commodities</div>
              {/* Tab selector */}
              <div style={{display:"flex",background:"rgba(255,255,255,0.04)",borderRadius:10,padding:3,marginBottom:14}}>
                {[["quote","Stock"],["crypto","Crypto"],["forex","Forex"],["gold","Gold/Silver"]].map(([id,label])=>(
                  <button key={id} onClick={()=>{setAvTab(id);setAvResult(null);}}
                    style={{flex:1,padding:"7px 0",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:9,fontWeight:avTab()===id?700:400,letterSpacing:"0.05em",textTransform:"uppercase",background:avTab()===id?"rgba(255,255,255,0.08)":"transparent",color:avTab()===id?S.text:S.muted}}>
                    {label}
                  </button>
                ))}
              </div>
              {avTab() !== "gold" && (
                <div style={{position:"relative",marginBottom:10}}>
                  <input value={avSymbol()} onChange={e=>setAvSymbol(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&avLookup()}
                    placeholder={avTab()==="quote"?"AAPL, TSLA, NVDA…":avTab()==="crypto"?"BTC, ETH, SOL…":"EUR, GBP, JPY…"}
                    style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:`1px solid ${S.border}`,borderRadius:10,padding:"10px 90px 10px 14px",color:S.text,fontSize:13,fontFamily:"inherit",outline:"none"}}/>
                  <button onClick={avLookup} disabled={avLoading()} class="btn-gold btn-3d"
                    style={{position:"absolute",right:4,top:4,padding:"6px 12px",border:"none",borderRadius:8,fontSize:11,fontFamily:"inherit",cursor:avLoading()?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:4}}>
                    {avLoading()?<Spinner/>:"Look up"}
                  </button>
                </div>
              )}
              {avTab() === "gold" && (
                <button onClick={avLookup} disabled={avLoading()} class="btn-gold btn-3d"
                  style={{width:"100%",padding:"11px 0",border:"none",borderRadius:10,fontSize:12,fontFamily:"inherit",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  {avLoading()?<><Spinner/>Fetching…</>:"Fetch Live Gold & Silver Prices"}
                </button>
              )}
              {avError() && <div style={{fontSize:11,color:HOT_MAGENTA,marginBottom:8}}>{avError()}</div>}
              {avResult() && (
                <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${S.border}`,borderRadius:12,padding:"12px 14px"}}>
                  <div style={{fontSize:9,color:S.muted,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Live Result</div>
                  <pre style={{margin:0,fontSize:10,color:S.sub,overflowX:"auto",lineHeight:1.6,whiteSpace:"pre-wrap",wordBreak:"break-all"}}>
                    {JSON.stringify(avResult(), null, 2).slice(0,800)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* ── Stripe Panel ── */}
          {activeConnector()==="stripe" && (
            <div>
              <button onClick={()=>{setActiveConnector(null);setStripeResult(null);}} style={{background:"none",border:"none",color:S.sub,fontSize:12,cursor:"pointer",marginBottom:14,padding:0}}>← Back</button>
              <div style={{fontSize:14,fontWeight:800,color:S.text,marginBottom:4}}>💳 Stripe Payments</div>
              <div style={{fontSize:11,color:S.muted,marginBottom:16}}>Real payment processing — connects your Stripe account to fund your Bazaar balance</div>
              <div style={{fontSize:10,color:S.muted,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Deposit Amount</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:14}}>
                {[10,25,50,100,250,500].map(v=>(
                  <button key={v} onClick={()=>setStripeAmount(v)}
                    style={{padding:"10px 0",border:`1px solid ${stripeAmount()===v?"#6772E5":"rgba(255,255,255,0.08)"}`,borderRadius:10,background:stripeAmount()===v?"rgba(103,114,229,0.15)":"rgba(255,255,255,0.03)",color:stripeAmount()===v?"#8B8EF9":S.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer",fontWeight:stripeAmount()===v?700:400}}>
                    ${v}
                  </button>
                ))}
              </div>
              <button onClick={initStripeDeposit} disabled={stripeLoading()} class="btn-3d"
                style={{width:"100%",padding:"13px 0",border:"none",borderRadius:12,background:"linear-gradient(135deg,#5a6fd6,#7f8ef8)",color:"#fff",fontSize:13,fontFamily:"inherit",fontWeight:800,cursor:stripeLoading()?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:10}}>
                {stripeLoading()?<><Spinner/>Connecting Stripe…</>:`Deposit $${stripeAmount()} via Stripe`}
              </button>
              {stripeResult() && (
                <div style={{background:"rgba(103,114,229,0.08)",border:"1px solid rgba(103,114,229,0.25)",borderRadius:12,padding:"12px 14px"}}>
                  <div style={{fontSize:11,color:"#8B8EF9",fontWeight:700,marginBottom:6}}>✓ Stripe Payment Initiated</div>
                  <div style={{fontSize:10,color:S.muted,lineHeight:1.6}}>Complete the payment in your Stripe dashboard. Funds will be credited to your account upon confirmation.</div>
                </div>
              )}
              <button onClick={onDeposit} style={{width:"100%",marginTop:10,padding:"10px 0",border:`1px solid ${S.border}`,borderRadius:12,background:"transparent",color:S.sub,fontSize:12,fontFamily:"inherit",cursor:"pointer"}}>
                Use manual deposit instead (Cash App / Venmo / Zelle)
              </button>
            </div>
          )}

          {/* ── Zapier Panel ── */}
          {activeConnector()==="zapier" && (
            <div>
              <button onClick={()=>setActiveConnector(null)} style={{background:"none",border:"none",color:S.sub,fontSize:12,cursor:"pointer",marginBottom:14,padding:0}}>← Back</button>
              <div style={{fontSize:14,fontWeight:800,color:S.text,marginBottom:4}}>⚡ Zapier Automations</div>
              <div style={{fontSize:11,color:S.muted,marginBottom:16}}>Connect Bazaar to 9,000+ apps. Automate exports, alerts and more.</div>
              {/* Export to Sheets */}
              <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${S.border}`,borderRadius:14,padding:"14px",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <span style={{fontSize:20}}>📊</span>
                  <div><div style={{fontSize:13,fontWeight:700,color:S.text}}>Export to Google Sheets</div><div style={{fontSize:10,color:S.muted}}>Send your open positions to a spreadsheet</div></div>
                </div>
                <button onClick={exportPortfolio} disabled={exportLoading()} class="btn-green btn-3d"
                  style={{width:"100%",padding:"10px 0",border:"none",borderRadius:10,fontSize:12,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  {exportLoading()?<><Spinner/>Exporting…</>:"Export Portfolio → Sheets"}
                </button>
              </div>
              {/* Email summary */}
              <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${S.border}`,borderRadius:14,padding:"14px",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <span style={{fontSize:20}}>📧</span>
                  <div><div style={{fontSize:13,fontWeight:700,color:S.text}}>Email Portfolio Summary</div><div style={{fontSize:10,color:S.muted}}>Send a summary to {user.email}</div></div>
                </div>
                <button onClick={sendNotification} disabled={notifLoading()} class="btn-green btn-3d"
                  style={{width:"100%",padding:"10px 0",border:"none",borderRadius:10,fontSize:12,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  {notifLoading()?<><Spinner/>Sending…</>:"Email Summary → Gmail"}
                </button>
              </div>
              {/* Configure link */}
              <div style={{background:"rgba(255,74,0,0.06)",border:"1px solid rgba(255,74,0,0.2)",borderRadius:12,padding:"12px 14px"}}>
                <div style={{fontSize:11,color:"#FF6B2B",fontWeight:700,marginBottom:4}}>Configure more automations</div>
                <div style={{fontSize:10,color:S.muted,lineHeight:1.5}}>Connect Slack alerts, Notion dashboards, HubSpot CRM and 9,000+ other apps at zapier.com</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Side Menu (mobile-first card layout) ────────────────────────────────────
function SideMenu({ user, onClose, onNavigate, onDeposit, onEditSurvey, onLogout, portfolioValue }) {
  const hue = [...(user.username||"x")].reduce((a,c)=>a+c.charCodeAt(0),0)%360;

  const NAV_ITEMS = [
    { id:"markets",   label:"Markets",   desc:"Browse & trade",      icon:"⬡" },
    { id:"portfolio", label:"Portfolio", desc:"Your positions",      icon:"◈" },
    { id:"news",      label:"News",      desc:"Live headlines",      icon:"📰" },
    { id:"forum",     label:"Forum",     desc:"Discuss & comment",   icon:"💬" },
    { id:"profile",   label:"Profile",   desc:"Account & survey",    icon:"👤" },
  ];
  const ACTION_ITEMS = [
    { label:"Add Funds",          desc:"Cash App, Venmo, Zelle", icon:"💳", onClick:onDeposit },
    { label:"Retake Survey",      desc:"Update your trader profile", icon:"📋", onClick:onEditSurvey },
  ];
  const SUPPORT_ITEMS = [
    { label:"Settings",   desc:"Notifications, preferences", icon:"⚙️" },
    { label:"Help & FAQ", desc:"Get support",                icon:"❓" },
    { label:"About Bazaar", desc:"v1.0 · LMSR market maker",  icon:"ℹ️" },
  ];

  return (
    <div style={{ position:"fixed", inset:0, zIndex:50 }}>
      {/* Scrim */}
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.65)", backdropFilter:"blur(3px)", animation:"fadeDown 0.18s ease" }}/>

      {/* Sliding panel */}
      <div style={{
        position:"absolute", top:0, left:0, bottom:0, width:"84%", maxWidth:360,
        background:"#0d0d0d", borderRight:"1px solid rgba(212,175,55,0.18)",
        display:"flex", flexDirection:"column",
        animation:"menuSlideIn 0.22s cubic-bezier(0.32,0.72,0,1)",
        boxShadow:"8px 0 40px rgba(0,0,0,0.6)",
      }}>
        {/* Scrollable content */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px 16px 16px" }}>

          {/* Close + brand row */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:18 }}>◈</span>
              <span style={{ fontSize:14, fontWeight:800, color:S.text, letterSpacing:"-0.02em" }}>Bazaar</span>
            </div>
            <button onClick={onClose} aria-label="Close menu"
              style={{ width:30, height:30, border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, background:"rgba(255,255,255,0.03)", color:S.muted, fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              ✕
            </button>
          </div>

          {/* Profile card */}
          <div onClick={()=>onNavigate("profile")} style={{
            display:"flex", alignItems:"center", gap:12, padding:"14px", marginBottom:18,
            background:"linear-gradient(160deg,#1a1600 0%,#111111 100%)", border:"1px solid rgba(212,175,55,0.25)",
            borderRadius:16, cursor:"pointer",
          }}>
            <div style={{ width:46, height:46, borderRadius:"50%", background:"linear-gradient(135deg,#2a2200,#3d3300)", border:"2px solid rgba(212,175,55,0.5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, color:"#D4AF37", flexShrink:0 }}>
              {user.username.slice(0,2).toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:700, color:S.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.username}</div>
              <div style={{ fontSize:11, color:S.muted, marginTop:1 }}>Portfolio: <span style={{ color:"#D4AF37", fontWeight:600 }}>${portfolioValue.toFixed(2)}</span></div>
            </div>
            <span style={{ color:S.muted, fontSize:14, flexShrink:0 }}>›</span>
          </div>

          {/* Navigate section — card grid */}
          <div style={{ fontSize:9, color:S.muted, letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:9, paddingLeft:2 }}>Navigate</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:18 }}>
            {NAV_ITEMS.map(item=>(
              <button key={item.id} onClick={()=>onNavigate(item.id)}
                style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", gap:6, padding:"12px 12px", border:`1px solid ${S.border}`, borderRadius:13, background:S.card, cursor:"pointer", textAlign:"left" }}>
                <span style={{ fontSize:18 }}>{item.icon}</span>
                <span style={{ fontSize:12, fontWeight:700, color:S.text }}>{item.label}</span>
                <span style={{ fontSize:9.5, color:S.muted, lineHeight:1.3 }}>{item.desc}</span>
              </button>
            ))}
          </div>

          {/* Actions section — stacked cards */}
          <div style={{ fontSize:9, color:S.muted, letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:9, paddingLeft:2 }}>Account</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:18 }}>
            {ACTION_ITEMS.map(item=>(
              <button key={item.label} onClick={item.onClick}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", border:`1px solid ${S.border}`, borderRadius:13, background:S.card, cursor:"pointer", textAlign:"left" }}>
                <span style={{ fontSize:18, flexShrink:0 }}>{item.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12.5, fontWeight:700, color:S.text }}>{item.label}</div>
                  <div style={{ fontSize:10, color:S.muted, marginTop:1 }}>{item.desc}</div>
                </div>
                <span style={{ color:S.muted, fontSize:13, flexShrink:0 }}>›</span>
              </button>
            ))}
          </div>

          {/* Support section — stacked cards */}
          <div style={{ fontSize:9, color:S.muted, letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:9, paddingLeft:2 }}>Support</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:6 }}>
            {SUPPORT_ITEMS.map(item=>(
              <button key={item.label}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", border:`1px solid ${S.border}`, borderRadius:13, background:S.card, cursor:"pointer", textAlign:"left" }}>
                <span style={{ fontSize:18, flexShrink:0 }}>{item.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12.5, fontWeight:700, color:S.text }}>{item.label}</div>
                  <div style={{ fontSize:10, color:S.muted, marginTop:1 }}>{item.desc}</div>
                </div>
                <span style={{ color:S.muted, fontSize:13, flexShrink:0 }}>›</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sign out footer — pinned */}
        <div style={{ padding:"14px 16px", borderTop:`1px solid ${S.border}` }}>
          <button onClick={onLogout} class="btn-red btn-3d"
            style={{ width:"100%", padding:"12px 0", border:"none", borderRadius:13, fontSize:12.5, fontFamily:"inherit", letterSpacing:"0.04em" }}>
            SIGN OUT
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App(){
  const [booting, setBooting] = createSignal(true);
  const [savedUsers, setSavedUsers] = createSignal([]);
  const [currentUser, setCurrentUser] = createSignal(null);
  const [markets, setMarkets] = createSignal(SEED_MARKETS.map(m=>({...m,priceHistory:[lmsrPrice(m.qYes,m.qNo,"YES")]})));
  const [forumPosts, setForumPosts] = createSignal([]);

  // ── Boot: load persisted data ──
  createEffect(()=>{
    (async()=>{
      const users = await DB.get(K.users, []);
      const session = await DB.get(K.session, null);
      const savedMkts = await DB.get(K.markets, null);
      const savedForum = await DB.get(K.forum, []);
      setSavedUsers(users);
      if(session && users.length){
        const u = users.find(u=>u.username===session);
        if(u) setCurrentUser(u);
      }
      if(savedMkts) setMarkets(savedMkts);
      if(savedForum) setForumPosts(savedForum);
      setBooting(false);
    })();
  });

  // ── Persist users ──
  createEffect(()=>{ if(!booting()) DB.set(K.users, savedUsers()); });
  // ── Persist markets ──
  createEffect(()=>{ if(!booting()) DB.set(K.markets, markets()); });
  // ── Persist forum ──
  createEffect(()=>{ if(!booting()) DB.set(K.forum, forumPosts()); });
  // ── Persist current user into users list + session ──
  createEffect(()=>{
    if(booting() || !currentUser()) return;
    DB.set(K.session, currentUser().username);
    setSavedUsers(prev=>{
      const next = prev.find(u=>u.username===currentUser().username)
        ? prev.map(u=>u.username===currentUser().username ? currentUser() : u)
        : [...prev, currentUser()];
      DB.set(K.users, next);
      return next;
    });
  });

  // ── UI state ──
  const [authScreen, setAuthScreen] = createSignal("landing");
  const [showDeposit, setShowDeposit] = createSignal(false);
  const [navTab, setNavTab] = createSignal("markets");
  const [showMenu, setShowMenu] = createSignal(false);
  const [tradeSheet, setTradeSheet] = createSignal(null);
  const [tradeTab, setTradeTab] = createSignal("buy");
  const [outcome, setOutcome] = createSignal("YES");
  const [amount, setAmount] = createSignal("");
  const [preview, setPreview] = createSignal(null);
  const [toast, setToast] = createSignal(null);
  const [showCreate, setShowCreate] = createSignal(false);
  const [newQ, setNewQ] = createSignal("");
  const [newCat, setNewCat] = createSignal("Finance");
  const [showSurvey, setShowSurvey] = createSignal(false);

  const activeMkt = createMemo(() => markets().find(m=>m.id===tradeSheet()));

  createEffect(()=>{
    if(!activeMkt()||!amount()||isNaN(+amount())||+amount()<=0){setPreview(null);return;}
    if(tradeTab()==="buy") setPreview(computeTrade(activeMkt().qYes,activeMkt().qNo,outcome(),+amount()));
    else{
      const pos=(currentUser()?.positions||{})[`${activeMkt().id}_${outcome()}`]||0;
      const sh=Math.min(+amount(),pos);
      if(sh<=0){setPreview(null);return;}
      const r=computeSell(activeMkt().qYes,activeMkt().qNo,outcome(),sh);
      setPreview(r?{...r,shares:sh}:null);
    }
  });

  const toast_ = (msg,type="ok")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2800); };
  const openTrade = id=>{ setTradeSheet(id); setAmount(""); setPreview(null); setTradeTab("buy"); setOutcome("YES"); };
  const closeTrade = ()=>{ setTradeSheet(null); setAmount(""); setPreview(null); };
  const updateUser = fn => setCurrentUser(prev=>fn(prev));

  const handleLogin = u => setCurrentUser(u);
  const handleSignup = userData => {
    setSavedUsers(prev=>[...prev.filter(u=>u.username!==userData.username), userData]);
    setCurrentUser(userData);
  };
  const handleLogout = () => {
    DB.del(K.session);
    setCurrentUser(null);
    setAuthScreen("landing");
    setNavTab("markets");
  };
  const handleDeposit = (amt,provider) => {
    updateUser(u=>({...u,cash:u.cash+amt,depositHistory:[...(u.depositHistory||[]),{amt,provider:provider.name,ref:Math.random().toString(36).slice(2,9).toUpperCase(),ts:Date.now()}]}));
    toast_(`+$${amt.toFixed(2)} via ${provider.name} credited!`);
  };

  const executeTrade = () => {
    if(!activeMkt()||!preview()||!currentUser()) return;
    if(tradeTab()==="buy"){
      if(preview().actualCost>currentUser().cash){toast_("Insufficient funds","err");return;}
      updateUser(u=>{const key=`${activeMkt().id}_${outcome()}`;return{...u,cash:u.cash-preview().actualCost,positions:{...u.positions,[key]:(u.positions[key]||0)+preview().shares}};});
      setMarkets(ms=>ms.map(m=>{if(m.id!==tradeSheet())return m;const p=lmsrPrice(preview().newQYes,preview().newQNo,"YES");return{...m,qYes:preview().newQYes,qNo:preview().newQNo,priceHistory:[...m.priceHistory.slice(-29),p]};}));
      toast_(`Bought ${preview().shares.toFixed(2)} ${outcome()} @ ${(preview().avgPrice*100).toFixed(1)}¢`);
    } else {
      updateUser(u=>{const key=`${activeMkt().id}_${outcome()}`;return{...u,cash:u.cash+preview().proceeds,positions:{...u.positions,[key]:(u.positions[key]||0)-preview().shares}};});
      setMarkets(ms=>ms.map(m=>{if(m.id!==tradeSheet())return m;const p=lmsrPrice(preview().newQYes,preview().newQNo,"YES");return{...m,qYes:preview().newQYes,qNo:preview().newQNo,priceHistory:[...m.priceHistory.slice(-29),p]};}));
      toast_(`Sold ${preview().shares.toFixed(2)} ${outcome()} for $${preview().proceeds.toFixed(2)}`);
    }
    setAmount(""); setPreview(null);
  };

  const createMarket = () => {
    if(!newQ().trim()) return;
    const m={id:Date.now(),question:newQ().trim(),category:newCat(),qYes:10,qNo:10,createdAt:Date.now(),priceHistory:[0.5]};
    setMarkets(ms=>[...ms,m]);
    setNewQ(""); setShowCreate(false); toast_("Market created!");
  };

  const handleAddPost = (post) => setForumPosts(prev=>[...prev, post]);

  const handleLikePost = (postId, username) => {
    setForumPosts(prev=>prev.map(p=>{
      if(p.id===postId){
        const likes=p.likes.includes(username)?p.likes.filter(u=>u!==username):[...p.likes,username];
        return{...p,likes};
      }
      return p;
    }));
  };

  const handleReply = (postId, reply) => {
    setForumPosts(prev=>prev.map(p=>p.id===postId?{...p,replies:[...p.replies,reply]}:p));
  };

  const handleLikeReply = (key, username, postId, replyId) => {
    setForumPosts(prev=>prev.map(p=>{
      if(p.id!==postId) return p;
      return{...p,replies:p.replies.map(r=>{
        if(r.id!==replyId) return r;
        const likes=(r.likes||[]).includes(username)?(r.likes||[]).filter(u=>u!==username):[...(r.likes||[]),username];
        return{...r,likes};
      })};
    }));
  };

  const handleReactMarket = (marketId, reaction) => {
    // reaction = "like" | "dislike"
    const username = currentUser().username;
    setMarkets(prev => prev.map(m => {
      if(m.id !== marketId) return m;
      const likes    = m.likes    || [];
      const dislikes = m.dislikes || [];
      if(reaction === "like") {
        const alreadyLiked = likes.includes(username);
        return { ...m,
          likes:    alreadyLiked ? likes.filter(u=>u!==username) : [...likes, username],
          dislikes: dislikes.filter(u=>u!==username),
        };
      } else {
        const alreadyDisliked = dislikes.includes(username);
        return { ...m,
          dislikes: alreadyDisliked ? dislikes.filter(u=>u!==username) : [...dislikes, username],
          likes:    likes.filter(u=>u!==username),
        };
      }
    }));
  };

  const totalValue = () => {
    if(!currentUser()) return 0;
    let v=currentUser().cash;
    for(const[key,sh]of Object.entries(currentUser().positions||{})){
      if(sh<=0.001) continue;
      const[mid,out]=key.split("_");
      const mkt=markets().find(m=>m.id===+mid);
      if(mkt) v+=sh*lmsrPrice(mkt.qYes,mkt.qNo,out);
    }
    return v;
  };

  const positions = createMemo(() => Object.entries(currentUser()?.positions||{}).filter(([,v])=>v>0.001));
  const WRAP = {width:"100%",maxWidth:430,margin:"0 auto",minHeight:"100vh",background:S.bg,color:S.text,fontFamily:"'DM Mono',monospace"};

  // ── Boot splash ──
  if(booting()) return (
    <div style={{...WRAP,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <div style={{fontSize:36}}>◈</div>
      <Spinner/>
      <div style={{fontSize:11,color:S.muted,letterSpacing:"0.15em"}}>Loading…</div>
      <style>{globalStyles}</style>
    </div>
  );

  // ── Auth gate ──
  if(!currentUser()) return (
    <div style={WRAP}>
      {authScreen()==="landing"&&<LandingPage onLogin={()=>setAuthScreen("login")} onSignup={()=>setAuthScreen("signup")} savedUsers={savedUsers()}/>}
      {authScreen()==="login"&&<LoginScreen savedUsers={savedUsers()} onLogin={handleLogin} onBack={()=>setAuthScreen("landing")} onSignup={()=>setAuthScreen("signup")}/>}
      {authScreen()==="signup"&&<SignupScreen savedUsers={savedUsers()} onSignup={handleSignup} onBack={()=>setAuthScreen("landing")} onLogin={()=>setAuthScreen("login")}/>}
      <style>{globalStyles}</style>
    </div>
  );

  // ── Deposit full-screen ──
  if(showDeposit()) return (
    <div style={WRAP}>
      <DepositPage user={currentUser()} onBack={()=>setShowDeposit(false)} onDeposit={(amt,prov)=>{handleDeposit(amt,prov);setTimeout(()=>setShowDeposit(false),3200);}}/>
      <style>{globalStyles}</style>
    </div>
  );

  // ── Main App ──
  return (
    <div style={{...WRAP,display:"flex",flexDirection:"column",position:"relative"}}>
      <div style={{position:"fixed",inset:0,background:"radial-gradient(ellipse 80% 50% at 50% -10%,rgba(212,175,55,0.05) 0%,transparent 70%)",pointerEvents:"none",zIndex:0}}/>

      {/* Header */}
      <div style={{position:"relative",zIndex:1,padding:"16px 18px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setShowMenu(true)} aria-label="Open menu"
            style={{width:34,height:34,flexShrink:0,border:"1px solid rgba(212,175,55,0.2)",borderRadius:9,background:"rgba(255,255,255,0.03)",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3.5}}>
            <span style={{width:16,height:1.6,background:S.accent,borderRadius:1,display:"block"}}/>
            <span style={{width:16,height:1.6,background:S.accent,borderRadius:1,display:"block"}}/>
            <span style={{width:16,height:1.6,background:S.accent,borderRadius:1,display:"block"}}/>
          </button>
          <div>
            <div style={{fontSize:9,letterSpacing:"0.25em",color:S.muted,textTransform:"uppercase"}}>BAZAAR</div>
            <div style={{fontSize:20,fontWeight:700,letterSpacing:"-0.03em",color:S.text,marginTop:1}}>
              {navTab()==="markets"?"Markets":navTab()==="portfolio"?"Portfolio":navTab()==="news"?"News":navTab()==="forum"?"Forum":"Profile"}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {navTab()!=="profile"&&navTab()!=="news"&&navTab()!=="forum"&&
            <button onClick={()=>setShowDeposit(true)}
              style={{fontSize:12,color:"#D4AF37",background:"rgba(212,175,55,0.08)",border:"1px solid rgba(212,175,55,0.25)",borderRadius:8,padding:"5px 10px",fontFamily:"inherit",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <span>${currentUser().cash.toFixed(0)}</span><span style={{fontSize:9,opacity:0.6}}>＋</span>
            </button>}
          {navTab()==="markets"&&<button onClick={()=>setShowCreate(true)} style={{width:34,height:34,borderRadius:10,background:S.accent,border:"none",color:"#fff",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>}
        </div>
      </div>

      {/* Scroll area */}
      <div style={{flex:1,overflowY:"auto",padding:"14px 14px 90px",position:"relative",zIndex:1}}>

        {/* MARKETS */}
        {navTab()==="markets"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
          <LiveMarketPanel onSuggestMarket={(question, category) => {
            setNewQ(question); setNewCat(category || "Finance"); setShowCreate(true);
          }} />
          {markets().map(m=>{
            const yp=lmsrPrice(m.qYes,m.qNo,"YES");
            const cc=CAT_COLOR[m.category]||S.accent;
            const delta=yp-(m.priceHistory[m.priceHistory.length-2]??0.5);
            const hasPos=(currentUser().positions[`${m.id}_YES`]||0)>0.001||(currentUser().positions[`${m.id}_NO`]||0)>0.001;
            const liked    = (m.likes||[]).includes(currentUser().username);
            const disliked = (m.dislikes||[]).includes(currentUser().username);
            return (
              <div key={m.id} style={{background:S.card,border:`1px solid ${liked?"rgba(212,175,55,0.35)":disliked?"rgba(255,255,255,0.12)":S.border}`,borderRadius:16,overflow:"hidden",transition:"border-color 0.15s"}}>
                {/* Clickable top area */}
                <div onClick={()=>openTrade(m.id)} style={{padding:"14px 15px 10px",cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9}}>
                    <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:cc,background:CAT_BG[m.category],border:`1px solid ${cc}30`,borderRadius:5,padding:"2px 7px"}}>{m.category}</span>
                    {hasPos&&<span style={{fontSize:9,color:S.accent}}>● IN</span>}
                  </div>
                  <div style={{fontSize:13,fontWeight:500,lineHeight:1.45,color:S.text,marginBottom:12}}>{m.question}</div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{display:"flex",gap:12}}>
                      <div><div style={{fontSize:9,color:S.muted,marginBottom:1}}>YES</div><div style={{fontSize:18,fontWeight:800,color:NEON_GREEN,letterSpacing:"-0.02em",textShadow:`0 0 10px ${NEON_GREEN}50`}}>{(yp*100).toFixed(0)}¢</div></div>
                      <div style={{width:1,background:S.border}}/>
                      <div><div style={{fontSize:9,color:S.muted,marginBottom:1}}>NO</div><div style={{fontSize:18,fontWeight:800,color:HOT_MAGENTA,letterSpacing:"-0.02em",textShadow:`0 0 10px ${HOT_MAGENTA}50`}}>{((1-yp)*100).toFixed(0)}¢</div></div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                      <Sparkline data={m.priceHistory} color={cc}/>
                      <div style={{fontSize:10,color:delta>=0?NEON_GREEN:HOT_MAGENTA}}>{delta>=0?"▲":"▼"} {Math.abs(delta*100).toFixed(1)}%</div>
                    </div>
                  </div>
                  <div style={{marginTop:10,height:3,background:"rgba(255,255,255,0.05)",borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${yp*100}%`,background:`linear-gradient(90deg,${HOT_MAGENTA},${NEON_GREEN})`,borderRadius:2,transition:"width 0.4s"}}/>
                  </div>
                </div>
                {/* Like / Dislike bar */}
                <div style={{display:"flex",borderTop:`1px solid rgba(255,255,255,0.04)`}}>
                  <button
                    onClick={e=>{e.stopPropagation();handleReactMarket(m.id,"like");}}
                    style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 0",border:"none",borderRight:`1px solid rgba(255,255,255,0.04)`,background:liked?"rgba(212,175,55,0.1)":"transparent",color:liked?S.accent:S.muted,fontSize:12,fontFamily:"inherit",fontWeight:liked?700:400,cursor:"pointer",transition:"all 0.15s"}}>
                    <span style={{fontSize:15}}>{liked?"👍":"👍"}</span>
                    <span style={{fontSize:11,color:liked?S.accent:S.muted}}>{(m.likes||[]).length}</span>
                  </button>
                  <button
                    onClick={e=>{e.stopPropagation();handleReactMarket(m.id,"dislike");}}
                    style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 0",border:"none",background:disliked?"rgba(255,255,255,0.07)":"transparent",color:disliked?"#f0f0f0":S.muted,fontSize:12,fontFamily:"inherit",fontWeight:disliked?700:400,cursor:"pointer",transition:"all 0.15s"}}>
                    <span style={{fontSize:15}}>👎</span>
                    <span style={{fontSize:11,color:disliked?"#f0f0f0":S.muted}}>{(m.dislikes||[]).length}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>}

        {/* PORTFOLIO */}
        {navTab()==="portfolio"&&<div>
          <div style={{background:"rgba(212,175,55,0.06)",border:"1px solid rgba(212,175,55,0.2)",borderRadius:16,padding:"18px",marginBottom:16}}>
            <div style={{fontSize:9,letterSpacing:"0.15em",color:S.muted,textTransform:"uppercase",marginBottom:4}}>Total Value</div>
            <div style={{fontSize:34,fontWeight:800,letterSpacing:"-0.04em",color:S.accent}}>${totalValue().toFixed(2)}</div>
            <div style={{display:"flex",gap:20,marginTop:12}}>
              {[["CASH",`$${currentUser().cash.toFixed(2)}`,"#f0f0f0"],["POSITIONS",positions().length,S.text],["MARKETS",markets().length,S.text]].map(([l,v,c])=>(
                <div key={l}><div style={{fontSize:9,color:S.muted}}>{l}</div><div style={{fontSize:14,fontWeight:600,color:c}}>{v}</div></div>
              ))}
            </div>
            <button onClick={()=>setShowDeposit(true)} style={{marginTop:12,width:"100%",padding:"10px 0",border:"none",borderRadius:10,background:"linear-gradient(135deg,#B8960C,#D4AF37)",color:"#1a0e00",fontSize:12,fontFamily:"inherit",fontWeight:700,cursor:"pointer",letterSpacing:"0.04em"}}>💳 Add Funds via Stripe</button>
            <button onClick={async()=>{
              const trades = positions().map(([key,shares])=>{
                const[mid,out]=key.split("_"); const mkt=markets().find(m=>m.id===+mid);
                const price = mkt ? lmsrPrice(mkt.qYes,mkt.qNo,out) : 0;
                return {market:mkt?.question||mid, outcome:out, shares:shares.toFixed(4), currentPrice:(price*100).toFixed(1)+"¢", value:(shares*price).toFixed(2)};
              });
              const ok = await exportToSheets(trades, currentUser().username);
              toast_(ok ? "📊 Exported to Google Sheets via Zapier!" : "⚠️ Configure your Zapier webhook to enable export");
            }} style={{marginTop:6,width:"100%",padding:"9px 0",border:`1px solid rgba(212,175,55,0.2)`,borderRadius:10,background:"transparent",color:S.accent,fontSize:11,fontFamily:"inherit",fontWeight:600,cursor:"pointer",letterSpacing:"0.04em"}}>
              📤 Export to Google Sheets (Zapier)
            </button>
          </div>
          {positions().length===0
            ?<div style={{textAlign:"center",padding:"48px 0",color:S.muted}}><div style={{fontSize:30,marginBottom:10}}>◈</div><div style={{fontSize:13}}>No positions yet</div></div>
            :positions().map(([key,shares])=>{
              const[mid,out]=key.split("_"); const mkt=markets().find(m=>m.id===+mid); if(!mkt)return null;
              const price=lmsrPrice(mkt.qYes,mkt.qNo,out); const col=out==="YES"?NEON_GREEN:HOT_MAGENTA;
              return (
                <div key={key} onClick={()=>openTrade(mkt.id)} style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:14,padding:"12px 14px",marginBottom:8,cursor:"pointer"}}>
                  <div style={{fontSize:12,color:S.sub,marginBottom:8,lineHeight:1.4}}>{mkt.question}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",gap:14}}>
                      <div><div style={{fontSize:9,color:S.muted}}>OUTCOME</div><div style={{fontSize:13,fontWeight:700,color:col}}>{out}</div></div>
                      <div><div style={{fontSize:9,color:S.muted}}>SHARES</div><div style={{fontSize:13,fontWeight:600,color:S.text}}>{shares.toFixed(2)}</div></div>
                      <div><div style={{fontSize:9,color:S.muted}}>PRICE</div><div style={{fontSize:13,fontWeight:600,color:S.text}}>{(price*100).toFixed(1)}¢</div></div>
                    </div>
                    <div style={{textAlign:"right"}}><div style={{fontSize:9,color:S.muted}}>VALUE</div><div style={{fontSize:17,fontWeight:800,color:col}}>${(shares*price).toFixed(2)}</div></div>
                  </div>
                </div>
              );
            })
          }
        </div>}

        {/* PROFILE */}
        {navTab()==="profile"&&<ProfileScreen user={currentUser()} portfolioValue={totalValue()} onLogout={handleLogout} onEditSurvey={()=>setShowSurvey(true)} onDeposit={()=>setShowDeposit(true)}/>}

        {/* NEWS */}
        {navTab()==="news"&&<NewsTab onCreateMarket={(question, category) => {
          const m={id:Date.now(),question,category:category||"Finance",qYes:10,qNo:10,createdAt:Date.now(),priceHistory:[0.5]};
          setMarkets(ms=>[...ms,m]);
          setNavTab("markets");
          toast_(`Market created: "${question.slice(0,40)}…"`);
        }}/>}

        {/* FORUM */}
        {navTab()==="forum"&&<ForumTab
          currentUser={currentUser()}
          posts={forumPosts()}
          onAddPost={handleAddPost}
          onLike={(postId, username)=>handleLikePost(postId, username)}
          onReply={handleReply}
        />}
      </div>

      {/* Bottom Nav */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"rgba(10,10,10,0.97)",backdropFilter:"blur(20px)",borderTop:`1px solid ${S.border}`,display:"flex",zIndex:10}}>
        {/* Markets */}
        <button onClick={()=>setNavTab("markets")} style={{flex:1,padding:"9px 0 13px",border:"none",background:"transparent",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer"}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={navTab()==="markets"?S.accent:S.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <span style={{fontSize:8,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"inherit",color:navTab()==="markets"?S.accent:S.muted}}>Markets</span>
        </button>
        {/* Portfolio */}
        <button onClick={()=>setNavTab("portfolio")} style={{flex:1,padding:"9px 0 13px",border:"none",background:"transparent",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer"}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={navTab()==="portfolio"?S.accent:S.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
          </svg>
          <span style={{fontSize:8,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"inherit",color:navTab()==="portfolio"?S.accent:S.muted}}>Portfolio</span>
        </button>
        {/* News */}
        <button onClick={()=>setNavTab("news")} style={{flex:1,padding:"9px 0 13px",border:"none",background:"transparent",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",position:"relative"}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={navTab()==="news"?S.accent:S.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
            <line x1="10" y1="7" x2="18" y2="7"/><line x1="10" y1="11" x2="18" y2="11"/><line x1="10" y1="15" x2="14" y2="15"/>
          </svg>
          <div style={{position:"absolute",top:7,right:"19%",width:5,height:5,borderRadius:"50%",background:S.accent,border:"1.5px solid #07060A"}}/>
          <span style={{fontSize:8,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"inherit",color:navTab()==="news"?S.accent:S.muted}}>News</span>
        </button>
        {/* Forum */}
        <button onClick={()=>setNavTab("forum")} style={{flex:1,padding:"9px 0 13px",border:"none",background:"transparent",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",position:"relative"}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={navTab()==="forum"?S.accent:S.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {forumPosts().length>0&&navTab()!=="forum"&&<div style={{position:"absolute",top:7,right:"18%",width:5,height:5,borderRadius:"50%",background:S.accent,border:"1.5px solid #07060A"}}/>}
          <span style={{fontSize:8,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"inherit",color:navTab()==="forum"?S.accent:S.muted}}>Forum</span>
        </button>
        {/* Profile */}
        <button onClick={()=>setNavTab("profile")} style={{flex:1,padding:"9px 0 13px",border:"none",background:"transparent",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer"}}>
          <Avatar user={currentUser()} size={20}/>
          <span style={{fontSize:8,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"inherit",color:navTab()==="profile"?S.accent:S.muted}}>Profile</span>
        </button>
      </div>

      {/* Trade sheet */}
      {tradeSheet()&&activeMkt&&<Sheet onClose={closeTrade}>
        <div style={{marginBottom:14}}>
          <span style={{fontSize:9,color:CAT_COLOR[activeMkt().category]||S.accent,letterSpacing:"0.15em",textTransform:"uppercase"}}>{activeMkt().category}</span>
          <div style={{fontSize:14,fontWeight:600,color:S.text,marginTop:3,lineHeight:1.4}}>{activeMkt().question}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          {["YES","NO"].map(o=>{const p=lmsrPrice(activeMkt().qYes,activeMkt().qNo,o);const col=o==="YES"?NEON_GREEN:HOT_MAGENTA;return <div key={o} style={{background:`${col}12`,border:`1px solid ${col}40`,borderRadius:12,padding:"10px",textAlign:"center"}}><div style={{fontSize:9,color:S.muted,marginBottom:2}}>{o}</div><div style={{fontSize:24,fontWeight:800,color:col,letterSpacing:"-0.03em",textShadow:`0 0 14px ${col}60`}}>{(p*100).toFixed(1)}¢</div><div style={{fontSize:9,color:S.muted,marginTop:1}}>pool {(o==="YES"?activeMkt().qYes:activeMkt().qNo).toFixed(0)}</div></div>;})}
        </div>
        <div style={{display:"flex",background:"rgba(255,255,255,0.04)",borderRadius:10,padding:3,marginBottom:10}}>
          {["buy","sell"].map(t=><button key={t} onClick={()=>{setTradeTab(t);setAmount("");setPreview(null);}} style={{flex:1,padding:"8px 0",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",background:tradeTab()===t?(t==="buy"?NEON_GREEN_DIM:HOT_MAGENTA_DIM):"transparent",color:tradeTab()===t?"#fff":S.muted}}>{t}</button>)}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          {["YES","NO"].map(o=>{const col=o==="YES"?NEON_GREEN:HOT_MAGENTA;return <button key={o} onClick={()=>{setOutcome(o);setAmount("");setPreview(null);}} style={{flex:1,padding:"10px 0",border:`1.5px solid ${outcome()===o?col:"rgba(255,255,255,0.07)"}`,borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:800,background:outcome()===o?`${col}1a`:"transparent",color:outcome()===o?col:S.muted,textShadow:outcome()===o?`0 0 10px ${col}50`:"none"}}>{o}</button>;})}
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:9,color:S.muted,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:6}}>{tradeTab()==="buy"?"Amount (USD)":"Shares to sell"}</div>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:S.muted,fontSize:16}}>{tradeTab()==="buy"?"$":"⬡"}</span>
            <input type="number" value={amount()} onChange={e=>setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"13px 14px 13px 34px",color:S.text,fontSize:18,fontFamily:"inherit",fontWeight:700,outline:"none"}}/>
          </div>
          {tradeTab()==="buy"&&<div style={{display:"flex",gap:6,marginTop:8}}>{[10,25,50,100].map(v=><button key={v} onClick={()=>setAmount(String(v))} style={{flex:1,padding:"7px 0",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,background:+amount()===v?"rgba(212,175,55,0.2)":"rgba(255,255,255,0.03)",color:+amount()===v?S.accent:S.muted,fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>${v}</button>)}</div>}
        </div>
        {preview()&&<div style={{background:"rgba(212,175,55,0.05)",border:"1px solid rgba(212,175,55,0.18)",borderRadius:12,padding:"12px 14px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-around"}}>
            {tradeTab()==="buy"?<><Stat label="Shares" value={preview().shares.toFixed(2)}/><Stat label="Cost" value={`$${preview().actualCost.toFixed(2)}`}/><Stat label="Avg" value={`${(preview().avgPrice*100).toFixed(1)}¢`}/></>
              :<><Stat label="Shares" value={preview().shares.toFixed(2)}/><Stat label="Receive" value={`$${preview().proceeds.toFixed(2)}`} color={NEON_GREEN}/><Stat label="Avg" value={`${(preview().avgPrice*100).toFixed(1)}¢`}/></>}
          </div>
        </div>}
        <button onClick={executeTrade} disabled={!preview()}
          style={{width:"100%",padding:"15px 0",border:"none",borderRadius:14,fontSize:14,fontFamily:"inherit",fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",cursor:preview()?"pointer":"not-allowed",
            background:preview()?(outcome()==="YES"?`linear-gradient(135deg,${NEON_GREEN_DIM},${NEON_GREEN})`:`linear-gradient(135deg,${HOT_MAGENTA_DIM},${HOT_MAGENTA})`):"rgba(255,255,255,0.05)",
            color:preview()?"#000":S.muted,
            boxShadow:preview()?(outcome()==="YES"?`0 0 24px ${NEON_GREEN}40`:`0 0 24px ${HOT_MAGENTA}40`):"none"}}>
          {preview()?`${tradeTab()==="buy"?"Buy":"Sell"} ${outcome()}`:"Enter amount"}
        </button>
        {((currentUser().positions[`${activeMkt().id}_YES`]||0)>0.001||(currentUser().positions[`${activeMkt().id}_NO`]||0)>0.001)&&
          <div style={{marginTop:12,padding:"10px 12px",background:"rgba(255,255,255,0.02)",borderRadius:10,display:"flex",gap:18}}>
            {["YES","NO"].map(o=>{const sh=currentUser().positions[`${activeMkt().id}_${o}`]||0;if(sh<0.001)return null;return <div key={o}><div style={{fontSize:9,color:S.muted}}>YOUR {o}</div><div style={{fontSize:13,fontWeight:700,color:o==="YES"?NEON_GREEN:HOT_MAGENTA}}>{sh.toFixed(2)} shares</div></div>;})}
          </div>}
      </Sheet>}


      {/* Create market */}
      {showCreate()&&<Sheet onClose={()=>setShowCreate(false)} zIndex={30}>
        <div style={{fontSize:16,fontWeight:700,color:S.text,marginBottom:16}}>New Market</div>
        <div style={{fontSize:9,color:S.muted,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:6}}>Question</div>
        <textarea value={newQ()} onChange={e=>setNewQ(e.target.value)} placeholder="Will X happen by Y?" rows={3}
          style={{width:"100%",boxSizing:"border-box",resize:"none",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"11px 14px",color:S.text,fontSize:14,fontFamily:"inherit",outline:"none",marginBottom:14}}/>
        <div style={{fontSize:9,color:S.muted,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:8}}>Category</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:20}}>
          {Object.keys(CAT_COLOR).map(c=><button key={c} onClick={()=>setNewCat(c)} style={{padding:"6px 13px",border:`1px solid ${newCat()===c?CAT_COLOR[c]:"rgba(255,255,255,0.08)"}`,borderRadius:8,background:newCat()===c?`${CAT_COLOR[c]}18`:"transparent",color:newCat()===c?CAT_COLOR[c]:S.muted,fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>{c}</button>)}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setShowCreate(false)} class="btn-dark btn-3d" style={{flex:1,padding:"13px 0",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,fontSize:13,fontFamily:"inherit"}}>Cancel</button>
          <button onClick={createMarket} class="btn-gold btn-3d" style={{flex:2,padding:"13px 0",border:"none",borderRadius:12,fontSize:13,fontFamily:"inherit"}}>Create Market</button>
        </div>
      </Sheet>}

      {/* Survey retake */}
      {showSurvey()&&<SurveySheet onClose={()=>setShowSurvey(false)} onSave={ans=>{updateUser(u=>({...u,survey:ans}));setShowSurvey(false);toast_("Profile updated!");}}/>}

      {/* Side menu */}
      {showMenu()&&<SideMenu
        user={currentUser()}
        portfolioValue={totalValue()}
        onClose={()=>setShowMenu(false)}
        onNavigate={(tab)=>{setNavTab(tab);setShowMenu(false);}}
        onDeposit={()=>{setShowMenu(false);setShowDeposit(true);}}
        onEditSurvey={()=>{setShowMenu(false);setShowSurvey(true);}}
        onLogout={()=>{setShowMenu(false);handleLogout();}}
      />}

      {/* Toast */}
      {toast()&&<div style={{position:"fixed",top:60,left:"50%",transform:"translateX(-50%)",background:toast().type==="err"?"rgba(255,255,255,0.06)":"rgba(212,175,55,0.18)",border:`1px solid ${toast().type==="err"?"rgba(255,255,255,0.3)":"rgba(212,175,55,0.4)"}`,borderRadius:12,padding:"9px 18px",fontSize:12,color:toast().type==="err"?"#aaaaaa":"#D4AF37",backdropFilter:"blur(10px)",zIndex:99,whiteSpace:"nowrap",animation:"fadeDown 0.2s ease"}}>{toast().msg}</div>}

      <style>{globalStyles}</style>
    </div>
  );
}

const globalStyles = `
  * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
  input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
  input[type=number] { -moz-appearance: textfield; }
  ::-webkit-scrollbar { display: none; }
  @keyframes sheetUp { from{transform:translateX(-50%) translateY(100%)}to{transform:translateX(-50%) translateY(0)} }
  @keyframes menuSlideIn { from{transform:translateX(-100%)}to{transform:translateX(0)} }
  @keyframes fadeDown { from{opacity:0;transform:translateX(-50%) translateY(-6px)}to{opacity:1;transform:translateX(-50%) translateY(0)} }
  @keyframes spin { to{transform:rotate(360deg)} }
  @keyframes fadeIn { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  input:focus, textarea:focus { border-color: rgba(212,175,55,0.45) !important; outline: none; }

  /* ── 3D raised button base ── */
  .btn-3d {
    position: relative;
    transition: transform 0.07s ease, box-shadow 0.07s ease, filter 0.07s ease;
    transform: translateY(0px);
    cursor: pointer;
  }
  .btn-3d:not(:disabled):active {
    transform: translateY(3px) !important;
    filter: brightness(0.9);
  }
  .btn-3d:disabled { opacity: 0.38; cursor: not-allowed; }

  /* Gold — primary actions */
  .btn-gold {
    background: linear-gradient(175deg, #f0d060 0%, #D4AF37 45%, #b89010 100%) !important;
    box-shadow: 0 4px 0 0 #7a5c00, 0 7px 16px rgba(0,0,0,0.5) !important;
    color: #1a0e00 !important; font-weight: 800 !important; border: none !important;
  }
  .btn-gold:not(:disabled):active { box-shadow: 0 1px 0 0 #7a5c00, 0 2px 6px rgba(0,0,0,0.35) !important; }

  /* Vibrant green — Pay / Go / Next */
  .btn-green {
    background: linear-gradient(175deg, #4dff8a 0%, #18d958 45%, #0db544 100%) !important;
    box-shadow: 0 4px 0 0 #056e22, 0 7px 16px rgba(0,0,0,0.5) !important;
    color: #001f0a !important; font-weight: 800 !important; border: none !important;
  }
  .btn-green:not(:disabled):active { box-shadow: 0 1px 0 0 #056e22, 0 2px 6px rgba(0,0,0,0.35) !important; }

  /* Dark — secondary / cancel */
  .btn-dark {
    background: linear-gradient(175deg, #2e2e2e 0%, #1a1a1a 100%) !important;
    box-shadow: 0 4px 0 0 #000, 0 7px 14px rgba(0,0,0,0.55) !important;
    color: #888 !important; border: 1px solid rgba(255,255,255,0.08) !important;
  }
  .btn-dark:not(:disabled):active { box-shadow: 0 1px 0 0 #000, 0 2px 5px rgba(0,0,0,0.4) !important; }

  /* Red — destructive */
  .btn-red {
    background: linear-gradient(175deg, #ff5555 0%, #d42f2f 45%, #b01c1c 100%) !important;
    box-shadow: 0 4px 0 0 #6e0000, 0 7px 14px rgba(0,0,0,0.5) !important;
    color: #fff !important; font-weight: 700 !important; border: none !important;
  }
  .btn-red:not(:disabled):active { box-shadow: 0 1px 0 0 #6e0000, 0 2px 5px rgba(0,0,0,0.35) !important; }
`;
