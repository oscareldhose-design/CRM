<?php
/* MAP CRM: sign-in, account requests, sessions and access control. Loaded by api.php only. */
if (!defined('MAP_CRM')) {
    http_response_code(404);
    exit;
}

const CRM_ROLES = [
    'admin' => 'System admin',
    'manager' => 'Office manager',
    'adviser' => 'Adviser',
    'administrator' => 'Administrator',
    'sales' => 'General Sales',
    'webadmin' => 'Website admin',
];
const CRM_OFFICE_ROLES = ['admin', 'manager', 'adviser', 'administrator'];
const CRM_COOKIE = 'map_crm_sid';

function crm_is_https()
{
    return (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443)
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string) $_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');
}

function crm_cookie_path()
{
    $dir = isset($_SERVER['SCRIPT_NAME']) ? str_replace('\\', '/', dirname((string) $_SERVER['SCRIPT_NAME'])) : '/';
    return rtrim($dir, '/') . '/';
}

function crm_set_cookie($value, $expires)
{
    setcookie(CRM_COOKIE, $value, [
        'expires' => $expires,
        'path' => crm_cookie_path(),
        'secure' => crm_is_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function crm_session_create(array $user, $remember)
{
    $token = bin2hex(random_bytes(32));
    $now = time();
    $life = $remember ? CRM_REMEMBER_DAYS * 86400 : CRM_SESSION_IDLE_HOURS * 3600;
    crm_insert('sessions', [
        'id' => hash('sha256', $token),
        'user_id' => (int) $user['id'],
        'active_office_id' => $user['office_id'],
        'remember' => $remember ? 1 : 0,
        'created_at' => gmdate('Y-m-d\TH:i:s\Z', $now),
        'last_seen_at' => gmdate('Y-m-d\TH:i:s\Z', $now),
        'expires_at' => gmdate('Y-m-d\TH:i:s\Z', $now + $life),
        'ip' => crm_client_ip(),
        'user_agent' => mb_substr(isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : '', 0, 250),
    ]);
    crm_set_cookie($token, $remember ? $now + $life : 0);
    // Tidy up expired sessions now and then.
    if (random_int(1, 20) === 1) {
        crm_q('DELETE FROM sessions WHERE expires_at < ?', [crm_now()]);
    }
}

/** The signed-in user and session, or null. */
function crm_current()
{
    if (array_key_exists('crm_auth', $GLOBALS)) {
        return $GLOBALS['crm_auth'];
    }
    $GLOBALS['crm_auth'] = null;
    $token = isset($_COOKIE[CRM_COOKIE]) ? (string) $_COOKIE[CRM_COOKIE] : '';
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        return null;
    }
    $sid = hash('sha256', $token);
    $s = crm_one('SELECT * FROM sessions WHERE id = ?', [$sid]);
    if (!$s) {
        return null;
    }
    if ($s['expires_at'] < crm_now()) {
        crm_q('DELETE FROM sessions WHERE id = ?', [$sid]);
        return null;
    }
    $u = crm_one('SELECT * FROM users WHERE id = ?', [$s['user_id']]);
    if (!$u || $u['status'] !== 'active') {
        crm_q('DELETE FROM sessions WHERE id = ?', [$sid]);
        return null;
    }
    // Sliding expiry: keep the session alive while it is being used (the bell's background check doesn't count).
    $background = isset($_GET['action']) && $_GET['action'] === 'notifications';
    if (!$background && strtotime($s['last_seen_at']) < time() - 120) {
        $life = (int) $s['remember'] ? CRM_REMEMBER_DAYS * 86400 : CRM_SESSION_IDLE_HOURS * 3600;
        crm_q('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?', [crm_now(), gmdate('Y-m-d\TH:i:s\Z', time() + $life), $sid]);
    }
    $GLOBALS['crm_auth'] = ['user' => $u, 'session' => $s];
    $GLOBALS['crm_user'] = $u;
    return $GLOBALS['crm_auth'];
}

function crm_require_login()
{
    $a = crm_current();
    if (!$a) {
        crm_fail(401, 'signed_out', 'Please sign in.');
    }
    return $a;
}

function crm_user()
{
    $a = crm_require_login();
    return $a['user'];
}

function crm_role_in($user, array $roles)
{
    return in_array($user['role'], $roles, true);
}

function crm_require_access($access, array $user)
{
    $allowed = [
        'user' => array_keys(CRM_ROLES),
        'office' => CRM_OFFICE_ROLES,
        'manager' => ['admin', 'manager'],
        'admin' => ['admin'],
        'sales' => ['sales', 'manager', 'admin'],
        'webadmin' => ['webadmin'],
    ];
    if (!isset($allowed[$access]) || !in_array($user['role'], $allowed[$access], true)) {
        crm_fail(403, 'forbidden', $user['role'] === 'sales'
            ? 'The General Sales area cannot open client files.'
            : 'Your login does not have access to this.');
    }
}

/** The office whose records this request works on. Admins can switch office; everyone else has their own. */
function crm_office_id()
{
    if (isset($GLOBALS['crm_office_id'])) {
        return $GLOBALS['crm_office_id'];
    }
    $a = crm_require_login();
    $u = $a['user'];
    $id = (int) $u['office_id'];
    if ($u['role'] === 'admin' && !empty($a['session']['active_office_id'])) {
        $id = (int) $a['session']['active_office_id'];
    }
    if (!$id || !crm_val('SELECT id FROM offices WHERE id = ? AND active = 1', [$id])) {
        $id = (int) crm_val('SELECT id FROM offices WHERE active = 1 ORDER BY id LIMIT 1');
    }
    if (!$id) {
        crm_fail(409, 'no_office', 'Your login is not linked to an office yet. Ask Newcastle to set it.');
    }
    $GLOBALS['crm_office_id'] = $id;
    return $id;
}

function crm_user_public(array $u)
{
    return [
        'id' => (int) $u['id'],
        'username' => $u['username'],
        'email' => $u['email'],
        'full_name' => $u['full_name'],
        'role' => $u['role'],
        'role_label' => isset(CRM_ROLES[$u['role']]) ? CRM_ROLES[$u['role']] : $u['role'],
        'office_id' => $u['office_id'] === null ? null : (int) $u['office_id'],
        'is_office_account' => (int) $u['is_office_account'] === 1,
        'must_change_password' => (int) $u['must_change_password'] === 1,
        'last_login_at' => $u['last_login_at'],
    ];
}

/* ---- Brute-force protection ------------------------------------------------------------------ */
function crm_ip_failures($kind)
{
    return (int) crm_val('SELECT COUNT(*) FROM login_failures WHERE ip = ? AND kind = ? AND at > ?', [crm_client_ip(), $kind, time() - 900]);
}

function crm_ip_fail($kind)
{
    crm_insert('login_failures', ['ip' => crm_client_ip(), 'kind' => $kind, 'at' => time()]);
    if (random_int(1, 25) === 1) {
        crm_q('DELETE FROM login_failures WHERE at < ?', [time() - 86400]);
    }
}

function crm_ip_guard($kind, $max)
{
    if (crm_ip_failures($kind) >= $max) {
        crm_fail(429, 'rate_limited', 'Too many attempts from this connection. Please wait 15 minutes and try again.');
    }
}

/* ---- Public actions -------------------------------------------------------------------------- */

/** GET status: who is signed in, plus what the sign-in page needs (offices, email domain). */
function crm_action_status()
{
    $a = crm_current();
    $out = [
        'app' => 'map-crm',
        'domain' => CRM_ALLOWED_DOMAIN,
        'require_approval' => crm_setting('require_approval', '1') === '1',
        'https' => crm_is_https(),
        'offices' => crm_all('SELECT id, name FROM offices WHERE active = 1 ORDER BY name'),
        'user' => null,
    ];
    if ($a) {
        $out['user'] = crm_user_public($a['user']);
        if ($a['user']['role'] === 'admin') {
            $pending = crm_setting('recovery_pending');
            if ($pending) {
                $out['recovery_code'] = $pending;
            }
        }
    }
    crm_ok($out);
}

/** POST login: { username, password, remember } */
function crm_action_login()
{
    crm_ip_guard('login', CRM_IP_MAX_FAILS);
    $username = crm_in_str('username', 254);
    $password = crm_in('password');
    $remember = crm_in('remember') === true;
    if ($username === '' || !is_string($password) || $password === '') {
        crm_fail(400, 'invalid', 'Enter your username and password.', $username === '' ? 'username' : 'password');
    }
    $u = crm_one('SELECT * FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)', [$username, $username]);
    if (!$u) {
        password_hash($password, PASSWORD_DEFAULT); // takes as long as a real check, so usernames can't be probed by timing
        crm_ip_fail('login');
        crm_audit('login_failed', 'users', null, 'Unknown username: ' . mb_substr($username, 0, 60), null, null);
        crm_fail(401, 'bad_login', 'That username or password is not right.');
    }
    if ($u['locked_until'] && $u['locked_until'] > crm_now()) {
        $mins = max(1, (int) ceil((strtotime($u['locked_until']) - time()) / 60));
        crm_fail(423, 'locked', 'This login is locked after too many wrong passwords. Try again in ' . $mins . ' minute'
            . ($mins === 1 ? '' : 's') . ', or ask Newcastle to unlock it.');
    }
    if (!password_verify($password, $u['password_hash'])) {
        crm_ip_fail('login');
        $fails = (int) $u['failed_attempts'] + 1;
        $lock = $fails >= CRM_LOGIN_MAX_FAILS ? gmdate('Y-m-d\TH:i:s\Z', time() + CRM_LOGIN_LOCK_MINUTES * 60) : null;
        crm_q('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', [$lock ? 0 : $fails, $lock, $u['id']]);
        crm_audit($lock ? 'login_locked' : 'login_failed', 'users', (int) $u['id'], ($lock ? 'Login locked: ' : 'Wrong password for ') . $u['username'], null, $u['office_id']);
        if ($lock) {
            crm_fail(423, 'locked', 'Too many wrong passwords. This login is now locked for ' . CRM_LOGIN_LOCK_MINUTES . ' minutes.');
        }
        $left = CRM_LOGIN_MAX_FAILS - $fails;
        crm_fail(401, 'bad_login', 'That username or password is not right.'
            . ($left <= 2 ? ' ' . $left . ' more wrong attempt' . ($left === 1 ? '' : 's') . ' will lock this login.' : ''));
    }
    if ($u['status'] === 'pending') {
        crm_fail(403, 'pending', 'Your account request is waiting for approval from Newcastle. You\'ll be able to sign in once it is approved.');
    }
    if ($u['status'] !== 'active') {
        crm_fail(403, 'disabled', 'This login has been switched off. Please contact Newcastle.');
    }
    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
        crm_q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $u['id']]);
    }
    crm_q('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', [crm_now(), $u['id']]);
    crm_session_create($u, $remember);
    $GLOBALS['crm_user'] = $u;
    crm_audit('login', 'users', (int) $u['id'], $u['full_name'] . ' signed in', null, $u['office_id']);
    $u = crm_one('SELECT * FROM users WHERE id = ?', [$u['id']]);
    crm_ok(['user' => crm_user_public($u)]);
}

