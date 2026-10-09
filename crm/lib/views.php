<?php
/* MAP CRM: screens (dashboard, pipeline, radar, reports...), search, notifications, backups, import. */
if (!defined('MAP_CRM')) {
    http_response_code(404);
    exit;
}

function crm_iso_days_ago($days)
{
    return gmdate('Y-m-d\TH:i:s\Z', time() - $days * 86400);
}

/** Text for a LIKE ... ESCAPE '\' pattern: %, _ and the backslash itself match only themselves. */
function crm_views_like_escape($s)
{
    return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], (string) $s);
}

/** A local (UK) date's midnight as a UTC timestamp, to compare with created_at-style columns. */
function crm_views_local_midnight_utc($date)
{
    return gmdate('Y-m-d\TH:i:s\Z', strtotime($date . ' 00:00:00'));
}

/** SQL leaving out an opportunity ($a is its table alias) about a case in the trash, as one about a client in the trash is. */
function crm_views_opportunity_case_and($a)
{
    return " AND NOT EXISTS (SELECT 1 FROM cases tk WHERE tk.id = $a.case_id AND tk.office_id = $a.office_id AND tk.deleted_at IS NOT NULL)";
}

/** Open opportunities as the Opportunities screen counts them (clients and cases in the trash left out; no remortgages for protection-only advisers). */
function crm_views_open_opportunities($officeId)
{
    return (int) crm_val("SELECT COUNT(*) FROM opportunities op LEFT JOIN clients c ON c.id = op.client_id AND c.office_id = op.office_id
        WHERE op.office_id = ? AND op.status = 'open' AND (c.id IS NULL OR c.deleted_at IS NULL)" . crm_views_opportunity_case_and('op')
        . (crm_protection_only() ? " AND op.type <> 'remortgage'" : ''), [$officeId]);
}

/**
 * An opportunity's detail as a protection-only adviser sees it: the engine's wording mentions the client's mortgage.
 * $plain rewords it whoever asks, for text a protection-only adviser may read later (e.g. a task's notes).
 */
function crm_views_opportunity_detail(array $op, $plain = false)
{
    if ((!$plain && !crm_protection_only()) || $op['detail'] === null || $op['detail'] === '') {
        return $op['detail'];
    }
    $resolved = ' (resolved automatically)';
    $suffix = substr($op['detail'], -strlen($resolved)) === $resolved ? $resolved : '';
    $plain = [
        'protection_gap' => 'No life, critical illness or income protection on file.',
        'landlord_cover' => 'Landlord client with no landlord insurance on file.',
        'home_insurance' => 'No home insurance on file.',
    ];
    if (isset($plain[$op['type']])) {
        return $plain[$op['type']] . $suffix;
    }
    if ($op['type'] === 'review_due' && strpos($op['detail'], 'Annual review date') !== 0) {
        return 'No contact for over a year.' . $suffix;
    }
    return $op['detail'];
}

/** Active cases of the office with risk worked out (used by several screens). */
function crm_active_cases($officeId, $mineUserId = 0)
{
    $sql = "SELECT k.*, c.first_name || ' ' || c.last_name AS client_name FROM cases k JOIN clients c ON c.id = k.client_id AND c.office_id = k.office_id AND c.deleted_at IS NULL
        WHERE k.office_id = ? AND k.deleted_at IS NULL AND k.status = 'active'";
    $p = [$officeId];
    if ($mineUserId) {
        $sql .= ' AND (k.adviser_id = ? OR k.administrator_id = ?)';
        array_push($p, $mineUserId, $mineUserId);
    }
    $rows = crm_all($sql . ' ORDER BY k.updated_at DESC', $p);
    $ctx = crm_case_context($officeId);
    foreach ($rows as $i => $r) {
        $rows[$i] = crm_decorate('cases', $r, $ctx);
    }
    return $rows;
}

