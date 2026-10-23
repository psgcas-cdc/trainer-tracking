// modules/demos.js : schedule, scheduled list, demo detail (evaluate + decide),
//                    follow-ups (redo), evaluated list, edit demo/evaluation/decision
registerPage({ id:"schedule-demo", title:"Schedule Demo",  section:"Demos", render:(m,p)=>scheduleDemoPage(m,p) });
registerPage({ id:"scheduled",     title:"Scheduled Demos",section:"Demos", render:(m,p)=>scheduled(m,p) });
registerPage({ id:"evaluated",     title:"Evaluated Demos",section:"Demos", render:(m,p)=>evaluated(m,p) });
registerPage({ id:"followups",     title:"Follow-ups (Redo)",section:"Demos", render:(m,p)=>followups(m,p) });
registerPage({ id:"demo-detail",   title:"Demo", hidden:true, render:(m,p)=>demoDetail(m,p) });

registerActions({
  scheduleDemo: async p => ({DemoID: await tRun(
    "INSERT INTO Demos (TrainerID,ModuleID,Topic,DemoDate,Status) VALUES (?,?,?,?,'SCHEDULED')",
    [p.TrainerID,p.ModuleID,p.Topic,p.DemoDate])}),

  editDemo: async p => {
    if(p.Status==="CANCELLED")
      await tRun("UPDATE Demos SET Topic=?,DemoDate=?,ModuleID=?,Status='CANCELLED' WHERE DemoID=?", [p.Topic,p.DemoDate,p.ModuleID,p.DemoID]);
    else
      await tRun("UPDATE Demos SET Topic=?,DemoDate=?,ModuleID=? WHERE DemoID=?", [p.Topic,p.DemoDate,p.ModuleID,p.DemoID]);
    return {};
  },

  submitEvaluation: async p => {
    const scores = Array.isArray(p.Scores) ? p.Scores : [];
    const list = [["INSERT INTO Evaluations (DemoID,EvaluatorID,Remarks,SubmittedOn) VALUES (?,?,?,?)", [p.DemoID,p.EvaluatorID,p.Remarks,fmtToday()]]];
    scores.forEach(sc => list.push([
      "INSERT INTO EvaluationScores (EvalID,FieldID,Criterion,Score,MinAtTime,MaxAtTime) VALUES ((SELECT MAX(EvalID) FROM Evaluations),?,?,?,?,?)",
      [sc.FieldID,sc.Criterion,Number(sc.Score)||0,Number(sc.MinAtTime)||0,Number(sc.MaxAtTime)||0]]));
    list.push(["UPDATE Demos SET Status='EVALUATED' WHERE DemoID=? AND Status='SCHEDULED'", [p.DemoID]]);
    const ids = await tTx(list);
    return {EvalID: ids[0]};
  },

  decideDemo: async p => {
    const level = p.Level || "ALL";
    const ids = await tTx([
      ["UPDATE Demos SET Status='DECIDED',Outcome=?,Level=?,RejectScope=?,FinalRemarks=?,DecidedBy=? WHERE DemoID=?",
        [p.Outcome,level,p.RejectScope,p.FinalRemarks,p.DecidedBy,p.DemoID]],
      ["INSERT INTO Decisions (TrainerID,ModuleID,Level,Status,EffectiveDate,Reason,DemoID) " +
       "SELECT TrainerID, CASE WHEN ?='PERM_REJECT' AND ?='PSG' THEN NULL ELSE ModuleID END, ?, ?, DemoDate, ?, DemoID FROM Demos WHERE DemoID=?",
        [p.Outcome,p.RejectScope,level,p.Outcome,p.FinalRemarks,p.DemoID]]
    ]);
    return {DecisionID: ids[1]};
  },

  updateDecision: async p => {
    const level = p.Level || "ALL";
    await tTx([
      ["UPDATE Demos SET Outcome=?,Level=?,RejectScope=?,FinalRemarks=?,DecidedBy=? WHERE DemoID=?",
        [p.Outcome,level,p.RejectScope,p.FinalRemarks,p.DecidedBy,p.DemoID]],
      ["UPDATE Decisions SET Status=?,Level=?,Reason=?,ModuleID=(CASE WHEN ?='PERM_REJECT' AND ?='PSG' THEN NULL ELSE (SELECT ModuleID FROM Demos WHERE DemoID=?) END) WHERE DemoID=?",
        [p.Outcome,level,p.FinalRemarks,p.Outcome,p.RejectScope,p.DemoID,p.DemoID]]
    ]);
    return {};
  },

  updateEvaluation: async p => {
    const scores = Array.isArray(p.Scores) ? p.Scores : [];
    const list = [["UPDATE Evaluations SET EvaluatorID=?,Remarks=? WHERE EvalID=?", [p.EvaluatorID,p.Remarks,p.EvalID]]];
    scores.forEach(sc => list.push(["UPDATE EvaluationScores SET Score=? WHERE EvalID=? AND FieldID=?", [Number(sc.Score)||0,p.EvalID,sc.FieldID]]));
    await tTx(list);
    return {};
  }
});

