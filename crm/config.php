<?php
/*
 * MAP Operating System (CRM): settings (config.php)
 * ==================================================
 * The few settings you might want to change. Everything else is automatic.
 */
if (!defined('MAP_CRM')) {
    http_response_code(404);
    exit;
}

/* ---- Settings ---------------------------------------------------------------------------------- */
const CRM_SEED_PASSWORD = 'Map@2025#';      // first password for the newcastle / nottingham / london and admin logins
const CRM_ALLOWED_DOMAIN = 'themaap.co.uk';  // only emails at this domain may request an account
const CRM_NOTIFY_EMAIL = 'info@themaap.co.uk'; // told by email when someone requests a login
const CRM_MAIL_FROM = 'no-reply@themaap.co.uk'; // the "from" address on those emails (must be on your domain)
const CRM_PUBLIC_URL = 'https://themaap.co.uk/crm/'; // where the CRM lives (used for the link in those emails)
const CRM_WEBSITE_BASE = '/';                // website-admin.php loads the advisor photos (images/...) from here
define('CRM_DATA_DIR', getenv('MAP_CRM_DATA_DIR') ?: __DIR__ . '/data'); // created automatically (you may move it outside the web root)

/* ---- Advanced settings (normally leave these as they are) ------------------------------------- */
const CRM_TIMEZONE = 'Europe/London';
const CRM_SESSION_IDLE_HOURS = 10;           // signed out after this long without using the CRM
const CRM_REMEMBER_DAYS = 30;                // "Keep me signed in" lasts this long
const CRM_LOGIN_MAX_FAILS = 5;               // wrong passwords in a row lock that login...
const CRM_LOGIN_LOCK_MINUTES = 15;           // ...for this many minutes
const CRM_IP_MAX_FAILS = 30;                 // wrong passwords from one IP address within 15 minutes
const CRM_CLIENT_IP_HEADER = '';             // only behind a proxy/CDN, e.g. 'HTTP_CF_CONNECTING_IP'

date_default_timezone_set(CRM_TIMEZONE);
