// modules/actions.js : Action Taken (promote / backup / remove without a demo)
registerPage({ id:"action-taken", title:"Action Taken", section:"Records", render:(m,p)=>actionTakenPage(m,p) });

registerActions({
  recordAction: async p => {
    const level = p.Level || "ALL";
    const fresh = (p.FreshStart===true || p.FreshStart==="true");
    const list = [];
    if (fresh) list.push(["INSERT INTO Decisions (TrainerID,ModuleID,Level,Status,EffectiveDate,Reason,ActionType,TakenBy) VALUES (?,NULL,'ALL','FRESH_START',?,?,'Fresh start',?)",
      [p.TrainerID,fmtToday(),p.Reason,p.TakenBy]]);
    list.push(["INSERT INTO Decisions (TrainerID,ModuleID,Level,Status,EffectiveDate,Reason,ActionType,TakenBy) VALUES (?,?,?,?,?,?,'Action',?)",
      [p.TrainerID,p.ModuleID,level,p.Status,fmtToday(),p.Reason,p.TakenBy]]);
    const ids = await tTx(list);
    return {DecisionID: ids[ids.length-1]};
  }
});

window.actionLabel = s => ({SELECTED:"Selected",BACKUP:"Backup",REJECTED:"Rejected",REDO:"Redo",PERM_REJECT:"Permanent reject",REMOVED:"Removed",FRESH_START:"Fresh start"}[s]||s||"-");

function actionTakenPage(m, params={}) {
  const tf  = String(params.trainer || "");
  const pre = String(params.trainerID || "");
  const colors = {SELECTED:"green",BACKUP:"teal",REJECTED:"amber",REDO:"blue",PERM_REJECT:"red",REMOVED:"red",FRESH_START:"purple"};
  const hist = DB.decisions
    .filter(d => !tf || String(d.TrainerID)===tf)
    .sort((a,b) => new Date(b.EffectiveDate)-new Date(a.EffectiveDate) || Number(b.DecisionID)-Number(a.DecisionID));

  m.innerHTML = `
    <div class="page-head"><div><h1>Action Taken</h1><div class="sub">Promote, extend, demote or remove a trainer for a module, without a demo.</div></div></div>
    <div class="card">
      <div class="card-head"><h2>New Action</h2></div>
      <div class="form-grid">
        <div class="field"><label class="lbl">Trainer *</label>
          <select id="ac-trainer"><option value="">-- select --</option>
            ${activeTrainers().map(t => `<option value="${t.TrainerID}" ${String(t.TrainerID)===pre?"selected":""}>${esc(t.Name)}</option>`).join("")}
          </select></div>
        <div class="field"><label class="lbl">Module *</label>
          <select id="ac-module"><option value="">-- select --</option>
            ${activeModules().map(mod => `<option value="${mod.ModuleID}">${esc(mod.Name)}</option>`).join("")}
          </select></div>
        <div class="field"><label class="lbl">Level *</label>
          <select id="ac-level"><option value="ALL">All (UG &amp; PG)</option><option value="UG">UG</option><option value="PG">PG</option></select></div>
        <div class="field"><label class="lbl">Action *</label>
          <select id="ac-status">
            <option value="SELECTED">Select (make trainer)</option>
            <option value="BACKUP">Backup</option>
            <option value="REMOVED">Remove</option>
          </select></div>
        <div class="field"><label class="lbl">Taken by</label>
          <select id="ac-by"><option value="">-- select --</option>
            ${activeEvaluators().map(e => `<option value="${esc(e.Name)}">${esc(e.Name)}</option>`).join("")}
          </select></div>
        <div class="field full"><label class="lbl">Reason</label><textarea id="ac-reason"></textarea></div>
      </div>
      <div class="form-actions"><button class="btn" onclick="submitAction()">Save Action</button></div>
      <div class="error-msg hidden" id="ac-err"></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>History (${hist.length})</h2></div>
      <div class="filters">
        <label>Trainer<select id="ac-f-trainer"><option value="">All</option>
          ${DB.trainers.map(t => `<option value="${t.TrainerID}" ${tf===String(t.TrainerID)?"selected":""}>${esc(t.Name)}</option>`).join("")}
        </select></label>
        <button class="btn" onclick="nav('action-taken',{trainer:$('ac-f-trainer').value})">Filter</button>
        <a class="btn ghost" href="#" onclick="nav('action-taken');return false;">Clear</a>
      </div>
      <div class="tbl-wrap"><table>
        <tr><th>Date</th><th>Trainer</th><th>Module</th><th>Level</th><th>Result</th><th>Source</th><th>By</th><th>Reason</th></tr>
        ${hist.map(d => `<tr>
          <td>${fmt(d.EffectiveDate)}</td>
          <td>${esc(trainerName(d.TrainerID))}</td>
          <td>${d.ModuleID ? esc(moduleName(d.ModuleID)) : "All modules"}</td>
          <td>${(!d.Level||d.Level==="ALL") ? "All" : esc(d.Level)}</td>
          <td><span class="badge ${colors[d.Status]||"grey"}">${esc(actionLabel(d.Status))}</span></td>
          <td>${esc(d.ActionType || (d.DemoID ? "Demo" : "Action"))}</td>
          <td>${esc(d.TakenBy||"")}</td>
          <td style="max-width:240px">${esc(d.Reason)}</td>
        </tr>`).join("") || `<tr><td colspan="8" class="empty">No records yet.</td></tr>`}
      </table></div>
    </div>
  `;
}

window.submitAction = async function() {
  const errEl = $("ac-err");
  const fail = msg => { errEl.textContent = msg; errEl.classList.remove("hidden"); };
  const tid = $("ac-trainer").value, mid = $("ac-module").value;
  const level = $("ac-level").value, status = $("ac-status").value;
  const reason = $("ac-reason").value.trim(), by = $("ac-by").value;
  if (!tid || !mid) { fail("Trainer and Module are required."); return; }

  let fresh = false;
  if (status === "SELECTED" || status === "BACKUP") {
    const mods = activeModules();
    const dec = trainerDecisions(tid);
    if (trainerStatus(dec, mods) === "PERM_REJECT_ALL") {
      if (!reason) { fail("This trainer is permanently rejected. A reason is required to continue."); return; }
      if (!confirm("This trainer was permanently rejected.\n\nContinuing will ignore ALL their earlier selections and start fresh with only this module.\n\nContinue?")) return;
      fresh = true;
    } else {
      const cell = levelCells(dec, mods)[String(mid)] || {};
      const lvls = level === "ALL" ? ["UG","PG"] : [level];
      if (lvls.some(l => cell[l] && cell[l].Status === "PERM_REJECT")) {
        if (!reason) { fail("This module was permanently rejected for this trainer. A reason is required to override it."); return; }
        if (!confirm("This module was permanently rejected for this trainer.\n\nContinuing will override that rejection for the chosen level.\n\nContinue?")) return;
      }
    }
  }

  try {
    showLoading(true);
    await apiCall({action:"recordAction", TrainerID:tid, ModuleID:mid, Level:level, Status:status, Reason:reason, TakenBy:by, FreshStart:fresh});
    await loadAll();
    showToast(fresh ? "Fresh start recorded." : "Action saved.");
    nav("trainer-detail", {id:tid});
  } catch(e) { fail(e.message); }
  showLoading(false);
};
