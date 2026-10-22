// ============================================================
// TrainerTracker — Apps Script API v3
// ALL calls are GET (no POST, no CORS preflight).
// Deploy: Execute as Me, Who has access: Anyone
// After ANY code change: Manage Deployments → New Version
// ============================================================

var SS = SpreadsheetApp.getActiveSpreadsheet();

// ── sheet helpers ────────────────────────────────────────────
function sheet(name) { return SS.getSheetByName(name); }

function sheetRows(name) {
  var s = sheet(name);
  if (!s) return [];
  var lastRow = s.getLastRow();
  var lastCol = s.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var data = s.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function nextId(sheetName, idCol) {
  var rows = sheetRows(sheetName);
  if (!rows.length) return 1;
  var ids = rows.map(function(r) { return Number(r[idCol]) || 0; });
  return Math.max.apply(null, ids) + 1;
}

function appendRow(sheetName, obj) {
  var s = sheet(sheetName);
  var headers = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  var row = headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ""; });
  s.appendRow(row);
}

function updateRow(sheetName, idCol, idVal, obj) {
  var s = sheet(sheetName);
  var lastRow = s.getLastRow();
  var lastCol = s.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return false;
  var data = s.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0];
  var idIdx = headers.indexOf(idCol);
  var colsToUpdate = [];
  headers.forEach(function(h, j) { if (obj[h] !== undefined) colsToUpdate.push({j:j, h:h}); });
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === String(idVal)) {
      if (colsToUpdate.length > 0) {
        var vals = colsToUpdate.map(function(c) { return [obj[c.h]]; });
        var ranges = colsToUpdate.map(function(c) { return s.getRange(i+1, c.j+1, 1, 1); });
        // Batch all updates in one flush
        colsToUpdate.forEach(function(c) { data[i][c.j] = obj[c.h]; });
        s.getRange(i+1, 1, 1, lastCol).setValues([data[i]]);
      }
      return true;
    }
  }
  return false;
}

function log(user, action, details) {
  var s = sheet("Log");
  if (!s) return;
  s.appendRow([new Date(), user || "unknown", action, details || ""]);
}