/** Dashboard for protection-only advisers: cover, quotes and renewals, no mortgage figures. */
function crm_dashboard_protection()
{
    $o = crm_office_id();
    $me = (int) crm_user()['id'];
    $today = crm_today();
    $p = crm_one("SELECT SUM(CASE WHEN status = 'on_risk' THEN 1 ELSE 0 END) AS in_force,
            COALESCE(SUM(CASE WHEN status = 'on_risk' THEN premium ELSE 0 END), 0) AS premiums,
            SUM(CASE WHEN status IN ('quote','applied') THEN 1 ELSE 0 END) AS quotes,
            SUM(CASE WHEN status = 'quote' AND COALESCE(quote_date, substr(created_at, 1, 10)) <= ? THEN 1 ELSE 0 END) AS quiet
        FROM policies WHERE office_id = ? AND deleted_at IS NULL", [crm_add_days($today, -14), $o]);
    $kpis = [
        'new_leads_7d' => (int) crm_val('SELECT COUNT(*) FROM leads WHERE office_id = ? AND deleted_at IS NULL AND created_at >= ?' . crm_protection_and('leads', 'leads'), [$o, crm_iso_days_ago(7)]),
        'hot_leads' => (int) crm_val("SELECT COUNT(*) FROM leads WHERE office_id = ? AND deleted_at IS NULL AND rating = 'HOT' AND status IN ('new','contacted','qualified')" . crm_protection_and('leads', 'leads'), [$o]),
        'policies_in_force' => (int) $p['in_force'],
        'premiums' => (float) $p['premiums'],
        'open_quotes' => (int) $p['quotes'],
        'tasks_overdue' => (int) crm_val("SELECT COUNT(*) FROM tasks WHERE office_id = ? AND deleted_at IS NULL AND status = 'open' AND due_date < ?" . crm_protection_and('tasks', 'tasks'), [$o, $today]),
        'tasks_today' => (int) crm_val("SELECT COUNT(*) FROM tasks WHERE office_id = ? AND deleted_at IS NULL AND status = 'open' AND due_date = ?" . crm_protection_and('tasks', 'tasks'), [$o, $today]),
        'renewals_30' => (int) crm_val("SELECT COUNT(*) FROM policies WHERE office_id = ? AND deleted_at IS NULL AND status = 'on_risk' AND renewal_date BETWEEN ? AND ?", [$o, $today, crm_add_days($today, 30)]),
        'opportunities' => crm_views_open_opportunities($o),
    ];
    $r = [];
    $n = (int) crm_val("SELECT COUNT(*) FROM leads WHERE office_id = ? AND deleted_at IS NULL AND status = 'new' AND rating = 'HOT'" . crm_protection_and('leads', 'leads'), [$o]);
    if ($n) {
        $r[] = ['level' => 'high', 'text' => $n . ' HOT lead' . ($n > 1 ? 's are' : ' is') . ' waiting for first contact', 'link' => '#/leads?rating=HOT&status=new'];
    }
    if ($kpis['tasks_overdue']) {
        $r[] = ['level' => 'high', 'text' => $kpis['tasks_overdue'] . ' overdue task' . ($kpis['tasks_overdue'] > 1 ? 's' : ''), 'link' => '#/tasks?due=overdue'];
    }
    if ($kpis['renewals_30']) {
        $r[] = ['level' => 'medium', 'text' => $kpis['renewals_30'] . ' renewal' . ($kpis['renewals_30'] > 1 ? 's' : '') . ' due in the next 30 days', 'link' => '#/protection?status=renewals'];
    }
    if ((int) $p['quiet']) {
        $r[] = ['level' => 'medium', 'text' => (int) $p['quiet'] . ' quote' . ((int) $p['quiet'] > 1 ? 's have' : ' has') . ' been waiting over 14 days', 'link' => '#/protection?status=quotes'];
    }
    if ($kpis['opportunities']) {
        $r[] = ['level' => 'info', 'text' => $kpis['opportunities'] . ' open opportunit' . ($kpis['opportunities'] > 1 ? 'ies' : 'y') . ' to follow up', 'link' => '#/opportunities'];
    }
    $myTasks = crm_all("SELECT t.*, c.first_name || ' ' || c.last_name AS client_name, l.first_name || ' ' || l.last_name AS lead_name
        FROM tasks t LEFT JOIN clients c ON c.id = t.client_id AND c.office_id = t.office_id LEFT JOIN leads l ON l.id = t.lead_id AND l.office_id = t.office_id
        WHERE t.office_id = ? AND t.deleted_at IS NULL AND t.status = 'open' AND t.assigned_to = ? AND (t.due_date IS NULL OR t.due_date <= ?)" . crm_protection_and('tasks', 't') . "
        ORDER BY t.due_date IS NULL, t.due_date, CASE t.priority WHEN 'high' THEN 0 ELSE 1 END LIMIT 20", [$o, $me, $today]);
    $recent = crm_all("SELECT a.*, c.first_name || ' ' || c.last_name AS client_name, l.first_name || ' ' || l.last_name AS lead_name FROM activities a
        LEFT JOIN clients c ON c.id = a.client_id AND c.office_id = a.office_id LEFT JOIN leads l ON l.id = a.lead_id AND l.office_id = a.office_id
        WHERE a.office_id = ? AND a.deleted_at IS NULL" . crm_protection_and('activities', 'a') . " AND (a.policy_id IS NOT NULL OR a.lead_id IS NOT NULL OR a.user_id = ?)
        AND (c.id IS NULL OR c.deleted_at IS NULL) AND (l.id IS NULL OR l.deleted_at IS NULL)
        ORDER BY a.created_at DESC, a.id DESC LIMIT 12", [$o, $me]);
    crm_ok(['mode' => 'protection', 'kpis' => $kpis, 'reminders' => $r, 'my_tasks' => $myTasks, 'recent' => $recent]);
}

/** GET dashboard: today's key numbers and what needs attention now. */
function crm_action_dashboard()
{
    if (crm_protection_only()) {
        crm_dashboard_protection();
    }
    $o = crm_office_id();
    $u = crm_user();
    $me = (int) $u['id'];
    $today = crm_today();
    $month = date('Y-m-01');
    $cases = crm_active_cases($o);
    $high = array_values(array_filter($cases, function ($c) {
        return $c['risk']['level'] === 'high';
    }));
    $red = count(array_filter($cases, function ($c) {
        return $c['compliance_eval']['rating'] === 'red';
    }));
    $quiet = count(array_filter($cases, function ($c) {
        return $c['risk']['last_touch_days'] >= (int) crm_setting('quiet_days', '14');
    }));
    $stageCounts = [];
    foreach (CRM_STAGES as $s) {
        $stageCounts[$s] = ['count' => 0, 'value' => 0];
    }
    $pipelineValue = 0;
    foreach ($cases as $c) {
        $stageCounts[$c['stage']]['count']++;
        $stageCounts[$c['stage']]['value'] += (float) $c['loan_amount'];
        $pipelineValue += (float) $c['loan_amount'];
    }
    $comp = crm_one("SELECT COUNT(*) AS n, COALESCE(SUM(loan_amount), 0) AS v, COALESCE(SUM(COALESCE(proc_fee,0) + COALESCE(broker_fee,0)), 0) AS fees
        FROM cases WHERE office_id = ? AND deleted_at IS NULL AND status = 'completed' AND completion_date >= ?", [$o, $month]);
    $kpis = [
        'new_leads_7d' => (int) crm_val('SELECT COUNT(*) FROM leads WHERE office_id = ? AND deleted_at IS NULL AND created_at >= ?', [$o, crm_iso_days_ago(7)]),
        'hot_leads' => (int) crm_val("SELECT COUNT(*) FROM leads WHERE office_id = ? AND deleted_at IS NULL AND rating = 'HOT' AND status IN ('new','contacted','qualified')", [$o]),
        'active_cases' => count($cases),
        'pipeline_value' => $pipelineValue,
        'completions_month' => (int) $comp['n'],
        'completions_value' => (float) $comp['v'],
        'fees_month' => (float) $comp['fees'],
        'tasks_overdue' => (int) crm_val("SELECT COUNT(*) FROM tasks WHERE office_id = ? AND deleted_at IS NULL AND status = 'open' AND due_date < ?", [$o, $today]),
        'tasks_today' => (int) crm_val("SELECT COUNT(*) FROM tasks WHERE office_id = ? AND deleted_at IS NULL AND status = 'open' AND due_date = ?", [$o, $today]),
        'renewals_30' => (int) crm_val("SELECT COUNT(*) FROM policies WHERE office_id = ? AND deleted_at IS NULL AND status = 'on_risk' AND renewal_date BETWEEN ? AND ?", [$o, $today, crm_add_days($today, 30)]),
        'at_risk' => count($high),
        'opportunities' => crm_views_open_opportunities($o),
        'remortgage_6m' => (int) crm_val("SELECT COUNT(*) FROM cases k JOIN clients c ON c.id = k.client_id AND c.office_id = k.office_id AND c.deleted_at IS NULL AND c.erased_at IS NULL WHERE k.office_id = ? AND k.deleted_at IS NULL AND k.status = 'completed' AND k.fixed_rate_end_date BETWEEN ? AND ?", [$o, $today, crm_add_days($today, 183)]),
    ];

    $r = [];
    $n = (int) crm_val("SELECT COUNT(*) FROM leads WHERE office_id = ? AND deleted_at IS NULL AND status = 'new' AND rating = 'HOT'", [$o]);
    if ($n) {
        $r[] = ['level' => 'high', 'text' => $n . ' HOT lead' . ($n > 1 ? 's are' : ' is') . ' waiting for first contact', 'link' => '#/leads?rating=HOT&status=new'];
    }
    $n = (int) crm_val("SELECT COUNT(*) FROM leads WHERE office_id = ? AND deleted_at IS NULL AND status = 'new' AND created_at < ?", [$o, crm_iso_days_ago(2)]);
    if ($n) {
        $r[] = ['level' => 'medium', 'text' => $n . ' lead' . ($n > 1 ? 's have' : ' has') . ' not been contacted for over 2 days', 'link' => '#/leads?status=new'];
    }
    if ($kpis['tasks_overdue']) {
        $r[] = ['level' => 'high', 'text' => $kpis['tasks_overdue'] . ' overdue task' . ($kpis['tasks_overdue'] > 1 ? 's' : ''), 'link' => '#/tasks?due=overdue'];
    }
    if ($high) {
        $r[] = ['level' => 'high', 'text' => count($high) . ' case' . (count($high) > 1 ? 's are' : ' is') . ' rated high risk', 'link' => '#/pipeline?risk=high'];
    }
    $n = 0;
    foreach ($cases as $c) {
        if ($c['offer_expiry_date'] && $c['offer_expiry_date'] >= $today && $c['offer_expiry_date'] <= crm_add_days($today, 14)) {
            $n++;
        }
    }
    if ($n) {
        $r[] = ['level' => 'high', 'text' => $n . ' mortgage offer' . ($n > 1 ? 's expire' : ' expires') . ' within 14 days', 'link' => '#/pipeline'];
    }
    if ($quiet) {
        $r[] = ['level' => 'medium', 'text' => $quiet . ' case' . ($quiet > 1 ? 's have' : ' has') . ' gone quiet', 'link' => '#/reports?tab=quiet'];
    }
    if ($red) {
        $r[] = ['level' => 'medium', 'text' => $red . ' case' . ($red > 1 ? 's are' : ' is') . ' Red on compliance', 'link' => '#/compliance'];
    }
    if ($kpis['renewals_30']) {
        $r[] = ['level' => 'medium', 'text' => $kpis['renewals_30'] . ' insurance renewal' . ($kpis['renewals_30'] > 1 ? 's' : '') . ' due in the next 30 days', 'link' => '#/protection?status=renewals'];
    }
    // Counted as the radar's "Within 3 months" column counts them (92 days, erased clients left out).
    $n = (int) crm_val("SELECT COUNT(*) FROM cases k JOIN clients c ON c.id = k.client_id AND c.office_id = k.office_id AND c.deleted_at IS NULL AND c.erased_at IS NULL WHERE k.office_id = ? AND k.deleted_at IS NULL AND k.status = 'completed' AND k.fixed_rate_end_date BETWEEN ? AND ?", [$o, $today, crm_add_days($today, 92)]);
    if ($n) {
        $r[] = ['level' => 'medium', 'text' => $n . ' client' . ($n > 1 ? 's\' fixed rates end' : '\'s fixed rate ends') . ' within 3 months', 'link' => '#/radar'];
    }
    // Only documents still needed: not on a lost or completed case, nor for a client in the trash.
    $n = (int) crm_val("SELECT COUNT(*) FROM documents d LEFT JOIN cases k ON k.id = d.case_id AND k.office_id = d.office_id LEFT JOIN clients c ON c.id = d.client_id AND c.office_id = d.office_id
        WHERE d.office_id = ? AND d.deleted_at IS NULL AND d.status = 'requested' AND d.requested_at <= ?
        AND (d.case_id IS NULL OR (k.status = 'active' AND k.deleted_at IS NULL)) AND (c.id IS NULL OR c.deleted_at IS NULL)", [$o, crm_add_days($today, -14)]);
    if ($n) {
        $r[] = ['level' => 'medium', 'text' => $n . ' document' . ($n > 1 ? 's' : '') . ' requested over 14 days ago and not yet received', 'link' => '#/documents?status=requested'];
    }
    if ($kpis['opportunities']) {
        $r[] = ['level' => 'info', 'text' => $kpis['opportunities'] . ' open opportunit' . ($kpis['opportunities'] > 1 ? 'ies' : 'y') . ' to follow up', 'link' => '#/opportunities'];
    }

    $myTasks = crm_all("SELECT t.*, c.first_name || ' ' || c.last_name AS client_name, l.first_name || ' ' || l.last_name AS lead_name
        FROM tasks t LEFT JOIN clients c ON c.id = t.client_id AND c.office_id = t.office_id LEFT JOIN leads l ON l.id = t.lead_id AND l.office_id = t.office_id
        WHERE t.office_id = ? AND t.deleted_at IS NULL AND t.status = 'open' AND t.assigned_to = ? AND (t.due_date IS NULL OR t.due_date <= ?)
        ORDER BY t.due_date IS NULL, t.due_date, CASE t.priority WHEN 'high' THEN 0 ELSE 1 END LIMIT 20", [$o, $me, $today]);
    $myRisk = array_slice(array_values(array_filter($cases, function ($c) use ($me) {
        return $c['risk']['level'] !== 'low' && ((int) $c['adviser_id'] === $me || (int) $c['administrator_id'] === $me);
    })), 0, 8);
    $recent = crm_all("SELECT a.*, c.first_name || ' ' || c.last_name AS client_name, l.first_name || ' ' || l.last_name AS lead_name FROM activities a
        LEFT JOIN clients c ON c.id = a.client_id AND c.office_id = a.office_id LEFT JOIN leads l ON l.id = a.lead_id AND l.office_id = a.office_id
        WHERE a.office_id = ? AND a.deleted_at IS NULL AND (c.id IS NULL OR c.deleted_at IS NULL) AND (l.id IS NULL OR l.deleted_at IS NULL)
        ORDER BY a.created_at DESC, a.id DESC LIMIT 12", [$o]);
    crm_ok([
        'kpis' => $kpis, 'reminders' => $r, 'my_tasks' => $myTasks, 'my_risk' => $myRisk,
        'at_risk' => array_slice($high, 0, 8), 'stages' => $stageCounts, 'recent' => $recent,
    ]);
}

/** GET pipeline: every live case from enquiry to completion with its risk rating. */
function crm_action_pipeline()
{
    $o = crm_office_id();
    $mine = crm_in('mine') === '1' ? (int) crm_user()['id'] : 0;
    $rows = crm_active_cases($o, $mine);
    $p = [$o, crm_add_days(crm_today(), -30)];
    if ($mine) {
        array_push($p, $mine, $mine);
    }
    $recent = crm_all("SELECT k.*, c.first_name || ' ' || c.last_name AS client_name FROM cases k JOIN clients c ON c.id = k.client_id AND c.office_id = k.office_id AND c.deleted_at IS NULL
        WHERE k.office_id = ? AND k.deleted_at IS NULL AND k.status = 'completed' AND k.completion_date >= ?" . ($mine ? ' AND (k.adviser_id = ? OR k.administrator_id = ?)' : '') . '
        ORDER BY k.completion_date DESC LIMIT 50', $p);
    $ctx = crm_case_context($o);
    foreach ($recent as $i => $r) {
        $recent[$i] = crm_decorate('cases', $r, $ctx);
    }
    crm_ok(['rows' => $rows, 'completed' => $recent]);
}

/** GET radar: clients grouped by when their fixed rate ends. */
function crm_action_radar()
{
    $o = crm_office_id();
    $today = crm_today();
    $rows = crm_all("SELECT k.id, k.client_id, k.lender, k.product, k.loan_amount, k.rate, k.rate_type, k.fixed_rate_end_date, k.completion_date, k.case_type, k.adviser_id,
            c.first_name || ' ' || c.last_name AS client_name, c.phone, c.email,
            (SELECT o.status FROM opportunities o WHERE o.office_id = k.office_id AND o.case_id = k.id AND o.type = 'remortgage' ORDER BY o.id DESC LIMIT 1) AS opportunity_status
        FROM cases k JOIN clients c ON c.id = k.client_id AND c.office_id = k.office_id AND c.deleted_at IS NULL AND c.erased_at IS NULL
        WHERE k.office_id = ? AND k.deleted_at IS NULL AND k.status = 'completed' AND k.fixed_rate_end_date IS NOT NULL
        ORDER BY k.fixed_rate_end_date", [$o]);
    $buckets = ['ended' => [], 'm3' => [], 'm6' => [], 'm12' => [], 'm24' => [], 'later' => []];
    foreach ($rows as $r) {
        $d = crm_days_between($today, $r['fixed_rate_end_date']);
        $r['days_left'] = $d;
        if ($d < 0) {
            $k = 'ended';
        } elseif ($d <= 92) {
            $k = 'm3';
        } elseif ($d <= 183) {
            $k = 'm6';
        } elseif ($d <= 365) {
            $k = 'm12';
        } elseif ($d <= 730) {
            $k = 'm24';
        } else {
            $k = 'later';
        }
        $buckets[$k][] = $r;
    }
    // Tracker, variable and discount rates have no fixed-rate end date to add.
    $missing = (int) crm_val("SELECT COUNT(*) FROM cases WHERE office_id = ? AND deleted_at IS NULL AND status = 'completed' AND fixed_rate_end_date IS NULL
        AND case_type NOT IN ('bridging','equity_release') AND COALESCE(NULLIF(rate_type, ''), 'fixed') = 'fixed'", [$o]);
    crm_ok(['buckets' => $buckets, 'missing_end_date' => $missing]);
}

/** GET opportunities: ?status=open|actioned|dismissed|all&type= */
function crm_action_opportunities()
{
    $o = crm_office_id();
    $status = crm_in_str('status', 20, 'open');
    $sql = "SELECT op.*, c.first_name || ' ' || c.last_name AS client_name, c.adviser_id, c.phone, c.email FROM opportunities op
        LEFT JOIN clients c ON c.id = op.client_id AND c.office_id = op.office_id WHERE op.office_id = ? AND (c.id IS NULL OR c.deleted_at IS NULL)"
        . crm_views_opportunity_case_and('op');
    $p = [$o];
    if ($status !== 'all') {
        $sql .= ' AND op.status = ?';
        $p[] = $status;
    }
    if (crm_protection_only()) {
        $sql .= " AND op.type <> 'remortgage'";
    }
    if ($t = crm_in_str('type', 30)) {
        $sql .= ' AND op.type = ?';
        $p[] = $t;
    }
    $rows = crm_all($sql . ' ORDER BY op.due_date IS NULL, op.due_date, op.created_at DESC LIMIT 2000', $p);
    foreach ($rows as $i => $r) {
        $rows[$i]['detail'] = crm_views_opportunity_detail($r);
    }
    $counts = [];
    foreach (crm_all("SELECT op.type, COUNT(*) AS n FROM opportunities op LEFT JOIN clients c ON c.id = op.client_id AND c.office_id = op.office_id
            WHERE op.office_id = ? AND op.status = 'open' AND (c.id IS NULL OR c.deleted_at IS NULL)" . crm_views_opportunity_case_and('op')
            . (crm_protection_only() ? " AND op.type <> 'remortgage'" : '') . ' GROUP BY op.type', [$o]) as $c) {
        $counts[$c['type']] = (int) $c['n'];
    }
    crm_ok(['rows' => $rows, 'counts' => $counts]);
}

/** POST opportunityAct: { id, action: task|actioned|dismissed|open, due_date? } */
function crm_action_opportunity_act()
{
    $o = crm_office_id();
    $u = crm_user();
    $id = crm_in_int('id');
    $action = crm_in_str('action', 20);
    // Protection-only advisers can't see or act on remortgage opportunities, nor anyone on one whose case is in the trash
    // (as on the Opportunities screen).
    $op = crm_one('SELECT * FROM opportunities WHERE id = ? AND office_id = ?' . crm_views_opportunity_case_and('opportunities')
        . (crm_protection_only() ? " AND type <> 'remortgage'" : ''), [$id, $o]);
    if (!$op) {
        crm_fail(404, 'not_found', 'That opportunity could not be found.');
    }
    $taskId = null;
    crm_tx(function () use ($op, $action, $u, &$taskId) {
        if ($action === 'task') {
            $due = crm_in_str('due_date', 10) ?: crm_today();
            $adviser = $op['client_id'] ? crm_val('SELECT adviser_id FROM clients WHERE id = ?', [$op['client_id']]) : null;
            $caseId = crm_entity_still_valid('tasks', 'case_id', $op['case_id']);
            // A task on a case is mortgage work: not for a client's adviser who gives protection advice only (they would never see it).
            if ($caseId && $adviser && crm_val('SELECT advice_type FROM users WHERE id = ?', [(int) $adviser]) === 'protection') {
                $adviser = null;
            }
            $t = crm_save_record('tasks', 0, [
                // A task with no case may be seen by protection-only advisers: its notes never mention the mortgage.
                'title' => 'Follow up opportunity: ' . $op['title'], 'notes' => $caseId ? $op['detail'] : crm_views_opportunity_detail($op, true), 'due_date' => $due,
                // The client's adviser may have left: fall back rather than fail.
                'assigned_to' => crm_entity_still_valid('tasks', 'assigned_to', $adviser) ?: (int) $u['id'],
                'client_id' => crm_entity_still_valid('tasks', 'client_id', $op['client_id']),
                'case_id' => $caseId,
            ]);
            $taskId = (int) $t['id'];
            $action = 'actioned';
        }
        if (!in_array($action, ['actioned', 'dismissed', 'open'], true)) {
            crm_fail(400, 'invalid', 'Unknown action.');
        }
        crm_q('UPDATE opportunities SET status = ?, actioned_by = ?, actioned_at = ?, updated_at = ? WHERE id = ?',
            [$action, $action === 'open' ? null : $u['id'], $action === 'open' ? null : crm_now(), crm_now(), $op['id']]);
        crm_audit('opportunity', 'opportunities', (int) $op['id'], ucfirst($action) . ': ' . $op['title']);
    });
    crm_ok(['task_id' => $taskId]);
}

/** GET compliance: checklist rating for every live case (and recent completions). */
function crm_action_compliance()
{
    $o = crm_office_id();
    $rows = crm_all("SELECT k.*, c.first_name || ' ' || c.last_name AS client_name FROM cases k JOIN clients c ON c.id = k.client_id AND c.office_id = k.office_id AND c.deleted_at IS NULL
        WHERE k.office_id = ? AND k.deleted_at IS NULL AND (k.status = 'active' OR (k.status = 'completed' AND k.completion_date >= ?))", [$o, crm_add_days(crm_today(), -90)]);
    $ctx = crm_case_context($o);
    $sum = ['red' => 0, 'amber' => 0, 'green' => 0];
    foreach ($rows as $i => $r) {
        $rows[$i] = crm_decorate('cases', $r, $ctx);
        $sum[$rows[$i]['compliance_eval']['rating']]++;
    }
    $order = ['red' => 0, 'amber' => 1, 'green' => 2];
    usort($rows, function ($a, $b) use ($order) {
        $x = $order[$a['compliance_eval']['rating']] - $order[$b['compliance_eval']['rating']];
        return $x !== 0 ? $x : $b['compliance_eval']['missing'] - $a['compliance_eval']['missing'];
    });
    crm_ok(['rows' => $rows, 'summary' => $sum]);
}

/** GET documents: requested / received / expired across all cases. */
function crm_action_documents()
{
    $o = crm_office_id();
    $status = crm_in_str('status', 20);
    $sql = "SELECT d.*, c.first_name || ' ' || c.last_name AS client_name, k.case_type, k.stage FROM documents d
        LEFT JOIN clients c ON c.id = d.client_id AND c.office_id = d.office_id LEFT JOIN cases k ON k.id = d.case_id AND k.office_id = d.office_id
        WHERE d.office_id = ? AND d.deleted_at IS NULL AND (c.id IS NULL OR c.deleted_at IS NULL)";
    $p = [$o];
    if ($status !== '' && $status !== 'all') {
        $sql .= ' AND d.status = ?';
        $p[] = $status;
    }
    $rows = crm_all($sql . " ORDER BY CASE d.status WHEN 'expired' THEN 0 WHEN 'requested' THEN 1 ELSE 2 END, d.requested_at, d.id LIMIT 3000", $p);
    $sum = [];
    foreach (crm_all('SELECT status, COUNT(*) AS n FROM documents WHERE office_id = ? AND deleted_at IS NULL GROUP BY status', [$o]) as $r) {
        $sum[$r['status']] = (int) $r['n'];
    }
    crm_ok(['rows' => $rows, 'summary' => $sum]);
}

/** GET calendar: ?from=&to= tasks plus key dates (completions, offer expiries, renewals, fixed rate ends, reviews). */
function crm_action_calendar()
{
    $o = crm_office_id();
    $today = crm_today();
    $from = crm_in_str('from', 10);
    $to = crm_in_str('to', 10);
    if (!crm_valid_date($from)) {
        $from = date('Y-m-01');
    }
    if (!crm_valid_date($to) || $to < $from) {
        $to = crm_add_days($today, 60);
    }
    if (crm_days_between($from, $to) > 400) {
        $to = crm_add_days($from, 400);
    }
    $mine = crm_in('mine') === '1' ? (int) crm_user()['id'] : 0;
    $items = [];
    $sql = "SELECT t.id, t.title, t.due_date, t.priority, t.assigned_to, t.client_id, t.lead_id, t.case_id, t.status FROM tasks t
        WHERE t.office_id = ? AND t.deleted_at IS NULL AND t.status = 'open' AND t.due_date IS NOT NULL AND t.due_date <= ? AND (t.due_date >= ? OR t.due_date < ?)" . crm_protection_and('tasks', 't');
    $p = [$o, $to, $from, $today];
    if ($mine) {
        $sql .= ' AND t.assigned_to = ?';
        $p[] = $mine;
    }
    foreach (crm_all($sql, $p) as $t) {
        $items[] = ['date' => $t['due_date'], 'kind' => 'task', 'title' => $t['title'], 'id' => (int) $t['id'], 'priority' => $t['priority'],
            'overdue' => $t['due_date'] < $today, 'user_id' => $t['assigned_to'], 'client_id' => $t['client_id'], 'lead_id' => $t['lead_id']];
    }
    $who = "c.first_name || ' ' || c.last_name";
    $mineSql = $mine ? ' AND (k.adviser_id = ' . $mine . ' OR k.administrator_id = ' . $mine . ')' : '';
    $dates = [
        ['expected_completion_date', "k.status = 'active'", 'completion', 'Expected completion'],
        ['offer_expiry_date', "k.status = 'active'", 'offer_expiry', 'Offer expires'],
        ['completion_date', "k.status = 'completed'", 'completed', 'Completed'],
        ['fixed_rate_end_date', "k.status = 'completed'", 'rate_end', 'Fixed rate ends'],
    ];
    foreach (crm_protection_only() ? [] : $dates as $d) {
        foreach (crm_all("SELECT k.id, k.client_id, k.{$d[0]} AS dt, $who AS name FROM cases k JOIN clients c ON c.id = k.client_id AND c.office_id = k.office_id AND c.deleted_at IS NULL
                WHERE k.office_id = ? AND k.deleted_at IS NULL AND {$d[1]} AND k.{$d[0]} BETWEEN ? AND ?$mineSql", [$o, $from, $to]) as $r) {
            $items[] = ['date' => $r['dt'], 'kind' => $d[2], 'title' => $d[3] . ': ' . $r['name'], 'case_id' => (int) $r['id'], 'client_id' => (int) $r['client_id']];
        }
    }
    // "Mine only": renewals of my policies (or of my clients' policies with no adviser), reviews of my clients.
    foreach (crm_all("SELECT p.id, p.client_id, p.renewal_date, p.policy_type, $who AS name FROM policies p JOIN clients c ON c.id = p.client_id AND c.office_id = p.office_id AND c.deleted_at IS NULL
            WHERE p.office_id = ? AND p.deleted_at IS NULL AND p.status = 'on_risk' AND p.renewal_date BETWEEN ? AND ?"
            . ($mine ? ' AND (p.adviser_id = ? OR (p.adviser_id IS NULL AND c.adviser_id = ?))' : ''), $mine ? [$o, $from, $to, $mine, $mine] : [$o, $from, $to]) as $r) {
        $items[] = ['date' => $r['renewal_date'], 'kind' => 'renewal', 'title' => crm_label('policy_type', $r['policy_type']) . ' renewal: ' . $r['name'], 'policy_id' => (int) $r['id'], 'client_id' => (int) $r['client_id']];
    }
    foreach (crm_all("SELECT c.id, c.next_review_date, $who AS name FROM clients c WHERE c.office_id = ? AND c.deleted_at IS NULL AND c.next_review_date BETWEEN ? AND ?"
            . ($mine ? ' AND (c.adviser_id = ? OR c.administrator_id = ?)' : ''), $mine ? [$o, $from, $to, $mine, $mine] : [$o, $from, $to]) as $r) {
        $items[] = ['date' => $r['next_review_date'], 'kind' => 'review', 'title' => 'Review due: ' . $r['name'], 'client_id' => (int) $r['id']];
    }
    usort($items, function ($a, $b) {
        return strcmp($a['date'], $b['date']);
    });
    crm_ok(['items' => $items, 'from' => $from, 'to' => $to]);
}

/** GET introducerStats: referrals and conversions for every introducer, counted automatically. */
function crm_action_introducer_stats()
{
    $o = crm_office_id();
    $rows = crm_all('SELECT * FROM introducers WHERE office_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE', [$o]);
    $leads = [];
    // Protection-only advisers count only the leads they can see, and get no mortgage completions, lending or fees.
    foreach (crm_all("SELECT introducer_id, COUNT(*) AS n, SUM(CASE WHEN client_id IS NOT NULL THEN 1 ELSE 0 END) AS conv, MAX(created_at) AS last_at
            FROM leads WHERE office_id = ? AND deleted_at IS NULL AND introducer_id IS NOT NULL" . crm_protection_and('leads', 'leads') . ' GROUP BY introducer_id', [$o]) as $r) {
        $leads[$r['introducer_id']] = $r;
    }
    $direct = [];
    foreach (crm_all('SELECT introducer_id, COUNT(*) AS n, MAX(created_at) AS last_at FROM clients WHERE office_id = ? AND deleted_at IS NULL AND introducer_id IS NOT NULL AND lead_id IS NULL GROUP BY introducer_id', [$o]) as $r) {
        $direct[$r['introducer_id']] = $r;
    }
    $done = [];
    foreach (crm_protection_only() ? [] : crm_all("SELECT COALESCE(k.introducer_id, c.introducer_id) AS iid, COUNT(*) AS n, COALESCE(SUM(k.loan_amount), 0) AS lent,
            COALESCE(SUM(COALESCE(k.proc_fee,0) + COALESCE(k.broker_fee,0)), 0) AS fees
            FROM cases k JOIN clients c ON c.id = k.client_id AND c.office_id = k.office_id WHERE k.office_id = ? AND k.deleted_at IS NULL AND k.status = 'completed'
            AND COALESCE(k.introducer_id, c.introducer_id) IS NOT NULL GROUP BY iid", [$o]) as $r) {
        $done[$r['iid']] = $r;
    }
    foreach ($rows as $i => $r) {
        $l = isset($leads[$r['id']]) ? $leads[$r['id']] : ['n' => 0, 'conv' => 0, 'last_at' => null];
        $dc = isset($direct[$r['id']]) ? $direct[$r['id']] : ['n' => 0, 'last_at' => null];
        $ref = (int) $l['n'] + (int) $dc['n'];
        $conv = (int) $l['conv'] + (int) $dc['n'];
        $rows[$i]['referrals'] = $ref;
        $rows[$i]['converted'] = $conv;
        $rows[$i]['conversion'] = $ref ? round(100 * $conv / $ref) : null;
        $rows[$i]['completed'] = isset($done[$r['id']]) ? (int) $done[$r['id']]['n'] : 0;
        $rows[$i]['lent'] = isset($done[$r['id']]) ? (float) $done[$r['id']]['lent'] : 0;
        $rows[$i]['fees'] = isset($done[$r['id']]) ? (float) $done[$r['id']]['fees'] : 0;
        // The latest referral, whether it came in as a lead or straight in as a client.
        $rows[$i]['last_referral_at'] = (string) $dc['last_at'] > (string) $l['last_at'] ? $dc['last_at'] : $l['last_at'];
    }
    crm_ok(['rows' => $rows]);
}

/** GET team: workload per person so you can see who is overloaded. */
function crm_action_team()
{
    $o = crm_office_id();
    $today = crm_today();
    $threshold = (int) crm_setting('team_threshold', '30');
    // Protection-only advisers see workload from the work they can see: no mortgage cases, mortgage leads or case tasks.
    $prot = crm_protection_only();
    $users = crm_all("SELECT id, full_name, role, office_id, email, last_login_at, advice_type FROM users WHERE status = 'active' AND is_office_account = 0 AND role IN ('admin','manager','adviser','administrator')
        AND (office_id = ?" . ($prot ? '' : " OR id IN (SELECT adviser_id FROM cases WHERE office_id = ? AND status = 'active' AND deleted_at IS NULL)") . "
             OR id IN (SELECT assigned_to FROM tasks WHERE office_id = ? AND status = 'open' AND deleted_at IS NULL" . crm_protection_and('tasks', 'tasks') . ")) ORDER BY full_name", $prot ? [$o, $o] : [$o, $o, $o]);
    $out = [];
    foreach ($users as $u) {
        $id = (int) $u['id'];
        $leads = (int) crm_val("SELECT COUNT(*) FROM leads WHERE office_id = ? AND deleted_at IS NULL AND status IN ('new','contacted','qualified') AND adviser_id = ?" . crm_protection_and('leads', 'leads'), [$o, $id]);
        $cases = $prot ? 0 : (int) crm_val("SELECT COUNT(*) FROM cases WHERE office_id = ? AND deleted_at IS NULL AND status = 'active' AND (adviser_id = ? OR administrator_id = ?)", [$o, $id, $id]);
        $t = crm_one("SELECT COUNT(*) AS open, SUM(CASE WHEN due_date < ? THEN 1 ELSE 0 END) AS overdue, SUM(CASE WHEN due_date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS week
            FROM tasks WHERE office_id = ? AND deleted_at IS NULL AND status = 'open' AND assigned_to = ?" . crm_protection_and('tasks', 'tasks'), [$today, $today, crm_add_days($today, 7), $o, $id]);
        $policies = (int) crm_val("SELECT COUNT(*) FROM policies WHERE office_id = ? AND deleted_at IS NULL AND status IN ('quote','applied') AND adviser_id = ?", [$o, $id]);
        $load = $cases + 0.5 * (int) $t['open'] + 2 * (int) $t['overdue'] + 0.5 * $leads + 0.5 * $policies;
        $status = ((int) $t['overdue'] >= 5 || $load >= $threshold) ? 'overloaded' : ($load >= 0.7 * $threshold ? 'busy' : 'ok');
        $out[] = $u + ['open_leads' => $leads, 'active_cases' => $cases, 'open_tasks' => (int) $t['open'], 'overdue_tasks' => (int) $t['overdue'],
            'due_week' => (int) $t['week'], 'open_quotes' => $policies, 'load' => round($load, 1), 'status' => $status];
    }
    $unassigned = (int) crm_val("SELECT COUNT(*) FROM tasks WHERE office_id = ? AND deleted_at IS NULL AND status = 'open' AND assigned_to IS NULL" . crm_protection_and('tasks', 'tasks'), [$o]);
    crm_ok(['rows' => $out, 'threshold' => $threshold, 'unassigned_tasks' => $unassigned]);
}

/** GET reports: ?from=&to= pipeline, revenue by adviser, quiet cases, lead sources, monthly completions, lost reasons. */
function crm_action_reports()
{
    $o = crm_office_id();
    $today = crm_today();
    $from = crm_in_str('from', 10);
    $to = crm_in_str('to', 10);
    if (!crm_valid_date($from)) {
        $from = date('Y-01-01');
    }
    if (!crm_valid_date($to)) {
        $to = $today;
    }
    $cases = crm_active_cases($o);
    $pipe = [];
    foreach (CRM_STAGES as $s) {
        if ($s !== 'completed') {
            $pipe[$s] = ['stage' => $s, 'count' => 0, 'loan' => 0, 'fees' => 0, 'high' => 0];
        }
    }
    $quietDays = (int) crm_setting('quiet_days', '14');
    $quiet = [];
    foreach ($cases as $c) {
        if (!isset($pipe[$c['stage']])) {
            continue;
        }
        $pipe[$c['stage']]['count']++;
        $pipe[$c['stage']]['loan'] += (float) $c['loan_amount'];
        $pipe[$c['stage']]['fees'] += (float) $c['proc_fee'] + (float) $c['broker_fee'];
        if ($c['risk']['level'] === 'high') {
            $pipe[$c['stage']]['high']++;
        }
        if ($c['risk']['last_touch_days'] >= $quietDays) {
            $quiet[] = ['id' => $c['id'], 'client_id' => $c['client_id'], 'client_name' => $c['client_name'], 'stage' => $c['stage'], 'case_type' => $c['case_type'],
                'adviser_id' => $c['adviser_id'], 'days' => $c['risk']['last_touch_days'], 'loan_amount' => $c['loan_amount']];
        }
    }
    usort($quiet, function ($a, $b) {
        return $b['days'] - $a['days'];
    });
    $rev = [];
    foreach (crm_all("SELECT adviser_id, COUNT(*) AS n, COALESCE(SUM(loan_amount), 0) AS lent, COALESCE(SUM(proc_fee), 0) AS proc, COALESCE(SUM(broker_fee), 0) AS broker
            FROM cases WHERE office_id = ? AND deleted_at IS NULL AND status = 'completed' AND completion_date BETWEEN ? AND ? GROUP BY adviser_id", [$o, $from, $to]) as $r) {
        $rev[(int) $r['adviser_id']] = ['adviser_id' => $r['adviser_id'] ? (int) $r['adviser_id'] : null, 'completions' => (int) $r['n'], 'lent' => (float) $r['lent'],
            'proc_fees' => (float) $r['proc'], 'broker_fees' => (float) $r['broker'], 'commission' => 0, 'policies' => 0];
    }
    foreach (crm_all("SELECT adviser_id, COUNT(*) AS n, COALESCE(SUM(commission), 0) AS comm FROM policies WHERE office_id = ? AND deleted_at IS NULL
            AND status = 'on_risk' AND start_date BETWEEN ? AND ? GROUP BY adviser_id", [$o, $from, $to]) as $r) {
        $k = (int) $r['adviser_id'];
        if (!isset($rev[$k])) {
            $rev[$k] = ['adviser_id' => $k ?: null, 'completions' => 0, 'lent' => 0, 'proc_fees' => 0, 'broker_fees' => 0, 'commission' => 0, 'policies' => 0];
        }
        $rev[$k]['commission'] = (float) $r['comm'];
        $rev[$k]['policies'] = (int) $r['n'];
    }
    foreach ($rev as $k => $r) {
        $rev[$k]['total'] = $r['proc_fees'] + $r['broker_fees'] + $r['commission'];
    }
    usort($rev, function ($a, $b) {
        return $b['total'] <=> $a['total'];
    });
    // Timestamps are stored in UTC: compare them with the UK days of the report (00:30 on 1 October in summer is 23:30 UTC on 30 September).
    $fromUtc = crm_views_local_midnight_utc($from);
    $toUtc = crm_views_local_midnight_utc(crm_add_days($to, 1));
    $sources = crm_all("SELECT COALESCE(source, 'unknown') AS source, COUNT(*) AS leads, SUM(CASE WHEN client_id IS NOT NULL THEN 1 ELSE 0 END) AS converted,
            SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) AS lost, SUM(CASE WHEN rating = 'HOT' THEN 1 ELSE 0 END) AS hot
        FROM leads WHERE office_id = ? AND deleted_at IS NULL AND created_at >= ? AND created_at < ?" . crm_protection_and('leads', 'leads') . " GROUP BY COALESCE(source, 'unknown') ORDER BY leads DESC", [$o, $fromUtc, $toUtc]);
    $months = [];
    for ($i = 11; $i >= 0; $i--) {
        $m = date('Y-m', strtotime(date('Y-m-01') . " -$i months"));
        $months[$m] = ['month' => $m, 'completions' => 0, 'lent' => 0, 'fees' => 0];
    }
    foreach (crm_all("SELECT substr(completion_date, 1, 7) AS m, COUNT(*) AS n, COALESCE(SUM(loan_amount), 0) AS lent,
            COALESCE(SUM(COALESCE(proc_fee,0) + COALESCE(broker_fee,0)), 0) AS fees FROM cases WHERE office_id = ? AND deleted_at IS NULL
            AND status = 'completed' AND completion_date >= ? GROUP BY m", [$o, array_keys($months)[0] . '-01']) as $r) {
        if (isset($months[$r['m']])) {
            $months[$r['m']] = ['month' => $r['m'], 'completions' => (int) $r['n'], 'lent' => (float) $r['lent'], 'fees' => (float) $r['fees']];
        }
    }
    $lost = crm_all("SELECT COALESCE(NULLIF(lost_reason, ''), 'No reason given') AS reason, COUNT(*) AS n FROM cases WHERE office_id = ? AND deleted_at IS NULL
        AND status = 'lost' AND lost_at >= ? AND lost_at < ? GROUP BY reason ORDER BY n DESC", [$o, $fromUtc, $toUtc]);
    if (crm_protection_only()) {
        // Protection-only advisers never see mortgage figures.
        $rev = array_values(array_filter(array_map(function ($r) {
            return array_merge($r, ['completions' => 0, 'lent' => 0, 'proc_fees' => 0, 'broker_fees' => 0, 'total' => $r['commission']]);
        }, $rev), function ($r) {
            return $r['policies'] > 0;
        }));
        $pipe = $quiet = $months = $lost = [];
    }
    crm_ok(['from' => $from, 'to' => $to, 'pipeline' => array_values($pipe), 'revenue' => array_values($rev), 'quiet' => $quiet,
        'quiet_days' => $quietDays, 'sources' => $sources, 'months' => array_values($months), 'lost' => $lost]);
}

/** GET search: ?q= instant search across leads, clients, cases, policies and introducers in the office. */
function crm_action_search()
{
    $o = crm_office_id();
    $q = crm_in_str('q', 80);
    if (mb_strlen($q) < 2) {
        crm_ok(['results' => []]);
    }
    $like = '%' . crm_views_like_escape($q) . '%';
    $digits = preg_replace('/\D+/', '', $q);
    $phone = strlen($digits) >= 5 ? '%' . $digits . '%' : '__none__';
    $res = [];
    foreach (crm_all("SELECT id, first_name, last_name, email, phone, rating, status FROM leads WHERE office_id = ? AND deleted_at IS NULL AND status <> 'converted'" . crm_protection_and('leads', 'leads') . "
            AND (first_name || ' ' || last_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR REPLACE(REPLACE(phone, ' ', ''), '-', '') LIKE ?) LIMIT 8", [$o, $like, $like, $phone]) as $r) {
        $res[] = ['type' => 'lead', 'id' => (int) $r['id'], 'title' => $r['first_name'] . ' ' . $r['last_name'], 'sub' => 'Lead · ' . $r['rating'] . ' · ' . crm_label('lead_status', $r['status']), 'link' => '#/leads/' . $r['id']];
    }
    foreach (crm_all("SELECT id, first_name, last_name, email, phone, postcode FROM clients WHERE office_id = ? AND deleted_at IS NULL
            AND (first_name || ' ' || last_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR postcode LIKE ? ESCAPE '\\' OR REPLACE(REPLACE(phone, ' ', ''), '-', '') LIKE ?) LIMIT 8", [$o, $like, $like, $like, $phone]) as $r) {
        $res[] = ['type' => 'client', 'id' => (int) $r['id'], 'title' => $r['first_name'] . ' ' . $r['last_name'], 'sub' => 'Client' . ($r['postcode'] ? ' · ' . $r['postcode'] : '') . ($r['email'] ? ' · ' . $r['email'] : ''), 'link' => '#/clients/' . $r['id']];
    }
    foreach (crm_protection_only() ? [] : crm_all("SELECT k.id, k.client_id, k.case_type, k.stage, k.status, k.lender, c.first_name || ' ' || c.last_name AS name FROM cases k JOIN clients c ON c.id = k.client_id AND c.office_id = k.office_id AND c.deleted_at IS NULL
            WHERE k.office_id = ? AND k.deleted_at IS NULL AND (k.lender LIKE ? ESCAPE '\\' OR k.property_address LIKE ? ESCAPE '\\') LIMIT 6", [$o, $like, $like]) as $r) {
        $res[] = ['type' => 'case', 'id' => (int) $r['id'], 'title' => $r['name'] . ': ' . crm_label('case_type', $r['case_type']), 'sub' => 'Case · ' . crm_label('stage', $r['stage']) . ($r['lender'] ? ' · ' . $r['lender'] : ''), 'link' => '#/cases/' . $r['id']];
    }
    foreach (crm_all("SELECT p.id, p.policy_type, p.provider, p.policy_number, c.first_name || ' ' || c.last_name AS name FROM policies p JOIN clients c ON c.id = p.client_id AND c.office_id = p.office_id AND c.deleted_at IS NULL
            WHERE p.office_id = ? AND p.deleted_at IS NULL AND (p.policy_number LIKE ? ESCAPE '\\' OR p.provider LIKE ? ESCAPE '\\') LIMIT 5", [$o, $like, $like]) as $r) {
        $res[] = ['type' => 'policy', 'id' => (int) $r['id'], 'title' => $r['name'] . ': ' . crm_label('policy_type', $r['policy_type']), 'sub' => 'Policy · ' . ($r['provider'] ?: '') . ($r['policy_number'] ? ' · ' . $r['policy_number'] : ''), 'link' => '#/policies/' . $r['id']];
    }
    foreach (crm_all("SELECT id, name, company FROM introducers WHERE office_id = ? AND deleted_at IS NULL AND (name LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\') LIMIT 5", [$o, $like, $like]) as $r) {
        $res[] = ['type' => 'introducer', 'id' => (int) $r['id'], 'title' => $r['name'], 'sub' => 'Introducer' . ($r['company'] ? ' · ' . $r['company'] : ''), 'link' => '#/introducers/' . $r['id']];
    }
    crm_ok(['results' => $res]);
}

/** GET notifications: the bell. Items that need this person's attention; "unread" since they last opened it. */
function crm_action_notifications()
{
    $u = crm_user();
    $me = (int) $u['id'];
    $today = crm_today();
    $items = [];
    if (in_array($u['role'], CRM_OFFICE_ROLES, true)) {
        $o = crm_office_id();
        foreach (crm_all("SELECT id, title, due_date, priority, created_at FROM tasks WHERE office_id = ? AND deleted_at IS NULL AND status = 'open' AND assigned_to = ?
                AND due_date <= ?" . crm_protection_and('tasks', 'tasks') . " ORDER BY due_date LIMIT 25", [$o, $me, $today]) as $t) {
            // An overdue task is news from the day after it was due (or from when it was added, if later).
            $overdueAt = crm_add_days($t['due_date'], 1) . 'T00:00:00Z';
            $items[] = ['kind' => $t['due_date'] < $today ? 'overdue' : 'due', 'text' => ($t['due_date'] < $today ? 'Overdue: ' : 'Due today: ') . $t['title'],
                'link' => '#/tasks/' . $t['id'], 'at' => $t['due_date'] < $today ? max($t['created_at'], $overdueAt) : $today . 'T00:00:00Z'];
        }
        foreach (crm_all("SELECT id, first_name, last_name, rating, created_at FROM leads WHERE office_id = ? AND deleted_at IS NULL AND status = 'new' AND adviser_id = ?
                AND created_at >= ?" . crm_protection_and('leads', 'leads') . " ORDER BY created_at DESC LIMIT 10", [$o, $me, crm_iso_days_ago(3)]) as $l) {
            $items[] = ['kind' => 'lead', 'text' => 'New ' . $l['rating'] . ' lead for you: ' . $l['first_name'] . ' ' . $l['last_name'], 'link' => '#/leads/' . $l['id'], 'at' => $l['created_at']];
        }
        foreach (crm_protection_only() ? [] : crm_active_cases($o, $me) as $c) {
            if ($c['risk']['level'] === 'high') {
                $items[] = ['kind' => 'risk', 'text' => 'High risk: ' . $c['client_name'] . ': ' . $c['risk']['reason'], 'link' => '#/cases/' . $c['id'], 'at' => $c['updated_at']];
            }
        }
        foreach (crm_all("SELECT op.id, op.title, op.created_at FROM opportunities op JOIN clients c ON c.id = op.client_id AND c.office_id = op.office_id AND c.deleted_at IS NULL
                WHERE op.office_id = ? AND op.status = 'open' AND c.adviser_id = ? AND op.created_at >= ?" . crm_views_opportunity_case_and('op')
                . (crm_protection_only() ? " AND op.type <> 'remortgage'" : '') . '
                ORDER BY op.created_at DESC LIMIT 10', [$o, $me, crm_iso_days_ago(7)]) as $op) {
            $items[] = ['kind' => 'opportunity', 'text' => 'New opportunity: ' . $op['title'], 'link' => '#/opportunities', 'at' => $op['created_at']];
        }
    }
    if ($u['role'] === 'webadmin') {
        foreach (crm_all("SELECT id, full_name, email, created_at FROM users WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20") as $p) {
            $items[] = ['kind' => 'request', 'text' => 'Account request: ' . $p['full_name'] . ' (' . $p['email'] . ')', 'link' => '#logins', 'at' => $p['created_at']];
        }
    }
    if (in_array($u['role'], ['sales', 'manager', 'admin'], true)) {
        $n = (int) crm_val("SELECT COUNT(*) FROM event_contacts ec JOIN events e ON e.id = ec.event_id AND e.deleted_at IS NULL
            WHERE ec.deleted_at IS NULL AND ec.status = 'callback' AND ec.callback_at <= ?", [crm_now()]);
        if ($n && $u['role'] === 'sales') {
            $items[] = ['kind' => 'callback', 'text' => $n . ' event contact' . ($n > 1 ? 's are' : ' is') . ' due a call back', 'link' => '#/sales/queue', 'at' => crm_now()];
        }
    }
    $seen = $u['notifications_seen_at'] ?: '0000';
    $unread = 0;
    foreach ($items as $i => $it) {
        $items[$i]['unread'] = $it['at'] > $seen;
        if ($items[$i]['unread']) {
            $unread++;
        }
    }
    usort($items, function ($a, $b) {
        return strcmp($b['at'], $a['at']);
    });
    crm_ok(['items' => array_slice($items, 0, 40), 'unread' => $unread, 'total' => count($items)]);
}

function crm_action_notifications_seen()
{
    crm_q('UPDATE users SET notifications_seen_at = ? WHERE id = ?', [crm_now(), crm_user()['id']]);
    crm_ok();
}

/** GET lookup: ?surname= Quick Case Lookup across ALL offices. Shows who holds the case, not the client's details. */
function crm_action_lookup()
{
    $s = crm_in_str('surname', 60);
    if (mb_strlen($s) < 2) {
        crm_fail(400, 'invalid', 'Type at least 2 letters of the surname.', 'surname');
    }
    $like = crm_views_like_escape($s) . '%';
    $clients = crm_all("SELECT c.id, c.office_id, c.first_name, c.last_name, c.postcode, c.adviser_id, o.name AS office_name FROM clients c JOIN offices o ON o.id = c.office_id
        WHERE c.deleted_at IS NULL AND c.erased_at IS NULL AND c.last_name LIKE ? ESCAPE '\\' ORDER BY c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE LIMIT 40", [$like]);
    $mine = crm_office_id();
    $out = [];
    foreach ($clients as $c) {
        $cases = crm_all("SELECT id, case_type, stage, status, adviser_id, updated_at FROM cases WHERE client_id = ? AND deleted_at IS NULL ORDER BY status = 'active' DESC, updated_at DESC LIMIT 3", [$c['id']]);
        $out[] = [
            'client_id' => (int) $c['office_id'] === $mine ? (int) $c['id'] : null,
            'name' => $c['first_name'] . ' ' . $c['last_name'],
            'postcode_area' => $c['postcode'] ? strtoupper(preg_replace('/\s.*$/', '', $c['postcode'])) : null,
            'office' => $c['office_name'],
            'same_office' => (int) $c['office_id'] === $mine,
            'adviser' => crm_user_name($cases && $cases[0]['adviser_id'] ? $cases[0]['adviser_id'] : $c['adviser_id']),
            'cases' => array_map(function ($k) {
                return ['id' => (int) $k['id'], 'type' => crm_label('case_type', $k['case_type']), 'stage' => crm_label('stage', $k['stage']), 'status' => $k['status'], 'updated_at' => $k['updated_at']];
            }, $cases),
        ];
    }
    crm_audit('lookup', 'clients', null, 'Quick Case Lookup for surname "' . $s . '" (' . count($out) . ' found)');
    crm_ok(['results' => $out]);
}

/** GET lost: lost cases and leads (both can be reopened). */
function crm_action_lost()
{
    $o = crm_office_id();
    $cases = crm_protection_only() ? [] : crm_all("SELECT k.*, c.first_name || ' ' || c.last_name AS client_name FROM cases k JOIN clients c ON c.id = k.client_id AND c.office_id = k.office_id AND c.deleted_at IS NULL
        WHERE k.office_id = ? AND k.deleted_at IS NULL AND k.status = 'lost' ORDER BY k.lost_at DESC LIMIT 1000", [$o]);
    $leads = crm_all("SELECT * FROM leads WHERE office_id = ? AND deleted_at IS NULL AND status = 'lost'" . crm_protection_and('leads', 'leads') . ' ORDER BY lost_at DESC LIMIT 1000', [$o]);
    crm_ok(['cases' => $cases, 'leads' => $leads]);
}

/** GET trash: everything deleted in this office (items deleted along with their parent are restored with it). */
function crm_action_trash()
{
    $o = crm_office_id();
    $rows = [];
    $q = [
        'leads' => "SELECT id, first_name || ' ' || last_name AS name, deleted_at, deleted_by FROM leads t WHERE office_id = ? AND deleted_at IS NOT NULL" . crm_protection_and('leads', 't'),
        'clients' => "SELECT id, first_name || ' ' || last_name AS name, deleted_at, deleted_by FROM clients t WHERE office_id = ? AND deleted_at IS NOT NULL",
        'cases' => "SELECT t.id, (SELECT first_name || ' ' || last_name FROM clients WHERE id = t.client_id) || ': ' || t.case_type AS name, t.deleted_at, t.deleted_by FROM cases t
            WHERE t.office_id = ? AND t.deleted_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clients p WHERE p.id = t.client_id AND p.deleted_at = t.deleted_at)",
        'policies' => "SELECT t.id, (SELECT first_name || ' ' || last_name FROM clients WHERE id = t.client_id) || ': ' || t.policy_type AS name, t.deleted_at, t.deleted_by FROM policies t
            WHERE t.office_id = ? AND t.deleted_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clients p WHERE p.id = t.client_id AND p.deleted_at = t.deleted_at)",
        'tasks' => "SELECT t.id, t.title AS name, t.deleted_at, t.deleted_by FROM tasks t WHERE t.office_id = ? AND t.deleted_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM clients p WHERE p.id = t.client_id AND p.deleted_at = t.deleted_at)
            AND NOT EXISTS (SELECT 1 FROM cases p WHERE p.id = t.case_id AND p.deleted_at = t.deleted_at)
            AND NOT EXISTS (SELECT 1 FROM leads p WHERE p.id = t.lead_id AND p.deleted_at = t.deleted_at)
            AND NOT EXISTS (SELECT 1 FROM policies p WHERE p.id = t.policy_id AND p.deleted_at = t.deleted_at)" . crm_protection_and('tasks', 't'),
        'documents' => "SELECT t.id, t.name, t.deleted_at, t.deleted_by FROM documents t WHERE t.office_id = ? AND t.deleted_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM clients p WHERE p.id = t.client_id AND p.deleted_at = t.deleted_at)
            AND NOT EXISTS (SELECT 1 FROM cases p WHERE p.id = t.case_id AND p.deleted_at = t.deleted_at)",
        'introducers' => 'SELECT id, name, deleted_at, deleted_by FROM introducers t WHERE office_id = ? AND deleted_at IS NOT NULL',
        'templates' => 'SELECT id, name, deleted_at, deleted_by FROM templates t WHERE (office_id = ? OR office_id IS NULL) AND deleted_at IS NOT NULL' . crm_templates_protection_and('t'),
    ];
    if (crm_protection_only()) {
        // Protection-only advisers: no cases or documents; mortgage leads, case tasks and mortgage templates are filtered out above.
        unset($q['cases'], $q['documents']);
    }
    foreach ($q as $entity => $sql) {
        foreach (crm_all($sql . ' ORDER BY deleted_at DESC LIMIT 500', [$o]) as $r) {
            $r['entity'] = $entity;
            $rows[] = $r;
        }
    }
    usort($rows, function ($a, $b) {
        return strcmp($b['deleted_at'], $a['deleted_at']);
    });
    crm_ok(['rows' => $rows]);
}

/**
 * For protection-only logins: leaves mortgage work out of a query on audit_log ($a is the alias): case, document and
 * Quick Case Lookup lines, and lines about mortgage leads, case tasks and activities, remortgage opportunities and
 * mortgage templates (a line whose lead, task, activity or template no longer exists is left out too, as it can't be
 * checked). Returns '' for everyone else.
 */
function crm_views_audit_protection_and($a)
{
    if (!crm_protection_only()) {
        return '';
    }
    return " AND COALESCE($a.entity, '') NOT IN ('cases', 'documents') AND $a.action <> 'lookup'
        AND (COALESCE($a.entity, '') NOT IN ('leads', 'tasks', 'activities', 'opportunities', 'templates') OR $a.entity_id IS NULL
            OR ($a.entity = 'leads' AND EXISTS (SELECT 1 FROM leads WHERE leads.id = $a.entity_id" . crm_protection_and('leads', 'leads') . "))
            OR ($a.entity = 'tasks' AND EXISTS (SELECT 1 FROM tasks WHERE tasks.id = $a.entity_id" . crm_protection_and('tasks', 'tasks') . "))
            OR ($a.entity = 'activities' AND EXISTS (SELECT 1 FROM activities WHERE activities.id = $a.entity_id" . crm_protection_and('activities', 'activities') . "))
            OR ($a.entity = 'opportunities' AND EXISTS (SELECT 1 FROM opportunities WHERE opportunities.id = $a.entity_id AND opportunities.type <> 'remortgage'))
            OR ($a.entity = 'templates' AND EXISTS (SELECT 1 FROM templates WHERE templates.id = $a.entity_id" . crm_templates_protection_and('templates') . ')))';
}

/** GET audit: full change history for the office. ?entity=&entity_id=&user_id=&before= */
function crm_action_audit()
{
    $u = crm_user();
    $sql = 'SELECT a.*, o.name AS office_name FROM audit_log a LEFT JOIN offices o ON o.id = a.office_id WHERE 1 = 1' . crm_views_audit_protection_and('a');
    $p = [];
    if ($u['role'] !== 'admin' || crm_in('all') !== '1') {
        $sql .= ' AND a.office_id = ?';
        $p[] = crm_office_id();
    }
    if ($e = crm_in_str('entity', 30)) {
        $sql .= ' AND a.entity = ?';
        $p[] = $e;
    }
    if ($id = crm_in_int('entity_id')) {
        $sql .= ' AND a.entity_id = ?';
        $p[] = $id;
    }
    if ($uid = crm_in_int('user_id')) {
        $sql .= ' AND a.user_id = ?';
        $p[] = $uid;
    }
    if ($q = crm_in_str('q', 80)) {
        $sql .= " AND (a.summary LIKE ? ESCAPE '\\' OR a.user_name LIKE ? ESCAPE '\\')";
        $like = '%' . crm_views_like_escape($q) . '%';
        array_push($p, $like, $like);
    }
    if ($before = crm_in_int('before')) {
        $sql .= ' AND a.id < ?';
        $p[] = $before;
    }
    $rows = crm_all($sql . ' ORDER BY a.id DESC LIMIT 200', $p);
    foreach ($rows as $i => $r) {
        $rows[$i]['changes'] = $r['changes'] ? json_decode($r['changes'], true) : null;
    }
    crm_ok(['rows' => $rows]);
}

/** Sends a file download (bypasses the JSON answer). */
function crm_download($filename, $mime, $content)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    header('Content-Type: ' . $mime);
    header('Content-Disposition: attachment; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '-', $filename) . '"');
    header('Content-Length: ' . strlen($content));
    $GLOBALS['crm_sent'] = true;
    echo $content;
    exit;
}

/** GET backup: a JSON copy of the office's data (the admin login can download every office from the website admin panel). */
function crm_action_backup()
{
    $u = crm_user();
    $all = $u['role'] === 'admin' && crm_in('scope') === 'all';
    $o = crm_office_id();
    $tables = ['leads', 'clients', 'cases', 'policies', 'activities', 'tasks', 'documents', 'introducers', 'opportunities'];
    // A protection-only login's backup holds only the work it can see: no cases, documents, mortgage leads, case tasks
    // or remortgage opportunities. The office login (and the admin panel) still download everything.
    $prot = crm_protection_only();
    $out = ['app' => 'map-crm', 'exported_at' => crm_now(), 'exported_by' => $u['full_name'],
        'scope' => ($all ? 'all offices' : 'office') . ($prot ? ' - protection work only' : '')];
    $out['offices'] = $all ? crm_all('SELECT * FROM offices') : crm_all('SELECT * FROM offices WHERE id = ?', [$o]);
    $out['users'] = crm_all('SELECT id, username, email, full_name, role, office_id, status, last_login_at, created_at FROM users' . ($all ? '' : ' WHERE office_id = ?'), $all ? [] : [$o]);
    foreach ($tables as $t) {
        $only = $t === 'opportunities' ? ($prot ? " AND type <> 'remortgage'" : '') : crm_protection_and($t, $t);
        $out[$t] = $all ? crm_all("SELECT * FROM $t WHERE 1 = 1" . $only) : crm_all("SELECT * FROM $t WHERE office_id = ?" . $only, [$o]);
        if ($prot) {
            $out[$t] = array_map(function ($r) use ($t) {
                return crm_entities_strip_mortgage($t, $r);
            }, $out[$t]);
        }
    }
    foreach ($out['opportunities'] as $i => $op) {
        $out['opportunities'][$i]['detail'] = crm_views_opportunity_detail($op);
    }
    $out['templates'] = $all ? crm_all('SELECT * FROM templates WHERE 1 = 1' . crm_templates_protection_and('templates'))
        : crm_all('SELECT * FROM templates WHERE (office_id = ? OR office_id IS NULL)' . crm_templates_protection_and('templates'), [$o]);
    $out['audit_log'] = $all ? crm_all('SELECT * FROM audit_log a WHERE 1 = 1' . crm_views_audit_protection_and('a') . ' ORDER BY id')
        : crm_all('SELECT * FROM audit_log a WHERE office_id = ?' . crm_views_audit_protection_and('a') . ' ORDER BY id', [$o]);
    if ($all && !$prot) {
        $out['events'] = crm_all('SELECT * FROM events');
        $out['event_contacts'] = crm_all('SELECT * FROM event_contacts');
        $out['sales_calls'] = crm_all('SELECT * FROM sales_calls');
    }
    crm_audit('backup', null, null, 'Downloaded a backup (' . $out['scope'] . ')');
    $name = 'map-crm-backup-' . ($all ? 'all-offices' : strtolower(crm_val('SELECT name FROM offices WHERE id = ?', [$o]))) . '-' . date('Y-m-d-His') . '.json';
    crm_download($name, 'application/json', json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE));
}

/** POST eraseClient: { id, confirm:"ERASE" } — GDPR: removes the person's details, keeps anonymous case figures. */
function crm_action_erase_client()
{
    if (crm_in_str('confirm', 10) !== 'ERASE') {
        crm_fail(400, 'invalid', 'Type ERASE to confirm.', 'confirm');
    }
    $id = crm_in_int('id');
    crm_tx(function () use ($id) {
        $c = crm_must_find('clients', $id, true);
        $o = (int) $c['office_id'];
        $surname = (string) $c['last_name'];
        $now = crm_now();
        $me = (int) crm_user()['id'];
        crm_q("UPDATE clients SET title = NULL, first_name = 'Erased', last_name = 'client #' || id, dob = NULL, email = NULL, phone = NULL, address = NULL,
            postcode = NULL, annual_income = NULL, joint_applicant = NULL, existing_plans = NULL, notes = NULL, marketing_consent = 0,
            marital_status = NULL, dependants = NULL, employment_status = NULL, homeowner_status = NULL, is_landlord = 0, erased_at = ?,
            updated_at = ?, version = version + 1 WHERE id = ?", [$now, $now, $id]);
        $leadIds = array_map('intval', array_column(crm_all('SELECT id FROM leads WHERE office_id = ? AND (client_id = ? OR id = ?)', [$o, $id, (int) $c['lead_id']]), 'id'));
        $caseIds = array_map('intval', array_column(crm_all('SELECT id FROM cases WHERE client_id = ? AND office_id = ?', [$id, $o]), 'id'));
        $ids = function ($table, $where, array $params) {
            return array_map('intval', array_column(crm_all('SELECT id FROM ' . $table . ' WHERE ' . $where, $params), 'id'));
        };
        $leadIn = $leadIds ? implode(',', $leadIds) : '0';
        // The names the person was known by, to scrub history of records already gone for good (purged before the erase).
        $names = [trim($c['first_name'] . ' ' . $c['last_name'])];
        foreach (crm_all("SELECT first_name || ' ' || last_name AS n FROM leads WHERE id IN ($leadIn)") as $l) {
            $names[] = trim($l['n']);
        }
        $policyIds = $ids('policies', 'client_id = ? AND office_id = ?', [$id, $o]);
        $taskIds = $ids('tasks', "office_id = ? AND (client_id = ? OR lead_id IN ($leadIn))", [$o, $id]);
        $docIds = $ids('documents', 'client_id = ? AND office_id = ?', [$id, $o]);
        $actIds = $ids('activities', "office_id = ? AND (client_id = ? OR lead_id IN ($leadIn))", [$o, $id]);
        $oppIds = $ids('opportunities', 'client_id = ? AND office_id = ?', [$id, $o]);
        foreach ($leadIds as $lid) {
            $ec = crm_val('SELECT event_contact_id FROM leads WHERE id = ?', [$lid]);
            crm_q("UPDATE leads SET first_name = 'Erased', last_name = 'lead #' || id, email = NULL, phone = NULL, notes = NULL, lost_reason = NULL, employment = NULL,
                credit_issues = NULL, updated_at = ?, version = version + 1 WHERE id = ?", [$now, $lid]);
            if ($ec) {
                crm_erase_event_contact((int) $ec);
            }
        }
        // New versions, so an edit form left open during the erase can't write the details back.
        crm_q("UPDATE cases SET property_address = NULL, notes = NULL, next_action = NULL, lost_reason = NULL, updated_at = ?, version = version + 1 WHERE client_id = ?", [$now, $id]);
        crm_q("UPDATE policies SET notes = NULL, policy_number = NULL, updated_at = ?, version = version + 1 WHERE client_id = ?", [$now, $id]);
        crm_q("UPDATE activities SET summary = '[erased]', outcome = NULL WHERE client_id = ?", [$id]);
        crm_q("UPDATE tasks SET title = 'Task (client erased)', notes = NULL, updated_at = ?, version = version + 1 WHERE client_id = ?", [$now, $id]);
        crm_q("UPDATE opportunities SET title = 'Opportunity (client erased)', detail = NULL, updated_at = ? WHERE client_id = ?", [$now, $id]);
        crm_q("UPDATE documents SET notes = NULL, updated_at = ?, version = version + 1 WHERE client_id = ?", [$now, $id]);
        // Nothing can be followed up for a person who is no longer on file: close their open tasks and opportunities.
        crm_q("UPDATE tasks SET status = 'done', completed_at = ?, completed_by = ? WHERE office_id = ? AND status = 'open' AND (client_id = ? OR lead_id IN ($leadIn))",
            [$now, $me, $o, $id]);
        crm_q("UPDATE opportunities SET status = 'dismissed', actioned_by = ?, actioned_at = ?, updated_at = ? WHERE office_id = ? AND client_id = ? AND status = 'open'",
            [$me, $now, $now, $o, $id]);
        $scrub = function ($entity, array $ids) {
            if ($ids) {
                crm_q("UPDATE audit_log SET summary = '[erased]', changes = NULL WHERE entity = ? AND entity_id IN (" . implode(',', $ids) . ')', [$entity]);
            }
        };
        $scrub('clients', [$id]);
        $scrub('leads', $leadIds);
        $scrub('cases', $caseIds);
        $scrub('policies', $policyIds);
        $scrub('tasks', $taskIds);
        $scrub('documents', $docIds);
        $scrub('activities', $actIds);
        $scrub('opportunities', $oppIds);
        foreach (array_unique($names) as $name) {
            if (mb_strlen($name) < 3) {
                continue;
            }
            foreach (['leads', 'cases', 'policies', 'tasks', 'documents', 'activities', 'opportunities'] as $t) {
                crm_q("UPDATE audit_log SET summary = '[erased]', changes = NULL WHERE office_id = ? AND entity = ? AND summary LIKE ? ESCAPE '\\'
                    AND NOT EXISTS (SELECT 1 FROM $t x WHERE x.id = audit_log.entity_id)", [$o, $t, '%' . crm_views_like_escape($name) . '%']);
            }
        }
        if (mb_strlen($surname) >= 2) {
            // Quick Case Lookup searches typed the surname.
            crm_q("UPDATE audit_log SET summary = 'Quick Case Lookup [erased]' WHERE action = 'lookup' AND summary LIKE ? ESCAPE '\\'",
                ['%"' . crm_views_like_escape($surname) . '%']);
        }
        foreach ($leadIds as $lid) {
            crm_q("UPDATE activities SET summary = '[erased]', outcome = NULL WHERE lead_id = ?", [$lid]);
            crm_q("UPDATE tasks SET title = 'Task (client erased)', notes = NULL, updated_at = ?, version = version + 1 WHERE lead_id = ?", [$now, $lid]);
        }
        crm_audit('gdpr_erase', 'clients', $id, 'Personal data erased on request (client #' . $id . ')');
    });
    crm_ok();
}

/** Matches an import value against a list's keys or labels ("First-time buyer" -> ftb). */
function crm_enum_match($enum, $v)
{
    if ($v === null || $v === '') {
        return null;
    }
    $list = crm_enums()[$enum];
    $s = strtolower(trim((string) $v));
    foreach ($list as $k => $label) {
        if ($s === strtolower((string) $k) || $s === strtolower($label)) {
            return $k;
        }
    }
    foreach ($list as $k => $label) {
        if ($s !== '' && strpos(strtolower($label), $s) === 0) {
            return $k;
        }
    }
    return null;
}

/** POST importRows: { entity: leads|clients, rows:[{first_name,last_name,email,phone,...}], create_tasks } */
function crm_action_import_rows()
{
    $entity = crm_in('entity');
    if (!in_array($entity, ['leads', 'clients'], true)) {
        crm_fail(400, 'invalid', 'You can import leads or clients.');
    }
    $rows = crm_in('rows', []);
    if (!is_array($rows) || !$rows) {
        crm_fail(400, 'invalid', 'There are no rows to import.');
    }
    if (count($rows) > 5000) {
        crm_fail(400, 'invalid', 'Import up to 5,000 rows at a time.');
    }
    $o = crm_office_id();
    $GLOBALS['crm_skip_lead_task'] = crm_in('create_tasks') !== true;
    $emails = [];
    $phones = [];
    foreach (crm_all("SELECT email, phone FROM $entity WHERE office_id = ? AND deleted_at IS NULL", [$o]) as $r) {
        if ($r['email']) {
            $emails[crm_norm_email($r['email'])] = true;
        }
        if ($r['phone']) {
            $phones[crm_norm_phone($r['phone'])] = true;
        }
    }
    $added = 0;
    $dupes = 0;
    $errors = [];
    $fields = $entity === 'leads'
        ? ['first_name', 'last_name', 'email', 'phone', 'enquiry_type', 'source', 'loan_amount', 'property_value', 'deposit', 'timescale', 'employment', 'notes']
        : ['title', 'first_name', 'last_name', 'dob', 'email', 'phone', 'address', 'postcode', 'employment_status', 'annual_income', 'next_review_date', 'notes'];
    $enumFields = ['enquiry_type' => 'enquiry_type', 'source' => 'source', 'timescale' => 'timescale', 'employment' => 'employment', 'employment_status' => 'employment', 'title' => 'title'];
    crm_tx(function () use ($rows, $entity, $fields, $enumFields, &$emails, &$phones, &$added, &$dupes, &$errors) {
        foreach ($rows as $n => $raw) {
            if (!is_array($raw)) {
                continue;
            }
            if (empty($raw['first_name']) && empty($raw['last_name']) && !empty($raw['name'])) {
                $parts = preg_split('/\s+/', trim((string) $raw['name']));
                $raw['last_name'] = count($parts) > 1 ? array_pop($parts) : '';
                $raw['first_name'] = implode(' ', $parts);
            }
            $data = [];
            foreach ($fields as $f) {
                if (isset($raw[$f]) && $raw[$f] !== '') {
                    $data[$f] = isset($enumFields[$f]) ? crm_enum_match($enumFields[$f], $raw[$f]) : (is_scalar($raw[$f]) ? (string) $raw[$f] : '');
                }
            }
            if (empty($data['first_name']) && empty($data['last_name'])) {
                $errors[] = ['row' => $n + 2, 'message' => 'No name'];
                continue;
            }
            if (empty($data['last_name'])) {
                $data['last_name'] = '-';
            }
            if (empty($data['first_name'])) {
                $data['first_name'] = '-';
            }
            $e = isset($data['email']) ? crm_norm_email($data['email']) : '';
            $p = isset($data['phone']) ? crm_norm_phone($data['phone']) : '';
            if (($e !== '' && isset($emails[$e])) || ($p !== '' && isset($phones[$p]))) {
                $dupes++;
                continue;
            }
            if ($entity === 'leads' && empty($data['source'])) {
                $data['source'] = 'other';
            }
            try {
                crm_save_record($entity, 0, $data);
                $added++;
                if ($e !== '') {
                    $emails[$e] = true;
                }
                if ($p !== '') {
                    $phones[$p] = true;
                }
            } catch (CrmError $err) {
                $errors[] = ['row' => $n + 2, 'message' => (isset($err->payload['field']) ? $err->payload['field'] . ': ' : '') . $err->payload['message']];
            }
        }
    });
    crm_audit('import', $entity, null, 'Imported ' . $added . ' ' . $entity . ' from a spreadsheet (' . $dupes . ' duplicates skipped)');
    crm_ok(['added' => $added, 'duplicates' => $dupes, 'errors' => array_slice($errors, 0, 100), 'error_count' => count($errors)]);
}
