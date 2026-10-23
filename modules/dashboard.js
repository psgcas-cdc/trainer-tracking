// modules/dashboard.js
registerPage({ id:"dashboard", title:"Dashboard", render:(m)=>dashboard(m) });

function dashboard(m) {
  const mods=activeModules();
  const engs={};
  DB.engagements.forEach(e=>{ if(!e.EndDate||e.EndDate==="") engs[String(e.TrainerID)]=e; });
  let active=0,psgRej=0,backupCount=0;
  activeTrainers().forEach(t=>{
    const dec=trainerDecisions(t.TrainerID),status=trainerStatus(dec,mods);
    const selN=approvedItems(dec,mods).length, bkN=backupItemsOf(dec,mods).length;
    if(status!=="PERM_REJECT_ALL"&&engs[String(t.TrainerID)]){ if(selN>0) active++; else if(bkN>0) backupCount++; }
    if(status==="PERM_REJECT_ALL") psgRej++;
  });
  const today=fmtToday();
  const scheduled=DB.demos.filter(d=>d.Status==="SCHEDULED");
  const scheduledToday=scheduled.filter(d=>String(d.DemoDate).slice(0,10)===today);
  const awaitingDecision=DB.demos.filter(d=>d.Status==="EVALUATED");
  const redos=pendingRedos();

  m.innerHTML=`
    <div class="page-head"><div><h1>Dashboard</h1><div class="sub">PSG CAS Trainer Management</div></div></div>
    <div class="stats">
      <div class="stat"><div class="n">${active}</div><div class="l">Active Trainers</div></div>
      <div class="stat"><div class="n">${backupCount}</div><div class="l">Backups</div></div>
      <div class="stat"><div class="n">${scheduledToday.length}</div><div class="l">Demos Today</div></div>
      <div class="stat"><div class="n">${scheduled.length}</div><div class="l">Scheduled Demos</div></div>
      <div class="stat"><div class="n">${awaitingDecision.length}</div><div class="l">Awaiting Decision</div></div>
      <div class="stat"><div class="n">${redos.length}</div><div class="l">Pending Redos</div></div>
      <div class="stat"><div class="n">${psgRej}</div><div class="l">PSG Rejected</div></div>
    </div>
    ${awaitingDecision.length?`<div class="card">
      <div class="card-head"><h2>Awaiting Decision (${awaitingDecision.length})</h2><a class="btn sm ghost" href="#" onclick="nav('scheduled');return false;">View all</a></div>
      <div class="tbl-wrap"><table>
        <tr><th>Trainer</th><th>Module</th><th>Date</th><th>Evaluations</th><th></th></tr>
        ${awaitingDecision.slice(0,5).map(d=>{
          const evalCount=DB.evaluations.filter(ev=>String(ev.DemoID)===String(d.DemoID)).length;
          return `<tr>
            <td><a href="#" onclick="nav('demo-detail',{id:'${d.DemoID}'});return false;">${esc(trainerName(d.TrainerID))}</a></td>
            <td>${esc(moduleName(d.ModuleID))}</td><td>${fmt(d.DemoDate)}</td>
            <td>${evalCount} evaluator${evalCount!==1?"s":""}</td>
            <td class="actions"><a href="#" onclick="nav('demo-detail',{id:'${d.DemoID}',mode:'decide'});return false;">Decide →</a></td>
          </tr>`;
        }).join("")}
      </table></div></div>`:""}
    ${scheduledToday.length?`<div class="card">
      <div class="card-head"><h2>Today's Scheduled Demos</h2></div>
      <div class="tbl-wrap"><table>
        <tr><th>Trainer</th><th>Module</th><th>Topic</th><th></th></tr>
        ${scheduledToday.map(d=>`<tr>
          <td>${esc(trainerName(d.TrainerID))}</td><td>${esc(moduleName(d.ModuleID))}</td><td>${esc(d.Topic)}</td>
          <td class="actions"><a href="#" onclick="nav('demo-detail',{id:'${d.DemoID}',mode:'evaluate'});return false;">Evaluate</a></td>
        </tr>`).join("")}
      </table></div></div>`:""}
  `;
}