/** POST register: request a login. Only @themaap.co.uk email addresses are accepted. */
function crm_action_register()
{
    crm_ip_guard('register', 20); // a whole office may sign up from one network
    $b = crm_body();
    $fullName = crm_in_str('full_name', 80);
    $email = crm_norm_email(crm_in_str('email', 254));
    $username = strtolower(crm_in_str('username', 32));
    $password = isset($b['password']) && is_string($b['password']) ? $b['password'] : '';
    $officeId = crm_in_int('office_id');
    $role = crm_in_str('role', 20, 'adviser');
    $note = crm_in_str('note', 300);

    if (mb_strlen($fullName) < 2) {
        crm_fail(400, 'invalid', 'Please enter your full name.', 'full_name');
    }
    $domain = strtolower(CRM_ALLOWED_DOMAIN);
    if (!crm_valid_email($email) || substr($email, -strlen('@' . $domain)) !== '@' . $domain) {
        crm_fail(400, 'invalid', 'Accounts can only be created with a MAP email address ending @' . $domain . '.', 'email');
    }
    if (!preg_match('/^[a-z0-9][a-z0-9._-]{2,31}$/', $username)) {
        crm_fail(400, 'invalid', 'Usernames are 3–32 characters: letters, numbers, dots, dashes or underscores.', 'username');
    }
    $problem = crm_password_problem($password);
    if ($problem) {
        crm_fail(400, 'invalid', $problem, 'password');
    }
    if (!in_array($role, ['adviser', 'administrator', 'manager', 'sales'], true)) {
        crm_fail(400, 'invalid', 'Please choose your role.', 'role');
    }
    if ($role !== 'sales' && !crm_val('SELECT id FROM offices WHERE id = ? AND active = 1', [$officeId])) {
        crm_fail(400, 'invalid', 'Please choose your office.', 'office_id');
    }
    $existing = crm_one('SELECT id, status FROM users WHERE email = ?', [$email]);
    if ($existing && $existing['status'] === 'rejected') {
        crm_q('DELETE FROM users WHERE id = ?', [$existing['id']]);
        $existing = null;
    }
    if ($existing) {
        crm_ip_fail('register');
        crm_fail(409, 'exists', $existing['status'] === 'pending'
            ? 'A request for this email is already waiting for approval.'
            : 'There is already a login for this email. Use "Forgot password?" if you can\'t get in.', 'email');
    }
    if (crm_val('SELECT id FROM users WHERE username = ? OR email = ?', [$username, $username])) {
        crm_fail(409, 'exists', 'That username is taken. Please choose another.', 'username');
    }
    $needsApproval = crm_setting('require_approval', '1') === '1' || $role === 'manager';
    $now = crm_now();
    $id = crm_insert('users', [
        'username' => $username,
        'email' => $email,
        'full_name' => $fullName,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'role' => $role,
        'requested_role' => $role,
        'office_id' => $role === 'sales' && !$officeId ? null : $officeId,
        'status' => $needsApproval ? 'pending' : 'active',
        'request_note' => $note,
        'password_changed_at' => $now,
        'created_at' => $now,
        'updated_at' => $now,
    ]);
    crm_ip_fail('register'); // counts towards the cap on new requests from one connection (20 per 15 minutes)
    crm_audit('account_requested', 'users', $id, $fullName . ' (' . $email . ') requested a ' . CRM_ROLES[$role] . ' login', null, $officeId ?: null);
    crm_ok([
        'status' => $needsApproval ? 'pending' : 'active',
        'message' => $needsApproval
            ? 'Thanks, ' . $fullName . '. Your request has been sent to Newcastle for approval. You can sign in with your username and password once it is approved.'
            : 'Your login is ready. You can sign in now.',
    ]);
}

