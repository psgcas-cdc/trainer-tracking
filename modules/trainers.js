// modules/trainers.js : trainer list, trainer detail, add/edit trainer, change vendor
registerPage({ id:"trainers", title:"All Trainers", section:"Trainers", render:(m,p)=>trainers(m,p) });
registerPage({ id:"trainer-detail", title:"Trainer", hidden:true, render:(m,p)=>trainerDetail(m,p) });

registerActions({
  addTrainer: async p => {
    const ids = await tTx([
      ["INSERT INTO Trainers (Name,Phone,Email,Notes,Active) VALUES (?,?,?,?,1)", [p.Name,p.Phone,p.Email,p.Notes]],
      ["INSERT INTO Engagements (TrainerID,VendorID,Type,StartDate) VALUES (last_insert_rowid(),?,?,?)", [p.VendorID,p.Type,p.StartDate||fmtToday()]]
    ]);
    return {TrainerID: ids[0], EngagementID: ids[1]};
  },
  editTrainer: async p => { await tRun(
    "UPDATE Trainers SET Name=?,Phone=?,Email=?,Notes=? WHERE TrainerID=?",
    [p.Name,p.Phone,p.Email,p.Notes,p.TrainerID]); return {}; },
  addEngagement: async p => {
    const ids = await tTx([
      ["UPDATE Engagements SET EndDate=? WHERE TrainerID=? AND (EndDate IS NULL OR EndDate='')", [p.StartDate,p.TrainerID]],
      ["INSERT INTO Engagements (TrainerID,VendorID,Type,StartDate) VALUES (?,?,?,?)", [p.TrainerID,p.VendorID,p.Type,p.StartDate]]
    ]);
    return {EngagementID: ids[1]};
  }
});

function trainers(m, params={}) {
  const mods=activeModules(), q=(params.q||"").toLowerCase();
  let list=activeTrainers();
  if(q) list=list.filter(t=>t.Name.toLowerCase().includes(q));

  m.innerHTML=`
    <div class="page-head">
      <div><h1>Trainers</h1><div class="sub">${list.length} trainer${list.length!==1?"s":""}</div></div>
      <button class="btn" onclick="showAddTrainer()">+ Add Trainer</button>
    </div>
    <div class="filters">
      <label>Search<input type="text" id="q-trainers" placeholder="Name" value="${esc(params.q||"")}"></label>
      <button class="btn" onclick="nav('trainers',{q:$('q-trainers').value})">Filter</button>
    </div>
    <div class="card"><div class="tbl-wrap"><table>
      <tr><th>Name</th><th>Vendor</th><th>Type</th><th>Status</th><th>Approved Modules</th><th></th></tr>
      ${list.map(t=>{
        const eng=currentEngagement(t.TrainerID);
        const dec=trainerDecisions(t.TrainerID);
        const status=trainerStatus(dec,mods);
        const tags=approvalTags(approvedItems(dec,mods));
        const badge=status==="ACTIVE"?"green":status==="PERM_REJECT_ALL"?"red":"amber";
        const label=status==="ACTIVE"?"Active":status==="PERM_REJECT_ALL"?"PSG Rejected":"Module Rejected";
        return `<tr>
          <td><a href="#" onclick="nav('trainer-detail',{id:'${t.TrainerID}'});return false;"><b>${esc(t.Name)}</b></a></td>
          <td>${eng?esc(vendorName(eng.VendorID)):'<span class="muted">-</span>'}</td>
          <td>${eng?(eng.Type==="FT"?"Full-time":"Freelancer"):'<span class="muted">-</span>'}</td>
          <td><span class="badge ${badge}">${label}</span></td>
          <td>${tags.map(tg=>`<span class="tag">${esc(tg)}</span>`).join("")||'<span class="muted">-</span>'}</td>
          <td class="actions"><a href="#" onclick="nav('trainer-detail',{id:'${t.TrainerID}'});return false;">View</a></td>
        </tr>`;
      }).join("")||`<tr><td colspan="6" class="empty">No trainers found.</td></tr>`}
    </table></div></div>
  `;
}

