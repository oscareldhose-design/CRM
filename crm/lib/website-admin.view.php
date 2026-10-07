<?php
/*
 * MAP website admin panel (view). Shown by website-admin.php only when the "admin" login is signed in.
 * The panel's Firebase script is unchanged from the original admin.html; only the layout and styling are new.
 */
if (!defined('MAP_CRM')) {
    http_response_code(404);
    exit;
}
$crm_admin_name = isset($GLOBALS['crm_user']['full_name']) ? $GLOBALS['crm_user']['full_name'] : 'Website admin';
$crm_admin_initials = strtoupper(implode('', array_map(function ($w) {
    return mb_substr($w, 0, 1);
}, array_slice(preg_split('/\s+/', trim($crm_admin_name)), 0, 2))));
$crm_admin_html = <<<'MAP_ADMIN_PANEL_HTML'
<!DOCTYPE html>
<html lang="en-GB">
<head>
	<meta charset="UTF-8">
	<!-- The panel's own pictures (images/...) live on the website, so relative links start at the website root. -->
	<base href="{{WEBSITE_BASE}}">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta name="robots" content="noindex, nofollow">
	<meta name="theme-color" content="#a308a3">
	<title>MAP Website Admin · Control Room</title>
	<link rel="icon" type="image/svg+xml" href="{{CRM_BASE}}assets/map-mark.svg">
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@600;700;800&display=swap" rel="stylesheet">
	<script>
		/* Light mode is the default, like themaap.co.uk. The panel's own script remembers the choice. */
		try { if (!localStorage.getItem('map_admin_theme')) localStorage.setItem('map_admin_theme', 'light'); } catch (e) { /* private mode */ }
	</script>
	<style>
		/* MAP Website Admin: styled to match themaap.co.uk, the Lucky Draw and the MAP CRM. */
		:root {
			--p: #a308a3;
			--p2: #6e006e;
			--p3: #4a0047;
			--p-bright: #d60dd6;
			--p-soft: rgba(163, 8, 163, .08);
			--p-glow: rgba(124, 58, 237, .30);
			--grad: linear-gradient(135deg, #a308a3, #6e006e);
			--font: "Inter", "Poppins", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
			--font-display: "Montserrat", "Inter", "Segoe UI", system-ui, sans-serif;
			/* light (default) */
			--bg: #f7f5fb;
			--bg2: #f1ecf8;
			--surface: #ffffff;
			--surface2: #fbf8fd;
			--surface3: #f4eef9;
			--glass: rgba(255, 255, 255, .86);
			--border: #ece4f1;
			--border2: #dccbe6;
			--text: #1a1a1a;
			--text1: #1a1a1a;
			--text2: #5f5768;
			--text3: #8b8294;
			--heading: #8e1a9e;
			--ok: #15803d; --ok-bg: #e9f8ef; --ok-line: #b7e4c7;
			--warn: #b45309; --warn-bg: #fff6e5; --warn-line: #f6d79c;
			--err: #c0262d; --err-bg: #fdecec; --err-line: #f5c2c4;
			--info: #3456c4; --info-bg: #ebf0fd; --info-line: #c4d1f7;
			--shadow: 0 1px 2px rgba(42, 0, 42, .04), 0 8px 24px rgba(124, 58, 237, .07);
			--shadow-lg: 0 20px 60px rgba(124, 58, 237, .22);
			--shadow-btn: 0 4px 15px rgba(124, 58, 237, .30);
			--shadow-btn-hover: 0 6px 20px rgba(124, 58, 237, .45);
			--focus: rgba(163, 8, 163, .30);
			--r: 20px;
			--r2: 14px;
			--r3: 10px;
			--sb: 272px;
			color-scheme: light;
		}
		body.dark-mode {
			--bg: #07060c;
			--bg2: #0d0a16;
			--surface: #120e1c;
			--surface2: #171223;
			--surface3: #1f1830;
			--glass: rgba(18, 14, 28, .86);
			--border: #2a2140;
			--border2: #3d2f5a;
			--text: #f4f1f8;
			--text1: #f4f1f8;
			--text2: #c2b7d0;
			--text3: #8f839f;
			--heading: #e9a6ec;
			--p-soft: rgba(229, 144, 231, .10);
			--ok: #4ade80; --ok-bg: #0f2a1a; --ok-line: #1f4d31;
			--warn: #fbbf24; --warn-bg: #2b2009; --warn-line: #5c4512;
			--err: #ff8a8a; --err-bg: #2f1012; --err-line: #5e2226;
			--info: #93b4ff; --info-bg: #121a33; --info-line: #263766;
			--shadow: 0 0 0 1px rgba(201, 79, 201, .08), 0 12px 32px rgba(0, 0, 0, .55);
			--shadow-lg: 0 0 0 1px rgba(201, 79, 201, .2), 0 30px 80px rgba(0, 0, 0, .7);
			--focus: rgba(229, 144, 231, .45);
			color-scheme: dark;
		}

		*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
		html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
		body { font-family: var(--font); font-size: 15px; line-height: 1.5; background: var(--bg); color: var(--text); min-height: 100vh; overflow-x: hidden; -webkit-font-smoothing: antialiased; }
		a { color: var(--p); }
		body.dark-mode a { color: #e590e7; }
		:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; border-radius: 6px; }
		code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .85em; }

		/* Soft brand glow in the background, like the website */
		.blob { position: fixed; border-radius: 50%; pointer-events: none; z-index: 0; filter: blur(80px); }
		.blob-1 { width: 560px; height: 560px; top: -160px; right: -140px; background: radial-gradient(circle, rgba(163, 8, 163, .10), transparent 70%); }
		.blob-2 { width: 460px; height: 460px; bottom: -120px; left: -120px; background: radial-gradient(circle, rgba(124, 58, 237, .08), transparent 70%); }
		.blob-3 { display: none; }
		body.dark-mode .blob-1 { background: radial-gradient(circle, rgba(163, 8, 163, .28), transparent 70%); }
		body.dark-mode .blob-2 { background: radial-gradient(circle, rgba(110, 0, 110, .22), transparent 70%); }

		/* ---------- Layout ---------- */
		.admin-wrap { position: relative; z-index: 1; display: flex; min-height: 100vh; }
		.admin-sidebar {
			width: var(--sb); position: fixed; inset: 0 auto 0 0; z-index: 100; display: flex; flex-direction: column;
			background: var(--glass); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); border-right: 1px solid var(--border);
			transition: transform .25s ease;
		}
		.sidebar-brand { display: flex; align-items: center; gap: 12px; padding: 18px 20px 16px; border-bottom: 1px solid var(--border); text-decoration: none; }
		.brand-icon { flex: none; display: grid; place-items: center; }
		.brand-icon img { height: 56px; width: auto; display: block; }
		body.dark-mode .brand-icon img { background: #fff; border-radius: 12px; padding: 4px 6px; }
		.brand-text { line-height: 1.15; }
		.brand-name { font-family: var(--font-display); font-weight: 800; font-size: 16px; color: var(--text); }
		.brand-sub { font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--p); margin-top: 3px; }
		body.dark-mode .brand-sub { color: #e590e7; }
		.sidebar-scroll { flex: 1; overflow-y: auto; padding: 6px 12px 12px; }
		.sidebar-section { margin-top: 12px; }
		.sidebar-section-label { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--text3); padding: 6px 10px; }
		.sidebar-nav { display: grid; gap: 2px; }
		.sidebar-link {
			display: flex; align-items: center; gap: 11px; width: 100%; padding: 10px 12px; border: 0; border-radius: 12px; background: transparent;
			color: var(--text2); font: 600 14px var(--font); text-align: left; cursor: pointer; transition: background .15s, color .15s;
		}
		.sidebar-link:hover { background: var(--p-soft); color: var(--p); }
		body.dark-mode .sidebar-link:hover { color: #e590e7; }
		.sidebar-link.active { background: var(--grad); color: #fff; box-shadow: var(--shadow-btn); }
		.nav-icon { width: 22px; text-align: center; font-size: 16px; flex: none; }
		.nav-badge { margin-left: auto; min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--p); color: #fff; font-size: 11.5px; font-weight: 700; text-align: center; }
		.sidebar-link.active .nav-badge { background: rgba(255, 255, 255, .25); }
		.sidebar-footer { padding: 14px 16px 18px; border-top: 1px solid var(--border); display: grid; gap: 10px; }
		.theme-toggle {
			width: 100%; min-height: 42px; border-radius: 999px; border: 1.5px solid var(--border2); background: var(--surface); color: var(--text2);
			font: 700 13.5px var(--font-display); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: border-color .15s, color .15s;
		}
		.theme-toggle:hover { border-color: var(--p); color: var(--p); }
		.sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(20, 0, 30, .45); z-index: 90; backdrop-filter: blur(2px); }
		.sidebar-overlay.show { display: block; }

		.admin-main { margin-left: var(--sb); flex: 1; min-width: 0; display: flex; flex-direction: column; }
		.admin-topbar {
			position: sticky; top: 12px; z-index: 50; margin: 12px 20px 0; min-height: 68px; padding: 10px 14px 10px 18px; display: flex; align-items: center; gap: 12px;
			border-radius: 25px; background: var(--glass); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); border: 1px solid var(--border);
			box-shadow: 0 10px 30px rgba(124, 58, 237, .10);
		}
		.menu-toggle { display: none; width: 42px; height: 42px; border-radius: 50%; border: 1.5px solid var(--border); background: var(--surface); color: var(--text2); font-size: 18px; cursor: pointer; flex: none; }
		.topbar-title { font-weight: 700; font-size: 17px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
		.topbar-conn { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
		.conn-pill {
			display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 700;
			border: 1px solid var(--border2); background: var(--surface2); color: var(--text2); white-space: nowrap;
		}
		.conn-pill::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: .55; }
		.conn-pill.ok { color: var(--ok); border-color: var(--ok-line); background: var(--ok-bg); }
		.conn-pill.ok::before { opacity: 1; box-shadow: 0 0 6px currentColor; animation: pulse 2s infinite; }
		.conn-pill.error { color: var(--err); border-color: var(--err-line); background: var(--err-bg); }
		@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
		.who-chip { display: inline-flex; align-items: center; gap: 8px; padding: 4px 6px 4px 4px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); font-size: 13px; color: var(--text2); }
		.who-avatar { width: 30px; height: 30px; border-radius: 50%; background: var(--grad); color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 12px; }
		.admin-content { padding: 22px 20px 48px; width: 100%; max-width: 1360px; margin: 0 auto; display: grid; gap: 18px; align-content: start; }
		.page-intro h1 { font-size: 28px; color: var(--heading); font-weight: 800; letter-spacing: -.01em; }
		.page-intro h1::after { content: ''; display: block; width: 48px; height: 4px; border-radius: 4px; background: var(--grad); margin-top: 10px; }
		.page-intro p { color: var(--text2); margin-top: 8px; max-width: 72ch; }

		/* ---------- Stats ---------- */
		.stats-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; }
		.stat-card { background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--p); border-radius: var(--r2); padding: 14px 16px; box-shadow: var(--shadow); }
		.stat-icon { font-size: 18px; line-height: 1; margin-bottom: 8px; }
		.stat-label { font-size: 11.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text3); }
		.stat-value { font-size: 28px; font-weight: 800; color: var(--heading); letter-spacing: -.02em; margin-top: 2px; font-variant-numeric: tabular-nums; }
		.stat-sub { font-size: 12.5px; color: var(--text2); margin-top: 2px; }

		/* ---------- Tabs ---------- */
		.tabs-bar { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; border-radius: 999px; background: var(--surface3); border: 1px solid var(--border); width: fit-content; max-width: 100%; }
		.tab-btn { border: 0; background: transparent; padding: 8px 16px; border-radius: 999px; cursor: pointer; font: 600 13.5px var(--font); color: var(--text2); white-space: nowrap; transition: background .15s, color .15s; }
		.tab-btn:hover { color: var(--p); }
		.tab-btn.active { background: var(--grad); color: #fff; box-shadow: var(--shadow-btn); }
		.card-body > .tabs-bar { margin-bottom: 4px; }

		/* ---------- Section cards ---------- */
		.section-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); box-shadow: var(--shadow); min-width: 0; scroll-margin-top: 100px; animation: fadeIn .25s ease; }
		.section-card.is-hidden { display: none; }
		.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 18px 22px; border-bottom: 1px solid var(--border); }
		.card-head-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
		.card-head-icon { width: 44px; height: 44px; border-radius: 14px; background: var(--grad); display: grid; place-items: center; font-size: 20px; flex: none; box-shadow: var(--shadow-btn); }
		.card-head h2 { font-size: 19px; font-weight: 800; color: var(--heading); letter-spacing: -.01em; }
		.card-head-sub { font-size: 13px; color: var(--text3); margin-top: 2px; }
		.card-tools { display: flex; gap: 8px; flex-wrap: wrap; }
		.card-body { padding: 20px 22px 22px; }
		.card-body h3 { font-size: 16px !important; color: var(--text) !important; }
		.footer-tip { padding: 16px 20px; font-size: 13px; color: var(--text2); line-height: 1.6; }
		.footer-tip strong { color: var(--text); }
		@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

		/* ---------- Forms ---------- */
		.form-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px 16px; }
		.field { grid-column: span 6; display: grid; gap: 6px; min-width: 0; align-content: start; }
		.field.half { grid-column: span 3; }
		.field.third { grid-column: span 2; }
		.field label { font-size: 13px; font-weight: 600; color: var(--text2); }
		input, select, textarea {
			width: 100%; min-height: 44px; padding: 10px 14px; border-radius: var(--r3); border: 1.5px solid var(--border2); background: var(--surface);
			color: var(--text); font: 400 14.5px var(--font); transition: border-color .15s, box-shadow .15s;
		}
		select { appearance: none; padding-right: 38px; cursor: pointer;
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a308a3' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
			background-repeat: no-repeat; background-position: right 12px center; background-size: 16px; }
		body.dark-mode select option { background: #120e1c; color: #f4f1f8; }
		textarea { min-height: 110px; resize: vertical; line-height: 1.55; }
		input[type="file"] { padding: 8px 10px; background: var(--surface2); cursor: pointer; }
		input[type="file"]::file-selector-button { border: 0; border-radius: 999px; padding: 7px 14px; margin-right: 12px; background: var(--grad); color: #fff; font: 700 12.5px var(--font-display); cursor: pointer; }
		input:focus, select:focus, textarea:focus { outline: none; border-color: var(--p); box-shadow: 0 0 0 4px var(--focus); }
		.actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
		.muted { color: var(--text2); font-size: 14px; margin-bottom: 14px; }
		.key-hint { font-size: 12.5px; color: var(--text3); margin-top: 10px; }

		/* ---------- Buttons (pill, like the website) ---------- */
		.btn {
			display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 42px; padding: 0 20px; border-radius: 999px;
			border: 1.5px solid transparent; font: 700 14px var(--font-display); cursor: pointer; white-space: nowrap; text-decoration: none;
			transition: transform .15s, box-shadow .15s, background-color .15s, border-color .15s, color .15s;
		}
		.btn:disabled { opacity: .55; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
		.btn.primary { background: var(--grad); color: #fff; box-shadow: var(--shadow-btn); }
		.btn.primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: var(--shadow-btn-hover); }
		.btn.ghost { background: var(--surface); color: var(--p); border-color: rgba(163, 8, 163, .35); }
		body.dark-mode .btn.ghost { color: #e590e7; border-color: var(--border2); }
		.btn.ghost:hover:not(:disabled) { border-color: var(--p); background: var(--p-soft); }
		.btn.danger { background: var(--surface); color: var(--err); border-color: var(--err-line); }
		.btn.danger:hover:not(:disabled) { background: var(--err-bg); border-color: var(--err); }
		.btn.warn { background: var(--surface); color: var(--warn); border-color: var(--warn-line); }
		.btn.warn:hover:not(:disabled) { background: var(--warn-bg); border-color: var(--warn); }
		.row-actions .btn, .item .btn { min-height: 34px; padding: 0 14px; font-size: 12.5px; }

		/* ---------- Status messages ---------- */
		.status { display: none; margin-top: 14px; padding: 12px 14px; border-radius: var(--r2); border: 1px solid var(--border); font-size: 14px; font-weight: 500; background: var(--surface2); color: var(--text2); }
		.status.show { display: flex; align-items: flex-start; gap: .5rem; }
		.status.ok, .status.success { background: var(--ok-bg); color: var(--ok); border-color: var(--ok-line); }
		.status.error { background: var(--err-bg); color: var(--err); border-color: var(--err-line); }
		.status.info { background: var(--info-bg); color: var(--info); border-color: var(--info-line); }
		.status.warning, .status.warn { background: var(--warn-bg); color: var(--warn); border-color: var(--warn-line); }

		/* ---------- Lists ---------- */
		.list { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
		.list:empty { display: none; }
		.item { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--r2); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; transition: border-color .15s, box-shadow .15s; }
		.item:hover { border-color: var(--border2); box-shadow: var(--shadow); }
		.item-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
		.item h4 { font-size: 15px; font-weight: 700; line-height: 1.35; color: var(--text); }
		.item small { color: var(--text3); font-size: 12.5px; line-height: 1.5; word-break: break-word; }
		.item p { font-size: 14px; color: var(--text2); }
		.chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; border: 1px solid var(--border2); background: var(--surface3); color: var(--text2); white-space: nowrap; }
		.chip.live { background: var(--ok-bg); color: var(--ok); border-color: var(--ok-line); }
		.chip.draft { background: var(--warn-bg); color: var(--warn); border-color: var(--warn-line); }
		.chip.expired { background: var(--err-bg); color: var(--err); border-color: var(--err-line); }
		.row-actions { display: flex; gap: 8px; flex-wrap: wrap; }
		.news-image-preview { display: none; max-width: 240px; max-height: 160px; border-radius: var(--r2); border: 1px solid var(--border); object-fit: cover; margin-top: 8px; }
		.news-item-img { width: 100%; max-width: 280px; max-height: 160px; object-fit: cover; border-radius: var(--r3); border: 1px solid var(--border); }

		/* Review preview */
		.preview-card { margin-top: 18px; padding: 16px 18px; border-radius: var(--r2); border: 1px dashed rgba(163, 8, 163, .35); background: var(--p-soft); display: grid; gap: 6px; }
		.preview-card .stars { color: #f5a524; font-size: 17px; letter-spacing: 2px; }
		.preview-card .title { font-weight: 700; color: var(--text); }
		.preview-card .meta { font-size: 13px; color: var(--text3); }

		/* ---------- Advisors & team ---------- */
		.advisor-tab-content { display: none; margin-top: 20px; animation: fadeIn .25s ease; }
		.advisor-tab-content.active { display: block; }
		.adm-grid-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
		.adm-grid-label { font-weight: 700; color: var(--text); font-size: 14.5px; }
		.adm-count-pill { padding: 4px 12px; border-radius: 999px; background: var(--p-soft); color: var(--p); font-size: 12.5px; font-weight: 700; border: 1px solid rgba(163, 8, 163, .2); }
		body.dark-mode .adm-count-pill { color: #e590e7; }
		.adm-hint { font-size: 13px; color: var(--text3); margin-bottom: 14px; }
		.adm-people-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: 10px; max-height: 470px; overflow-y: auto; padding: 4px; margin-bottom: 20px; scrollbar-width: thin; }
		.adm-person-card {
			position: relative; background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--r2); padding: 14px 8px 12px; text-align: center;
			cursor: pointer; user-select: none; transition: transform .15s, border-color .15s, box-shadow .15s;
		}
		.adm-person-card:hover { transform: translateY(-2px); border-color: rgba(163, 8, 163, .5); box-shadow: 0 6px 18px rgba(124, 58, 237, .16); }
		.adm-person-card.selected { border-color: var(--p); background: var(--p-soft); box-shadow: 0 0 0 3px var(--focus); }
		.adm-person-avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; margin: 0 auto 8px; display: block; border: 3px solid var(--surface); box-shadow: 0 0 0 2px rgba(163, 8, 163, .35); background: var(--surface3); }
		.adm-person-init { width: 64px; height: 64px; border-radius: 50%; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center; background: var(--grad); color: #fff; font-size: 22px; font-weight: 800; }
		.adm-person-name { font-size: 12px; font-weight: 700; color: var(--text1); line-height: 1.3; word-break: break-word; }
		.adm-person-sub, .adm-person-dept { font-size: 11px; color: var(--text3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
		.adm-person-dept { opacity: .8; }
		.adm-fb-dot { position: absolute; top: 8px; right: 8px; width: 10px; height: 10px; border-radius: 50%; background: #22c55e; border: 2px solid var(--surface); box-shadow: 0 0 0 2px rgba(34, 197, 94, .25); }
		.adm-section-divider { display: flex; align-items: center; gap: 12px; margin: 22px 0 14px; color: var(--p); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; }
		body.dark-mode .adm-section-divider { color: #e590e7; }
		.adm-section-divider::before, .adm-section-divider::after { content: ''; flex: 1; height: 1px; background: var(--border2); }
		.adm-form-header { font-size: 16px; font-weight: 800; color: var(--heading); margin-bottom: 14px; }

		/* ---------- Small screens ---------- */
		@media (max-width: 1080px) {
			.field.third { grid-column: span 3; }
		}
		@media (max-width: 920px) {
			.admin-sidebar { transform: translateX(-100%); }
			.admin-sidebar.open { transform: none; box-shadow: var(--shadow-lg); background: var(--surface); }
			.admin-main { margin-left: 0; }
			.menu-toggle { display: inline-grid; place-items: center; }
		}
		@media (max-width: 680px) {
			.admin-topbar { margin: 8px 10px 0; top: 8px; border-radius: 20px; flex-wrap: wrap; }
			.who-name { display: none; }
			.admin-content { padding: 16px 16px 60px; }
			.field.half, .field.third { grid-column: span 6; }
			.card-head, .card-body { padding-left: 16px; padding-right: 16px; }
			.stats-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
			.stat-value { font-size: 23px; }
			.tabs-bar { border-radius: 18px; }
			.page-intro h1 { font-size: 24px; }
		}
		@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } html { scroll-behavior: auto; } }

		/* Password dialog */
		.pw-layer { position: fixed; inset: 0; z-index: 300; display: none; place-items: center; padding: 16px; background: rgba(20, 0, 30, .5); backdrop-filter: blur(4px); }
		.pw-layer.show { display: grid; }
		.pw-box { width: min(440px, 100%); background: var(--surface); border: 2px solid var(--p); border-radius: var(--r); box-shadow: var(--shadow-lg); padding: 22px; display: grid; gap: 12px; }
		.pw-box h2 { font-size: 20px; color: var(--heading); }
		.pw-box.wide { width: min(640px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; }
		.pw-box .muted { margin-bottom: 0; }

		/* ---------- CRM logins ---------- */
		.tab-count { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px; margin-left: 6px; border-radius: 999px; background: var(--p); color: #fff; font-size: 11px; font-weight: 800; }
		.tab-btn.active .tab-count { background: rgba(255, 255, 255, .3); }
		.tab-count[hidden] { display: none; }
		.crm-notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 14px 18px; border-radius: var(--r2); background: var(--p-soft); border: 1.5px solid rgba(163, 8, 163, .3); color: var(--text); font-weight: 600; }
		.crm-notice[hidden] { display: none; }
		.crm-notice .btn { min-height: 36px; padding: 0 16px; font-size: 13px; }
		.crm-toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
		.crm-toolbar input { flex: 1 1 240px; width: auto; }
		.crm-toolbar select { flex: 0 1 220px; width: auto; }
		.crm-person { display: flex; gap: 12px; align-items: center; min-width: 0; }
		.crm-avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--grad); color: #fff; display: grid; place-items: center; font: 800 14px var(--font-display); flex: none; }
		.crm-chips { display: flex; gap: 6px; flex-wrap: wrap; }
		.chip.info { background: var(--info-bg); color: var(--info); border-color: var(--info-line); }
		.item .form-grid { margin: 4px 0 2px; }
		.item .field label { font-size: 12.5px; }
		.item select { min-height: 40px; padding-top: 8px; padding-bottom: 8px; }
		.item [hidden] { display: none !important; }
		.crm-office-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; margin-top: 4px; }
		.crm-mini { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 10px 0 2px; }
		.crm-mini b { display: block; font-size: 19px; color: var(--heading); font-variant-numeric: tabular-nums; }
		.crm-mini span { font-size: 12px; color: var(--text3); }
		.crm-check { display: flex !important; grid-column: span 6; align-items: center; gap: 10px; font-size: 14px; color: var(--text2); cursor: pointer; }
		.crm-check input { width: 20px; min-height: 20px; height: 20px; accent-color: var(--p); flex: none; }
		.crm-code { font: 800 22px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .06em; text-align: center; padding: 18px; border-radius: var(--r2); background: var(--p-soft); border: 1.5px dashed rgba(163, 8, 163, .45); color: var(--heading); word-break: break-all; user-select: all; }
		.crm-points { margin: 0; padding-left: 20px; display: grid; gap: 6px; font-size: 14px; color: var(--text2); }
		.crm-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; }
		@media (max-width: 760px) { .crm-two { grid-template-columns: 1fr; } }
		.field [hidden], .field[hidden] { display: none !important; }
	</style>
	<script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
</head>
<body>
<script>try { if (localStorage.getItem('map_admin_theme') === 'dark') document.body.classList.add('dark-mode'); } catch (e) { /* private mode */ }</script>

<div class="blob blob-1"></div>
<div class="blob blob-2"></div>
<div class="blob blob-3"></div>

<div class="admin-wrap">

	<!-- Inside .admin-wrap (its own stacking layer) so the open sidebar sits above the dimmed overlay on phones. -->
	<div class="sidebar-overlay" id="sidebarOverlay"></div>

	<!-- ═══ SIDEBAR ═══ -->
	<aside class="admin-sidebar" id="adminSidebar" aria-label="Admin menu">
		<div class="sidebar-brand">
			<div class="brand-icon"><img src="{{CRM_BASE}}assets/map-logo.svg" alt="MAP" width="56" height="60"></div>
		</div>

		<div class="sidebar-scroll">
			<div class="sidebar-section">
				<div class="sidebar-section-label">CRM logins</div>
				<nav class="sidebar-nav">
					<button class="sidebar-link" type="button" data-target="crm-requests-section"><span class="nav-icon">🙋</span> Login requests <span class="nav-badge" id="crmPendingBadge" hidden>0</span></button>
					<button class="sidebar-link" type="button" data-target="crm-logins-section"><span class="nav-icon">👥</span> Logins</button>
					<button class="sidebar-link" type="button" data-target="crm-offices-section"><span class="nav-icon">🏢</span> Offices &amp; settings</button>
					<button class="sidebar-link" type="button" data-target="crm-security-section"><span class="nav-icon">🛡️</span> Security &amp; backups</button>
				</nav>
			</div>

			<div class="sidebar-section">
				<div class="sidebar-section-label">Website content</div>
				<nav class="sidebar-nav" id="sidebarNav">
					<button class="sidebar-link" type="button" data-target="advisors-section"><span class="nav-icon">👨‍💼</span> Advisors &amp; team</button>
					<button class="sidebar-link" type="button" data-target="search-section"><span class="nav-icon">🔎</span> Search links</button>
					<button class="sidebar-link" type="button" data-target="review-section"><span class="nav-icon">⭐</span> Reviews</button>
					<button class="sidebar-link" type="button" data-target="news-section"><span class="nav-icon">📰</span> News</button>
				</nav>
			</div>

			<div class="sidebar-section">
				<div class="sidebar-section-label">Campaigns</div>
				<nav class="sidebar-nav">
					<button class="sidebar-link" type="button" data-target="announcement-section"><span class="nav-icon">📣</span> Announcements</button>
				</nav>
			</div>

			<div class="sidebar-section">
				<div class="sidebar-section-label">Inbox</div>
				<nav class="sidebar-nav">
					<button class="sidebar-link" type="button" data-target="contact-section"><span class="nav-icon">✉️</span> Contact inbox</button>
					<button class="sidebar-link" type="button" data-target="newsletter-section"><span class="nav-icon">📧</span> Newsletter <span class="nav-badge" id="newsletterBadge">0</span></button>
				</nav>
			</div>

			<div class="sidebar-section">
				<div class="sidebar-section-label">Setup</div>
				<nav class="sidebar-nav">
					<button class="sidebar-link active" type="button" data-target="firebase-section"><span class="nav-icon">🔗</span> Firebase connection</button>
				</nav>
			</div>
		</div>

		<div class="sidebar-footer">
			<button class="theme-toggle" id="themeToggle" type="button"><span>🌙</span> Enable Dark Mode</button>
		</div>
	</aside>

	<!-- ═══ MAIN ═══ -->
	<div class="admin-main">

		<!-- TOPBAR -->
		<header class="admin-topbar">
			<button class="menu-toggle" id="menuToggle" type="button" aria-label="Toggle sidebar">☰</button>
			<span class="topbar-title">MAP Control Room</span>
			<div class="topbar-conn">
				<span class="conn-pill" id="firebaseConnectionBadge">Disconnected</span>
				<span class="who-chip"><span class="who-avatar" aria-hidden="true">{{USER_INITIALS}}</span><span class="who-name">{{USER_NAME}}</span></span>
				<button class="btn ghost" id="mapChangePwBtn" type="button" style="min-height:36px;padding:0 14px;font-size:13px">🔑 Password</button>
				<button class="btn primary" id="mapSignOutBtn" type="button" style="min-height:36px;padding:0 16px;font-size:13px">Sign out</button>
			</div>
		</header>

		<!-- CONTENT -->
		<div class="admin-content">

			<div class="page-intro">
				<h1>Website admin</h1>
				<p>Approve and manage every MAP CRM login, and manage what appears on themaap.co.uk: advisors and the team, search links, reviews, news, announcements, the contact inbox and the newsletter. Website changes saved to Firebase go live straight away.</p>
			</div>

			<div class="crm-notice" id="crmPendingNotice" hidden>
				<span>🙋 <span id="crmPendingNoticeText">Someone is waiting for a CRM login.</span></span>
				<button class="btn primary" type="button" id="crmReviewRequestsBtn">Review requests</button>
			</div>

			<!-- STATS ROW -->
			<div class="stats-row">
				<div class="stat-card">
					<div class="stat-icon">🙋</div>
					<div class="stat-label">Login requests</div>
					<div class="stat-value" id="crmStatPending">0</div>
					<div class="stat-sub">Waiting for approval</div>
				</div>
				<div class="stat-card">
					<div class="stat-icon">🔗</div>
					<div class="stat-label">Connection</div>
					<div class="stat-value" id="summaryConnection" style="font-size:1.1rem;margin-top:.2rem;">Offline</div>
					<div class="stat-sub">Firebase</div>
				</div>
				<div class="stat-card">
					<div class="stat-icon">👨‍💼</div>
					<div class="stat-label">Advisors</div>
					<div class="stat-value" id="summaryAdvisors">0</div>
					<div class="stat-sub">Active advisors</div>
				</div>
				<div class="stat-card">
					<div class="stat-icon">⭐</div>
					<div class="stat-label">Reviews</div>
					<div class="stat-value" id="summaryReviews">0</div>
					<div class="stat-sub">Customer reviews</div>
				</div>
				<div class="stat-card">
					<div class="stat-icon">📣</div>
					<div class="stat-label">Announcements</div>
					<div class="stat-value" id="summaryAnnouncements">0</div>
					<div class="stat-sub">Scheduled campaigns</div>
				</div>
				<div class="stat-card">
					<div class="stat-icon">✉️</div>
					<div class="stat-label">Contacts</div>
					<div class="stat-value" id="summaryContacts">0</div>
					<div class="stat-sub">Inbound messages</div>
				</div>
				<div class="stat-card">
					<div class="stat-icon">📰</div>
					<div class="stat-label">News</div>
					<div class="stat-value" id="summaryNews">0</div>
					<div class="stat-sub">Published articles</div>
				</div>
			</div>

			<!-- TABS -->
			<div class="tabs-bar" id="dashboardTabs" role="tablist">
				<button class="tab-btn" type="button" data-tab="logins">CRM logins<span class="tab-count" id="crmPendingTab" hidden>0</span></button>
				<button class="tab-btn active" type="button" data-tab="content">Advisors &amp; search</button>
				<button class="tab-btn" type="button" data-tab="reviews">Reviews</button>
				<button class="tab-btn" type="button" data-tab="news">News</button>
				<button class="tab-btn" type="button" data-tab="announcements">Announcements</button>
				<button class="tab-btn" type="button" data-tab="contacts">Contacts</button>
				<button class="tab-btn" type="button" data-tab="newsletter">Newsletter</button>
				<button class="tab-btn" type="button" data-tab="connection">Connection</button>
			</div>

			<!-- ═══ CRM LOGINS (requests, logins, offices, settings, security) ═══ -->
			<section class="section-card" id="crm-requests-section" data-tab="logins">
				<div class="card-head">
					<div class="card-head-left"><div class="card-head-icon">🙋</div><div><h2>Login requests</h2><div class="card-head-sub">People who asked for a CRM login with their @themaap.co.uk email. info@themaap.co.uk gets an email for each one.</div></div></div>
					<span class="adm-count-pill" id="crmPendingCount">0 waiting</span>
				</div>
				<div class="card-body">
					<p class="muted" id="crmRequestEmpty" style="margin:0">No requests are waiting. When someone asks for a login on the sign-in page, it appears here for you to approve.</p>
					<div class="list" id="crmRequestList" style="margin-top:0"></div>
					<div class="status" id="crmRequestStatus"></div>
				</div>
			</section>

			<section class="section-card" id="crm-logins-section" data-tab="logins">
				<div class="card-head">
					<div class="card-head-left"><div class="card-head-icon">👥</div><div><h2>Logins</h2><div class="card-head-sub">The office logins and everyone with their own login. Five wrong passwords lock a login for 15 minutes.</div></div></div>
					<button class="btn primary" type="button" id="crmAddLoginBtn">＋ Add a login</button>
				</div>
				<div class="card-body">
					<div class="crm-toolbar">
						<input type="search" id="crmLoginSearch" placeholder="Search by name, username, email or office" aria-label="Search logins">
						<select id="crmLoginFilter" aria-label="Which logins to show">
							<option value="">All logins</option>
							<option value="office">Office logins</option>
							<option value="staff">Advisers &amp; staff</option>
							<option value="protection">Protection only</option>
							<option value="disabled">Switched off</option>
							<option value="locked">Locked</option>
						</select>
					</div>
					<div class="status" id="crmLoginStatus"></div>
					<div id="crmLoginGroups"></div>
				</div>
			</section>

			<section class="section-card" id="crm-offices-section" data-tab="logins">
				<div class="card-head">
					<div class="card-head-left"><div class="card-head-icon">🏢</div><div><h2>Offices &amp; settings</h2><div class="card-head-sub">Each office has its own secure area and sees only its own clients.</div></div></div>
					<button class="btn primary" type="button" id="crmAddOfficeBtn">＋ Add an office</button>
				</div>
				<div class="card-body">
					<div class="crm-office-grid" id="crmOfficeList"></div>
					<div class="status" id="crmOfficeStatus"></div>
					<div class="adm-section-divider">CRM settings</div>
					<form class="form-grid" id="crmSettingsForm" novalidate>
						<div class="field half"><label for="crmTeamThreshold">Team workload limit (points)</label><input id="crmTeamThreshold" name="team_threshold" type="number" min="5" max="200" inputmode="numeric"><div class="key-hint" style="margin-top:0">Someone is "overloaded" at this many points. Live case = 1, open task = 0.5, overdue task = 2.</div></div>
						<div class="field half"><label for="crmQuietDays">A case has "gone quiet" after (days)</label><input id="crmQuietDays" name="quiet_days" type="number" min="3" max="90" inputmode="numeric"></div>
					</form>
					<div class="actions"><button class="btn primary" type="submit" form="crmSettingsForm" id="crmSettingsSave">Save settings</button><button class="btn ghost" type="button" id="crmTestEmailBtn">✉️ Send a test email</button></div>
					<div class="status" id="crmSettingsStatus"></div>
					<div class="key-hint">"Send a test email" checks that emails about new login requests reach info@themaap.co.uk.</div>
					<div class="key-hint" id="crmServerInfo"></div>
				</div>
			</section>

			<section class="section-card" id="crm-security-section" data-tab="logins">
				<div class="card-head">
					<div class="card-head-left"><div class="card-head-icon">🛡️</div><div><h2>Security &amp; backups</h2><div class="card-head-sub">The recovery code for this admin login, and full copies of the CRM.</div></div></div>
				</div>
				<div class="card-body">
					<div class="crm-two">
						<div>
							<div class="adm-form-header">Recovery code</div>
							<p class="muted">If the admin password is ever forgotten, the recovery code resets it from the sign-in page ("Forgot password?"). Each code works once.</p>
							<button class="btn ghost" type="button" id="crmNewRecoveryBtn">🔑 Make a new recovery code</button>
							<div class="key-hint" id="crmRecoveryState"></div>
							<div class="status" id="crmSecurityStatus"></div>
						</div>
						<div>
							<div class="adm-form-header">Backups</div>
							<p class="muted">Download a copy of every office's CRM data. Backups contain client details, so keep them somewhere safe.</p>
							<div class="row-actions">
								<a class="btn ghost" href="{{CRM_BASE}}api.php?action=adminBackupAll" data-download>⬇️ Every office (JSON)</a>
								<a class="btn ghost" href="{{CRM_BASE}}api.php?action=adminDatabase" data-download>🗄️ Database file (.sqlite)</a>
							</div>
							<div class="status" id="crmBackupStatus"></div>
						</div>
					</div>
					<div class="adm-section-divider">How logins are protected</div>
					<ul class="crm-points">
						<li>Only @themaap.co.uk email addresses can ask for a login, and nobody gets in until you approve them here.</li>
						<li>Passwords are stored scrambled (bcrypt), never as plain text.</li>
						<li>Five wrong passwords lock a login for 15 minutes; repeated attempts from one place are blocked too.</li>
						<li>Resetting a password signs that person out everywhere, and they must choose a new one.</li>
						<li>Protection-only advisers never see mortgage cases, documents or figures.</li>
					</ul>
				</div>
			</section>

			<!-- ═══ ADVISORS SECTION ═══ -->
			<section class="section-card" id="advisors-section" data-tab="content">
				<div class="card-head">
					<div class="card-head-left">
						<div class="card-head-icon">👨‍💼</div>
						<div>
							<h2>Advisors &amp; Team</h2>
							<div class="card-head-sub">Expert advisors across the UK + 9 core team members</div>
						</div>
					</div>
				</div>
				<div class="card-body">
					<!-- TAB NAVIGATION -->
					<div class="tabs-bar">
						<button class="tab-btn active" type="button" onclick="switchAdvisorTab('advisors-tab')">🌐 Expert Advisors (UK)</button>
						<button class="tab-btn" type="button" onclick="switchAdvisorTab('team-tab')">👥 Our Team (9 Members)</button>
					</div>

					<!-- ADVISORS TAB -->
					<div class="advisor-tab-content active" id="advisors-tab">
						<div class="adm-grid-top">
							<span class="adm-grid-label">All Expert Advisors (27 built-in + Firebase)</span>
							<span class="adm-count-pill" id="advisorCount">0 in Firebase</span>
						</div>
						<p class="adm-hint">Click any advisor to edit their details or replace their photo. 🟢 = saved in Firebase (changes go live on the website).</p>
						<div class="adm-people-grid" id="advisorPeopleGrid"></div>
						<div class="adm-section-divider">Edit / Add Advisor</div>
						<div class="adm-form-header" id="advisorFormTitle">➕ New Advisor</div>
						<form id="advisorForm" class="form-grid" autocomplete="off">
							<input type="hidden" id="advisorDocId" />
							<div class="field half"><label for="advisorName">Full Name *</label><input id="advisorName" placeholder="e.g. John Smith" required /></div>
							<div class="field half"><label for="advisorLocation">Location *</label><input id="advisorLocation" placeholder="e.g. Newcastle (Tyne &amp; Wear)" required /></div>
							<div class="field half">
								<label for="advisorSpecialty">Specialty *</label>
								<select id="advisorSpecialty" onchange="toggleSpecialtyOther()">
									<option value="Mortgage Protection">Mortgage Protection</option>
									<option value="Protection">Protection</option>
									<option value="Mortgage">Mortgage</option>
									<option value="Other">Other (specify below)</option>
								</select>
							</div>
							<div class="field half" id="specialtyOtherField" style="display:none;">
								<label for="advisorSpecialtyOther">Specify Specialty</label>
								<input id="advisorSpecialtyOther" placeholder="Enter specialty" />
							</div>
							<div class="field half"><label for="advisorPhone">Phone (for Call Now button)</label><input id="advisorPhone" type="tel" placeholder="+44 7xxx xxxxxx" oninput="this.value=this.value.replace(/[^0-9+\s\-()]/g,'')" /></div>
							<div class="field half"><label for="advisorEmail">Email (for Message Now button)</label><input id="advisorEmail" type="email" placeholder="advisor@example.com" /></div>
							<div class="field">
								<label for="advisorImage">Profile Photo (optional)</label>
								<input id="advisorImage" type="file" accept="image/*" />
								<img id="advisorImagePreview" class="news-image-preview" alt="Preview" />
							</div>
							<div class="field">
								<label for="advisorQR">QR Code Image (optional — uses default if not uploaded)</label>
								<input id="advisorQR" type="file" accept="image/*" />
								<img id="advisorQRPreview" class="news-image-preview" alt="QR Preview" style="max-width:100px;max-height:100px;" />
							</div>
							<div class="field half">
								<label for="advisorActive">Active</label>
								<select id="advisorActive">
									<option value="true">true</option>
									<option value="false">false</option>
								</select>
							</div>
						</form>
						<div class="actions">
							<button class="btn primary" id="saveAdvisorBtn" type="button">Save</button>
							<button class="btn ghost" id="newAdvisorBtn" type="button">Clear Form</button>
							<button class="btn danger" id="deleteAdvisorBtn" type="button" style="display:none;">Delete from Firebase</button>
							<button class="btn ghost" id="restoreDefaultsBtn" type="button">🔄 Restore Defaults</button>
						</div>
						<div class="status" id="advisorStatus"></div>
						<div class="list" id="advisorList"></div>
					</div>

					<!-- OUR TEAM TAB -->
					<div class="advisor-tab-content" id="team-tab">
						<div class="adm-grid-top">
							<span class="adm-grid-label">Our Team (9 core + Firebase extras)</span>
							<span class="adm-count-pill" id="teamCount">0 in Firebase</span>
						</div>
						<p class="adm-hint">Click any member to edit their photo or details. 🟢 = saved in Firebase. Core 9 always appear on the website; extras load from Firebase.</p>
						<div class="adm-people-grid" id="teamPeopleGrid"></div>
						<div class="adm-section-divider">Edit / Add Team Member</div>
						<div class="adm-form-header" id="teamFormTitle">➕ New Team Member</div>
						<form id="teamForm" class="form-grid" autocomplete="off">
							<input type="hidden" id="teamDocId" />
							<div class="field half"><label for="teamName">Full Name *</label><input id="teamName" placeholder="e.g. JOHN SMITH" required /></div>
							<div class="field half">
								<label for="teamRole">Role Badge *</label>
								<select id="teamRole" onchange="toggleTeamRoleOther()">
									<option value="Director">Director</option>
									<option value="Paraplanner">Paraplanner</option>
									<option value="Assistant">Assistant</option>
									<option value="Manager">Manager</option>
									<option value="IT">IT</option>
									<option value="Other">Other (specify below)</option>
								</select>
							</div>
							<div class="field half" id="teamRoleOtherField" style="display:none;">
								<label for="teamRoleOther">Specify Role</label>
								<input id="teamRoleOther" placeholder="Enter role badge" />
							</div>
							<div class="field half"><label for="teamTitle">Job Title *</label><input id="teamTitle" placeholder="e.g. Mortgage Paraplanner" required /></div>
							<div class="field half"><label for="teamDepartment">Department</label><input id="teamDepartment" placeholder="e.g. Mortgage Processing &amp; Documentation" /></div>
							<div class="field">
								<label for="teamImage">Profile Photo</label>
								<input id="teamImage" type="file" accept="image/*" />
								<img id="teamImagePreview" class="news-image-preview" alt="Preview" />
							</div>
							<div class="field half">
								<label for="teamActive">Active</label>
								<select id="teamActive">
									<option value="true">true</option>
									<option value="false">false</option>
								</select>
							</div>
						</form>
						<div class="actions">
							<button class="btn primary" id="saveTeamBtn" type="button">Save</button>
							<button class="btn ghost" id="newTeamBtn" type="button">Clear Form</button>
							<button class="btn danger" id="deleteTeamBtn" type="button" style="display:none;">Delete from Firebase</button>
						</div>
						<div class="status" id="teamStatus"></div>
						<div class="list" id="teamList"></div>
					</div>
				</div>
			</section>

			<!-- ─── SEARCH LINKS ─── -->
			<section class="section-card" id="search-section" data-tab="content">
				<div class="card-head">
					<div class="card-head-left">
						<div class="card-head-icon">🔎</div>
						<div>
							<h2>Search Links</h2>
							<div class="card-head-sub" id="searchCount">0 items</div>
						</div>
					</div>
				</div>
				<div class="card-body">
					<form id="searchForm" class="form-grid" autocomplete="off">
						<input type="hidden" id="searchDocId" />
						<div class="field half"><label for="searchTitle">Title</label><input id="searchTitle" required /></div>
						<div class="field half"><label for="searchLink">Link (relative URL)</label><input id="searchLink" placeholder="service/mortgage/mortgage.html" required /></div>
						<div class="field third">
							<label for="searchCat">Category</label>
							<select id="searchCat" required>
								<option value="mortgage">mortgage</option>
								<option value="insurance">insurance</option>
								<option value="calculator">calculator</option>
								<option value="shared">shared</option>
								<option value="resources">resources</option>
								<option value="team">team</option>
							</select>
						</div>
						<div class="field third"><label for="searchIcon">Icon (emoji)</label><input id="searchIcon" value="🔎" required /></div>
						<div class="field third"><label for="searchKeywords">Keywords</label><input id="searchKeywords" placeholder="mortgage,buyer,help" /></div>
					</form>
					<div class="actions">
						<button class="btn primary" id="saveSearchBtn" type="button">Save Item</button>
						<button class="btn ghost" id="newSearchBtn" type="button">New Item</button>
					</div>
					<div class="status" id="searchStatus"></div>
					<div class="list" id="searchList"></div>
				</div>
			</section>

			<!-- ═══ REVIEWS SECTION ═══ -->
			<section class="section-card" id="review-section" data-tab="reviews">
				<div class="card-head">
					<div class="card-head-left">
						<div class="card-head-icon">⭐</div>
						<div>
							<h2>Reviews</h2>
							<div class="card-head-sub" id="reviewCount">0 items</div>
						</div>
					</div>
				</div>
				<div class="card-body">
					<form id="reviewForm" class="form-grid" autocomplete="off">
						<input type="hidden" id="reviewDocId" />
						<div class="field half"><label for="reviewName">Customer Name</label><input id="reviewName" required /></div>
						<div class="field half"><label for="reviewSource">Source</label><input id="reviewSource" placeholder="Trustpilot" /></div>
						<div class="field"><label for="reviewLink">Google Review Link (optional)</label><input id="reviewLink" type="url" placeholder="https://g.co/kgs/…" /></div>
						<div class="field third"><label for="reviewRating">Rating (1–5)</label><input id="reviewRating" type="number" min="1" max="5" value="5" required /></div>
						<div class="field third"><label for="reviewTag">Tag</label><input id="reviewTag" placeholder="First-time buyer" /></div>
						<div class="field third">
							<label for="reviewApproved">Approved</label>
							<select id="reviewApproved">
								<option value="true">true</option>
								<option value="false">false</option>
							</select>
						</div>
						<div class="field half"><label for="reviewDate">Review Date <span style="font-weight:400;color:var(--text3)">(leave blank = today)</span></label><input id="reviewDate" type="date" /></div>
						<div class="field"><label for="reviewText">Review Text</label><textarea id="reviewText" required></textarea></div>
					</form>
					<div class="preview-card" id="reviewPreview">
						<div class="stars">★★★★★</div>
						<div class="title">Google Reviews</div>
						<div>Review preview will appear here as you type.</div>
						<div class="meta">Google Reviewer</div>
					</div>
					<div class="key-hint">Tip: Press Ctrl+Enter in review text to save quickly.</div>
					<div class="actions">
						<button class="btn primary" id="saveReviewBtn" type="button">Save Review</button>
						<button class="btn ghost" id="newReviewBtn" type="button">New Review</button>
					</div>
					<div class="status" id="reviewStatus"></div>
					<div class="list" id="reviewList"></div>
				</div>
			</section>

			<!-- ─── NEWS ─── -->
			<section class="section-card" id="news-section" data-tab="news">
				<div class="card-head">
					<div class="card-head-left">
						<div class="card-head-icon">📰</div>
						<div>
							<h2>News Articles</h2>
							<div class="card-head-sub" id="newsCount">0 items</div>
						</div>
					</div>
				</div>
				<div class="card-body">
					<p class="muted">Add news articles with a title, description, and image. Published articles appear on the public News page and homepage carousel.</p>
					<form id="newsForm" class="form-grid" autocomplete="off">
						<input type="hidden" id="newsDocId" />
						<div class="field half"><label for="newsTitle">Title</label><input id="newsTitle" placeholder="Article title" required /></div>
						<div class="field half">
							<label for="newsPublished">Published</label>
							<select id="newsPublished">
								<option value="true">true</option>
								<option value="false">false</option>
							</select>
						</div>
						<div class="field half"><label for="newsDate">Article Date <span style="font-weight:400;color:var(--text3)">(leave blank = today)</span></label><input id="newsDate" type="date" /></div>
						<div class="field"><label for="newsDescription">Description</label><textarea id="newsDescription" placeholder="Article body or summary…" style="min-height:120px;"></textarea></div>
						<div class="field">
							<label for="newsImageFile">Image (upload)</label>
							<input id="newsImageFile" type="file" accept="image/*" />
							<img id="newsImagePreview" class="news-image-preview" alt="Preview" />
						</div>
					</form>
					<div class="actions">
						<button class="btn primary" id="saveNewsBtn" type="button">Save Article</button>
						<button class="btn ghost" id="newNewsBtn" type="button">New Article</button>
					</div>
					<div class="status" id="newsStatus"></div>
					<div class="list" id="newsList"></div>
				</div>
			</section>

			<!-- ─── ANNOUNCEMENTS ─── -->
			<section class="section-card" id="announcement-section" data-tab="announcements">
				<div class="card-head">
					<div class="card-head-left">
						<div class="card-head-icon">📣</div>
						<div>
							<h2>Scheduled Announcements</h2>
							<div class="card-head-sub" id="announcementCount">0 items</div>
						</div>
					</div>
				</div>
				<div class="card-body">
					<p class="muted">Create announcements with optional start and end times. If no dates are set, the announcement stays available until you disable or delete it.</p>
					<form id="announcementForm" class="form-grid" autocomplete="off">
						<input type="hidden" id="announcementDocId" />
						<div class="field half"><label for="announcementText">Banner Text</label><input id="announcementText" placeholder="Example: New fixed-rate products available this week." /></div>
						<div class="field third">
							<label for="announcementType">Type</label>
							<select id="announcementType">
								<option value="info">info</option>
								<option value="success">success</option>
								<option value="warning">warning</option>
							</select>
						</div>
						<div class="field third">
							<label for="announcementEnabled">Enabled</label>
							<select id="announcementEnabled">
								<option value="true">true</option>
								<option value="false">false</option>
							</select>
						</div>
						<div class="field half"><label for="announcementStartAt">Start Time (optional)</label><input id="announcementStartAt" type="datetime-local" /></div>
						<div class="field half"><label for="announcementEndAt">End Time (optional)</label><input id="announcementEndAt" type="datetime-local" /></div>
					</form>
					<div class="key-hint">If end time passes, the announcement is automatically hidden for everyone who visits the site.</div>
					<div class="actions">
						<button class="btn primary" id="saveAnnouncementBtn" type="button">Save Announcement</button>
						<button class="btn ghost" id="newAnnouncementBtn" type="button">New Announcement</button>
						<button class="btn warn" id="clearAnnouncementBtn" type="button">Disable Current</button>
					</div>
					<div class="status" id="announcementStatus"></div>
					<div class="list" id="announcementList"></div>
				</div>
			</section>

			<!-- ─── CONTACT INBOX ─── -->
			<section class="section-card" id="contact-section" data-tab="contacts">
				<div class="card-head">
					<div class="card-head-left">
						<div class="card-head-icon">✉️</div>
						<div>
							<h2>Contact Inbox</h2>
							<div class="card-head-sub" id="contactCount">0 messages</div>
						</div>
					</div>
				</div>
				<div class="card-body">
					<p class="muted">Messages submitted through the Contact Us page appear here and are also emailed to the site administrator.</p>
					<div class="status" id="contactStatus"></div>
					<div class="list" id="contactList"></div>
				</div>
			</section>

			<!-- ─── NEWSLETTER SECTION ─── -->
			<section class="section-card" id="newsletter-section" data-tab="newsletter">
				<div class="card-head">
					<div class="card-head-left">
						<div class="card-head-icon">📧</div>
						<div>
							<h2>Newsletter</h2>
							<div class="card-head-sub" id="newsletterCount">0 subscribers</div>
						</div>
					</div>
					<div class="card-tools">
						<button class="btn ghost" id="exportSubscribersBtn" type="button">⬇️ Export CSV</button>
					</div>
				</div>
				<div class="card-body">

					<!-- Subscribers list -->
					<div style="margin-bottom:2rem;">
						<h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem;color:var(--text);">Subscribers</h3>
						<p class="muted" style="margin-bottom:1rem;">Email addresses collected from the newsletter signup form on the website.</p>
						<div class="status" id="newsletterLoadStatus"></div>
						<div class="list" id="newsletterList"></div>
					</div>

					<div style="border-top:1px solid var(--border);margin:1.5rem 0;"></div>

					<!-- EmailJS Config -->
					<h3 style="font-size:1rem;font-weight:700;margin-bottom:.75rem;color:var(--text);">EmailJS Configuration</h3>
					<p class="muted" style="margin-bottom:1.25rem;">
						EmailJS sends emails directly from the browser — no server or paid plan required.
						<a href="https://www.emailjs.com/" target="_blank" rel="noopener">Create a free account</a>,
						add an Email Service (Gmail/Outlook), create a Template using variables
						<code style="background:var(--surface3);padding:1px 6px;border-radius:5px;">{{subject}}</code>
						<code style="background:var(--surface3);padding:1px 6px;border-radius:5px;">{{message}}</code>
						<code style="background:var(--surface3);padding:1px 6px;border-radius:5px;">{{to_email}}</code>,
						then paste your credentials below.
					</p>
					<form id="emailjsConfigForm" class="form-grid" autocomplete="off">
						<div class="field half">
							<label for="emailjsServiceId">Service ID</label>
							<input id="emailjsServiceId" placeholder="e.g. service_abc123" />
						</div>
						<div class="field half">
							<label for="emailjsTemplateId">Template ID</label>
							<input id="emailjsTemplateId" placeholder="e.g. template_xyz789" />
						</div>
						<div class="field half">
							<label for="emailjsPublicKey">Public Key</label>
							<input id="emailjsPublicKey" placeholder="Your EmailJS public key" />
						</div>
					</form>
					<div class="actions" style="margin-top:.75rem;margin-bottom:.5rem;">
						<button class="btn ghost" id="saveEmailjsConfigBtn" type="button">💾 Save EmailJS Config</button>
					</div>
					<div class="status" id="emailjsConfigStatus"></div>

					<div style="border-top:1px solid var(--border);margin:1.5rem 0;"></div>

					<!-- Compose & Send -->
					<h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem;color:var(--text);">Compose &amp; Send</h3>
					<p class="muted" style="margin-bottom:1.5rem;">Write a newsletter below. Click <strong>Preview</strong> to see how it will look in an email client, then <strong>Send to All</strong> to deliver it to every subscriber via EmailJS.</p>

					<form id="newsletterComposeForm" class="form-grid" autocomplete="off">
						<div class="field">
							<label for="newsletterSubject">Subject Line</label>
							<input id="newsletterSubject" placeholder="e.g. Latest mortgage rate updates — May 2026" required />
						</div>
						<div class="field">
							<label for="newsletterBodyText">Email Body</label>
							<textarea id="newsletterBodyText" placeholder="Write your newsletter content here. Plain text or simple HTML is supported." style="min-height:200px;" required></textarea>
						</div>
					</form>

					<!-- Preview panel -->
					<div id="newsletterPreviewPanel" style="display:none;margin-top:1.5rem;">
						<h4 style="font-size:0.9rem;font-weight:600;color:var(--text2);margin-bottom:0.75rem;text-transform:uppercase;letter-spacing:.05em;">Email Preview</h4>
						<div id="newsletterPreviewFrame" style="background:#ffffff;border:2px solid #a308a3;border-radius:16px;padding:2rem;color:#1a1a2e;font-family:Arial,sans-serif;max-width:600px;line-height:1.6;box-shadow:0 10px 30px rgba(124,58,237,.15);">
							<div style="border-bottom:3px solid #a308a3;padding-bottom:1rem;margin-bottom:1.5rem;">
								<div style="font-size:1.4rem;font-weight:800;color:#a308a3;">MAP — Mortgage Advice &amp; Protection</div>
								<div id="previewSubjectLine" style="font-size:1rem;color:#555;margin-top:0.4rem;"></div>
							</div>
							<div id="previewBodyContent" style="font-size:0.95rem;white-space:pre-wrap;"></div>
							<div style="border-top:1px solid #eee;margin-top:2rem;padding-top:1rem;font-size:0.75rem;color:#999;text-align:center;">
								You're receiving this because you subscribed to the MAP newsletter.<br>
								© 2026 Mortgage Advice &amp; Protection. All rights reserved.
							</div>
						</div>
					</div>

					<div class="actions" style="margin-top:1.5rem;">
						<button class="btn ghost" id="previewNewsletterBtn" type="button">👁 Preview</button>
						<button class="btn primary" id="sendNewsletterBtn" type="button">📤 Send to All Subscribers</button>
						<button class="btn ghost" id="clearComposeBtn" type="button">Clear</button>
					</div>
					<div class="status" id="newsletterSendStatus"></div>
				</div>
			</section>

			<!-- ─── FIREBASE SECTION ─── -->
			<section class="section-card" id="firebase-section" data-tab="connection">
				<div class="card-head">
					<div class="card-head-left">
						<div class="card-head-icon">🔗</div>
						<div>
							<h2>Firebase Connection</h2>
							<div class="card-head-sub">Paste your Firebase web app config below</div>
						</div>
					</div>
					<div class="card-tools">
						<button class="btn ghost" id="copyFirebaseConfigBtn" type="button">📋 Copy JSON</button>
						<button class="btn ghost" id="saveFirebaseConfigBtn" type="button">💾 Save Config</button>
					</div>
				</div>
				<div class="card-body">
					<form id="firebaseConfigForm" class="form-grid" autocomplete="off">
						<div class="field half"><label for="apiKey">apiKey</label><input id="apiKey" name="apiKey" placeholder="AIzaSy…" /></div>
						<div class="field half"><label for="authDomain">authDomain</label><input id="authDomain" name="authDomain" placeholder="project.firebaseapp.com" /></div>
						<div class="field half"><label for="projectId">projectId</label><input id="projectId" name="projectId" placeholder="your-project-id" /></div>
						<div class="field half"><label for="storageBucket">storageBucket</label><input id="storageBucket" name="storageBucket" /></div>
						<div class="field half"><label for="messagingSenderId">messagingSenderId</label><input id="messagingSenderId" name="messagingSenderId" /></div>
						<div class="field half"><label for="appId">appId</label><input id="appId" name="appId" /></div>
						<div class="field half"><label for="measurementId">measurementId <span style="font-weight:400;opacity:.6">(optional)</span></label><input id="measurementId" name="measurementId" /></div>
					</form>
					<div class="actions">
						<button class="btn primary" id="connectFirebaseBtn" type="button">⚡ Connect Firebase</button>
						<button class="btn danger" id="clearFirebaseConfigBtn" type="button">🗑 Clear Config</button>
					</div>
					<div class="status" id="firebaseStatus"></div>
				</div>
			</section>

			<!-- FOOTER TIP -->
			<div class="footer-tip section-card" data-tab="connection">
				Collections: <strong>searchItems</strong>, <strong>advisors</strong>, <strong>reviews</strong>, <strong>announcements</strong>, <strong>contactMessages</strong>, <strong>newsItems</strong>, <strong>newsletterSubscribers</strong>, <strong>newsletterSends</strong>. Deployment tip: deploy the <strong>sendNewsletter</strong> Cloud Function and set the <strong>RESEND_API_KEY</strong> and <strong>RESEND_FROM_EMAIL</strong> secrets before using the newsletter sender.
			</div>

		</div><!-- /.admin-content -->
	</div><!-- /.admin-main -->

</div><!-- /.admin-wrap -->

<!-- Change password (MAP sign-in) -->
<div class="pw-layer" id="mapPwLayer" role="dialog" aria-modal="true" aria-labelledby="mapPwTitle">
	<form class="pw-box" id="mapPwForm" autocomplete="off">
		<h2 id="mapPwTitle">Change your password</h2>
		<div class="field"><label for="mapPwCur">Current password</label><input id="mapPwCur" type="password" autocomplete="current-password" required></div>
		<div class="field"><label for="mapPwNew">New password</label><input id="mapPwNew" type="password" autocomplete="new-password" required></div>
		<div class="field"><label for="mapPwNew2">Confirm new password</label><input id="mapPwNew2" type="password" autocomplete="new-password" required></div>
		<div class="key-hint" style="margin-top:0">At least 8 characters, with upper and lower case letters and a number.</div>
		<div class="status" id="mapPwStatus"></div>
		<div class="actions" style="margin-top:4px"><button class="btn primary" type="submit">Save password</button><button class="btn ghost" type="button" id="mapPwCancel">Cancel</button></div>
	</form>
</div>

<!-- CRM logins dialog -->
<div class="pw-layer" id="crmDialog" role="dialog" aria-modal="true" aria-labelledby="crmDialogTitle">
	<div class="pw-box wide"><h2 id="crmDialogTitle"></h2><div id="crmDialogBody" style="display:grid;gap:12px"></div></div>
</div>

<script>
	// Mobile sidebar toggle
	const menuToggle = document.getElementById('menuToggle');
	const adminSidebar = document.getElementById('adminSidebar');
	const sidebarOverlay = document.getElementById('sidebarOverlay');
	if (menuToggle) {
		menuToggle.addEventListener('click', () => {
			adminSidebar.classList.toggle('open');
			sidebarOverlay.classList.toggle('show');
		});
	}
	if (sidebarOverlay) {
		sidebarOverlay.addEventListener('click', () => {
			adminSidebar.classList.remove('open');
			sidebarOverlay.classList.remove('show');
		});
	}
</script>

	<script type="module">
		import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
		import {
			getFirestore,
			collection,
			addDoc,
			getDocs,
			updateDoc,
			deleteDoc,
			doc,
			setDoc,
			getDoc,
			serverTimestamp,
			Timestamp,
			query,
			orderBy
		} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

		const STORAGE_KEY = 'map_firebase_config';
		const EMAILJS_STORAGE_KEY = 'map_emailjs_config';
		const THEME_STORAGE_KEY = 'map_admin_theme';
		const TAB_STORAGE_KEY = 'map_admin_tab';
		const FUNCTION_REGION = 'us-central1';
		const NEWSLETTER_FUNCTION_NAME = 'sendNewsletter';
		const DEFAULT_FIREBASE_CONFIG = {
			apiKey: 'AIzaSyDV3_itCaUGU-gfRO8pRx_bObk9d5TE1QM',
			authDomain: 'educat-b39dd.firebaseapp.com',
			projectId: 'educat-b39dd',
			storageBucket: 'educat-b39dd.firebasestorage.app',
			messagingSenderId: '39885366718',
			appId: '1:39885366718:web:c044c6a9a54d75e1d305ef',
			measurementId: 'G-VH5ZWNWXJ5'
		};

		const refs = {
			firebaseConfigForm: document.getElementById('firebaseConfigForm'),
			saveFirebaseConfigBtn: document.getElementById('saveFirebaseConfigBtn'),
			copyFirebaseConfigBtn: document.getElementById('copyFirebaseConfigBtn'),
			connectFirebaseBtn: document.getElementById('connectFirebaseBtn'),
			clearFirebaseConfigBtn: document.getElementById('clearFirebaseConfigBtn'),
			firebaseConnectionBadge: document.getElementById('firebaseConnectionBadge'),
			firebaseStatus: document.getElementById('firebaseStatus'),
			themeToggle: document.getElementById('themeToggle'),
			tabButtons: [...document.querySelectorAll('[data-tab]')].filter((element) => element.classList.contains('tab-btn')),
			sectionCards: [...document.querySelectorAll('.section-card[data-tab]')],
			sidebarLinks: [...document.querySelectorAll('.sidebar-link[data-target]')],
			summaryConnection: document.getElementById('summaryConnection'),
			summaryReviews: document.getElementById('summaryReviews'),
			summaryAnnouncements: document.getElementById('summaryAnnouncements'),
			summaryContacts: document.getElementById('summaryContacts'),

			searchForm: document.getElementById('searchForm'),
			searchDocId: document.getElementById('searchDocId'),
			searchTitle: document.getElementById('searchTitle'),
			searchLink: document.getElementById('searchLink'),
			searchCat: document.getElementById('searchCat'),
			searchIcon: document.getElementById('searchIcon'),
			searchKeywords: document.getElementById('searchKeywords'),
			saveSearchBtn: document.getElementById('saveSearchBtn'),
			newSearchBtn: document.getElementById('newSearchBtn'),
			searchStatus: document.getElementById('searchStatus'),
			searchList: document.getElementById('searchList'),
			searchCount: document.getElementById('searchCount'),

			advisorForm: document.getElementById('advisorForm'),
			advisorDocId: document.getElementById('advisorDocId'),
			advisorName: document.getElementById('advisorName'),
			advisorLocation: document.getElementById('advisorLocation'),
			advisorSpecialty: document.getElementById('advisorSpecialty'),
			advisorSpecialtyOther: document.getElementById('advisorSpecialtyOther'),
			advisorEmail: document.getElementById('advisorEmail'),
			advisorPhone: document.getElementById('advisorPhone'),
			advisorImage: document.getElementById('advisorImage'),
			advisorImagePreview: document.getElementById('advisorImagePreview'),
			advisorQR: document.getElementById('advisorQR'),
			advisorQRPreview: document.getElementById('advisorQRPreview'),
			advisorActive: document.getElementById('advisorActive'),
			saveAdvisorBtn: document.getElementById('saveAdvisorBtn'),
			newAdvisorBtn: document.getElementById('newAdvisorBtn'),
			restoreDefaultsBtn: document.getElementById('restoreDefaultsBtn'),
			advisorStatus: document.getElementById('advisorStatus'),
			advisorList: document.getElementById('advisorList'),
			advisorCount: document.getElementById('advisorCount'),
			summaryAdvisors: document.getElementById('summaryAdvisors'),
			deleteAdvisorBtn: document.getElementById('deleteAdvisorBtn'),

			teamForm: document.getElementById('teamForm'),
			teamDocId: document.getElementById('teamDocId'),
			teamName: document.getElementById('teamName'),
			teamRole: document.getElementById('teamRole'),
			teamRoleOther: document.getElementById('teamRoleOther'),
			teamTitle: document.getElementById('teamTitle'),
			teamDepartment: document.getElementById('teamDepartment'),
			teamImage: document.getElementById('teamImage'),
			teamImagePreview: document.getElementById('teamImagePreview'),
			teamActive: document.getElementById('teamActive'),
			saveTeamBtn: document.getElementById('saveTeamBtn'),
			newTeamBtn: document.getElementById('newTeamBtn'),
			teamStatus: document.getElementById('teamStatus'),
			teamList: document.getElementById('teamList'),
			teamCount: document.getElementById('teamCount'),
			deleteTeamBtn: document.getElementById('deleteTeamBtn'),

			reviewForm: document.getElementById('reviewForm'),
			reviewDocId: document.getElementById('reviewDocId'),
			reviewName: document.getElementById('reviewName'),
			reviewSource: document.getElementById('reviewSource'),
			reviewLink: document.getElementById('reviewLink'),
			reviewRating: document.getElementById('reviewRating'),
			reviewTag: document.getElementById('reviewTag'),
			reviewApproved: document.getElementById('reviewApproved'),
			reviewDate: document.getElementById('reviewDate'),
			reviewText: document.getElementById('reviewText'),
			saveReviewBtn: document.getElementById('saveReviewBtn'),
			newReviewBtn: document.getElementById('newReviewBtn'),
			reviewStatus: document.getElementById('reviewStatus'),
			reviewList: document.getElementById('reviewList'),
			reviewCount: document.getElementById('reviewCount'),
			reviewPreview: document.getElementById('reviewPreview'),

			announcementForm: document.getElementById('announcementForm'),
			announcementDocId: document.getElementById('announcementDocId'),
			announcementText: document.getElementById('announcementText'),
			announcementType: document.getElementById('announcementType'),
			announcementEnabled: document.getElementById('announcementEnabled'),
			announcementStartAt: document.getElementById('announcementStartAt'),
			announcementEndAt: document.getElementById('announcementEndAt'),
			saveAnnouncementBtn: document.getElementById('saveAnnouncementBtn'),
			newAnnouncementBtn: document.getElementById('newAnnouncementBtn'),
			clearAnnouncementBtn: document.getElementById('clearAnnouncementBtn'),
			announcementStatus: document.getElementById('announcementStatus'),
			announcementList: document.getElementById('announcementList'),
			announcementCount: document.getElementById('announcementCount'),

			contactStatus: document.getElementById('contactStatus'),
			contactList: document.getElementById('contactList'),
			contactCount: document.getElementById('contactCount'),

			newsForm: document.getElementById('newsForm'),
			newsDocId: document.getElementById('newsDocId'),
			newsTitle: document.getElementById('newsTitle'),
			newsDescription: document.getElementById('newsDescription'),
			newsPublished: document.getElementById('newsPublished'),
			newsDate: document.getElementById('newsDate'),
			newsImageFile: document.getElementById('newsImageFile'),
			newsImagePreview: document.getElementById('newsImagePreview'),
			saveNewsBtn: document.getElementById('saveNewsBtn'),
			newNewsBtn: document.getElementById('newNewsBtn'),
			newsStatus: document.getElementById('newsStatus'),
			newsList: document.getElementById('newsList'),
			newsCount: document.getElementById('newsCount'),
			summaryNews: document.getElementById('summaryNews'),

			newsletterList: document.getElementById('newsletterList'),
			newsletterCount: document.getElementById('newsletterCount'),
			newsletterBadge: document.getElementById('newsletterBadge'),
			newsletterLoadStatus: document.getElementById('newsletterLoadStatus'),
			newsletterComposeForm: document.getElementById('newsletterComposeForm'),
			newsletterSubject: document.getElementById('newsletterSubject'),
			newsletterBodyText: document.getElementById('newsletterBodyText'),
			newsletterPreviewPanel: document.getElementById('newsletterPreviewPanel'),
			newsletterPreviewFrame: document.getElementById('newsletterPreviewFrame'),
			previewSubjectLine: document.getElementById('previewSubjectLine'),
			previewBodyContent: document.getElementById('previewBodyContent'),
			previewNewsletterBtn: document.getElementById('previewNewsletterBtn'),
			sendNewsletterBtn: document.getElementById('sendNewsletterBtn'),
			clearComposeBtn: document.getElementById('clearComposeBtn'),
			exportSubscribersBtn: document.getElementById('exportSubscribersBtn'),
			newsletterSendStatus: document.getElementById('newsletterSendStatus'),
			emailjsServiceId: document.getElementById('emailjsServiceId'),
			emailjsTemplateId: document.getElementById('emailjsTemplateId'),
			emailjsPublicKey: document.getElementById('emailjsPublicKey'),
			saveEmailjsConfigBtn: document.getElementById('saveEmailjsConfigBtn'),
			emailjsConfigStatus: document.getElementById('emailjsConfigStatus')
		};

		let app = null;
		let db = null;

		// Compress an image File to base64. PNG files keep PNG format (preserves transparency). Others use JPEG.
		function compressImageToBase64(file, maxWidth = 800, quality = 0.75) {
			return new Promise((resolve, reject) => {
				const isPNG = file.type === 'image/png';
				const reader = new FileReader();
				reader.onerror = reject;
				reader.onload = e => {
					const img = new Image();
					img.onerror = reject;
					img.onload = () => {
						const scale = img.width > maxWidth ? maxWidth / img.width : 1;
						const canvas = document.createElement('canvas');
						canvas.width = Math.round(img.width * scale);
						canvas.height = Math.round(img.height * scale);
						const ctx = canvas.getContext('2d');
						ctx.clearRect(0, 0, canvas.width, canvas.height);
						ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
						resolve(isPNG
							? canvas.toDataURL('image/png')
							: canvas.toDataURL('image/jpeg', quality));
					};
					img.src = e.target.result;
				};
				reader.readAsDataURL(file);
			});
		}

		function showStatus(el, message, type = 'info') {
			el.className = `status show ${type}`;
			el.textContent = message;
		}

		function clearStatus(el) {
			el.className = 'status';
			el.textContent = '';
		}

		function setConnectionState(connected, label) {
			if (!refs.firebaseConnectionBadge) return;
			refs.firebaseConnectionBadge.textContent = label || (connected ? 'Connected' : 'Disconnected');
			refs.firebaseConnectionBadge.className = `conn-pill ${connected ? 'ok' : 'error'}`;
			if (refs.summaryConnection) {
				refs.summaryConnection.textContent = connected ? 'Online' : 'Offline';
			}
		}

		function setSummaryValue(refName, value) {
			if (!refs[refName]) return;
			refs[refName].textContent = String(value);
		}

		function applyTheme(theme) {
			const isDark = theme === 'dark';
			document.body.classList.toggle('dark-mode', isDark);
			if (refs.themeToggle) {
				refs.themeToggle.innerHTML = isDark ? '☀️ Enable Light Mode' : '🌙 Enable Dark Mode';
			}
			localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
		}

		function setActiveSidebarLink(targetId) {
			refs.sidebarLinks.forEach((link) => {
				link.classList.toggle('active', link.dataset.target === targetId);
			});
		}

		function setActiveTab(tabName) {
			const activeTab = tabName || 'content';
			refs.tabButtons.forEach((button) => {
				button.classList.toggle('active', button.dataset.tab === activeTab);
			});

			refs.sectionCards.forEach((section) => {
				const shouldShow = section.dataset.tab === activeTab || (activeTab === 'content' && section.dataset.tab === 'content');
				section.classList.toggle('is-hidden', !shouldShow);
			});

			localStorage.setItem(TAB_STORAGE_KEY, activeTab);
		}

		function setButtonBusy(button, isBusy, busyText = 'Working...') {
			if (!button) return;
			if (!button.dataset.defaultText) {
				button.dataset.defaultText = button.textContent;
			}
			button.disabled = isBusy;
			button.textContent = isBusy ? busyText : button.dataset.defaultText;
		}

		function getConfigFromForm() {
			const formData = new FormData(refs.firebaseConfigForm);
			const cfg = Object.fromEntries(formData.entries());
			return cfg;
		}

		function setConfigToForm(cfg) {
			const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
			keys.forEach((key) => {
				const input = document.getElementById(key);
				if (input) {
					input.value = cfg?.[key] || '';
				}
			});
		}

		function isConfigValid(cfg) {
			return cfg && cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId;
		}

		function withDefaultConfig(rawCfg = {}) {
			const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
			const cfg = { ...DEFAULT_FIREBASE_CONFIG };
			keys.forEach((key) => {
				const value = typeof rawCfg[key] === 'string' ? rawCfg[key].trim() : rawCfg[key];
				if (value) {
					cfg[key] = value;
				}
			});
			return cfg;
		}

		function getNewsletterFunctionUrl() {
			const cfg = withDefaultConfig(getConfigFromForm());
			if (!cfg?.projectId) return '';
			return `https://${FUNCTION_REGION}-${cfg.projectId}.cloudfunctions.net/${NEWSLETTER_FUNCTION_NAME}`;
		}

		function loadEmailjsConfig() {
			try { return JSON.parse(localStorage.getItem(EMAILJS_STORAGE_KEY) || '{}'); } catch { return {}; }
		}

		function populateEmailjsConfigForm() {
			const cfg = loadEmailjsConfig();
			if (refs.emailjsServiceId) refs.emailjsServiceId.value = cfg.serviceId || '';
			if (refs.emailjsTemplateId) refs.emailjsTemplateId.value = cfg.templateId || '';
			if (refs.emailjsPublicKey) refs.emailjsPublicKey.value = cfg.publicKey || '';
		}

		function saveEmailjsConfigToStorage() {
			const cfg = {
				serviceId: refs.emailjsServiceId.value.trim(),
				templateId: refs.emailjsTemplateId.value.trim(),
				publicKey: refs.emailjsPublicKey.value.trim()
			};
			if (!cfg.serviceId || !cfg.templateId || !cfg.publicKey) {
				showStatus(refs.emailjsConfigStatus, 'All three fields are required.', 'error');
				return;
			}
			localStorage.setItem(EMAILJS_STORAGE_KEY, JSON.stringify(cfg));
			showStatus(refs.emailjsConfigStatus, 'EmailJS config saved.', 'ok');
		}

		function updateReviewPreview() {
			if (!refs.reviewPreview) return;
			const stars = '★'.repeat(Math.max(1, Math.min(5, Number(refs.reviewRating.value) || 5)));
			const title = refs.reviewTag.value.trim() || `${refs.reviewSource.value.trim() || 'Google Reviews'} Review`;
			const text = refs.reviewText.value.trim() || (refs.reviewLink.value.trim() ? 'Read this review on Google Reviews.' : 'Review preview will appear here as you type.');
			const author = refs.reviewName.value.trim() || 'Google Reviewer';

			refs.reviewPreview.innerHTML = `
				<div class="stars">${stars}</div>
				<div class="title">${title}</div>
				<div>${text}</div>
				<div class="meta">${author}</div>
			`;
		}

		function parseDateTimeLocal(value) {
			if (!value) return null;
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return null;
			return date;
		}

		function toDateTimeLocalValue(value) {
			if (!value) return '';
			const date = value?.toDate?.() || (value instanceof Date ? value : null);
			if (!date || Number.isNaN(date.getTime())) return '';
			const pad = (num) => String(num).padStart(2, '0');
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
		}

		function formatSchedule(value) {
			if (!value) return 'No limit';
			const date = value?.toDate?.() || (value instanceof Date ? value : null);
			return date ? date.toLocaleString() : 'No limit';
		}

		function formatContactMethods(methods) {
			if (!Array.isArray(methods) || methods.length === 0) return 'Not specified';
			return mapEscape(methods.join(', '));
		}

		// MAP security fix: text typed by website visitors (contact form, newsletter sign-up) is shown as text, never run as HTML.
		function mapEscape(value) {
			return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
		}

		function getAnnouncementState(item) {
			const now = Date.now();
			const startMs = item.startAt?.toMillis?.() || 0;
			const endMs = item.endAt?.toMillis?.() || Number.POSITIVE_INFINITY;
			if (!item.enabled) return 'disabled';
			if (startMs > now) return 'scheduled';
			if (endMs < now) return 'expired';
			return 'live';
		}

		function resetAnnouncementForm() {
			refs.announcementForm.reset();
			refs.announcementDocId.value = '';
			refs.announcementType.value = 'info';
			refs.announcementEnabled.value = 'true';
			refs.announcementStartAt.value = '';
			refs.announcementEndAt.value = '';
		}

		async function connectFirebase() {
			try {
				setButtonBusy(refs.connectFirebaseBtn, true, 'Connecting...');
				setConnectionState(false, 'Connecting...');
				clearStatus(refs.firebaseStatus);
				const cfg = withDefaultConfig(getConfigFromForm());
				setConfigToForm(cfg);
				if (!isConfigValid(cfg)) {
					showStatus(refs.firebaseStatus, 'Please fill apiKey, authDomain, projectId, and appId.', 'error');
					return;
				}

				app = initializeApp(cfg, `map-admin-${Date.now()}`);
				db = getFirestore(app);

				localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
				showStatus(refs.firebaseStatus, 'Firebase connected successfully.', 'ok');
				setConnectionState(true, 'Connected');

				await Promise.all([
					refreshSearchList(),
					refreshAdvisorList(),
					refreshTeamList(),
					refreshReviewList(),
					refreshAnnouncementList(),
					refreshContactList(),
					refreshNewsList(),
					refreshNewsletterList()
				]);
			} catch (error) {
				showStatus(refs.firebaseStatus, `Connection failed: ${error.message}`, 'error');
				setConnectionState(false, 'Connection Failed');
			} finally {
				setButtonBusy(refs.connectFirebaseBtn, false);
			}
		}

		// ─── Hardcoded built-in people ──────────────────────────────────────────────
		const HARDCODED_EXPERT_ADVISORS = [
			{ name: 'Eldho Paul',                 location: 'Newcastle (Tyne & Wear)',        specialty: 'Mortgage Protection', img: 'images/eldho.png'   },
			{ name: 'Dimble Varghese',            location: 'Newcastle (Tyne & Wear)',        specialty: 'Protection',          img: 'images/dimble.png'  },
			{ name: 'Saju John',                  location: 'Bolton (Manchester)',            specialty: 'Mortgage Protection', img: 'images/saju.png'    },
			{ name: 'Tojo Thomas',                location: 'Manchester',                     specialty: 'Protection',          img: 'images/tojo.png'    },
			{ name: 'Neethu Ann Cherian Abraham', location: 'Hamilton (South Lanarkshire)',   specialty: 'Protection',          img: 'images/neethu.png'  },
			{ name: 'Jithu George Victor',        location: 'Dundee (Scotland)',              specialty: 'Protection',          img: 'images/jithu.png'   },
			{ name: 'Xavier Dominic',             location: 'Nottingham',                     specialty: 'Mortgage Protection', img: 'images/xavier.png'  },
			{ name: 'Vinod Singh Chandel',        location: 'Nottingham',                     specialty: 'Protection',          img: 'images/vinod.png'   },
			{ name: 'Salga Peter',                location: 'Derby',                          specialty: 'Mortgage Protection', img: 'images/salga.png'   },
			{ name: 'Litty Mammen Toms',          location: 'Peterborough (Cambridgeshire)',  specialty: 'Protection',          img: 'images/litty.png'   },
			{ name: 'Shan Samuel',                location: 'Coventry',                       specialty: 'Protection',          img: 'images/shan.png'    },
			{ name: 'Jijo Paul Vembillil',        location: 'Redditch (Worcestershire)',      specialty: 'Protection',          img: 'images/jijo.png'    },
			{ name: 'Anto Kunniparambil',         location: 'Northampton',                    specialty: 'Protection',          img: 'images/anto.png'    },
			{ name: 'Vibin James',                location: 'Bedfordshire',                   specialty: 'Protection',          img: 'images/vibin.png'   },
			{ name: 'Anup John Philip',           location: 'Aylesbury (Buckinghamshire)',    specialty: 'Protection',          img: 'images/anup.png'    },
			{ name: 'Praveen Premkumar',          location: 'Aylesbury (Buckinghamshire)',    specialty: 'Protection',          img: 'images/praveen.png' },
			{ name: 'Minu Babu',                  location: 'Sudbury (Suffolk)',              specialty: 'Protection',          img: 'images/mini.png'    },
			{ name: 'George Thomas',              location: 'Watford',                        specialty: 'Mortgage Protection', img: 'images/george.png'  },
			{ name: 'Jeni George',                location: 'Newport (Wales)',                specialty: 'Protection',          img: 'images/jeni.png'    },
			{ name: 'Arun Thomas',                location: 'Wembley (London)',               specialty: 'Protection',          img: 'images/arunt.png'   },
			{ name: 'Arun Venugopala Kaimal',     location: 'London',                         specialty: 'Protection',          img: 'images/arunv.png'   },
			{ name: 'John Balogun',               location: 'Cardiff (Wales)',                specialty: 'Protection',          img: 'images/john.png'    },
			{ name: 'Saji Chacko',                location: 'Southampton (Hampshire)',        specialty: 'Mortgage Protection', img: 'images/saji.png'    },
			{ name: 'Ashly Gracious',             location: 'Southampton (Hampshire)',        specialty: 'Protection',          img: 'images/ashly.png'   },
			{ name: 'Sweetsy John',               location: 'Worthing (West Sussex)',         specialty: 'Mortgage Protection', img: 'images/sweetsy.png' },
			{ name: 'Vipin Sankar',               location: 'Devon',                          specialty: 'Protection',          img: 'images/alwin.png'   },
			{ name: 'Jithin Joseph',              location: 'Lancaster',                      specialty: 'Protection',          img: 'images/jithin.png'  }
		];

		const HARDCODED_TEAM = [
			{ name: 'ELDHO PAUL',         role: 'Director',    title: 'Principal & Director',     department: 'Company Leadership & Mortgage Strategy',    img: 'images/eldho.png'   },
			{ name: 'XAVIER DOMINIC',     role: 'Director',    title: 'Principal & Director',     department: 'Company Leadership & Client Relations',      img: 'images/xavier.png'  },
			{ name: 'ANUP JOHN PHILIP',   role: 'Director',    title: 'Principal & Director',     department: 'Company Operations & Business Development',  img: 'images/anup.png'    },
			{ name: 'ALWIN BABY',         role: 'Paraplanner', title: 'Mortgage Paraplanner',     department: 'Mortgage Processing & Documentation',        img: 'images/a.png'       },
			{ name: 'LIYA NASRIN NAJEEB', role: 'Paraplanner', title: 'Mortgage Paraplanner',     department: 'Mortgage Support & Client Services',         img: 'images/liya.png'    },
			{ name: 'CONSANIA RENJITH',   role: 'Assistant',   title: 'Administrative Assistant', department: 'Office Administration & Support',            img: 'images/niya.png'    },
			{ name: 'CHRISTY GEORGE',     role: 'Manager',     title: 'Administrative Manager',   department: 'Team Coordination & Administration',         img: 'images/christy.png' },
			{ name: 'NOEL PAUL',          role: 'IT',          title: 'IT & Social Media',        department: 'Website & Digital Marketing',                img: 'images/noel.png'    },
			{ name: 'KURIAN PAUL',        role: 'IT',          title: 'IT & Social Media',        department: 'Technical Support & System Management',      img: 'images/Kurian.png'  }
		];

		let _advisorFirebaseMap = {};
		let _teamFirebaseMap   = {};

		async function refreshAdvisorList() {
			if (!db) return;
			refs.advisorList.innerHTML = '';
			const gridEl = document.getElementById('advisorPeopleGrid');
			if (gridEl) gridEl.innerHTML = '';
			try {
				const snap = await getDocs(query(collection(db, 'advisors'), orderBy('name', 'asc')));
				refs.advisorCount.textContent = `${snap.size} in Firebase`;
				const activeCount = snap.docs.filter(d => d.data().active).length;
				setSummaryValue('summaryAdvisors', activeCount);

				// Build Firebase map: NAMEKEY → { id, data }
				_advisorFirebaseMap = {};
				const hardcodedNameSet = new Set(HARDCODED_EXPERT_ADVISORS.map(a => a.name.toUpperCase()));
				snap.forEach(d => {
					_advisorFirebaseMap[(d.data().name || '').toUpperCase()] = { id: d.id, data: d.data() };
				});

				if (!gridEl) return;

				// Render all 27 hardcoded advisors
				HARDCODED_EXPERT_ADVISORS.forEach(advisor => {
					const nameKey = advisor.name.toUpperCase();
					const fbEntry = _advisorFirebaseMap[nameKey];
					const imgSrc = fbEntry?.data?.imageBase64 || advisor.img;
					const card = document.createElement('div');
					card.className = 'adm-person-card';
					card.dataset.namekey = nameKey;
					card.innerHTML = `
						${fbEntry ? '<div class="adm-fb-dot" title="Saved in Firebase"></div>' : ''}
						<img class="adm-person-avatar" src="${imgSrc}" alt="${advisor.name}"
							onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
						<div class="adm-person-init" style="display:none;">${advisor.name.charAt(0)}</div>
						<div class="adm-person-name">${advisor.name}</div>
						<div class="adm-person-sub">${advisor.location}</div>
					`;
					card.addEventListener('click', () => selectAdvisorCard(advisor, fbEntry, card));
					gridEl.appendChild(card);
				});

				// Render Firebase-only new advisors (not in hardcoded list)
				snap.forEach(d => {
					const nameKey = (d.data().name || '').toUpperCase();
					if (hardcodedNameSet.has(nameKey)) return;
					const item = d.data();
					const card = document.createElement('div');
					card.className = 'adm-person-card';
					card.dataset.namekey = nameKey;
					card.innerHTML = `
						<div class="adm-fb-dot" title="Firebase-managed"></div>
						${item.imageBase64
							? `<img class="adm-person-avatar" src="${item.imageBase64}" alt="${item.name}">`
							: `<div class="adm-person-init">${(item.name || '?').charAt(0)}</div>`
						}
						<div class="adm-person-name">${item.name || 'Unnamed'}</div>
						<div class="adm-person-sub">${item.location || ''}</div>
					`;
					const hc = { name: item.name || '', location: item.location || '', specialty: item.specialty || '', img: null };
					card.addEventListener('click', () => selectAdvisorCard(hc, { id: d.id, data: item }, card));
					gridEl.appendChild(card);
				});

			} catch (error) {
				refs.advisorCount.textContent = '0 in Firebase';
				setSummaryValue('summaryAdvisors', 0);
				showStatus(refs.advisorStatus, `Unable to load advisors: ${error.message}`, 'error');
			}
		}

		async function refreshTeamList() {
			if (!db) return;
			refs.teamList.innerHTML = '';
			const gridEl = document.getElementById('teamPeopleGrid');
			if (gridEl) gridEl.innerHTML = '';
			try {
				const snap = await getDocs(query(collection(db, 'teamMembers'), orderBy('name', 'asc')));
				refs.teamCount.textContent = `${snap.size} in Firebase`;

				_teamFirebaseMap = {};
				const hardcodedTeamNameSet = new Set(HARDCODED_TEAM.map(m => m.name.toUpperCase()));
				snap.forEach(d => {
					_teamFirebaseMap[(d.data().name || '').toUpperCase()] = { id: d.id, data: d.data() };
				});

				if (!gridEl) return;

				// Render 9 hardcoded core team members
				HARDCODED_TEAM.forEach(member => {
					const nameKey = member.name.toUpperCase();
					const fbEntry = _teamFirebaseMap[nameKey];
					const imgSrc = fbEntry?.data?.imageBase64 || member.img;
					const card = document.createElement('div');
					card.className = 'adm-person-card';
					card.dataset.namekey = nameKey;
					card.innerHTML = `
						${fbEntry ? '<div class="adm-fb-dot" title="Saved in Firebase"></div>' : ''}
						<img class="adm-person-avatar" src="${imgSrc}" alt="${member.name}"
							onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
						<div class="adm-person-init" style="display:none;">${member.name.charAt(0)}</div>
						<div class="adm-person-name">${member.name}</div>
						<div class="adm-person-sub">${member.role}</div>
						<div class="adm-person-dept" title="${member.department}">${member.department}</div>
					`;
					card.addEventListener('click', () => selectTeamCard(member, fbEntry, card));
					gridEl.appendChild(card);
				});

				// Render Firebase-only extra team members
				snap.forEach(d => {
					const nameKey = (d.data().name || '').toUpperCase();
					if (hardcodedTeamNameSet.has(nameKey)) return;
					const item = d.data();
					const card = document.createElement('div');
					card.className = 'adm-person-card';
					card.dataset.namekey = nameKey;
					card.innerHTML = `
						<div class="adm-fb-dot" title="Firebase-managed"></div>
						${item.imageBase64
							? `<img class="adm-person-avatar" src="${item.imageBase64}" alt="${item.name}">`
							: `<div class="adm-person-init">${(item.name || '?').charAt(0)}</div>`
						}
						<div class="adm-person-name">${item.name || 'Unnamed'}</div>
						<div class="adm-person-sub">${item.role || ''}</div>
						${item.department ? `<div class="adm-person-dept" title="${item.department}">${item.department}</div>` : ''}
					`;
					const hc = { name: item.name || '', role: item.role || '', title: item.title || '', department: item.department || '', img: null };
					card.addEventListener('click', () => selectTeamCard(hc, { id: d.id, data: item }, card));
					gridEl.appendChild(card);
				});

			} catch (error) {
				refs.teamCount.textContent = '0 in Firebase';
				showStatus(refs.teamStatus, `Unable to load team: ${error.message}`, 'error');
			}
		}

		function selectAdvisorCard(hardcoded, fbEntry, cardEl) {
			document.querySelectorAll('#advisorPeopleGrid .adm-person-card').forEach(c => c.classList.remove('selected'));
			cardEl.classList.add('selected');
			const data = fbEntry?.data || {};
			refs.advisorDocId.value = fbEntry?.id || '';
			refs.advisorName.value = data.name || hardcoded.name || '';
			refs.advisorLocation.value = data.location || hardcoded.location || '';
			const knownSpecialties = ['Mortgage Protection', 'Protection', 'Mortgage'];
			const specialty = data.specialty || hardcoded.specialty || 'Mortgage Protection';
			if (knownSpecialties.includes(specialty)) {
				refs.advisorSpecialty.value = specialty;
				document.getElementById('specialtyOtherField').style.display = 'none';
			} else {
				refs.advisorSpecialty.value = 'Other';
				refs.advisorSpecialtyOther.value = specialty;
				document.getElementById('specialtyOtherField').style.display = 'block';
			}
			refs.advisorPhone.value = data.phone || '';
			refs.advisorEmail.value = data.email || '';
			refs.advisorActive.value = data.active !== false ? 'true' : 'false';
			if (data.imageBase64) {
				refs.advisorImagePreview.src = data.imageBase64;
				refs.advisorImagePreview.style.display = 'block';
			} else {
				refs.advisorImagePreview.style.display = 'none';
			}
			if (data.qrCodeBase64) {
				refs.advisorQRPreview.src = data.qrCodeBase64;
				refs.advisorQRPreview.style.display = 'block';
			} else {
				refs.advisorQRPreview.style.display = 'none';
			}
			document.getElementById('advisorFormTitle').textContent = `✏️ Editing: ${hardcoded.name}`;
			if (refs.deleteAdvisorBtn) refs.deleteAdvisorBtn.style.display = fbEntry ? 'inline-flex' : 'none';
			document.getElementById('advisorFormTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
			clearStatus(refs.advisorStatus);
		}

		function selectTeamCard(hardcoded, fbEntry, cardEl) {
			document.querySelectorAll('#teamPeopleGrid .adm-person-card').forEach(c => c.classList.remove('selected'));
			cardEl.classList.add('selected');
			const data = fbEntry?.data || {};
			refs.teamDocId.value = fbEntry?.id || '';
			refs.teamName.value = data.name || hardcoded.name || '';
			const knownRoles = ['Director', 'Paraplanner', 'Assistant', 'Manager', 'IT'];
			const role = data.role || hardcoded.role || 'Director';
			if (knownRoles.includes(role)) {
				refs.teamRole.value = role;
				const roleOtherField = document.getElementById('teamRoleOtherField');
				if (roleOtherField) roleOtherField.style.display = 'none';
			} else {
				refs.teamRole.value = 'Other';
				if (refs.teamRoleOther) refs.teamRoleOther.value = role;
				const roleOtherField = document.getElementById('teamRoleOtherField');
				if (roleOtherField) roleOtherField.style.display = 'block';
			}
			refs.teamTitle.value = data.title || hardcoded.title || '';
			refs.teamDepartment.value = data.department || hardcoded.department || '';
			refs.teamActive.value = data.active !== false ? 'true' : 'false';
			if (data.imageBase64) {
				refs.teamImagePreview.src = data.imageBase64;
				refs.teamImagePreview.style.display = 'block';
			} else {
				refs.teamImagePreview.style.display = 'none';
			}
			document.getElementById('teamFormTitle').textContent = `✏️ Editing: ${hardcoded.name}`;
			if (refs.deleteTeamBtn) refs.deleteTeamBtn.style.display = fbEntry ? 'inline-flex' : 'none';
			document.getElementById('teamFormTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
			clearStatus(refs.teamStatus);
		}

		async function saveTeamMember() {
			if (!db) {
				showStatus(refs.teamStatus, 'Connect Firebase first.', 'error');
				return;
			}

			clearStatus(refs.teamStatus);
			setButtonBusy(refs.saveTeamBtn, true, 'Saving...');

			const name = refs.teamName.value.trim();
			const role = refs.teamRole.value === 'Other'
				? (refs.teamRoleOther?.value.trim() || '')
				: refs.teamRole.value.trim();
			const title = refs.teamTitle.value.trim();

			if (!name || !role || !title) {
				showStatus(refs.teamStatus, 'Name, Role Badge and Title are required.', 'error');
				setButtonBusy(refs.saveTeamBtn, false);
				return;
			}

			try {
				const file = refs.teamImage.files[0];
				let imageBase64 = null;
				if (file) {
					showStatus(refs.teamStatus, 'Compressing photo…', 'info');
					imageBase64 = await compressImageToBase64(file);
					if (imageBase64.length > 900000) {
						showStatus(refs.teamStatus, 'Photo too large. Please use a smaller image.', 'error');
						setButtonBusy(refs.saveTeamBtn, false);
						return;
					}
				}

				const docId = refs.teamDocId.value;
				const payload = {
					name,
					role,
					title,
					department: refs.teamDepartment.value.trim(),
					active: refs.teamActive.value === 'true',
					updatedAt: serverTimestamp()
				};
				if (imageBase64) {
					payload.imageBase64 = imageBase64;
				} else if (docId) {
					// Preserve existing photo when editing without uploading a new one
					const existing = _teamFirebaseMap[(name || '').toUpperCase()]?.data;
					if (existing?.imageBase64) payload.imageBase64 = existing.imageBase64;
				}

				if (docId) {
					await updateDoc(doc(db, 'teamMembers', docId), payload);
					showStatus(refs.teamStatus, 'Team member updated.', 'ok');
				} else {
					payload.createdAt = serverTimestamp();
					await addDoc(collection(db, 'teamMembers'), payload);
					showStatus(refs.teamStatus, 'Team member added.', 'ok');
				}

				refs.teamForm.reset();
				refs.teamDocId.value = '';
				refs.teamActive.value = 'true';
				refs.teamImagePreview.style.display = 'none';
				await refreshTeamList();
			} catch (error) {
				showStatus(refs.teamStatus, `Unable to save: ${error.message}`, 'error');
			} finally {
				setButtonBusy(refs.saveTeamBtn, false);
			}
		}
		const DEFAULT_ADVISORS = [
			{ name: 'ELDHO PAUL', title: 'Principal & Director', email: 'eldho@map-advisors.com', phone: '+44 1234 567890', bio: 'CeMAP, Cert Pro, MLIBF - Principal and Director with extensive mortgage experience.', active: true },
			{ name: 'XAVIER DOMINIC', title: 'Principal & Director', email: 'xavier@map-advisors.com', phone: '+44 1234 567891', bio: 'MBA, CeMAP, MLIBF - Principal and Director specializing in financial planning.', active: true },
			{ name: 'ANUP JOHN PHILIP', title: 'Principal & Director', email: 'anup@map-advisors.com', phone: '+44 1234 567892', bio: 'The Mortgage Advice Professionals - Principal and Director.', active: true },
			{ name: 'ALWIN BABY', title: 'Mortgage Paraplanner', email: 'alwin@map-advisors.com', phone: '+44 1234 567893', bio: 'Skilled mortgage paraplanner with comprehensive knowledge of lending products.', active: true },
			{ name: 'LIYA NASRIN NAJEEB', title: 'Mortgage Paraplanner', email: 'liya@map-advisors.com', phone: '+44 1234 567894', bio: 'Dedicated mortgage paraplanner assisting with complex mortgage cases.', active: true },
			{ name: 'CONSANIA RENJITH', title: 'Administrative Assistant', email: 'consania@map-advisors.com', phone: '+44 1234 567895', bio: 'Administrative assistant providing excellent client support.', active: true },
			{ name: 'CHRISTY GEORGE', title: 'Administrative Manager', email: 'christy@map-advisors.com', phone: '+44 1234 567896', bio: 'CeMAP, MLIBF - Administrative Manager overseeing operations.', active: true },
			{ name: 'NOEL PAUL', title: 'IT & Social Media', email: 'noel@map-advisors.com', phone: '+44 1234 567897', bio: 'IT specialist and social media manager ensuring online presence.', active: true },
			{ name: 'KURIAN PAUL', title: 'IT & Social Media', email: 'kurian@map-advisors.com', phone: '+44 1234 567898', bio: 'IT professional managing digital solutions and social media.', active: true }
		];

		async function autoImportDefaultAdvisors() {
			if (!db) return;

			try {
				const snap = await getDocs(collection(db, 'advisors'));
				const existingNames = new Set(snap.docs.map(d => d.data().name?.toUpperCase()));

				// Import missing default advisors
				let addedCount = 0;
				for (const advisor of DEFAULT_ADVISORS) {
					if (!existingNames.has(advisor.name.toUpperCase())) {
						await addDoc(collection(db, 'advisors'), {
							...advisor,
							createdAt: serverTimestamp(),
							updatedAt: serverTimestamp()
						});
						addedCount++;
					}
				}

				if (addedCount > 0) {
					console.log(`Auto-imported ${addedCount} default advisors`);
				}
			} catch (error) {
				console.warn('Auto-import default advisors skipped:', error.message);
			}
		}

		async function restoreDefaultAdvisors() {
			if (!db) {
				showStatus(refs.advisorStatus, 'Connect Firebase first.', 'error');
				return;
			}

			setButtonBusy(refs.restoreDefaultsBtn, true, 'Restoring...');
			clearStatus(refs.advisorStatus);

			try {
				const snap = await getDocs(collection(db, 'advisors'));
				const existingNames = new Set(snap.docs.map(d => d.data().name?.toUpperCase()));

				let addedCount = 0;
				for (const advisor of DEFAULT_ADVISORS) {
					if (!existingNames.has(advisor.name.toUpperCase())) {
						await addDoc(collection(db, 'advisors'), {
							...advisor,
							createdAt: serverTimestamp(),
							updatedAt: serverTimestamp()
						});
						addedCount++;
					}
				}

				if (addedCount > 0) {
					showStatus(refs.advisorStatus, `Restored ${addedCount} default advisor${addedCount !== 1 ? 's' : ''}.`, 'ok');
				} else {
					showStatus(refs.advisorStatus, 'All default advisors are already present.', 'ok');
				}
				await refreshAdvisorList();
			} catch (error) {
				showStatus(refs.advisorStatus, `Restore failed: ${error.message}`, 'error');
			} finally {
				setButtonBusy(refs.restoreDefaultsBtn, false);
			}
		}

		function toggleSpecialtyOther() {
			const sel = document.getElementById('advisorSpecialty');
			const otherField = document.getElementById('specialtyOtherField');
			otherField.style.display = sel.value === 'Other' ? 'block' : 'none';
		}
		window.toggleSpecialtyOther = toggleSpecialtyOther;

		function toggleTeamRoleOther() {
			const sel = document.getElementById('teamRole');
			const otherField = document.getElementById('teamRoleOtherField');
			if (otherField) otherField.style.display = sel.value === 'Other' ? 'block' : 'none';
		}
		window.toggleTeamRoleOther = toggleTeamRoleOther;

		// Switch advisor tabs
		function switchAdvisorTab(tabId) {
			const section = document.getElementById('advisors-section');
			
			// Hide all tabs in this section
			section.querySelectorAll('.advisor-tab-content').forEach(tab => {
				tab.classList.remove('active');
			});
			
			// Remove active class from all buttons in this section
			section.querySelectorAll('.tab-btn').forEach(btn => {
				btn.classList.remove('active');
			});
			
			// Show selected tab
			document.getElementById(tabId).classList.add('active');
			
			// Add active class to clicked button
			event.target.classList.add('active');
		}
		window.switchAdvisorTab = switchAdvisorTab;

		async function saveAdvisor() {
			if (!db) {
				showStatus(refs.advisorStatus, 'Connect Firebase first.', 'error');
				return;
			}

			clearStatus(refs.advisorStatus);
			setButtonBusy(refs.saveAdvisorBtn, true, 'Saving...');

			const name = refs.advisorName.value.trim();
			const location = refs.advisorLocation.value.trim();
			const specialtyRaw = refs.advisorSpecialty.value;
			const specialty = specialtyRaw === 'Other' ? refs.advisorSpecialtyOther.value.trim() : specialtyRaw;
			const email = refs.advisorEmail.value.trim();
			const phone = refs.advisorPhone.value.trim();

			if (!name || !location) {
				showStatus(refs.advisorStatus, 'Name and Location are required.', 'error');
				setButtonBusy(refs.saveAdvisorBtn, false);
				return;
			}

			if (specialtyRaw === 'Other' && !specialty) {
				showStatus(refs.advisorStatus, 'Please specify the specialty.', 'error');
				setButtonBusy(refs.saveAdvisorBtn, false);
				return;
			}

			if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
				showStatus(refs.advisorStatus, 'Please enter a valid email address.', 'error');
				setButtonBusy(refs.saveAdvisorBtn, false);
				return;
			}

			try {
				const file = refs.advisorImage.files[0];
				let imageBase64 = null;

				if (file) {
					showStatus(refs.advisorStatus, 'Compressing photo…', 'info');
					imageBase64 = await compressImageToBase64(file);
					if (imageBase64.length > 900000) {
						showStatus(refs.advisorStatus, 'Photo is too large after compression. Please use a smaller image.', 'error');
						setButtonBusy(refs.saveAdvisorBtn, false);
						return;
					}
				}

				const qrFile = refs.advisorQR.files[0];
				let qrCodeBase64 = null;

				if (qrFile) {
					showStatus(refs.advisorStatus, 'Compressing QR code…', 'info');
					qrCodeBase64 = await compressImageToBase64(qrFile);
				}

				const docId = refs.advisorDocId.value;
				const payload = {
					name,
					location,
					specialty,
					email,
					phone,
					active: refs.advisorActive.value === 'true',
					updatedAt: serverTimestamp()
				};
				if (imageBase64) {
					payload.imageBase64 = imageBase64;
				} else if (docId) {
					// Preserve existing photo when editing without uploading a new one
					const existing = _advisorFirebaseMap[(name || '').toUpperCase()]?.data;
					if (existing?.imageBase64) payload.imageBase64 = existing.imageBase64;
				}
				if (qrCodeBase64) {
					payload.qrCodeBase64 = qrCodeBase64;
				} else if (docId) {
					const existing = _advisorFirebaseMap[(name || '').toUpperCase()]?.data;
					if (existing?.qrCodeBase64) payload.qrCodeBase64 = existing.qrCodeBase64;
				}

				if (docId) {
					await updateDoc(doc(db, 'advisors', docId), payload);
					showStatus(refs.advisorStatus, 'Advisor updated.', 'ok');
				} else {
					payload.createdAt = serverTimestamp();
					await addDoc(collection(db, 'advisors'), payload);
					showStatus(refs.advisorStatus, 'Advisor added.', 'ok');
				}

				refs.advisorForm.reset();
				refs.advisorDocId.value = '';
				refs.advisorSpecialty.value = 'Mortgage Protection';
				document.getElementById('specialtyOtherField').style.display = 'none';
				refs.advisorActive.value = 'true';
				refs.advisorImagePreview.style.display = 'none';
				refs.advisorQRPreview.style.display = 'none';
				await refreshAdvisorList();
			} catch (error) {
				showStatus(refs.advisorStatus, `Unable to save advisor: ${error.message}`, 'error');
			} finally {
				setButtonBusy(refs.saveAdvisorBtn, false);
			}
		}

		async function refreshSearchList() {
			if (!db) return;
			refs.searchList.innerHTML = '';
			const snap = await getDocs(query(collection(db, 'searchItems'), orderBy('title', 'asc')));
			refs.searchCount.textContent = `${snap.size} items`;

			snap.forEach((d) => {
				const item = d.data();
				const el = document.createElement('div');
				el.className = 'item';
				el.innerHTML = `
					<div class="item-head">
						<h4>${item.icon || '🔎'} ${item.title || 'Untitled'}</h4>
						<span class="chip">${item.cat || 'resources'}</span>
					</div>
					<small>${item.link || ''}</small>
					<small>Keywords: ${item.keywords || '-'}</small>
					<div class="row-actions">
						<button class="btn ghost" data-action="edit" data-id="${d.id}">Edit</button>
						<button class="btn danger" data-action="delete" data-id="${d.id}">Delete</button>
					</div>
				`;
				refs.searchList.appendChild(el);

				el.querySelector('[data-action="edit"]').addEventListener('click', () => {
					refs.searchDocId.value = d.id;
					refs.searchTitle.value = item.title || '';
					refs.searchLink.value = item.link || '';
					refs.searchCat.value = item.cat || 'resources';
					refs.searchIcon.value = item.icon || '🔎';
					refs.searchKeywords.value = item.keywords || '';
					window.scrollTo({ top: refs.searchForm.offsetTop - 40, behavior: 'smooth' });
				});

				el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
					if (!confirm('Delete this search item?')) return;
					await deleteDoc(doc(db, 'searchItems', d.id));
					showStatus(refs.searchStatus, 'Search item deleted.', 'ok');
					await refreshSearchList();
				});
			});

			if (snap.empty) {
				refs.searchList.innerHTML = '<p class="muted">No search items yet.</p>';
			}
		}

		async function saveSearchItem() {
			if (!db) {
				showStatus(refs.searchStatus, 'Connect Firebase first.', 'error');
				return;
			}

			const payload = {
				title: refs.searchTitle.value.trim(),
				link: refs.searchLink.value.trim(),
				cat: refs.searchCat.value,
				icon: refs.searchIcon.value.trim() || '🔎',
				keywords: refs.searchKeywords.value.trim(),
				updatedAt: serverTimestamp()
			};

			if (!payload.title || !payload.link) {
				showStatus(refs.searchStatus, 'Title and link are required.', 'error');
				return;
			}

			if (refs.searchDocId.value) {
				await updateDoc(doc(db, 'searchItems', refs.searchDocId.value), payload);
				showStatus(refs.searchStatus, 'Search item updated.', 'ok');
			} else {
				payload.createdAt = serverTimestamp();
				await addDoc(collection(db, 'searchItems'), payload);
				showStatus(refs.searchStatus, 'Search item added.', 'ok');
			}

			refs.searchForm.reset();
			refs.searchDocId.value = '';
			refs.searchIcon.value = '🔎';
			await refreshSearchList();
		}

		async function refreshReviewList() {
			if (!db) return;
			refs.reviewList.innerHTML = '';

			try {
				const snap = await getDocs(collection(db, 'reviews'));
				const docs = [...snap.docs].sort((a, b) => {
					const aMs = a.data()?.createdAt?.toMillis?.() || 0;
					const bMs = b.data()?.createdAt?.toMillis?.() || 0;
					return bMs - aMs;
				});

				refs.reviewCount.textContent = `${docs.length} items`;
				setSummaryValue('summaryReviews', docs.length);

				docs.forEach((d) => {
				const item = d.data();
				const stars = '★'.repeat(Math.max(1, Math.min(5, Number(item.rating) || 5)));
				const el = document.createElement('div');
				el.className = 'item';
				el.innerHTML = `
					<div class="item-head">
						<h4>${item.name || 'Anonymous'} - ${stars}</h4>
						<span class="chip">${item.approved ? 'approved' : 'draft'}</span>
					</div>
					<small>${item.source || 'Website'} | ${item.tag || 'General'}</small>
					<small>${item.link || 'No Google link provided'}</small>
					<div>${item.text || ''}</div>
					<div class="row-actions">
						<button class="btn ghost" data-action="edit" data-id="${d.id}">Edit</button>
						<button class="btn danger" data-action="delete" data-id="${d.id}">Delete</button>
					</div>
				`;
				refs.reviewList.appendChild(el);

				el.querySelector('[data-action="edit"]').addEventListener('click', () => {
					refs.reviewDocId.value = d.id;
					refs.reviewName.value = item.name || '';
					refs.reviewSource.value = item.source || '';
					refs.reviewLink.value = item.link || '';
					refs.reviewRating.value = item.rating || 5;
					refs.reviewTag.value = item.tag || '';
					refs.reviewApproved.value = String(Boolean(item.approved));
					refs.reviewDate.value = item.createdAt ? toDateTimeLocalValue(item.createdAt).slice(0, 10) : '';
					refs.reviewText.value = item.text || '';
					window.scrollTo({ top: refs.reviewForm.offsetTop - 40, behavior: 'smooth' });
				});

				el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
					if (!confirm('Delete this review?')) return;
					await deleteDoc(doc(db, 'reviews', d.id));
					showStatus(refs.reviewStatus, 'Review deleted.', 'ok');
					await refreshReviewList();
				});
				});

				if (docs.length === 0) {
					refs.reviewList.innerHTML = '<p class="muted">No reviews yet.</p>';
				}
			} catch (error) {
				refs.reviewCount.textContent = '0 items';
				setSummaryValue('summaryReviews', 0);
				showStatus(refs.reviewStatus, `Unable to load reviews: ${error.message}`, 'error');
			}
		}

		async function saveReview() {
			if (!db) {
				showStatus(refs.reviewStatus, 'Connect Firebase first.', 'error');
				return;
			}

			clearStatus(refs.reviewStatus);

			const reviewLink = refs.reviewLink.value.trim();
			const hasGoogleLink = /(google\.|goo\.gl|g\.co|maps\.app)/i.test(reviewLink);

			const payload = {
				name: refs.reviewName.value.trim() || 'Google Reviewer',
				source: refs.reviewSource.value.trim() || (hasGoogleLink ? 'Google Reviews' : 'Website'),
				link: reviewLink,
				rating: Number(refs.reviewRating.value) || 5,
				tag: refs.reviewTag.value.trim(),
				approved: refs.reviewApproved.value === 'true',
				text: refs.reviewText.value.trim() || (reviewLink ? 'Read this review on Google Reviews.' : ''),
				updatedAt: serverTimestamp()
			};

			if (!payload.text && !payload.link) {
				showStatus(refs.reviewStatus, 'Add review text or paste a Google review link.', 'error');
				return;
			}

			const reviewDateVal = refs.reviewDate.value;
			if (reviewDateVal) payload.createdAt = Timestamp.fromDate(new Date(reviewDateVal + 'T12:00'));

			try {
				if (refs.reviewDocId.value) {
					await updateDoc(doc(db, 'reviews', refs.reviewDocId.value), payload);
					showStatus(refs.reviewStatus, 'Review updated.', 'ok');
				} else {
					if (!payload.createdAt) payload.createdAt = serverTimestamp();
					await addDoc(collection(db, 'reviews'), payload);
					showStatus(refs.reviewStatus, 'Review added.', 'ok');
				}

				refs.reviewForm.reset();
				refs.reviewDocId.value = '';
				refs.reviewRating.value = 5;
				refs.reviewApproved.value = 'true';
				await refreshReviewList();
			} catch (error) {
				showStatus(refs.reviewStatus, `Unable to save review: ${error.message}`, 'error');
			}
		}

		async function refreshAnnouncementList() {
			if (!db) return;
			refs.announcementList.innerHTML = '';

			try {
				const snap = await getDocs(collection(db, 'announcements'));
				const docs = [...snap.docs].sort((a, b) => {
					const aMs = a.data()?.startAt?.toMillis?.() || a.data()?.createdAt?.toMillis?.() || 0;
					const bMs = b.data()?.startAt?.toMillis?.() || b.data()?.createdAt?.toMillis?.() || 0;
					return bMs - aMs;
				});

				refs.announcementCount.textContent = `${docs.length} items`;
				setSummaryValue('summaryAnnouncements', docs.length);

				docs.forEach((d) => {
					const item = d.data();
					const state = getAnnouncementState(item);
					const el = document.createElement('div');
					el.className = 'item';
					el.innerHTML = `
						<div class="item-head">
							<h4>${item.text || 'Untitled announcement'}</h4>
							<span class="chip">${state}</span>
						</div>
						<small>Type: ${item.type || 'info'} | Enabled: ${String(Boolean(item.enabled))}</small>
						<small>From: ${formatSchedule(item.startAt)} | To: ${formatSchedule(item.endAt)}</small>
						<div class="row-actions">
							<button class="btn ghost" data-action="edit">Edit</button>
							<button class="btn warn" data-action="toggle">${item.enabled ? 'Disable' : 'Enable'}</button>
							<button class="btn danger" data-action="delete">Delete</button>
						</div>
					`;
					refs.announcementList.appendChild(el);

					el.querySelector('[data-action="edit"]').addEventListener('click', () => {
						refs.announcementDocId.value = d.id;
						refs.announcementText.value = item.text || '';
						refs.announcementType.value = item.type || 'info';
						refs.announcementEnabled.value = String(Boolean(item.enabled));
						refs.announcementStartAt.value = toDateTimeLocalValue(item.startAt);
						refs.announcementEndAt.value = toDateTimeLocalValue(item.endAt);
						window.scrollTo({ top: refs.announcementForm.offsetTop - 40, behavior: 'smooth' });
					});

					el.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
						try {
							await updateDoc(doc(db, 'announcements', d.id), {
								enabled: !item.enabled,
								updatedAt: serverTimestamp()
							});
							showStatus(refs.announcementStatus, `Announcement ${item.enabled ? 'disabled' : 'enabled'}.`, 'ok');
							await refreshAnnouncementList();
						} catch (error) {
							showStatus(refs.announcementStatus, `Unable to update announcement: ${error.message}`, 'error');
						}
					});

					el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
						if (!confirm('Delete this announcement?')) return;
						try {
							await deleteDoc(doc(db, 'announcements', d.id));
							showStatus(refs.announcementStatus, 'Announcement deleted.', 'ok');
							await refreshAnnouncementList();
						} catch (error) {
							showStatus(refs.announcementStatus, `Unable to delete announcement: ${error.message}`, 'error');
						}
					});
				});

				if (docs.length === 0) {
					refs.announcementList.innerHTML = '<p class="muted">No announcements yet.</p>';
				}
			} catch (error) {
				refs.announcementCount.textContent = '0 items';
				setSummaryValue('summaryAnnouncements', 0);
				showStatus(refs.announcementStatus, `Unable to load announcements: ${error.message}`, 'error');
			}
		}

		async function refreshContactList() {
			if (!db) return;
			refs.contactList.innerHTML = '';

			try {
				const snap = await getDocs(collection(db, 'contactMessages'));
				const docs = [...snap.docs].sort((a, b) => {
					const aMs = a.data()?.createdAt?.toMillis?.() || 0;
					const bMs = b.data()?.createdAt?.toMillis?.() || 0;
					return bMs - aMs;
				});

				refs.contactCount.textContent = `${docs.length} messages`;
				setSummaryValue('summaryContacts', docs.length);

				docs.forEach((d) => {
					const item = d.data();
					const el = document.createElement('div');
					el.className = 'item';
					el.innerHTML = `
						<div class="item-head">
							<h4>${mapEscape(item.name || 'Unknown')} | ${mapEscape(item.email || 'No email')}</h4>
							<span class="chip">${formatSchedule(item.createdAt)}</span>
						</div>
						<small>Phone: ${mapEscape(item.phone || 'Not provided')}</small>
						<small>Preferred contact: ${formatContactMethods(item.contactMethods)}</small>
						<small>Marketing consent: ${item.stayTouch ? 'Yes' : 'No'}</small>
						<div style="white-space:pre-wrap">${mapEscape(item.message || '')}</div>
						<div class="row-actions">
							<button class="btn danger" data-action="delete">Delete</button>
						</div>
					`;
					refs.contactList.appendChild(el);

					el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
						if (!confirm('Delete this contact message?')) return;
						try {
							await deleteDoc(doc(db, 'contactMessages', d.id));
							showStatus(refs.contactStatus, 'Contact message deleted.', 'ok');
							await refreshContactList();
						} catch (error) {
							showStatus(refs.contactStatus, `Unable to delete contact message: ${error.message}`, 'error');
						}
					});
				});

				if (docs.length === 0) {
					refs.contactList.innerHTML = '<p class="muted">No contact messages yet.</p>';
				}
			} catch (error) {
				refs.contactCount.textContent = '0 messages';
				setSummaryValue('summaryContacts', 0);
				showStatus(refs.contactStatus, `Unable to load contact messages: ${error.message}`, 'error');
			}
		}

		async function refreshNewsList() {
			if (!db) return;
			refs.newsList.innerHTML = '';

			try {
				const snap = await getDocs(query(collection(db, 'newsItems'), orderBy('createdAt', 'desc')));
				const published = snap.docs.filter(d => d.data().published).length;
				refs.newsCount.textContent = `${snap.size} items`;
				setSummaryValue('summaryNews', published);

				snap.docs.forEach((d) => {
					const item = d.data();
					const el = document.createElement('div');
					el.className = 'item';
					el.innerHTML = `
						<div class="item-head" style="align-items:flex-start;gap:0.75rem;">
							${item.imageBase64 ? `<img class="news-item-img" src="${item.imageBase64}" alt="" />` : ''}
							<div style="flex:1;min-width:0;">
								<h4>${item.title || 'Untitled'}</h4>
								<small style="display:block;margin-top:0.25rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${(item.description || '').slice(0, 80)}${(item.description || '').length > 80 ? '…' : ''}</small>
							</div>
							<span class="chip">${item.published ? 'published' : 'draft'}</span>
						</div>
						<div class="row-actions">
							<button class="btn ghost" data-action="edit" data-id="${d.id}">Edit</button>
							<button class="btn danger" data-action="delete" data-id="${d.id}">Delete</button>
						</div>
					`;
					refs.newsList.appendChild(el);

					el.querySelector('[data-action="edit"]').addEventListener('click', () => {
						refs.newsDocId.value = d.id;
						refs.newsTitle.value = item.title || '';
						refs.newsDescription.value = item.description || '';
						refs.newsPublished.value = String(Boolean(item.published));
						refs.newsDate.value = item.createdAt ? toDateTimeLocalValue(item.createdAt).slice(0, 10) : '';
						if (item.imageBase64) {
							refs.newsImagePreview.src = item.imageBase64;
							refs.newsImagePreview.style.display = 'block';
						} else {
							refs.newsImagePreview.style.display = 'none';
						}
						window.scrollTo({ top: refs.newsForm.offsetTop - 40, behavior: 'smooth' });
					});

					el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
						if (!confirm('Delete this article?')) return;
						try {
							await deleteDoc(doc(db, 'newsItems', d.id));
							showStatus(refs.newsStatus, 'Article deleted.', 'ok');
							await refreshNewsList();
						} catch (error) {
							showStatus(refs.newsStatus, `Unable to delete: ${error.message}`, 'error');
						}
					});
				});

				if (snap.empty) {
					refs.newsList.innerHTML = '<p class="muted">No news articles yet.</p>';
				}
			} catch (error) {
				refs.newsCount.textContent = '0 items';
				setSummaryValue('summaryNews', 0);
				showStatus(refs.newsStatus, `Unable to load articles: ${error.message}`, 'error');
			}
		}

		async function saveNewsItem() {
			if (!db) {
				showStatus(refs.newsStatus, 'Connect Firebase first.', 'error');
				return;
			}

			clearStatus(refs.newsStatus);
			setButtonBusy(refs.saveNewsBtn, true, 'Saving...');

			const title = refs.newsTitle.value.trim();
			if (!title) {
				showStatus(refs.newsStatus, 'Title is required.', 'error');
				setButtonBusy(refs.saveNewsBtn, false);
				return;
			}

			try {
				const file = refs.newsImageFile.files[0];
				let imageBase64 = null;

				if (file) {
					showStatus(refs.newsStatus, 'Compressing image…', 'info');
					imageBase64 = await compressImageToBase64(file);
					// Rough size check — Firestore doc limit is 1 MB
					if (imageBase64.length > 900000) {
						showStatus(refs.newsStatus, 'Image is still too large after compression. Please use a smaller image.', 'error');
						setButtonBusy(refs.saveNewsBtn, false);
						return;
					}
				}

				const docId = refs.newsDocId.value;
				const payload = {
					title,
					description: refs.newsDescription.value.trim(),
					published: refs.newsPublished.value === 'true',
					updatedAt: serverTimestamp()
				};
				if (imageBase64) payload.imageBase64 = imageBase64;
				const newsDateVal = refs.newsDate.value;
				if (newsDateVal) payload.createdAt = Timestamp.fromDate(new Date(newsDateVal + 'T12:00'));
				if (docId) {
					await updateDoc(doc(db, 'newsItems', docId), payload);
					showStatus(refs.newsStatus, 'Article updated.', 'ok');
				} else {
					if (!payload.createdAt) payload.createdAt = serverTimestamp();
					await addDoc(collection(db, 'newsItems'), payload);
					showStatus(refs.newsStatus, 'Article added.', 'ok');
				}

				refs.newsForm.reset();
				refs.newsDocId.value = '';
				refs.newsDate.value = '';
				refs.newsImagePreview.style.display = 'none';
				await refreshNewsList();
			} catch (error) {
				showStatus(refs.newsStatus, `Unable to save article: ${error.message}`, 'error');
			} finally {
				setButtonBusy(refs.saveNewsBtn, false);
			}
		}

		async function saveAnnouncement(enabledOverride = null) {
			if (!db) {
				showStatus(refs.announcementStatus, 'Connect Firebase first.', 'error');
				return;
			}

			clearStatus(refs.announcementStatus);
			setButtonBusy(refs.saveAnnouncementBtn, true, 'Saving...');

			const enabled = enabledOverride === null
				? refs.announcementEnabled.value === 'true'
				: enabledOverride;
			const announcementText = refs.announcementText.value.trim();
			const startAt = parseDateTimeLocal(refs.announcementStartAt.value);
			const endAt = parseDateTimeLocal(refs.announcementEndAt.value);

			if (enabled && !announcementText) {
				showStatus(refs.announcementStatus, 'Banner text is required when announcement is enabled.', 'error');
				setButtonBusy(refs.saveAnnouncementBtn, false);
				return;
			}

			if (startAt && endAt && startAt > endAt) {
				showStatus(refs.announcementStatus, 'End time must be later than start time.', 'error');
				setButtonBusy(refs.saveAnnouncementBtn, false);
				return;
			}

			const payload = {
				text: announcementText,
				type: refs.announcementType.value,
				enabled,
				startAt,
				endAt,
				updatedAt: serverTimestamp()
			};

			try {
				if (refs.announcementDocId.value) {
					await updateDoc(doc(db, 'announcements', refs.announcementDocId.value), payload);
				} else {
					payload.createdAt = serverTimestamp();
					await addDoc(collection(db, 'announcements'), payload);
				}
				resetAnnouncementForm();
				await refreshAnnouncementList();
				showStatus(refs.announcementStatus, enabled ? 'Announcement saved and enabled.' : 'Announcement saved.', 'ok');
			} catch (error) {
				showStatus(refs.announcementStatus, `Unable to save announcement: ${error.message}`, 'error');
			} finally {
				setButtonBusy(refs.saveAnnouncementBtn, false);
			}
		}

		async function refreshNewsletterList() {
			if (!db) return;
			refs.newsletterList.innerHTML = '';
			clearStatus(refs.newsletterLoadStatus);

			try {
				const snap = await getDocs(query(collection(db, 'newsletterSubscribers'), orderBy('subscribedAt', 'desc')));
				const count = snap.size;
				refs.newsletterCount.textContent = `${count} subscriber${count !== 1 ? 's' : ''}`;
				if (refs.newsletterBadge) refs.newsletterBadge.textContent = count;

				if (snap.empty) {
					refs.newsletterList.innerHTML = '<p class="muted">No subscribers yet. Signups from the website will appear here.</p>';
					return;
				}

				snap.forEach((d) => {
					const item = d.data();
					const date = item.subscribedAt?.toDate?.();
					const dateStr = date ? date.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : 'Unknown date';
					const el = document.createElement('div');
					el.className = 'item';
					el.innerHTML = `
						<div class="item-head">
							<h4 style="font-size:0.95rem;">📧 ${mapEscape(item.email || 'Unknown email')}</h4>
							<span class="chip">${dateStr}</span>
						</div>
						<div class="row-actions">
							<button class="btn danger" data-action="delete" data-id="${d.id}">Unsubscribe</button>
						</div>
					`;
					refs.newsletterList.appendChild(el);

					el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
						if (!confirm(`Remove ${item.email} from the newsletter list?`)) return;
						try {
							await deleteDoc(doc(db, 'newsletterSubscribers', d.id));
							showStatus(refs.newsletterLoadStatus, `${item.email} removed.`, 'ok');
							await refreshNewsletterList();
						} catch (err) {
							showStatus(refs.newsletterLoadStatus, `Error: ${err.message}`, 'error');
						}
					});
				});
			} catch (err) {
				showStatus(refs.newsletterLoadStatus, `Unable to load subscribers: ${err.message}`, 'error');
			}
		}

		async function sendNewsletter() {
			if (!db) {
				showStatus(refs.newsletterSendStatus, 'Connect Firebase first.', 'error');
				return;
			}

			const subject = refs.newsletterSubject.value.trim();
			const body = refs.newsletterBodyText.value.trim();

			if (!subject || !body) {
				showStatus(refs.newsletterSendStatus, 'Subject and body are required.', 'error');
				return;
			}

			// Validate EmailJS config
			const ejsCfg = loadEmailjsConfig();
			if (!ejsCfg.serviceId || !ejsCfg.templateId || !ejsCfg.publicKey) {
				showStatus(refs.newsletterSendStatus, 'EmailJS not configured — fill in Service ID, Template ID and Public Key above and click Save.', 'error');
				return;
			}

			// Load all subscribers
			let subscribers = [];
			try {
				const snap = await getDocs(collection(db, 'newsletterSubscribers'));
				snap.forEach(d => {
					const email = d.data().email;
					if (email) subscribers.push(email);
				});
			} catch (err) {
				showStatus(refs.newsletterSendStatus, `Failed to load subscribers: ${err.message}`, 'error');
				return;
			}

			if (subscribers.length === 0) {
				showStatus(refs.newsletterSendStatus, 'No subscribers to send to.', 'warn');
				return;
			}

			if (!confirm(`Send this newsletter to ${subscribers.length} subscriber${subscribers.length !== 1 ? 's' : ''} via EmailJS?`)) return;

			setButtonBusy(refs.sendNewsletterBtn, true, `Sending to ${subscribers.length}…`);
			clearStatus(refs.newsletterSendStatus);

			emailjs.init({ publicKey: ejsCfg.publicKey });

			let sent = 0;
			let failed = 0;

			for (const email of subscribers) {
				try {
					await emailjs.send(ejsCfg.serviceId, ejsCfg.templateId, {
						to_email: email,
						subject: subject,
						message: body,
						from_name: 'MAP Newsletter'
					});
					sent++;
				} catch (err) {
					console.error(`EmailJS failed for ${email}:`, err);
					failed++;
				}
			}

			// Log the send in Firestore
			try {
				await addDoc(collection(db, 'newsletterSends'), {
					subject,
					body,
					deliveryMode: 'emailjs',
					recipientCount: subscribers.length,
					sentCount: sent,
					failedCount: failed,
					sentAt: serverTimestamp()
				});
			} catch { /* non-critical */ }

			setButtonBusy(refs.sendNewsletterBtn, false);

			if (failed === 0) {
				showStatus(refs.newsletterSendStatus, `Sent ${sent} email${sent !== 1 ? 's' : ''} successfully.`, 'ok');
			} else {
				showStatus(refs.newsletterSendStatus, `Sent: ${sent}, Failed: ${failed}. Check the browser console for any delivery errors.`, 'warn');
			}
		}

		function exportSubscribersCSV() {
			const items = [...refs.newsletterList.querySelectorAll('.item h4')].map(el => el.textContent.replace('📧 ', '').trim());
			if (items.length === 0) {
				alert('No subscribers to export.');
				return;
			}
			const csv = 'Email\n' + items.join('\n');
			const blob = new Blob([csv], { type: 'text/csv' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `newsletter-subscribers-${new Date().toISOString().slice(0,10)}.csv`;
			a.click();
			URL.revokeObjectURL(url);
		}

		function wireEvents() {
			refs.themeToggle?.addEventListener('click', () => {
				applyTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
			});

			refs.tabButtons.forEach((button) => {
				button.addEventListener('click', () => {
					setActiveTab(button.dataset.tab);
				});
			});

			refs.sidebarLinks.forEach((link) => {
				link.addEventListener('click', (event) => {
					event.preventDefault();
					const targetId = link.dataset.target;
					const target = document.getElementById(targetId);
					if (!target) return;
					const linkedTab = target.dataset.tab || 'content';
					setActiveTab(linkedTab);
					setActiveSidebarLink(targetId);
					target.scrollIntoView({ behavior: 'smooth', block: 'start' });
				});
			});

			refs.saveFirebaseConfigBtn.addEventListener('click', () => {
				const cfg = withDefaultConfig(getConfigFromForm());
				setConfigToForm(cfg);
				localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
				showStatus(refs.firebaseStatus, 'Firebase config saved locally.', 'info');
			});

			refs.copyFirebaseConfigBtn.addEventListener('click', async () => {
				try {
					const cfg = withDefaultConfig(getConfigFromForm());
					await navigator.clipboard.writeText(JSON.stringify(cfg, null, 2));
					showStatus(refs.firebaseStatus, 'Firebase JSON copied to clipboard.', 'ok');
				} catch (error) {
					showStatus(refs.firebaseStatus, `Copy failed: ${error.message}`, 'error');
				}
			});

			refs.connectFirebaseBtn.addEventListener('click', connectFirebase);

			refs.clearFirebaseConfigBtn.addEventListener('click', () => {
				localStorage.removeItem(STORAGE_KEY);
				setConfigToForm(DEFAULT_FIREBASE_CONFIG);
				setConnectionState(false, 'Disconnected');
				showStatus(refs.firebaseStatus, 'Saved config removed. Default config restored.', 'warning');
			});

			refs.saveSearchBtn.addEventListener('click', saveSearchItem);
			refs.newSearchBtn.addEventListener('click', () => {
				refs.searchForm.reset();
				refs.searchDocId.value = '';
				refs.searchIcon.value = '🔎';
				clearStatus(refs.searchStatus);
			});

			refs.saveAdvisorBtn.addEventListener('click', saveAdvisor);
			refs.newAdvisorBtn.addEventListener('click', () => {
				refs.advisorForm.reset();
				refs.advisorDocId.value = '';
				refs.advisorSpecialty.value = 'Mortgage Protection';
				document.getElementById('specialtyOtherField').style.display = 'none';
				refs.advisorActive.value = 'true';
				refs.advisorImagePreview.style.display = 'none';
				refs.advisorQRPreview.style.display = 'none';
				document.getElementById('advisorFormTitle').textContent = '➕ New Advisor';
				if (refs.deleteAdvisorBtn) refs.deleteAdvisorBtn.style.display = 'none';
				document.querySelectorAll('#advisorPeopleGrid .adm-person-card').forEach(c => c.classList.remove('selected'));
				clearStatus(refs.advisorStatus);
			});
			refs.restoreDefaultsBtn.addEventListener('click', restoreDefaultAdvisors);
			refs.deleteAdvisorBtn.addEventListener('click', async () => {
				const docId = refs.advisorDocId.value;
				if (!docId) return;
				if (!confirm('Delete this advisor\'s Firebase data? Built-in advisors will still appear on the website.')) return;
				try {
					await deleteDoc(doc(db, 'advisors', docId));
					refs.advisorDocId.value = '';
					document.getElementById('advisorFormTitle').textContent = '➕ New Advisor';
					refs.deleteAdvisorBtn.style.display = 'none';
					refs.advisorForm.reset();
					refs.advisorImagePreview.style.display = 'none';
					refs.advisorQRPreview.style.display = 'none';
					showStatus(refs.advisorStatus, 'Firebase data deleted. Built-in card unchanged on website.', 'ok');
					await refreshAdvisorList();
				} catch (error) {
					showStatus(refs.advisorStatus, `Delete failed: ${error.message}`, 'error');
				}
			});
			refs.advisorImage.addEventListener('change', () => {
				const file = refs.advisorImage.files[0];
				if (file) {
					const reader = new FileReader();
					reader.onload = e => {
						refs.advisorImagePreview.src = e.target.result;
						refs.advisorImagePreview.style.display = 'block';
					};
					reader.readAsDataURL(file);
				}
			});
			refs.advisorQR.addEventListener('change', () => {
				const file = refs.advisorQR.files[0];
				if (file) {
					const reader = new FileReader();
					reader.onload = e => {
						refs.advisorQRPreview.src = e.target.result;
						refs.advisorQRPreview.style.display = 'block';
					};
					reader.readAsDataURL(file);
				}
			});
			refs.saveTeamBtn.addEventListener('click', saveTeamMember);
			refs.deleteTeamBtn.addEventListener('click', async () => {
				const docId = refs.teamDocId.value;
				if (!docId) return;
				if (!confirm('Delete this team member\'s Firebase data? Core members will still appear on the website.')) return;
				try {
					await deleteDoc(doc(db, 'teamMembers', docId));
					refs.teamDocId.value = '';
					document.getElementById('teamFormTitle').textContent = '➕ New Team Member';
					refs.deleteTeamBtn.style.display = 'none';
					refs.teamForm.reset();
					refs.teamImagePreview.style.display = 'none';
					showStatus(refs.teamStatus, 'Firebase data deleted. Core member unchanged on website.', 'ok');
					await refreshTeamList();
				} catch (error) {
					showStatus(refs.teamStatus, `Delete failed: ${error.message}`, 'error');
				}
			});
			refs.newTeamBtn.addEventListener('click', () => {
				refs.teamForm.reset();
				refs.teamDocId.value = '';
				refs.teamActive.value = 'true';
				refs.teamImagePreview.style.display = 'none';
				const roleOtherField = document.getElementById('teamRoleOtherField');
				if (roleOtherField) roleOtherField.style.display = 'none';
				document.getElementById('teamFormTitle').textContent = '➕ New Team Member';
				if (refs.deleteTeamBtn) refs.deleteTeamBtn.style.display = 'none';
				document.querySelectorAll('#teamPeopleGrid .adm-person-card').forEach(c => c.classList.remove('selected'));
				clearStatus(refs.teamStatus);
			});
			refs.teamImage.addEventListener('change', () => {
				const file = refs.teamImage.files[0];
				if (file) {
					const reader = new FileReader();
					reader.onload = e => {
						refs.teamImagePreview.src = e.target.result;
						refs.teamImagePreview.style.display = 'block';
					};
					reader.readAsDataURL(file);
				}
			});

			refs.saveReviewBtn.addEventListener('click', saveReview);
			refs.newReviewBtn.addEventListener('click', () => {
				refs.reviewForm.reset();
				refs.reviewDocId.value = '';
				refs.reviewRating.value = 5;
				refs.reviewApproved.value = 'true';
				clearStatus(refs.reviewStatus);
				updateReviewPreview();
			});

			[refs.reviewName, refs.reviewSource, refs.reviewLink, refs.reviewRating, refs.reviewTag, refs.reviewText].forEach((el) => {
				el.addEventListener('input', updateReviewPreview);
			});

			refs.reviewText.addEventListener('keydown', (event) => {
				if (event.ctrlKey && event.key === 'Enter') {
					event.preventDefault();
					saveReview();
				}
			});

			refs.saveAnnouncementBtn.addEventListener('click', () => saveAnnouncement(null));
			refs.newAnnouncementBtn.addEventListener('click', () => {
				resetAnnouncementForm();
				clearStatus(refs.announcementStatus);
			});
			refs.clearAnnouncementBtn.addEventListener('click', async () => {
				if (!refs.announcementDocId.value) {
					refs.announcementEnabled.value = 'false';
					showStatus(refs.announcementStatus, 'Load an announcement from the list first, then disable it.', 'warning');
					return;
				}
				refs.announcementEnabled.value = 'false';
				await saveAnnouncement(false);
			});

			refs.saveNewsBtn.addEventListener('click', saveNewsItem);
			refs.newNewsBtn.addEventListener('click', () => {
				refs.newsForm.reset();
				refs.newsDocId.value = '';
				refs.newsImagePreview.style.display = 'none';
				clearStatus(refs.newsStatus);
			});
			refs.newsImageFile.addEventListener('change', () => {
				const file = refs.newsImageFile.files[0];
				if (file) {
					const reader = new FileReader();
					reader.onload = e => {
						refs.newsImagePreview.src = e.target.result;
						refs.newsImagePreview.style.display = 'block';
					};
					reader.readAsDataURL(file);
				}
			});

			// Newsletter events
			refs.previewNewsletterBtn.addEventListener('click', () => {
				const subject = refs.newsletterSubject.value.trim();
				const body = refs.newsletterBodyText.value.trim();
				if (!subject && !body) {
					showStatus(refs.newsletterSendStatus, 'Write a subject and body first.', 'warn');
					return;
				}
				refs.previewSubjectLine.textContent = subject || '(No subject)';
				refs.previewBodyContent.textContent = body || '(No content)';
				refs.newsletterPreviewPanel.style.display = 'block';
				refs.newsletterPreviewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
				clearStatus(refs.newsletterSendStatus);
			});

			refs.sendNewsletterBtn.addEventListener('click', sendNewsletter);
			refs.saveEmailjsConfigBtn.addEventListener('click', saveEmailjsConfigToStorage);
			populateEmailjsConfigForm();

			refs.clearComposeBtn.addEventListener('click', () => {
				refs.newsletterComposeForm.reset();
				refs.newsletterPreviewPanel.style.display = 'none';
				clearStatus(refs.newsletterSendStatus);
			});

			refs.exportSubscribersBtn.addEventListener('click', exportSubscribersCSV);
		}

		async function boot() {
			wireEvents();

			applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark');
			setActiveTab(localStorage.getItem(TAB_STORAGE_KEY) || 'content');
			setActiveSidebarLink('firebase-section');
			document.documentElement.dataset.panelReady = '1';

			// Always load the hardcoded default config; merge any localStorage overrides on top
			let cfg = DEFAULT_FIREBASE_CONFIG;
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				try { cfg = withDefaultConfig(JSON.parse(saved)); } catch { /* ignore corrupt data */ }
			}
			setConfigToForm(cfg);
			localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));

			updateReviewPreview();
			resetAnnouncementForm();
			await connectFirebase();
		}

		boot();
	</script>

