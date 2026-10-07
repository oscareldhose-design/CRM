<?php
/* MAP CRM: lists of choices, lead scoring, case risk, compliance and the automatic rules. */
if (!defined('MAP_CRM')) {
    http_response_code(404);
    exit;
}

const CRM_STAGES = ['enquiry', 'fact_find', 'dip', 'application', 'valuation', 'offer', 'conveyancing', 'exchange', 'completed'];
const CRM_PROTECTION_TYPES = ['life', 'ci', 'ip', 'mortgage_protection', 'fib'];
const CRM_LIVE_POLICY = ['quote', 'applied', 'on_risk'];
const CRM_PURCHASE_TYPES = ['ftb', 'home_mover', 'shared_ownership', 'self_build'];

function crm_enums()
{
    return [
        'enquiry_type' => [
            'ftb' => 'First-time buyer', 'home_mover' => 'Home mover', 'remortgage' => 'Remortgage',
            'product_transfer' => 'Product transfer', 'btl' => 'Buy to let', 'equity_release' => 'Equity release',
            'shared_ownership' => 'Shared ownership', 'commercial' => 'Commercial mortgage', 'bridging' => 'Bridging finance',
            'self_build' => 'Self build', 'second_charge' => 'Second charge', 'adverse_credit' => 'Adverse credit',
            'protection' => 'Protection (life, CI, IP)', 'insurance' => 'Home / landlord insurance',
            'business_protection' => 'Business protection', 'other' => 'Other',
        ],
        'case_type' => [
            'ftb' => 'First-time buyer', 'home_mover' => 'Home mover', 'remortgage' => 'Remortgage',
            'product_transfer' => 'Product transfer', 'further_advance' => 'Further advance', 'btl' => 'Buy to let',
            'equity_release' => 'Equity release', 'shared_ownership' => 'Shared ownership', 'commercial' => 'Commercial',
            'bridging' => 'Bridging', 'self_build' => 'Self build', 'second_charge' => 'Second charge',
            'adverse_credit' => 'Adverse credit',
        ],
        'stage' => [
            'enquiry' => 'Enquiry', 'fact_find' => 'Fact find', 'dip' => 'Decision in principle',
            'application' => 'Application submitted', 'valuation' => 'Valuation', 'offer' => 'Offer issued',
            'conveyancing' => 'Conveyancing', 'exchange' => 'Exchanged', 'completed' => 'Completed',
        ],
        'case_status' => ['active' => 'Active', 'completed' => 'Completed', 'lost' => 'Lost'],
        'rate_type' => ['fixed' => 'Fixed', 'tracker' => 'Tracker', 'variable' => 'Variable', 'discount' => 'Discount'],
        'lead_status' => ['new' => 'New', 'contacted' => 'Contacted', 'qualified' => 'Qualified', 'converted' => 'Converted', 'lost' => 'Lost'],
        'source' => [
            'website' => 'Website', 'phone' => 'Phone call', 'email' => 'Email', 'whatsapp' => 'WhatsApp',
            'introducer' => 'Introducer referral', 'existing_client' => 'Existing client', 'client_referral' => 'Client referral',
            'event' => 'Event (General Sales)', 'social' => 'Social media', 'walk_in' => 'Walk-in', 'other' => 'Other',
        ],
        'timescale' => [
            'asap' => 'Now / offer accepted', '1m' => 'Within a month', '3m' => '1–3 months', '6m' => '3–6 months',
            '12m' => '6–12 months', 'browsing' => 'Just researching',
        ],
        'credit_issues' => ['none' => 'None', 'minor' => 'Minor', 'major' => 'Major (CCJ, default, IVA)'],
        'employment' => [
            'employed' => 'Employed', 'self_employed' => 'Self-employed', 'contractor' => 'Contractor',
            'retired' => 'Retired', 'not_working' => 'Not working', 'other' => 'Other',
        ],
        'homeowner_status' => [
            'ftb' => 'First-time buyer', 'owner' => 'Homeowner', 'renting' => 'Renting',
            'family' => 'Living with family', 'landlord' => 'Landlord',
        ],
        'marital_status' => [
            'single' => 'Single', 'married' => 'Married / civil partnership', 'cohabiting' => 'Living together',
            'separated' => 'Separated', 'divorced' => 'Divorced', 'widowed' => 'Widowed',
        ],
        'title' => ['Mr' => 'Mr', 'Mrs' => 'Mrs', 'Miss' => 'Miss', 'Ms' => 'Ms', 'Mx' => 'Mx', 'Dr' => 'Dr'],
        'policy_type' => [
            'life' => 'Life insurance', 'ci' => 'Critical illness', 'ip' => 'Income protection',
            'mortgage_protection' => 'Mortgage protection', 'fib' => 'Family income benefit', 'accident' => 'Accident protection',
            'home' => 'Home insurance', 'landlord' => 'Landlord insurance', 'pmi' => 'Private medical (PMI)',
            'business' => 'Business protection', 'commercial' => 'Commercial / public liability', 'other' => 'Other',
        ],
        'policy_status' => [
            'quote' => 'Quoted', 'applied' => 'Applied', 'on_risk' => 'In force', 'declined' => 'Declined',
            'ntu' => 'Not taken up', 'lapsed' => 'Lapsed', 'cancelled' => 'Cancelled',
        ],
        'task_priority' => ['low' => 'Low', 'normal' => 'Normal', 'high' => 'High'],
        'task_status' => ['open' => 'Open', 'done' => 'Done'],
        'activity_type' => ['call' => 'Call', 'note' => 'Note', 'email' => 'Email', 'meeting' => 'Meeting', 'sms' => 'Text / WhatsApp', 'system' => 'System'],
        'document_status' => ['requested' => 'Requested', 'received' => 'Received', 'expired' => 'Expired', 'not_required' => 'Not required'],
        'document_names' => [
            'Photo ID', 'Proof of address', 'Payslips (3 months)', 'Bank statements (3 months)', 'P60',
            'SA302 / tax year overviews', 'Accounts (2 years)', 'Deposit evidence', 'Gift letter', 'Mortgage statement',
            'Memorandum of sale', 'Tenancy agreement', 'Valuation report', 'Mortgage offer', 'Other',
        ],
        'opportunity_type' => [
            'remortgage' => 'Remortgage', 'protection_gap' => 'No protection', 'landlord_cover' => 'Landlord cover',
            'home_insurance' => 'Home insurance', 'review_due' => 'Review due', 'other' => 'Other',
        ],
        'introducer_type' => [
            'estate_agent' => 'Estate agent', 'solicitor' => 'Solicitor / conveyancer', 'accountant' => 'Accountant',
            'builder' => 'Developer / builder', 'financial' => 'Financial adviser', 'client' => 'Client', 'other' => 'Other',
        ],
        'contact_status' => [
            'new' => 'Not called yet', 'no_answer' => 'No answer', 'callback' => 'Call back', 'interested' => 'Interested',
            'not_interested' => 'Not interested', 'wrong_number' => 'Wrong number', 'do_not_call' => 'Do not call',
            'handed_over' => 'Handed over',
        ],
        'call_outcome' => [
            'no_answer' => 'No answer', 'voicemail' => 'Left voicemail', 'callback' => 'Call back later',
            'interested' => 'Interested', 'not_interested' => 'Not interested', 'wrong_number' => 'Wrong number',
            'do_not_call' => 'Do not call again',
        ],
        'lost_reason' => [
            'Went with another broker', 'Went direct to lender', 'Not affordable', 'Declined by lender',
            'Changed plans / not moving', 'No response from client', 'Sale fell through', 'Other',
        ],
    ];
}

