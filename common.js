// ════════════════════════════════════════════════════════════
// common.js : shared code used by every module
//   1. state + utils   2. Turso API   3. registry + router
//   4. logic helpers   5. name/badge helpers
// Needs config.js loaded first (TURSO_URL, TURSO_TOKEN).
// ════════════════════════════════════════════════════════════

// ── 1. state + utils ──────────────────────────────────────────
let DB = { vendors:[], modules:[], fields:[], evaluators:[], trainers:[], engagements:[], demos:[], evaluations:[], evaluationscores:[], decisions:[], feedback:[] };
let DB_READY = false;
let currentPage = "dashboard", currentParams = {};

const $  = id => document.getElementById(id);
const el = (tag,cls="",html="") => { const e=document.createElement(tag); if(cls)e.className=cls; if(html)e.innerHTML=html; return e; };
const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const fmt = d => d ? String(d).slice(0,10).split("-").reverse().join("-") : "-";
const fmtToday = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const isTrue = v => v===true||v==="TRUE"||v==="true";

function showLoading(v){ $("loading").style.display=v?"flex":"none"; }
function showToast(msg,dur=3000){ const t=$("toast"); t.textContent=msg; t.style.display="block"; setTimeout(()=>t.style.display="none",dur); }

function openModal(html){ $("modal-box").innerHTML=html; $("modal-overlay").classList.remove("hidden"); }
function closeModal(){ $("modal-overlay").classList.add("hidden"); }
$("modal-overlay").addEventListener("click", e => { if(e.target===$("modal-overlay")) closeModal(); });

// ── 2. Turso API ──────────────────────────────────────────────
function tDecode(v){
  if(!v || v.type==="null") return "";
  if(v.type==="integer" || v.type==="float") return Number(v.value);
  return v.value;
}
function tEncode(v){
  if(v===null || v===undefined || v==="") return {type:"null"};
  if(typeof v==="boolean") return {type:"integer", value: v?"1":"0"};
  if(typeof v==="number")  return Number.isInteger(v) ? {type:"integer", value:String(v)} : {type:"float", value:v};
  return {type:"text", value:String(v)};
}
function tStmt(sql, args){ return {sql: sql, args: (args||[]).map(tEncode)}; }

async function tFetch(requests){
  const r = await fetch(TURSO_URL + "/v2/pipeline", {
    method: "POST",
    headers: {"Authorization":"Bearer "+TURSO_TOKEN, "Content-Type":"application/json"},
    body: JSON.stringify({requests: requests.concat([{type:"close"}])})
  });
  if(!r.ok) throw new Error("Database error " + r.status + ": " + (await r.text()).slice(0,200));
  const j = await r.json();
  j.results.forEach(res => { if(res.type==="error") throw new Error(res.error.message); });
  return j.results;
}
function tRows(result){
  const cols = result.cols.map(c => c.name);
  return result.rows.map(row => {
    const o = {};
    cols.forEach((c,i) => { const v = tDecode(row[i]); o[c] = (c==="Active") ? (Number(v)===1) : v; });
    return o;
  });
}
// run ONE statement, return last inserted id
async function tRun(sql, args){
  const res = await tFetch([{type:"execute", stmt:tStmt(sql,args)}]);
  return Number(res[0].response.result.last_insert_rowid) || 0;
}
// run SEVERAL statements all-or-nothing; returns the inserted id of each
async function tTx(list){
  const steps = [{stmt:{sql:"BEGIN IMMEDIATE"}}];
  list.forEach((s,i) => steps.push({stmt:tStmt(s[0],s[1]), condition:{type:"ok", step:i}}));
  const n = list.length;
  steps.push({stmt:{sql:"COMMIT"},   condition:{type:"ok", step:n}});
  steps.push({stmt:{sql:"ROLLBACK"}, condition:{type:"not", cond:{type:"ok", step:n+1}}});
  const res = await tFetch([{type:"batch", batch:{steps:steps}}]);
  const out = res[0].response.result;
  const err = (out.step_errors||[]).find(e => e);
  if(err) throw new Error(err.message);
  return list.map((_,i) => Number(out.step_results[i+1].last_insert_rowid) || 0);
}

