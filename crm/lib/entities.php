<?php
/* MAP CRM: records (leads, clients, cases, policies, tasks, documents, introducers, templates). */
if (!defined('MAP_CRM')) {
    http_response_code(404);
    exit;
}

/**
 * Field types: text (max length), long (notes), email, phone, date, money, num, int, bool,
 * enum (list name from crm_enums), ref (table in the same office), user (staff member).
 * 'req': must be filled in. 'keep': the list always holds a value, so a blank choice on an edit keeps the current one.
 */
function crm_entity_defs()
{
    return [
        'leads' => ['label' => 'Lead', 'fields' => [
            'first_name' => ['text', 80, 'req'], 'last_name' => ['text', 80, 'req'], 'email' => ['email'], 'phone' => ['phone'],
            'enquiry_type' => ['enum', 'enquiry_type'], 'source' => ['enum', 'source'], 'introducer_id' => ['ref', 'introducers'],
            'loan_amount' => ['money'], 'property_value' => ['money'], 'deposit' => ['money'], 'timescale' => ['enum', 'timescale'],
            'credit_issues' => ['enum', 'credit_issues'], 'employment' => ['enum', 'employment'], 'notes' => ['long'],
            'status' => ['enum', 'lead_status', 'keep'], 'adviser_id' => ['user'], 'administrator_id' => ['user'], 'lost_reason' => ['text', 200],
        ], 'search' => ['first_name', 'last_name', 'email', 'phone']],
        'clients' => ['label' => 'Client', 'fields' => [
            'title' => ['enum', 'title'], 'first_name' => ['text', 80, 'req'], 'last_name' => ['text', 80, 'req'], 'dob' => ['date'],
            'email' => ['email'], 'phone' => ['phone'], 'address' => ['text', 300], 'postcode' => ['text', 12],
            'employment_status' => ['enum', 'employment'], 'annual_income' => ['money'], 'marital_status' => ['enum', 'marital_status'],
            'dependants' => ['int'], 'is_landlord' => ['bool'], 'homeowner_status' => ['enum', 'homeowner_status'],
            'joint_applicant' => ['text', 120], 'adviser_id' => ['user'], 'administrator_id' => ['user'],
            'introducer_id' => ['ref', 'introducers'], 'source' => ['enum', 'source'], 'existing_plans' => ['long'],
            'next_review_date' => ['date'], 'marketing_consent' => ['bool'], 'notes' => ['long'],
        ], 'search' => ['first_name', 'last_name', 'email', 'phone', 'postcode']],
        'cases' => ['label' => 'Mortgage case', 'fields' => [
            'client_id' => ['ref', 'clients', 'req'], 'case_type' => ['enum', 'case_type', 'req'], 'stage' => ['enum', 'stage', 'keep'],
            'status' => ['enum', 'case_status', 'keep'], 'lender' => ['text', 80], 'product' => ['text', 120], 'loan_amount' => ['money'],
            'property_value' => ['money'], 'property_address' => ['text', 300], 'rate' => ['num'], 'rate_type' => ['enum', 'rate_type'],
            'fixed_term_years' => ['int'], 'fixed_rate_end_date' => ['date'], 'term_years' => ['int'], 'application_date' => ['date'],
            'offer_date' => ['date'], 'offer_expiry_date' => ['date'], 'expected_completion_date' => ['date'], 'completion_date' => ['date'],
            'proc_fee' => ['money'], 'broker_fee' => ['money'], 'adviser_id' => ['user'], 'administrator_id' => ['user'],
            'introducer_id' => ['ref', 'introducers'], 'next_action' => ['text', 200], 'next_action_date' => ['date'],
            'lost_reason' => ['text', 200], 'notes' => ['long'],
        ], 'search' => ['lender', 'property_address', 'product']],
        'policies' => ['label' => 'Policy', 'fields' => [
            'client_id' => ['ref', 'clients', 'req'], 'case_id' => ['ref', 'cases'], 'policy_type' => ['enum', 'policy_type', 'req'],
            'provider' => ['text', 80], 'policy_number' => ['text', 60], 'status' => ['enum', 'policy_status', 'keep'], 'premium' => ['money'],
            'sum_assured' => ['money'], 'term_years' => ['int'], 'quote_date' => ['date'], 'start_date' => ['date'],
            'renewal_date' => ['date'], 'commission' => ['money'], 'adviser_id' => ['user'], 'notes' => ['long'],
        ], 'search' => ['provider', 'policy_number']],
        'tasks' => ['label' => 'Task', 'fields' => [
            'title' => ['text', 200, 'req'], 'notes' => ['long'], 'due_date' => ['date'], 'priority' => ['enum', 'task_priority', 'keep'],
            'status' => ['enum', 'task_status', 'keep'], 'assigned_to' => ['user'], 'client_id' => ['ref', 'clients'], 'lead_id' => ['ref', 'leads'],
            'case_id' => ['ref', 'cases'], 'policy_id' => ['ref', 'policies'],
        ], 'search' => ['title', 'notes']],
        'documents' => ['label' => 'Document', 'fields' => [
            'case_id' => ['ref', 'cases'], 'client_id' => ['ref', 'clients'], 'name' => ['text', 120, 'req'],
            'status' => ['enum', 'document_status', 'keep'], 'requested_at' => ['date'], 'received_at' => ['date'], 'expiry_date' => ['date'],
            'notes' => ['text', 500],
        ], 'search' => ['name']],
        'introducers' => ['label' => 'Introducer', 'fields' => [
            'name' => ['text', 120, 'req'], 'company' => ['text', 120], 'type' => ['enum', 'introducer_type'], 'email' => ['email'],
            'phone' => ['phone'], 'commission_terms' => ['text', 200], 'notes' => ['long'], 'active' => ['bool'],
        ], 'search' => ['name', 'company', 'email']],
        'templates' => ['label' => 'Email template', 'fields' => [
            'name' => ['text', 120, 'req'], 'category' => ['text', 60], 'subject' => ['text', 200, 'req'], 'body' => ['long', 'req'],
        ], 'search' => ['name', 'subject']],
    ];
}

function crm_entity($name)
{
    $defs = crm_entity_defs();
    if (!is_string($name) || !isset($defs[$name])) {
        crm_fail(400, 'invalid', 'Unknown record type.');
    }
    return $defs[$name];
}

