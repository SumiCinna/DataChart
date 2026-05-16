<?php
// index.php  –  Landing / Marketing page
require_once 'includes/db.php';

startSession();

// Already logged in → skip landing
if (loggedIn()) {
    $role = currentUser()['role'];
    header('Location: ' . ($role === 'admin' ? 'admin.php' : 'dashboard.php'));
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DataChart — Turn Data Into Decisions</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:ital,wght@0,400;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet" />
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['"IBM Plex Sans"', 'sans-serif'],
            mono: ['"IBM Plex Mono"', 'monospace']
          }
        }
      }
    }
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    :root {
      --bg:      #020817;
      --surface: #0f172a;
      --border:  #1e293b;
      --border2: #334155;
      --text:    #f1f5f9;
      --muted:   #64748b;
      --accent:  #3b82f6;
      --accent2: #2563eb;
    }

    html { scroll-behavior: smooth; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'IBM Plex Sans', sans-serif;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    /* ─── Grid background ─── */
    .grid-bg {
      position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background-image:
        linear-gradient(rgba(59,130,246,.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(59,130,246,.04) 1px, transparent 1px);
      background-size: 48px 48px;
    }
    .grid-bg::after {
      content: '';
      position: absolute; inset: 0;
      background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(37,99,235,.12) 0%, transparent 70%);
    }

    /* ─── Nav ─── */
    nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 50;
      backdrop-filter: blur(16px);
      background: rgba(2,8,23,.7);
      border-bottom: 1px solid var(--border);
      padding: 0 2rem;
      height: 60px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .nav-logo { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 15px; letter-spacing: -.01em; }
    .logo-icon {
      width: 32px; height: 32px; border-radius: 8px;
      background: var(--accent2);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .nav-links { display: flex; align-items: center; gap: 8px; }
    .nav-link {
      color: #94a3b8; font-size: 13px; font-weight: 600;
      padding: 6px 14px; border-radius: 7px;
      text-decoration: none;
      transition: color .15s, background .15s;
    }
    .nav-link:hover { color: var(--text); background: var(--surface); }
    .nav-cta {
      background: var(--accent2); color: #fff;
      font-size: 13px; font-weight: 700;
      padding: 7px 18px; border-radius: 7px;
      text-decoration: none;
      transition: background .15s;
    }
    .nav-cta:hover { background: var(--accent); }

    /* ─── Hero ─── */
    .hero {
      position: relative; z-index: 1;
      min-height: 100vh;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      text-align: center;
      padding: 100px 24px 60px;
    }
    .hero-badge {
      display: inline-flex; align-items: center; gap: 7px;
      background: rgba(37,99,235,.12);
      border: 1px solid rgba(59,130,246,.25);
      color: #93c5fd;
      font-size: 11px; font-weight: 600;
      letter-spacing: .06em; text-transform: uppercase;
      padding: 5px 14px; border-radius: 99px;
      margin-bottom: 28px;
    }
    .hero-badge span { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #3b82f6; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

    .hero h1 {
      font-size: clamp(2.6rem, 7vw, 5.5rem);
      font-weight: 800;
      letter-spacing: -.04em;
      line-height: 1.05;
      max-width: 900px;
      margin-bottom: 24px;
    }
    .hero h1 em {
      font-style: normal;
      background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #818cf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .hero p {
      font-size: clamp(1rem, 2vw, 1.2rem);
      color: #94a3b8;
      max-width: 520px;
      line-height: 1.7;
      margin-bottom: 40px;
    }
    .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
    .btn-hero-primary {
      background: var(--accent2); color: #fff;
      font-weight: 700; font-size: 14px;
      padding: 12px 28px; border-radius: 9px;
      text-decoration: none;
      transition: background .15s, transform .1s;
      box-shadow: 0 0 40px rgba(37,99,235,.3);
    }
    .btn-hero-primary:hover { background: var(--accent); transform: translateY(-1px); }
    .btn-hero-secondary {
      background: var(--surface); color: var(--text);
      font-weight: 600; font-size: 14px;
      padding: 12px 28px; border-radius: 9px;
      border: 1px solid var(--border2);
      text-decoration: none;
      transition: border-color .15s, transform .1s;
    }
    .btn-hero-secondary:hover { border-color: var(--accent); transform: translateY(-1px); }

    /* ─── Chart preview strip ─── */
    .preview-strip {
      position: relative; z-index: 1;
      max-width: 860px; margin: 0 auto 80px;
      padding: 0 24px;
    }
    .preview-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px 24px;
      box-shadow: 0 40px 80px rgba(0,0,0,.5);
    }
    .preview-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
    }
    .preview-title { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .07em; }
    .preview-dot { width: 6px; height: 6px; border-radius: 50%; }
    .chart-bars {
      display: flex; align-items: flex-end; gap: 6px;
      height: 80px;
    }
    .bar {
      flex: 1; border-radius: 4px 4px 0 0;
      background: linear-gradient(to top, #1e40af, #3b82f6);
      transition: height .3s ease;
      min-width: 0;
    }
    .bar.dim { background: linear-gradient(to top, #1e293b, #334155); }
    .bar.hi  { background: linear-gradient(to top, #1d4ed8, #60a5fa); box-shadow: 0 0 16px rgba(96,165,250,.4); }

    /* ─── Features ─── */
    .section { position: relative; z-index: 1; padding: 80px 24px; max-width: 1080px; margin: 0 auto; }
    .section-label {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em;
      color: #3b82f6; margin-bottom: 12px;
    }
    .section-title {
      font-size: clamp(1.8rem, 4vw, 2.8rem);
      font-weight: 800; letter-spacing: -.035em; line-height: 1.1;
      margin-bottom: 16px;
    }
    .section-sub { color: #64748b; font-size: 1rem; line-height: 1.7; max-width: 480px; }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      margin-top: 48px;
    }
    .feature-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      transition: border-color .2s, transform .2s;
    }
    .feature-card:hover { border-color: rgba(59,130,246,.4); transform: translateY(-2px); }
    .feature-icon {
      width: 40px; height: 40px; border-radius: 10px;
      background: rgba(37,99,235,.12);
      border: 1px solid rgba(59,130,246,.2);
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 16px;
    }
    .feature-name { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
    .feature-desc { font-size: 13px; color: #64748b; line-height: 1.6; }

    /* ─── Roles ─── */
    .roles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 16px;
      margin-top: 48px;
    }
    .role-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
    }
    .role-chip {
      display: inline-block;
      font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
      padding: 3px 10px; border-radius: 99px;
      margin-bottom: 14px;
    }
    .chip-admin  { background: rgba(220,38,38,.12);  color: #fca5a5; border: 1px solid rgba(220,38,38,.2); }
    .chip-staff  { background: rgba(37,99,235,.12);  color: #93c5fd; border: 1px solid rgba(59,130,246,.2); }
    .chip-boss   { background: rgba(234,179,8,.1);   color: #fde68a; border: 1px solid rgba(234,179,8,.2); }
    .role-name   { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
    .role-desc   { font-size: 13px; color: #64748b; line-height: 1.6; }

    /* ─── CTA section ─── */
    .cta-section {
      position: relative; z-index: 1;
      text-align: center;
      padding: 80px 24px 100px;
    }
    .cta-box {
      max-width: 600px; margin: 0 auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 48px 40px;
      position: relative; overflow: hidden;
    }
    .cta-box::before {
      content: '';
      position: absolute; top: -40px; left: 50%; transform: translateX(-50%);
      width: 300px; height: 200px;
      background: radial-gradient(ellipse, rgba(37,99,235,.2) 0%, transparent 70%);
      pointer-events: none;
    }
    .cta-box h2 { font-size: 2rem; font-weight: 800; letter-spacing: -.03em; margin-bottom: 12px; }
    .cta-box p  { color: #64748b; font-size: 14px; line-height: 1.7; margin-bottom: 32px; }
    .cta-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

    /* ─── Footer ─── */
    footer {
      position: relative; z-index: 1;
      border-top: 1px solid var(--border);
      padding: 24px;
      text-align: center;
      color: #334155;
      font-size: 12px;
    }

    /* ─── Scrollbar ─── */
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }

    /* ─── Fade-in on scroll ─── */
    .reveal { opacity: 0; transform: translateY(24px); transition: opacity .6s ease, transform .6s ease; }
    .reveal.visible { opacity: 1; transform: none; }
  </style>
</head>
<body>

<div class="grid-bg"></div>

<!-- ── Nav ── -->
<nav>
  <div class="nav-logo">
    <div class="logo-icon">
      <svg width="16" height="16" viewBox="0 0 13 13" fill="none">
        <rect x="1" y="6" width="2.5" height="6" fill="white" rx="0.5"/>
        <rect x="5" y="3.5" width="2.5" height="8.5" fill="white" rx="0.5"/>
        <rect x="9" y="1" width="2.5" height="11" fill="white" rx="0.5"/>
      </svg>
    </div>
    DataChart
  </div>
  <div class="nav-links">
    <a href="#features" class="nav-link">Features</a>
    <a href="#roles" class="nav-link">Roles</a>
    <a href="login.php" class="nav-link">Sign in</a>
    <a href="register.php" class="nav-cta">Get Access</a>
  </div>
</nav>

<!-- ── Hero ── -->
<section class="hero">
  <div class="hero-badge"><span></span> Role-based data platform</div>
  <h1>Turn data into<br><em>clear decisions</em></h1>
  <p>Upload CSV files, visualise insights in seconds, and control exactly who sees what.</p>
  <div class="hero-actions">
    <a href="register.php" class="btn-hero-primary">Request access →</a>
    <a href="login.php" class="btn-hero-secondary">Sign in</a>
  </div>
</section>

<!-- ── Chart preview ── -->
<div class="preview-strip reveal">
  <div class="preview-card">
    <div class="preview-header">
      <span class="preview-title">Monthly Revenue Overview</span>
      <div style="display:flex;gap:6px;align-items:center">
        <div class="preview-dot" style="background:#3b82f6"></div>
        <span style="font-size:11px;color:#475569">Live</span>
      </div>
    </div>
    <div class="chart-bars" id="demo-bars">
      <?php
      $vals = [45,60,38,72,55,80,68,91,74,85,62,95];
      $max  = max($vals);
      foreach ($vals as $i => $v):
        $pct   = round($v / $max * 100);
        $cls   = $v === $max ? 'hi' : ($v < 50 ? 'dim' : '');
        echo "<div class='bar $cls' style='height:{$pct}%' data-val='$v'></div>\n";
      endforeach;
      ?>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:8px">
      <?php foreach (['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as $m): ?>
        <span style="font-size:9px;color:#475569;font-family:'IBM Plex Mono',monospace"><?= $m ?></span>
      <?php endforeach; ?>
    </div>
  </div>
</div>

<!-- ── Features ── -->
<section class="section" id="features">
  <div class="reveal">
    <div class="section-label">What you get</div>
    <h2 class="section-title">Everything your team needs,<br>nothing it doesn't</h2>
    <p class="section-sub">A focused platform built for teams that want fast insights from CSV data without the enterprise bloat.</p>
  </div>
  <div class="features-grid">
    <?php
    $features = [
      ['📁', 'CSV Upload',        'Drag-and-drop CSV files. Instant parse and preview — no ETL pipeline needed.'],
      ['📊', 'Live Charts',       'Bar, line, and pie charts auto-generated from your data columns.'],
      ['🔐', 'Role-based Access', 'Admin, Staff, and Boss roles with granular visibility controls.'],
      ['✅', 'Approval Workflow', 'New accounts require admin approval before accessing any data.'],
      ['📋', 'Audit Log',         'Every login and action is logged so you always know who did what.'],
      ['⚡', 'Fast & Lightweight','Pure PHP + MySQL — no framework overhead, deploys anywhere.'],
    ];
    foreach ($features as $f): ?>
      <div class="feature-card reveal">
        <div class="feature-icon" style="font-size:18px;line-height:1"><?= $f[0] ?></div>
        <div class="feature-name"><?= $f[1] ?></div>
        <div class="feature-desc"><?= $f[2] ?></div>
      </div>
    <?php endforeach; ?>
  </div>
</section>

<!-- ── Roles ── -->
<section class="section" id="roles" style="padding-top:0">
  <div class="reveal">
    <div class="section-label">Access levels</div>
    <h2 class="section-title">Three roles, clear boundaries</h2>
    <p class="section-sub">Request the access level that fits your job. Admins approve every account before it goes live.</p>
  </div>
  <div class="roles-grid">
    <?php
    $roles = [
      ['chip-admin', 'Admin',  'System Admin',    'Full control — manage users, approve accounts, upload & activate datasets, view all logs.'],
      ['chip-staff', 'Staff',  'Data Staff',      'Upload CSV files and manage datasets. Cannot approve users or access admin settings.'],
      ['chip-boss',  'Boss',   'Read-only Lead',  'View active dashboards and charts. No upload or admin privileges — pure insight consumption.'],
    ];
    foreach ($roles as $r): ?>
      <div class="role-card reveal">
        <div class="role-chip <?= $r[0] ?>"><?= $r[1] ?></div>
        <div class="role-name"><?= $r[2] ?></div>
        <div class="role-desc"><?= $r[3] ?></div>
      </div>
    <?php endforeach; ?>
  </div>
</section>

<!-- ── CTA ── -->
<section class="cta-section">
  <div class="cta-box reveal">
    <h2>Ready to dive in?</h2>
    <p>Sign in with the demo credentials or request access for your team. Setup takes under two minutes.</p>
    <div class="cta-actions">
      <a href="register.php" class="btn-hero-primary">Request access →</a>
      <a href="login.php" class="btn-hero-secondary">Sign in</a>
    </div>
    <p style="margin-top:20px;margin-bottom:0;font-size:11px;color:#334155">
      Demo: <code style="color:#475569">admin</code> / <code style="color:#475569">staff1</code> / <code style="color:#475569">boss1</code> — password: <code style="color:#475569">password</code>
    </p>
  </div>
</section>

<footer>
  &copy; <?= date('Y') ?> DataChart. All rights reserved.
</footer>

<script>
  // Scroll reveal
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  // Animate chart bars on load
  const bars = document.querySelectorAll('.chart-bars .bar');
  bars.forEach((b, i) => {
    const h = b.style.height;
    b.style.height = '0';
    setTimeout(() => { b.style.transition = 'height .5s cubic-bezier(.4,0,.2,1)'; b.style.height = h; }, 400 + i * 50);
  });
</script>
</body>
</html>