// READ: add a table here when you add one to the database
const TABLES = {
  vendors:"Vendors", modules:"Modules", fields:"Fields", trainers:"Trainers",
  engagements:"Engagements", demos:"Demos", evaluators:"Evaluators",
  evaluations:"Evaluations", evaluationscores:"EvaluationScores",
  decisions:"Decisions", feedback:"Feedback"
};
async function apiGet(action){
  if(action !== "all") throw new Error("Unknown action: " + action);
  const keys = Object.keys(TABLES);
  const res = await tFetch(keys.map(k => ({type:"execute", stmt:{sql:"SELECT * FROM " + TABLES[k]}})));
  const out = {};
  keys.forEach((k,i) => { out[k] = tRows(res[i].response.result); });
  return out;
}

// WRITE: each module adds its own actions with registerActions({...})
const ACTIONS = {};
function registerActions(obj){ Object.assign(ACTIONS, obj); }
async function apiCall(payload){
  const fn = ACTIONS[payload.action];
  if(!fn) throw new Error("Unknown action: " + payload.action);
  return await fn(payload);
}

async function loadPageSheets() {
  if (DB_READY) return;
  showLoading(true);
  try {
    const data = await apiGet("all");
    Object.keys(data).forEach(k => { DB[k] = data[k]; });
    DB_READY = true;
  } catch(e) { alert("Could not load data: " + e.message); }
  showLoading(false);
}
async function loadAll() {
  const data = await apiGet("all");
  Object.keys(data).forEach(k => { DB[k] = data[k]; });
  DB_READY = true;
}
async function refreshAll() {
  try { await loadAll(); } catch(e) { console.warn("Background refresh failed", e); }
}

// ── 3. page registry + router ─────────────────────────────────
// registerPage({ id, title, section, hidden, render(main, params) })
//   section : sidebar group label (pages with the same section sit together)
//   hidden  : true = reachable with nav() but not shown in the sidebar
const PAGES = {};
const NAV_ORDER = [];
function registerPage(p){ PAGES[p.id] = p; NAV_ORDER.push(p.id); }

function buildNav(){
  let html = `<div class="brand">TrainerTracker<span>PSG CAS</span></div><ul>`;
  let last = null;
  NAV_ORDER.map(id => PAGES[id]).filter(p => !p.hidden).forEach(p => {
    if (p.section && p.section !== last) { html += `<div class="section-label">${p.section}</div>`; last = p.section; }
    html += `<li><a href="#" data-page="${p.id}">${p.title}</a></li>`;
  });
  $("nav").innerHTML = html + `</ul>`;
  document.querySelectorAll("#nav a").forEach(a => a.addEventListener("click", e => { e.preventDefault(); nav(a.dataset.page); }));
}

function nav(page, params={}) {
  currentPage = page; currentParams = params;
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("active", a.dataset.page===page));
  const m = $("main"); m.innerHTML=""; m.className="page-enter";
  m.innerHTML = `<div style="padding:20px"><div class="shimmer" style="width:40%;height:22px;margin-bottom:18px"></div>${[...Array(4)].map(()=>'<div class="shimmer"></div>').join("")}</div>`;
  loadPageSheets().then(() => {
    m.innerHTML = ""; m.className = "page-enter";
    const p = PAGES[page];
    if (p) p.render(m, params); else m.innerHTML = "<p>Page not found.</p>";
  });
}

function boot(){ buildNav(); nav("dashboard"); }

// ── 4. logic helpers (decisions / status) ─────────────────────
const activeModules    = () => DB.modules.filter(m=>isTrue(m.Active));
const activeVendors    = () => DB.vendors.filter(v=>isTrue(v.Active));
const activeTrainers   = () => DB.trainers.filter(t=>isTrue(t.Active));
const activeEvaluators = () => DB.evaluators.filter(e=>isTrue(e.Active));