function jsonOk(data) {
  return ContentService.createTextOutput(JSON.stringify({ok:true, data:data}))
    .setMimeType(ContentService.MimeType.JSON);
}
function jsonErr(msg) {
  return ContentService.createTextOutput(JSON.stringify({ok:false, error:msg}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET router ───────────────────────────────────────────────
function doGet(e) {
  try {
    var p = e.parameter;
    var action = p.action || "";

    // reads
    if (action === "vendors")          return jsonOk(sheetRows("Vendors"));
    if (action === "modules")          return jsonOk(sheetRows("Modules"));
    if (action === "fields")           return jsonOk(sheetRows("Fields"));
    if (action === "trainers")         return jsonOk(sheetRows("Trainers"));
    if (action === "engagements")      return jsonOk(sheetRows("Engagements"));
    if (action === "demos")            return jsonOk(sheetRows("Demos"));
    if (action === "evaluators")       return jsonOk(sheetRows("Evaluators"));
    if (action === "evaluations")      return jsonOk(sheetRows("Evaluations"));
    if (action === "evaluationscores") return jsonOk(sheetRows("EvaluationScores"));
    if (action === "decisions")        return jsonOk(sheetRows("Decisions"));
    if (action === "feedback")         return jsonOk(sheetRows("Feedback"));

    if (action === "all") return jsonOk({
      vendors:          sheetRows("Vendors"),
      modules:          sheetRows("Modules"),
      fields:           sheetRows("Fields"),
      evaluators:       sheetRows("Evaluators"),
      trainers:         sheetRows("Trainers"),
      engagements:      sheetRows("Engagements"),
      demos:            sheetRows("Demos"),
      evaluations:      sheetRows("Evaluations"),
      evaluationscores: sheetRows("EvaluationScores"),
      decisions:        sheetRows("Decisions"),
      feedback:         sheetRows("Feedback")
    });

    // writes
    if (action === "addVendor")        return addVendor(p);
    if (action === "addModule")        return addModule(p);
    if (action === "addField")         return addField(p);
    if (action === "updateField")      return editField(p);
    if (action === "addEvaluator")     return addEvaluator(p);
    if (action === "updateEvaluator")  return updateEvaluator(p);
    if (action === "addTrainer")       return addTrainer(p);
    if (action === "editTrainer")      return editTrainer(p);
    if (action === "addEngagement")    return addEngagement(p);
    if (action === "scheduleDemo")     return scheduleDemo(p);
    if (action === "submitEvaluation") return submitEvaluation(p);
    if (action === "decideDemo")       return decideDemo(p);
    if (action === "addFeedback")      return addFeedback(p);
    if (action === "addDecision")      return addDecision(p);
    if (action === "editDemo") return editDemo(p);

    return jsonErr("Unknown action: " + action);
  } catch(err) {
    return jsonErr(err.message);
  }
}

// ════════════════════════════════════════════════════════════
// Write handlers
// ════════════════════════════════════════════════════════════

function addVendor(p) {
  var id = nextId("Vendors", "VendorID");
  appendRow("Vendors", { VendorID:id, Name:p.Name, ContactPerson:p.ContactPerson||"", Phone:p.Phone||"", Email:p.Email||"", Active:true });
  log(p.user, "addVendor", p.Name);
  return jsonOk({ VendorID: id });
}

function addModule(p) {
  var id = nextId("Modules", "ModuleID");
  appendRow("Modules", { ModuleID:id, Name:p.Name, Description:p.Description||"", Active:true });
  log(p.user, "addModule", p.Name);
  return jsonOk({ ModuleID: id });
}

function addField(p) {
  var id = nextId("Fields", "FieldID");
  appendRow("Fields", { FieldID:id, ModuleID:p.ModuleID, Criterion:p.Criterion, MinMarks:Number(p.MinMarks)||0, MaxMarks:Number(p.MaxMarks)||10, DisplayOrder:Number(p.DisplayOrder)||1, Active:true });
  log(p.user, "addField", p.Criterion);
  return jsonOk({ FieldID: id });
}

function editField(p) {
  updateRow("Fields", "FieldID", p.FieldID, {
    Criterion:p.Criterion, MinMarks:Number(p.MinMarks), MaxMarks:Number(p.MaxMarks),
    DisplayOrder:Number(p.DisplayOrder), Active: p.Active === "true" || p.Active === true
  });
  log(p.user, "editField", "ID="+p.FieldID);
  return jsonOk({});
}

function addEvaluator(p) {
  var id = nextId("Evaluators", "EvaluatorID");
  appendRow("Evaluators", { EvaluatorID:id, Name:p.Name, Active:true });
  log(p.user, "addEvaluator", p.Name);
  return jsonOk({ EvaluatorID: id });
}

function updateEvaluator(p) {
  updateRow("Evaluators", "EvaluatorID", p.EvaluatorID, {
    Name: p.Name,
    Active: p.Active === "true" || p.Active === true
  });
  log(p.user, "updateEvaluator", "ID="+p.EvaluatorID);
  return jsonOk({});
}

function addTrainer(p) {
  var id = nextId("Trainers", "TrainerID");
  appendRow("Trainers", { TrainerID:id, Name:p.Name, Phone:p.Phone||"", Email:p.Email||"", Notes:p.Notes||"", Active:true });
  var eid = nextId("Engagements", "EngagementID");
  appendRow("Engagements", { EngagementID:eid, TrainerID:id, VendorID:p.VendorID, Type:p.Type, StartDate:p.StartDate||fmtDate(new Date()), EndDate:"" });
  log(p.user, "addTrainer", p.Name);
  return jsonOk({ TrainerID: id, EngagementID: eid });
}

function editTrainer(p) {
  updateRow("Trainers", "TrainerID", p.TrainerID, { Name:p.Name, Phone:p.Phone||"", Email:p.Email||"", Notes:p.Notes||"" });
  log(p.user, "editTrainer", "ID="+p.TrainerID);
  return jsonOk({});
}

function addEngagement(p) {
  var engs = sheetRows("Engagements");
  engs.forEach(function(e) {
    if (String(e.TrainerID) === String(p.TrainerID) && (!e.EndDate || e.EndDate === "")) {
      updateRow("Engagements", "EngagementID", e.EngagementID, { EndDate: p.StartDate });
    }
  });
  var id = nextId("Engagements", "EngagementID");
  appendRow("Engagements", { EngagementID:id, TrainerID:p.TrainerID, VendorID:p.VendorID, Type:p.Type, StartDate:p.StartDate, EndDate:"" });
  log(p.user, "addEngagement", "Trainer="+p.TrainerID);
  return jsonOk({ EngagementID: id });
}

// Schedule a demo — no scores yet, Status = SCHEDULED
function scheduleDemo(p) {
  var id = nextId("Demos", "DemoID");
  appendRow("Demos", {
    DemoID:       id,
    TrainerID:    p.TrainerID,
    ModuleID:     p.ModuleID,
    Topic:        p.Topic || "",
    DemoDate:     p.DemoDate,
    Status:       "SCHEDULED",
    Outcome:      "",
    Level:        "",
    RejectScope:  "",
    FinalRemarks: "",
    DecidedBy:    ""
  });
  log(p.user, "scheduleDemo", "DemoID="+id+" Trainer="+p.TrainerID);
  return jsonOk({ DemoID: id });
}

function editDemo(p) {
  var updates = { Topic: p.Topic, DemoDate: p.DemoDate, ModuleID: p.ModuleID };
  if (p.Status === "CANCELLED") updates.Status = "CANCELLED";
  updateRow("Demos", "DemoID", p.DemoID, updates);
  log(p.user, "editDemo", "DemoID="+p.DemoID);
  return jsonOk({});
}

// Evaluator submits their scores for a demo
function submitEvaluation(p) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var evalId = nextId("Evaluations", "EvalID");
    appendRow("Evaluations", {
      EvalID:       evalId,
      DemoID:       p.DemoID,
      EvaluatorID:  p.EvaluatorID,
      Remarks:      p.Remarks || "",
      SubmittedOn:  fmtDate(new Date())
    });

    var scores = p.Scores ? JSON.parse(p.Scores) : [];
    var sid = nextId("EvaluationScores", "ScoreID");
    scores.forEach(function(sc) {
      appendRow("EvaluationScores", {
        ScoreID:   sid++,
        EvalID:    evalId,
        FieldID:   sc.FieldID,
        Criterion: sc.Criterion,
        Score:     Number(sc.Score) || 0,
        MinAtTime: Number(sc.MinAtTime) || 0,
        MaxAtTime: Number(sc.MaxAtTime) || 0
      });
    });

    // Move demo status to EVALUATED if still SCHEDULED
    var demos = sheetRows("Demos");
    var demo = demos.find(function(d) { return String(d.DemoID) === String(p.DemoID); });
    if (demo && demo.Status === "SCHEDULED") {
      updateRow("Demos", "DemoID", p.DemoID, { Status: "EVALUATED" });
    }

    log(p.user, "submitEvaluation", "EvalID="+evalId+" DemoID="+p.DemoID);
    return jsonOk({ EvalID: evalId });
  } finally {
    lock.releaseLock();
  }
}

// Coordinator sets the final outcome
function decideDemo(p) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    updateRow("Demos", "DemoID", p.DemoID, {
      Status:       "DECIDED",
      Outcome:      p.Outcome,
      Level:        p.Level || "ALL",
      RejectScope:  p.RejectScope || "",
      FinalRemarks: p.FinalRemarks || "",
      DecidedBy:    p.DecidedBy || ""
    });

    // Create a decision row (same as before)
    var demos = sheetRows("Demos");
    var demo = demos.find(function(d) { return String(d.DemoID) === String(p.DemoID); });
    if (demo) {
      var decId = nextId("Decisions", "DecisionID");
      var moduleId = (p.Outcome === "PERM_REJECT" && p.RejectScope === "PSG") ? "" : demo.ModuleID;
      appendRow("Decisions", {
        DecisionID:    decId,
        TrainerID:     demo.TrainerID,
        ModuleID:      moduleId,
        Level:         p.Level || "ALL",
        Status:        p.Outcome,
        EffectiveDate: demo.DemoDate,
        Reason:        p.FinalRemarks || "",
        DemoID:        p.DemoID
      });
    }

    log(p.user, "decideDemo", "DemoID="+p.DemoID+" Outcome="+p.Outcome);
    return jsonOk({});
  } finally {
    lock.releaseLock();
  }
}