function trainerDetail(m, params={}) {
  const tid=String(params.id);
  const t=DB.trainers.find(x=>String(x.TrainerID)===tid);
  if(!t){ m.innerHTML="<p>Trainer not found.</p>"; return; }
  const mods=activeModules();
  const dec=trainerDecisions(tid);
  const cells=levelCells(dec,mods);
  const eng=currentEngagement(tid);
  const engHistory=DB.engagements.filter(e=>String(e.TrainerID)===tid).sort((a,b)=>new Date(b.StartDate)-new Date(a.StartDate));
  const trainerDemos=DB.demos.filter(d=>String(d.TrainerID)===tid&&d.Status!=="CANCELLED").sort((a,b)=>new Date(b.DemoDate)-new Date(a.DemoDate)||Number(b.DemoID)-Number(a.DemoID));
  const trainerFeedback=DB.feedback.filter(f=>String(f.TrainerID)===tid).sort((a,b)=>new Date(b.TrainingDate)-new Date(a.TrainingDate));

  const moduleRows=mods.map(mod=>{
    const mid=String(mod.ModuleID),cell=cells[mid]||{UG:null,PG:null};
    const selectedLevels=["UG","PG"].filter(lv=>cell[lv]&&cell[lv].Status==="SELECTED");
    const ctrlDec=cell.UG||cell.PG;
    const backupLevels=["UG","PG"].filter(lv=>cell[lv]&&cell[lv].Status==="BACKUP");
    return {mod,selectedLevels,backupLevels,ctrlDec};
  });

  m.innerHTML=`
    <div class="page-head">
      <div><h1>${esc(t.Name)}</h1>
        <div class="sub">${eng?`${eng.Type==="FT"?"Full-time":"Freelancer"} · ${esc(vendorName(eng.VendorID))} · since ${fmt(eng.StartDate)}`:"No current vendor"}${t.Phone?" · "+esc(t.Phone):""}</div>
      </div>
      <div class="btns">
        <button class="btn" onclick="nav('schedule-demo',{trainerID:'${tid}'})">+ Schedule Demo</button>
        <button class="btn" onclick="nav('add-feedback',{trainerID:'${tid}'})">+ Feedback</button>
        <button class="btn ghost" onclick="showEditTrainer('${tid}')">Edit</button>
        <button class="btn ghost" onclick="nav('action-taken',{trainerID:'${tid}'})">Take Action</button>
        <button class="btn ghost sm" onclick="showChangeEngagement('${tid}')">Change Vendor/Type</button>
        ${t["Trainer Profile"]&&t["Trainer Profile"]!=="File not found"?`<a href="${esc(t["Trainer Profile"])}" target="_blank" class="btn ghost sm">Profile</a>`:""}
        ${t["Trainer Form"]&&t["Trainer Form"]!=="File not found"?`<a href="${esc(t["Trainer Form"])}" target="_blank" class="btn ghost sm">Form</a>`:""}
      </div>
    </div>
    <div class="jump"><a href="#sec-status">Status</a><a href="#sec-vendor">Vendor history</a><a href="#sec-demos">Demos</a><a href="#sec-feedback">Feedback</a></div>

    <div class="card" id="sec-status">
      <div class="card-head"><h2>Status by module</h2></div>
      <div class="tbl-wrap"><table>
        <tr><th>Module</th><th>Current status</th></tr>
        ${moduleRows.map(({mod,selectedLevels,backupLevels,ctrlDec})=>`<tr>
          <td><b>${esc(mod.Name)}</b></td>
          <td>${selectedLevels.length?`<span class="badge green">Selected for ${selectedLevels.length===2?"All":selectedLevels[0]}</span> `:""}${backupLevels.length?`<span class="badge teal">Backup for ${backupLevels.length===2?"All":backupLevels[0]}</span>`:""}${(!selectedLevels.length&&!backupLevels.length)?(ctrlDec?`<span class="badge ${{PERM_REJECT:"red",REJECTED:"amber",REDO:"blue",REMOVED:"red"}[ctrlDec.Status]||"grey"}">${{PERM_REJECT:"Permanently rejected",REJECTED:"Rejected",REDO:"Redo",REMOVED:"Removed",SELECTED:"Selected"}[ctrlDec.Status]||ctrlDec.Status}</span>${!ctrlDec.ModuleID?'<span class="muted" style="font-size:11px;margin-left:6px">PSG</span>':""}`:`<span class="badge grey">Not decided</span>`):""}</td>
        </tr>`).join("")}
      </table></div>
    </div>

    <div class="card" id="sec-vendor">
      <div class="card-head"><h2>Vendor &amp; type history</h2></div>
      <div class="tbl-wrap"><table>
        <tr><th>From</th><th>To</th><th>Vendor</th><th>Type</th></tr>
        ${engHistory.map(e=>`<tr>
          <td>${fmt(e.StartDate)}</td>
          <td>${e.EndDate&&e.EndDate!==""?fmt(e.EndDate):`<span class="badge green">Current</span>`}</td>
          <td>${esc(vendorName(e.VendorID))}</td><td>${e.Type==="FT"?"Full-time":"Freelancer"}</td>
        </tr>`).join("")||`<tr><td colspan="4" class="empty">No vendor history.</td></tr>`}
      </table></div>
    </div>

    <div class="card" id="sec-demos">
      <div class="card-head"><h2>Demos</h2><button class="btn sm" onclick="nav('schedule-demo',{trainerID:'${tid}'})">+ Schedule Demo</button></div>
      <div class="tbl-wrap"><table>
        <tr><th>Date</th><th>Module</th><th>Topic</th><th>Status</th><th>Evaluations</th><th></th></tr>
        ${trainerDemos.map(d=>{
          const evalCount=DB.evaluations.filter(ev=>String(ev.DemoID)===String(d.DemoID)).length;
          return `<tr>
            <td>${fmt(d.DemoDate)}</td><td>${esc(moduleName(d.ModuleID))}</td><td>${esc(d.Topic)}</td>
            <td><span class="badge ${demoBadge(d)}">${esc(demoStatusLabel(d))}</span></td>
            <td>${evalCount}</td>
            <td class="actions">
              <a href="#" onclick="nav('demo-detail',{id:'${d.DemoID}'});return false;">View</a>
              ${d.Status==="SCHEDULED"?`<a href="#" onclick="showEditDemo('${d.DemoID}');return false;">Edit</a>`:""}
            </td>
          </tr>`;
        }).join("")||`<tr><td colspan="6" class="empty">No demos yet.</td></tr>`}
      </table></div>
    </div>

    <div class="card" id="sec-feedback">
      <div class="card-head"><h2>Class Feedback</h2><button class="btn sm" onclick="nav('add-feedback',{trainerID:'${tid}'})">+ Feedback</button></div>
      <div class="tbl-wrap"><table>
        <tr><th>Date</th><th>Session</th><th>Batch/Dept</th><th>Rating</th><th>Feedback</th></tr>
        ${trainerFeedback.map(f=>`<tr>
          <td>${fmt(f.TrainingDate)}</td><td>${esc(f.Session)}</td><td>${esc(f.BatchDept)}</td>
          <td>${f.Rating?f.Rating+"/5":"-"}</td><td style="max-width:250px">${esc(f.Feedback)}</td>
        </tr>`).join("")||`<tr><td colspan="5" class="empty">No feedback yet.</td></tr>`}
      </table></div>
    </div>
  `;
}

