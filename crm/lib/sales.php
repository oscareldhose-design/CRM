<?php
/* MAP CRM: General Sales (events calling team): events, sign-up lists, call queue, hand-overs, results. */
if (!defined('MAP_CRM')) {
    http_response_code(404);
    exit;
}

const CRM_QUEUE_CLAIM_MINUTES = 15;
const CRM_QUEUE_MAX_ATTEMPTS = 4;
const CRM_QUEUE_RETRY_HOURS = 4;

/** Results per event: who was reached, interested, handed over and converted, and the cost per hand-over. */
function crm_sales_stats($eventId = null)
{
    $sql = "SELECT ec.event_id, COUNT(*) AS contacts,
        SUM(CASE WHEN ec.attempts > 0 THEN 1 ELSE 0 END) AS called,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM sales_calls sc WHERE sc.contact_id = ec.id AND sc.outcome NOT IN ('no_answer','voicemail','wrong_number')) THEN 1 ELSE 0 END) AS reached,
        SUM(CASE WHEN ec.status IN ('interested','handed_over') THEN 1 ELSE 0 END) AS interested,
        SUM(CASE WHEN ec.handed_lead_id IS NOT NULL THEN 1 ELSE 0 END) AS handed_over,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM leads l WHERE l.id = ec.handed_lead_id AND l.client_id IS NOT NULL) THEN 1 ELSE 0 END) AS converted,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM leads l JOIN cases k ON k.client_id = l.client_id AND k.deleted_at IS NULL AND k.status = 'completed'
            WHERE l.id = ec.handed_lead_id) THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN ec.status = 'new' THEN 1 ELSE 0 END) AS not_called,
        SUM(CASE WHEN ec.status = 'callback' THEN 1 ELSE 0 END) AS callbacks,
        SUM(CASE WHEN ec.status IN ('not_interested','do_not_call','wrong_number') THEN 1 ELSE 0 END) AS closed
        FROM event_contacts ec WHERE ec.deleted_at IS NULL";
    $p = [];
    if ($eventId) {
        $sql .= ' AND ec.event_id = ?';
        $p[] = $eventId;
    }
    $out = [];
    foreach (crm_all($sql . ' GROUP BY ec.event_id', $p) as $r) {
        foreach ($r as $k => $v) {
            $r[$k] = (int) $v;
        }
        $out[$r['event_id']] = $r;
    }
    return $out;
}

function crm_sales_event_row(array $e, array $stats)
{
    $s = isset($stats[$e['id']]) ? $stats[$e['id']] : ['contacts' => 0, 'called' => 0, 'reached' => 0, 'interested' => 0, 'handed_over' => 0,
        'converted' => 0, 'completed' => 0, 'not_called' => 0, 'callbacks' => 0, 'closed' => 0];
    unset($s['event_id']);
    $cost = (float) $e['sponsorship_cost'];
    $e['stats'] = $s + [
        'cost_per_handover' => $s['handed_over'] ? round($cost / $s['handed_over'], 2) : null,
        'cost_per_contact' => $s['contacts'] ? round($cost / $s['contacts'], 2) : null,
        'reach_rate' => $s['called'] ? round(100 * $s['reached'] / $s['called']) : null,
    ];
    return $e;
}

function crm_action_sales_events()
{
    $stats = crm_sales_stats();
    $rows = crm_all('SELECT * FROM events WHERE deleted_at IS NULL ORDER BY event_date DESC, id DESC');
    foreach ($rows as $i => $e) {
        $rows[$i] = crm_sales_event_row($e, $stats);
    }
    $queue = crm_sales_queue_counts(null);
    crm_ok(['rows' => $rows, 'queue' => $queue]);
}

function crm_sales_find_event($id)
{
    $e = crm_one('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL', [$id]);
    if (!$e) {
        crm_fail(404, 'not_found', 'That event could not be found.');
    }
    return $e;
}

function crm_sales_find_contact($id)
{
    $c = crm_one('SELECT ec.* FROM event_contacts ec JOIN events e ON e.id = ec.event_id AND e.deleted_at IS NULL WHERE ec.id = ? AND ec.deleted_at IS NULL', [$id]);
    if (!$c) {
        crm_fail(404, 'not_found', 'That contact could not be found.');
    }
    return $c;
}

