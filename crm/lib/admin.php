<?php
/* MAP CRM: the admin login (website admin panel): CRM logins, account requests, offices, settings, recovery code. */
if (!defined('MAP_CRM')) {
    http_response_code(404);
    exit;
}

function crm_admin_user_row(array $u)
{
    return crm_user_public($u) + [
        'status' => $u['status'],
        'office_name' => $u['office_id'] ? crm_val('SELECT name FROM offices WHERE id = ?', [$u['office_id']]) : null,
        'requested_role' => $u['requested_role'],
        'advice_type' => $u['advice_type'],
        'advice_label' => isset(CRM_ADVICE_TYPES[$u['advice_type']]) ? CRM_ADVICE_TYPES[$u['advice_type']] : $u['advice_type'],
        'request_note' => $u['request_note'],
        'locked' => $u['locked_until'] && $u['locked_until'] > crm_now(),
        'failed_attempts' => (int) $u['failed_attempts'],
        'created_at' => $u['created_at'],
        'decided_at' => $u['decided_at'],
        'password_changed_at' => $u['password_changed_at'],
        'sessions' => (int) crm_val('SELECT COUNT(*) FROM sessions WHERE user_id = ? AND expires_at > ?', [$u['id'], crm_now()]),
    ];
}

function crm_action_admin_users()
{
    $rows = crm_all("SELECT * FROM users ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 WHEN 'disabled' THEN 2 ELSE 3 END, full_name COLLATE NOCASE");
    crm_ok(['rows' => array_map('crm_admin_user_row', $rows)]);
}

/** Checks a role/office pair for a staff login. */
function crm_admin_check_role_office($role, $officeId)
{
    if (!isset(CRM_ROLES[$role]) || $role === 'admin') {
        crm_fail(400, 'invalid', 'Please choose a role.', 'role');
    }
    if (in_array($role, CRM_OFFICE_ROLES, true) && !crm_val('SELECT id FROM offices WHERE id = ? AND active = 1', [$officeId])) {
        crm_fail(400, 'invalid', 'Please choose an office for this login.', 'office_id');
    }
}

/** Never lock everyone out: at least one active admin login must remain. */
function crm_admin_guard_last_admin($userId, $newRole, $newStatus)
{
    $u = crm_one('SELECT role, status FROM users WHERE id = ?', [$userId]);
    if (!$u || $u['role'] !== 'webadmin' || $u['status'] !== 'active') {
        return;
    }
    if ($newRole === 'webadmin' && $newStatus === 'active') {
        return;
    }
    $others = (int) crm_val("SELECT COUNT(*) FROM users WHERE role = 'webadmin' AND status = 'active' AND id <> ?", [$userId]);
    if ($others === 0) {
        crm_fail(409, 'last_admin', 'This is the only admin login. Make another login an admin first.');
    }
}

function crm_admin_advice($default = 'mortgage_protection')
{
    $a = crm_in_str('advice_type', 30, $default);
    if (!isset(CRM_ADVICE_TYPES[$a])) {
        crm_fail(400, 'invalid', 'Choose "Mortgage & protection" or "Protection only".', 'advice_type');
    }
    return $a;
}