window.showAddTrainer = function() {
  openModal(`<h2>Add Trainer</h2>
    <div class="form-grid">
      <div class="field full"><label class="lbl">Name *</label><input type="text" id="at-name"></div>
      <div class="field"><label class="lbl">Phone</label><input type="text" id="at-phone"></div>
      <div class="field"><label class="lbl">Email</label><input type="email" id="at-email"></div>
      <div class="field"><label class="lbl">Vendor *</label>
        <select id="at-vendor"><option value="">-- select --</option>${activeVendors().map(v=>`<option value="${v.VendorID}">${esc(v.Name)}</option>`).join("")}</select>
      </div>
      <div class="field"><label class="lbl">Type *</label><select id="at-type"><option value="FT">Full-time</option><option value="FL">Freelancer</option></select></div>
      <div class="field full"><label class="lbl">Notes</label><textarea id="at-notes"></textarea></div>
    </div>
    <div class="form-actions"><button class="btn" onclick="submitAddTrainer()">Save</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>
    <div class="error-msg hidden" id="at-err"></div>`);
};
window.submitAddTrainer = async function() {
  const name=$("at-name").value.trim(), vendor=$("at-vendor").value;
  if(!name||!vendor){ $("at-err").textContent="Name and Vendor are required."; $("at-err").classList.remove("hidden"); return; }
  try {
    showLoading(true);
    const res=await apiCall({action:"addTrainer", Name:name, Phone:$("at-phone").value.trim(), Email:$("at-email").value.trim(), VendorID:vendor, Type:$("at-type").value, Notes:$("at-notes").value.trim(), StartDate:fmtToday()});
    await loadAll(); closeModal(); showToast("Trainer added."); nav("trainer-detail",{id:res.TrainerID});
  } catch(e){ $("at-err").textContent=e.message; $("at-err").classList.remove("hidden"); }
  showLoading(false);
};

