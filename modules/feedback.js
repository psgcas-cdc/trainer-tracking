// modules/feedback.js : class feedback form
registerPage({ id:"add-feedback", title:"Add Feedback", section:"Records", render:(m,p)=>addFeedbackPage(m,p) });

registerActions({
  addFeedback: async p => ({FeedbackID: await tRun(
    "INSERT INTO Feedback (TrainerID,TrainingDate,Session,BatchDept,Feedback,Rating) VALUES (?,?,?,?,?,?)",
    [p.TrainerID,p.TrainingDate,p.Session,p.BatchDept,p.Feedback,p.Rating])})
});

function addFeedbackPage(m, params={}) {
  const preTrainer=String(params.trainerID||"");
  m.innerHTML=`
    <div class="page-head"><div><h1>Add Class Feedback</h1></div></div>
    <div class="card">
      <div class="form-grid">
        <div class="field"><label class="lbl">Trainer *</label>
          <select id="fb-trainer"><option value="">-- select --</option>${activeTrainers().map(t=>`<option value="${t.TrainerID}" ${String(t.TrainerID)===preTrainer?"selected":""}>${esc(t.Name)}</option>`).join("")}</select>
        </div>
        <div class="field"><label class="lbl">Training Date *</label><input type="date" id="fb-date" value="${fmtToday()}" max="${fmtToday()}"></div>
        <div class="field"><label class="lbl">Session / Time</label><input type="text" id="fb-session" placeholder="e.g. Morning, 9am-11am"></div>
        <div class="field"><label class="lbl">Batch / Department</label><input type="text" id="fb-batch"></div>
        <div class="field"><label class="lbl">Rating (1-5)</label><select id="fb-rating"><option value="">-</option>${[1,2,3,4,5].map(i=>`<option value="${i}">${i}</option>`).join("")}</select></div>
        <div class="field full"><label class="lbl">Feedback *</label><textarea id="fb-text" rows="4"></textarea></div>
      </div>
      <div class="form-actions">
        <button class="btn" onclick="submitFeedback()">Save Feedback</button>
        <button class="btn ghost" onclick="nav('trainers')">Cancel</button>
      </div>
      <div class="error-msg hidden" id="fb-err"></div>
    </div>
  `;
}

window.submitFeedback = async function() {
  const trainer=$("fb-trainer").value, text=$("fb-text").value.trim(), errEl=$("fb-err");
  if(!trainer||!text){ errEl.textContent="Trainer and Feedback are required."; errEl.classList.remove("hidden"); return; }
  try {
    showLoading(true);
    const row = {TrainerID:trainer, TrainingDate:$("fb-date").value, Session:$("fb-session").value, BatchDept:$("fb-batch").value, Feedback:text, Rating:$("fb-rating").value};
    const res = await apiCall(Object.assign({action:"addFeedback"}, row));
    DB.feedback.push(Object.assign({FeedbackID:res.FeedbackID}, row));
    showToast("Feedback saved."); nav("trainer-detail",{id:trainer}); refreshAll();
  } catch(e){ errEl.textContent=e.message; errEl.classList.remove("hidden"); }
  showLoading(false);
};
