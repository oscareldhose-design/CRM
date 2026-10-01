<?php
/* MAP CRM: core helpers (database, JSON answers, validation). Loaded by api.php only. */
if (!defined('MAP_CRM')) {
    http_response_code(404);
    exit;
}

// Fallbacks for the few hosts without the mbstring extension.
if (!function_exists('mb_strlen')) {
    function mb_strlen($s)
    {
        return (int) preg_match_all('/./us', (string) $s);
    }
    function mb_substr($s, $start, $length = null)
    {
        preg_match_all('/./us', (string) $s, $m);
        return implode('', array_slice($m[0], $start, $length));
    }
    function mb_check_encoding($s)
    {
        return preg_match('//u', (string) $s) === 1;
    }
    function mb_convert_encoding($s)
    {
        return function_exists('iconv') ? (string) @iconv('UTF-8', 'UTF-8//IGNORE', (string) $s) : preg_replace('/[^\x00-\x7F]/', '', (string) $s);
    }
}

const CRM_SCHEMA_VERSION = 1;
const CRM_GUARD = '<?php http_response_code(404); exit; ?>';
const CRM_HTACCESS = "# MAP CRM: private data. Block all web access to this folder.\n"
    . "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n"
    . "<IfModule !mod_authz_core.c>\n    Order deny,allow\n    Deny from all\n</IfModule>\n";

/** An error answer: HTTP status + { ok:false, code, message, field? }. */
class CrmError extends Exception
{
    public $status;
    public $payload;

    public function __construct($status, array $payload)
    {
        parent::__construct(isset($payload['code']) ? $payload['code'] : 'error');
        $this->status = $status;
        $this->payload = $payload;
    }
}

function crm_bootstrap_http()
{
    ini_set('display_errors', '0');
    ini_set('html_errors', '0');
    error_reporting(E_ALL);
    ob_start();
    if (function_exists('header_remove')) {
        header_remove('X-Powered-By');
    }
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    header('Referrer-Policy: same-origin');
    header('X-Frame-Options: DENY');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
    header('Cross-Origin-Resource-Policy: same-origin');

    set_error_handler(function ($type, $message, $file = '', $line = 0) {
        if (error_reporting() & $type) {
            error_log('MAP CRM: PHP error type ' . $type . ' in ' . basename($file) . ' line ' . $line . ': ' . $message);
        }
        return true;
    });
    set_exception_handler(function ($e) {
        if ($e instanceof CrmError) {
            crm_send($e->status, $e->payload);
        }
        error_log('MAP CRM: ' . get_class($e) . ' in ' . basename($e->getFile()) . ' line ' . $e->getLine() . ': ' . $e->getMessage());
        crm_send(500, ['ok' => false, 'code' => 'server', 'message' => 'Something went wrong on the server. Please try again.']);
    });
    register_shutdown_function(function () {
        $e = error_get_last();
        if (!$e || !in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true) || !empty($GLOBALS['crm_sent'])) {
            return;
        }
        error_log('MAP CRM: fatal error in ' . basename($e['file']) . ' line ' . $e['line'] . ': ' . $e['message']);
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo '{"ok":false,"code":"server","message":"Something went wrong on the server. Please try again."}';
    });
}

/** Sends a JSON answer and stops. */
function crm_send($status, array $data)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
    }
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        $json = '{"ok":false,"code":"server","message":"Something went wrong on the server. Please try again."}';
    }
    $GLOBALS['crm_sent'] = true;
    echo $json;
    exit;
}

function crm_ok(array $data = [])
{
    crm_send(200, ['ok' => true] + $data);
}

/** Throws an error answer. */
function crm_fail($status, $code, $message, $field = null, array $extra = [])
{
    $p = ['ok' => false, 'code' => $code, 'message' => $message];
    if ($field !== null) {
        $p['field'] = $field;
    }
    throw new CrmError($status, $p + $extra);
}