function crm_stage_index($stage)
{
    $i = array_search($stage, CRM_STAGES, true);
    return $i === false ? 0 : $i;
}

function crm_label($enum, $key)
{
    static $enums = null;
    if ($enums === null) {
        $enums = crm_enums();
    }
    return isset($enums[$enum][$key]) ? $enums[$enum][$key] : (string) $key;
}

/* ---- Lead scoring: HOT / WARM / COLD ---------------------------------------------------------- */
function crm_lead_score(array $l)
{
    $s = 0;
    $ts = ['asap' => 30, '1m' => 24, '3m' => 16, '6m' => 8, '12m' => 4, 'browsing' => 0];
    if (!empty($l['timescale']) && isset($ts[$l['timescale']])) {
        $s += $ts[$l['timescale']];
    }
    $type = isset($l['enquiry_type']) ? $l['enquiry_type'] : '';
    if (in_array($type, ['ftb', 'home_mover', 'remortgage', 'product_transfer', 'btl', 'shared_ownership', 'equity_release', 'commercial'], true)) {
        $s += 15;
    } elseif (in_array($type, ['bridging', 'self_build', 'second_charge', 'adverse_credit', 'protection', 'business_protection'], true)) {
        $s += 12;
    } elseif ($type === 'insurance') {
        $s += 8;
    } elseif ($type !== '') {
        $s += 4;
    }
    if (!empty($l['phone'])) {
        $s += 10;
    }
    if (!empty($l['email'])) {
        $s += 5;
    }
    $src = isset($l['source']) ? $l['source'] : '';
    if (in_array($src, ['introducer', 'client_referral', 'existing_client'], true)) {
        $s += 15;
    } elseif (in_array($src, ['website', 'phone', 'whatsapp', 'email'], true)) {
        $s += 8;
    } elseif ($src === 'event') {
        $s += 6;
    } elseif ($src !== '') {
        $s += 5;
    }
    if (!empty($l['introducer_id']) && $src !== 'introducer') {
        $s += 5;
    }
    $loan = isset($l['loan_amount']) ? (float) $l['loan_amount'] : 0;
    if ($loan >= 300000) {
        $s += 10;
    } elseif ($loan >= 150000) {
        $s += 7;
    } elseif ($loan > 0) {
        $s += 4;
    }
    if (!empty($l['property_value']) || !empty($l['deposit'])) {
        $s += 5;
    }
    $credit = isset($l['credit_issues']) ? $l['credit_issues'] : '';
    if ($credit === 'major') {
        $s -= 10;
    } elseif ($credit === 'minor') {
        $s -= 3;
    }
    $s = max(0, min(100, $s));
    $rating = $s >= 60 ? 'HOT' : ($s >= 35 ? 'WARM' : 'COLD');
    return [$s, $rating];
}

/* ---- Compliance checklist (Red / Amber / Green) ------------------------------------------------ */
function crm_compliance_items()
{
    return [
        ['key' => 'initial_disclosure', 'label' => 'Initial disclosure / terms of business issued', 'from' => 'enquiry'],
        ['key' => 'data_consent', 'label' => 'Privacy notice & data consent recorded', 'from' => 'enquiry'],
        ['key' => 'fact_find', 'label' => 'Fact find completed', 'from' => 'fact_find'],
        ['key' => 'id_verified', 'label' => 'Photo ID verified (AML)', 'from' => 'fact_find', 'docs' => ['Photo ID']],
        ['key' => 'address_verified', 'label' => 'Proof of address verified', 'from' => 'fact_find', 'docs' => ['Proof of address']],
        ['key' => 'affordability', 'label' => 'Affordability & budget checked', 'from' => 'dip'],
        ['key' => 'credit_consent', 'label' => 'Credit search consent given', 'from' => 'dip'],
        ['key' => 'income_evidence', 'label' => 'Income evidenced', 'from' => 'application',
            'docs' => ['Payslips (3 months)', 'SA302 / tax year overviews', 'P60', 'Accounts (2 years)']],
        ['key' => 'bank_statements', 'label' => 'Bank statements reviewed', 'from' => 'application', 'docs' => ['Bank statements (3 months)']],
        ['key' => 'deposit_source', 'label' => 'Source of deposit evidenced', 'from' => 'application', 'docs' => ['Deposit evidence', 'Gift letter'],
            'types' => ['ftb', 'home_mover', 'btl', 'shared_ownership', 'self_build', 'commercial']],
        ['key' => 'research', 'label' => 'Research & sourcing recorded', 'from' => 'application'],
        ['key' => 'suitability', 'label' => 'Suitability letter issued', 'from' => 'application'],
        ['key' => 'protection', 'label' => 'Protection discussed & recorded', 'from' => 'application', 'auto' => 'policy'],
        ['key' => 'offer_checked', 'label' => 'Offer checked against recommendation', 'from' => 'offer'],
        ['key' => 'file_closed', 'label' => 'Completion confirmed & file checked', 'from' => 'completed'],
    ];
}

