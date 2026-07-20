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

  // ── i18n ──────────────────────────────────────────────────────────────────
  var I = window.QWI18n;
  function t(k, v) { return (I && I.t) ? I.t(k, v) : k; }
  if (I && I.add) I.add({
    en: {
      "adm.boot.notConfigured": "Not configured: set SUPABASE_ANON_KEY in dashboard-config.js.",
      "adm.boot.noClient": "Could not load the Supabase client library (vendor/supabase.js).",
      "adm.gate.kicker": "Admin",
      "adm.gate.title": "Sign in required",
      "adm.gate.sub": "This page manages who can access Quotewright. Sign in to the console first, then come back.",
      "adm.gate.cta": "Go to sign in",
      "adm.denied.kicker": "Restricted",
      "adm.denied.title": "Admin access only",
      "adm.denied.sub1": "You’re signed in as",
      "adm.denied.sub2": ", but this page is for administrators. Head back to your quote console.",
      "adm.denied.cta": "Back to the console",
      "adm.kicker": "Accounts",
      "adm.h1": "Approve & assign",
      "adm.lede": "Every new sign-up arrives <b>pending</b>. Connect it to a company, set its role, then activate — that’s what unlocks their console. Nothing is visible to an account until you do.",
      "adm.newTenant": "+ New tenant",
      "adm.nt.name": "Company name",
      "adm.nt.namePh": "e.g. Acme Textiles",
      "adm.nt.key": "Tenant key",
      "adm.nt.keyHint": "Lowercase, no spaces. This is the <code lang=\"en\">owner</code> the pipeline writes with.",
      "adm.nt.create": "Create tenant",
      "adm.nt.creating": "Creating…",
      "adm.nt.errName": "Give the company a name.",
      "adm.nt.errKey": "Tenant key: lowercase letters/numbers, no spaces (2–41 chars).",
      "adm.nt.errExists": "That tenant key already exists.",
      "adm.nt.created": "Tenant “{name}” created.",
      "adm.col.account": "Account",
      "adm.col.tenant": "Tenant",
      "adm.col.role": "Role",
      "adm.col.status": "Status",
      "adm.col.action": "Action",
      "adm.status.pending": "Pending",
      "adm.status.active": "Active",
      "adm.status.suspended": "Suspended",
      "adm.role.member": "Member",
      "adm.role.admin": "Admin",
      "adm.unassigned": "— Unassigned —",
      "adm.suspend": "Suspend",
      "adm.activate": "Activate",
      "adm.saving": "Saving…",
      "adm.joined": "Joined {date}",
      "adm.needTenant": "Assign a tenant before activating this account.",
      "adm.notSaved": "That change wasn’t saved — you may not have admin rights.",
      "adm.activated": "Account activated.",
      "adm.suspendedMsg": "Account suspended.",
      "adm.saved": "Changes saved.",
      "adm.netRetry": "Network error — try again.",
      "adm.empty.migTitle": "Multi-tenant admin isn’t enabled yet",
      "adm.empty.migBody": "Run <code lang=\"en\">quotewright-tenancy.sql</code> in the Supabase SQL editor to create the accounts &amp; tenants tables, then reload this page.",
      "adm.empty.noneTitle": "No accounts yet",
      "adm.empty.noneBody": "When someone signs up on the console, they’ll appear here for approval.",
      "adm.err.generic": "Something went wrong.",
      "adm.err.network": "Network error."
    },
    tr: {
      "adm.boot.notConfigured": "Yapılandırılmadı: dashboard-config.js içinde SUPABASE_ANON_KEY değerini ayarlayın.",
      "adm.boot.noClient": "Supabase istemci kütüphanesi yüklenemedi (vendor/supabase.js).",
      "adm.gate.kicker": "Yönetim",
      "adm.gate.title": "Giriş gerekli",
      "adm.gate.sub": "Bu sayfa Quotewright'a kimlerin erişebileceğini yönetir. Önce konsola giriş yapın, sonra buraya dönün.",
      "adm.gate.cta": "Girişe git",
      "adm.denied.kicker": "Kısıtlı",
      "adm.denied.title": "Yalnızca yönetici erişimi",
      "adm.denied.sub1": "",
      "adm.denied.sub2": " olarak giriş yaptınız; ancak bu sayfa yöneticiler içindir. Teklif konsolunuza geri dönün.",
      "adm.denied.cta": "Konsola geri dön",
      "adm.kicker": "Hesaplar",
      "adm.h1": "Onayla ve ata",
      "adm.lede": "Her yeni kayıt <b>beklemede</b> olarak gelir. Bir şirkete bağlayın, rolünü belirleyin, ardından etkinleştirin — konsollarını açan budur. Siz yapana kadar bir hesaba hiçbir şey görünmez.",
      "adm.newTenant": "+ Yeni kiracı",
      "adm.nt.name": "Şirket adı",
      "adm.nt.namePh": "örn. Acme Textiles",
      "adm.nt.key": "Kiracı anahtarı",
      "adm.nt.keyHint": "Küçük harf, boşluksuz. Akışın yazarken kullandığı <code lang=\"en\">owner</code> değeridir.",
      "adm.nt.create": "Kiracı oluştur",
      "adm.nt.creating": "Oluşturuluyor…",
      "adm.nt.errName": "Şirkete bir ad verin.",
      "adm.nt.errKey": "Kiracı anahtarı: küçük harf/rakam, boşluksuz (2–41 karakter).",
      "adm.nt.errExists": "Bu kiracı anahtarı zaten mevcut.",
      "adm.nt.created": "“{name}” kiracısı oluşturuldu.",
      "adm.col.account": "Hesap",
      "adm.col.tenant": "Kiracı",
      "adm.col.role": "Rol",
      "adm.col.status": "Durum",
      "adm.col.action": "İşlem",
      "adm.status.pending": "Beklemede",
      "adm.status.active": "Etkin",
      "adm.status.suspended": "Askıda",
      "adm.role.member": "Üye",
      "adm.role.admin": "Yönetici",
      "adm.unassigned": "— Atanmamış —",
      "adm.suspend": "Askıya al",
      "adm.activate": "Etkinleştir",
      "adm.saving": "Kaydediliyor…",
      "adm.joined": "Katıldı: {date}",
      "adm.needTenant": "Bu hesabı etkinleştirmeden önce bir kiracı atayın.",
      "adm.notSaved": "Bu değişiklik kaydedilmedi — yönetici yetkiniz olmayabilir.",
      "adm.activated": "Hesap etkinleştirildi.",
      "adm.suspendedMsg": "Hesap askıya alındı.",
      "adm.saved": "Değişiklikler kaydedildi.",
      "adm.netRetry": "Ağ hatası — tekrar deneyin.",
      "adm.empty.migTitle": "Çok kiracılı yönetim henüz etkin değil",
      "adm.empty.migBody": "Hesap ve kiracı tablolarını oluşturmak için Supabase SQL düzenleyicisinde <code lang=\"en\">quotewright-tenancy.sql</code> dosyasını çalıştırın, ardından bu sayfayı yeniden yükleyin.",
      "adm.empty.noneTitle": "Henüz hesap yok",
      "adm.empty.noneBody": "Biri konsola kaydolduğunda, onay için burada görünür.",
      "adm.err.generic": "Bir şeyler ters gitti.",
      "adm.err.network": "Ağ hatası."
    }
  });
  function statusLabel(s) { var k = "adm.status." + s; var v = t(k); return v === k ? cap(s) : v; }
  function roleLabel(r) { var k = "adm.role." + r; var v = t(k); return v === k ? cap(r) : v; }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fmtDate(s) {
    if (!s) return "—";
    if (I && I.date) return I.date(s);
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
    if (boot) { boot.hidden = false; boot.textContent = t("adm.boot.notConfigured"); }
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    if (boot) { boot.hidden = false; boot.textContent = t("adm.boot.noClient"); }
    return;
  }

  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  if (I && I.setClient) I.setClient(sb);

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
    if (I && I.reconcileUser) I.reconcileUser(session.user);
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
        emptyState(t("adm.empty.migTitle"), t("adm.empty.migBody"));
        return;
      }
      if (pRes.error) { showErr(pRes.error.message); return; }
      tenants = (tRes && !tRes.error && tRes.data) ? tRes.data : [];
      profiles = pRes.data || [];
      render();
    }, function (err) { showErr((err && err.message) || t("adm.err.network")); });
  }

  var STATUS_RANK = { pending: 0, suspended: 1, active: 2 };
  function render() {
    var counts = { pending: 0, active: 0, suspended: 0 };
    profiles.forEach(function (p) { if (counts[p.status] != null) counts[p.status]++; });
    el("adCounts").innerHTML =
      chip(counts.pending, "pending", t("adm.status.pending")) +
      chip(counts.active, "active", t("adm.status.active")) +
      chip(counts.suspended, "suspended", t("adm.status.suspended"));

    if (!profiles.length) {
      el("acctBody").innerHTML = "";
      emptyState(t("adm.empty.noneTitle"), t("adm.empty.noneBody"));
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
    var opts = '<option value="">' + esc(t("adm.unassigned")) + '</option>';
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
        esc(roleLabel(r)) + '</option>';
    }).join("");
  }

  function rowHtml(p) {
    var isActive = p.status === "active";
    var toggle = isActive
      ? '<button type="button" class="btn btn-ghost btn-sm ad-suspend" data-toggle="suspend">' + esc(t("adm.suspend")) + '</button>'
      : '<button type="button" class="btn btn-primary btn-sm ad-activate" data-toggle="activate">' + esc(t("adm.activate")) + '</button>';
    // data-label values feed CSS ::before on mobile (uppercased) → localise them too.
    return '<tr data-uid="' + esc(p.user_id) + '" data-owner="' + esc(p.owner || "") + '" data-role="' + esc(p.role || "member") + '">' +
      '<td data-label="' + esc(t("adm.col.account")) + '"><div class="ad-acct"><span class="ad-email" lang="en">' + esc(p.email || "—") + '</span>' +
        '<span class="ad-created">' + esc(t("adm.joined", { date: fmtDate(p.created_at) })) + '</span></div></td>' +
      '<td data-label="' + esc(t("adm.col.tenant")) + '"><select class="qc-select ad-tenant" aria-label="' + esc(t("adm.col.tenant")) + '">' + tenantOptions(p.owner) + '</select></td>' +
      '<td data-label="' + esc(t("adm.col.role")) + '"><select class="qc-select ad-role" aria-label="' + esc(t("adm.col.role")) + '">' + roleOptions(p.role || "member") + '</select></td>' +
      '<td data-label="' + esc(t("adm.col.status")) + '"><span class="pill ad-pill ad-pill-' + esc(p.status) + '">' + esc(statusLabel(p.status)) + '</span></td>' +
      '<td class="ad-col-act" data-label="' + esc(t("adm.col.action")) + '"><div class="ad-acts">' +
        '<button type="button" class="btn btn-ghost btn-sm ad-save" data-save disabled>' + esc(t("common.save")) + '</button>' +
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
      toast(t("adm.needTenant"), true);
      return;
    }

    var acts = tr.querySelectorAll("button");
    Array.prototype.forEach.call(acts, function (b) { b.disabled = true; });
    var label = btn ? btn.textContent : "";
    if (btn) btn.textContent = t("adm.saving");

    sb.from("account_profiles")
      .update({ owner: owner, role: role, status: newStatus, updated_at: new Date().toISOString() })
      .eq("user_id", uid)
      .select()
      .then(function (res) {
        if (btn) btn.textContent = label;
        if (res.error) { toast(res.error.message, true); reenable(tr); return; }
        if (!res.data || !res.data.length) {
          // RLS returned no row → the write wasn't allowed (not admin / policy off).
          toast(t("adm.notSaved"), true);
          reenable(tr); return;
        }
        // update local model + re-render this row cleanly
        if (prof) { prof.owner = owner; prof.role = role; prof.status = newStatus; }
        else profiles.push(res.data[0]);
        toast(newStatus === "active" ? t("adm.activated") : newStatus === "suspended" ? t("adm.suspendedMsg") : t("adm.saved"));
        render();
      }, function () {
        if (btn) btn.textContent = label;
        toast(t("adm.netRetry"), true);
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
    if (!name) { err.textContent = t("adm.nt.errName"); return; }
    if (!/^[a-z0-9][a-z0-9_-]{1,40}$/.test(key)) { err.textContent = t("adm.nt.errKey"); return; }
    if (tenants.some(function (tt) { return tt.owner === key; })) { err.textContent = t("adm.nt.errExists"); return; }
    var btn = el("ntSave"); btn.disabled = true; btn.textContent = t("adm.nt.creating");
    sb.from("tenants").insert({ owner: key, name: name }).select().then(function (res) {
      btn.disabled = false; btn.textContent = t("adm.nt.create");
      if (res.error) { err.textContent = res.error.message; return; }
      var row = (res.data && res.data[0]) || { owner: key, name: name };
      tenants.push(row);
      tenants.sort(function (a, b) { return (a.name || a.owner).localeCompare(b.name || b.owner); });
      toggleNewTenant(false);
      toast(t("adm.nt.created", { name: name }));
      render(); // refresh every row's dropdown
    }, function () { btn.disabled = false; btn.textContent = t("adm.nt.create"); err.textContent = t("adm.err.network"); });
  }

  // ── empty / error ────────────────────────────────────────────────────────────
  function emptyState(title, body) {
    var e = el("adminEmpty");
    e.hidden = false;
    e.innerHTML = '<div class="ad-empty-inner"><h3>' + esc(title) + '</h3><p>' + body + '</p></div>';
  }
  function showErr(msg) { var e = el("adminError"); e.hidden = false; e.textContent = msg || t("adm.err.generic"); }
  function hideErr() { el("adminError").hidden = true; }

  // Re-render the account table in the new language without refetching.
  window.addEventListener("qw:langchange", function () {
    if (profiles && profiles.length) render();
  });
})();
