# Hardcoded Policy Decisions in NUWorkspace

Reference catalog of business rules, security gates, retention windows, and
operational thresholds baked into the application code. Useful for:

- Knowing where to change a value if policy shifts
- CMMC documentation (auditors love seeing policy decisions enumerated)
- Onboarding future developers (these are not in the database — they are in code)

Last refreshed: May 13, 2026, based on current uploads + project snapshot.

---

## 1. Identity & Access

| Decision | Value | Location | Notes |
|---|---|---|---|
| View-As (admin impersonation) allow-list | `['rmcadoo@nulabs.com']` | `auth.js` `VIEW_AS_ALLOWED_EMAILS` | Russ only. Add Jordan/Ragen here later. |
| Closing Report final approver | `'Jordan McAdoo'` (name match) | `reports.js:1713`, `project-detail.js:518` | Hardcoded by `currentEmployee.name`. If Jordan's display name ever changes, this breaks. |
| Owner exclusion from billing reports | `['Russ McAdoo', 'Jordan McAdoo']` | `reports.js:293`, `reports.js:490` | `EXCLUDED_NAMES` constant — owners not counted in employee-billing rollups. Same name-match brittleness. |
| Linda's UUID for billing/approver routing | `cc75ba64-df6e-4d3d-9e12-e6c1c13b2c5f` | (per project memory) | Used in places that need to route to Linda specifically. UUID is stable; renaming Linda doesn't break anything here. |
| Historical Import "former employee" catch-all | `aaaaaaaa-0000-0000-0000-000000000001` | `admin.js:1547`, multiple | Synthetic employee ID for legacy timesheet imports where the original employee is no longer with the company. |
| Russ's name as fallback in feedback module | `'Russ McAdoo'` | `feedback.js:406` | Used as `from_name` if the lookup of Russ's employee record fails. Cosmetic. |
| Survey email sender identity | FROM: `'Scott Seip — NU Laboratories <survey@mail.nulabs.com>'`; signature fallback: `sigName='Scott Seip'`, `sigEmail='sseip@nulabs.com'`, `sigTitle='Lab Manager'` | `survey-send/index.ts` `FROM_ADDR` + `renderInvitation()` | Hardcoded sender. Templates can override the signature block via `signature_emp_id`, but the FROM address is fixed. Brittle if Scott changes role or leaves. See §9.6. |

---

## 2. Time-Based Policies & Retention

| Decision | Value | Location | Notes |
|---|---|---|---|
| Notification prune window (read items only) | **45 days** | `chatter.js` (loadNotifs prune block) | Just added. Unread notifications never expire. |
| HR rolling counter window (incidents, attendance, vacation shortage) | **12 months** | `employees.js:2980+`, `_hrIsWithin12mo` helper | Rolling window for "how many incidents in the last year." |
| Billed revenue chart window | **24 months** | `dashboard.js:89` `BILLED_CHART_MONTHS` | Comment: "rolling window — adjust here if it gets too crowded." |
| Ballantine accrual suppression cutoff | **2026-04-12** | `employees.js:15` `BALLANTINE_ACCRUAL_START` | Drops before this date are not creditable for Ballantine employees (they were already accruing in their old system). |
| Sick bank cap | **48 hours/year** | `employees.js:425+` | Two drops of 24h: Jan 1 and May 1 within anniversary year. |
| Sick first-year handling | First-year overage held as `firstYearPendingDebt` | `employees.js:476–497` | Doesn't spill into vacation bank during first year; instead applied against future sick drops. |
| Year basis for years-of-service math | `365.25 * 24 * 60 * 60 * 1000` | `employees.js:115, 505` | Accounts for leap years. |
| Toast auto-hide | 3,200 ms | `app.js:62` | UX timing; not policy. |
| Autosave debounce (search/inputs) | 1,500 ms (most), 1,800 ms (some) | `auth.js:175`, scattered | UX timing; not policy. |

---

## 3. HR Policy Values

### Vacation accrual tiers (`employees.js:111`)

```
< 5 years:  80h/year (2 weeks)
≥ 5 years:  80h + 8h per additional year, capped at 120h (3 weeks)
```

These are encoded in `getVacationAllotment()`. Changing tenure tiers means editing this function.

### Performance reviews (`employees.js:2727+`)