/**
 * Works out the checklist for a case. Items become required at their stage; an item still missing
 * after its stage has passed is Red, one due at the current stage is Amber.
 */
function crm_compliance_eval(array $case, array $docs, $hasPolicy)
{
    $state = json_decode($case['compliance'] ? $case['compliance'] : '{}', true);
    if (!is_array($state)) {
        $state = [];
    }
    $stage = $case['status'] === 'lost' && $case['stage_before_lost'] ? $case['stage_before_lost'] : $case['stage'];
    $si = crm_stage_index($stage);
    $received = [];
    foreach ($docs as $d) {
        // A document received and since gone out of date still shows the check was done at the time.
        if ($d['status'] === 'received' || ($d['status'] === 'expired' && !empty($d['received_at']))) {
            if (!isset($received[$d['name']]) || $d['status'] === 'received') {
                $received[$d['name']] = $d['status'];
            }
        }
    }
    $items = [];
    $overdue = 0;
    $now = 0;
    $required = 0;
    $done = 0;
    foreach (crm_compliance_items() as $it) {
        if (!empty($it['types']) && !in_array($case['case_type'], $it['types'], true)) {
            continue;
        }
        $fi = crm_stage_index($it['from']);
        $isReq = $si >= $fi;
        $manual = isset($state[$it['key']]) && !empty($state[$it['key']]['done']);
        $auto = false;
        if (!$manual && !empty($it['docs'])) {
            foreach ($it['docs'] as $dn) {
                if (isset($received[$dn])) {
                    $auto = 'Document received: ' . $dn . ($received[$dn] === 'expired' ? ' (now out of date)' : '');
                    break;
                }
            }
        }
        if (!$manual && !$auto && isset($it['auto']) && $it['auto'] === 'policy' && $hasPolicy) {
            $auto = 'Protection policy on file';
        }
        $isDone = $manual || $auto;
        if ($isReq) {
            $required++;
            if ($isDone) {
                $done++;
            } elseif ($si > $fi) {
                $overdue++;
            } else {
                $now++;
            }
        }
        $items[] = [
            'key' => $it['key'],
            'label' => $it['label'],
            'from' => $it['from'],
            'required' => $isReq,
            'done' => (bool) $isDone,
            'auto' => $auto ?: null,
            'by' => $manual && isset($state[$it['key']]['by']) ? $state[$it['key']]['by'] : null,
            'at' => $manual && isset($state[$it['key']]['at']) ? $state[$it['key']]['at'] : null,
            'overdue' => $isReq && !$isDone && $si > $fi,
        ];
    }
    $rating = $overdue > 0 ? 'red' : ($now > 0 ? 'amber' : 'green');
    return ['rating' => $rating, 'items' => $items, 'required' => $required, 'done' => $done, 'missing' => $overdue + $now, 'overdue' => $overdue];
}

/* ---- Pipeline risk ----------------------------------------------------------------------------- */

