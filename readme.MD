# TrainerTracker (PSG CAS)

A browser-based tool for tracking external trainers: which vendor they come from, their demo sessions, evaluator scores, final decisions (selected / backup / rejected), class feedback, and manual actions.

> **How to use this file with Claude:** paste this README at the start of a chat, then describe the change you want and paste only the file(s) that change touches (the "Where to look" table in section 9 tells you which). You should not need to paste the whole codebase.

---

## 1. Tech stack

| Item | Choice |
|---|---|
| Frontend | Plain HTML + CSS + vanilla JavaScript (no framework, no build step, no npm) |
| Scripts | Classic `<script>` tags (NOT ES modules), so everything shares the global scope |
| Database | Turso (hosted SQLite) called directly from the browser over its HTTP API (`/v2/pipeline`) |
| Font / styling | Montserrat via Google Fonts, hand-written CSS with CSS variables |
| Hosting | Any static host, or double-click `index.html` |

---

## 2. Folder structure

```
TrainerTracker/
├── index.html          Shell: sidebar <nav>, <main>, modal, toast, and one <script> line per module
├── config.js           TURSO_URL and TURSO_TOKEN (the only place secrets live)
├── common.js           Shared code: state, utils, Turso API, page registry, router, logic helpers
├── css/
│   └── styles.css      All styling (CSS variables at the top)
└── modules/
    ├── dashboard.js    Dashboard page
    ├── trainers.js     Trainer list, trainer detail, add/edit trainer, change vendor/type
    ├── active.js       Active Trainers page + CSV export
    ├── demos.js        Schedule demo, scheduled list, demo detail (evaluate + decide),
    │                   follow-ups (redo), evaluated list, edit demo/evaluation/decision modals
    ├── feedback.js     Add class feedback
    ├── actions.js      "Action Taken" (manual select/backup/remove) + history
    └── admin.js        Modules, Vendors, Evaluation Fields, Evaluators (list + add/edit modals)
```

**Script load order (in `index.html`) matters:** `config.js` → `common.js` → modules → `boot()`.
The order of the module `<script>` lines is also the order pages appear in the sidebar.

---

## 3. Architecture in one minute

1. **`boot()`** builds the sidebar from the registered pages and opens the dashboard.
2. **`nav(pageId, params)`** shows a shimmer, loads all data once, then calls that page's `render(main, params)`.
3. **Data model in memory:** one global object `DB` holds every table as an array (`DB.trainers`, `DB.demos`, …). It is loaded with a single request the first time and kept in memory.
4. **Pages are pure render functions:** they read from `DB`, build an HTML string, and assign it to `main.innerHTML`. Buttons call global functions through inline `onclick="..."`.
5. **Writes** go through `apiCall({action:"...", ...})`, which looks the action up in `ACTIONS` and runs SQL against Turso.
6. **After a write**, the code either calls `await loadAll()` (full reload, then re-render with `nav`) or updates `DB` locally and calls `refreshAll()` in the background.

There is no URL routing: refreshing the browser always returns to the Dashboard.

---

## 4. The module system (how to add things)

### 4.1 Registering a page

```js
registerPage({
  id: "reports",            // unique; used in nav('reports')
  title: "Reports",         // sidebar text
  section: "Records",       // sidebar group label (consecutive pages with the same section are grouped)
  hidden: false,            // true = reachable via nav() but not shown in the sidebar
  render(main, params) {    // main = <main> element, params = object passed to nav()
    main.innerHTML = `<h1>Reports</h1>`;
  }
});
```

### 4.2 Registering database actions

```js
registerActions({
  addThing: async p => ({ ThingID: await tRun("INSERT INTO Things (Name) VALUES (?)", [p.Name]) }),
  updateThing: async p => { await tRun("UPDATE Things SET Name=? WHERE ThingID=?", [p.Name, p.ThingID]); return {}; }
});
```
Call it with: `const res = await apiCall({ action: "addThing", Name: "x" });`

### 4.3 Checklist: adding a new module/feature