| Constant | Purpose |
|---|---|
| `HR_TIERS` | 7 disciplinary action tiers (NUI #29) |
| `HR_CATEGORIES` | Counted attendance/incident categories |
| `STAFF_REVIEW_CATEGORIES` | 7 categories rated 1–9 (NUI #28 performance review) |
| `SUPERVISOR_REVIEW_CATEGORIES` | 8 categories (supervisor evaluation) |
| `REVIEW_RATING_BANDS` | 1–9 numeric → label/color band mapping |
| `REVIEW_FORM_TYPES` | Form metadata (which form ID, which categories array) |

Five employees lack email and cannot acknowledge reviews digitally — workflow currently deferred for them.

### Non-work timesheet categories (`employees.js:186`)

`NON_WORK_CATS = ['Sick', 'Sick Time', 'Vacation Time', 'Personal Time', 'Holiday', 'Snow Day']`

Used to exclude PTO/holiday hours from various productivity rollups.

### Onboarding/offboarding checklists (`admin.js:186+`)

- **NU Labs track**: 12 items (onboarding); matched offboarding set
- **Ballantine track**: 9 items (onboarding); matched offboarding set
- Source of truth: `TEMPLATE_SEED_DATA` in `admin.js`. Edits go through the Templates admin UI.

---

## 4. Department & Role Gates

| Decision | Value | Location |
|---|---|---|
| Ballantine excluded from billing reports | `EXCLUDED_DEPT = 'Ballantine'` | `reports.js:491` |
| Ballantine excluded from CMMC scope | Filtered in JS — `(e.department\|\|'').toLowerCase() !== 'ballantine'` | (per memory; correct pattern) |
| Owner role: Timesheets hidden | `currentEmployee.isOwner === true` | `auth.js:395`, `_applyIdentityNav()` |
| Manager-equivalent permission levels | `['manager','Manager','owner','Owner','admin','Admin']` | `auth.js:38` (`isManager()`) |
| Categories considered "billable" / used for revenue rollups | `['41','42','43','44']` (`REPORT_CATS`) | `reports.js:685` |

---

## 5. Display & Pagination Caps

| Where | Limit | File |
|---|---|---|
| Notification bell panel | 40 most recent | `chatter.js:306` |
| Chatter messages query (admin) | 200 | `admin.js:1613` |
| HR records — chatter cross-reference | 100 each (author + mentioned) | `employees.js:2652–2653` |
| Reports — top timesheet pull | 2,000 rows | `reports.js:1104` |
| Reports — secondary pulls | 500 / 1,000 / 1,000 rows | `reports.js:1130, 1152, 1605` |
| Project-detail file query | 50 | `project-detail.js:3513` |
| Bulk template insert chunk size | 50 | `admin.js:79` |
| Page chunk for table virtualization | 100 | `project-detail.js:2390` |

These exist mostly to keep payloads small. Watch the 2,000 and 1,000 limits — at NU Labs's data scale these are probably fine, but if a manual rollup ever returns mysteriously incomplete data, this is where to look.

---

## 6. Workflow & Business Logic

| Decision | Value | Location |
|---|---|---|
| Task statuses considered "done" | `['complete', 'billed', 'cancelled']` | `auth.js:504`, `isDone` helper |
| Cancelled tasks excluded from expected revenue | yes | `renderProjSummary`, `syncProjBilledRevenue` |
| Task status symbols in dropdowns | `{new:'○', inprogress:'●', prohold:'⏸', accthold:'⚑', complete:'✓', billed:'$', cancelled:'✗'}` | `auth.js:557` |
| Project status filters in nav | 8 statuses | `projects.js:566–567` |
| Project phase cycle | `['Waiting on TP Approval','Within 3 Months','3 to 6 Months','No Time Frame']` | `project-detail.js:507` `PHASE_CYCLE` |
| Job pack phases | `['Job Prep','Shock Testing','Vibration','Acoustic','Documentation']` | `jobpack.js:17` `JP_GROUPS` |
| Auto jobprep → pending promotion trigger | cat 42 or 44 task reaching `billed` status | (per memory; not yet implemented — design questions pending) |

---

## 7. External Services & Infrastructure

| Decision | Value | Where |
|---|---|---|
| Production app URL | `https://workspace.nulabs.com` | DNS + Supabase Auth Site URL |
| Vibrato app URL | `https://vibrato.nulabs.com` | DNS + Supabase additional redirect URLs |
| Supabase project ID | `swuuxzmgmldvvomsgmjf` | (per memory) |
| Email provider | Resend | Account-level config; API key in Supabase env var `RESEND_API_KEY` |
| Verified sending domain | `mail.nulabs.com` | DNS records (SPF/DKIM/MAIL FROM CNAME) at Network Solutions; verified in Resend dashboard. Referenced as constants in: `project-detail.js` `SEND_DOMAIN`, `send-notification/index.ts` `FROM_EMAIL`, `survey-send/index.ts` `FROM_ADDR`. Migrated from `vibrato.nulabs.com` on May 13, 2026. |
| Edge Functions sending email | `send-notification` (chatter @mentions, timesheet alerts), `send-client-email` (client outreach), `survey-send` (customer satisfaction surveys) | `supabase/functions/<name>/index.ts` |
| Edge Function AI model (chat helper) | `claude-3-haiku-20240307` | (per memory; Tier 1 account constraint) |
| Encrypted shared folder | `NUEncrypted` (AES-256, Synology) | (per memory) |
| VPN | UniFi Dream Machine Pro, OpenVPN, full tunnel | not yet live |

---

## 8. Compliance & CMMC Scoring

| Decision | Value | Where |
|---|---|---|
| All 110 NIST SP 800-171 Rev 2 practices | enumerated | `compliance.js` `POAM_PRACTICES`, `ASSESSMENT_DOMAINS`, `ASSESSMENT_EVIDENCE` |
| SPRS scoring weights (per DoD Assessment Methodology v1.2.1 Annex A) | 52 × 1pt + 14 × 3pt + 44 × 5pt = 110 practices, 314 max deduction, −204 minimum SPRS score | `compliance.js:1094` `SPRS_POINTS` |
| POA&M sources | enumerated | `compliance.js:612` `POAM_SOURCES` |
| Incident report categories | enumerated | `compliance.js:1742` `IR_CATEGORIES` |
| Incident severities | `['Low', 'Medium', 'High']` | `compliance.js:1753` |
| Separation types | enumerated | `compliance.js:2156` |
| Maintenance types | enumerated | `compliance.js:2706` |
| Media disposal: types, methods | enumerated | `compliance.js:3070–3071` |
| Configuration change types, impact levels | enumerated | `compliance.js:3369, 3380` |
| Document categories, domain map | enumerated | `compliance.js:3692, 3700` |

---

## 9. ⚠ Findings From This Audit

Things worth flagging that turned up while compiling this list:

### 9.1 Two `.neq()` calls on the Ballantine filter — KNOWN BUG PATTERN

**`compliance.js:140` and `compliance.js:2171`** both use:

```js
.neq('department', 'Ballantine')
```

Per your standing rule, `.neq()` drops nulls — meaning any employee with a null department gets excluded from CMMC and separation queries. This should be a JS-side `(e.department||'').toLowerCase() !== 'ballantine'` filter, like the rest of the codebase. **Worth fixing in a future pass.**

### 9.2 Two name-match identity gates

`reports.js:1713` and `project-detail.js:518` both check `currentEmployee.name === 'Jordan McAdoo'` to gate Closing Report approval. If Jordan's display name is ever edited (e.g., he wants "Jordan A. McAdoo"), the buttons silently disappear. **Cleaner long-term:** add an `is_closing_approver` flag on the employee record, or use UUIDs like Linda's `cc75ba64-…`. Not urgent — Jordan's name isn't changing tomorrow — but worth knowing.

### 9.3 Same pattern with `EXCLUDED_NAMES`

`reports.js:293` and `reports.js:490` exclude `['Russ McAdoo', 'Jordan McAdoo']` from billing rollups by literal name match. If Ragen ever needs to be excluded the same way, add to the list. Same brittleness as 9.2 — cleaner with `isOwner` flag.

### 9.4 `WHATS_NEW` array

`nav.js:158` — hardcoded changelog entries. Already on your roadmap to migrate to a Supabase table.

### 9.5 Tier-1 Anthropic API constraint

`claude-3-haiku-20240307` is the working model in the Edge Function because of Tier 1 rate limits. Worth revisiting if/when the account moves to a higher tier — `claude-haiku-4-5` would be a meaningful upgrade for the AI context features.

### 9.6 Survey email sender identity hardcoded

`survey-send/index.ts` hardcodes Scott Seip as the FROM address (`FROM_ADDR`) and as the fallback signature when no `signature_emp_id` is set on the template (`sigName='Scott Seip'`, `sigEmail='sseip@nulabs.com'`, `sigTitle='Lab Manager'`). If Scott leaves or changes role, customer surveys will continue going out signed by him until someone notices. Same brittleness pattern as 9.2 and 9.3 (literal-name identity gates). **Cleaner long-term:** derive both the FROM address and the signature from `signature_emp_id` on the template, defaulting to the current Lab Manager dynamically. Not urgent — Scott is still in the role — but worth flagging.

---

## How to use this document

When you change one of these values:

1. Edit the listed file/location
2. Update the value in the table above
3. If it touches a CMMC practice, note it in the Self-Assessment evidence
4. If it changes user-visible behavior, write a brief staff communication

When you spot a **new** hardcoded decision being added:

1. Add a row to the appropriate table here
2. If it could plausibly need to change in the future, name the constant in
   ALL_CAPS at the top of its module rather than burying it in code
