/* Quotewright — admin account approval page.
   Visible ONLY to an active admin (auth_is_admin()). Lists account_profiles
   (pending first), lets an admin assign a tenant + role and activate / suspend
   each account. Writes go through the account_profiles admin-only RLS update policy;
   the frontend never grants access on its own — RLS is the real gate.

   No inline scripts (site CSP is script-src 'self'). Degrades gracefully when the
   tenancy SQL (quotewright-tenancy.sql / PR #13) hasn't been applied yet: instead of
   crashing it shows a "run the migration" empty state. */
(function () {
  "use strict";

  var el = function (id) { return document.getElementById(id); };
  var cfg = window.QW_CONFIG || {};
  var sb = null;
  var tenants = [];    // [{owner, name}]
  var profiles = [];   // [{user_id, email, created_at, owner, role, status}]

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fmtDate(s) {
    if (!s) return "—";
    var d = new Date(s);
    return isNaN(d) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  var toastTimer = null;
  function toast(msg, bad) {
    var t = el("toast"); if (!t) return;
    t.textContent = msg;
    t.className = "qc-toast show" + (bad ? " bad" : "");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "qc-toast" + (bad ? " bad" : ""); }, 2800);
  }

  var boot = el("bootError");
  var configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_ANON_KEY.indexOf("PASTE_") !== 0;
  if (!configured) {
    if (boot) { boot.hidden = false; boot.textContent = "Not configured: set SUPABASE_ANON_KEY in dashboard-config.js."; }
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    if (boot) { boot.hidden = false; boot.textContent = "Could not load the Supabase client library (vendor/supabase.js)."; }
    return;
  }

  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  el("logoutBtn").addEventListener("click", function () { sb.auth.signOut().then(showGate, showGate); });
  el("refreshBtn").addEventListener("click", load);
  el("newTenantBtn").addEventListener("click", function () { toggleNewTenant(true); });
  el("ntCancel").addEventListener("click", function () { toggleNewTenant(false); });
  el("newTenantForm").addEventListener("submit", createTenant);
  el("ntName").addEventListener("input", function () {
    var key = el("ntKey");
    if (key && !key.getAttribute("data-touched")) key.value = slug(el("ntName").value);
  });
  el("ntKey").addEventListener("input", function () { el("ntKey").setAttribute("data-touched", "1"); });

  el("acctBody").addEventListener("change", function (e) {
    var t = e.target;
    if (t.classList && (t.classList.contains("ad-tenant") || t.classList.contains("ad-role"))) {
      var tr = t.closest("tr[data-uid]"); if (tr) refreshDirty(tr);
    }
  });
  el("acctBody").addEventListener("click", function (e) {
    var save = e.target.closest ? e.target.closest("[data-save]") : null;
    if (save) { var tr1 = save.closest("tr[data-uid]"); onSave(tr1, null, save); return; }
    var tog = e.target.closest ? e.target.closest("[data-toggle]") : null;
    if (tog) { var tr2 = tog.closest("tr[data-uid]"); onSave(tr2, tog.getAttribute("data-toggle") === "activate" ? "active" : "suspended", tog); return; }
  });

  // ── auth / routing ──────────────────────────────────────────────────────────
  sb.auth.onAuthStateChange(function (evt, session) {
    if (evt === "SIGNED_OUT") { showGate(); return; }
    if (session && session.user) route(session);
  });
  sb.auth.getSession().then(function (res) {
    var s = res.data && res.data.session;
    if (s && s.user) route(s); else showGate();
  });

  function route(session) {
    var email = (session.user && session.user.email) || "";
    QWTenancy.resolve(sb).then(function (p) {
      if (p.anon) { showGate(); return; }
      if (p.degraded) { showAdmin(email); load(); return; } // will show the "run SQL" empty state
      if (!p.isAdmin) { showDenied(email); return; }
      showAdmin(email); load();
    }, function () { showDenied(email); });
  }

  function showGate() {
    el("gateView").hidden = false; el("deniedView").hidden = true; el("adminView").hidden = true;
    el("subnav").hidden = true; el("logoutBtn").hidden = true; el("whoami").textContent = "";
  }
  function showDenied(email) {
    el("gateView").hidden = true; el("deniedView").hidden = false; el("adminView").hidden = true;
    el("deniedEmail").textContent = email || "";
    el("subnav").hidden = true; el("logoutBtn").hidden = false; el("whoami").textContent = email || "";
  }
  function showAdmin(email) {
    el("gateView").hidden = true; el("deniedView").hidden = true; el("adminView").hidden = false;
    el("subnav").hidden = false; el("logoutBtn").hidden = false; el("whoami").textContent = email || "";
  }

  // ── data ──────────────────────────────────────────────────────────────────
  function load() {
    hideErr();
    el("adminEmpty").hidden = true;
    Promise.all([
      sb.from("tenants").select("owner,name").order("name", { ascending: true }),
      sb.from("account_profiles").select("user_id,email,owner,role,status,created_at")
    ]).then(function (r) {
      var tRes = r[0], pRes = r[1];
      if ((tRes.error && QWTenancy.isMissingTable(tRes.error)) ||
          (pRes.error && QWTenancy.isMissingTable(pRes.error))) {
        emptyState("Multi-tenant admin isn’t enabled yet",
          "Run <code>quotewright-tenancy.sql</code> in the Supabase SQL editor to create the accounts &amp; tenants tables, then reload this page.");
        return;
      }
      if (pRes.error) { showErr(pRes.error.message); return; }
      tenants = (tRes && !tRes.error && tRes.data) ? tRes.data : [];
      profiles = pRes.data || [];
      render();
    }, function (err) { showErr((err && err.message) || "Network error."); });
  }

  var STATUS_RANK = { pending: 0, suspended: 1, active: 2 };
  function render() {
    var counts = { pending: 0, active: 0, suspended: 0 };
    profiles.forEach(function (p) { if (counts[p.status] != null) counts[p.status]++; });
    el("adCounts").innerHTML =
      chip(counts.pending, "pending", "Pending") +
      chip(counts.active, "active", "Active") +
      chip(counts.suspended, "suspended", "Suspended");

    if (!profiles.length) {
      el("acctBody").innerHTML = "";
      emptyState("No accounts yet", "When someone signs up on the console, they’ll appear here for approval.");
      return;
    }
    el("adminEmpty").hidden = true;

    var sorted = profiles.slice().sort(function (a, b) {
      var ra = STATUS_RANK[a.status] != null ? STATUS_RANK[a.status] : 3;
      var rb = STATUS_RANK[b.status] != null ? STATUS_RANK[b.status] : 3;
      if (ra !== rb) return ra - rb;
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    });

    el("acctBody").innerHTML = sorted.map(rowHtml).join("");
  }

  function chip(n, kind, label) {
    return '<span class="ad-count ad-' + kind + '"><b>' + n + '</b> ' + esc(label) + '</span>';
  }

  function tenantOptions(selected) {
    var opts = '<option value="">— Unassigned —</option>';
    var found = false;
    tenants.forEach(function (t) {
      var sel = t.owner === selected;
      if (sel) found = true;
      opts += '<option value="' + esc(t.owner) + '"' + (sel ? " selected" : "") + '>' +
        esc(t.name || t.owner) + '</option>';
    });
    // If the profile references a tenant not in the list (edge), keep it visible.
    if (selected && !found) opts += '<option value="' + esc(selected) + '" selected>' + esc(selected) + '</option>';
    return opts;
  }
  function roleOptions(role) {
    return ['member', 'admin'].map(function (r) {
      return '<option value="' + r + '"' + (r === role ? " selected" : "") + '>' +
        (r === "admin" ? "Admin" : "Member") + '</option>';
    }).join("");
  }

  function rowHtml(p) {
    var isActive = p.status === "active";
    var toggle = isActive
      ? '<button type="button" class="btn btn-ghost btn-sm ad-suspend" data-toggle="suspend">Suspend</button>'
      : '<button type="button" class="btn btn-primary btn-sm ad-activate" data-toggle="activate">Activate</button>';
    return '<tr data-uid="' + esc(p.user_id) + '" data-owner="' + esc(p.owner || "") + '" data-role="' + esc(p.role || "member") + '">' +
      '<td data-label="Account"><div class="ad-acct"><span class="ad-email">' + esc(p.email || "—") + '</span>' +
        '<span class="ad-created">Joined ' + esc(fmtDate(p.created_at)) + '</span></div></td>' +
      '<td data-label="Tenant"><select class="qc-select ad-tenant" aria-label="Tenant">' + tenantOptions(p.owner) + '</select></td>' +
      '<td data-label="Role"><select class="qc-select ad-role" aria-label="Role">' + roleOptions(p.role || "member") + '</select></td>' +
      '<td data-label="Status"><span class="pill ad-pill ad-pill-' + esc(p.status) + '">' + esc(p.status) + '</span></td>' +
      '<td class="ad-col-act" data-label="Action"><div class="ad-acts">' +
        '<button type="button" class="btn btn-ghost btn-sm ad-save" data-save disabled>Save</button>' +
        toggle +
      '</div></td>' +
    '</tr>';
  }

  function refreshDirty(tr) {
    var owner = tr.querySelector(".ad-tenant").value;
    var role = tr.querySelector(".ad-role").value;
    var dirty = owner !== (tr.getAttribute("data-owner") || "") || role !== (tr.getAttribute("data-role") || "member");
    var save = tr.querySelector(".ad-save");
    if (save) save.disabled = !dirty;
  }

  // status=null → keep current status (a "Save" of tenant/role only).
  function onSave(tr, status, btn) {
    if (!tr) return;
    var uid = tr.getAttribute("data-uid");
    var owner = tr.querySelector(".ad-tenant").value || null;
    var role = tr.querySelector(".ad-role").value || "member";
    var prof = findProfile(uid);
    var newStatus = status || (prof ? prof.status : "pending");

    if (newStatus === "active" && !owner) {
      toast("Assign a tenant before activating this account.", true);
      return;
    }

    var acts = tr.querySelectorAll("button");
    Array.prototype.forEach.call(acts, function (b) { b.disabled = true; });
    var label = btn ? btn.textContent : "";
    if (btn) btn.textContent = "Saving…";

    sb.from("account_profiles")
      .update({ owner: owner, role: role, status: newStatus, updated_at: new Date().toISOString() })
      .eq("user_id", uid)
      .select()
      .then(function (res) {
        if (btn) btn.textContent = label;
        if (res.error) { toast(res.error.message, true); reenable(tr); return; }
        if (!res.data || !res.data.length) {
          // RLS returned no row → the write wasn't allowed (not admin / policy off).
          toast("That change wasn’t saved — you may not have admin rights.", true);
          reenable(tr); return;
        }
        // update local model + re-render this row cleanly
        if (prof) { prof.owner = owner; prof.role = role; prof.status = newStatus; }
        else profiles.push(res.data[0]);
        toast(newStatus === "active" ? "Account activated." : newStatus === "suspended" ? "Account suspended." : "Changes saved.");
        render();
      }, function () {
        if (btn) btn.textContent = label;
        toast("Network error — try again.", true);
        reenable(tr);
      });
  }
  function reenable(tr) {
    var acts = tr.querySelectorAll("button");
    Array.prototype.forEach.call(acts, function (b) { b.disabled = false; });
    refreshDirty(tr);
  }
  function findProfile(uid) {
    for (var i = 0; i < profiles.length; i++) if (profiles[i].user_id === uid) return profiles[i];
    return null;
  }

  // ── new tenant ──────────────────────────────────────────────────────────────
  function slug(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40);
  }
  function toggleNewTenant(on) {
    var f = el("newTenantForm");
    f.hidden = !on;
    el("ntError").textContent = "";
    if (on) { el("ntName").value = ""; el("ntKey").value = ""; el("ntKey").removeAttribute("data-touched"); el("ntName").focus(); }
  }
  function createTenant(e) {
    e.preventDefault();
    var err = el("ntError"); err.textContent = "";
    var name = el("ntName").value.trim();
    var key = el("ntKey").value.trim();
    if (!name) { err.textContent = "Give the company a name."; return; }
    if (!/^[a-z0-9][a-z0-9_-]{1,40}$/.test(key)) { err.textContent = "Tenant key: lowercase letters/numbers, no spaces (2–41 chars)."; return; }
    if (tenants.some(function (t) { return t.owner === key; })) { err.textContent = "That tenant key already exists."; return; }
    var btn = el("ntSave"); btn.disabled = true; btn.textContent = "Creating…";
    sb.from("tenants").insert({ owner: key, name: name }).select().then(function (res) {
      btn.disabled = false; btn.textContent = "Create tenant";
      if (res.error) { err.textContent = res.error.message; return; }
      var row = (res.data && res.data[0]) || { owner: key, name: name };
      tenants.push(row);
      tenants.sort(function (a, b) { return (a.name || a.owner).localeCompare(b.name || b.owner); });
      toggleNewTenant(false);
      toast("Tenant “" + name + "” created.");
      render(); // refresh every row's dropdown
    }, function () { btn.disabled = false; btn.textContent = "Create tenant"; err.textContent = "Network error."; });
  }

  // ── empty / error ────────────────────────────────────────────────────────────
  function emptyState(title, body) {
    var e = el("adminEmpty");
    e.hidden = false;
    e.innerHTML = '<div class="ad-empty-inner"><h3>' + esc(title) + '</h3><p>' + body + '</p></div>';
  }
  function showErr(msg) { var e = el("adminError"); e.hidden = false; e.textContent = msg || "Something went wrong."; }
  function hideErr() { el("adminError").hidden = true; }
})();
