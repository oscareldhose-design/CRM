<?php
/*
 * MAP Operating System (CRM): server API (api.php)
 * =================================================
 * Upload the whole "crm" folder to your website (for example https://themaap.co.uk/crm/).
 * It needs PHP 7.4 or newer with the SQLite extension (pdo_sqlite), which almost every host has.
 * Nothing else: no separate database server, no extra programs.
 *
 * - Everything is stored in the "data" folder next to this file. It is created automatically and
 *   web access to it is blocked. Download backups from the app (Tools -> Import, export & backups).
 * - On first run four logins are created, all with the password in CRM_SEED_PASSWORD (config.php):
 *   the office logins newcastle, nottingham and london (one for each whole office), and admin, which
 *   opens the website admin panel. The admin login also manages every CRM login (approving requests,
 *   resets, offices) and holds the recovery code. Change these passwords once you are in.
 * - Staff request their own login from the sign-in page. Only @themaap.co.uk email addresses are
 *   accepted; info@themaap.co.uk is emailed, and the admin login approves each request.
 *
 * Settings are in config.php.
 *
 * Use HTTPS so that passwords and client details are encrypted on their way to your server.
 */

define('MAP_CRM', 1);
require __DIR__ . '/config.php';
require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/engine.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/admin.php';
require __DIR__ . '/lib/entities.php';
require __DIR__ . '/lib/views.php';
require __DIR__ . '/lib/sales.php';

if (PHP_SAPI === 'cli') {
    // Optional cron job: php api.php cron  (runs the automations for every office)
    if (isset($argv[1]) && $argv[1] === 'cron') {
        crm_db();
        foreach (crm_all('SELECT id FROM offices WHERE active = 1') as $o) {
            crm_engine_run((int) $o['id'], true);
        }
        echo "MAP CRM automations done\n";
    }
    exit;
}

crm_bootstrap_http();

