/* Quotewright console — account provisioning state.

   A signed-in user whose account_profiles row is not (status='active' AND owner
   set) matches ZERO rows under every RLS policy on quotes / customers /
   resolutions / catalog_gaps / digest / autonomy_settings, because those policies
   read `owner = auth_owner()` and auth_owner() returns NULL for them. The console
   would therefore render perfectly — and completely empty. That looks broken. It
   is fail-closed security working. This module lets every page SAY so.

   Detection reuses the mechanism quotewright-tenancy.sql already ships: the
   `account_profiles_self_read` policy lets a user read their OWN profile row, so
   we simply select owner/role/status where user_id = auth.uid(). No new SQL, no
   new table, no new column — nothing to migrate.

   ── Fail OPEN, always ───────────────────────────────────────────────────────
   If the check itself is INCONCLUSIVE — account_profiles does not exist (the
   tenancy SQL was never applied: code 42P01 / PGRST205), a network error, no
   Supabase client — we report provisioned:true and let the page render normally.
   A legacy single-tenant install (Hassan) must never be locked out of its own
   console by a screen that only exists to explain an empty one.

   Demo / guided-tour mode short-circuits to provisioned:true: it simulates data
   locally and must never show this screen.

   Admins (role='admin' AND status='active') always pass, so admin.html and the
   admin rail link stay reachable.

   API — window.QWAccount
   ---------------------
     check(sb, session) → Promise<
         { provisioned: true,  reason }
       | { provisioned: false, status: 'pending'|'suspended'|'unlinked', reason, email }
     >
     paint(root, state, email) → point the pending section's [data-i18n] keys at
       the copy for this status and fill in the signed-in email.

   CSP: the site sets script-src 'self'. Handlers are attached in JS by the pages
   that own the markup — never introduce inline onclick/onchange attributes. */