<script>
	/* MAP sign-in integration: sign out, change password, keep the sidebar in step with the tabs. */
	(function () {
		function mapApi(action, body) {
			return fetch('{{CRM_BASE}}api.php?action=' + encodeURIComponent(action), {
				method: 'POST', credentials: 'same-origin', cache: 'no-store',
				headers: { 'X-MAP-CRM': '1', 'Content-Type': 'application/json', 'Accept': 'application/json' },
				body: JSON.stringify(body || {})
			}).then(function (r) { return r.json().catch(function () { return { ok: false, message: 'Something went wrong.' }; }); });
		}
		document.getElementById('mapSignOutBtn').addEventListener('click', function () {
			mapApi('logout').finally(function () { location.href = '{{CRM_BASE}}'; });
		});
		var layer = document.getElementById('mapPwLayer'), form = document.getElementById('mapPwForm'), st = document.getElementById('mapPwStatus');
		function msg(text, type) { st.textContent = text; st.className = 'status show ' + type; }
		document.getElementById('mapChangePwBtn').addEventListener('click', function () { form.reset(); st.className = 'status'; layer.classList.add('show'); document.getElementById('mapPwCur').focus(); });
		document.getElementById('mapPwCancel').addEventListener('click', function () { layer.classList.remove('show'); });
		layer.addEventListener('mousedown', function (e) { if (e.target === layer) layer.classList.remove('show'); });
		document.addEventListener('keydown', function (e) { if (e.key === 'Escape') layer.classList.remove('show'); });
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var cur = document.getElementById('mapPwCur').value, nw = document.getElementById('mapPwNew').value, nw2 = document.getElementById('mapPwNew2').value;
			if (nw.length < 8 || !/[a-z]/.test(nw) || !/[A-Z]/.test(nw) || !/\d/.test(nw)) { msg('Use at least 8 characters with upper and lower case letters and a number.', 'error'); return; }
			if (nw !== nw2) { msg('The two new passwords do not match.', 'error'); return; }
			mapApi('changePassword', { current_password: cur, new_password: nw }).then(function (r) {
				if (r && r.ok) { msg(r.message || 'Password changed.', 'ok'); setTimeout(function () { layer.classList.remove('show'); }, 1400); }
				else if (r && r.code === 'signed_out') { location.href = '{{CRM_BASE}}?next=website-admin'; }
				else { msg((r && r.message) || 'Could not change the password.', 'error'); }
			});
		});
		// Highlight the sidebar link for the section that is showing, and close the menu on phones.
		function syncSidebar() {
			var links = document.querySelectorAll('.sidebar-link[data-target]');
			var visible = null;
			links.forEach(function (l) {
				var s = document.getElementById(l.dataset.target);
				if (!visible && s && !s.classList.contains('is-hidden')) visible = l;
			});
			if (visible) links.forEach(function (l) { l.classList.toggle('active', l === visible); });
		}
		document.addEventListener('DOMContentLoaded', syncSidebar);
		document.querySelectorAll('#dashboardTabs .tab-btn').forEach(function (b) { b.addEventListener('click', function () { setTimeout(syncSidebar, 0); }); });
		document.querySelectorAll('.sidebar-link[data-target]').forEach(function (l) {
			l.addEventListener('click', function () {
				var tab = (document.getElementById(l.dataset.target) || {}).dataset;
				document.querySelectorAll('#dashboardTabs .tab-btn').forEach(function (b) { b.classList.toggle('active', tab && b.dataset.tab === tab.tab); });
				adminSidebar.classList.remove('open'); sidebarOverlay.classList.remove('show');
			});
		});
	})();
</script>
<script src="{{CRM_BASE}}js/website-logins.js" data-api="{{CRM_BASE}}api.php" data-signin="{{CRM_BASE}}"></script>
</body>
</html>

MAP_ADMIN_PANEL_HTML;
$crm_e = function ($s) {
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
};
echo strtr($crm_admin_html, [
    '{{USER_NAME}}' => $crm_e($crm_admin_name),
    '{{USER_INITIALS}}' => $crm_e($crm_admin_initials),
    '{{CRM_BASE}}' => $crm_e(crm_cookie_path()),
    '{{WEBSITE_BASE}}' => $crm_e(CRM_WEBSITE_BASE),
]);