/** Turns one submitted value into what is stored, or fails with a message for that field. */
function crm_coerce($table, $field, array $spec, $v)
{
    $type = $spec[0];
    $req = in_array('req', $spec, true);
    if (is_string($v)) {
        $v = trim($v);
    }
    if ($v === '' || $v === null) {
        if ($req) {
            crm_fail(400, 'invalid', 'This field is required.', $field);
        }
        return $type === 'bool' ? 0 : null;
    }
    if (is_array($v)) {
        crm_fail(400, 'invalid', 'That value is not valid.', $field);
    }
    switch ($type) {
        case 'text':
            return crm_clean((string) $v, isset($spec[1]) && is_int($spec[1]) ? $spec[1] : 500);
        case 'long':
            return crm_clean((string) $v, 20000, true);
        case 'email':
            $e = crm_norm_email($v);
            if (!crm_valid_email($e)) {
                crm_fail(400, 'invalid', 'Enter a valid email address, like name@example.com.', $field);
            }
            return $e;
        case 'phone':
            $p = crm_clean((string) $v, 30);
            if (!crm_valid_phone($p)) {
                crm_fail(400, 'invalid', 'Enter a valid phone number.', $field);
            }
            return $p;
        case 'date':
            $d = substr((string) $v, 0, 10);
            if (!crm_valid_date($d)) {
                crm_fail(400, 'invalid', 'Enter a valid date.', $field);
            }
            return $d;
        case 'money':
        case 'num':
            $n = str_replace([',', '£', ' '], '', (string) $v);
            if (!is_numeric($n)) {
                crm_fail(400, 'invalid', 'Enter a number.', $field);
            }
            $n = (float) $n;
            if ($n < 0 || $n > 1e10) {
                crm_fail(400, 'invalid', 'That number is out of range.', $field);
            }
            return round($n, 2);
        case 'int':
            if (!is_numeric($v) || (int) $v < 0 || (int) $v > 1000) {
                crm_fail(400, 'invalid', 'Enter a whole number.', $field);
            }
            return (int) $v;
        case 'bool':
            return ($v === true || $v === 1 || $v === '1' || $v === 'true' || $v === 'yes') ? 1 : 0;
        case 'enum':
            $list = crm_enums()[$spec[1]];
            if (!isset($list[$v])) {
                crm_fail(400, 'invalid', 'Please choose an option from the list.', $field);
            }
            return (string) $v;
        case 'ref':
            // Protection-only advisers cannot link their work to mortgage cases or mortgage leads.
            $id = (int) $v;
            if (!$id || !crm_val('SELECT id FROM ' . $spec[1] . ' WHERE id = ? AND office_id = ? AND deleted_at IS NULL'
                . crm_protection_and($spec[1], $spec[1]), [$id, crm_office_id()])) {
                crm_fail(400, 'invalid', 'That linked record could not be found in this office.', $field);
            }
            return $id;
        case 'user':
            // Staff of this office (a system admin may work in any office); never General Sales or the website admin.
            $id = (int) $v;
            if (!$id || !crm_val("SELECT id FROM users WHERE id = ? AND status = 'active' AND role IN ('" . implode("','", CRM_OFFICE_ROLES) . "')
                AND (office_id = ? OR role = 'admin')", [$id, crm_office_id()])) {
                crm_fail(400, 'invalid', 'Please choose a member of staff from the list.', $field);
            }
            return $id;
    }
    return null;
}

/** Loads one record from the current office (templates may also be shared by all offices). */
function crm_find($entity, $id, $includeDeleted = false)
{
    $officeId = crm_office_id();
    $sql = $entity === 'templates'
        ? 'SELECT * FROM templates WHERE id = ? AND (office_id = ? OR office_id IS NULL)' . crm_templates_protection_and('templates')
        : 'SELECT * FROM ' . $entity . ' WHERE id = ? AND office_id = ?';
    if (!$includeDeleted) {
        $sql .= ' AND deleted_at IS NULL';
    }
    $sql .= crm_protection_and($entity, $entity);
    return crm_one($sql, [(int) $id, $officeId]);
}

/** The template placeholders filled in from a mortgage case. */
const CRM_ENTITIES_CASE_PLACEHOLDERS = ['lender', 'loan_amount', 'property_address', 'completion_date', 'fixed_rate_end_date'];

/**
 * SQL condition, true for a mortgage template's category ($a is the table name or alias): any category with "mortgage"
 * in it (Mortgage, Remortgage, Mortgage offers…) other than "Mortgage protection" (a protection product), or starting with "case".
 */
function crm_entities_template_category_cond($a)
{
    return "(REPLACE(LOWER(COALESCE($a.category, '')), 'mortgage protection', '') LIKE '%mortgage%' OR COALESCE($a.category, '') LIKE 'case%')";
}

/**
 * SQL condition, true for a template whose subject or text uses a mortgage case's details ({{lender}}, {{loan_amount}}…),
 * unless it is filed under protection or insurance (for a protection-only adviser those details are left blank).
 */
function crm_entities_template_details_cond($a)
{
    $text = "REPLACE(COALESCE($a.subject, '') || ' ' || COALESCE($a.body, ''), ' ', '')";
    $uses = [];
    foreach (CRM_ENTITIES_CASE_PLACEHOLDERS as $ph) {
        $uses[] = "$text LIKE '%{{" . $ph . "}}%'";
    }
    return "(COALESCE($a.category, '') NOT LIKE '%protection%' AND COALESCE($a.category, '') NOT LIKE '%insurance%' AND (" . implode(' OR ', $uses) . '))';
}

/**
 * For protection-only advisers: leaves mortgage email templates out of a query on templates ($a is the table name or
 * alias): a mortgage category (see above) or one that fills in a mortgage case's details. Returns '' for everyone else.
 */
function crm_templates_protection_and($a)
{
    if (!crm_protection_only()) {
        return '';
    }
    return ' AND NOT ' . crm_entities_template_category_cond($a) . ' AND NOT ' . crm_entities_template_details_cond($a);
}

/** Whether staff member $id gives protection advice only, so can't be given mortgage work (they would never see it). */
function crm_entities_protection_staff($id)
{
    return $id && crm_val('SELECT advice_type FROM users WHERE id = ?', [(int) $id]) === 'protection';
}

/**
 * A protection-only login can't trash or delete a client who also has mortgage cases: those would go too, and the
 * cases belong to the office's other advisers.
 */
function crm_entities_guard_other_work($entity, $id, $includeDeleted)
{
    if ($entity !== 'clients' || !crm_protection_only()) {
        return;
    }
    if (crm_val('SELECT 1 FROM cases WHERE client_id = ? AND office_id = ?' . ($includeDeleted ? '' : ' AND deleted_at IS NULL'), [$id, crm_office_id()])) {
        crm_fail(409, 'has_other_work', 'This client also has work with the office\'s other advisers, so they can\'t be moved to the trash or deleted from your login. Ask your office manager.');
    }
}

/** Whether a lead, case or task (its fields) is mortgage work, which protection-only advisers never see. */
function crm_entities_mortgage_work($entity, array $r)
{
    switch ($entity) {
        case 'cases':
            return true;
        case 'leads':
            return !empty($r['enquiry_type']) && !in_array($r['enquiry_type'], CRM_PROTECTION_ENQUIRIES, true);
        case 'tasks':
            if (!empty($r['case_id'])) {
                return true;
            }
            return !empty($r['lead_id'])
                && crm_entities_mortgage_work('leads', ['enquiry_type' => crm_val('SELECT enquiry_type FROM leads WHERE id = ?', [(int) $r['lead_id']])]);
    }
    return false;
}

/**
 * For values copied from another record: the staff member or linked record while it is still valid here, else null.
 * A staff member who gives protection advice only is not valid for mortgage work: a case, or the $record being made
 * (e.g. ['case_id' => …] for a task) when it is a mortgage lead or a task on a case or a mortgage lead.
 */
function crm_entity_still_valid($entity, $field, $value, array $record = [])
{
    if (!$value) {
        return null;
    }
    $spec = crm_entity($entity)['fields'][$field];
    if ($spec[0] === 'user' && crm_entities_mortgage_work($entity, $record) && crm_entities_protection_staff($value)) {
        return null;
    }
    try {
        return crm_coerce($entity, $field, $spec, $value);
    } catch (CrmError $e) {
        return null;
    }
}

/** Writes the audit line for a record. A template shared by every office is logged in every office's audit log. */
function crm_entity_audit($action, $entity, $id, $summary, array $record, $changes = null)
{
    if ($entity === 'templates' && $record['office_id'] === null) {
        foreach (crm_all('SELECT id FROM offices WHERE active = 1') as $o) {
            crm_audit($action, $entity, $id, $summary . ' (shared with every office)', $changes, (int) $o['id']);
        }
        return;
    }
    crm_audit($action, $entity, $id, $summary, $changes);
}

function crm_must_find($entity, $id, $includeDeleted = false)
{
    $r = crm_find($entity, $id, $includeDeleted);
    if (!$r) {
        crm_fail(404, 'not_found', 'That record could not be found. It may have been deleted.');
    }
    return $r;
}

function crm_record_name($entity, array $r)
{
    switch ($entity) {
        case 'leads':
        case 'clients':
            return trim($r['first_name'] . ' ' . $r['last_name']);
        case 'cases':
            $c = crm_one('SELECT first_name, last_name FROM clients WHERE id = ? AND office_id = ?', [$r['client_id'], $r['office_id']]);
            return crm_label('case_type', $r['case_type']) . ($c ? ': ' . trim($c['first_name'] . ' ' . $c['last_name']) : '');
        case 'policies':
            $c = crm_one('SELECT first_name, last_name FROM clients WHERE id = ? AND office_id = ?', [$r['client_id'], $r['office_id']]);
            return crm_label('policy_type', $r['policy_type']) . ($c ? ': ' . trim($c['first_name'] . ' ' . $c['last_name']) : '');
        case 'tasks':
            return $r['title'];
        default:
            return isset($r['name']) ? $r['name'] : ('#' . $r['id']);
    }
}

function crm_user_name($id)
{
    if (!$id) {
        return null;
    }
    return crm_val('SELECT full_name FROM users WHERE id = ?', [$id]);
}

/* ---- Save -------------------------------------------------------------------------------------- */

/** POST save: { entity, id?, version?, data:{...} }. Creates or updates; refuses to overwrite someone else's newer change. */
function crm_action_save()
{
    $entity = crm_in('entity');
    $def = crm_entity($entity);
    $id = crm_in_int('id');
    $version = crm_in('version');
    $data = crm_in('data', []);
    if (!is_array($data)) {
        crm_fail(400, 'invalid', 'Nothing to save.');
    }
    $global = crm_in('global') === true || (isset($data['global']) && $data['global'] === true);
    $record = crm_save_record($entity, $id, $data, $version, $global);
    crm_ok(['record' => crm_decorate($entity, $record)]);
}

function crm_save_record($entity, $id, array $data, $version = null, $global = false)
{
    $def = crm_entity($entity);
    $officeId = crm_office_id();
    $u = crm_user();
    return crm_tx(function () use ($entity, $def, $id, $data, $version, $officeId, $u, $global) {
        $before = null;
        if ($id) {
            $before = crm_must_find($entity, $id);
            if ($version !== null && $version !== '' && (int) $version !== (int) $before['version']) {
                $who = crm_user_name($before['updated_by']) ?: 'someone else';
                crm_fail(409, 'conflict', 'While you were editing, ' . $who . ' saved a change to this record. Your changes have not been saved: reload it to see theirs, then make your change again.', null, [
                    'current' => $before,
                    'updated_by_name' => $who,
                ]);
            }
            if ($entity === 'templates' && $before['office_id'] === null && !in_array($u['role'], ['admin', 'manager'], true)) {
                crm_fail(403, 'forbidden', 'Shared templates can only be changed by an office manager.');
            }
        }
        $row = [];
        foreach ($def['fields'] as $f => $spec) {
            if (!array_key_exists($f, $data)) {
                if (!$before && in_array('req', $spec, true)) {
                    crm_fail(400, 'invalid', 'This field is required.', $f);
                }
                continue;
            }
            $v = is_string($data[$f]) ? trim($data[$f]) : $data[$f];
            if ($before && ($v === '' || $v === null) && in_array('keep', $spec, true)) {
                continue;   // a blank status, stage or priority on an edit keeps the current one
            }
            if ($before && in_array($spec[0], ['ref', 'user'], true) && $before[$f] !== null && is_scalar($v) && (int) $v === (int) $before[$f]) {
                $row[$f] = (int) $before[$f];   // unchanged link: still fine if that person has since left or the record is in the trash
                continue;
            }
            $row[$f] = crm_coerce($entity, $f, $spec, $v);
        }
        $row = crm_prepare_row($entity, $row, $before);
        $now = crm_now();
        if (!$before) {
            $row['office_id'] = ($entity === 'templates' && $global && in_array($u['role'], ['admin', 'manager'], true)) ? null : $officeId;
            $row['created_at'] = $now;
            $row['created_by'] = (int) $u['id'];
            $row['updated_at'] = $now;
            $row['updated_by'] = (int) $u['id'];
            $newId = crm_insert($entity, $row);
            $after = crm_one('SELECT * FROM ' . $entity . ' WHERE id = ?', [$newId]);
            crm_after_save($entity, null, $after);
            crm_entity_audit('create', $entity, $newId, 'Added ' . strtolower(crm_entity($entity)['label']) . ' ' . crm_record_name($entity, $after), $after);
            return $after;
        }
        $changes = [];
        foreach ($row as $k => $v) {
            $old = $before[$k];
            if ((string) $old !== (string) $v || ($old === null) !== ($v === null)) {
                $changes[$k] = [$old, $v];
            }
        }
        if (!$changes) {
            return $before;
        }
        $upd = [];
        foreach ($changes as $k => $pair) {
            $upd[$k] = $pair[1];
        }
        $upd['updated_at'] = $now;
        $upd['updated_by'] = (int) $u['id'];
        $upd['version'] = (int) $before['version'] + 1;
        crm_update_row($entity, (int) $before['id'], $upd);
        $after = crm_one('SELECT * FROM ' . $entity . ' WHERE id = ?', [$before['id']]);
        crm_after_save($entity, $before, $after);
        crm_entity_audit('update', $entity, (int) $before['id'], 'Updated ' . strtolower(crm_entity($entity)['label']) . ' ' . crm_record_name($entity, $after), $after, $changes);
        return $after;
    });
}

/** Entity rules that run before a save: scores, stage dates, completion dates. */
function crm_prepare_row($entity, array $row, $before)
{
    $merged = $before ? array_merge($before, $row) : $row;
    $today = crm_today();
    $u = crm_user();
    switch ($entity) {
        case 'leads':
            if (crm_protection_only() && !empty($row['enquiry_type']) && !in_array($row['enquiry_type'], CRM_PROTECTION_ENQUIRIES, true)) {
                crm_fail(400, 'invalid', 'Choose a protection or insurance enquiry.', 'enquiry_type');
            }
            list($score, $rating) = crm_lead_score($merged);
            $row['score'] = $score;
            $row['rating'] = $rating;
            $status = isset($merged['status']) ? $merged['status'] : 'new';
            if (!$before && empty($row['status'])) {
                $row['status'] = 'new';
            }
            if ($status === 'lost' && (!$before || $before['status'] !== 'lost')) {
                $row['lost_at'] = crm_now();
            }
            // Only "Convert to client" makes a lead converted. A converted lead stays editable, even after its client is purged.
            if ($status === 'converted' && (!$before || ($before['status'] !== 'converted' && empty($before['client_id'])))) {
                crm_fail(400, 'invalid', 'Use "Convert to client" to convert a lead.', 'status');
            }
            break;
        case 'cases':
            if (!$before && empty($row['status'])) {
                $row['status'] = 'active';
            }
            if (!$before && empty($row['stage'])) {
                $row['stage'] = 'enquiry';
            }
            if (!$before && empty($row['adviser_id'])) {
                $cl = crm_one('SELECT adviser_id, administrator_id FROM clients WHERE id = ?', [$merged['client_id']]);
                if ($cl) {
                    // The client's people, unless they give protection advice only (they never see mortgage cases).
                    $row['adviser_id'] = (crm_entities_protection_staff($cl['adviser_id']) ? null : $cl['adviser_id'])
                        ?: ($u['role'] === 'adviser' ? (int) $u['id'] : null);
                    if (empty($row['administrator_id']) && !crm_entities_protection_staff($cl['administrator_id'])) {
                        $row['administrator_id'] = $cl['administrator_id'];
                    }
                }
            }
            $row = crm_case_prepare($row, $before);
            break;
        case 'policies':
            if (!$before && empty($row['status'])) {
                $row['status'] = 'quote';
            }
            $status = isset($row['status']) ? $row['status'] : $merged['status'];
            if ($status === 'quote' && empty($merged['quote_date'])) {
                $row['quote_date'] = $today;
            }
            if ($status === 'on_risk' && empty($merged['start_date'])) {
                $row['start_date'] = $today;
            }
            if (!$before && empty($row['adviser_id'])) {
                $row['adviser_id'] = crm_val('SELECT adviser_id FROM clients WHERE id = ?', [$merged['client_id']]) ?: null;
            }
            break;
        case 'tasks':
            if (!$before && empty($row['status'])) {
                $row['status'] = 'open';
            }
            if (!$before && empty($row['priority'])) {
                $row['priority'] = 'normal';
            }
            if (!$before && !array_key_exists('assigned_to', $row)) {
                $row['assigned_to'] = $u['role'] !== 'sales' ? (int) $u['id'] : null;
            }
            $status = isset($merged['status']) ? $merged['status'] : 'open';
            if ($status === 'done' && (!$before || $before['status'] !== 'done')) {
                $row['completed_at'] = crm_now();
                $row['completed_by'] = (int) $u['id'];
            } elseif ($status === 'open' && $before && $before['status'] === 'done') {
                $row['completed_at'] = null;
                $row['completed_by'] = null;
            }
            if (!empty($merged['case_id']) && empty($merged['client_id'])) {
                $row['client_id'] = (int) crm_val('SELECT client_id FROM cases WHERE id = ?', [$merged['case_id']]);
            }
            if (!empty($merged['policy_id']) && empty($merged['client_id'])) {
                $row['client_id'] = (int) crm_val('SELECT client_id FROM policies WHERE id = ?', [$merged['policy_id']]);
            }
            break;
        case 'documents':
            if (!$before && empty($row['status'])) {
                $row['status'] = 'requested';
            }
            if (!empty($merged['case_id']) && empty($merged['client_id'])) {
                $row['client_id'] = $merged['client_id'] = (int) crm_val('SELECT client_id FROM cases WHERE id = ?', [$merged['case_id']]);
            }
            if (empty($merged['client_id'])) {
                crm_fail(400, 'invalid', 'Link the document to a client or case.', 'client_id');
            }
            $status = isset($merged['status']) ? $merged['status'] : 'requested';
            if (empty($merged['requested_at'])) {
                $row['requested_at'] = $today;
            }
            if ($status === 'received' && (!$before || $before['status'] !== 'received')) {
                if (empty($merged['received_at'])) {
                    $row['received_at'] = $merged['received_at'] = $today;
                }
                // Proof of address, payslips and bank statements are only good for about three months.
                if (empty($merged['expiry_date']) && in_array($merged['name'], ['Proof of address', 'Payslips (3 months)', 'Bank statements (3 months)'], true)) {
                    $row['expiry_date'] = crm_add_days($merged['received_at'], 90);
                }
            }
            if ($status === 'expired' && !empty($merged['expiry_date']) && $merged['expiry_date'] >= $today && $before && $before['status'] !== 'expired') {
                $row['expiry_date'] = $today;
            }
            break;
        case 'introducers':
            if (!$before && !array_key_exists('active', $row)) {
                $row['active'] = 1;
            }
            break;
        case 'templates':
            // A protection-only adviser can't save a template they would then no longer see.
            if (crm_protection_only()) {
                $probe = 'SELECT 1 FROM (SELECT ? AS category, ? AS subject, ? AS body) t WHERE ';
                $vals = [
                    isset($merged['category']) ? $merged['category'] : null,
                    isset($merged['subject']) ? $merged['subject'] : null,
                    isset($merged['body']) ? $merged['body'] : null,
                ];
                if (crm_val($probe . crm_entities_template_category_cond('t'), $vals)) {
                    crm_fail(400, 'invalid', 'This category is kept for mortgage templates, which are not part of your login (protection only). Choose another category, e.g. Protection.', 'category');
                }
                if (crm_val($probe . crm_entities_template_details_cond('t'), $vals)) {
                    crm_fail(400, 'invalid', 'Mortgage details such as {{lender}} or {{loan_amount}} are not part of your login (protection only). Take them out of the subject and email text.', 'body');
                }
            }
            break;
    }
    // Mortgage work can't be given to someone who gives protection advice only: they would never see it. A person
    // already on the record stays (so an unrelated edit still saves); a new one, or the record becoming mortgage work, is checked.
    if (in_array($entity, ['leads', 'cases', 'tasks'], true)) {
        $merged = $before ? array_merge($before, $row) : $row;
        if (crm_entities_mortgage_work($entity, $merged)) {
            $wasMortgage = $before && crm_entities_mortgage_work($entity, $before);
            foreach ($entity === 'tasks' ? ['assigned_to'] : ['adviser_id', 'administrator_id'] as $f) {
                $uid = empty($merged[$f]) ? 0 : (int) $merged[$f];
                if ($uid && (!$wasMortgage || (int) $before[$f] !== $uid) && crm_entities_protection_staff($uid)) {
                    $what = $entity === 'leads' ? 'this enquiry (' . crm_label('enquiry_type', $merged['enquiry_type']) . ')'
                        : ($entity === 'cases' ? 'mortgage cases' : 'tasks on a mortgage case or mortgage lead');
                    crm_fail(400, 'invalid', crm_user_name($uid) . ' gives protection advice only, so they can\'t take ' . $what . '. Choose someone else.', $f);
                }
            }
        }
    }
    return $row;
}

function crm_after_save($entity, $before, array $after)
{
    if ($entity === 'leads' && !$before) {
        crm_lead_after_create($after);
    }
    if ($entity === 'leads' && $before && $before['status'] === 'new' && $after['status'] !== 'new') {
        crm_q("UPDATE tasks SET status = 'done', completed_at = ?, completed_by = ? WHERE office_id = ? AND auto_key = ? AND status = 'open'",
            [crm_now(), crm_user()['id'], $after['office_id'], 'leadcontact:' . $after['id']]);
    }
    if ($entity === 'cases') {
        crm_case_after_save($before, $after);
    }
    if ($entity === 'policies' && $before && $before['status'] !== $after['status']) {
        $u = crm_user();
        crm_insert('activities', [
            'office_id' => $after['office_id'], 'client_id' => $after['client_id'], 'policy_id' => $after['id'], 'type' => 'system',
            'summary' => crm_label('policy_type', $after['policy_type']) . ' moved from ' . crm_label('policy_status', $before['status'])
                . ' to ' . crm_label('policy_status', $after['status']),
            'user_id' => $u['id'], 'user_name' => $u['full_name'], 'created_at' => crm_now(),
        ]);
    }
}

/** Adds the calculated parts (risk, compliance, names) to a record for the screen. */
/** Protection-only logins never receive a lead's mortgage figures, or which mortgage case a policy belongs to. */
function crm_entities_strip_mortgage($entity, array $r)
{
    if (!crm_protection_only()) {
        return $r;
    }
    if ($entity === 'leads') {
        foreach (['loan_amount', 'property_value', 'deposit', 'credit_issues'] as $k) {
            unset($r[$k]);
        }
    } elseif ($entity === 'policies') {
        unset($r['case_id']);
    }
    return $r;
}

function crm_decorate($entity, array $r, $ctx = null)
{
    if ($entity === 'cases') {
        if ($ctx === null) {
            $ctx = crm_case_context((int) $r['office_id']);
        }
        $r['risk'] = crm_case_risk($r, $ctx);
        $docs = isset($ctx['docs'][$r['id']]) ? $ctx['docs'][$r['id']] : [];
        $r['compliance_eval'] = crm_compliance_eval($r, $docs, isset($ctx['has_policy'][$r['client_id']]));
        unset($r['compliance']);
    }
    if ($entity === 'templates') {
        $r['shared'] = $r['office_id'] === null;
    }
    return crm_entities_strip_mortgage($entity, $r);
}

/* ---- List & get ---------------------------------------------------------------------------- */

/** GET list: ?entity=&q=&status=&mine=1&... */
function crm_action_list()
{
    $entity = crm_in('entity');
    $def = crm_entity($entity);
    $officeId = crm_office_id();
    $me = (int) crm_user()['id'];
    $q = crm_in_str('q', 100);
    $status = crm_in_str('status', 30);
    $mine = crm_in('mine') === '1';
    $where = [];
    $p = [];
    $today = crm_today();
    $like = '%' . crm_views_like_escape($q) . '%';

    switch ($entity) {
        case 'leads':
            $sql = 'SELECT l.*, i.name AS introducer_name FROM leads l LEFT JOIN introducers i ON i.id = l.introducer_id AND i.office_id = l.office_id WHERE l.office_id = ? AND l.deleted_at IS NULL'
                . crm_protection_and('leads', 'l');
            $p[] = $officeId;
            if ($status === '' || $status === 'open') {
                $where[] = "l.status IN ('new','contacted','qualified')";
            } elseif ($status !== 'all') {
                $where[] = 'l.status = ?';
                $p[] = $status;
            }
            if ($r = crm_in_str('rating', 5)) {
                $where[] = 'l.rating = ?';
                $p[] = $r;
            }
            if ($mine) {
                $where[] = '(l.adviser_id = ? OR l.administrator_id = ?)';
                array_push($p, $me, $me);
            }
            if ($q !== '') {
                $where[] = "(l.first_name || ' ' || l.last_name LIKE ? ESCAPE '\\' OR l.email LIKE ? ESCAPE '\\' OR l.phone LIKE ? ESCAPE '\\')";
                array_push($p, $like, $like, $like);
            }
            $order = " ORDER BY CASE l.rating WHEN 'HOT' THEN 0 WHEN 'WARM' THEN 1 ELSE 2 END, l.created_at DESC";
            break;
        case 'clients':
            // Protection-only advisers get no count of mortgage cases, and their last contact leaves out case activity.
            $sql = 'SELECT c.*,'
                . (crm_protection_only() ? '' : " (SELECT COUNT(*) FROM cases k WHERE k.client_id = c.id AND k.deleted_at IS NULL AND k.status = 'active') AS active_cases,")
                . " (SELECT COUNT(*) FROM policies p WHERE p.client_id = c.id AND p.deleted_at IS NULL AND p.status = 'on_risk') AS policies_in_force,
                (SELECT MAX(a.created_at) FROM activities a WHERE a.client_id = c.id AND a.deleted_at IS NULL AND a.type <> 'system'" . crm_protection_and('activities', 'a') . ') AS last_contact_at
                FROM clients c WHERE c.office_id = ? AND c.deleted_at IS NULL';
            $p[] = $officeId;
            if ($mine) {
                $where[] = '(c.adviser_id = ? OR c.administrator_id = ?)';
                array_push($p, $me, $me);
            }
            if ($q !== '') {
                $where[] = "(c.first_name || ' ' || c.last_name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR c.postcode LIKE ? ESCAPE '\\')";
                array_push($p, $like, $like, $like, $like);
            }
            $order = ' ORDER BY c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE';
            break;
        case 'cases':
            $sql = "SELECT k.*, c.first_name || ' ' || c.last_name AS client_name FROM cases k
                JOIN clients c ON c.id = k.client_id AND c.office_id = k.office_id AND c.deleted_at IS NULL WHERE k.office_id = ? AND k.deleted_at IS NULL";
            $p[] = $officeId;
            if ($status === '' || $status === 'active') {
                $where[] = "k.status = 'active'";
            } elseif ($status !== 'all') {
                $where[] = 'k.status = ?';
                $p[] = $status;
            }
            if ($cid = crm_in_int('client_id')) {
                $where[] = 'k.client_id = ?';
                $p[] = $cid;
            }
            if ($mine) {
                $where[] = '(k.adviser_id = ? OR k.administrator_id = ?)';
                array_push($p, $me, $me);
            }
            if ($q !== '') {
                $where[] = "(c.first_name || ' ' || c.last_name LIKE ? ESCAPE '\\' OR k.lender LIKE ? ESCAPE '\\' OR k.property_address LIKE ? ESCAPE '\\')";
                array_push($p, $like, $like, $like);
            }
            $order = ' ORDER BY k.updated_at DESC';
            break;
        case 'policies':
            $sql = "SELECT p.*, c.first_name || ' ' || c.last_name AS client_name FROM policies p
                JOIN clients c ON c.id = p.client_id AND c.office_id = p.office_id AND c.deleted_at IS NULL WHERE p.office_id = ? AND p.deleted_at IS NULL";
            $p[] = $officeId;
            if ($status === 'renewals') {
                $where[] = "p.status = 'on_risk' AND p.renewal_date IS NOT NULL AND p.renewal_date <= ?";
                $p[] = crm_add_days($today, 60);
            } elseif ($status === 'live' || $status === '') {
                $where[] = "p.status IN ('quote','applied','on_risk')";
            } elseif ($status !== 'all') {
                $where[] = 'p.status = ?';
                $p[] = $status;
            }
            if ($t = crm_in_str('type', 30)) {
                $where[] = 'p.policy_type = ?';
                $p[] = $t;
            }
            if ($cid = crm_in_int('client_id')) {
                $where[] = 'p.client_id = ?';
                $p[] = $cid;
            }
            if ($mine) {
                $where[] = 'p.adviser_id = ?';
                $p[] = $me;
            }
            if ($q !== '') {
                $where[] = "(c.first_name || ' ' || c.last_name LIKE ? ESCAPE '\\' OR p.provider LIKE ? ESCAPE '\\' OR p.policy_number LIKE ? ESCAPE '\\')";
                array_push($p, $like, $like, $like);
            }
            $order = ' ORDER BY CASE WHEN p.renewal_date IS NULL THEN 1 ELSE 0 END, p.renewal_date, p.updated_at DESC';
            break;
        case 'tasks':
            $sql = "SELECT t.*, c.first_name || ' ' || c.last_name AS client_name, l.first_name || ' ' || l.last_name AS lead_name
                FROM tasks t LEFT JOIN clients c ON c.id = t.client_id AND c.office_id = t.office_id LEFT JOIN leads l ON l.id = t.lead_id AND l.office_id = t.office_id
                WHERE t.office_id = ? AND t.deleted_at IS NULL" . crm_protection_and('tasks', 't');
            $p[] = $officeId;
            if ($status === '' || $status === 'open') {
                $where[] = "t.status = 'open'";
            } elseif ($status !== 'all') {
                $where[] = 't.status = ?';
                $p[] = $status;
            }
            $due = crm_in_str('due', 20);
            if ($due === 'overdue') {
                $where[] = 't.due_date < ?';
                $p[] = $today;
            } elseif ($due === 'today') {
                $where[] = 't.due_date = ?';
                $p[] = $today;
            } elseif ($due === 'upcoming') {
                $where[] = 't.due_date > ? AND t.due_date <= ?';
                array_push($p, $today, crm_add_days($today, 60));
            }
            foreach (['client_id', 'lead_id', 'case_id', 'policy_id'] as $k) {
                if ($v = crm_in_int($k)) {
                    $where[] = 't.' . $k . ' = ?';
                    $p[] = $v;
                }
            }
            if ($mine) {
                $where[] = 't.assigned_to = ?';
                $p[] = $me;
            } elseif ($a = crm_in_int('assigned_to')) {
                $where[] = 't.assigned_to = ?';
                $p[] = $a;
            }
            if ($q !== '') {
                $where[] = "(t.title LIKE ? ESCAPE '\\' OR c.first_name || ' ' || c.last_name LIKE ? ESCAPE '\\')";
                array_push($p, $like, $like);
            }
            $order = " ORDER BY CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date, CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, t.id";
            break;
        case 'documents':
            $sql = "SELECT d.*, c.first_name || ' ' || c.last_name AS client_name FROM documents d
                LEFT JOIN clients c ON c.id = d.client_id AND c.office_id = d.office_id WHERE d.office_id = ? AND d.deleted_at IS NULL";
            $p[] = $officeId;
            if ($status !== '' && $status !== 'all') {
                $where[] = 'd.status = ?';
                $p[] = $status;
            }
            if ($v = crm_in_int('case_id')) {
                $where[] = 'd.case_id = ?';
                $p[] = $v;
            }
            if ($v = crm_in_int('client_id')) {
                $where[] = 'd.client_id = ?';
                $p[] = $v;
            }
            $order = ' ORDER BY d.updated_at DESC';
            break;
        case 'introducers':
            $sql = 'SELECT i.* FROM introducers i WHERE i.office_id = ? AND i.deleted_at IS NULL';
            $p[] = $officeId;
            if ($q !== '') {
                $where[] = "(i.name LIKE ? ESCAPE '\\' OR i.company LIKE ? ESCAPE '\\')";
                array_push($p, $like, $like);
            }
            $order = ' ORDER BY i.name COLLATE NOCASE';
            break;
        case 'templates':
            $sql = 'SELECT t.* FROM templates t WHERE (t.office_id = ? OR t.office_id IS NULL) AND t.deleted_at IS NULL' . crm_templates_protection_and('t');
            $p[] = $officeId;
            $order = ' ORDER BY t.category, t.name';
            break;
        default:
            crm_fail(400, 'invalid', 'Unknown record type.');
    }
    if ($where) {
        $sql .= ' AND ' . implode(' AND ', $where);
    }
    $rows = crm_all($sql . $order . ' LIMIT 5000', $p);
    if ($entity === 'cases') {
        $ctx = crm_case_context($officeId);
        foreach ($rows as $i => $r) {
            $rows[$i] = crm_decorate('cases', $r, $ctx);
        }
    } elseif ($entity === 'templates') {
        foreach ($rows as $i => $r) {
            $rows[$i] = crm_decorate('templates', $r);
        }
    } elseif ($entity === 'leads' || $entity === 'policies') {
        foreach ($rows as $i => $r) {
            $rows[$i] = crm_entities_strip_mortgage($entity, $r);
        }
    }
    crm_ok(['rows' => $rows]);
}

/** Clients in this office with the lead's email or phone number (however the number was spaced or written, e.g. +44). */
function crm_lead_duplicates(array $lead)
{
    $phone = crm_norm_phone($lead['phone']);
    // Narrow down in SQL by the last 7 digits, then compare the whole normalised number.
    $digits = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '+', '')";
    $rows = crm_all("SELECT id, first_name, last_name, email, phone FROM clients WHERE office_id = ? AND deleted_at IS NULL
        AND ((email IS NOT NULL AND email = ?) OR (phone IS NOT NULL AND $digits LIKE ?)) ORDER BY id LIMIT 200",
        [crm_office_id(), $lead['email'], strlen($phone) >= 7 ? '%' . substr($phone, -7) : null]);
    $out = [];
    foreach ($rows as $c) {
        if (($lead['email'] && $c['email'] === $lead['email']) || ($phone !== '' && crm_norm_phone($c['phone']) === $phone)) {
            $out[] = $c;
            if (count($out) === 5) {
                break;
            }
        }
    }
    return $out;
}

function crm_activities_where($col, $id)
{
    return crm_all('SELECT * FROM activities WHERE ' . $col . ' = ? AND office_id = ? AND deleted_at IS NULL' . crm_protection_and('activities', 'activities')
        . ' ORDER BY created_at DESC, id DESC LIMIT 500', [$id, crm_office_id()]);
}

function crm_tasks_where($col, $id)
{
    return crm_all("SELECT * FROM tasks WHERE $col = ? AND office_id = ? AND deleted_at IS NULL" . crm_protection_and('tasks', 'tasks')
        . " ORDER BY status = 'done', due_date IS NULL, due_date, id", [$id, crm_office_id()]);
}

/** GET get: ?entity=&id= — the record plus everything linked to it. */
function crm_action_get()
{
    $entity = crm_in('entity');
    crm_entity($entity);
    $id = crm_in_int('id');
    $r = crm_must_find($entity, $id);
    $officeId = crm_office_id();
    $out = ['record' => crm_decorate($entity, $r)];
    switch ($entity) {
        case 'leads':
            $out['activities'] = crm_activities_where('lead_id', $id);
            $out['tasks'] = crm_tasks_where('lead_id', $id);
            $out['possible_duplicates'] = crm_lead_duplicates($r);
            if ($r['event_contact_id']) {
                $out['event_calls'] = crm_all('SELECT outcome, notes, user_name, created_at FROM sales_calls WHERE contact_id = ? ORDER BY created_at', [$r['event_contact_id']]);
            }
            break;
        case 'clients':
            $ctx = crm_case_context($officeId);
            $cases = crm_all('SELECT * FROM cases WHERE client_id = ? AND office_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', [$id, $officeId]);
            foreach ($cases as $i => $c) {
                $cases[$i] = crm_decorate('cases', $c, $ctx);
            }
            $out['cases'] = $cases;
            $out['policies'] = crm_all('SELECT * FROM policies WHERE client_id = ? AND office_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', [$id, $officeId]);
            $out['activities'] = crm_activities_where('client_id', $id);
            $out['tasks'] = crm_tasks_where('client_id', $id);
            $out['documents'] = crm_all('SELECT * FROM documents WHERE client_id = ? AND office_id = ? AND deleted_at IS NULL ORDER BY case_id, name', [$id, $officeId]);
            $out['opportunities'] = crm_all("SELECT * FROM opportunities WHERE client_id = ? AND office_id = ?" . crm_views_opportunity_case_and('opportunities')
                . " ORDER BY status = 'open' DESC, created_at DESC", [$id, $officeId]);
            if (crm_protection_only()) {
                $out['cases'] = [];
                $out['documents'] = [];
                $out['opportunities'] = array_values(array_map(function ($o) {
                    $o['detail'] = crm_views_opportunity_detail($o);
                    return $o;
                }, array_filter($out['opportunities'], function ($o) {
                    return $o['type'] !== 'remortgage';
                })));
            }
            $out['lead'] = $r['lead_id'] ? crm_one('SELECT id, source, enquiry_type, created_at, score, rating FROM leads WHERE id = ? AND office_id = ?'
                . crm_protection_and('leads', 'leads'), [$r['lead_id'], $officeId]) : null;
            break;
        case 'cases':
            $out['client'] = crm_one('SELECT * FROM clients WHERE id = ? AND office_id = ?', [$r['client_id'], $officeId]);
            $out['documents'] = crm_all('SELECT * FROM documents WHERE case_id = ? AND office_id = ? AND deleted_at IS NULL ORDER BY name', [$id, $officeId]);
            $out['tasks'] = crm_tasks_where('case_id', $id);
            $out['activities'] = crm_activities_where('case_id', $id);
            $out['policies'] = crm_all('SELECT * FROM policies WHERE client_id = ? AND office_id = ? AND deleted_at IS NULL', [$r['client_id'], $officeId]);
            break;
        case 'policies':
            $out['client'] = crm_one('SELECT id, first_name, last_name FROM clients WHERE id = ? AND office_id = ?', [$r['client_id'], $officeId]);
            $out['activities'] = crm_activities_where('policy_id', $id);
            $out['tasks'] = crm_tasks_where('policy_id', $id);
            break;
        case 'introducers':
            $out['leads'] = crm_all('SELECT id, first_name, last_name, status, rating, created_at, client_id FROM leads WHERE introducer_id = ? AND office_id = ? AND deleted_at IS NULL'
                . crm_protection_and('leads', 'leads') . ' ORDER BY created_at DESC', [$id, $officeId]);
            $out['clients'] = crm_all('SELECT id, first_name, last_name, created_at FROM clients WHERE introducer_id = ? AND office_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', [$id, $officeId]);
            break;
    }
    crm_ok($out);
}

/* ---- Delete, trash, restore ------------------------------------------------------------------- */

/** Records that go to the trash together with their parent: [table, link column, extra condition (optional)]. */
function crm_children($entity, $id)
{
    switch ($entity) {
        case 'clients':
            return [['cases', 'client_id'], ['policies', 'client_id'], ['documents', 'client_id'], ['tasks', 'client_id']];
        case 'cases':
            return [['documents', 'case_id'], ['tasks', 'case_id']];
        case 'leads':
            // A converted lead's tasks moved to its client and stay with the client.
            return [['tasks', 'lead_id', 'client_id IS NULL']];
        case 'policies':
            return [['tasks', 'policy_id']];
    }
    return [];
}

/** POST delete: { entity, id } — moves the record (and what belongs to it) to the trash. */
function crm_action_delete()
{
    $entity = crm_in('entity');
    crm_entity($entity);
    $id = crm_in_int('id');
    $u = crm_user();
    crm_tx(function () use ($entity, $id, $u) {
        $r = crm_must_find($entity, $id);
        crm_entities_guard_other_work($entity, $id, false);
        if ($entity === 'templates' && $r['office_id'] === null && !in_array($u['role'], ['admin', 'manager'], true)) {
            crm_fail(403, 'forbidden', 'Shared templates can only be deleted by an office manager.');
        }
        $now = crm_now();
        crm_q('UPDATE ' . $entity . ' SET deleted_at = ?, deleted_by = ? WHERE id = ?', [$now, $u['id'], $id]);
        foreach (crm_children($entity, $id) as $ch) {
            crm_q('UPDATE ' . $ch[0] . ' SET deleted_at = ?, deleted_by = ? WHERE ' . $ch[1] . ' = ? AND office_id = ? AND deleted_at IS NULL'
                . (isset($ch[2]) ? ' AND ' . $ch[2] : ''), [$now, $u['id'], $id, crm_office_id()]);
        }
        crm_entity_audit('delete', $entity, $id, 'Moved ' . strtolower(crm_entity($entity)['label']) . ' ' . crm_record_name($entity, $r) . ' to the trash', $r);
    });
    crm_ok();
}

/** POST restore: { entity, id } — brings a record (and what was trashed with it) back. */
function crm_action_restore()
{
    $entity = crm_in('entity');
    crm_entity($entity);
    $id = crm_in_int('id');
    crm_tx(function () use ($entity, $id) {
        $r = crm_must_find($entity, $id, true);
        if (!$r['deleted_at']) {
            return;
        }
        // What each kind of record belongs to: it can only come back while that still exists here.
        $parentsOf = [
            'cases' => ['client_id' => 'client'], 'policies' => ['client_id' => 'client', 'case_id' => 'case'],
            'documents' => ['client_id' => 'client', 'case_id' => 'case'],
            'tasks' => ['client_id' => 'client', 'case_id' => 'case', 'lead_id' => 'lead', 'policy_id' => 'policy'],
        ];
        $tables = ['client' => 'clients', 'case' => 'cases', 'lead' => 'leads', 'policy' => 'policies'];
        foreach (isset($parentsOf[$entity]) ? $parentsOf[$entity] : [] as $col => $word) {
            if (empty($r[$col])) {
                continue;
            }
            if ($word === 'case' && $entity === 'policies' && crm_protection_only()) {
                continue;   // a policy belongs to its client; a protection-only adviser can't see (or restore) the case it came from
            }
            $p = crm_one('SELECT id, deleted_at FROM ' . $tables[$word] . ' WHERE id = ? AND office_id = ?', [$r[$col], crm_office_id()]);
            if (!$p) {
                crm_fail(409, 'parent_gone', 'This can\'t be restored: the ' . $word . ' it belonged to has been permanently deleted.');
            }
            if ($p['deleted_at']) {
                crm_fail(409, 'parent_deleted', 'Restore the ' . $word . ' it belongs to first: it is in the trash.');
            }
        }
        crm_q('UPDATE ' . $entity . ' SET deleted_at = NULL, deleted_by = NULL, version = version + 1, updated_at = ? WHERE id = ?', [crm_now(), $id]);
        foreach (crm_children($entity, $id) as $ch) {
            crm_q('UPDATE ' . $ch[0] . ' SET deleted_at = NULL, deleted_by = NULL WHERE ' . $ch[1] . ' = ? AND office_id = ? AND deleted_at = ?', [$id, crm_office_id(), $r['deleted_at']]);
        }
        crm_entity_audit('restore', $entity, $id, 'Restored ' . strtolower(crm_entity($entity)['label']) . ' ' . crm_record_name($entity, $r) . ' from the trash', $r);
    });
    crm_ok();
}

/** POST purge: { entity, id } — permanently deletes something already in the trash (managers only). */
function crm_action_purge()
{
    $entity = crm_in('entity');
    crm_entity($entity);
    $id = crm_in_int('id');
    crm_tx(function () use ($entity, $id) {
        $r = crm_must_find($entity, $id, true);
        if (!$r['deleted_at']) {
            crm_fail(409, 'not_in_trash', 'Move it to the trash first.');
        }
        crm_entities_guard_other_work($entity, $id, true);
        $name = crm_record_name($entity, $r);
        crm_purge_rows($entity, $id);
        crm_entity_audit('purge', $entity, $id, 'Permanently deleted ' . strtolower(crm_entity($entity)['label']) . ' ' . $name, $r);
    });
    crm_ok();
}

function crm_purge_rows($entity, $id)
{
    $office = crm_office_id();
    foreach (crm_children($entity, $id) as $ch) {
        foreach (crm_all('SELECT id FROM ' . $ch[0] . ' WHERE ' . $ch[1] . ' = ? AND office_id = ?' . (isset($ch[2]) ? ' AND ' . $ch[2] : ''), [$id, $office]) as $child) {
            crm_purge_rows($ch[0], (int) $child['id']);
        }
    }
    $col = ['clients' => 'client_id', 'cases' => 'case_id', 'leads' => 'lead_id', 'policies' => 'policy_id'];
    if ($entity === 'leads') {
        // Calls, notes and tasks that moved to the client when the lead was converted stay with the client.
        crm_q('DELETE FROM activities WHERE lead_id = ? AND office_id = ? AND client_id IS NULL', [$id, $office]);
        crm_q('DELETE FROM tasks WHERE lead_id = ? AND office_id = ? AND client_id IS NULL', [$id, $office]);
        // A mortgage lead's history stays mortgage work, out of protection-only advisers' sight: it joins the case opened
        // when the lead was converted (else the client's latest case; a live one first), as it can no longer be told apart by its lead.
        $lead = crm_one('SELECT enquiry_type, client_id FROM leads WHERE id = ? AND office_id = ?', [$id, $office]);
        if ($lead && crm_entities_mortgage_work('leads', $lead)) {
            $conv = (int) crm_val('SELECT case_id FROM activities WHERE lead_id = ? AND office_id = ? AND case_id IS NOT NULL ORDER BY id LIMIT 1', [$id, $office]);
            $caseId = crm_val('SELECT id FROM cases WHERE office_id = ? AND (id = ? OR client_id = ?) ORDER BY deleted_at IS NULL DESC, id = ? DESC, created_at DESC, id DESC LIMIT 1',
                [$office, $conv, $lead['client_id'], $conv]);
            if ($caseId) {
                crm_q('UPDATE activities SET case_id = ? WHERE lead_id = ? AND office_id = ? AND case_id IS NULL', [$caseId, $id, $office]);
                crm_q('UPDATE tasks SET case_id = ? WHERE lead_id = ? AND office_id = ? AND case_id IS NULL', [$caseId, $id, $office]);
            }
        }
        crm_q('UPDATE activities SET lead_id = NULL WHERE lead_id = ? AND office_id = ?', [$id, $office]);
        crm_q('UPDATE tasks SET lead_id = NULL WHERE lead_id = ? AND office_id = ?', [$id, $office]);
    } elseif (isset($col[$entity])) {
        crm_q('DELETE FROM activities WHERE ' . $col[$entity] . ' = ? AND office_id = ?', [$id, $office]);
        crm_q('DELETE FROM tasks WHERE ' . $col[$entity] . ' = ? AND office_id = ?', [$id, $office]);
        if (in_array($entity, ['clients', 'cases'], true)) {
            crm_q('DELETE FROM opportunities WHERE ' . $col[$entity] . ' = ? AND office_id = ?', [$id, $office]);
            crm_q('DELETE FROM documents WHERE ' . $col[$entity] . ' = ? AND office_id = ?', [$id, $office]);
        }
        if ($entity === 'clients') {
            crm_q('UPDATE leads SET client_id = NULL WHERE client_id = ? AND office_id = ?', [$id, $office]);
        }
        if ($entity === 'cases') {
            crm_q('UPDATE policies SET case_id = NULL WHERE case_id = ? AND office_id = ?', [$id, $office]);
        }
    }
    if ($entity === 'templates') {
        crm_q('DELETE FROM templates WHERE id = ? AND (office_id = ? OR office_id IS NULL)', [$id, $office]);
        return;
    }
    crm_q('DELETE FROM ' . $entity . ' WHERE id = ? AND office_id = ?', [$id, $office]);
}

/* ---- Lead conversion, reopening lost work ------------------------------------------------------ */

/** POST convertLead: { id, create_case } — one click turns a lead into a client (and a case or quote). */
function crm_action_convert_lead()
{
    $id = crm_in_int('id');
    $createCase = crm_in('create_case') !== false;
    $u = crm_user();
    $out = crm_tx(function () use ($id, $createCase, $u) {
        $l = crm_must_find('leads', $id);
        if ($l['client_id']) {
            crm_fail(409, 'converted', 'This lead has already been converted.', null, ['client_id' => (int) $l['client_id']]);
        }
        $now = crm_now();
        $officeId = (int) $l['office_id'];
        $employment = $l['employment'];
        $clientId = crm_insert('clients', [
            'office_id' => $officeId, 'first_name' => $l['first_name'], 'last_name' => $l['last_name'], 'email' => $l['email'],
            'phone' => $l['phone'], 'employment_status' => $employment, 'adviser_id' => $l['adviser_id'] ?: ($u['role'] === 'adviser' ? (int) $u['id'] : null),
            'administrator_id' => $l['administrator_id'], 'introducer_id' => $l['introducer_id'], 'lead_id' => $l['id'],
            'source' => $l['source'], 'is_landlord' => $l['enquiry_type'] === 'btl' ? 1 : 0,
            'homeowner_status' => $l['enquiry_type'] === 'ftb' ? 'ftb' : null,
            'notes' => $l['notes'], 'created_at' => $now, 'created_by' => $u['id'], 'updated_at' => $now, 'updated_by' => $u['id'],
        ]);
        crm_q("UPDATE leads SET status = 'converted', client_id = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?", [$clientId, $now, $u['id'], $id]);
        crm_q('UPDATE activities SET client_id = ? WHERE lead_id = ? AND office_id = ?', [$clientId, $id, $officeId]);
        crm_q("UPDATE tasks SET client_id = ? WHERE lead_id = ? AND office_id = ?", [$clientId, $id, $officeId]);
        crm_q("UPDATE tasks SET status = 'done', completed_at = ?, completed_by = ? WHERE office_id = ? AND auto_key = ? AND status = 'open'", [$now, $u['id'], $officeId, 'leadcontact:' . $id]);
        $caseId = null;
        $policyId = null;
        $types = crm_enums()['case_type'];
        if ($createCase && $l['enquiry_type'] && isset($types[$l['enquiry_type']]) && !crm_protection_only()) {
            // People and introducers copied from the lead only if still valid (an adviser may have left, an introducer been deleted).
            $case = crm_save_record('cases', 0, [
                'client_id' => $clientId, 'case_type' => $l['enquiry_type'], 'stage' => 'fact_find',
                'loan_amount' => $l['loan_amount'], 'property_value' => $l['property_value'],
                'adviser_id' => crm_entity_still_valid('cases', 'adviser_id', $l['adviser_id']),
                'administrator_id' => crm_entity_still_valid('cases', 'administrator_id', $l['administrator_id']),
                'introducer_id' => crm_entity_still_valid('cases', 'introducer_id', $l['introducer_id']),
            ]);
            $caseId = (int) $case['id'];
        } elseif ($createCase && in_array($l['enquiry_type'], ['protection', 'insurance', 'business_protection'], true)) {
            $map = ['protection' => 'life', 'insurance' => 'home', 'business_protection' => 'business'];
            $pol = crm_save_record('policies', 0, ['client_id' => $clientId, 'policy_type' => $map[$l['enquiry_type']], 'status' => 'quote',
                'adviser_id' => crm_entity_still_valid('policies', 'adviser_id', $l['adviser_id'])]);
            $policyId = (int) $pol['id'];
        }
        crm_insert('activities', [
            'office_id' => $officeId, 'client_id' => $clientId, 'lead_id' => $id, 'case_id' => $caseId, 'type' => 'system',
            'summary' => 'Converted from lead (' . $l['rating'] . ', score ' . $l['score'] . ')', 'user_id' => $u['id'], 'user_name' => $u['full_name'], 'created_at' => $now,
        ]);
        crm_audit('convert', 'leads', $id, 'Converted lead ' . trim($l['first_name'] . ' ' . $l['last_name']) . ' to a client');
        return ['client_id' => $clientId, 'case_id' => $caseId, 'policy_id' => $policyId];
    });
    crm_ok($out);
}

/** POST reopen: { entity: cases|leads, id } — brings a lost case or lead back to life. */
function crm_action_reopen()
{
    $entity = crm_in('entity');
    $id = crm_in_int('id');
    if (!in_array($entity, ['cases', 'leads'], true)) {
        crm_fail(400, 'invalid', 'Only cases and leads can be reopened.');
    }
    $u = crm_user();
    crm_tx(function () use ($entity, $id, $u) {
        $r = crm_must_find($entity, $id);
        if ($r['status'] !== 'lost') {
            crm_fail(409, 'not_lost', 'This is not marked as lost.');
        }
        $now = crm_now();
        if ($entity === 'cases') {
            $stage = $r['stage_before_lost'] ?: 'fact_find';
            if ($stage === 'completed') {
                $stage = 'exchange';
            }
            crm_q("UPDATE cases SET status = 'active', stage = ?, lost_reason = NULL, lost_at = NULL, stage_changed_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?",
                [$stage, $now, $now, $u['id'], $id]);
            crm_insert('activities', ['office_id' => $r['office_id'], 'client_id' => $r['client_id'], 'case_id' => $id, 'type' => 'system',
                'summary' => 'Case reopened at ' . crm_label('stage', $stage), 'user_id' => $u['id'], 'user_name' => $u['full_name'], 'created_at' => $now]);
        } else {
            crm_q("UPDATE leads SET status = 'contacted', lost_reason = NULL, lost_at = NULL, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?", [$now, $u['id'], $id]);
            crm_insert('activities', ['office_id' => $r['office_id'], 'lead_id' => $id, 'type' => 'system', 'summary' => 'Lead reopened',
                'user_id' => $u['id'], 'user_name' => $u['full_name'], 'created_at' => $now]);
        }
        crm_audit('reopen', $entity, $id, 'Reopened ' . crm_record_name($entity, $r));
    });
    crm_ok();
}

/* ---- Timeline (calls, notes, emails) ------------------------------------------------------------ */

/** POST addActivity: { client_id|lead_id|case_id|policy_id, type, summary, outcome?, follow_up_date?, follow_up_title? } */
function crm_action_add_activity()
{
    $u = crm_user();
    $type = crm_in_str('type', 20, 'note');
    if (!isset(crm_enums()['activity_type'][$type]) || $type === 'system') {
        crm_fail(400, 'invalid', 'Choose call, note, email, meeting or text.', 'type');
    }
    $summary = crm_clean((string) crm_in('summary', ''), 5000, true);
    if ($summary === '') {
        crm_fail(400, 'invalid', 'Write what happened.', 'summary');
    }
    $links = ['client_id' => null, 'lead_id' => null, 'case_id' => null, 'policy_id' => null];
    if ($v = crm_in_int('case_id')) {
        $c = crm_must_find('cases', $v);
        $links['case_id'] = $v;
        $links['client_id'] = (int) $c['client_id'];
    }
    if ($v = crm_in_int('policy_id')) {
        $p = crm_must_find('policies', $v);
        $links['policy_id'] = $v;
        $links['client_id'] = (int) $p['client_id'];
    }
    if ($v = crm_in_int('client_id')) {
        crm_must_find('clients', $v);
        $links['client_id'] = $v;
    }
    $lead = null;
    if ($v = crm_in_int('lead_id')) {
        $lead = crm_must_find('leads', $v);
        $links['lead_id'] = $v;
        if ($lead['client_id']) {
            $links['client_id'] = (int) $lead['client_id'];
        }
    }
    if (!array_filter($links)) {
        crm_fail(400, 'invalid', 'Nothing to attach this to.');
    }
    $officeId = crm_office_id();
    $id = crm_tx(function () use ($u, $type, $summary, $links, $lead, $officeId) {
        $id = crm_insert('activities', $links + [
            'office_id' => $officeId, 'type' => $type, 'direction' => crm_in_str('direction', 10) ?: null,
            'outcome' => crm_in_str('outcome', 120) ?: null, 'summary' => $summary,
            'user_id' => $u['id'], 'user_name' => $u['full_name'], 'created_at' => crm_now(),
        ]);
        if ($lead && $lead['status'] === 'new' && $type !== 'note') {
            crm_save_record('leads', (int) $lead['id'], ['status' => 'contacted']);
        }
        $fu = crm_in_str('follow_up_date', 10);
        if ($fu !== '') {
            if (!crm_valid_date($fu)) {
                crm_fail(400, 'invalid', 'Enter a valid follow-up date.', 'follow_up_date');
            }
            $title = crm_in_str('follow_up_title', 200);
            crm_save_record('tasks', 0, [
                'title' => $title !== '' ? $title : 'Follow up: ' . mb_substr($summary, 0, 80),
                'due_date' => $fu, 'assigned_to' => (int) $u['id'],
                'client_id' => $links['client_id'], 'lead_id' => $links['lead_id'], 'case_id' => $links['case_id'], 'policy_id' => $links['policy_id'],
            ]);
        }
        return $id;
    });
    crm_ok(['id' => $id]);
}

function crm_action_delete_activity()
{
    $id = crm_in_int('id');
    $u = crm_user();
    // Protection-only logins can't reach (or learn of) case and mortgage-lead entries.
    $a = crm_one('SELECT * FROM activities WHERE id = ? AND office_id = ? AND deleted_at IS NULL' . crm_protection_and('activities', 'activities'), [$id, crm_office_id()]);
    if (!$a) {
        crm_fail(404, 'not_found', 'That entry could not be found.');
    }
    if ((int) $a['user_id'] !== (int) $u['id'] && !in_array($u['role'], ['admin', 'manager'], true)) {
        crm_fail(403, 'forbidden', 'You can only remove your own timeline entries.');
    }
    crm_q('UPDATE activities SET deleted_at = ? WHERE id = ?', [crm_now(), $id]);
    crm_audit('delete', 'activities', $id, 'Removed a timeline entry: ' . mb_substr($a['summary'], 0, 80));
    crm_ok();
}

/* ---- Compliance, documents, tasks --------------------------------------------------------------- */

/** POST complianceSet: { case_id, key, done } */
function crm_action_compliance_set()
{
    $caseId = crm_in_int('case_id');
    $key = crm_in_str('key', 40);
    $done = crm_in('done') === true;
    $valid = array_column(crm_compliance_items(), 'label', 'key');
    if (!isset($valid[$key])) {
        crm_fail(400, 'invalid', 'Unknown checklist item.');
    }
    $u = crm_user();
    crm_tx(function () use ($caseId, $key, $done, $u, $valid) {
        $c = crm_must_find('cases', $caseId);
        $state = json_decode($c['compliance'] ? $c['compliance'] : '{}', true);
        if (!is_array($state)) {
            $state = [];
        }
        if ($done) {
            $state[$key] = ['done' => true, 'by' => $u['full_name'], 'at' => crm_now()];
        } else {
            unset($state[$key]);
        }
        crm_q('UPDATE cases SET compliance = ? WHERE id = ?', [json_encode($state), $caseId]);
        crm_audit('compliance', 'cases', $caseId, ($done ? 'Ticked ' : 'Unticked ') . '"' . $valid[$key] . '" on ' . crm_record_name('cases', $c));
    });
    $c = crm_must_find('cases', $caseId);
    crm_ok(['record' => crm_decorate('cases', $c)]);
}

/** POST documentPack: { case_id } — requests the standard documents for the case in one go. */
function crm_action_document_pack()
{
    $caseId = crm_in_int('case_id');
    $c = crm_must_find('cases', $caseId);
    $cl = crm_one('SELECT * FROM clients WHERE id = ?', [$c['client_id']]);
    $self = $cl && in_array($cl['employment_status'], ['self_employed', 'contractor'], true);
    $names = ['Photo ID', 'Proof of address', 'Bank statements (3 months)'];
    $names = array_merge($names, $self ? ['SA302 / tax year overviews', 'Accounts (2 years)'] : ['Payslips (3 months)', 'P60']);
    if (in_array($c['case_type'], ['ftb', 'home_mover', 'btl', 'shared_ownership', 'self_build', 'commercial'], true)) {
        $names[] = 'Deposit evidence';
        $names[] = 'Memorandum of sale';
    }
    if (in_array($c['case_type'], ['remortgage', 'product_transfer', 'further_advance'], true)) {
        $names[] = 'Mortgage statement';
    }
    $have = array_column(crm_all('SELECT name FROM documents WHERE case_id = ? AND deleted_at IS NULL', [$caseId]), 'name');
    $added = 0;
    crm_tx(function () use ($names, $have, $caseId, &$added) {
        foreach ($names as $n) {
            if (!in_array($n, $have, true)) {
                crm_save_record('documents', 0, ['case_id' => $caseId, 'name' => $n, 'status' => 'requested']);
                $added++;
            }
        }
    });
    crm_ok(['added' => $added]);
}

/** POST taskDone: { id, done } — quick tick without opening the task. */
function crm_action_task_done()
{
    $id = crm_in_int('id');
    $done = crm_in('done') !== false;
    $t = crm_save_record('tasks', $id, ['status' => $done ? 'done' : 'open']);
    if ($done && $t['lead_id'] && strpos((string) $t['auto_key'], 'leadcontact:') === 0) {
        $l = crm_find('leads', $t['lead_id']);
        if ($l && $l['status'] === 'new') {
            crm_save_record('leads', (int) $l['id'], ['status' => 'contacted']);
        }
    }
    crm_ok(['record' => $t]);
}

/* ---- Email templates ---------------------------------------------------------------------- */

/** POST renderTemplate: { template_id, client_id?, lead_id?, case_id?, policy_id? } -> { to, subject, body } */
function crm_action_render_template()
{
    $t = crm_must_find('templates', crm_in_int('template_id'));
    $u = crm_user();
    $office = crm_one('SELECT * FROM offices WHERE id = ?', [crm_office_id()]);
    $person = null;
    $case = null;
    if ($v = crm_in_int('case_id')) {
        $case = crm_must_find('cases', $v);
        $person = crm_find('clients', $case['client_id']);
    }
    if ($v = crm_in_int('policy_id')) {
        $pol = crm_must_find('policies', $v);
        $person = crm_find('clients', $pol['client_id']);
    }
    if (!$person && ($v = crm_in_int('client_id'))) {
        $person = crm_must_find('clients', $v);
    }
    if (!$person && ($v = crm_in_int('lead_id'))) {
        $person = crm_must_find('leads', $v);
    }
    // A client's latest case fills the mortgage details (clients have a lead_id column, even when it is empty; leads don't).
    // Protection-only advisers never get them.
    if ($person && !$case && array_key_exists('lead_id', $person)) {
        $case = crm_one("SELECT * FROM cases WHERE client_id = ? AND office_id = ? AND deleted_at IS NULL" . crm_protection_and('cases', 'cases')
            . " ORDER BY status = 'active' DESC, created_at DESC LIMIT 1", [$person['id'], crm_office_id()]);
    }
    $adviserId = $case && $case['adviser_id'] ? $case['adviser_id'] : ($person && !empty($person['adviser_id']) ? $person['adviser_id'] : null);
    $adviser = $adviserId ? crm_one('SELECT full_name, email FROM users WHERE id = ?', [$adviserId]) : null;
    $fmtDate = function ($d) {
        return $d ? date('j F Y', strtotime($d)) : '';
    };
    $vars = [
        'first_name' => $person ? $person['first_name'] : '',
        'last_name' => $person ? $person['last_name'] : '',
        'full_name' => $person ? trim($person['first_name'] . ' ' . $person['last_name']) : '',
        'my_name' => $u['full_name'],
        'my_email' => $u['email'] ?: '',
        'adviser_name' => $adviser ? $adviser['full_name'] : $u['full_name'],
        'adviser_email' => $adviser && $adviser['email'] ? $adviser['email'] : ($u['email'] ?: ''),
        'office_name' => $office ? $office['name'] : '',
        'office_phone' => $office && $office['phone'] ? $office['phone'] : '',
        'lender' => $case && $case['lender'] ? $case['lender'] : 'your lender',
        'loan_amount' => $case && $case['loan_amount'] ? '£' . number_format((float) $case['loan_amount']) : '',
        'property_address' => $case && $case['property_address'] ? $case['property_address'] : '',
        'completion_date' => $case ? $fmtDate($case['completion_date'] ?: $case['expected_completion_date']) : '',
        'fixed_rate_end_date' => $case ? $fmtDate($case['fixed_rate_end_date']) : '',
        'today' => date('j F Y'),
    ];
    $fill = function ($s) use ($vars) {
        return preg_replace_callback('/\{\{\s*([a-z_]+)\s*\}\}/', function ($m) use ($vars) {
            return array_key_exists($m[1], $vars) ? $vars[$m[1]] : $m[0];
        }, $s);
    };
    crm_ok(['to' => $person && $person['email'] ? $person['email'] : '', 'subject' => $fill($t['subject']), 'body' => $fill($t['body'])]);
}

/**
 * Whether a logged email came from a mortgage template (one protection-only advisers can't see): the template sent, or
 * when the screen doesn't say which, a template whose subject matches (its {{placeholders}} standing for anything).
 */
function crm_entities_mortgage_email($templateId, $subject)
{
    $where = ' FROM templates t WHERE (t.office_id = ? OR t.office_id IS NULL) AND (' . crm_entities_template_category_cond('t')
        . ' OR ' . crm_entities_template_details_cond('t') . ')';
    if ($templateId) {
        return (bool) crm_val('SELECT 1' . $where . ' AND t.id = ?', [crm_office_id(), $templateId]);
    }
    $sent = preg_replace('/\s+/u', '', $subject);
    if ($sent === '') {
        return false;
    }
    foreach (crm_all('SELECT t.subject' . $where . ' AND t.deleted_at IS NULL', [crm_office_id()]) as $t) {
        $parts = preg_split('/\{\{\s*[a-z_]+\s*\}\}/', preg_replace('/\s+/u', '', $t['subject']));
        if (mb_strlen(implode('', $parts)) < 8) {
            continue;   // a subject that is (nearly) all placeholders would match any email
        }
        $re = '/^' . implode('.*', array_map(function ($p) {
            return preg_quote($p, '/');
        }, $parts)) . '$/iu';
        if (preg_match($re, $sent)) {
            return true;
        }
    }
    return false;
}

/** POST logEmail: { client_id?, lead_id?, case_id?, policy_id?, template_id?, subject } — records that an email was sent from your normal mailbox. */
function crm_action_log_email()
{
    $subject = crm_in_str('subject', 200);
    $body = crm_body();
    $body['type'] = 'email';
    $body['summary'] = 'Email sent: ' . ($subject !== '' ? $subject : '(no subject)');
    // A mortgage template sent from a client's (or policy's) page filled in the client's latest case: the email goes on
    // that case, so it stays out of protection-only advisers' sight.
    if (!crm_protection_only() && !crm_in_int('case_id') && !crm_in_int('lead_id') && crm_entities_mortgage_email(crm_in_int('template_id'), $subject)) {
        $clientId = crm_in_int('client_id') ?: (int) crm_val('SELECT client_id FROM policies WHERE id = ? AND office_id = ?', [crm_in_int('policy_id'), crm_office_id()]);
        $caseId = $clientId ? crm_val("SELECT id FROM cases WHERE client_id = ? AND office_id = ? AND deleted_at IS NULL ORDER BY status = 'active' DESC, created_at DESC LIMIT 1",
            [$clientId, crm_office_id()]) : null;
        if ($caseId) {
            $body['case_id'] = (int) $caseId;
        }
    }
    $GLOBALS['crm_body_replacement'] = $body;
    crm_action_add_activity();
}