function currentEngagement(tid) {
  return DB.engagements.find(e=>String(e.TrainerID)===String(tid)&&(!e.EndDate||e.EndDate===""))||null;
}
function trainerDecisions(tid) {
  const all=DB.decisions.filter(d=>String(d.TrainerID)===String(tid));
  let fsId=0;
  all.forEach(d=>{ if(d.Status==="FRESH_START"&&Number(d.DecisionID)>fsId) fsId=Number(d.DecisionID); });
  return all.filter(d=>d.Status!=="FRESH_START"&&(fsId===0||isNaN(Number(d.DecisionID))||Number(d.DecisionID)>fsId));
}
function levelCells(decisions, modules) {
  const sorted = [...decisions].sort((a,b)=>{
    const da=new Date(a.EffectiveDate),db=new Date(b.EffectiveDate);
    return da-db||Number(a.DecisionID)-Number(b.DecisionID);
  });
  const cells={};
  modules.forEach(m=>{ cells[String(m.ModuleID)]={UG:null,PG:null}; });
  sorted.forEach(d=>{
    const levels=(!d.Level||d.Level==="ALL")?["UG","PG"]:[d.Level];
    const all=!d.ModuleID||d.ModuleID==="";
    modules.forEach(m=>{
      const mid=String(m.ModuleID);
      if(!all&&String(d.ModuleID)!==mid) return;
      levels.forEach(lv=>{
        const cur=cells[mid][lv];
        if(cur&&cur.Status==="PERM_REJECT"&&d.DemoID&&d.Status!=="PERM_REJECT") return;
        cells[mid][lv]=d;
      });
    });
  });
  return cells;
}
function approvedItems(decisions, modules) {
  const cells=levelCells(decisions,modules);
  return modules.reduce((acc,m)=>{
    const mid=String(m.ModuleID),cell=cells[mid]||{};
    const levels=["UG","PG"].filter(lv=>cell[lv]&&cell[lv].Status==="SELECTED");
    if(levels.length) acc.push({module:m,levels});
    return acc;
  },[]);
}
function backupItemsOf(decisions, modules) {
  const cells=levelCells(decisions,modules);
  return modules.reduce((acc,m)=>{
    const cell=cells[String(m.ModuleID)]||{};
    const levels=["UG","PG"].filter(lv=>cell[lv]&&cell[lv].Status==="BACKUP");
    if(levels.length) acc.push({module:m,levels});
    return acc;
  },[]);
}
function approvalTags(items){ return items.map(i=>i.module.Name+" ("+(i.levels.length===2?"All":i.levels[0])+")"); }