/** Routes api.php?action=<name> to its handler after checking the method, CSRF header and access. */
function crm_dispatch(array $routes)
{
    $action = isset($_GET['action']) && is_string($_GET['action']) ? $_GET['action'] : 'status';
    if (!isset($routes[$action])) {
        crm_fail(404, 'not_found', 'Unknown action.');
    }
    list($want, $handler, $access) = $routes[$action];
    $method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
    if ($method !== $want && !($want === 'GET' && $method === 'HEAD')) {
        crm_fail(405, 'method_not_allowed', 'Use ' . $want . ' for this action.');
    }
    if ($method === 'POST') {
        crm_require_csrf();
    }
    crm_db();
    if ($access !== 'public') {
        $auth = crm_require_login();
        $user = $auth['user'];
        if ((int) $user['must_change_password'] === 1 && !in_array($action, ['logout', 'changePassword', 'meta'], true)) {
            crm_fail(403, 'must_change_password', 'Please choose a new password before carrying on.');
        }
        crm_require_access($access, $user);
        if ($access === 'office' || $access === 'manager') {
            crm_engine_maybe_run(crm_office_id());
        }
    }
    call_user_func($handler);
}

/** POST requests must come from the CRM page itself (custom header + same origin). */
function crm_require_csrf()
{
    $h = isset($_SERVER['HTTP_X_MAP_CRM']) ? $_SERVER['HTTP_X_MAP_CRM'] : '';
    if ($h !== '1') {
        crm_fail(403, 'csrf', 'This request was blocked for your security. Please reload the page.');
    }
    if (!empty($_SERVER['HTTP_ORIGIN'])) {
        $origin = parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST);
        $host = isset($_SERVER['HTTP_HOST']) ? preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST']) : '';
        if (!$origin || strcasecmp($origin, $host) !== 0) {
            crm_fail(403, 'csrf', 'This request was blocked for your security. Please reload the page.');
        }
    }
}

/** The JSON request body as an array. */
function crm_body()
{
    static $body = null;
    if (isset($GLOBALS['crm_body_replacement'])) {
        return $GLOBALS['crm_body_replacement'];
    }
    if ($body !== null) {
        return $body;
    }
    $raw = file_get_contents('php://input', false, null, 0, 8 * 1024 * 1024 + 1);
    if ($raw === false || $raw === '') {
        $body = [];
        return $body;
    }
    if (strlen($raw) > 8 * 1024 * 1024) {
        crm_fail(413, 'too_large', 'That upload is too large (8 MB maximum).');
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        crm_fail(400, 'bad_json', 'The request could not be read.');
    }
    $body = $data;
    return $body;
}

/** A request value from the JSON body (POST) or the query string (GET). */
function crm_in($key, $default = null)
{
    $method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
    $src = $method === 'POST' ? crm_body() : $_GET;
    return array_key_exists($key, $src) ? $src[$key] : $default;
}

function crm_in_int($key, $default = 0)
{
    $v = crm_in($key, null);
    if ($v === null || $v === '' || is_array($v)) {
        return $default;
    }
    return (int) $v;
}

function crm_in_str($key, $max = 500, $default = '')
{
    $v = crm_in($key, null);
    if ($v === null || is_array($v) || is_bool($v)) {
        return $default;
    }
    return crm_clean((string) $v, $max);
}

/** Trims and strips control characters (keeps new lines when $multiline). */
function crm_clean($s, $max = 500, $multiline = false)
{
    $s = (string) $s;
    if (!mb_check_encoding($s, 'UTF-8')) {
        $s = mb_convert_encoding($s, 'UTF-8', 'UTF-8');
    }
    $s = $multiline
        ? preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', str_replace("\r\n", "\n", $s))
        : preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s);
    $s = trim((string) $s);
    if (mb_strlen($s) > $max) {
        $s = mb_substr($s, 0, $max);
    }
    return $s;
}

/* ---- Dates ---------------------------------------------------------------------------------- */
function crm_now()
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

function crm_today()
{
    return date('Y-m-d');
}

function crm_add_days($date, $days)
{
    $d = DateTime::createFromFormat('!Y-m-d', substr((string) $date, 0, 10));
    if (!$d) {
        $d = new DateTime('today');
    }
    $d->modify(($days >= 0 ? '+' : '') . (int) $days . ' days');
    return $d->format('Y-m-d');
}

function crm_add_months($date, $months)
{
    $d = DateTime::createFromFormat('!Y-m-d', substr((string) $date, 0, 10));
    if (!$d) {
        return null;
    }
    $d->modify('+' . (int) $months . ' months');
    return $d->format('Y-m-d');
}

