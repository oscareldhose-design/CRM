<?php
/*
 * MAP website admin panel
 * =======================
 * The admin panel for themaap.co.uk (advisors, reviews, news, announcements, contact inbox, newsletter).
 * It only opens after signing in on the MAP sign-in page with the website admin login
 * (username "admin"). Anyone else is sent to the sign-in page.
 */
define('MAP_CRM', 1);
require __DIR__ . '/config.php';
require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/auth.php';

ini_set('display_errors', '0');
if (function_exists('header_remove')) {
    header_remove('X-Powered-By');
}
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Robots-Tag: noindex, nofollow');

function crm_admin_gate_page($status, $title, $message)
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    $t = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' . $t . ' · MAP</title>'
        . '<link rel="stylesheet" href="app.css"></head><body><div class="auth-side" style="min-height:100vh"><div class="auth-card" style="text-align:center">'
        . '<img src="assets/map-logo.svg" alt="MAP" width="60" height="64" style="margin:0 auto 14px;display:block"><h2>' . $t . '</h2><p class="sub mt">' . $message . '</p>'
        . '<a class="btn btn-primary btn-block mt" href="./">Go to the sign-in page</a></div></div></body></html>';
    exit;
}

try {
    crm_db();
    $auth = crm_current();
} catch (CrmError $e) {
    crm_admin_gate_page(503, 'The admin panel can\'t start', htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8'));
}
if (!$auth) {
    header('Location: ./?next=website-admin', true, 302);
    exit;
}
if ((int) $auth['user']['must_change_password'] === 1) {
    header('Location: ./', true, 302);
    exit;
}
if ($auth['user']['role'] !== 'webadmin') {
    crm_admin_gate_page(403, 'Website admin only', 'You are signed in as ' . htmlspecialchars($auth['user']['full_name'], ENT_QUOTES, 'UTF-8')
        . '. The website admin panel opens with the <b>admin</b> login. Sign out of the CRM first, then sign in as admin.');
}
header('Content-Type: text/html; charset=utf-8');
require __DIR__ . '/lib/website-admin.view.php';