function addFeedback(p) {
  var id = nextId("Feedback", "FeedbackID");
  appendRow("Feedback", { FeedbackID:id, TrainerID:p.TrainerID, TrainingDate:p.TrainingDate, Session:p.Session||"", BatchDept:p.BatchDept||"", Feedback:p.Feedback, Rating:p.Rating||"" });
  log(p.user, "addFeedback", "Trainer="+p.TrainerID);
  return jsonOk({ FeedbackID: id });
}

function addDecision(p) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var id = nextId("Decisions", "DecisionID");
    appendRow("Decisions", { DecisionID:id, TrainerID:p.TrainerID, ModuleID:p.ModuleID||"", Level:p.Level||"ALL", Status:p.Status, EffectiveDate:p.EffectiveDate, Reason:p.Reason||"", DemoID:"" });
    log(p.user, "addDecision", "Trainer="+p.TrainerID+" Status="+p.Status);
    return jsonOk({ DecisionID: id });
  } finally {
    lock.releaseLock();
  }
}

function fmtDate(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth()+1).padStart(2,"0");
  var dd = String(d.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+dd;
}

// ════════════════════════════════════════════════════════════
// One-time setup — run ONCE from Apps Script editor
// ════════════════════════════════════════════════════════════
function setupSheets() {
  var defs = {
    "Vendors":          ["VendorID","Name","ContactPerson","Phone","Email","Active"],
    "Modules":          ["ModuleID","Name","Description","Active"],
    "Fields":           ["FieldID","ModuleID","Criterion","MinMarks","MaxMarks","DisplayOrder","Active"],
    "Evaluators":       ["EvaluatorID","Name","Active"],
    "Trainers":         ["TrainerID","Name","Phone","Email","Notes","Active"],
    "Engagements":      ["EngagementID","TrainerID","VendorID","Type","StartDate","EndDate"],
    "Demos":            ["DemoID","TrainerID","ModuleID","Topic","DemoDate","Status","Outcome","Level","RejectScope","FinalRemarks","DecidedBy"],
    "Evaluations":      ["EvalID","DemoID","EvaluatorID","Remarks","SubmittedOn"],
    "EvaluationScores": ["ScoreID","EvalID","FieldID","Criterion","Score","MinAtTime","MaxAtTime"],
    "Decisions":        ["DecisionID","TrainerID","ModuleID","Level","Status","EffectiveDate","Reason","DemoID"],
    "Feedback":         ["FeedbackID","TrainerID","TrainingDate","Session","BatchDept","Feedback","Rating"],
    "Log":              ["Timestamp","UserEmail","Action","Details"]
  };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(defs).forEach(function(name) {
    var s = ss.getSheetByName(name);
    if (!s) s = ss.insertSheet(name);
    if (s.getRange(1,1).getValue() === "") {
      s.getRange(1,1,1,defs[name].length).setValues([defs[name]]);
      s.getRange(1,1,1,defs[name].length).setFontWeight("bold");
    }
  });
  Logger.log("Setup complete. All 12 sheets are ready.");
}

function keepAlive() {
  Logger.log("ping " + new Date());
}
