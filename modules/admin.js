// modules/admin.js : Modules, Vendors, Evaluation Fields, Evaluators
registerPage({ id:"modules",    title:"Modules",           section:"Admin", render:(m)=>modules(m) });
registerPage({ id:"vendors",    title:"Vendors",           section:"Admin", render:(m)=>vendors(m) });
registerPage({ id:"fields",     title:"Evaluation Fields", section:"Admin", render:(m)=>fields(m) });
registerPage({ id:"evaluators", title:"Evaluators",        section:"Admin", render:(m)=>evaluators(m) });

registerActions({
  addVendor: async p => ({VendorID: await tRun(
    "INSERT INTO Vendors (Name,ContactPerson,Phone,Email,Active) VALUES (?,?,?,?,1)",
    [p.Name,p.ContactPerson,p.Phone,p.Email])}),
  addModule: async p => ({ModuleID: await tRun(
    "INSERT INTO Modules (Name,Description,Active) VALUES (?,?,1)",
    [p.Name,p.Description])}),
  addField: async p => ({FieldID: await tRun(
    "INSERT INTO Fields (ModuleID,Criterion,MinMarks,MaxMarks,DisplayOrder,Active) VALUES (?,?,?,?,?,1)",
    [p.ModuleID,p.Criterion,Number(p.MinMarks)||0,Number(p.MaxMarks)||10,Number(p.DisplayOrder)||1])}),
  updateField: async p => { await tRun(
    "UPDATE Fields SET Criterion=?,MinMarks=?,MaxMarks=?,DisplayOrder=?,Active=? WHERE FieldID=?",
    [p.Criterion,Number(p.MinMarks),Number(p.MaxMarks),Number(p.DisplayOrder),(p.Active===true||p.Active==="true")?1:0,p.FieldID]); return {}; },
  addEvaluator: async p => ({EvaluatorID: await tRun(
    "INSERT INTO Evaluators (Name,Active) VALUES (?,1)", [p.Name])}),
  updateEvaluator: async p => { await tRun(
    "UPDATE Evaluators SET Name=?,Active=? WHERE EvaluatorID=?",
    [p.Name,(p.Active===true||p.Active==="true")?1:0,p.EvaluatorID]); return {}; }
});

function modules(m) {
  m.innerHTML=`
    <div class="page-head"><div><h1>Modules</h1></div><button class="btn" onclick="showAddModule()">+ Add Module</button></div>
    <div class="card"><div class="tbl-wrap"><table>
      <tr><th>Name</th><th>Description</th><th>Active</th></tr>
      ${DB.modules.map(mod=>`<tr><td><b>${esc(mod.Name)}</b></td><td>${esc(mod.Description)}</td><td>${isTrue(mod.Active)?'<span class="badge green">Yes</span>':'<span class="badge grey">No</span>'}</td></tr>`).join("")||`<tr><td colspan="3" class="empty">No modules.</td></tr>`}
    </table></div></div>
  `;
}
function vendors(m) {
  m.innerHTML=`
    <div class="page-head"><div><h1>Vendors</h1></div><button class="btn" onclick="showAddVendor()">+ Add Vendor</button></div>
    <div class="card"><div class="tbl-wrap"><table>
      <tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th></tr>
      ${DB.vendors.map(v=>`<tr><td><b>${esc(v.Name)}</b></td><td>${esc(v.ContactPerson)}</td><td>${esc(v.Phone)}</td><td>${esc(v.Email)}</td></tr>`).join("")||`<tr><td colspan="4" class="empty">No vendors.</td></tr>`}
    </table></div></div>
  `;
}
function fields(m) {
  m.innerHTML=`
    <div class="page-head"><div><h1>Evaluation Fields</h1><div class="sub">Criteria used to score demos per module.</div></div><button class="btn" onclick="showAddField()">+ Add Field</button></div>
    ${DB.modules.map(mod=>{
      const modFields=DB.fields.filter(f=>String(f.ModuleID)===String(mod.ModuleID)).sort((a,b)=>Number(a.DisplayOrder)-Number(b.DisplayOrder));
      return `<div class="card"><div class="card-head"><h2>${esc(mod.Name)}</h2></div>
        ${modFields.length?`<div class="tbl-wrap"><table>
          <tr><th>Criterion</th><th>Min</th><th>Max</th><th>Order</th><th>Active</th><th></th></tr>
          ${modFields.map(f=>`<tr>
            <td>${esc(f.Criterion)}</td><td>${f.MinMarks}</td><td>${f.MaxMarks}</td><td>${f.DisplayOrder}</td>
            <td>${isTrue(f.Active)?'<span class="badge green">Yes</span>':'<span class="badge grey">No</span>'}</td>
            <td class="actions"><a href="#" onclick="showEditField('${f.FieldID}');return false;">Edit</a></td>
          </tr>`).join("")}
        </table></div>`:`<div class="empty">No fields for this module yet.</div>`}
      </div>`;
    }).join("")}
  `;
}
function evaluators(m) {
  m.innerHTML=`
    <div class="page-head"><div><h1>Evaluators</h1><div class="sub">People who evaluate trainer demos.</div></div><button class="btn" onclick="showAddEvaluator()">+ Add Evaluator</button></div>
    <div class="card"><div class="tbl-wrap"><table>
      <tr><th>Name</th><th>Active</th><th></th></tr>
      ${DB.evaluators.map(ev=>`<tr>
        <td><b>${esc(ev.Name)}</b></td>
        <td>${isTrue(ev.Active)?'<span class="badge green">Active</span>':'<span class="badge grey">Inactive</span>'}</td>
        <td class="actions"><a href="#" onclick="showEditEvaluator('${ev.EvaluatorID}');return false;">Edit</a></td>
      </tr>`).join("")||`<tr><td colspan="3" class="empty">No evaluators yet. Add one to get started.</td></tr>`}
    </table></div></div>
  `;
}