1. Create `modules/<name>.js`; call `registerPage(...)` (and `registerActions(...)` if it writes data).
2. Add `<script src="modules/<name>.js"></script>` to `index.html` (before `boot()`), in the position you want it in the sidebar.
3. If it needs a **new database table**, create it in Turso and add it to the `TABLES` map in `common.js` (key = `DB` property name in lowercase, value = table name). Also add an empty array for it in the initial `DB` object.
4. Any function used from an `onclick="..."` string **must be global**: define it as `window.myFn = function(){...}` (or a top-level `function`).

---

## 5. Shared helpers (all in `common.js`)

### Utilities
| Helper | Purpose |
|---|---|
| `$(id)` | `document.getElementById` |
| `esc(s)` | HTML-escape text (**always use for user data inside HTML strings**) |
| `fmt(date)` | `YYYY-MM-DD` → `DD-MM-YYYY` (returns `-` if empty) |
| `fmtToday()` | Today as `YYYY-MM-DD` |
| `isTrue(v)` | Safe boolean check for `true`/`"true"`/`"TRUE"` |
| `showLoading(bool)` | Full-screen spinner |
| `showToast(msg, ms)` | Small notification bottom-right |
| `openModal(html)` / `closeModal()` | Generic modal (`#modal-box`); clicking the overlay closes it |

### Data access
| Helper | Purpose |
|---|---|
| `tRun(sql, args)` | Run one statement, returns `last_insert_rowid` |
| `tTx([[sql,args],...])` | Run several statements atomically (BEGIN IMMEDIATE / COMMIT / ROLLBACK); returns the inserted id of each |
| `apiGet("all")` / `loadAll()` | Load every table into `DB` |
| `refreshAll()` | Same as `loadAll()` but silent, never blocks the UI |
| `apiCall(payload)` | Dispatch to a registered action |
| `activeModules()`, `activeVendors()`, `activeTrainers()`, `activeEvaluators()` | Filter by `Active` flag |
| `currentEngagement(trainerId)` | The open engagement (no `EndDate`) or `null` |
| `trainerName(id)`, `moduleName(id)`, `vendorName(id)`, `evaluatorName(id)` | ID → display name |
| `demoVendorId(demo)` / `demoVendorName(demo)` | Vendor the trainer belonged to **on the demo date** |

### Router
| Helper | Purpose |
|---|---|
| `registerPage`, `registerActions` | See section 4 |
| `nav(pageId, params)` | Navigate. e.g. `nav('trainer-detail', {id: 12})` |
| `buildNav()`, `boot()` | Called once at startup |

---

## 6. Database schema (as used by the code)

Column names are case-sensitive. IDs are integers (always compare with `String(a)===String(b)` in the JS because values come back as numbers or strings).

| Table | Columns |
|---|---|
| **Vendors** | VendorID, Name, ContactPerson, Phone, Email, Active |
| **Modules** | ModuleID, Name, Description, Active |
| **Fields** (evaluation criteria per module) | FieldID, ModuleID, Criterion, MinMarks, MaxMarks, DisplayOrder, Active |
| **Evaluators** | EvaluatorID, Name, Active |
| **Trainers** | TrainerID, Name, Phone, Email, Notes, Active, `"Trainer Profile"` (URL), `"Trainer Form"` (URL) |
| **Engagements** (vendor + type history) | TrainerID, VendorID, Type (`FT` full-time / `FL` freelancer), StartDate, EndDate (NULL/empty = current) |
| **Demos** | DemoID, TrainerID, ModuleID, Topic, DemoDate, Status, Outcome, Level, RejectScope, FinalRemarks, DecidedBy |
| **Evaluations** (one per evaluator per demo) | EvalID, DemoID, EvaluatorID, Remarks, SubmittedOn |
| **EvaluationScores** | EvalID, FieldID, Criterion, Score, MinAtTime, MaxAtTime (criterion text and limits are snapshotted at scoring time) |
| **Decisions** (the audit log that drives trainer status) | DecisionID, TrainerID, ModuleID (NULL = all modules), Level, Status, EffectiveDate, Reason, DemoID (set when it came from a demo), ActionType (`Action` / `Fresh start`), TakenBy |
| **Feedback** (class feedback) | FeedbackID, TrainerID, TrainingDate, Session, BatchDept, Feedback, Rating (1-5) |

`Active` is converted to a JavaScript boolean when rows are loaded (`1` → `true`).