function rejectedModulesList(decisions, modules) {
  const cells=levelCells(decisions,modules);
  return modules.filter(m=>{
    const mid=String(m.ModuleID),cell=cells[mid]||{};
    return cell.UG&&cell.UG.Status==="PERM_REJECT"&&cell.PG&&cell.PG.Status==="PERM_REJECT";
  });
}
function rejectedItemsOf(decisions, modules, status) {
  if(status==="PERM_REJECT_ALL") return [{Name:"All modules (PSG, permanent)"}];
  const cells=levelCells(decisions,modules);
  const word={PERM_REJECT:"permanent",REJECTED:"rejected",REMOVED:"removed"};
  const out=[];
  modules.forEach(m=>{
    const cell=cells[String(m.ModuleID)]||{};
    const ug=(cell.UG&&word[cell.UG.Status])?cell.UG.Status:null;
    const pg=(cell.PG&&word[cell.PG.Status])?cell.PG.Status:null;
    if(ug&&pg&&ug===pg) out.push({Name:m.Name+" (All) - "+word[ug]});
    else {
      if(ug) out.push({Name:m.Name+" (UG) - "+word[ug]});
      if(pg) out.push({Name:m.Name+" (PG) - "+word[pg]});
    }
  });
  return out;
}
function trainerStatus(decisions, modules) {
  if(!decisions.length) return "NONE";
  const cells=levelCells(decisions,modules);
  let rejCount=0,psgAll=true;
  modules.forEach(m=>{
    const mid=String(m.ModuleID),cell=cells[mid]||{};
    const ugPerm=cell.UG&&cell.UG.Status==="PERM_REJECT";
    const pgPerm=cell.PG&&cell.PG.Status==="PERM_REJECT";
    if(ugPerm&&pgPerm){
      rejCount++;
      if((cell.UG&&String(cell.UG.ModuleID)!=="")||(cell.PG&&String(cell.PG.ModuleID)!=="")) psgAll=false;
    } else psgAll=false;
  });
  if(rejCount===0) return "ACTIVE";
  if(rejCount===modules.length&&psgAll) return "PERM_REJECT_ALL";
  return "PERM_REJECT_MODULES";
}
function pendingRedos() {
  const groups={};
  DB.demos.filter(d=>d.Status==="DECIDED").forEach(d=>{
    const key=d.TrainerID+"_"+d.ModuleID;
    const cur=groups[key];
    if(!cur||new Date(d.DemoDate)>new Date(cur.DemoDate)||
       (d.DemoDate===cur.DemoDate&&Number(d.DemoID)>Number(cur.DemoID))) groups[key]=d;
  });
  return Object.values(groups).filter(d=>d.Outcome==="REDO");
}
function completedRedos() {
  const groups={};
  DB.demos.filter(d=>d.Status==="DECIDED").forEach(d=>{
    const key=d.TrainerID+"_"+d.ModuleID;
    if(!groups[key]) groups[key]=[];
    groups[key].push(d);
  });
  const completed=[];
  Object.values(groups).forEach(demos=>{
    const sorted=demos.sort((a,b)=>new Date(b.DemoDate)-new Date(a.DemoDate)||Number(b.DemoID)-Number(a.DemoID));
    if(sorted[0].Outcome!=="REDO"&&sorted.some(d=>d.Outcome==="REDO")) completed.push(sorted[0]);
  });
  return completed;
}

// ── 5. name / badge helpers ───────────────────────────────────
const trainerName   = id => { const t=DB.trainers.find(x=>String(x.TrainerID)===String(id)); return t?t.Name:"Unknown"; };
const moduleName    = id => { const m=DB.modules.find(x=>String(x.ModuleID)===String(id));   return m?m.Name:"Unknown"; };
const vendorName    = id => { const v=DB.vendors.find(x=>String(x.VendorID)===String(id));   return v?v.Name:"Unknown"; };
const evaluatorName = id => { const e=DB.evaluators.find(x=>String(x.EvaluatorID)===String(id)); return e?e.Name:"Unknown"; };

const demoBadge = d => {
  if(d.Status==="SCHEDULED") return "blue";
  if(d.Status==="EVALUATED") return "purple";
  if(d.Status==="DECIDED") return {SELECTED:"green",BACKUP:"teal",REJECTED:"amber",REDO:"blue",PERM_REJECT:"red"}[d.Outcome]||"grey";
  return "grey";
};
const demoStatusLabel = d => {
  if(d.Status==="SCHEDULED") return "Scheduled";
  if(d.Status==="EVALUATED") return "Awaiting decision";
  if(d.Status==="DECIDED"){
    if(d.Outcome==="SELECTED") return "Selected"+(d.Level&&d.Level!=="ALL"?" ("+d.Level+")":"");
    if(d.Outcome==="BACKUP") return "Backup"+(d.Level&&d.Level!=="ALL"?" ("+d.Level+")":"");
    if(d.Outcome==="PERM_REJECT") return d.RejectScope==="PSG"?"Rejected for PSG":"Rejected for module";
    if(d.Outcome==="REJECTED") return "Rejected";
    if(d.Outcome==="REDO") return "Redo";
  }
  return d.Status||"-";
};
function demoVendorId(d) {
  const day = String(d.DemoDate).slice(0,10);
  const list = DB.engagements.filter(e => String(e.TrainerID) === String(d.TrainerID));
  const hit = list.find(e => String(e.StartDate).slice(0,10) <= day && (!e.EndDate || String(e.EndDate).slice(0,10) > day))
           || list.find(e => !e.EndDate)
           || list[0];
  return hit ? hit.VendorID : "";
}
function demoVendorName(d) {
  const id = demoVendorId(d);
  return id === "" ? "-" : esc(vendorName(id));
}