/** Whole days from $a to $b (dates or ISO timestamps). */
function crm_days_between($a, $b)
{
    $da = new DateTime(substr((string) $a, 0, 10));
    $dbb = new DateTime(substr((string) $b, 0, 10));
    return (int) $da->diff($dbb)->format('%r%a');
}

/** ISO timestamp -> local date (Y-m-d). */
function crm_local_date($iso)
{
    if (!$iso) {
        return null;
    }
    $t = strtotime($iso);
    return $t ? date('Y-m-d', $t) : null;
}

function crm_iso_week($date = null)
{
    $d = $date ? new DateTime($date) : new DateTime('today');
    return $d->format('o-\WW');
}

function crm_valid_date($s)
{
    if (!is_string($s) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
        return false;
    }
    list($y, $m, $d) = array_map('intval', explode('-', $s));
    return checkdate($m, $d, $y) && $y >= 1900 && $y <= 2200;
}

/* ---- Validation ----------------------------------------------------------------------------- */
function crm_valid_email($s)
{
    return is_string($s) && strlen($s) <= 254 && filter_var($s, FILTER_VALIDATE_EMAIL) !== false;
}

/** A plain address at the MAP domain: letters, numbers and . _ % + - ' before the @, nothing quoted. */
function crm_is_map_email($email)
{
    return is_string($email) && crm_valid_email($email)
        && preg_match('/^[a-z0-9][a-z0-9._%+\'-]{0,63}@' . preg_quote(strtolower(CRM_ALLOWED_DOMAIN), '/') . '$/D', $email) === 1;
}

function crm_norm_email($s)
{
    return strtolower(trim((string) $s));
}

function crm_norm_phone($s)
{
    $d = preg_replace('/\D+/', '', (string) $s);
    if (strpos($d, '44') === 0 && strlen($d) >= 12) {
        $d = '0' . substr($d, 2);
    }
    return $d;
}

function crm_valid_phone($s)
{
    $digits = preg_replace('/\D+/', '', (string) $s);
    return preg_match('/^[0-9+()\-\s.]{7,25}$/', (string) $s) && strlen($digits) >= 7 && strlen($digits) <= 15;
}

function crm_password_problem($pw)
{
    if (!is_string($pw) || strlen($pw) < 8) {
        return 'Use at least 8 characters.';
    }
    if (strlen($pw) > 200) {
        return 'Use 200 characters or fewer.';
    }
    if (!preg_match('/[a-z]/', $pw) || !preg_match('/[A-Z]/', $pw) || !preg_match('/\d/', $pw)) {
        return 'Use a mix of upper-case letters, lower-case letters and numbers.';
    }
    return null;
}

function crm_random_password()
{
    $sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#%*?'];
    $pw = '';
    foreach ($sets as $set) {
        $pw .= $set[random_int(0, strlen($set) - 1)];
    }
    $all = implode('', $sets);
    while (strlen($pw) < 12) {
        $pw .= $all[random_int(0, strlen($all) - 1)];
    }
    return str_shuffle($pw);
}

function crm_recovery_code()
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $parts = [];
    for ($p = 0; $p < 4; $p++) {
        $s = '';
        for ($i = 0; $i < 4; $i++) {
            $s .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $parts[] = $s;
    }
    return 'MAP-' . implode('-', $parts);
}

function crm_client_ip()
{
    if (CRM_CLIENT_IP_HEADER !== '' && !empty($_SERVER[CRM_CLIENT_IP_HEADER])) {
        $ip = trim(explode(',', $_SERVER[CRM_CLIENT_IP_HEADER])[0]);
        if (filter_var($ip, FILTER_VALIDATE_IP)) {
            return $ip;
        }
    }
    return isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
}

/* ---- Database ------------------------------------------------------------------------------- */

