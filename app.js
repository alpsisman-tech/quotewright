/* ============================================================
   QUOTEWRIGHT — shared behaviour
   nav · reveals · loom demo · counters · pricing toggle ·
   FAQ · Netlify form (AJAX)
   ============================================================ */
(function(){
  'use strict';
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- nav ---------- */
  var nav = document.getElementById('nav');
  if(nav){
    var onScroll = function(){ nav.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, {passive:true});
    onScroll();
  }
  var menuToggle = document.getElementById('menuToggle');
  var navLinks = document.getElementById('navLinks');
  if(menuToggle && navLinks){
    menuToggle.addEventListener('click', function(){
      var open = navLinks.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    navLinks.addEventListener('click', function(e){
      if(e.target.tagName === 'A'){ navLinks.classList.remove('open'); menuToggle.setAttribute('aria-expanded','false'); }
    });
  }

  /* ---------- scroll reveals ---------- */
  var revealables = document.querySelectorAll('.rv');
  if('IntersectionObserver' in window && !prefersReduced){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, {threshold:.1, rootMargin:'0px 0px -5% 0px'});
    revealables.forEach(function(el){ io.observe(el); });
  } else {
    revealables.forEach(function(el){ el.classList.add('in'); });
  }

  /* ---------- pipeline thread ---------- */
  var pipeline = document.getElementById('pipeline');
  if(pipeline){
    if('IntersectionObserver' in window && !prefersReduced){
      var pio = new IntersectionObserver(function(entries){
        entries.forEach(function(en){
          if(en.isIntersecting){ pipeline.classList.add('in'); pio.unobserve(pipeline); }
        });
      }, {threshold:.25});
      pio.observe(pipeline);
    } else { pipeline.classList.add('in'); }
  }

  /* ---------- loom demo ---------- */
  var loom = document.getElementById('loom');
  if(loom){
    var emailText = "Merhaba,\n\n260 gsm mikrofiber cam bezi için fiyat teklifi rica ediyoruz. Mavi renk, 40x40 cm, 2'li paket. 300 koli sipariş etmeyi planlıyoruz. EXW.\n\nSaygılarımızla,\nSatın Alma Departmanı";
    var typedEl = document.getElementById('typed');
    var caretEl = document.getElementById('caret');
    var qRows = loom.querySelectorAll('.quote-card .q-row');
    var steps = loom.querySelectorAll('.loom-bar .step');
    var timers = [];
    var clearTimers = function(){ timers.forEach(clearTimeout); timers = []; };
    var setStep = function(n){
      steps.forEach(function(s){ s.classList.toggle('on', parseInt(s.getAttribute('data-s'),10) <= n); });
    };
    var runLoom = function(){
      clearTimers();
      loom.classList.remove('weaving');
      typedEl.textContent = '';
      caretEl.style.display = 'inline-block';
      qRows.forEach(function(r){ r.classList.remove('show'); });
      setStep(0);
      if(prefersReduced){
        typedEl.textContent = emailText;
        caretEl.style.display = 'none';
        loom.classList.add('weaving');
        qRows.forEach(function(r){ r.classList.add('show'); });
        setStep(5);
        return;
      }
      var i = 0, speed = 13;
      setStep(1);
      (function type(){
        if(i <= emailText.length){
          typedEl.textContent = emailText.slice(0, i);
          i += 2;
          timers.push(setTimeout(type, speed));
        } else {
          typedEl.textContent = emailText;
          caretEl.style.display = 'none';
          setStep(2);
          timers.push(setTimeout(function(){
            loom.classList.add('weaving');
            setStep(3);
            qRows.forEach(function(r, idx){
              timers.push(setTimeout(function(){
                r.classList.add('show');
                if(idx === 4) setStep(4);
                if(idx === qRows.length - 1) setStep(5);
              }, 560 + idx * 260));
            });
          }, 350));
        }
      })();
    };
    var replayBtn = document.getElementById('replayBtn');
    if(replayBtn) replayBtn.addEventListener('click', runLoom);
    if('IntersectionObserver' in window){
      var lio = new IntersectionObserver(function(entries){
        entries.forEach(function(en){
          if(en.isIntersecting){ runLoom(); lio.unobserve(loom); }
        });
      }, {threshold:.08, rootMargin:'0px 0px 0px 0px'});
      lio.observe(loom);
    } else { runLoom(); }
  }

  /* ---------- pricing toggle ---------- */
  var billToggle = document.getElementById('billToggle');
  if(billToggle){
    var lblM = document.getElementById('lblMonthly');
    var lblA = document.getElementById('lblAnnual');
    billToggle.addEventListener('click', function(){
      var annual = billToggle.getAttribute('aria-checked') !== 'true';
      billToggle.setAttribute('aria-checked', annual ? 'true' : 'false');
      if(lblM){ lblM.style.fontWeight = annual ? '400' : '700'; lblM.style.color = annual ? 'var(--soft)' : 'var(--ink)'; }
      if(lblA){ lblA.style.fontWeight = annual ? '700' : '400'; lblA.style.color = annual ? 'var(--ink)' : 'var(--soft)'; }
      document.querySelectorAll('.plan .amt[data-m]').forEach(function(a){
        var from = parseInt(a.textContent.replace(/[^0-9]/g,''),10) || 0;
        var to = parseInt(annual ? a.getAttribute('data-a') : a.getAttribute('data-m'),10);
        if(prefersReduced){ a.textContent = to; return; }
        var start = null, dur = 380;
        (function tick(ts){
          if(!start) start = ts;
          var p = Math.min((ts - start)/dur, 1);
          a.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
          if(p < 1) requestAnimationFrame(tick);
        })(performance.now());
      });
      document.querySelectorAll('.plan .annual-note').forEach(function(n){
        if(n.closest('.plan').classList.contains('custom')){ n.innerHTML = '&nbsp;'; return; }
        n.innerHTML = annual ? 'billed annually · 15% saved' : '&nbsp;';
      });
    });
  }

  /* ---------- FAQ ---------- */
  document.querySelectorAll('.faq').forEach(function(f){
    var btn = f.querySelector('.q');
    var ans = f.querySelector('.a');
    btn.addEventListener('click', function(){
      var open = f.classList.contains('open');
      document.querySelectorAll('.faq.open').forEach(function(o){
        if(o !== f){
          o.classList.remove('open');
          o.querySelector('.a').style.maxHeight = '0';
          o.querySelector('.q').setAttribute('aria-expanded','false');
        }
      });
      f.classList.toggle('open', !open);
      btn.setAttribute('aria-expanded', String(!open));
      ans.style.maxHeight = open ? '0' : ans.scrollHeight + 'px';
    });
  });

  /* ---------- plan buttons carry the chosen plan to the contact page ---------- */
  document.querySelectorAll('[data-plan]').forEach(function(b){
    b.addEventListener('click', function(){
      try{ sessionStorage.setItem('qw_plan', b.getAttribute('data-plan')); }catch(e){}
    });
  });
  var msgField = document.getElementById('fMsg');
  if(msgField){
    try{
      var plan = sessionStorage.getItem('qw_plan');
      if(plan && !msgField.value){ msgField.value = 'Interested in the ' + plan + ' plan.'; }
    }catch(e){}
  }

  /* ---------- Netlify form (AJAX, no page reload, no email exposed) ---------- */
  var pilotForm = document.getElementById('pilotForm');
  if(pilotForm){
    pilotForm.addEventListener('submit', function(e){
      e.preventDefault();
      if(!pilotForm.checkValidity()){ pilotForm.reportValidity(); return; }
      var status = document.getElementById('formStatus');
      var submitBtn = pilotForm.querySelector('button[type="submit"]');
      var data = new FormData(pilotForm);
      var body = new URLSearchParams();
      data.forEach(function(v, k){ body.append(k, v); });
      submitBtn.disabled = true;
      submitBtn.style.opacity = '.7';
      fetch('/', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: body.toString()
      }).then(function(res){
        if(res.ok){
          status.className = 'form-status show good';
          status.textContent = 'Request received. We\u2019ll reply within one business day.';
          pilotForm.reset();
        } else { throw new Error('bad status'); }
      }).catch(function(){
        status.className = 'form-status show bad';
        status.textContent = 'Something interrupted the send. Please try again in a moment.';
      }).finally(function(){
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
      });
    });
  }

  /* ---------- footer year ---------- */
  var yr = document.getElementById('yr');
  if(yr) yr.textContent = new Date().getFullYear();
})();