// ── Scheduled Demos ───────────────────────────────────────────
function scheduled(m) {
  const all=DB.demos.filter(d=>d.Status==="SCHEDULED"||d.Status==="EVALUATED")
    .sort((a,b)=>new Date(a.DemoDate)-new Date(b.DemoDate)||Number(a.DemoID)-Number(b.DemoID));

  m.innerHTML=`
    <div class="page-head">
      <div><h1>Scheduled Demos</h1><div class="sub">Click a demo to evaluate or decide the outcome.</div></div>
      <a class="btn" href="#" onclick="nav('schedule-demo');return false;">+ Schedule Demo</a>
    </div>
    <div class="card"><div class="tbl-wrap"><table>
      <tr><th>Date</th><th>Trainer</th><th>Module</th><th>Topic</th><th>Vendor</th><th>Status</th><th>Evaluations</th><th></th></tr>
      ${all.map(d=>{
        const evalCount=DB.evaluations.filter(ev=>String(ev.DemoID)===String(d.DemoID)).length;
        return `<tr>
          <td>${fmt(d.DemoDate)}</td>
          <td><a href="#" onclick="nav('trainer-detail',{id:'${d.TrainerID}'});return false;">${esc(trainerName(d.TrainerID))}</a></td>
          <td>${esc(moduleName(d.ModuleID))}</td><td>${esc(d.Topic)}</td>
          <td>${demoVendorName(d)}</td>
          <td><span class="badge ${d.Status==="SCHEDULED"?"blue":"purple"}">${d.Status==="SCHEDULED"?"Scheduled":"Awaiting decision"}</span></td>
          <td>${evalCount}</td>
          <td class="actions">
            <a href="#" onclick="nav('demo-detail',{id:'${d.DemoID}',mode:'evaluate'});return false;">Evaluate</a>
            ${d.Status==="EVALUATED"?`<a href="#" onclick="nav('demo-detail',{id:'${d.DemoID}',mode:'decide'});return false;">Decide</a>`:""}
            ${d.Status==="SCHEDULED"?`<a href="#" onclick="showEditDemo('${d.DemoID}');return false;">Edit</a>`:""}
          </td>
        </tr>`;
      }).join("")||`<tr><td colspan="8" class="empty">No scheduled demos.</td></tr>`}
    </table></div></div>
  `;
}