window.showEditTrainer = function(tid) {
  const t=DB.trainers.find(x=>String(x.TrainerID)===String(tid)); if(!t) return;
  openModal(`<h2>Edit Trainer</h2>
    <div class="form-grid">
      <div class="field full"><label class="lbl">Name *</label><input type="text" id="et-name" value="${esc(t.Name)}"></div>
      <div class="field"><label class="lbl">Phone</label><input type="text" id="et-phone" value="${esc(t.Phone||"")}"></div>
      <div class="field"><label class="lbl">Email</label><input type="email" id="et-email" value="${esc(t.Email||"")}"></div>
      <div class="field full"><label class="lbl">Notes</label><textarea id="et-notes">${esc(t.Notes||"")}</textarea></div>
    </div>
    <div class="form-actions"><button class="btn" onclick="submitEditTrainer('${tid}')">Save</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>
    <div class="error-msg hidden" id="et-err"></div>`);
};
window.submitEditTrainer = async function(tid) {
  const name=$("et-name").value.trim();
  if(!name){ $("et-err").textContent="Name is required."; $("et-err").classList.remove("hidden"); return; }
  try {
    showLoading(true);
    await apiCall({action:"editTrainer", TrainerID:tid, Name:name, Phone:$("et-phone").value.trim(), Email:$("et-email").value.trim(), Notes:$("et-notes").value.trim()});
    await loadAll(); closeModal(); showToast("Updated."); nav("trainer-detail",{id:tid});
  } catch(e){ $("et-err").textContent=e.message; $("et-err").classList.remove("hidden"); }
  showLoading(false);
};

window.showChangeEngagement = function(tid) {
  openModal(`<h2>Change Vendor / Type</h2>
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px">The current engagement closes today and a new one opens.</p>
    <div class="form-grid">
      <div class="field"><label class="lbl">New Vendor *</label>
        <select id="ce-vendor"><option value="">-- select --</option>${activeVendors().map(v=>`<option value="${v.VendorID}">${esc(v.Name)}</option>`).join("")}</select>
      </div>
      <div class="field"><label class="lbl">Type *</label><select id="ce-type"><option value="FT">Full-time</option><option value="FL">Freelancer</option></select></div>
      <div class="field full"><label class="lbl">Start Date *</label><input type="date" id="ce-date" value="${fmtToday()}" max="${fmtToday()}"></div>
    </div>
    <div class="form-actions"><button class="btn" onclick="submitChangeEngagement('${tid}')">Save</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>
    <div class="error-msg hidden" id="ce-err"></div>`);
};
window.submitChangeEngagement = async function(tid) {
  const vendor=$("ce-vendor").value;
  if(!vendor){ $("ce-err").textContent="Vendor is required."; $("ce-err").classList.remove("hidden"); return; }
  try {
    showLoading(true);
    await apiCall({action:"addEngagement", TrainerID:tid, VendorID:vendor, Type:$("ce-type").value, StartDate:$("ce-date").value});
    await loadAll(); closeModal(); showToast("Updated."); nav("trainer-detail",{id:tid});
  } catch(e){ $("ce-err").textContent=e.message; $("ce-err").classList.remove("hidden"); }
  showLoading(false);
};