/** Opens (and on first run creates) the SQLite database in the data folder. */
function crm_db()
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) {
        crm_fail(503, 'no_sqlite', 'This server\'s PHP does not have SQLite (pdo_sqlite) switched on. Ask your web host to enable it.');
    }
    $dir = CRM_DATA_DIR;
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        crm_fail(503, 'storage', 'The CRM could not create its "data" folder. Please make sure PHP can write to the crm folder.');
    }
    if (!is_file($dir . '/.htaccess')) {
        @file_put_contents($dir . '/.htaccess', CRM_HTACCESS);
    }
    if (!is_file($dir . '/index.html')) {
        @file_put_contents($dir . '/index.html', '');
    }
    // The database file gets a random name so it can't be guessed even on servers that ignore .htaccess.
    $cfgFile = $dir . '/config.php';
    $cfg = is_file($cfgFile) ? (include $cfgFile) : null;
    if (!is_array($cfg) || empty($cfg['db']) || !preg_match('/^crm-[a-f0-9]{32}\.sqlite$/', $cfg['db'])) {
        $cfg = ['db' => 'crm-' . bin2hex(random_bytes(16)) . '.sqlite', 'created' => crm_now()];
        $php = "<?php\n// MAP CRM: name of the database file in this folder. Do not share.\nreturn " . var_export($cfg, true) . ";\n";
        if (@file_put_contents($cfgFile, $php, LOCK_EX) === false) {
            crm_fail(503, 'storage', 'The CRM could not write to its "data" folder. Please make sure PHP can write to the crm folder.');
        }
    }
    $file = $dir . '/' . $cfg['db'];
    $pdo = new PDO('sqlite:' . $file, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 10,
    ]);
    @chmod($file, 0600);
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA busy_timeout = 10000');
    $GLOBALS['crm_db_file'] = $file;
    $ver = 0;
    try {
        $ver = (int) $pdo->query("SELECT value FROM settings WHERE key = 'schema_version'")->fetchColumn();
    } catch (Exception $e) {
        $ver = 0;
    }
    if ($ver < CRM_SCHEMA_VERSION) {
        crm_schema($pdo);
        crm_seed($pdo);
        $pdo->prepare("INSERT INTO settings (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
            ->execute([CRM_SCHEMA_VERSION]);
    }
    return $pdo;
}

function crm_q($sql, array $params = [])
{
    $st = crm_db()->prepare($sql);
    $st->execute(array_values($params));
    return $st;
}

function crm_all($sql, array $params = [])
{
    return crm_q($sql, $params)->fetchAll();
}

function crm_one($sql, array $params = [])
{
    $r = crm_q($sql, $params)->fetch();
    return $r === false ? null : $r;
}

function crm_val($sql, array $params = [])
{
    $v = crm_q($sql, $params)->fetchColumn();
    return $v === false ? null : $v;
}

function crm_insert($table, array $row)
{
    $cols = array_keys($row);
    $sql = 'INSERT INTO ' . $table . ' (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')';
    crm_q($sql, array_values($row));
    return (int) crm_db()->lastInsertId();
}

function crm_update_row($table, $id, array $row)
{
    if (!$row) {
        return;
    }
    $sets = [];
    foreach (array_keys($row) as $c) {
        $sets[] = $c . ' = ?';
    }
    $vals = array_values($row);
    $vals[] = $id;
    crm_q('UPDATE ' . $table . ' SET ' . implode(', ', $sets) . ' WHERE id = ?', $vals);
}

/** Runs $fn inside a write transaction (BEGIN IMMEDIATE, so two people saving at once queue up safely). */
function crm_tx(callable $fn)
{
    $pdo = crm_db();
    if (!empty($GLOBALS['crm_in_tx'])) {
        return $fn();
    }
    $pdo->exec('BEGIN IMMEDIATE');
    $GLOBALS['crm_in_tx'] = true;
    try {
        $r = $fn();
        $pdo->exec('COMMIT');
        $GLOBALS['crm_in_tx'] = false;
        return $r;
    } catch (Exception $e) {
        $pdo->exec('ROLLBACK');
        $GLOBALS['crm_in_tx'] = false;
        throw $e;
    }
}

function crm_setting($key, $default = null)
{
    $v = crm_val('SELECT value FROM settings WHERE key = ?', [$key]);
    return $v === null ? $default : $v;
}

function crm_set_setting($key, $value)
{
    crm_q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [$key, $value === null ? null : (string) $value]);
}