(function () {
  "use strict";

  // i18n: pending.* already exists (dashboard). Register the two other states.
  if (window.QWI18n && QWI18n.add) QWI18n.add({
    en: {
      "account.suspended.kicker": "Access paused",
      "account.suspended.title": "Your access has been suspended",
      "account.suspended.body": ". An administrator has suspended this account, so the quote console is closed for now. Your data is untouched — access returns as soon as the suspension is lifted.",
      "account.suspended.note": "Contact your Quotewright administrator to find out why and to have access restored.",
      "account.unlinked.kicker": "Almost there",
      "account.unlinked.title": "Your account isn’t linked to a workspace yet",
      "account.unlinked.body": ". Your sign-in works, but the account hasn’t been connected to a company workspace — so there are no quotes, customers or catalogue gaps to show you yet.",
      "account.unlinked.note": "Ask your Quotewright administrator to activate your account and connect it to your company.",
      // Positional fragment before the email — mirrors pending.body1 (empty in TR,
      // where the sentence reads "<email> olarak giriş yaptınız").
      "account.body1": "You’re signed in as"
    },
    tr: {
      "account.suspended.kicker": "Erişim durduruldu",
      "account.suspended.title": "Erişiminiz askıya alındı",
      "account.suspended.body": " olarak giriş yaptınız. Bir yönetici bu hesabı askıya aldığı için teklif konsolu şimdilik kapalı. Verilerinize dokunulmadı — askı kaldırılır kaldırılmaz erişiminiz geri gelir.",
      "account.suspended.note": "Nedenini öğrenmek ve erişimi geri açtırmak için Quotewright yöneticinizle iletişime geçin.",
      "account.unlinked.kicker": "Neredeyse hazır",
      "account.unlinked.title": "Hesabınız henüz bir çalışma alanına bağlı değil",
      "account.unlinked.body": " olarak giriş yaptınız. Girişiniz çalışıyor ancak hesap henüz bir şirket çalışma alanına bağlanmadı — bu yüzden gösterilecek teklif, müşteri veya katalog boşluğu yok.",
      "account.unlinked.note": "Quotewright yöneticinizden hesabınızı etkinleştirip şirketinize bağlamasını isteyin.",
      "account.body1": ""
    }
  });

  // Copy keys per blocked status. `pending.*` is the set dashboard.html already ships.
  var COPY = {
    pending: {
      kicker: "pending.kicker", title: "pending.title",
      body1: "pending.body1", body2: "pending.body2", note: "pending.note"
    },
    suspended: {
      kicker: "account.suspended.kicker", title: "account.suspended.title",
      body1: "account.body1", body2: "account.suspended.body", note: "account.suspended.note"
    },
    unlinked: {
      kicker: "account.unlinked.kicker", title: "account.unlinked.title",
      body1: "account.body1", body2: "account.unlinked.body", note: "account.unlinked.note"
    }
  };

  /* ok() also carries the tenancy fields the caller needs anyway (owner / role /
     isAdmin), so a page can resolve provisioning AND scope in ONE round-trip.
     owner is null on every fail-open path — callers fall back to QW_CONFIG.OWNER,
     which is exactly the legacy single-tenant behaviour. */
  function ok(reason, p, email) {
    p = p || {};
    return {
      provisioned: true, reason: reason,
      owner: p.owner || null, role: p.role || "member",
      isAdmin: p.role === "admin" && p.status === "active",
      email: email || ""
    };
  }
  function blocked(status, reason, email) {
    return { provisioned: false, status: status, reason: reason, email: email || "",
             owner: null, role: "member", isAdmin: false };
  }

  function demoOn() {
    return !!(window.QWDemo && typeof QWDemo.isOn === "function" && QWDemo.isOn());
  }

  // Resolve the caller's id/email from a session we were handed, else from Supabase.
  function whoami(sb, session) {
    var u = session && session.user;
    if (u && u.id) return Promise.resolve(u);
    return sb.auth.getUser().then(function (r) {
      return (r && r.data && r.data.user) || null;
    }, function () { return null; });
  }

  function check(sb, session) {
    // Simulated data — never gate the demo or the guided tour.
    if (demoOn()) return Promise.resolve(ok("demo"));
    // No client at all: inconclusive, not blocked.
    if (!sb || !sb.from || !sb.auth) return Promise.resolve(ok("no-client"));

    return whoami(sb, session).then(function (user) {
      // Signed out — the page's own login gate owns this case, not us.
      if (!user || !user.id) return ok("anon");
      var email = user.email || "";

      var q;
      // A throw while BUILDING the query is inconclusive too — fail OPEN.
      try {
        q = sb.from("account_profiles")
          .select("owner,role,status")
          .eq("user_id", user.id)
          .maybeSingle();
      } catch (e) { return ok("check-threw", null, email); }

      return q
        .then(function (res) {
          // Table missing (tenancy SQL not applied) or any other read error →
          // INCONCLUSIVE → fail OPEN. Never lock a working install out.
          if (res && res.error) return ok("check-failed", null, email);

          var p = res && res.data;
          // No row: the signup trigger never ran (or the profile was deleted).
          // Nothing links this user to a workspace.
          if (!p) return blocked("unlinked", "no-profile-row", email);

          // auth_is_admin() equivalent — admins always pass (keeps admin.html and
          // the admin rail link reachable).
          if (p.role === "admin" && p.status === "active") return ok("admin", p, email);

          if (p.status === "suspended") return blocked("suspended", "status-suspended", email);
          if (p.status !== "active") return blocked("pending", "status-" + (p.status || "unknown"), email);
          if (!p.owner) return blocked("unlinked", "no-owner", email);

          return ok("active", p, email);
        }, function () { return ok("check-failed", null, email); });
    }, function () { return ok("check-failed"); });
  }

  /* Point the pending section at the copy for `state` and stamp the email.
     Swaps the [data-i18n] KEYS (rather than writing text) so a later language
     switch re-translates the section correctly via QWI18n.apply. */
  function paint(root, state, email) {
    root = root || document;
    var q = function (id) { return root.querySelector ? root.querySelector("#" + id) : null; };
    var copy = COPY[(state && state.status) || "pending"] || COPY.pending;

    var map = {
      pendingKicker: copy.kicker, pendingTitle: copy.title,
      pendingBody1: copy.body1, pendingBody2: copy.body2, pendingNote: copy.note
    };
    for (var id in map) {
      if (!Object.prototype.hasOwnProperty.call(map, id)) continue;
      var node = q(id);
      if (node) node.setAttribute("data-i18n", map[id]);
    }
    var pe = q("pendingEmail");
    if (pe) pe.textContent = email || (state && state.email) || "";
    if (window.QWI18n && QWI18n.apply) QWI18n.apply(root);
  }

  window.QWAccount = { check: check, paint: paint };
})();