$routes = [
    // action           method  handler                     who may call it
    'status'         => ['GET',  'crm_action_status',        'public'],
    'login'          => ['POST', 'crm_action_login',         'public'],
    'register'       => ['POST', 'crm_action_register',      'public'],
    'recover'        => ['POST', 'crm_action_recover',       'public'],
    'logout'         => ['POST', 'crm_action_logout',        'user'],
    'changePassword' => ['POST', 'crm_action_change_password', 'user'],
    'ackRecovery'    => ['POST', 'crm_action_ack_recovery',  'webadmin'],
    'switchOffice'   => ['POST', 'crm_action_switch_office', 'admin'],
    'meta'           => ['GET',  'crm_action_meta',          'user'],

    // Records (leads, clients, cases, policies, tasks, documents, introducers, templates)
    'list'           => ['GET',  'crm_action_list',          'office'],
    'get'            => ['GET',  'crm_action_get',           'office'],
    'save'           => ['POST', 'crm_action_save',          'office'],
    'delete'         => ['POST', 'crm_action_delete',        'office'],
    'restore'        => ['POST', 'crm_action_restore',       'office'],
    'purge'          => ['POST', 'crm_action_purge',         'manager'],
    'convertLead'    => ['POST', 'crm_action_convert_lead',  'office'],
    'reopen'         => ['POST', 'crm_action_reopen',        'office'],
    'addActivity'    => ['POST', 'crm_action_add_activity',  'office'],
    'deleteActivity' => ['POST', 'crm_action_delete_activity', 'office'],
    'complianceSet'  => ['POST', 'crm_action_compliance_set', 'office'],
    'documentPack'   => ['POST', 'crm_action_document_pack', 'office'],
    'taskDone'       => ['POST', 'crm_action_task_done',     'office'],
    'renderTemplate' => ['POST', 'crm_action_render_template', 'office'],
    'logEmail'       => ['POST', 'crm_action_log_email',     'office'],
    'eraseClient'    => ['POST', 'crm_action_erase_client',  'manager'],
    'importRows'     => ['POST', 'crm_action_import_rows',   'office'],

    // Screens
    'dashboard'      => ['GET',  'crm_action_dashboard',     'office'],
    'pipeline'       => ['GET',  'crm_action_pipeline',      'office'],
    'radar'          => ['GET',  'crm_action_radar',         'office'],
    'opportunities'  => ['GET',  'crm_action_opportunities', 'office'],
    'opportunityAct' => ['POST', 'crm_action_opportunity_act', 'office'],
    'compliance'     => ['GET',  'crm_action_compliance',    'office'],
    'documents'      => ['GET',  'crm_action_documents',     'office'],
    'calendar'       => ['GET',  'crm_action_calendar',      'office'],
    'introducerStats'=> ['GET',  'crm_action_introducer_stats', 'office'],
    'team'           => ['GET',  'crm_action_team',          'office'],
    'reports'        => ['GET',  'crm_action_reports',       'office'],
    'search'         => ['GET',  'crm_action_search',        'office'],
    'notifications'  => ['GET',  'crm_action_notifications', 'user'],
    'notificationsSeen' => ['POST', 'crm_action_notifications_seen', 'user'],
    'lookup'         => ['GET',  'crm_action_lookup',        'office'],
    'lost'           => ['GET',  'crm_action_lost',          'office'],
    'trash'          => ['GET',  'crm_action_trash',         'office'],
    'audit'          => ['GET',  'crm_action_audit',         'manager'],
    'backup'         => ['GET',  'crm_action_backup',        'manager'],

    // General Sales (events calling team)
    'salesEvents'    => ['GET',  'crm_action_sales_events',  'sales'],
    'salesEvent'     => ['GET',  'crm_action_sales_event',   'sales'],
    'salesEventSave' => ['POST', 'crm_action_sales_event_save', 'sales'],
    'salesEventDelete' => ['POST', 'crm_action_sales_event_delete', 'sales'],
    'salesContactSave' => ['POST', 'crm_action_sales_contact_save', 'sales'],
    'salesContactDelete' => ['POST', 'crm_action_sales_contact_delete', 'sales'],
    'salesContactErase' => ['POST', 'crm_action_sales_contact_erase', 'sales'],
    'salesImport'    => ['POST', 'crm_action_sales_import',  'sales'],
    'salesQueue'     => ['GET',  'crm_action_sales_queue',   'sales'],
    'salesCall'      => ['POST', 'crm_action_sales_call',    'sales'],
    'salesRelease'   => ['POST', 'crm_action_sales_release', 'sales'],
    'salesStaff'     => ['GET',  'crm_action_sales_staff',   'sales'],
    'salesHandover'  => ['POST', 'crm_action_sales_handover', 'sales'],
    'salesResults'   => ['GET',  'crm_action_sales_results', 'sales'],

    // Logins, offices and system settings (the admin login, from the website admin panel)
    'adminUsers'     => ['GET',  'crm_action_admin_users',   'webadmin'],
    'adminUserSave'  => ['POST', 'crm_action_admin_user_save', 'webadmin'],
    'adminUserApprove' => ['POST', 'crm_action_admin_user_approve', 'webadmin'],
    'adminUserReject'  => ['POST', 'crm_action_admin_user_reject', 'webadmin'],
    'adminUserReset'   => ['POST', 'crm_action_admin_user_reset', 'webadmin'],
    'adminUserUnlock'  => ['POST', 'crm_action_admin_user_unlock', 'webadmin'],
    'adminOffices'   => ['GET',  'crm_action_admin_offices', 'webadmin'],
    'adminOfficeSave'=> ['POST', 'crm_action_admin_office_save', 'webadmin'],
    'adminSettings'  => ['GET',  'crm_action_admin_settings', 'webadmin'],
    'adminSettingsSave' => ['POST', 'crm_action_admin_settings_save', 'webadmin'],
    'adminRecoveryNew' => ['POST', 'crm_action_admin_recovery_new', 'webadmin'],
    'adminDatabase'  => ['GET',  'crm_action_admin_database', 'webadmin'],
    'adminBackupAll' => ['GET',  'crm_action_admin_backup_all', 'webadmin'],
];

crm_dispatch($routes);