/** Writes an audit log line. $changes is an array of field => [old, new]. */
function crm_audit($action, $entity = null, $entityId = null, $summary = null, $changes = null, $officeId = null)
{
    $u = isset($GLOBALS['crm_user']) ? $GLOBALS['crm_user'] : null;
    if ($officeId === null && $u) {
        $officeId = isset($GLOBALS['crm_office_id']) ? $GLOBALS['crm_office_id'] : $u['office_id'];
    }
    crm_insert('audit_log', [
        'at' => crm_now(),
        'user_id' => $u ? (int) $u['id'] : null,
        'user_name' => $u ? $u['full_name'] : null,
        'office_id' => $officeId,
        'action' => $action,
        'entity' => $entity,
        'entity_id' => $entityId,
        'summary' => $summary === null ? null : mb_substr((string) $summary, 0, 300),
        'changes' => $changes ? json_encode($changes, JSON_UNESCAPED_UNICODE) : null,
        'ip' => crm_client_ip(),
    ]);
}

/* ---- Schema & first-run data ---------------------------------------------------------------- */
function crm_schema(PDO $pdo)
{
    $tracked = "
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      created_by INTEGER,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_by INTEGER,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      deleted_by INTEGER";
    $pdo->exec("
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS offices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  address TEXT,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  office_id INTEGER REFERENCES offices(id),
  status TEXT NOT NULL DEFAULT 'pending',
  is_office_account INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  password_changed_at TEXT,
  requested_role TEXT,
  request_note TEXT,
  decided_by INTEGER,
  decided_at TEXT,
  notifications_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_office_id INTEGER,
  remember INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_failures ON login_failures(ip, kind, at);

CREATE TABLE IF NOT EXISTS introducers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER NOT NULL REFERENCES offices(id),
  name TEXT NOT NULL,
  company TEXT,
  type TEXT,
  email TEXT,
  phone TEXT,
  commission_terms TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  $tracked
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER NOT NULL REFERENCES offices(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  enquiry_type TEXT,
  source TEXT,
  introducer_id INTEGER,
  loan_amount REAL,
  property_value REAL,
  deposit REAL,
  timescale TEXT,
  credit_issues TEXT,
  employment TEXT,
  notes TEXT,
  score INTEGER,
  rating TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  adviser_id INTEGER,
  administrator_id INTEGER,
  client_id INTEGER,
  event_contact_id INTEGER,
  lost_reason TEXT,
  lost_at TEXT,
  $tracked
);
CREATE INDEX IF NOT EXISTS idx_leads_office ON leads(office_id, status);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER NOT NULL REFERENCES offices(id),
  title TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  postcode TEXT,
  employment_status TEXT,
  annual_income REAL,
  marital_status TEXT,
  dependants INTEGER,
  is_landlord INTEGER NOT NULL DEFAULT 0,
  homeowner_status TEXT,
  joint_applicant TEXT,
  adviser_id INTEGER,
  administrator_id INTEGER,
  introducer_id INTEGER,
  lead_id INTEGER,
  source TEXT,
  existing_plans TEXT,
  next_review_date TEXT,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  erased_at TEXT,
  $tracked
);
CREATE INDEX IF NOT EXISTS idx_clients_office ON clients(office_id);
CREATE INDEX IF NOT EXISTS idx_clients_surname ON clients(last_name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER NOT NULL REFERENCES offices(id),
  client_id INTEGER NOT NULL,
  case_type TEXT NOT NULL DEFAULT 'purchase',
  stage TEXT NOT NULL DEFAULT 'enquiry',
  status TEXT NOT NULL DEFAULT 'active',
  lender TEXT,
  product TEXT,
  loan_amount REAL,
  property_value REAL,
  property_address TEXT,
  rate REAL,
  rate_type TEXT,
  fixed_term_years INTEGER,
  fixed_rate_end_date TEXT,
  term_years INTEGER,
  application_date TEXT,
  offer_date TEXT,
  offer_expiry_date TEXT,
  expected_completion_date TEXT,
  completion_date TEXT,
  proc_fee REAL,
  broker_fee REAL,
  adviser_id INTEGER,
  administrator_id INTEGER,
  introducer_id INTEGER,
  next_action TEXT,
  next_action_date TEXT,
  lost_reason TEXT,
  lost_at TEXT,
  stage_before_lost TEXT,
  compliance TEXT,
  stage_changed_at TEXT,
  notes TEXT,
  $tracked
);
CREATE INDEX IF NOT EXISTS idx_cases_office ON cases(office_id, status);
CREATE INDEX IF NOT EXISTS idx_cases_client ON cases(client_id);

CREATE TABLE IF NOT EXISTS policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER NOT NULL REFERENCES offices(id),
  client_id INTEGER NOT NULL,
  case_id INTEGER,
  policy_type TEXT NOT NULL,
  provider TEXT,
  policy_number TEXT,
  status TEXT NOT NULL DEFAULT 'quote',
  premium REAL,
  sum_assured REAL,
  term_years INTEGER,
  quote_date TEXT,
  start_date TEXT,
  renewal_date TEXT,
  commission REAL,
  adviser_id INTEGER,
  notes TEXT,
  $tracked
);
CREATE INDEX IF NOT EXISTS idx_policies_office ON policies(office_id, status);
CREATE INDEX IF NOT EXISTS idx_policies_client ON policies(client_id);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER NOT NULL,
  client_id INTEGER,
  lead_id INTEGER,
  case_id INTEGER,
  policy_id INTEGER,
  type TEXT NOT NULL DEFAULT 'note',
  direction TEXT,
  outcome TEXT,
  summary TEXT NOT NULL,
  user_id INTEGER,
  user_name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_activities_client ON activities(client_id);
CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_case ON activities(case_id);
CREATE INDEX IF NOT EXISTS idx_activities_office ON activities(office_id, created_at);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to INTEGER,
  client_id INTEGER,
  lead_id INTEGER,
  case_id INTEGER,
  policy_id INTEGER,
  auto_key TEXT,
  completed_at TEXT,
  completed_by INTEGER,
  $tracked
);
CREATE INDEX IF NOT EXISTS idx_tasks_office ON tasks(office_id, status, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_autokey ON tasks(office_id, auto_key) WHERE auto_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER NOT NULL,
  case_id INTEGER,
  client_id INTEGER,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  requested_at TEXT,
  received_at TEXT,
  expiry_date TEXT,
  notes TEXT,
  $tracked
);
CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER,
  name TEXT NOT NULL,
  category TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  $tracked
);

CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER NOT NULL,
  client_id INTEGER,
  case_id INTEGER,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  due_date TEXT,
  value REAL,
  status TEXT NOT NULL DEFAULT 'open',
  auto_key TEXT,
  actioned_by INTEGER,
  actioned_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_opps_autokey ON opportunities(office_id, auto_key) WHERE auto_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  user_id INTEGER,
  user_name TEXT,
  office_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  summary TEXT,
  changes TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_office ON audit_log(office_id, id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  event_date TEXT,
  location TEXT,
  organiser TEXT,
  sponsorship_cost REAL,
  notes TEXT,
  $tracked
);

CREATE TABLE IF NOT EXISTS event_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  postcode TEXT,
  interest TEXT,
  notes TEXT,
  consent INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  consent_source TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  callback_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_called_at TEXT,
  last_outcome TEXT,
  claimed_by INTEGER,
  claimed_at TEXT,
  handed_lead_id INTEGER,
  handed_office_id INTEGER,
  handed_at TEXT,
  handed_by INTEGER,
  erased_at TEXT,
  $tracked
);
CREATE INDEX IF NOT EXISTS idx_event_contacts_event ON event_contacts(event_id, status);

CREATE TABLE IF NOT EXISTS sales_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES event_contacts(id),
  user_id INTEGER,
  user_name TEXT,
  outcome TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_calls_contact ON sales_calls(contact_id);
");
}