/** POST adminUserSave: { id?, full_name, email, username, role, office_id, status } */
function crm_action_admin_user_save()
{
    $me = crm_user();
    $id = crm_in_int('id');
    $fullName = crm_in_str('full_name', 80);
    $email = crm_norm_email(crm_in_str('email', 254));
    $username = strtolower(crm_in_str('username', 32));
    $role = crm_in_str('role', 20);
    $officeId = crm_in_int('office_id') ?: null;
    $status = crm_in_str('status', 20, 'active');
    $advice = crm_admin_advice();
    if (mb_strlen($fullName) < 2) {
        crm_fail(400, 'invalid', 'Please enter the person\'s full name.', 'full_name');
    }
    if (!in_array($status, ['active', 'disabled'], true)) {
        crm_fail(400, 'invalid', 'Choose active or switched off.', 'status');
    }
    crm_admin_check_role_office($role, $officeId);
    $domain = '@' . strtolower(CRM_ALLOWED_DOMAIN);
    $existing = $id ? crm_one('SELECT * FROM users WHERE id = ?', [$id]) : null;
    if ($id && !$existing) {
        crm_fail(404, 'not_found', 'That login could not be found.');
    }
    $isOfficeAccount = $existing && (int) $existing['is_office_account'] === 1;
    if ($email === '' && !$isOfficeAccount) {
        crm_fail(400, 'invalid', 'Enter their MAP email address.', 'email');
    }
    if ($email !== '' && !crm_is_map_email($email)) {
        crm_fail(400, 'invalid', 'Logins can only be created for MAP email addresses ending ' . $domain . '.', 'email');
    }
    if (!preg_match('/^[a-z0-9][a-z0-9._-]{2,31}$/', $username)) {
        crm_fail(400, 'invalid', 'Usernames are 3–32 characters: letters, numbers, dots, dashes or underscores.', 'username');
    }
    if (crm_val('SELECT id FROM users WHERE (username = ? OR email = ?) AND id <> ?', [$username, $username, $id])) {
        crm_fail(409, 'exists', 'That username is taken.', 'username');
    }
    if ($email !== '' && crm_val('SELECT id FROM users WHERE email = ? AND id <> ?', [$email, $id])) {
        crm_fail(409, 'exists', 'There is already a login with that email.', 'email');
    }
    $now = crm_now();
    if ($existing) {
        crm_admin_guard_last_admin($id, $role, $status);
        if ((int) $id === (int) $me['id'] && $status !== 'active') {
            crm_fail(409, 'self', 'You can\'t switch off your own login.');
        }
        if ($existing['status'] === 'pending') {
            crm_fail(409, 'pending', 'Approve or reject this request first.');
        }
        crm_q('UPDATE users SET full_name = ?, email = ?, username = ?, role = ?, office_id = ?, status = ?, advice_type = ?, updated_at = ? WHERE id = ?',
            [$fullName, $email === '' ? null : $email, $username, $role, $officeId, $status, $advice, $now, $id]);
        if ($status !== 'active') {
            crm_q('DELETE FROM sessions WHERE user_id = ?', [$id]);
        }
        $changes = [];
        foreach (['full_name' => $fullName, 'email' => $email ?: null, 'username' => $username, 'role' => $role, 'office_id' => $officeId, 'status' => $status, 'advice_type' => $advice] as $k => $v) {
            if ((string) $existing[$k] !== (string) $v) {
                $changes[$k] = [$existing[$k], $v];
            }
        }
        crm_audit('user_update', 'users', $id, 'Updated login for ' . $fullName, $changes ?: null, $officeId);
        crm_ok(['user' => crm_admin_user_row(crm_one('SELECT * FROM users WHERE id = ?', [$id]))]);
    }
    $temp = crm_random_password();
    $newId = crm_insert('users', [
        'username' => $username, 'email' => $email, 'full_name' => $fullName, 'password_hash' => password_hash($temp, PASSWORD_DEFAULT),
        'role' => $role, 'office_id' => $officeId, 'status' => 'active', 'must_change_password' => 1, 'advice_type' => $advice,
        'decided_by' => $me['id'], 'decided_at' => $now, 'password_changed_at' => $now, 'created_at' => $now, 'updated_at' => $now,
    ]);
    crm_audit('user_create', 'users', $newId, 'Created a ' . CRM_ROLES[$role] . ' login for ' . $fullName, null, $officeId);
    crm_ok(['user' => crm_admin_user_row(crm_one('SELECT * FROM users WHERE id = ?', [$newId])), 'temp_password' => $temp]);
}

/** POST adminUserApprove: { id, role, office_id } */
function crm_action_admin_user_approve()
{
    $me = crm_user();
    $id = crm_in_int('id');
    $u = crm_one("SELECT * FROM users WHERE id = ? AND status = 'pending'", [$id]);
    if (!$u) {
        crm_fail(404, 'not_found', 'That request could not be found. It may already have been dealt with.');
    }
    $role = crm_in_str('role', 20, $u['role']);
    $officeId = crm_in_int('office_id') ?: ($u['office_id'] ? (int) $u['office_id'] : null);
    $advice = crm_admin_advice($u['advice_type']);
    crm_admin_check_role_office($role, $officeId);
    crm_q("UPDATE users SET status = 'active', role = ?, office_id = ?, advice_type = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?",
        [$role, $officeId, $advice, $me['id'], crm_now(), crm_now(), $id]);
    crm_audit('user_approve', 'users', $id, 'Approved ' . CRM_ROLES[$role] . ' login (' . CRM_ADVICE_TYPES[$advice] . ') for ' . $u['full_name'] . ' (' . $u['email'] . ')', null, $officeId);
    crm_ok();
}

