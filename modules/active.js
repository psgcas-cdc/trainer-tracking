// modules/active.js : Active Trainers (with Backup) + CSV export
registerPage({ id:"active", title:"Active Trainers", section:"Trainers", render:(m,p)=>active(m,p) });

let ACTIVE_ROWS=[];

function active(m, params={}) {
  const mods=activeModules();
  const roleFilter=params.role||"both";
  const vendorFilter=params.vendor||"";
  const moduleFilter=params.module||"";
  const typeFilter=params.type||"";
  const rows=[];

  activeTrainers().forEach(t=>{
    const eng=currentEngagement(t.TrainerID);
    const dec=trainerDecisions(t.TrainerID);
    const status=trainerStatus(dec,mods);
    if(status==="NONE") return;

    const sel=approvedItems(dec,mods);
    const bk=backupItemsOf(dec,mods);

    let role,badge;
    if(status==="PERM_REJECT_ALL"){ role="PSG Rejected"; badge="red"; }
    else if(sel.length){ role="Trainer"; badge="green"; }
    else if(bk.length){ role="Backup"; badge="teal"; }
    else if(status==="PERM_REJECT_MODULES"){ role="Module Rejected"; badge="amber"; }
    else { role="Pending"; badge="grey"; }

    const match =
      roleFilter==="both"    ? ((role==="Trainer"||role==="Backup")&&eng) :
      roleFilter==="trainer" ? (role==="Trainer"&&eng) :
      roleFilter==="backup"  ? (bk.length>0&&status!=="PERM_REJECT_ALL"&&eng) :
      roleFilter==="psg"     ? status==="PERM_REJECT_ALL" :
      roleFilter==="module"  ? status==="PERM_REJECT_MODULES" :
      true;
    if(!match) return;
    if(vendorFilter&&eng&&String(eng.VendorID)!==vendorFilter) return;
    if(typeFilter&&eng&&eng.Type!==typeFilter) return;
    if(moduleFilter){
      const pool = roleFilter==="trainer" ? sel : roleFilter==="backup" ? bk : sel.concat(bk);
      if(!pool.some(i=>String(i.module.ModuleID)===moduleFilter)) return;
    }
    rows.push({t,eng,role,badge,selTags:approvalTags(sel),bkTags:approvalTags(bk),rejMods:rejectedItemsOf(dec,mods,status)});
  });
  ACTIVE_ROWS=rows;

  m.innerHTML=`
    <div class="page-head">
      <div><h1>Active Trainers</h1><div class="sub">${rows.length} result${rows.length!==1?"s":""}</div></div>
      <button class="btn ghost sm" onclick="exportActiveCSV()">Download CSV</button>
    </div>
    <div class="filters">
      <label>Role<select id="f-role">
        <option value="both" ${roleFilter==="both"?"selected":""}>Trainers &amp; Backups</option>
        <option value="trainer" ${roleFilter==="trainer"?"selected":""}>Trainers only</option>
        <option value="backup" ${roleFilter==="backup"?"selected":""}>Backups (any module)</option>
        <option value="psg" ${roleFilter==="psg"?"selected":""}>PSG Rejected</option>
        <option value="module" ${roleFilter==="module"?"selected":""}>Module Rejected</option>
        <option value="all" ${roleFilter==="all"?"selected":""}>All (with a demo result)</option>
      </select></label>
      <label>Vendor<select id="f-vendor"><option value="">All</option>${DB.vendors.map(v=>`<option value="${v.VendorID}" ${vendorFilter==String(v.VendorID)?"selected":""}>${esc(v.Name)}</option>`).join("")}</select></label>
      <label>Module<select id="f-module"><option value="">All</option>${mods.map(mod=>`<option value="${mod.ModuleID}" ${moduleFilter==String(mod.ModuleID)?"selected":""}>${esc(mod.Name)}</option>`).join("")}</select></label>
      <label>Type<select id="f-type"><option value="">All</option><option value="FT" ${typeFilter==="FT"?"selected":""}>Full-time</option><option value="FL" ${typeFilter==="FL"?"selected":""}>Freelancer</option></select></label>
      <button class="btn" onclick="nav('active',{role:$('f-role').value,vendor:$('f-vendor').value,module:$('f-module').value,type:$('f-type').value})">Filter</button>
      <a class="btn ghost" href="#" onclick="nav('active');return false;">Clear</a>
    </div>
    <div class="card"><div class="tbl-wrap"><table>
      <tr><th>Trainer</th><th>Vendor</th><th>Type</th><th>Role</th><th>Approved modules</th><th>Backup modules</th><th>Rejected modules</th></tr>
      ${rows.map(({t,eng,role,badge,selTags,bkTags,rejMods})=>`<tr>
          <td><a href="#" onclick="nav('trainer-detail',{id:'${t.TrainerID}'});return false;"><b>${esc(t.Name)}</b></a></td>
          <td>${eng?esc(vendorName(eng.VendorID)):"-"}</td>
          <td>${eng?(eng.Type==="FT"?"Full-time":"Freelancer"):"-"}</td>
          <td><span class="badge ${badge}">${role}</span></td>
          <td>${selTags.map(tg=>`<span class="tag">${esc(tg)}</span>`).join("")||'<span class="muted">-</span>'}</td>
          <td>${bkTags.map(tg=>`<span class="tag">${esc(tg)}</span>`).join("")||'<span class="muted">-</span>'}</td>
          <td>${rejMods.map(mm=>`<span class="tag">${esc(mm.Name)}</span>`).join("")||'<span class="muted">-</span>'}</td>
        </tr>`).join("")||`<tr><td colspan="7" class="empty">No trainers match this filter.</td></tr>`}
    </table></div></div>
  `;
}

window.exportActiveCSV = function() {
  const rows=[["Trainer","Email","Vendor","Type","Role","Approved modules","Backup modules","Rejected modules"]];
  ACTIVE_ROWS.forEach(({t,eng,role,selTags,bkTags,rejMods})=>{
    rows.push([t.Name,t.Phone||"",t.Email||"",
      eng?vendorName(eng.VendorID):"",
      eng?(eng.Type==="FT"?"Full-time":"Freelancer"):"",
      role,selTags.join("; "),bkTags.join("; "),rejMods.map(mm=>mm.Name).join("; ")]);
  });
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
  a.download="active_trainers.csv"; a.click();
};