// ── Schedule Demo page ────────────────────────────────────────
function scheduleDemoPage(m, params={}) {
  const preTrainer = params.trainerID || "";
  m.innerHTML = `
    <div class="page-head"><div><h1>Schedule Demo</h1></div></div>
    <div class="card">
      <div class="form-grid">
        <div class="field">
          <label class="lbl">Vendor *</label>
          <select id="sd-vendor" onchange="sdFilterTrainers()">
            <option value="">-- select vendor --</option>
            ${activeVendors().map(v => `<option value="${v.VendorID}">${esc(v.Name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="lbl">Trainer *</label>
          <select id="sd-trainer" disabled><option value="">-- select vendor first --</option></select>
        </div>
        <div class="field">
          <label class="lbl">Module *</label>
          <select id="sd-module">
            <option value="">-- select --</option>
            ${activeModules().map(mod => `<option value="${mod.ModuleID}">${esc(mod.Name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="lbl">Demo Date *</label>
          <input type="date" id="sd-date" value="${fmtToday()}">
        </div>
        <div class="field full">
          <label class="lbl">Topic</label>
          <input type="text" id="sd-topic" placeholder="e.g. Percentages, Time and Work">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn" onclick="submitScheduleDemo()">Schedule</button>
        <button class="btn ghost" onclick="nav('scheduled')">Cancel</button>
      </div>
      <div class="error-msg hidden" id="sd-err"></div>
    </div>
  `;
  if (preTrainer) {
    const eng = currentEngagement(preTrainer);
    if (eng) {
      $("sd-vendor").value = String(eng.VendorID);
      sdFilterTrainers();
      $("sd-trainer").value = String(preTrainer);
    }
  }
}

window.sdFilterTrainers = function() {
  const vendorID = $("sd-vendor").value;
  const sel = $("sd-trainer");
  if (!vendorID) { sel.innerHTML = `<option value="">-- select vendor first --</option>`; sel.disabled = true; return; }
  const matched = activeTrainers().filter(t => {
    const eng = currentEngagement(t.TrainerID);
    return eng && String(eng.VendorID) === vendorID;
  });
  if (!matched.length) { sel.innerHTML = `<option value="">No trainers for this vendor</option>`; sel.disabled = true; return; }
  sel.innerHTML = `<option value="">-- select trainer --</option>` +
    matched.map(t => `<option value="${t.TrainerID}">${esc(t.Name)}</option>`).join("");
  sel.disabled = false;
};

window.submitScheduleDemo = async function() {
  const trainer=$("sd-trainer").value, module=$("sd-module").value, errEl=$("sd-err");
  if(!trainer||!module){ errEl.textContent="Trainer and Module are required."; errEl.classList.remove("hidden"); return; }
  const chk=levelCells(trainerDecisions(trainer),activeModules())[String(module)]||{};
  if((chk.UG&&chk.UG.Status==="PERM_REJECT")||(chk.PG&&chk.PG.Status==="PERM_REJECT")){
    if(!confirm("This trainer is permanently rejected for this module.\n\nA new demo result cannot change that. Only Action Taken can reverse it.\n\nSchedule the demo anyway?")) return;
  }
  try {
    showLoading(true);
    const topic=$("sd-topic").value.trim(), date=$("sd-date").value;
    const res = await apiCall({action:"scheduleDemo", TrainerID:trainer, ModuleID:module, Topic:topic, DemoDate:date});
    DB.demos.push({DemoID:res.DemoID, TrainerID:trainer, ModuleID:module, Topic:topic, DemoDate:date,
      Status:"SCHEDULED", Outcome:"", Level:"", RejectScope:"", FinalRemarks:"", DecidedBy:""});
    showToast("Demo scheduled."); nav("scheduled"); refreshAll();
  } catch(e){ errEl.textContent=e.message; errEl.classList.remove("hidden"); }
  showLoading(false);
};

// ── Demo Detail (evaluate + decide) ──────────────────────────
function demoDetail(m, params={}) {
  const did=String(params.id);
  const demo=DB.demos.find(d=>String(d.DemoID)===did);
  if(!demo){ m.innerHTML="<p>Demo not found.</p>"; return; }
  const mode=params.mode||"view";

  const evals=DB.evaluations.filter(ev=>String(ev.DemoID)===did);
  const modFields=DB.fields.filter(f=>String(f.ModuleID)===String(demo.ModuleID)&&isTrue(f.Active))
    .sort((a,b)=>Number(a.DisplayOrder)-Number(b.DisplayOrder));

  const evalScoreMap={};
  DB.evaluationscores.forEach(sc=>{
    const ev=evals.find(e=>String(e.EvalID)===String(sc.EvalID));
    if(!ev) return;
    if(!evalScoreMap[sc.EvalID]) evalScoreMap[sc.EvalID]={};
    evalScoreMap[sc.EvalID][String(sc.FieldID)]=sc;
  });

  let scoresHtml="";
  if(evals.length&&modFields.length){
    const totals=evals.map(ev=>{
      let s=0,mx=0;
      modFields.forEach(f=>{
        const sc=evalScoreMap[ev.EvalID]?.[String(f.FieldID)];
        s+=sc?Number(sc.Score):0; mx+=Number(f.MaxMarks);
      });
      return {score:s,max:mx};
    });
    scoresHtml=`<div class="card">
      <div class="card-head"><h2>Evaluation Scores</h2></div>
      <div class="tbl-wrap"><table class="eval-grid">
        <tr>
          <th>Criterion</th>
          ${evals.map(ev=>`<th class="eval-col">${esc(evaluatorName(ev.EvaluatorID))}</th>`).join("")}
          ${evals.length>1?`<th>Average</th>`:""}
        </tr>
        ${modFields.map(f=>{
          const scores=evals.map(ev=>evalScoreMap[ev.EvalID]?.[String(f.FieldID)]);
          const vals=scores.map(sc=>sc?Number(sc.Score):"-");
          const nums=vals.filter(v=>v!=="-");
          const avg=nums.length?Math.round(nums.reduce((a,b)=>a+b,0)/nums.length*10)/10:"-";
          return `<tr>
            <td><b>${esc(f.Criterion)}</b> <span class="muted" style="font-size:11px">/ ${f.MaxMarks}</span></td>
            ${vals.map(v=>`<td>${v}</td>`).join("")}
            ${evals.length>1?`<td>${avg}</td>`:""}
          </tr>`;
        }).join("")}
        <tr class="avg-row">
          <td>Total</td>
          ${totals.map(t=>`<td>${t.score} / ${t.max} <span class="muted">(${t.max?Math.round(t.score/t.max*100):0}%)</span></td>`).join("")}
          ${evals.length>1?`<td>${totals.length?Math.round(totals.reduce((a,t)=>a+t.score,0)/totals.length*10)/10:"-"} avg</td>`:""}
        </tr>
      </table></div>
      ${evals.map(ev=>`<div style="margin-top:12px;font-size:13px"><b>${esc(evaluatorName(ev.EvaluatorID))}:</b> ${esc(ev.Remarks)||'<span class="muted">No remarks</span>'} <a href="#" onclick="showEditEvaluation('${ev.EvalID}');return false;" style="margin-left:10px;font-size:12px;color:var(--accent);text-decoration:none">Edit</a></div>`).join("")}
    </div>`;
  } else if(evals.length&&!modFields.length){
    scoresHtml=`<div class="card"><div class="card-head"><h2>Evaluations (${evals.length})</h2></div>
      ${evals.map(ev=>`<div style="margin-bottom:12px;font-size:13px"><b>${esc(evaluatorName(ev.EvaluatorID))}</b> - ${esc(ev.Remarks)||"No remarks"}</div>`).join("")}
    </div>`;
  }

  let evaluateHtml="";
  if(mode==="evaluate"&&(demo.Status==="SCHEDULED"||demo.Status==="EVALUATED")){
    const evalOptions=activeEvaluators().map(e=>`<option value="${e.EvaluatorID}">${esc(e.Name)}</option>`).join("");
    evaluateHtml=`<div class="card" id="sec-evaluate">
      <div class="card-head"><h2>Submit Evaluation</h2></div>
      <div class="form-grid">
        <div class="field full">
          <label class="lbl">Evaluator *</label>
          <select id="ev-evaluator"><option value="">-- select --</option>${evalOptions}</select>
        </div>
        ${modFields.length?`
        <div class="field full">
          <div class="tbl-wrap"><table class="score-table" id="ev-score-table">
            <tr><th>Criterion</th><th>Score</th><th>Max</th></tr>
            ${modFields.map(f=>`<tr class="score-row" data-field-id="${f.FieldID}" data-max="${f.MaxMarks}" data-min="${f.MinMarks}" data-criterion="${esc(f.Criterion)}">
              <td>${esc(f.Criterion)}</td>
              <td><input type="number" min="${f.MinMarks}" max="${f.MaxMarks}" step="1" value="${f.MinMarks}" oninput="calcEvalTotal()"></td>
              <td class="max-lbl">/ ${f.MaxMarks}</td>
            </tr>`).join("")}
          </table></div>
          <div class="score-total" id="ev-total"></div>
        </div>`:""}
        <div class="field full"><label class="lbl">Remarks</label><textarea id="ev-remarks"></textarea></div>
      </div>
      <div class="form-actions">
        <button class="btn" onclick="submitEvaluation('${did}')">Submit Evaluation</button>
      </div>
      <div class="error-msg hidden" id="ev-err"></div>
    </div>`;
  }

  let decideHtml="";
  if(mode==="decide"&&demo.Status==="EVALUATED"){
    decideHtml=`<div class="card" id="sec-decide">
      <div class="card-head"><h2>Set Final Outcome</h2></div>
      <div class="form-grid">
        <div class="field">
          <label class="lbl">Outcome *</label>
          <select id="dec-outcome" onchange="toggleDecideFields()">
            <option value="">-- select --</option>
            <option value="SELECTED">Selected</option>
            <option value="BACKUP">Backup</option>
            <option value="REJECTED">Rejected (may present again)</option>
            <option value="REDO">Redo</option>
            <option value="PERM_REJECT">Permanent reject</option>
          </select>
        </div>
        <div class="field hidden" id="dec-level-row">
          <label class="lbl">Applies to *</label>
          <select id="dec-level">
            <option value="ALL">All (UG &amp; PG)</option>
            <option value="UG">UG</option>
            <option value="PG">PG</option>
          </select>
        </div>
        <div class="field hidden" id="dec-scope-row">
          <label class="lbl">Rejected for *</label>
          <select id="dec-scope">
            <option value="MODULE">This module only</option>
            <option value="PSG">PSG (all modules, permanent)</option>
          </select>
        </div>
        <div class="field">
          <label class="lbl">Decided by</label>
          <select id="dec-by"><option value="">-- select --</option>${activeEvaluators().map(e=>`<option value="${e.Name}">${esc(e.Name)}</option>`).join("")}</select>
        </div>
        <div class="field full"><label class="lbl">Final Remarks</label><textarea id="dec-remarks"></textarea></div>
      </div>
      <div class="form-actions">
        <button class="btn" onclick="submitDecide('${did}','${demo.TrainerID}')">Confirm Outcome</button>
      </div>
      <div class="error-msg hidden" id="dec-err"></div>
    </div>`;
  }

  let decidedHtml="";
  if(demo.Status==="DECIDED"){
    decidedHtml=`<div class="card">
      <div class="card-head"><h2>Final Outcome</h2><button class="btn ghost sm" onclick="showEditDecision('${did}')">Edit decision</button></div>
      <div class="info-row">
        <div class="info-item">Outcome: <span><span class="badge ${demoBadge(demo)}">${esc(demoStatusLabel(demo))}</span></span></div>
        ${demo.DecidedBy?`<div class="info-item">Decided by: <span>${esc(demo.DecidedBy)}</span></div>`:""}
      </div>
      ${demo.FinalRemarks?`<div style="font-size:13px;margin-top:4px">${esc(demo.FinalRemarks)}</div>`:""}
    </div>`;
  }

  m.innerHTML=`
    <div class="page-head">
      <div>
        <h1>${esc(trainerName(demo.TrainerID))} - ${esc(moduleName(demo.ModuleID))}</h1>
        <div class="sub">${fmt(demo.DemoDate)}${demo.Topic?" · "+esc(demo.Topic):""} · <span class="badge ${demoBadge(demo)}">${demoStatusLabel(demo)}</span></div>
      </div>
      <div class="btns">
        ${(demo.Status==="SCHEDULED"||demo.Status==="EVALUATED")?`<a class="btn sm" href="#" onclick="nav('demo-detail',{id:'${did}',mode:'evaluate'});return false;">Evaluate</a>`:""}
        ${demo.Status==="EVALUATED"?`<a class="btn sm" href="#" onclick="nav('demo-detail',{id:'${did}',mode:'decide'});return false;">Decide</a>`:""}
        <a class="btn ghost sm" href="#" onclick="nav('trainer-detail',{id:'${demo.TrainerID}'});return false;">← Trainer</a>
      </div>
    </div>
    ${decidedHtml}
    ${mode==="evaluate"?"":scoresHtml}
    ${evaluateHtml}
    ${decideHtml}
  `;
  if(modFields.length) calcEvalTotal();
}

window.calcEvalTotal = function() {
  const tot=$("ev-total"); if(!tot) return;
  let score=0,max=0;
  document.querySelectorAll("#ev-score-table .score-row").forEach(tr=>{
    score+=Number(tr.querySelector("input").value)||0;
    max+=Number(tr.dataset.max)||0;
  });
  tot.textContent=max?`Total: ${score} / ${max} (${Math.round(score/max*100)}%)`:"";
};

window.toggleDecideFields = function() {
  const outcome=$("dec-outcome").value;
  $("dec-level-row").classList.toggle("hidden", outcome!=="SELECTED"&&outcome!=="BACKUP");
  $("dec-scope-row").classList.toggle("hidden", outcome!=="PERM_REJECT");
};

window.submitEvaluation = async function(did) {
  const evaluatorID=$("ev-evaluator").value, errEl=$("ev-err");
  if(!evaluatorID){ errEl.textContent="Please select an evaluator."; errEl.classList.remove("hidden"); return; }
  const scores=[];
  document.querySelectorAll("#ev-score-table .score-row").forEach(tr=>{
    scores.push({FieldID:tr.dataset.fieldId, Criterion:tr.dataset.criterion, Score:Number(tr.querySelector("input").value)||0, MinAtTime:Number(tr.dataset.min), MaxAtTime:Number(tr.dataset.max)});
  });
  try {
    showLoading(true);
    const remarks=$("ev-remarks").value.trim();
    const res = await apiCall({action:"submitEvaluation", DemoID:did, EvaluatorID:evaluatorID, Remarks:remarks, Scores:scores});
    DB.evaluations.push({EvalID:res.EvalID, DemoID:did, EvaluatorID:evaluatorID, Remarks:remarks, SubmittedOn:fmtToday()});
    scores.forEach(sc => DB.evaluationscores.push({ScoreID:"tmp"+Math.random(), EvalID:res.EvalID,
      FieldID:sc.FieldID, Criterion:sc.Criterion, Score:sc.Score, MinAtTime:sc.MinAtTime, MaxAtTime:sc.MaxAtTime}));
    const dm = DB.demos.find(x=>String(x.DemoID)===String(did));
    if (dm && dm.Status==="SCHEDULED") dm.Status="EVALUATED";
    showToast("Evaluation submitted."); nav("scheduled"); refreshAll();
  } catch(e){ errEl.textContent=e.message; errEl.classList.remove("hidden"); }
  showLoading(false);
};

window.submitDecide = async function(did, trainerID) {
  const outcome=$("dec-outcome").value, errEl=$("dec-err");
  if(!outcome){ errEl.textContent="Please select an outcome."; errEl.classList.remove("hidden"); return; }
  if(outcome==="PERM_REJECT"&&!$("dec-remarks").value.trim()){ errEl.textContent="Please write the reason for a permanent rejection."; errEl.classList.remove("hidden"); return; }
  try {
    showLoading(true);
    const level = (outcome==="SELECTED"||outcome==="BACKUP") ? $("dec-level").value : "ALL";
    const scope = outcome==="PERM_REJECT" ? $("dec-scope").value : "";
    const by = $("dec-by").value, remarks = $("dec-remarks").value.trim();
    await apiCall({action:"decideDemo", DemoID:did, Outcome:outcome, Level:level, RejectScope:scope, DecidedBy:by, FinalRemarks:remarks});
    const d = DB.demos.find(x=>String(x.DemoID)===String(did));
    Object.assign(d, {Status:"DECIDED", Outcome:outcome, Level:level, RejectScope:scope, FinalRemarks:remarks, DecidedBy:by});
    DB.decisions.push({DecisionID:"tmp"+Date.now(), TrainerID:d.TrainerID,
      ModuleID:(outcome==="PERM_REJECT"&&scope==="PSG")?"":d.ModuleID,
      Level:level, Status:outcome, EffectiveDate:d.DemoDate, Reason:remarks, DemoID:did});
    showToast("Outcome recorded."); nav("trainer-detail",{id:trainerID}); refreshAll();
  } catch(e){ errEl.textContent=e.message; errEl.classList.remove("hidden"); }
  showLoading(false);
};

// ── Follow-ups ─────────────────────────────────────────────────
function followups(m) {
  const waiting=pendingRedos(), completed=completedRedos();
  m.innerHTML=`
    <div class="page-head"><div><h1>Follow-ups</h1><div class="sub">Redo demos waiting and completed.</div></div></div>
    <div class="card">
      <div class="card-head"><h2>Waiting for Redo (${waiting.length})</h2></div>
      ${waiting.length?`<div class="tbl-wrap"><table>
        <tr><th>Trainer</th><th>Module</th><th>Topic</th><th>Demo Date</th><th></th></tr>
        ${waiting.map(d=>`<tr>
          <td><a href="#" onclick="nav('trainer-detail',{id:'${d.TrainerID}'});return false;">${esc(trainerName(d.TrainerID))}</a></td>
          <td>${esc(moduleName(d.ModuleID))}</td><td>${esc(d.Topic)}</td><td>${fmt(d.DemoDate)}</td>
          <td class="actions"><a href="#" onclick="nav('schedule-demo',{trainerID:'${d.TrainerID}'});return false;">+ Schedule New Demo</a></td>
        </tr>`).join("")}
      </table></div>`:`<div class="empty">No pending redo demos.</div>`}
    </div>
    <div class="card">
      <div class="card-head"><h2>Completed (${completed.length})</h2></div>
      ${completed.length?`<div class="tbl-wrap"><table>
        <tr><th>Trainer</th><th>Module</th><th>Topic</th><th>Latest Demo Date</th><th>Result</th></tr>
        ${completed.map(d=>`<tr>
          <td><a href="#" onclick="nav('trainer-detail',{id:'${d.TrainerID}'});return false;">${esc(trainerName(d.TrainerID))}</a></td>
          <td>${esc(moduleName(d.ModuleID))}</td><td>${esc(d.Topic)}</td><td>${fmt(d.DemoDate)}</td>
          <td><span class="badge ${demoBadge(d)}">${esc(demoStatusLabel(d))}</span></td>
        </tr>`).join("")}
      </table></div>`:`<div class="empty">No completed redos yet.</div>`}
    </div>
  `;
}

// ── Evaluated Demos ────────────────────────────────────────────
function evaluated(m, params={}) {
  const moduleFilter=params.module||"", trainerFilter=params.trainer||"", vendorFilter=params.vendor||"";
  const resultFilter=params.result||"", sub=params.sub||"";
  const dateFrom=params.from||"", dateTo=params.to||"";

  function demoAvgScore(did) {
    const evals=DB.evaluations.filter(ev=>String(ev.DemoID)===String(did));
    if(!evals.length) return null;
    const totals=evals.map(ev=>DB.evaluationscores.filter(sc=>String(sc.EvalID)===String(ev.EvalID)).reduce((a,sc)=>a+Number(sc.Score),0));
    return Math.round(totals.reduce((a,b)=>a+b,0)/totals.length*10)/10;
  }

  let list=DB.demos.filter(d=>d.Status==="EVALUATED"||d.Status==="DECIDED");
  if(moduleFilter)  list=list.filter(d=>String(d.ModuleID)===moduleFilter);
  if(trainerFilter) list=list.filter(d=>String(d.TrainerID)===trainerFilter);
  if(vendorFilter)  list=list.filter(d=>String(demoVendorId(d))===vendorFilter);
  if(resultFilter==="AWAITING") list=list.filter(d=>d.Status==="EVALUATED");
  else if(resultFilter){
    list=list.filter(d=>d.Status==="DECIDED"&&d.Outcome===resultFilter);
    if(sub&&(resultFilter==="SELECTED"||resultFilter==="BACKUP")) list=list.filter(d=>(d.Level||"ALL")===sub);
    if(sub&&resultFilter==="PERM_REJECT") list=list.filter(d=>(d.RejectScope||"MODULE")===sub);
  }
  if(dateFrom) list=list.filter(d=>String(d.DemoDate).slice(0,10)>=dateFrom);
  if(dateTo)   list=list.filter(d=>String(d.DemoDate).slice(0,10)<=dateTo);
  list.sort((a,b)=>new Date(b.DemoDate)-new Date(a.DemoDate)||Number(b.DemoID)-Number(a.DemoID));

  const showLevel=(resultFilter==="SELECTED"||resultFilter==="BACKUP");
  const showScope=(resultFilter==="PERM_REJECT");

  m.innerHTML=`
    <div class="page-head"><div><h1>Evaluated Demos</h1><div class="sub">${list.length} result${list.length!==1?"s":""}</div></div></div>
    <div class="filters">
      <label>Module<select id="ev-f-module"><option value="">All</option>
        ${activeModules().map(mod=>`<option value="${mod.ModuleID}" ${moduleFilter===String(mod.ModuleID)?"selected":""}>${esc(mod.Name)}</option>`).join("")}</select></label>
      <label>Vendor<select id="ev-f-vendor"><option value="">All</option>
        ${DB.vendors.map(v=>`<option value="${v.VendorID}" ${vendorFilter===String(v.VendorID)?"selected":""}>${esc(v.Name)}</option>`).join("")}</select></label>
      <label>Trainer<select id="ev-f-trainer"><option value="">All</option>
        ${DB.trainers.map(t=>`<option value="${t.TrainerID}" ${trainerFilter===String(t.TrainerID)?"selected":""}>${esc(t.Name)}</option>`).join("")}</select></label>
      <label>Result<select id="ev-f-result" onchange="evToggleSub()">
        <option value="">All</option>
        <option value="AWAITING" ${resultFilter==="AWAITING"?"selected":""}>Awaiting decision</option>
        <option value="SELECTED" ${resultFilter==="SELECTED"?"selected":""}>Selected</option>
        <option value="BACKUP" ${resultFilter==="BACKUP"?"selected":""}>Backup</option>
        <option value="REJECTED" ${resultFilter==="REJECTED"?"selected":""}>Rejected</option>
        <option value="REDO" ${resultFilter==="REDO"?"selected":""}>Redo</option>
        <option value="PERM_REJECT" ${resultFilter==="PERM_REJECT"?"selected":""}>Permanent reject</option>
      </select></label>
      <label id="ev-sub-level" class="${showLevel?"":"hidden"}">Applies to<select id="ev-f-level">
        <option value="">Any</option>
        <option value="ALL" ${sub==="ALL"?"selected":""}>Both (UG &amp; PG)</option>
        <option value="UG" ${sub==="UG"?"selected":""}>UG only</option>
        <option value="PG" ${sub==="PG"?"selected":""}>PG only</option>
      </select></label>
      <label id="ev-sub-scope" class="${showScope?"":"hidden"}">Rejected for<select id="ev-f-scope">
        <option value="">Any</option>
        <option value="MODULE" ${sub==="MODULE"?"selected":""}>This module only</option>
        <option value="PSG" ${sub==="PSG"?"selected":""}>PSG (all modules)</option>
      </select></label>
      <label>From<input type="date" id="ev-f-from" value="${dateFrom}"></label>
      <label>To<input type="date" id="ev-f-to" value="${dateTo}"></label>
      <button class="btn" onclick="evApplyFilter()">Filter</button>
      <a class="btn ghost" href="#" onclick="nav('evaluated');return false;">Clear</a>
    </div>
    <div class="card"><div class="tbl-wrap"><table>
      <tr><th>Date</th><th>Trainer</th><th>Module</th><th>Topic</th><th>Result</th><th>Evaluators</th><th>Avg Score</th><th>Vendor</th><th>Final remarks</th><th>Decided by</th><th></th></tr>
      ${list.map(d=>{
        const evalCount=DB.evaluations.filter(ev=>String(ev.DemoID)===String(d.DemoID)).length;
        const avg=demoAvgScore(d.DemoID);
        return `<tr>
          <td>${fmt(d.DemoDate)}</td>
          <td><a href="#" onclick="nav('trainer-detail',{id:'${d.TrainerID}'});return false;">${esc(trainerName(d.TrainerID))}</a></td>
          <td>${esc(moduleName(d.ModuleID))}</td>
          <td>${esc(d.Topic)}</td>
          <td><span class="badge ${demoBadge(d)}">${esc(demoStatusLabel(d))}</span></td>
          <td>${evalCount}</td>
          <td>${avg!==null?avg:'<span class="muted">-</span>'}</td>
          <td>${demoVendorName(d)}</td>
          <td style="max-width:260px">${esc(d.FinalRemarks)||'<span class="muted">-</span>'}</td>
          <td>${esc(d.DecidedBy)||'<span class="muted">-</span>'}</td>
          <td class="actions"><a href="#" onclick="nav('demo-detail',{id:'${d.DemoID}'});return false;">View →</a></td>
        </tr>`;
      }).join("")||`<tr><td colspan="11" class="empty">No evaluated demos found.</td></tr>`}
    </table></div></div>
  `;
}

window.evToggleSub=function(){
  const r=$("ev-f-result").value;
  $("ev-sub-level").classList.toggle("hidden", !(r==="SELECTED"||r==="BACKUP"));
  $("ev-sub-scope").classList.toggle("hidden", r!=="PERM_REJECT");
};
window.evApplyFilter=function(){
  const r=$("ev-f-result").value;
  const sub=(r==="SELECTED"||r==="BACKUP") ? $("ev-f-level").value : (r==="PERM_REJECT" ? $("ev-f-scope").value : "");
  nav("evaluated",{module:$("ev-f-module").value,vendor:$("ev-f-vendor").value,trainer:$("ev-f-trainer").value,result:r,sub:sub,from:$("ev-f-from").value,to:$("ev-f-to").value});
};

// ── Edit demo / evaluation / decision modals ──────────────────
window.showEditDemo = function(did) {
  const d = DB.demos.find(x => String(x.DemoID) === String(did));
  if (!d) return;
  openModal(`<h2>Edit Scheduled Demo</h2>
    <div class="form-grid">
      <div class="field">
        <label class="lbl">Module *</label>
        <select id="ed-module">
          ${activeModules().map(m => `<option value="${m.ModuleID}" ${String(m.ModuleID)===String(d.ModuleID)?"selected":""}>${esc(m.Name)}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label class="lbl">Demo Date *</label><input type="date" id="ed-date" value="${String(d.DemoDate).slice(0,10)}"></div>
      <div class="field full"><label class="lbl">Topic</label><input type="text" id="ed-topic" value="${esc(d.Topic||"")}"></div>
    </div>
    <div class="form-actions">
      <button class="btn" onclick="submitEditDemo('${did}','${d.TrainerID}')">Save</button>
      <button class="btn danger" onclick="submitEditDemo('${did}','${d.TrainerID}','CANCELLED')">Cancel Demo</button>
      <button class="btn ghost" onclick="closeModal()">Back</button>
    </div>
    <div class="error-msg hidden" id="ed-err"></div>`);
};
window.submitEditDemo = async function(did, trainerID, cancel) {
  const errEl = $("ed-err");
  try {
    showLoading(true);
    await apiCall({action:"editDemo", DemoID:did, ModuleID:$("ed-module").value, DemoDate:$("ed-date").value, Topic:$("ed-topic").value.trim(), Status:cancel||""});
    await loadAll();
    closeModal();
    showToast(cancel ? "Demo cancelled." : "Demo updated.");
    nav("scheduled");
  } catch(e) { errEl.textContent = e.message; errEl.classList.remove("hidden"); }
  showLoading(false);
};

window.showEditEvaluation = function(evalId) {
  const ev = DB.evaluations.find(x => String(x.EvalID) === String(evalId));
  if (!ev) return;
  const scores = DB.evaluationscores.filter(s => String(s.EvalID) === String(evalId));
  const evOptions = DB.evaluators
    .filter(e => isTrue(e.Active) || String(e.EvaluatorID) === String(ev.EvaluatorID))
    .map(e => `<option value="${e.EvaluatorID}" ${String(e.EvaluatorID)===String(ev.EvaluatorID)?"selected":""}>${esc(e.Name)}</option>`).join("");
  openModal(`<h2>Edit Evaluation</h2>
    <div class="form-grid single">
      <div class="field"><label class="lbl">Evaluator</label><select id="ee2-evaluator">${evOptions}</select></div>
      <div class="field"><div class="tbl-wrap"><table class="score-table" id="ee2-table">
        <tr><th>Criterion</th><th>Score</th><th>Max</th></tr>
        ${scores.map(s => `<tr class="ee2-row" data-field-id="${s.FieldID}">
          <td>${esc(s.Criterion)}</td>
          <td><input type="number" min="${s.MinAtTime}" max="${s.MaxAtTime}" step="1" value="${s.Score}"></td>
          <td class="max-lbl">/ ${s.MaxAtTime}</td>
        </tr>`).join("")}
      </table></div></div>
      <div class="field"><label class="lbl">Remarks</label><textarea id="ee2-remarks">${esc(ev.Remarks||"")}</textarea></div>
    </div>
    <div class="form-actions">
      <button class="btn" onclick="submitEditEvaluation('${evalId}','${ev.DemoID}')">Save</button>
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
    </div>
    <div class="error-msg hidden" id="ee2-err"></div>`);
};
window.submitEditEvaluation = async function(evalId, demoId) {
  const errEl = $("ee2-err");
  const scores = [];
  document.querySelectorAll("#ee2-table .ee2-row").forEach(tr => {
    scores.push({FieldID: tr.dataset.fieldId, Score: Number(tr.querySelector("input").value) || 0});
  });
  try {
    showLoading(true);
    await apiCall({action:"updateEvaluation", EvalID:evalId, EvaluatorID:$("ee2-evaluator").value, Remarks:$("ee2-remarks").value.trim(), Scores:scores});
    await loadAll();
    closeModal();
    showToast("Evaluation updated.");
    nav("demo-detail",{id:demoId});
  } catch(e) { errEl.textContent = e.message; errEl.classList.remove("hidden"); }
  showLoading(false);
};

window.showEditDecision = function(did) {
  const d = DB.demos.find(x => String(x.DemoID) === String(did));
  if (!d) return;
  const outcomes = [["SELECTED","Selected"],["BACKUP","Backup"],["REJECTED","Rejected (may present again)"],["REDO","Redo"],["PERM_REJECT","Permanent reject"]];
  const names = activeEvaluators().map(e => e.Name);
  if (d.DecidedBy && !names.includes(d.DecidedBy)) names.push(d.DecidedBy);
  const showLevel = d.Outcome==="SELECTED" || d.Outcome==="BACKUP";
  openModal(`<h2>Edit Final Decision</h2>
    <div class="form-grid">
      <div class="field">
        <label class="lbl">Outcome *</label>
        <select id="ed2-outcome" onchange="toggleEditDecideFields()">
          ${outcomes.map(o => `<option value="${o[0]}" ${d.Outcome===o[0]?"selected":""}>${o[1]}</option>`).join("")}
        </select>
      </div>
      <div class="field ${showLevel?"":"hidden"}" id="ed2-level-row">
        <label class="lbl">Applies to *</label>
        <select id="ed2-level">
          <option value="ALL" ${(d.Level==="ALL"||!d.Level)?"selected":""}>All (UG &amp; PG)</option>
          <option value="UG" ${d.Level==="UG"?"selected":""}>UG</option>
          <option value="PG" ${d.Level==="PG"?"selected":""}>PG</option>
        </select>
      </div>
      <div class="field ${d.Outcome==="PERM_REJECT"?"":"hidden"}" id="ed2-scope-row">
        <label class="lbl">Rejected for *</label>
        <select id="ed2-scope">
          <option value="MODULE" ${d.RejectScope!=="PSG"?"selected":""}>This module only</option>
          <option value="PSG" ${d.RejectScope==="PSG"?"selected":""}>PSG (all modules, permanent)</option>
        </select>
      </div>
      <div class="field">
        <label class="lbl">Decided by</label>
        <select id="ed2-by"><option value="">-- select --</option>
          ${names.map(n => `<option value="${esc(n)}" ${d.DecidedBy===n?"selected":""}>${esc(n)}</option>`).join("")}
        </select>
      </div>
      <div class="field full"><label class="lbl">Final Remarks</label><textarea id="ed2-remarks">${esc(d.FinalRemarks||"")}</textarea></div>
    </div>
    <div class="form-actions">
      <button class="btn" onclick="submitEditDecision('${did}')">Save</button>
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
    </div>
    <div class="error-msg hidden" id="ed2-err"></div>`);
};
window.toggleEditDecideFields = function() {
  const o = $("ed2-outcome").value;
  $("ed2-level-row").classList.toggle("hidden", o!=="SELECTED" && o!=="BACKUP");
  $("ed2-scope-row").classList.toggle("hidden", o!=="PERM_REJECT");
};
window.submitEditDecision = async function(did) {
  const errEl = $("ed2-err");
  const outcome = $("ed2-outcome").value;
  const remarks = $("ed2-remarks").value.trim();
  if (outcome==="PERM_REJECT" && !remarks) {
    errEl.textContent = "Please write the reason for a permanent rejection.";
    errEl.classList.remove("hidden");
    return;
  }
  const level = (outcome==="SELECTED"||outcome==="BACKUP") ? $("ed2-level").value : "ALL";
  const scope = outcome==="PERM_REJECT" ? $("ed2-scope").value : "";
  try {
    showLoading(true);
    await apiCall({action:"updateDecision", DemoID:did, Outcome:outcome, Level:level, RejectScope:scope, DecidedBy:$("ed2-by").value, FinalRemarks:remarks});
    await loadAll();
    closeModal();
    showToast("Decision updated.");
    nav("demo-detail",{id:did});
  } catch(e) { errEl.textContent = e.message; errEl.classList.remove("hidden"); }
  showLoading(false);
};