/** POST adminUserReject: { id } */
function crm_action_admin_user_reject()
{
    $me = crm_user();
    $id = crm_in_int('id');
    $u = crm_one("SELECT * FROM users WHERE id = ? AND status = 'pending'", [$id]);
    if (!$u) {
        crm_fail(404, 'not_found', 'That request could not be found. It may already have been dealt with.');
    }
    crm_q("UPDATE users SET status = 'rejected', decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?", [$me['id'], crm_now(), crm_now(), $id]);
    crm_audit('user_reject', 'users', $id, 'Rejected login request from ' . $u['full_name'] . ' (' . $u['email'] . ')', null, $u['office_id']);
    crm_ok();
}

/** POST adminUserReset: { id } — sets a temporary password they must change at next sign-in. */
function crm_action_admin_user_reset()
{
    $id = crm_in_int('id');
    $u = crm_one("SELECT * FROM users WHERE id = ? AND status IN ('active', 'disabled')", [$id]);
    if (!$u) {
        crm_fail(404, 'not_found', 'That login could not be found.');
    }
    $temp = crm_random_password();
    crm_q('UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL, password_changed_at = ?, updated_at = ? WHERE id = ?',
        [password_hash($temp, PASSWORD_DEFAULT), crm_now(), crm_now(), $id]);
    crm_q('DELETE FROM sessions WHERE user_id = ?', [$id]);
    crm_audit('password_reset', 'users', $id, 'Reset the password for ' . $u['full_name'], null, $u['office_id']);
    crm_ok(['temp_password' => $temp]);
}