/** Facts about every case in an office that the risk rating needs, fetched in a few queries. */
function crm_case_context($officeId)
{
    $today = crm_today();
    $ctx = ['case_activity' => [], 'client_activity' => [], 'tasks' => [], 'docs_late' => [], 'docs' => [], 'has_policy' => []];
    foreach (crm_all('SELECT case_id, MAX(created_at) AS at FROM activities WHERE office_id = ? AND case_id IS NOT NULL AND deleted_at IS NULL AND type <> \'system\' GROUP BY case_id', [$officeId]) as $r) {
        $ctx['case_activity'][$r['case_id']] = $r['at'];
    }
    foreach (crm_all('SELECT client_id, MAX(created_at) AS at FROM activities WHERE office_id = ? AND client_id IS NOT NULL AND deleted_at IS NULL AND type <> \'system\' GROUP BY client_id', [$officeId]) as $r) {
        $ctx['client_activity'][$r['client_id']] = $r['at'];
    }
    foreach (crm_all("SELECT case_id, COUNT(*) AS open, SUM(CASE WHEN due_date < ? THEN 1 ELSE 0 END) AS overdue,
            SUM(CASE WHEN auto_key LIKE 'noschedule:%' THEN 1 ELSE 0 END) AS review
            FROM tasks WHERE office_id = ? AND case_id IS NOT NULL AND status = 'open' AND deleted_at IS NULL GROUP BY case_id", [$today, $officeId]) as $r) {
        $ctx['tasks'][$r['case_id']] = $r;
    }
    foreach (crm_all("SELECT case_id, COUNT(*) AS n FROM documents WHERE office_id = ? AND case_id IS NOT NULL AND status = 'requested'
            AND deleted_at IS NULL AND COALESCE(requested_at, substr(created_at, 1, 10)) <= ? GROUP BY case_id", [$officeId, crm_add_days($today, -14)]) as $r) {
        $ctx['docs_late'][$r['case_id']] = (int) $r['n'];
    }
    foreach (crm_all('SELECT case_id, name, status, received_at FROM documents WHERE office_id = ? AND case_id IS NOT NULL AND deleted_at IS NULL', [$officeId]) as $r) {
        $ctx['docs'][$r['case_id']][] = $r;
    }
    $in = implode(',', array_map(function ($t) {
        return "'" . $t . "'";
    }, CRM_PROTECTION_TYPES));
    foreach (crm_all("SELECT DISTINCT client_id FROM policies WHERE office_id = ? AND deleted_at IS NULL AND status IN ('quote','applied','on_risk') AND policy_type IN ($in)", [$officeId]) as $r) {
        $ctx['has_policy'][$r['client_id']] = true;
    }
    return $ctx;
}

/** Last time anyone worked on the case (a call, note, update or stage move). */
function crm_case_last_touch(array $c, array $ctx)
{
    $times = [$c['created_at'], $c['stage_changed_at']];
    if (isset($ctx['case_activity'][$c['id']])) {
        $times[] = $ctx['case_activity'][$c['id']];
    }
    if (isset($ctx['client_activity'][$c['client_id']])) {
        $times[] = $ctx['client_activity'][$c['client_id']];
    }
    $times = array_filter($times);
    return $times ? max($times) : $c['created_at'];
}

/** Risk rating for a live case: high / medium / low, with the reason. */
function crm_case_risk(array $c, array $ctx)
{
    if ($c['status'] !== 'active') {
        return ['level' => 'none', 'reason' => '', 'reasons' => []];
    }
    $today = crm_today();
    $quiet = (int) crm_setting('quiet_days', '14');
    $high = [];
    $med = [];
    $days = crm_days_between(crm_local_date(crm_case_last_touch($c, $ctx)), $today);
    if ($days >= $quiet + 7) {
        $high[] = 'No contact for ' . $days . ' days';
    } elseif ($days >= $quiet) {
        $med[] = 'No contact for ' . $days . ' days';
    }
    if ($c['expected_completion_date'] && $c['expected_completion_date'] < $today) {
        $high[] = 'Expected completion date has passed';
    }
    if ($c['offer_expiry_date'] && crm_stage_index($c['stage']) < crm_stage_index('completed')) {
        $left = crm_days_between($today, $c['offer_expiry_date']);
        if ($left < 0) {
            $high[] = 'Mortgage offer has expired';
        } elseif ($left <= 14) {
            $high[] = 'Offer expires in ' . $left . ' day' . ($left === 1 ? '' : 's');
        } elseif ($left <= 30) {
            $med[] = 'Offer expires in ' . $left . ' days';
        }
    }
    $docs = isset($ctx['docs'][$c['id']]) ? $ctx['docs'][$c['id']] : [];
    $comp = crm_compliance_eval($c, $docs, isset($ctx['has_policy'][$c['client_id']]));
    if ($comp['rating'] === 'red') {
        $high[] = 'Compliance: ' . $comp['overdue'] . ' item' . ($comp['overdue'] === 1 ? '' : 's') . ' overdue';
    } elseif ($comp['rating'] === 'amber' && crm_stage_index($c['stage']) >= crm_stage_index('offer')) {
        $med[] = 'Compliance checklist incomplete';
    }
    $t = isset($ctx['tasks'][$c['id']]) ? $ctx['tasks'][$c['id']] : null;
    $futureAction = $c['next_action_date'] && $c['next_action_date'] >= $today;
    if ($t && (int) $t['review'] > 0) {
        $med[] = 'Nothing scheduled: review task created';
    } elseif ((!$t || (int) $t['open'] === 0) && !$futureAction) {
        $med[] = 'Nothing scheduled';
    }
    if ($t && (int) $t['overdue'] > 0) {
        $med[] = (int) $t['overdue'] . ' overdue task' . ((int) $t['overdue'] === 1 ? '' : 's');
    }
    if (!empty($ctx['docs_late'][$c['id']])) {
        $n = $ctx['docs_late'][$c['id']];
        $med[] = $n . ' document' . ($n === 1 ? '' : 's') . ' outstanding over 14 days';
    }
    if (crm_stage_index($c['stage']) < crm_stage_index('offer')) {
        // Before the offer the lender may want up-to-date copies of documents that have gone out of date.
        $fresh = [];
        $stale = [];
        foreach ($docs as $d) {
            if ($d['status'] === 'received') {
                $fresh[$d['name']] = true;
            } elseif ($d['status'] === 'expired') {
                $stale[$d['name']] = true;
            }
        }
        $n = count(array_diff_key($stale, $fresh));
        if ($n) {
            $med[] = $n . ' document' . ($n === 1 ? '' : 's') . ' out of date: ask for new copies';
        }
    }
    if ($c['stage_changed_at']) {
        $inStage = crm_days_between(crm_local_date($c['stage_changed_at']), $today);
        $limit = in_array($c['stage'], ['conveyancing', 'offer'], true) ? 60 : 30;
        if ($inStage > $limit) {
            $med[] = 'In ' . crm_label('stage', $c['stage']) . ' for ' . $inStage . ' days';
        }
    }
    $reasons = array_merge($high, $med);
    $level = $high ? 'high' : ($med ? 'medium' : 'low');
    return ['level' => $level, 'reason' => $reasons ? $reasons[0] : 'On track', 'reasons' => $reasons, 'compliance' => $comp['rating'], 'last_touch_days' => $days];
}

/* ---- Automatic rules ------------------------------------------------------------------------- */

/** Creates a task once per $key (the key stops duplicates, even after the task is done or moved to the trash). */
function crm_auto_task($officeId, $key, array $f)
{
    $now = crm_now();
    $row = [
        'office_id' => $officeId,
        'title' => mb_substr($f['title'], 0, 200),
        'notes' => isset($f['notes']) ? $f['notes'] : null,
        'due_date' => isset($f['due_date']) ? $f['due_date'] : crm_today(),
        'priority' => isset($f['priority']) ? $f['priority'] : 'normal',
        'status' => 'open',
        'assigned_to' => isset($f['assigned_to']) ? $f['assigned_to'] : null,
        'client_id' => isset($f['client_id']) ? $f['client_id'] : null,
        'lead_id' => isset($f['lead_id']) ? $f['lead_id'] : null,
        'case_id' => isset($f['case_id']) ? $f['case_id'] : null,
        'policy_id' => isset($f['policy_id']) ? $f['policy_id'] : null,
        'auto_key' => $key,
        'created_at' => $now,
        'updated_at' => $now,
    ];
    $cols = array_keys($row);
    crm_q('INSERT OR IGNORE INTO tasks (' . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')', array_values($row));
}

/**
 * When the date inside an automatic task's key changes (a corrected fixed-rate end, renewal or quote date), the task
 * still open for the old date is moved to the new key, so the rule does not add a second one.
 */
function crm_auto_task_rekey($officeId, $prefix, $key, array $set)
{
    if (crm_val('SELECT id FROM tasks WHERE office_id = ? AND auto_key = ?', [$officeId, $key])) {
        return;
    }
    $old = crm_val("SELECT id FROM tasks WHERE office_id = ? AND status = 'open' AND deleted_at IS NULL AND auto_key LIKE ? ORDER BY id DESC LIMIT 1", [$officeId, $prefix . '%']);
    if (!$old) {
        return;
    }
    $set['auto_key'] = $key;
    if (isset($set['title'])) {
        $set['title'] = mb_substr($set['title'], 0, 200);
    }
    $sets = '';
    foreach (array_keys($set) as $col) {
        $sets .= $col . ' = ?, ';
    }
    crm_q('UPDATE tasks SET ' . $sets . "due_date = MAX(COALESCE(due_date, ''), ?), updated_at = ?, version = version + 1 WHERE id = ?",
        array_merge(array_values($set), [crm_today(), crm_now(), $old]));
}

/** Raises an opportunity once per $key. One the engine closed itself whose reason has come back is opened again. */
function crm_auto_opportunity($officeId, $key, array $f)
{
    $now = crm_now();
    $detail = isset($f['detail']) ? $f['detail'] : null;
    $st = crm_q('INSERT OR IGNORE INTO opportunities (office_id, client_id, case_id, type, title, detail, due_date, value, status, auto_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'open\', ?, ?, ?)', [
        $officeId, isset($f['client_id']) ? $f['client_id'] : null, isset($f['case_id']) ? $f['case_id'] : null, $f['type'],
        mb_substr($f['title'], 0, 200), $detail, isset($f['due_date']) ? $f['due_date'] : null,
        isset($f['value']) ? $f['value'] : null, $key, $now, $now,
    ]);
    if ($st->rowCount() === 0) {
        // e.g. a protection quote closed the gap, then was not taken up. Ones a person actioned or dismissed stay closed.
        crm_q("UPDATE opportunities SET status = 'open', detail = ?, actioned_at = NULL, updated_at = ? WHERE office_id = ? AND auto_key = ?
            AND status = 'actioned' AND actioned_by IS NULL AND detail LIKE ?", [$detail, $now, $officeId, $key, '% (resolved automatically)']);
    }
}

/** Closes open opportunities of a type whose reason has gone (e.g. the client now has protection). */
function crm_close_resolved_opportunities($officeId, $type, array $stillOpenKeys)
{
    $open = crm_all("SELECT id, auto_key FROM opportunities WHERE office_id = ? AND type = ? AND status = 'open' AND auto_key IS NOT NULL", [$officeId, $type]);
    foreach ($open as $o) {
        if (!isset($stillOpenKeys[$o['auto_key']])) {
            crm_q("UPDATE opportunities SET status = 'actioned', detail = COALESCE(detail, '') || ?, actioned_at = ?, updated_at = ? WHERE id = ?",
                [' (resolved automatically)', crm_now(), crm_now(), $o['id']]);
        }
    }
}

function crm_client_name(array $c)
{
    return trim($c['first_name'] . ' ' . $c['last_name']);
}

/**
 * True when the client already has a remortgage, product transfer or further advance that is newer than this
 * completed case: one still in progress, or one that completed after it. $clientCases are the client's cases.
 */
function crm_remortgage_under_way(array $old, array $clientCases)
{
    foreach ($clientCases as $c) {
        if ((int) $c['id'] === (int) $old['id'] || $c['status'] === 'lost'
            || !in_array($c['case_type'], ['remortgage', 'product_transfer', 'further_advance'], true)) {
            continue;
        }
        if ($c['status'] === 'active' || ($c['completion_date'] && $c['completion_date'] > (string) $old['completion_date'])) {
            return true;
        }
    }
    return false;
}

/** Runs the automatic rules for an office at most every 10 minutes while people are using it. */
function crm_engine_maybe_run($officeId)
{
    $key = 'engine_run_' . (int) $officeId;
    $last = (int) crm_setting($key, '0');
    if (time() - $last < 600) {
        return;
    }
    crm_set_setting($key, time());
    try {
        crm_engine_run($officeId);
    } catch (Exception $e) {
        error_log('MAP CRM engine: ' . $e->getMessage());
    }
}

function crm_engine_run($officeId, $force = false)
{
    $officeId = (int) $officeId;
    $today = crm_today();
    crm_tx(function () use ($officeId, $today) {
        $clientRows = crm_all('SELECT * FROM clients WHERE office_id = ? AND deleted_at IS NULL AND erased_at IS NULL', [$officeId]);
        $clients = [];
        foreach ($clientRows as $c) {
            $clients[$c['id']] = $c;
        }
        $cases = crm_all('SELECT * FROM cases WHERE office_id = ? AND deleted_at IS NULL', [$officeId]);
        $policies = crm_all("SELECT * FROM policies WHERE office_id = ? AND deleted_at IS NULL", [$officeId]);
        $ctx = crm_case_context($officeId);
        $casesByClient = [];
        $casesById = [];
        foreach ($cases as $c) {
            $casesByClient[$c['client_id']][] = $c;
            $casesById[$c['id']] = $c;
        }
        // Open automatic opportunities whose reason has gone are closed at the end (see crm_close_resolved_opportunities).
        $keep = ['remortgage' => [], 'protection_gap' => [], 'landlord_cover' => [], 'home_insurance' => [], 'review_due' => []];

        // 1. Fixed rate ends within 6 months: remortgage opportunity + review task for the adviser,
        //    unless a remortgage / product transfer is already under way for the client.
        $horizon = crm_add_days($today, 183);
        foreach ($cases as $c) {
            if ($c['status'] !== 'completed' || !$c['fixed_rate_end_date'] || !isset($clients[$c['client_id']]) || $c['fixed_rate_end_date'] > $horizon) {
                continue;
            }
            $prefix = 'remortgage:' . $c['id'] . ':';
            if (crm_remortgage_under_way($c, $casesByClient[$c['client_id']])) {
                crm_q("UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ?, version = version + 1 WHERE office_id = ? AND status = 'open'
                    AND deleted_at IS NULL AND auto_key LIKE ?", [crm_now(), crm_now(), $officeId, $prefix . '%']);
                continue;
            }
            $key = $prefix . $c['fixed_rate_end_date'];
            $keep['remortgage'][$key] = true;   // one already raised stays open after the rate has ended
            if ($c['fixed_rate_end_date'] < crm_add_days($today, -90)) {
                continue;
            }
            $cl = $clients[$c['client_id']];
            $who = crm_client_name($cl);
            crm_auto_opportunity($officeId, $key, [
                'type' => 'remortgage', 'client_id' => $c['client_id'], 'case_id' => $c['id'],
                'title' => 'Remortgage: ' . $who, 'due_date' => $c['fixed_rate_end_date'], 'value' => $c['loan_amount'],
                'detail' => 'Fixed rate with ' . ($c['lender'] ?: 'lender') . ' ends ' . $c['fixed_rate_end_date'],
            ]);
            $title = 'Remortgage review: ' . $who . ' (fixed rate ends ' . date('j M Y', strtotime($c['fixed_rate_end_date'])) . ')';
            $priority = crm_days_between($today, $c['fixed_rate_end_date']) <= 90 ? 'high' : 'normal';
            crm_auto_task_rekey($officeId, $prefix, $key, ['title' => $title, 'priority' => $priority]);
            crm_auto_task($officeId, $key, [
                'title' => $title,
                'notes' => 'Fixed rate ends within 6 months. Contact the client to review a product transfer or remortgage.',
                'assigned_to' => $c['adviser_id'] ?: $cl['adviser_id'], 'client_id' => $c['client_id'], 'case_id' => $c['id'],
                'priority' => $priority,
            ]);
        }
        // A remortgage / product transfer under way for the client actions the opportunity.
        foreach (crm_all("SELECT id, case_id FROM opportunities WHERE office_id = ? AND type = 'remortgage' AND status = 'open'", [$officeId]) as $o) {
            if ($o['case_id'] && isset($casesById[$o['case_id']])) {
                $old = $casesById[$o['case_id']];
                if (crm_remortgage_under_way($old, $casesByClient[$old['client_id']])) {
                    crm_q("UPDATE opportunities SET status = 'actioned', detail = COALESCE(detail, '') || ' (new case opened)', actioned_at = ?, updated_at = ? WHERE id = ?", [crm_now(), crm_now(), $o['id']]);
                }
            }
        }

        // 2. Live case with nothing scheduled: flag it with a review task (at most once a week).
        foreach ($cases as $c) {
            if ($c['status'] !== 'active' || !isset($clients[$c['client_id']])) {
                continue;
            }
            $t = isset($ctx['tasks'][$c['id']]) ? $ctx['tasks'][$c['id']] : null;
            if (($t && (int) $t['open'] > 0) || ($c['next_action_date'] && $c['next_action_date'] >= $today)) {
                continue;
            }
            $touched = max(crm_case_last_touch($c, $ctx), $c['updated_at']);
            if (crm_days_between(crm_local_date($touched), $today) < 3) {
                continue;
            }
            crm_auto_task($officeId, 'noschedule:' . $c['id'] . ':' . crm_iso_week($today), [
                'title' => 'Review case, nothing scheduled: ' . crm_client_name($clients[$c['client_id']]),
                'notes' => 'This case has no tasks or next action booked. Agree the next step with the client and schedule it.',
                'assigned_to' => $c['adviser_id'] ?: $c['administrator_id'], 'client_id' => $c['client_id'], 'case_id' => $c['id'],
            ]);
        }

        // 3. Insurance renewal due within 30 days, or 4. a quote that has gone quiet: follow-up task.
        $policyActivity = [];
        foreach (crm_all('SELECT policy_id, MAX(created_at) AS at FROM activities WHERE office_id = ? AND policy_id IS NOT NULL AND deleted_at IS NULL GROUP BY policy_id', [$officeId]) as $r) {
            $policyActivity[$r['policy_id']] = $r['at'];
        }
        foreach ($policies as $p) {
            if (!isset($clients[$p['client_id']])) {
                continue;
            }
            $who = crm_client_name($clients[$p['client_id']]);
            $type = crm_label('policy_type', $p['policy_type']);
            if ($p['status'] === 'on_risk' && $p['renewal_date'] && $p['renewal_date'] >= $today && $p['renewal_date'] <= crm_add_days($today, 30)) {
                $key = 'renewal:' . $p['id'] . ':' . $p['renewal_date'];
                $title = 'Renewal due ' . date('j M', strtotime($p['renewal_date'])) . ': ' . $type . ' for ' . $who;
                crm_auto_task_rekey($officeId, 'renewal:' . $p['id'] . ':', $key, ['title' => $title]);
                crm_auto_task($officeId, $key, [
                    'title' => $title,
                    'notes' => 'Review cover and price before the policy renews.',
                    'assigned_to' => $p['adviser_id'] ?: $clients[$p['client_id']]['adviser_id'],
                    'client_id' => $p['client_id'], 'policy_id' => $p['id'], 'priority' => 'high',
                ]);
            }
            if ($p['status'] === 'quote') {
                $quoted = $p['quote_date'] ?: crm_local_date($p['created_at']);
                $last = max(crm_local_date($p['updated_at']), isset($policyActivity[$p['id']]) ? crm_local_date($policyActivity[$p['id']]) : '0000-00-00', $quoted);
                if ($quoted <= crm_add_days($today, -14) && $last <= crm_add_days($today, -14)) {
                    crm_auto_task_rekey($officeId, 'quotequiet:' . $p['id'] . ':', 'quotequiet:' . $p['id'] . ':' . $quoted, []);
                    crm_auto_task($officeId, 'quotequiet:' . $p['id'] . ':' . $quoted, [
                        'title' => 'Chase quote: ' . $type . ' for ' . $who,
                        'notes' => 'This quote has had no activity for over 14 days.',
                        'assigned_to' => $p['adviser_id'] ?: $clients[$p['client_id']]['adviser_id'],
                        'client_id' => $p['client_id'], 'policy_id' => $p['id'],
                    ]);
                }
            }
        }

        // 5. Opportunities: clients without protection, landlords without cover, buyers without home insurance, reviews due.
        $live = [];
        foreach ($policies as $p) {
            if (in_array($p['status'], CRM_LIVE_POLICY, true)) {
                $live[$p['client_id']][$p['policy_type']] = true;
            }
        }
        $openReview = [];   // client => key of its newest open review opportunity
        foreach (crm_all("SELECT client_id, auto_key FROM opportunities WHERE office_id = ? AND type = 'review_due' AND status = 'open' AND auto_key IS NOT NULL ORDER BY id", [$officeId]) as $r) {
            $openReview[$r['client_id']] = $r['auto_key'];
        }
        $recentReview = [];   // clients given a review opportunity in the last year (other than ones the engine closed itself)
        foreach (crm_all("SELECT DISTINCT client_id FROM opportunities WHERE office_id = ? AND type = 'review_due' AND created_at >= ?
                AND NOT (status = 'actioned' AND actioned_by IS NULL AND COALESCE(detail, '') LIKE ?)", [$officeId, crm_add_days($today, -365), '% (resolved automatically)']) as $r) {
            $recentReview[$r['client_id']] = true;
        }
        foreach ($clients as $cid => $cl) {
            $cc = isset($casesByClient[$cid]) ? $casesByClient[$cid] : [];
            $who = crm_client_name($cl);
            $hasProt = false;
            foreach (CRM_PROTECTION_TYPES as $pt) {
                if (!empty($live[$cid][$pt])) {
                    $hasProt = true;
                }
            }
            $mortgaged = false;
            $btl = (int) $cl['is_landlord'] === 1;
            $buyer = false;
            foreach ($cc as $c) {
                if ($c['status'] === 'lost') {
                    continue;
                }
                $far = $c['status'] === 'completed' || crm_stage_index($c['stage']) >= crm_stage_index('offer');
                if ($c['case_type'] === 'btl') {
                    $btl = true;
                } elseif ($far) {
                    $mortgaged = true;
                }
                if ($far && in_array($c['case_type'], CRM_PURCHASE_TYPES, true)
                    && (!$c['completion_date'] || $c['completion_date'] >= crm_add_days($today, -365))) {
                    $buyer = true;
                }
            }
            if ($mortgaged && !$hasProt) {
                $key = 'protection:' . $cid;
                $keep['protection_gap'][$key] = true;
                crm_auto_opportunity($officeId, $key, ['type' => 'protection_gap', 'client_id' => $cid,
                    'title' => 'No protection in place: ' . $who, 'detail' => 'Has a mortgage with us but no life, critical illness or income protection.']);
            }
            if ($btl && empty($live[$cid]['landlord'])) {
                $key = 'landlord:' . $cid;
                $keep['landlord_cover'][$key] = true;
                crm_auto_opportunity($officeId, $key, ['type' => 'landlord_cover', 'client_id' => $cid,
                    'title' => 'Landlord cover: ' . $who, 'detail' => 'Landlord / buy-to-let client with no landlord insurance on file.']);
            }
            if ($buyer && empty($live[$cid]['home'])) {
                $key = 'home:' . $cid;
                $keep['home_insurance'][$key] = true;
                crm_auto_opportunity($officeId, $key, ['type' => 'home_insurance', 'client_id' => $cid,
                    'title' => 'Home insurance: ' . $who, 'detail' => 'Buying a home with us and no home insurance on file.']);
            }
            // One open review per client: a corrected review date replaces the one raised for the old date.
            if ($cl['next_review_date'] && $cl['next_review_date'] <= crm_add_days($today, 30)) {
                $key = 'review:' . $cid . ':' . $cl['next_review_date'];
                $keep['review_due'][$key] = true;
                crm_auto_opportunity($officeId, $key, ['type' => 'review_due', 'client_id' => $cid,
                    'title' => 'Review due: ' . $who, 'due_date' => $cl['next_review_date'], 'detail' => 'Annual review date ' . $cl['next_review_date'] . '.']);
            } elseif (!$cl['next_review_date'] && $cc) {
                $lastDone = null;
                foreach ($cc as $c) {
                    if ($c['completion_date'] && (!$lastDone || $c['completion_date'] > $lastDone)) {
                        $lastDone = $c['completion_date'];
                    }
                }
                $lastTalk = isset($ctx['client_activity'][$cid]) ? crm_local_date($ctx['client_activity'][$cid]) : null;
                if ($lastDone && $lastDone <= crm_add_days($today, -365) && (!$lastTalk || $lastTalk <= crm_add_days($today, -365))) {
                    if (isset($openReview[$cid])) {
                        $keep['review_due'][$openReview[$cid]] = true;   // already raised (e.g. last 31 December)
                    } elseif (empty($recentReview[$cid])) {
                        $key = 'review:' . $cid . ':' . date('Y');
                        $keep['review_due'][$key] = true;
                        crm_auto_opportunity($officeId, $key, ['type' => 'review_due', 'client_id' => $cid,
                            'title' => 'Annual review: ' . $who, 'detail' => 'No contact for over a year since completion.']);
                    }
                }
            }
        }
        foreach ($keep as $type => $keys) {
            crm_close_resolved_opportunities($officeId, $type, $keys);
        }

        // 6. Documents past their expiry date are marked expired.
        crm_q("UPDATE documents SET status = 'expired', updated_at = ? WHERE office_id = ? AND status IN ('requested','received')
            AND expiry_date IS NOT NULL AND expiry_date < ? AND deleted_at IS NULL", [crm_now(), $officeId, $today]);
    });
    crm_set_setting('engine_run_' . $officeId, time());
}

/* ---- Rules that fire when a record changes ------------------------------------------------------ */

/** True when $field still holds the date worked out from the old values ($derived) and this save does not change it by hand. */
function crm_case_date_derived($field, array $row, array $before, $derived)
{
    return $derived !== null && (string) $before[$field] === (string) $derived
        && (!array_key_exists($field, $row) || (string) $row[$field] === (string) $before[$field]);
}

/** Fills in dates and status when a case moves stage. $before is null for a new case. */
function crm_case_prepare(array $row, $before)
{
    $merged = $before ? array_merge($before, $row) : $row;
    $stage = isset($merged['stage']) ? $merged['stage'] : 'enquiry';
    $status = isset($merged['status']) ? $merged['status'] : 'active';
    $today = crm_today();
    if ($before && $before['status'] === 'completed' && $status === 'active' && $stage === 'completed') {
        $row['stage'] = $stage = 'exchange';  // reopening a completed case puts it back before completion
    }
    if (!$before || $before['stage'] !== $stage) {
        $row['stage_changed_at'] = crm_now();
    }
    if ($status === 'completed' && $stage !== 'completed') {
        $row['stage'] = $stage = 'completed';
    }
    if ($stage === 'completed' && $status !== 'lost') {
        $row['status'] = $status = 'completed';
        if (empty($merged['completion_date'])) {
            $row['completion_date'] = $merged['completion_date'] = $today;
        }
        $rateType = isset($merged['rate_type']) ? $merged['rate_type'] : null;
        $years = isset($merged['fixed_term_years']) ? (int) $merged['fixed_term_years'] : 0;
        if ($years > 0 && ($rateType === 'fixed' || !$rateType)) {
            // Worked out when empty, and again when the completion date or fixed term it came from is corrected.
            $wasYears = $before ? (int) $before['fixed_term_years'] : 0;
            $was = $before && !empty($before['completion_date']) && $wasYears > 0 ? crm_add_months($before['completion_date'], 12 * $wasYears) : null;
            if (empty($merged['fixed_rate_end_date'])
                || ($was !== null && ((string) $merged['completion_date'] !== (string) $before['completion_date'] || $years !== $wasYears)
                    && crm_case_date_derived('fixed_rate_end_date', $row, $before, $was))) {
                $row['fixed_rate_end_date'] = crm_add_months($merged['completion_date'], 12 * $years);
            }
        }
    }
    if (crm_stage_index($stage) >= crm_stage_index('application') && empty($merged['application_date']) && $stage !== 'completed') {
        $row['application_date'] = $today;
    }
    if ($stage === 'offer') {
        if (empty($merged['offer_date'])) {
            $row['offer_date'] = $merged['offer_date'] = $today;
        }
        if (empty($merged['offer_expiry_date'])) {
            $row['offer_expiry_date'] = crm_add_months($merged['offer_date'], 6);
        }
    }
    // A corrected offer date moves the expiry worked out from it (an expiry typed in by hand stays).
    if ($before && !empty($merged['offer_date']) && !empty($before['offer_date']) && (string) $merged['offer_date'] !== (string) $before['offer_date']
        && crm_case_date_derived('offer_expiry_date', $row, $before, crm_add_months($before['offer_date'], 6))) {
        $row['offer_expiry_date'] = crm_add_months($merged['offer_date'], 6);
    }
    if ($status === 'lost' && (!$before || $before['status'] !== 'lost')) {
        $row['lost_at'] = crm_now();
        $row['stage_before_lost'] = $stage;
    }
    return $row;
}

/** After a case is saved: activity line, completion-prep task on offer, post-completion call on completion. */
function crm_case_after_save($before, array $after)
{
    $officeId = (int) $after['office_id'];
    $client = crm_one('SELECT * FROM clients WHERE id = ? AND office_id = ?', [$after['client_id'], $officeId]);
    $who = $client ? crm_client_name($client) : 'client';
    $u = isset($GLOBALS['crm_user']) ? $GLOBALS['crm_user'] : null;
    $prev = $before ? $before['stage'] : null;
    if ($before && $prev !== $after['stage']) {
        crm_insert('activities', [
            'office_id' => $officeId, 'client_id' => $after['client_id'], 'case_id' => $after['id'], 'type' => 'system',
            'summary' => 'Case moved from ' . crm_label('stage', $prev) . ' to ' . crm_label('stage', $after['stage']),
            'user_id' => $u ? $u['id'] : null, 'user_name' => $u ? $u['full_name'] : null, 'created_at' => crm_now(),
        ]);
    }
    if ($before && $before['status'] !== $after['status'] && $after['status'] === 'lost') {
        crm_insert('activities', [
            'office_id' => $officeId, 'client_id' => $after['client_id'], 'case_id' => $after['id'], 'type' => 'system',
            'summary' => 'Case marked as lost' . ($after['lost_reason'] ? ': ' . $after['lost_reason'] : ''),
            'user_id' => $u ? $u['id'] : null, 'user_name' => $u ? $u['full_name'] : null, 'created_at' => crm_now(),
        ]);
    }
    if ($after['stage'] === 'offer' && $prev !== 'offer' && $after['status'] === 'active') {
        crm_auto_task($officeId, 'offer:' . $after['id'], [
            'title' => 'Completion prep: ' . $who . ($after['lender'] ? ' (' . $after['lender'] . ')' : ''),
            'notes' => 'Offer issued. Check the offer conditions against the recommendation, send it to the solicitor and confirm the completion date with the client.',
            'assigned_to' => $after['administrator_id'] ?: $after['adviser_id'],
            'client_id' => $after['client_id'], 'case_id' => $after['id'], 'priority' => 'high', 'due_date' => crm_add_days(crm_today(), 2),
        ]);
    }
    if ($after['stage'] === 'completed' && $prev !== 'completed') {
        $completed = $after['completion_date'] ?: crm_today();
        // A mortgage that completed over a year ago (e.g. old cases added at go-live) gets no call; the annual review covers it.
        if ($completed >= crm_add_days(crm_today(), -365)) {
            crm_auto_task($officeId, 'postcompletion:' . $after['id'], [
                'title' => 'Post-completion call: ' . $who,
                'notes' => 'Check the client is settled, ask for a review, and discuss protection and home insurance.'
                    . ($after['fixed_rate_end_date'] ? ' Fixed rate ends ' . date('j M Y', strtotime($after['fixed_rate_end_date'])) . '.' : ''),
                'assigned_to' => $after['adviser_id'], 'client_id' => $after['client_id'], 'case_id' => $after['id'],
                'due_date' => max(crm_add_days($completed, 14), crm_today()),
            ]);
        }
        crm_insert('activities', [
            'office_id' => $officeId, 'client_id' => $after['client_id'], 'case_id' => $after['id'], 'type' => 'system',
            'summary' => 'Mortgage completed' . ($after['fixed_rate_end_date'] ? '. Fixed rate ends ' . date('j M Y', strtotime($after['fixed_rate_end_date'])) : ''),
            'user_id' => $u ? $u['id'] : null, 'user_name' => $u ? $u['full_name'] : null, 'created_at' => crm_now(),
        ]);
    }
}

/** After a lead is created: a "contact lead" task for its adviser. */
function crm_lead_after_create(array $lead)
{
    // Not for an import without "Create a contact task", nor for a lead saved as already contacted, qualified or lost.
    if (!empty($GLOBALS['crm_skip_lead_task']) || $lead['status'] !== 'new') {
        return;
    }
    $u = isset($GLOBALS['crm_user']) ? $GLOBALS['crm_user'] : null;
    crm_auto_task((int) $lead['office_id'], 'leadcontact:' . $lead['id'], [
        'title' => 'Contact new lead: ' . trim($lead['first_name'] . ' ' . $lead['last_name']) . ' (' . $lead['rating'] . ')',
        'notes' => 'New ' . crm_label('enquiry_type', $lead['enquiry_type']) . ' enquiry' . ($lead['source'] ? ' from ' . crm_label('source', $lead['source']) : '') . '. Make first contact.',
        'assigned_to' => $lead['adviser_id'] ?: ($u && $u['role'] !== 'sales' ? $u['id'] : null),
        'lead_id' => $lead['id'],
        'priority' => $lead['rating'] === 'HOT' ? 'high' : 'normal',
        'due_date' => crm_today(),
    ]);
}