/** GET salesEvent: ?id= event, its contacts and results. */
function crm_action_sales_event()
{
    $id = crm_in_int('id');
    $e = crm_sales_find_event($id);
    $contacts = crm_all("SELECT ec.*, (SELECT name FROM offices WHERE id = ec.handed_office_id) AS handed_office,
        (SELECT notes FROM sales_calls sc WHERE sc.contact_id = ec.id ORDER BY sc.id DESC LIMIT 1) AS last_note
        FROM event_contacts ec WHERE ec.event_id = ? AND ec.deleted_at IS NULL ORDER BY ec.last_name COLLATE NOCASE, ec.first_name COLLATE NOCASE", [$id]);
    crm_ok(['event' => crm_sales_event_row($e, crm_sales_stats($id)), 'contacts' => $contacts]);
}

/** POST salesEventSave: { id?, version?, name, event_date, location, organiser, sponsorship_cost, notes } */
function crm_action_sales_event_save()
{
    $u = crm_user();
    $id = crm_in_int('id');
    $name = crm_in_str('name', 120);
    if (mb_strlen($name) < 2) {
        crm_fail(400, 'invalid', 'Give the event a name.', 'name');
    }
    $date = crm_in_str('event_date', 10);
    if ($date !== '' && !crm_valid_date($date)) {
        crm_fail(400, 'invalid', 'Enter a valid date.', 'event_date');
    }
    $cost = crm_in('sponsorship_cost');
    if ($cost !== null && $cost !== '') {
        $cost = str_replace([',', '£', ' '], '', (string) $cost);
        if (!is_numeric($cost) || (float) $cost < 0) {
            crm_fail(400, 'invalid', 'Enter the sponsorship cost as a number.', 'sponsorship_cost');
        }
        $cost = round((float) $cost, 2);
    } else {
        $cost = null;
    }
    $row = [
        'name' => $name, 'event_date' => $date ?: null, 'location' => crm_in_str('location', 160) ?: null,
        'organiser' => crm_in_str('organiser', 120) ?: null, 'sponsorship_cost' => $cost,
        'notes' => crm_clean((string) crm_in('notes', ''), 5000, true) ?: null,
    ];
    $now = crm_now();
    if ($id) {
        $e = crm_sales_find_event($id);
        $v = crm_in('version');
        if ($v !== null && (int) $v !== (int) $e['version']) {
            crm_fail(409, 'conflict', (crm_user_name($e['updated_by']) ?: 'Someone else') . ' changed this event while you were editing. Reload it and try again.');
        }
        crm_update_row('events', $id, $row + ['updated_at' => $now, 'updated_by' => $u['id'], 'version' => (int) $e['version'] + 1]);
        crm_audit('update', 'events', $id, 'Updated event ' . $name, null, null);
    } else {
        $id = crm_insert('events', $row + ['created_at' => $now, 'created_by' => $u['id'], 'updated_at' => $now, 'updated_by' => $u['id']]);
        crm_audit('create', 'events', $id, 'Added event ' . $name, null, null);
    }
    crm_ok(['id' => $id]);
}

function crm_action_sales_event_delete()
{
    $id = crm_in_int('id');
    $e = crm_sales_find_event($id);
    crm_q('UPDATE events SET deleted_at = ?, deleted_by = ? WHERE id = ?', [crm_now(), crm_user()['id'], $id]);
    crm_audit('delete', 'events', $id, 'Deleted event ' . $e['name'], null, null);
    crm_ok();
}

/** Finds an existing event contact with the same email or phone (any event). */
function crm_sales_duplicate($email, $phone, $exceptId = 0)
{
    $e = $email ? crm_norm_email($email) : '';
    $p = $phone ? crm_norm_phone($phone) : '';
    if ($e === '' && $p === '') {
        return null;
    }
    foreach (crm_all('SELECT ec.id, ec.email, ec.phone, ec.first_name, ec.last_name, e.name AS event_name FROM event_contacts ec JOIN events e ON e.id = ec.event_id
            WHERE ec.deleted_at IS NULL AND ec.erased_at IS NULL AND e.deleted_at IS NULL AND ec.id <> ?', [$exceptId]) as $r) {
        if (($e !== '' && crm_norm_email($r['email']) === $e) || ($p !== '' && crm_norm_phone($r['phone']) === $p)) {
            return $r;
        }
    }
    return null;
}

/** POST salesContactSave: { id?, event_id, first_name, last_name, email, phone, postcode, interest, notes, consent } */
function crm_action_sales_contact_save()
{
    $u = crm_user();
    $id = crm_in_int('id');
    $existing = $id ? crm_sales_find_contact($id) : null;
    $eventId = $existing ? (int) $existing['event_id'] : crm_in_int('event_id');
    $event = crm_sales_find_event($eventId);
    $first = crm_in_str('first_name', 80);
    $last = crm_in_str('last_name', 80);
    $email = crm_in_str('email', 254);
    $phone = crm_in_str('phone', 30);
    if ($first === '' && $last === '') {
        crm_fail(400, 'invalid', 'Enter their name.', 'first_name');
    }
    if ($email !== '' && !crm_valid_email($email)) {
        crm_fail(400, 'invalid', 'Enter a valid email address.', 'email');
    }
    if ($phone !== '' && !crm_valid_phone($phone)) {
        crm_fail(400, 'invalid', 'Enter a valid phone number.', 'phone');
    }
    if ($phone === '' && $email === '') {
        crm_fail(400, 'invalid', 'Enter a phone number or email.', 'phone');
    }
    $consent = crm_in('consent') === true;
    if (!$consent) {
        crm_fail(400, 'invalid', 'Only add people who agreed to be contacted by MAP.', 'consent');
    }
    $dup = crm_sales_duplicate($email, $phone, $id);
    if ($dup) {
        crm_fail(409, 'duplicate', 'This person is already on the list for ' . $dup['event_name'] . ' (' . trim($dup['first_name'] . ' ' . $dup['last_name']) . ').', 'phone');
    }
    $row = [
        'first_name' => $first, 'last_name' => $last, 'email' => $email ? crm_norm_email($email) : null, 'phone' => $phone ?: null,
        'postcode' => strtoupper(crm_in_str('postcode', 12)) ?: null, 'interest' => crm_in_str('interest', 200) ?: null,
        'notes' => crm_clean((string) crm_in('notes', ''), 2000, true) ?: null,
    ];
    $now = crm_now();
    if ($existing) {
        crm_update_row('event_contacts', $id, $row + ['updated_at' => $now, 'updated_by' => $u['id'], 'version' => (int) $existing['version'] + 1]);
        crm_audit('update', 'event_contacts', $id, 'Updated event contact ' . trim($first . ' ' . $last), null, null);
    } else {
        $id = crm_insert('event_contacts', $row + ['event_id' => $eventId, 'consent' => 1, 'consent_at' => $now,
            'consent_source' => 'Added by ' . $u['full_name'] . ' (' . $event['name'] . ')', 'status' => 'new',
            'created_at' => $now, 'created_by' => $u['id'], 'updated_at' => $now, 'updated_by' => $u['id']]);
        crm_audit('create', 'event_contacts', $id, 'Added event contact ' . trim($first . ' ' . $last) . ' to ' . $event['name'], null, null);
    }
    crm_ok(['id' => $id]);
}

function crm_action_sales_contact_delete()
{
    $id = crm_in_int('id');
    $c = crm_sales_find_contact($id);
    crm_q('UPDATE event_contacts SET deleted_at = ?, deleted_by = ? WHERE id = ?', [crm_now(), crm_user()['id'], $id]);
    crm_audit('delete', 'event_contacts', $id, 'Removed event contact ' . trim($c['first_name'] . ' ' . $c['last_name']), null, null);
    crm_ok();
}

/** GDPR: removes an event contact's personal details but keeps the call counts. */
function crm_erase_event_contact($id)
{
    $now = crm_now();
    crm_q("UPDATE event_contacts SET first_name = 'Erased', last_name = 'contact #' || id, email = NULL, phone = NULL, postcode = NULL, interest = NULL, notes = NULL,
        status = CASE WHEN status = 'handed_over' THEN status ELSE 'do_not_call' END, erased_at = ?, claimed_by = NULL, updated_at = ? WHERE id = ?", [$now, $now, $id]);
    crm_q('UPDATE sales_calls SET notes = NULL WHERE contact_id = ?', [$id]);
    crm_q("UPDATE audit_log SET summary = '[erased]', changes = NULL WHERE entity = 'event_contacts' AND entity_id = ?", [$id]);
}

function crm_action_sales_contact_erase()
{
    if (crm_in_str('confirm', 10) !== 'ERASE') {
        crm_fail(400, 'invalid', 'Type ERASE to confirm.', 'confirm');
    }
    $id = crm_in_int('id');
    crm_sales_find_contact($id);
    crm_tx(function () use ($id) {
        crm_erase_event_contact($id);
        crm_audit('gdpr_erase', 'event_contacts', $id, 'Personal data erased on request (event contact #' . $id . ')', null, null);
    });
    crm_ok();
}

/** Reads a yes/no consent cell from a sign-up sheet. Returns true, false or null (blank). */
function crm_consent_value($v)
{
    if ($v === true || $v === 1) {
        return true;
    }
    if ($v === false || $v === 0) {
        return false;
    }
    $s = strtolower(trim((string) $v));
    if ($s === '') {
        return null;
    }
    if (in_array($s, ['y', 'yes', 'true', '1', 'x', '✓', '✔', 'agreed', 'agree', 'opt in', 'opt-in', 'opted in', 'consent', 'ok'], true)) {
        return true;
    }
    return false;
}

/** POST salesImport: { event_id, rows:[...], assume_consent } — duplicates and people without consent are skipped automatically. */
function crm_action_sales_import()
{
    $u = crm_user();
    $eventId = crm_in_int('event_id');
    $event = crm_sales_find_event($eventId);
    $rows = crm_in('rows', []);
    $assume = crm_in('assume_consent') === true;
    if (!is_array($rows) || !$rows) {
        crm_fail(400, 'invalid', 'There are no rows to import.');
    }
    if (count($rows) > 10000) {
        crm_fail(400, 'invalid', 'Import up to 10,000 rows at a time.');
    }
    $emails = [];
    $phones = [];
    foreach (crm_all('SELECT ec.email, ec.phone FROM event_contacts ec JOIN events e ON e.id = ec.event_id WHERE ec.deleted_at IS NULL AND ec.erased_at IS NULL AND e.deleted_at IS NULL') as $r) {
        if ($r['email']) {
            $emails[crm_norm_email($r['email'])] = true;
        }
        if ($r['phone']) {
            $phones[crm_norm_phone($r['phone'])] = true;
        }
    }
    $res = ['added' => 0, 'duplicates' => 0, 'no_consent' => 0, 'invalid' => 0, 'errors' => []];
    $now = crm_now();
    crm_tx(function () use ($rows, $assume, $event, $u, $now, &$emails, &$phones, &$res) {
        foreach ($rows as $n => $r) {
            if (!is_array($r)) {
                continue;
            }
            $get = function ($k) use ($r) {
                return isset($r[$k]) && is_scalar($r[$k]) ? crm_clean((string) $r[$k], 200) : '';
            };
            $first = $get('first_name');
            $last = $get('last_name');
            if ($first === '' && $last === '' && $get('name') !== '') {
                $parts = preg_split('/\s+/', $get('name'));
                $last = count($parts) > 1 ? array_pop($parts) : '';
                $first = implode(' ', $parts);
            }
            $email = crm_norm_email($get('email'));
            $phone = $get('phone');
            $consent = crm_consent_value(isset($r['consent']) ? $r['consent'] : '');
            if ($consent === null) {
                $consent = $assume;
            }
            if (!$consent) {
                $res['no_consent']++;
                continue;
            }
            if (($first === '' && $last === '') || ($email === '' && $phone === '')) {
                $res['invalid']++;
                $res['errors'][] = ['row' => $n + 2, 'message' => 'Needs a name and a phone number or email'];
                continue;
            }
            if ($email !== '' && !crm_valid_email($email)) {
                $email = '';
            }
            if ($phone !== '' && !crm_valid_phone($phone)) {
                if ($email === '') {
                    $res['invalid']++;
                    $res['errors'][] = ['row' => $n + 2, 'message' => 'Phone number not valid: ' . $phone];
                    continue;
                }
                $phone = '';
            }
            $ne = $email;
            $np = $phone !== '' ? crm_norm_phone($phone) : '';
            if (($ne !== '' && isset($emails[$ne])) || ($np !== '' && isset($phones[$np]))) {
                $res['duplicates']++;
                continue;
            }
            crm_insert('event_contacts', [
                'event_id' => $event['id'], 'first_name' => $first, 'last_name' => $last, 'email' => $email ?: null, 'phone' => $phone ?: null,
                'postcode' => strtoupper($get('postcode')) ?: null, 'interest' => $get('interest') ?: null, 'notes' => $get('notes') ?: null,
                'consent' => 1, 'consent_at' => $now, 'consent_source' => 'Sign-up list: ' . $event['name'], 'status' => 'new',
                'created_at' => $now, 'created_by' => $u['id'], 'updated_at' => $now, 'updated_by' => $u['id'],
            ]);
            if ($ne !== '') {
                $emails[$ne] = true;
            }
            if ($np !== '') {
                $phones[$np] = true;
            }
            $res['added']++;
        }
    });
    $res['errors'] = array_slice($res['errors'], 0, 100);
    crm_audit('import', 'events', (int) $event['id'], 'Imported ' . $res['added'] . ' contacts to ' . $event['name'] . ' (' . $res['duplicates'] . ' duplicates, '
        . $res['no_consent'] . ' without consent skipped)', null, null);
    crm_ok($res);
}

/* ---- Call queue --------------------------------------------------------------------------- */

function crm_sales_queue_where()
{
    $now = crm_now();
    $retry = gmdate('Y-m-d\TH:i:s\Z', time() - CRM_QUEUE_RETRY_HOURS * 3600);
    return ["ec.deleted_at IS NULL AND ec.erased_at IS NULL AND ec.consent = 1 AND ec.phone IS NOT NULL AND (
        (ec.status = 'callback' AND ec.callback_at <= ?) OR ec.status = 'new'
        OR (ec.status = 'no_answer' AND ec.attempts < " . CRM_QUEUE_MAX_ATTEMPTS . " AND (ec.last_called_at IS NULL OR ec.last_called_at <= ?)))", [$now, $retry]];
}

function crm_sales_queue_counts($eventId)
{
    list($w, $p) = crm_sales_queue_where();
    $sql = "SELECT SUM(CASE WHEN ec.status = 'callback' THEN 1 ELSE 0 END) AS callbacks, SUM(CASE WHEN ec.status = 'new' THEN 1 ELSE 0 END) AS fresh,
        SUM(CASE WHEN ec.status = 'no_answer' THEN 1 ELSE 0 END) AS retries, COUNT(*) AS total
        FROM event_contacts ec JOIN events e ON e.id = ec.event_id AND e.deleted_at IS NULL WHERE $w";
    if ($eventId) {
        $sql .= ' AND ec.event_id = ?';
        $p[] = $eventId;
    }
    $r = crm_one($sql, $p);
    $later = crm_val("SELECT COUNT(*) FROM event_contacts ec JOIN events e ON e.id = ec.event_id AND e.deleted_at IS NULL WHERE ec.deleted_at IS NULL AND ec.status = 'callback' AND ec.callback_at > ?"
        . ($eventId ? ' AND ec.event_id = ' . (int) $eventId : ''), [crm_now()]);
    return ['callbacks' => (int) $r['callbacks'], 'new' => (int) $r['fresh'], 'retries' => (int) $r['retries'], 'total' => (int) $r['total'], 'later_callbacks' => (int) $later];
}

/** GET salesQueue: ?event_id= the next person to ring (held for this agent for 15 minutes so two agents never ring the same person). */
function crm_action_sales_queue()
{
    $u = crm_user();
    $me = (int) $u['id'];
    $eventId = crm_in_int('event_id');
    $skip = crm_in_int('skip');
    $cutoff = gmdate('Y-m-d\TH:i:s\Z', time() - CRM_QUEUE_CLAIM_MINUTES * 60);
    if ($skip) {
        crm_q('UPDATE event_contacts SET claimed_by = NULL, claimed_at = NULL WHERE id = ? AND claimed_by = ?', [$skip, $me]);
    }
    $contact = null;
    for ($try = 0; $try < 5 && !$contact; $try++) {
        list($w, $p) = crm_sales_queue_where();
        $sql = "SELECT ec.id FROM event_contacts ec JOIN events e ON e.id = ec.event_id AND e.deleted_at IS NULL
            WHERE $w AND (ec.claimed_by IS NULL OR ec.claimed_by = ? OR ec.claimed_at < ?)";
        array_push($p, $me, $cutoff);
        if ($eventId) {
            $sql .= ' AND ec.event_id = ?';
            $p[] = $eventId;
        }
        if ($skip) {
            $sql .= ' AND ec.id <> ?';
            $p[] = $skip;
        }
        $sql .= " ORDER BY CASE WHEN ec.claimed_by = ? AND ec.claimed_at >= ? THEN 0 WHEN ec.status = 'callback' THEN 1 WHEN ec.status = 'new' THEN 2 ELSE 3 END,
            CASE WHEN ec.status = 'callback' THEN ec.callback_at ELSE '' END, e.event_date DESC, ec.attempts, ec.id LIMIT 1";
        array_push($p, $me, $cutoff);
        $id = crm_val($sql, $p);
        if (!$id) {
            break;
        }
        $st = crm_q('UPDATE event_contacts SET claimed_by = ?, claimed_at = ? WHERE id = ? AND (claimed_by IS NULL OR claimed_by = ? OR claimed_at < ?)',
            [$me, crm_now(), $id, $me, $cutoff]);
        if ($st->rowCount() === 1) {
            $contact = crm_one('SELECT ec.*, e.name AS event_name, e.event_date FROM event_contacts ec JOIN events e ON e.id = ec.event_id WHERE ec.id = ?', [$id]);
        }
    }
    $calls = $contact ? crm_all('SELECT * FROM sales_calls WHERE contact_id = ? ORDER BY created_at DESC', [$contact['id']]) : [];
    crm_ok(['contact' => $contact, 'calls' => $calls, 'counts' => crm_sales_queue_counts($eventId)]);
}

/** POST salesCall: { contact_id, outcome, notes, callback_at } — logs a call and its outcome. */
function crm_action_sales_call()
{
    $u = crm_user();
    $id = crm_in_int('contact_id');
    $outcome = crm_in_str('outcome', 20);
    $notes = crm_clean((string) crm_in('notes', ''), 2000, true);
    if (!isset(crm_enums()['call_outcome'][$outcome])) {
        crm_fail(400, 'invalid', 'Choose how the call went.', 'outcome');
    }
    $c = crm_sales_find_contact($id);
    if ($c['erased_at'] || $c['status'] === 'handed_over') {
        crm_fail(409, 'closed', 'This contact has already been dealt with.');
    }
    $callback = null;
    if ($outcome === 'callback') {
        $cb = crm_in_str('callback_at', 25);
        $t = $cb !== '' ? strtotime($cb) : false;
        if (!$t || $t < time() - 300) {
            crm_fail(400, 'invalid', 'Choose when to call back (a time in the future).', 'callback_at');
        }
        $callback = gmdate('Y-m-d\TH:i:s\Z', $t);
    }
    $map = ['no_answer' => 'no_answer', 'voicemail' => 'no_answer', 'callback' => 'callback', 'interested' => 'interested',
        'not_interested' => 'not_interested', 'wrong_number' => 'wrong_number', 'do_not_call' => 'do_not_call'];
    crm_tx(function () use ($u, $id, $outcome, $notes, $callback, $map, $c) {
        crm_insert('sales_calls', ['contact_id' => $id, 'user_id' => $u['id'], 'user_name' => $u['full_name'], 'outcome' => $outcome,
            'notes' => $notes ?: null, 'created_at' => crm_now()]);
        crm_q('UPDATE event_contacts SET status = ?, callback_at = ?, attempts = attempts + 1, last_called_at = ?, last_outcome = ?, claimed_by = NULL, claimed_at = NULL,
            updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?',
            [$map[$outcome], $callback, crm_now(), $outcome, crm_now(), $u['id'], $id]);
        crm_audit('call', 'event_contacts', $id, 'Call to ' . trim($c['first_name'] . ' ' . $c['last_name']) . ': ' . crm_label('call_outcome', $outcome), null, null);
    });
    crm_ok();
}

function crm_action_sales_release()
{
    crm_q('UPDATE event_contacts SET claimed_by = NULL, claimed_at = NULL WHERE id = ? AND claimed_by = ?', [crm_in_int('contact_id'), crm_user()['id']]);
    crm_ok();
}

/** GET salesStaff: ?office_id= advisers and administrators an interested contact can be handed to (names only). */
function crm_action_sales_staff()
{
    $o = crm_in_int('office_id');
    $rows = crm_all("SELECT id, full_name, role FROM users WHERE status = 'active' AND office_id = ? AND role IN ('adviser','manager','administrator','admin')
        AND is_office_account = 0 ORDER BY full_name", [$o]);
    $office = crm_all("SELECT id, full_name, role FROM users WHERE status = 'active' AND office_id = ? AND is_office_account = 1", [$o]);
    crm_ok(['rows' => array_merge($rows, $office)]);
}

/** POST salesHandover: { contact_id, office_id, adviser_id, administrator_id, enquiry_type, notes } — becomes a new lead with the full call history. */
function crm_action_sales_handover()
{
    $u = crm_user();
    $id = crm_in_int('contact_id');
    $officeId = crm_in_int('office_id');
    $adviserId = crm_in_int('adviser_id');
    $adminId = crm_in_int('administrator_id');
    $type = crm_in_str('enquiry_type', 30);
    $notes = crm_clean((string) crm_in('notes', ''), 2000, true);
    $c = crm_sales_find_contact($id);
    if ($c['handed_lead_id']) {
        crm_fail(409, 'handed', 'This contact has already been handed over.');
    }
    if ($c['erased_at'] || in_array($c['status'], ['do_not_call', 'wrong_number'], true)) {
        crm_fail(409, 'closed', 'This contact can\'t be handed over.');
    }
    if (!crm_val('SELECT id FROM offices WHERE id = ? AND active = 1', [$officeId])) {
        crm_fail(400, 'invalid', 'Choose the office.', 'office_id');
    }
    if (!$adviserId || !crm_val("SELECT id FROM users WHERE id = ? AND office_id = ? AND status = 'active' AND role <> 'sales'", [$adviserId, $officeId])) {
        crm_fail(400, 'invalid', 'Choose the adviser in that office.', 'adviser_id');
    }
    if ($adminId && !crm_val("SELECT id FROM users WHERE id = ? AND office_id = ? AND status = 'active' AND role <> 'sales'", [$adminId, $officeId])) {
        crm_fail(400, 'invalid', 'Choose the administrator in that office.', 'administrator_id');
    }
    if ($type !== '' && !isset(crm_enums()['enquiry_type'][$type])) {
        crm_fail(400, 'invalid', 'Choose what they are interested in.', 'enquiry_type');
    }
    $event = crm_one('SELECT * FROM events WHERE id = ?', [$c['event_id']]);
    $leadId = crm_tx(function () use ($u, $c, $event, $officeId, $adviserId, $adminId, $type, $notes) {
        $GLOBALS['crm_office_id'] = $officeId;   // the lead belongs to the chosen office
        $lines = ['Handed over by ' . $u['full_name'] . ' (General Sales) from the event "' . $event['name'] . '"'
            . ($event['event_date'] ? ' on ' . date('j M Y', strtotime($event['event_date'])) : '') . '.'];
        if ($c['interest']) {
            $lines[] = 'Interested in: ' . $c['interest'];
        }
        if ($notes !== '') {
            $lines[] = $notes;
        }
        $lead = crm_save_record('leads', 0, [
            'first_name' => $c['first_name'] ?: '-', 'last_name' => $c['last_name'] ?: '-', 'email' => $c['email'], 'phone' => $c['phone'],
            'source' => 'event', 'enquiry_type' => $type ?: null, 'notes' => implode("\n", $lines),
            'adviser_id' => $adviserId, 'administrator_id' => $adminId ?: null, 'timescale' => null,
        ]);
        crm_q('UPDATE leads SET event_contact_id = ? WHERE id = ?', [$c['id'], $lead['id']]);
        foreach (crm_all('SELECT * FROM sales_calls WHERE contact_id = ? ORDER BY created_at', [$c['id']]) as $call) {
            crm_insert('activities', [
                'office_id' => $officeId, 'lead_id' => $lead['id'], 'type' => 'call', 'direction' => 'out',
                'outcome' => crm_label('call_outcome', $call['outcome']),
                'summary' => 'General Sales call: ' . crm_label('call_outcome', $call['outcome']) . ($call['notes'] ? '. ' . $call['notes'] : ''),
                'user_id' => $call['user_id'], 'user_name' => $call['user_name'], 'created_at' => $call['created_at'],
            ]);
        }
        crm_q("UPDATE event_contacts SET status = 'handed_over', handed_lead_id = ?, handed_office_id = ?, handed_at = ?, handed_by = ?, claimed_by = NULL,
            claimed_at = NULL, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?",
            [$lead['id'], $officeId, crm_now(), $u['id'], crm_now(), $u['id'], $c['id']]);
        crm_audit('handover', 'event_contacts', (int) $c['id'], 'Handed ' . trim($c['first_name'] . ' ' . $c['last_name']) . ' over to '
            . crm_val('SELECT name FROM offices WHERE id = ?', [$officeId]) . ' (' . crm_user_name($adviserId) . ')', null, $officeId);
        return (int) $lead['id'];
    });
    crm_ok(['lead_id' => $leadId]);
}

/** GET salesResults: results per event plus calls and hand-overs per agent. */
function crm_action_sales_results()
{
    $stats = crm_sales_stats();
    $events = crm_all('SELECT * FROM events WHERE deleted_at IS NULL ORDER BY event_date DESC, id DESC');
    $tot = ['contacts' => 0, 'called' => 0, 'reached' => 0, 'interested' => 0, 'handed_over' => 0, 'converted' => 0, 'completed' => 0, 'cost' => 0];
    foreach ($events as $i => $e) {
        $events[$i] = crm_sales_event_row($e, $stats);
        foreach ($tot as $k => $v) {
            if ($k === 'cost') {
                $tot['cost'] += (float) $e['sponsorship_cost'];
            } else {
                $tot[$k] += $events[$i]['stats'][$k];
            }
        }
    }
    $tot['cost_per_handover'] = $tot['handed_over'] ? round($tot['cost'] / $tot['handed_over'], 2) : null;
    $agents = crm_all("SELECT sc.user_id, sc.user_name, COUNT(*) AS calls,
            SUM(CASE WHEN sc.outcome NOT IN ('no_answer','voicemail','wrong_number') THEN 1 ELSE 0 END) AS reached,
            SUM(CASE WHEN sc.outcome = 'interested' THEN 1 ELSE 0 END) AS interested,
            (SELECT COUNT(*) FROM event_contacts ec WHERE ec.handed_by = sc.user_id) AS handed_over,
            MAX(sc.created_at) AS last_call_at
        FROM sales_calls sc GROUP BY sc.user_id, sc.user_name ORDER BY calls DESC");
    $today = crm_all("SELECT outcome, COUNT(*) AS n FROM sales_calls WHERE created_at >= ? GROUP BY outcome", [gmdate('Y-m-d\TH:i:s\Z', strtotime('today'))]);
    crm_ok(['events' => $events, 'totals' => $tot, 'agents' => $agents, 'today' => $today]);
}