---

## 7. Business rules and vocabulary

### 7.1 Demo lifecycle (`Demos.Status`)
`SCHEDULED` → (first evaluation submitted) → `EVALUATED` ("Awaiting decision") → (decision made) → `DECIDED`.
`CANCELLED` is a side exit from `SCHEDULED`; cancelled demos are hidden from the trainer page.
Multiple evaluators can score the same demo; scores are shown side by side with per-criterion averages.

### 7.2 Outcomes (`Demos.Outcome` and `Decisions.Status`)
| Value | Meaning |
|---|---|
| `SELECTED` | Approved as a trainer for the module |
| `BACKUP` | Approved as a backup only |
| `REJECTED` | Rejected, may present again |
| `REDO` | Must present again (appears in Follow-ups until a later decided demo exists for the same trainer + module) |
| `PERM_REJECT` | Permanent rejection. `RejectScope = MODULE` (this module only) or `PSG` (all modules; stored with `ModuleID = NULL`) |
| `REMOVED` | Manual removal via Action Taken |
| `FRESH_START` | Marker row: ignore every earlier decision for that trainer |

### 7.3 Levels
`UG`, `PG` or `ALL` (= both). Decisions are tracked per module **per level**.

### 7.4 How a trainer's status is computed (`common.js`)
- `trainerDecisions(trainerId)`: all decisions after the latest `FRESH_START`.
- `levelCells(decisions, modules)`: replays decisions in date order (then DecisionID) into a grid `module → {UG, PG}` holding the latest decision. A demo-based decision cannot overwrite a `PERM_REJECT`; only an Action Taken can.
- `approvedItems` / `backupItemsOf` / `rejectedModulesList` / `rejectedItemsOf`: read that grid.
- `trainerStatus`: returns `NONE`, `ACTIVE`, `PERM_REJECT_MODULES` or `PERM_REJECT_ALL`.
- Role shown on Active Trainers: PSG Rejected > Trainer (has any SELECTED) > Backup > Module Rejected > Pending.
- A trainer only appears in "Active Trainers" once they have at least one decision.

### 7.5 Vendor history
Changing vendor/type closes the current engagement (sets `EndDate`) and opens a new one in one transaction. The demo list shows the vendor the trainer had **on the demo date**, not today's vendor.

---

## 8. Pages and where they live

| Sidebar / page id | File | Main function |
|---|---|---|
| Dashboard `dashboard` | dashboard.js | `dashboard` |
| All Trainers `trainers` | trainers.js | `trainers` |
| Trainer detail `trainer-detail` (hidden) | trainers.js | `trainerDetail` |
| Active Trainers `active` | active.js | `active`, `exportActiveCSV` |
| Schedule Demo `schedule-demo` | demos.js | `scheduleDemoPage` |
| Scheduled Demos `scheduled` | demos.js | `scheduled` |
| Demo detail `demo-detail` (hidden; modes `evaluate`, `decide`, view) | demos.js | `demoDetail` |
| Evaluated Demos `evaluated` | demos.js | `evaluated` |
| Follow-ups (Redo) `followups` | demos.js | `followups` |
| Add Feedback `add-feedback` | feedback.js | `addFeedbackPage` |
| Action Taken `action-taken` | actions.js | `actionTakenPage` |
| Modules `modules` | admin.js | `modules` |
| Vendors `vendors` | admin.js | `vendors` |
| Evaluation Fields `fields` | admin.js | `fields` |
| Evaluators `evaluators` | admin.js | `evaluators` |

### Registered DB actions (by file)
- **trainers.js:** `addTrainer`, `editTrainer`, `addEngagement`
- **demos.js:** `scheduleDemo`, `editDemo`, `submitEvaluation`, `decideDemo`, `updateDecision`, `updateEvaluation`
- **feedback.js:** `addFeedback`
- **actions.js:** `recordAction`
- **admin.js:** `addVendor`, `addModule`, `addField`, `updateField`, `addEvaluator`, `updateEvaluator`