/** POST adminUserUnlock: { id } */
function crm_action_admin_user_unlock()
{
    $id = crm_in_int('id');
    $u = crm_one('SELECT * FROM users WHERE id = ?', [$id]);
    if (!$u) {
        crm_fail(404, 'not_found', 'That login could not be found.');
    }
    crm_q('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [$id]);
    crm_audit('user_unlock', 'users', $id, 'Unlocked the login for ' . $u['full_name'], null, $u['office_id']);
    crm_ok();
}

function crm_action_admin_offices()
{
    $rows = crm_all("SELECT o.*, (SELECT COUNT(*) FROM users u WHERE u.office_id = o.id AND u.status = 'active') AS staff,
        (SELECT COUNT(*) FROM clients c WHERE c.office_id = o.id AND c.deleted_at IS NULL) AS clients,
        (SELECT COUNT(*) FROM cases k WHERE k.office_id = o.id AND k.deleted_at IS NULL AND k.status = 'active') AS active_cases
        FROM offices o ORDER BY o.name");
    crm_ok(['rows' => $rows]);
}

/** POST adminOfficeSave: { id?, name, address, phone, active } */
function crm_action_admin_office_save()
{
    $id = crm_in_int('id');
    $name = crm_in_str('name', 60);
    $address = crm_in_str('address', 300);
    $phone = crm_in_str('phone', 30);
    $active = crm_in('active') === false ? 0 : 1;
    if (mb_strlen($name) < 2) {
        crm_fail(400, 'invalid', 'Enter the office name.', 'name');
    }
    if ($phone !== '' && !crm_valid_phone($phone)) {
        crm_fail(400, 'invalid', 'Enter a valid phone number.', 'phone');
    }
    if (crm_val('SELECT id FROM offices WHERE name = ? AND id <> ?', [$name, $id])) {
        crm_fail(409, 'exists', 'There is already an office with that name.', 'name');
    }
    if ($id) {
        if (!$active && (int) crm_val('SELECT COUNT(*) FROM offices WHERE active = 1 AND id <> ?', [$id]) === 0) {
            crm_fail(409, 'last_office', 'At least one office must stay open.');
        }
        crm_q('UPDATE offices SET name = ?, address = ?, phone = ?, active = ? WHERE id = ?', [$name, $address ?: null, $phone ?: null, $active, $id]);
        if (!$active) {
            // Staff of a closed office are signed out; they can't work until the admin moves their login.
            crm_q("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE office_id = ? AND role <> 'webadmin')", [$id]);
        }
        crm_audit('office_update', 'offices', $id, 'Updated office ' . $name, null, $id);
    } else {
        $id = crm_insert('offices', ['name' => $name, 'address' => $address ?: null, 'phone' => $phone ?: null, 'active' => $active, 'created_at' => crm_now()]);
        crm_audit('office_create', 'offices', $id, 'Added office ' . $name, null, $id);
    }
    crm_ok(['id' => $id]);
}

function crm_action_admin_settings()
{
    crm_ok([
        'team_threshold' => (int) crm_setting('team_threshold', '30'),
        'quiet_days' => (int) crm_setting('quiet_days', '14'),
        'domain' => CRM_ALLOWED_DOMAIN,
        'recovery_set' => (bool) crm_setting('recovery_hash'),
        'php_version' => PHP_VERSION,
        'sqlite_version' => crm_val('SELECT sqlite_version()'),
        'https' => crm_is_https(),
    ]);
}

/** POST adminSettingsSave: { team_threshold, quiet_days } */
function crm_action_admin_settings_save()
{
    $t = crm_in_int('team_threshold', 30);
    $q = crm_in_int('quiet_days', 14);
    if ($t < 5 || $t > 200) {
        crm_fail(400, 'invalid', 'Use a number between 5 and 200.', 'team_threshold');
    }
    if ($q < 3 || $q > 90) {
        crm_fail(400, 'invalid', 'Use a number of days between 3 and 90.', 'quiet_days');
    }
    crm_set_setting('team_threshold', $t);
    crm_set_setting('quiet_days', $q);
    crm_audit('settings', 'settings', null, 'Changed CRM settings');
    crm_ok();
}

/** POST adminRecoveryNew: makes a new recovery code (shown once). */
function crm_action_admin_recovery_new()
{
    $code = crm_recovery_code();
    crm_set_setting('recovery_hash', password_hash($code, PASSWORD_DEFAULT));
    crm_q("DELETE FROM settings WHERE key = 'recovery_pending'");
    crm_audit('recovery_new', 'settings', null, 'Made a new recovery code');
    crm_ok(['code' => $code]);
}

/** GET adminBackupAll: a JSON copy of every office (no password hashes). */
function crm_action_admin_backup_all()
{
    $out = ['app' => 'map-crm', 'exported_at' => crm_now(), 'exported_by' => crm_user()['full_name'], 'scope' => 'all offices'];
    $out['offices'] = crm_all('SELECT * FROM offices');
    $out['users'] = crm_all('SELECT id, username, email, full_name, role, advice_type, office_id, status, last_login_at, created_at FROM users');
    foreach (['leads', 'clients', 'cases', 'policies', 'activities', 'tasks', 'documents', 'introducers', 'opportunities', 'templates', 'events', 'event_contacts', 'sales_calls'] as $t) {
        $out[$t] = crm_all("SELECT * FROM $t");
    }
    $out['audit_log'] = crm_all('SELECT * FROM audit_log ORDER BY id');
    crm_audit('backup', null, null, 'Downloaded a backup of every office', null, null);
    crm_download('map-crm-backup-all-offices-' . date('Y-m-d-His') . '.json', 'application/json', json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE));
}

/** GET adminDatabase: downloads a consistent copy of the whole SQLite database. */
function crm_action_admin_database()
{
    $tmp = CRM_DATA_DIR . '/export-' . bin2hex(random_bytes(8)) . '.sqlite';
    try {
        crm_db()->exec('VACUUM INTO ' . crm_db()->quote($tmp));
        $copy = new PDO('sqlite:' . $tmp, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $copy->exec("DELETE FROM sessions; DELETE FROM login_failures; DELETE FROM settings WHERE key = 'recovery_pending'; VACUUM;");
        $copy = null;
        $content = file_get_contents($tmp);
    } finally {
        if (is_file($tmp)) {
            @unlink($tmp);
        }
    }
    if ($content === false) {
        crm_fail(500, 'storage', 'The database copy could not be made.');
    }
    crm_audit('backup', null, null, 'Downloaded the full database file');
    crm_download('map-crm-database-' . date('Y-m-d-His') . '.sqlite', 'application/octet-stream', $content);
}