window.showAddModule = function() {
  openModal(`<h2>Add Module</h2>
    <div class="form-grid single">
      <div class="field"><label class="lbl">Name *</label><input type="text" id="am-name"></div>
      <div class="field"><label class="lbl">Description</label><input type="text" id="am-desc"></div>
    </div>
    <div class="form-actions"><button class="btn" onclick="submitAddModule()">Save</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>
    <div class="error-msg hidden" id="am-err"></div>`);
};
window.submitAddModule = async function() {
  const name=$("am-name").value.trim();
  if(!name){ $("am-err").textContent="Name is required."; $("am-err").classList.remove("hidden"); return; }
  try { showLoading(true); await apiCall({action:"addModule", Name:name, Description:$("am-desc").value.trim()}); await loadAll(); closeModal(); showToast("Module added."); nav("modules"); }
  catch(e){ $("am-err").textContent=e.message; $("am-err").classList.remove("hidden"); }
  showLoading(false);
};

window.showAddVendor = function() {
  openModal(`<h2>Add Vendor</h2>
    <div class="form-grid">
      <div class="field full"><label class="lbl">Name *</label><input type="text" id="av-name"></div>
      <div class="field"><label class="lbl">Contact Person</label><input type="text" id="av-contact"></div>
      <div class="field"><label class="lbl">Phone</label><input type="text" id="av-phone"></div>
      <div class="field full"><label class="lbl">Email</label><input type="email" id="av-email"></div>
    </div>
    <div class="form-actions"><button class="btn" onclick="submitAddVendor()">Save</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>
    <div class="error-msg hidden" id="av-err"></div>`);
};
window.submitAddVendor = async function() {
  const name=$("av-name").value.trim();
  if(!name){ $("av-err").textContent="Name is required."; $("av-err").classList.remove("hidden"); return; }
  try { showLoading(true); await apiCall({action:"addVendor", Name:name, ContactPerson:$("av-contact").value.trim(), Phone:$("av-phone").value.trim(), Email:$("av-email").value.trim()}); await loadAll(); closeModal(); showToast("Vendor added."); nav("vendors"); }
  catch(e){ $("av-err").textContent=e.message; $("av-err").classList.remove("hidden"); }
  showLoading(false);
};

window.showAddField = function() {
  openModal(`<h2>Add Evaluation Field</h2>
    <div class="form-grid">
      <div class="field full"><label class="lbl">Module *</label>
        <select id="af-module"><option value="">-- select --</option>${DB.modules.map(mod=>`<option value="${mod.ModuleID}">${esc(mod.Name)}</option>`).join("")}</select>
      </div>
      <div class="field full"><label class="lbl">Criterion *</label><input type="text" id="af-crit" placeholder="e.g. Communication"></div>
      <div class="field"><label class="lbl">Min Marks</label><input type="number" id="af-min" value="0" min="0"></div>
      <div class="field"><label class="lbl">Max Marks</label><input type="number" id="af-max" value="10" min="1"></div>
      <div class="field"><label class="lbl">Display Order</label><input type="number" id="af-order" value="1" min="1"></div>
    </div>
    <div class="form-actions"><button class="btn" onclick="submitAddField()">Save</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>
    <div class="error-msg hidden" id="af-err"></div>`);
};
window.submitAddField = async function() {
  const module=$("af-module").value, crit=$("af-crit").value.trim();
  if(!module||!crit){ $("af-err").textContent="Module and Criterion are required."; $("af-err").classList.remove("hidden"); return; }
  try { showLoading(true); await apiCall({action:"addField", ModuleID:module, Criterion:crit, MinMarks:Number($("af-min").value)||0, MaxMarks:Number($("af-max").value)||10, DisplayOrder:Number($("af-order").value)||1}); await loadAll(); closeModal(); showToast("Field added."); nav("fields"); }
  catch(e){ $("af-err").textContent=e.message; $("af-err").classList.remove("hidden"); }
  showLoading(false);
};