### Modal conventions
Each modal is a pair: `window.showXxx(...)` builds the form with `openModal(...)`, and `window.submitXxx(...)` validates, calls `apiCall`, runs `await loadAll()`, `closeModal()`, `showToast(...)`, then `nav(...)`. Input ids use a short prefix per modal (`at-` add trainer, `et-` edit trainer, `ce-` change engagement, `ed-` edit demo, `ee2-` edit evaluation, `ed2-` edit decision, `am-`/`av-`/`af-`/`ef-`/`ae-`/`ee-` admin modals).

---

## 9. Where to look for common changes

| I want to… | Touch |
|---|---|
| Change colours, fonts, spacing | `css/styles.css` (variables at the top) |
| Add a new page | New file in `modules/` + one script line in `index.html` |
| Add a field to trainers (e.g. Location) | DB column; `addTrainer`/`editTrainer` SQL (trainers.js); add/edit modals (trainers.js); optionally list/detail views |
| Add a new evaluation outcome | demos.js (`decide` form + `showEditDecision`), `common.js` (`demoBadge`, `demoStatusLabel`, `levelCells` logic), actions.js colour map, trainers.js status badges |
| Change how status is computed | `common.js` section 4 (logic helpers) |
| Add a new filter to a list | The page's render function + its filter `nav(...)` call (see `active()` or `evaluated()` as a pattern) |
| Add a dashboard stat or card | dashboard.js |
| Add a new table to the database | Create in Turso → `TABLES` and `DB` in `common.js` |
| Change the DB connection | `config.js` |

---

## 10. Conventions to follow (important when modifying)

1. **Keep it plain JS.** No frameworks, no imports/exports, no build tools. Everything global.
2. **Escape user text** with `esc()` inside template strings. (Known exception: see "Known issues".)
3. **Compare IDs as strings:** `String(a)===String(b)`.
4. **Dates are `YYYY-MM-DD` strings;** display them with `fmt()`.
5. **Multi-statement writes use `tTx`** so they are all-or-nothing.
6. **Reuse the existing CSS classes:** `.card`, `.card-head`, `.tbl-wrap`, `.btn` (`.ghost`, `.sm`, `.danger`), `.badge` (`.green .amber .red .blue .grey .purple .teal`), `.tag`, `.form-grid`, `.field`, `.lbl`, `.filters`, `.stats`, `.stat`, `.empty`, `.error-msg`, `.muted`, `.hidden`.
7. **Form pattern:** show errors in a `<div class="error-msg hidden" id="xx-err">`, call `showLoading(true)` before the API call and `showLoading(false)` after.
8. **Page pattern:** one `render(m, params)` function that sets `m.innerHTML`; no persistent state except `DB`.
9. Put a new module's DB actions, page, and modals **in the same file**; put anything used by 2+ modules in `common.js`.

---

## 11. Known issues / limitations

- **Security:** the Turso token lives in `config.js` and is readable by anyone who can load the site. Use a rotated token, and ideally put a small proxy (Cloudflare Worker / Vercel function) in front of Turso and keep the token there.
- **CSV export (active.js):** the "Email" column actually contains the phone number and the email is in the next column's slot (header/row mismatch). The header needs a "Phone" column added.
- **`submitEvaluation` ID lookup:** scores are linked using `SELECT MAX(EvalID) FROM Evaluations` inside the transaction. Safe for a single-user tool; could mis-link under heavy concurrent writes.
- **Unescaped value:** the "Decided by" `<option value="${e.Name}">` in the decide form (demos.js) is not passed through `esc()`; names with quotes would break it.
- **No URL routing:** browser refresh and the back button return to the Dashboard.
- **No authentication / roles:** anyone with the page can read and write.
- **Whole database loaded at startup:** fine for hundreds of rows; revisit if tables grow very large.

---

## 12. Prompt template for asking Claude to make a change

```
I have a plain-JS web app (README attached). 
Task: <describe the change in one or two sentences>
Relevant file(s): <e.g. modules/trainers.js>   (pasted below)
Rules: keep plain JavaScript (no frameworks/modules), reuse existing CSS classes and helpers, 
and give me only the changed functions or the full updated file.
<paste only the needed file(s)>
```

**Example:** "Add a `Location` field to trainers. I added a `Location` TEXT column in Turso. Update the add/edit trainer modals and SQL, and show it on the trainer detail header. Here is `modules/trainers.js`: …"