/** POST recover: Newcastle's recovery code resets a system admin password. { username, code, new_password } */
function crm_action_recover()
{
    crm_ip_guard('recover', 8);
    $username = crm_in_str('username', 254);
    $code = strtoupper(preg_replace('/\s+/', '', crm_in_str('code', 40)));
    $b = crm_body();
    $new = isset($b['new_password']) && is_string($b['new_password']) ? $b['new_password'] : '';
    $problem = crm_password_problem($new);
    if ($problem) {
        crm_fail(400, 'invalid', $problem, 'new_password');
    }
    $hash = crm_setting('recovery_hash');
    $u = crm_one("SELECT * FROM users WHERE (username = ? OR email = ?) AND role = 'admin' AND status = 'active'", [$username, $username]);
    if (!$hash || !$u || !password_verify($code, $hash)) {
        crm_ip_fail('recover');
        crm_audit('recovery_failed', 'users', $u ? (int) $u['id'] : null, 'Wrong recovery code attempt', null, $u ? $u['office_id'] : null);
        crm_fail(401, 'bad_code', 'That recovery code or username is not right. The recovery code only resets a system admin login (Newcastle).');
    }
    crm_tx(function () use ($u, $new) {
        crm_q('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, must_change_password = 0, password_changed_at = ?, updated_at = ? WHERE id = ?',
            [password_hash($new, PASSWORD_DEFAULT), crm_now(), crm_now(), $u['id']]);
        crm_q('DELETE FROM sessions WHERE user_id = ?', [$u['id']]);
        // A recovery code works once: make a new one, shown to Newcastle at next sign-in.
        $next = crm_recovery_code();
        crm_set_setting('recovery_hash', password_hash($next, PASSWORD_DEFAULT));
        crm_set_setting('recovery_pending', $next);
    });
    $GLOBALS['crm_user'] = $u;
    crm_audit('recovery_used', 'users', (int) $u['id'], 'Password reset with the recovery code', null, $u['office_id']);
    crm_ok(['message' => 'Password changed. You can now sign in. A new recovery code will be shown after you sign in.']);
}