/** First run: the three offices, their logins, the website admin login, the recovery code and starter email templates. */
function crm_seed(PDO $pdo)
{
    if ((int) $pdo->query('SELECT COUNT(*) FROM offices')->fetchColumn() > 0) {
        return;
    }
    $now = crm_now();
    $offices = [
        ['Newcastle', '11 Valley House, Seventh Avenue, Kingsway South, Team Valley, Gateshead', 'admin', 'newcastle', 'Newcastle Office'],
        ['Nottingham', '20 Jarodale House, 7 Gregory Boulevard, Forest Fields, Nottingham', 'manager', 'nottingham', 'Nottingham Office'],
        ['London', 'CP House, Otterspool Way, Watford, Hertfordshire', 'manager', 'london', 'London Office'],
    ];
    $insOffice = $pdo->prepare('INSERT INTO offices (name, address, created_at) VALUES (?, ?, ?)');
    $insUser = $pdo->prepare('INSERT INTO users (username, full_name, password_hash, role, office_id, status, is_office_account, password_changed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, \'active\', 1, ?, ?, ?)');
    foreach ($offices as $o) {
        $insOffice->execute([$o[0], $o[1], $now]);
        $officeId = (int) $pdo->lastInsertId();
        $insUser->execute([$o[3], $o[4], password_hash(CRM_SEED_PASSWORD, PASSWORD_DEFAULT), $o[2], $officeId, $now, $now, $now]);
    }
    // The website admin panel login (website-admin.php).
    $insUser->execute(['admin', 'Website admin', password_hash(CRM_SEED_PASSWORD, PASSWORD_DEFAULT), 'webadmin', null, $now, $now, $now]);
    $code = crm_recovery_code();
    $set = $pdo->prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    $set->execute(['recovery_hash', password_hash($code, PASSWORD_DEFAULT)]);
    $set->execute(['recovery_pending', $code]);   // shown once to Newcastle at first sign-in, then deleted
    $set->execute(['require_approval', '1']);
    $set->execute(['team_threshold', '30']);
    $set->execute(['quiet_days', '14']);

    $templates = [
        ['First contact', 'Leads', 'Your mortgage enquiry with MAP',
            "Hi {{first_name}},\n\nThank you for getting in touch with MAP. I'm {{my_name}} and I'll be looking after your enquiry.\n\nCould you let me know a good time for a quick call so we can talk through what you're looking for? It usually takes about 15 minutes.\n\nKind regards,\n{{my_name}}\nMAP | The Mortgage Advice Professionals\n{{office_name}} office"],
        ['Documents needed', 'Cases', 'Documents for your mortgage application',
            "Hi {{first_name}},\n\nTo move your application forward, please send us:\n\n- Photo ID (passport or driving licence)\n- Proof of address dated within the last 3 months\n- Your last 3 months' payslips\n- Your last 3 months' bank statements\n- Evidence of your deposit\n\nYou can reply to this email with photos or scans.\n\nKind regards,\n{{my_name}}\nMAP | Your way home"],
        ['Offer issued', 'Cases', 'Great news: your mortgage offer has been issued',
            "Hi {{first_name}},\n\nGreat news! {{lender}} has issued your mortgage offer for {{loan_amount}}.\n\nWe'll keep in touch with your solicitor through to completion. If you have any questions in the meantime, just reply to this email.\n\nKind regards,\n{{my_name}}\nMAP | Your way home"],
        ['Completion congratulations', 'Cases', 'Congratulations on completing!',
            "Hi {{first_name}},\n\nCongratulations, your mortgage has completed! It has been a pleasure helping you.\n\nYour fixed rate is due to end on {{fixed_rate_end_date}}. We'll be in touch about six months before so you never roll onto your lender's standard rate.\n\nKind regards,\n{{my_name}}\nMAP | Your way home"],
        ['Remortgage review', 'Remortgage', 'Your fixed rate ends soon: let\'s review your options',
            "Hi {{first_name}},\n\nYour current fixed rate with {{lender}} ends on {{fixed_rate_end_date}}. Now is the right time to review your options so you don't move onto a higher variable rate.\n\nCould we book a quick call this week?\n\nKind regards,\n{{my_name}}\nMAP | Your way home"],
        ['Protection review', 'Protection', 'Protecting your home and family',
            "Hi {{first_name}},\n\nNow that your mortgage is in place, it's worth making sure your family and home are protected if the unexpected happens: life cover, critical illness and income protection.\n\nI'd be happy to run through some options with no obligation. When suits you for a call?\n\nKind regards,\n{{my_name}}\nMAP | Your way home"],
        ['Insurance renewal', 'Insurance', 'Your policy renewal is coming up',
            "Hi {{first_name}},\n\nYour insurance policy is due for renewal soon. Before it renews automatically, we can check you're still getting the right cover at the best price.\n\nKind regards,\n{{my_name}}\nMAP | Your way home"],
    ];
    $insT = $pdo->prepare('INSERT INTO templates (office_id, name, category, subject, body, created_at, updated_at) VALUES (NULL, ?, ?, ?, ?, ?, ?)');
    foreach ($templates as $t) {
        $insT->execute([$t[0], $t[1], $t[2], $t[3], $now, $now]);
    }
}
