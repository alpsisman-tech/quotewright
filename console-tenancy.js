/* Quotewright console — tenancy resolver (Wave A multi-tenancy, frontend half).
   Shared by dashboard.js and admin.js. No inline scripts (site CSP is
   script-src 'self').

   resolve(sb) reads the CALLER's own account_profiles row (RLS self-read policy:
   user_id = auth.uid()) and returns a normalised profile the console uses to route:

     { anon, owner, role, status, active, isAdmin, degraded, email, userId, user }

   ── Fail-safe / graceful degradation ─────────────────────────────────────────
   The account_profiles / tenants tables land with quotewright-tenancy.sql (PR #13).
   BEFORE the owner runs that SQL, the table is missing. We MUST NOT crash or lock
   Hassan out. So a "relation does not exist" error degrades to LEGACY single-tenant
   mode: owner = QW_CONFIG.OWNER, active = true — i.e. the console behaves exactly as
   it did pre-tenancy. RLS on the data tables is still the real gate.

   Security: the tenant key (owner) always comes from the SERVER-SIDE profile row,
   never from client input. A pending / suspended / unassigned user resolves to
   active=false and is shown the awaiting-activation screen (and RLS returns them
   nothing anyway — fail-closed on both layers). */
(function () {
  "use strict";

  var cfg = window.QW_CONFIG || {};

  // Is this a "table not created yet" error? (mirrors console-views.js)
  function isMissingTable(err) {
    if (!err) return false;
    var code = err.code || "";
    var msg = (err.message || "") + " " + (err.details || "") + " " + (err.hint || "");
    return code === "42P01" || code === "PGRST205" || code === "PGRST202" ||
      /does not exist|not find the table|schema cache|relation .* does not exist/i.test(msg);
  }

  function legacy(user) {
    // Pre-SQL: act like the old single-tenant console (Hassan), never lock out.
    return {
      degraded: true,
      owner: cfg.OWNER || null,
      role: "member", status: "active", active: true, isAdmin: false,
      email: (user && user.email) || "", userId: user && user.id, user: user || null
    };
  }

  function resolve(sb) {
    if (!sb) return Promise.resolve({ anon: true, active: false });
    return sb.auth.getUser().then(function (r) {
      var user = r && r.data && r.data.user;
      if (!user) return { anon: true, active: false };
      return sb.from("account_profiles")
        .select("owner,role,status")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(function (res) {
          if (res && res.error) {
            if (isMissingTable(res.error)) return legacy(user);   // SQL not applied yet
            // Any other read error → fail CLOSED (treat as not-yet-activated), but keep
            // identity so the user sees the pending screen, not a crash.
            return { owner: null, role: "member", status: "pending", active: false,
                     isAdmin: false, error: true, email: user.email, userId: user.id, user: user };
          }
          var p = res && res.data;
          if (!p) {
            // No profile row at all (signup trigger not applied / row deleted) → the
            // account is not linked to any workspace. noProfile lets the awaiting-
            // activation screen say that, rather than "awaiting approval".
            return { owner: null, role: "member", status: "pending", active: false,
                     noProfile: true, isAdmin: false, email: user.email, userId: user.id, user: user };
          }
          var active = p.status === "active" && !!p.owner;
          return {
            owner: p.owner || null,
            role: p.role || "member",
            status: p.status || "pending",
            active: active,
            isAdmin: p.role === "admin" && p.status === "active",
            email: user.email, userId: user.id, user: user
          };
        }, function () {
          // Network error on the profile read → fail closed but recoverable.
          return { owner: null, role: "member", status: "pending", active: false,
                   isAdmin: false, error: true, email: user.email, userId: user.id, user: user };
        });
    }, function () { return { anon: true, active: false }; });
  }

  window.QWTenancy = { resolve: resolve, isMissingTable: isMissingTable };
})();