function crm_action_logout()
{
    $a = crm_current();
    if ($a) {
        crm_q('DELETE FROM sessions WHERE id = ?', [$a['session']['id']]);
        crm_audit('logout', 'users', (int) $a['user']['id'], $a['user']['full_name'] . ' signed out');
    }
    crm_set_cookie('', time() - 3600);
    crm_ok();
}

/** POST changePassword: { current_password, new_password } */
function crm_action_change_password()
{
    $a = crm_require_login();
    $u = $a['user'];
    $b = crm_body();
    $current = isset($b['current_password']) && is_string($b['current_password']) ? $b['current_password'] : '';
    $new = isset($b['new_password']) && is_string($b['new_password']) ? $b['new_password'] : '';
    if (!password_verify($current, $u['password_hash'])) {
        crm_ip_fail('login');
        crm_fail(400, 'invalid', 'Your current password is not right.', 'current_password');
    }
    $problem = crm_password_problem($new);
    if ($problem) {
        crm_fail(400, 'invalid', $problem, 'new_password');
    }
    if (hash_equals($current, $new)) {
        crm_fail(400, 'invalid', 'Choose a password that is different from your current one.', 'new_password');
    }
    crm_q('UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = ?, updated_at = ? WHERE id = ?',
        [password_hash($new, PASSWORD_DEFAULT), crm_now(), crm_now(), $u['id']]);
    crm_q('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [$u['id'], $a['session']['id']]);
    crm_audit('password_changed', 'users', (int) $u['id'], $u['full_name'] . ' changed their password');
    crm_ok(['message' => 'Password changed. Any other devices signed in as you have been signed out.']);
}

/** POST ackRecovery: Newcastle has written the recovery code down; stop showing it. */
function crm_action_ack_recovery()
{
    crm_q("DELETE FROM settings WHERE key = 'recovery_pending'");
    crm_audit('recovery_acknowledged', 'settings', null, 'Recovery code saved by ' . crm_user()['full_name']);
    crm_ok();
}

/** POST switchOffice: { office_id } (system admin only) */
function crm_action_switch_office()
{
    $a = crm_require_login();
    $id = crm_in_int('office_id');
    if (!crm_val('SELECT id FROM offices WHERE id = ? AND active = 1', [$id])) {
        crm_fail(400, 'invalid', 'Unknown office.');
    }
    crm_q('UPDATE sessions SET active_office_id = ? WHERE id = ?', [$id, $a['session']['id']]);
    crm_ok();
}

/** GET meta: everything the app needs to draw its screens for this user. */
function crm_action_meta()
{
    $a = crm_require_login();
    $u = $a['user'];
    $isOffice = in_array($u['role'], CRM_OFFICE_ROLES, true);
    $officeId = $isOffice ? crm_office_id() : ($u['office_id'] ? (int) $u['office_id'] : null);
    $out = [
        'user' => crm_user_public($u),
        'office' => $officeId ? crm_one('SELECT id, name, address, phone FROM offices WHERE id = ?', [$officeId]) : null,
        'offices' => crm_all('SELECT id, name FROM offices WHERE active = 1 ORDER BY name'),
        'users' => crm_all("SELECT id, full_name, role, office_id, status, email FROM users WHERE status IN ('active', 'disabled') ORDER BY full_name"),
        'enums' => crm_enums(),
        'roles' => CRM_ROLES,
        'today' => crm_today(),
        'settings' => [
            'team_threshold' => (int) crm_setting('team_threshold', '30'),
            'quiet_days' => (int) crm_setting('quiet_days', '14'),
        ],
    ];
    if ($isOffice) {
        $out['introducers'] = crm_all('SELECT id, name, company FROM introducers WHERE office_id = ? AND deleted_at IS NULL AND active = 1 ORDER BY name', [$officeId]);
        $out['compliance_items'] = crm_compliance_items();
        $out['pending_requests'] = $u['role'] === 'admin' ? (int) crm_val("SELECT COUNT(*) FROM users WHERE status = 'pending'") : 0;
    }
    crm_ok($out);
}