window.showEditField = function(fid) {
  const f=DB.fields.find(x=>String(x.FieldID)===String(fid)); if(!f) return;
  openModal(`<h2>Edit Field</h2>
    <div class="form-grid">
      <div class="field full"><label class="lbl">Criterion *</label><input type="text" id="ef-crit" value="${esc(f.Criterion)}"></div>
      <div class="field"><label class="lbl">Min Marks</label><input type="number" id="ef-min" value="${f.MinMarks}"></div>
      <div class="field"><label class="lbl">Max Marks</label><input type="number" id="ef-max" value="${f.MaxMarks}"></div>
      <div class="field"><label class="lbl">Display Order</label><input type="number" id="ef-order" value="${f.DisplayOrder}"></div>
      <div class="field"><label class="lbl">Active</label><select id="ef-active"><option value="true" ${isTrue(f.Active)?"selected":""}>Yes</option><option value="false" ${!isTrue(f.Active)?"selected":""}>No</option></select></div>
    </div>
    <div class="form-actions"><button class="btn" onclick="submitEditField('${fid}')">Save</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>
    <div class="error-msg hidden" id="ef-err"></div>`);
};
window.submitEditField = async function(fid) {
  const crit=$("ef-crit").value.trim();
  if(!crit){ $("ef-err").textContent="Criterion is required."; $("ef-err").classList.remove("hidden"); return; }
  try { showLoading(true); await apiCall({action:"updateField", FieldID:fid, Criterion:crit, MinMarks:Number($("ef-min").value), MaxMarks:Number($("ef-max").value), DisplayOrder:Number($("ef-order").value), Active:$("ef-active").value==="true"}); await loadAll(); closeModal(); showToast("Field updated."); nav("fields"); }
  catch(e){ $("ef-err").textContent=e.message; $("ef-err").classList.remove("hidden"); }
  showLoading(false);
};

window.showAddEvaluator = function() {
  openModal(`<h2>Add Evaluator</h2>
    <div class="form-grid single">
      <div class="field"><label class="lbl">Name *</label><input type="text" id="ae-name"></div>
    </div>
    <div class="form-actions"><button class="btn" onclick="submitAddEvaluator()">Save</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>
    <div class="error-msg hidden" id="ae-err"></div>`);
};
window.submitAddEvaluator = async function() {
  const name=$("ae-name").value.trim();
  if(!name){ $("ae-err").textContent="Name is required."; $("ae-err").classList.remove("hidden"); return; }
  try { showLoading(true); await apiCall({action:"addEvaluator", Name:name}); await loadAll(); closeModal(); showToast("Evaluator added."); nav("evaluators"); }
  catch(e){ $("ae-err").textContent=e.message; $("ae-err").classList.remove("hidden"); }
  showLoading(false);
};

window.showEditEvaluator = function(eid) {
  const ev=DB.evaluators.find(x=>String(x.EvaluatorID)===String(eid)); if(!ev) return;
  openModal(`<h2>Edit Evaluator</h2>
    <div class="form-grid single">
      <div class="field"><label class="lbl">Name *</label><input type="text" id="ee-name" value="${esc(ev.Name)}"></div>
      <div class="field"><label class="lbl">Active</label><select id="ee-active"><option value="true" ${isTrue(ev.Active)?"selected":""}>Active</option><option value="false" ${!isTrue(ev.Active)?"selected":""}>Inactive</option></select></div>
    </div>
    <div class="form-actions"><button class="btn" onclick="submitEditEvaluator('${eid}')">Save</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>
    <div class="error-msg hidden" id="ee-err"></div>`);
};
window.submitEditEvaluator = async function(eid) {
  const name=$("ee-name").value.trim();
  if(!name){ $("ee-err").textContent="Name is required."; $("ee-err").classList.remove("hidden"); return; }
  try { showLoading(true); await apiCall({action:"updateEvaluator", EvaluatorID:eid, Name:name, Active:$("ee-active").value==="true"}); await loadAll(); closeModal(); showToast("Updated."); nav("evaluators"); }
  catch(e){ $("ee-err").textContent=e.message; $("ee-err").classList.remove("hidden"); }
  showLoading(false);
};
