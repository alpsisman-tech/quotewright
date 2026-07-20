/* ============================================================
   QUOTEWRIGHT — liquid field
   A same-origin (CSP-safe) reproduction of the paper-design / Framer
   "warp" WebGL shader. Mounts behind the hero (light palette) AND
   behind every dark section — .band / .cta-band — via a dark palette
   preset (canvas flagged data-liquid="dark").
   No external scripts, no libraries. WebGL2 only; graceful fallback
   to the CSS background when WebGL2 is unavailable.
   Perf/a11y: DPR capped at 2; each canvas pauses its RAF when
   scrolled offscreen (IntersectionObserver) and on document.hidden —
   so only in-view sections spend a frame; a single static frame under
   prefers-reduced-motion; clean recovery from WebGL context loss.
   ============================================================ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var VERT =
    '#version 300 es\n' +
    'precision highp float;\n' +
    'const vec2 verts[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));\n' +
    'void main(){ gl_Position=vec4(verts[gl_VertexID],0.,1.); }';

  // --- the exact warp fragment shader (paper-design / Framer) ---
  var FRAG =
    '#version 300 es\n' +
    'precision highp float;\n' +
    'uniform float u_time;\n' +
    'uniform float u_pixelRatio;\n' +
    'uniform vec2 u_resolution;\n' +
    'uniform float u_scale;\n' +
    'uniform float u_rotation;\n' +
    'uniform vec4 u_color1;\n' +
    'uniform vec4 u_color2;\n' +
    'uniform vec4 u_color3;\n' +
    'uniform float u_proportion;\n' +
    'uniform float u_softness;\n' +
    'uniform float u_shape;\n' +
    'uniform float u_shapeScale;\n' +
    'uniform float u_distortion;\n' +
    'uniform float u_swirl;\n' +
    'uniform float u_swirlIterations;\n' +
    'out vec4 fragColor;\n' +
    '#define TWO_PI 6.28318530718\n' +
    '#define PI 3.14159265358979323846\n' +
    'vec2 rotate(vec2 uv, float th){ return mat2(cos(th),sin(th),-sin(th),cos(th))*uv; }\n' +
    'float random(vec2 st){ return fract(sin(dot(st.xy, vec2(12.9898,78.233)))*43758.5453123); }\n' +
    'float noise(vec2 st){\n' +
    '  vec2 i=floor(st); vec2 f=fract(st);\n' +
    '  float a=random(i), b=random(i+vec2(1.,0.)), c=random(i+vec2(0.,1.)), d=random(i+vec2(1.,1.));\n' +
    '  vec2 u=f*f*(3.-2.*f);\n' +
    '  float x1=mix(a,b,u.x), x2=mix(c,d,u.x);\n' +
    '  return mix(x1,x2,u.y);\n' +
    '}\n' +
    'vec4 blend_colors(vec4 c1, vec4 c2, vec4 c3, float mixer, float edgesWidth, float edge_blur){\n' +
    '  vec3 color1=c1.rgb*c1.a, color2=c2.rgb*c2.a, color3=c3.rgb*c3.a;\n' +
    '  float r1=smoothstep(.0+.35*edgesWidth, .7-.35*edgesWidth+.5*edge_blur, mixer);\n' +
    '  float r2=smoothstep(.3+.35*edgesWidth, 1.-.35*edgesWidth+edge_blur, mixer);\n' +
    '  vec3 blended_color_2=mix(color1,color2,r1);\n' +
    '  float blended_opacity_2=mix(c1.a,c2.a,r1);\n' +
    '  vec3 c=mix(blended_color_2,color3,r2);\n' +
    '  float o=mix(blended_opacity_2,c3.a,r2);\n' +
    '  return vec4(c,o);\n' +
    '}\n' +
    'void main(){\n' +
    '  vec2 uv=gl_FragCoord.xy/u_resolution.xy; vec2 uv_original=uv;\n' +
    '  float t=.5*u_time;\n' +
    '  float noise_scale=.0005+.006*u_scale;\n' +
    '  uv-=.5; uv*=(noise_scale*u_resolution); uv=rotate(uv,u_rotation*.5*PI); uv/=u_pixelRatio; uv+=.5;\n' +
    '  float n1=noise(uv*1.+t), n2=noise(uv*2.-t);\n' +
    '  float angle=n1*TWO_PI;\n' +
    '  uv.x+=4.*u_distortion*n2*cos(angle); uv.y+=4.*u_distortion*n2*sin(angle);\n' +
    '  float iterations_number=ceil(clamp(u_swirlIterations,1.,30.));\n' +
    '  for(float i=1.;i<=iterations_number;i++){\n' +
    '    uv.x+=clamp(u_swirl,0.,2.)/i*cos(t+i*1.5*uv.y);\n' +
    '    uv.y+=clamp(u_swirl,0.,2.)/i*cos(t+i*1.*uv.x);\n' +
    '  }\n' +
    '  float proportion=clamp(u_proportion,0.,1.);\n' +
    '  float shape=0., mixer=0.;\n' +
    '  if(u_shape<.5){ vec2 s=uv*(.5+3.5*u_shapeScale); shape=.5+.5*sin(s.x)*cos(s.y); mixer=shape+.48*sign(proportion-.5)*pow(abs(proportion-.5),.5); }\n' +
    '  else if(u_shape<1.5){ vec2 s=uv*(.25+3.*u_shapeScale); float f=fract(s.y); shape=smoothstep(.0,.55,f)*smoothstep(1.,.45,f); mixer=shape+.48*sign(proportion-.5)*pow(abs(proportion-.5),.5); }\n' +
    '  else { float sh=1.-uv.y; sh-=.5; sh/=(noise_scale*u_resolution.y); sh+=.5; float ss=.2*(1.-u_shapeScale); shape=smoothstep(.45-ss,.55+ss, sh+.3*(proportion-.5)); mixer=shape; }\n' +
    '  vec4 color_mix=blend_colors(u_color1,u_color2,u_color3,mixer,1.-clamp(u_softness,0.,1.),.01+.01*u_scale);\n' +
    '  fragColor=vec4(color_mix.rgb,color_mix.a);\n' +
    '}';

  function hex(h) {
    h = h.replace('#', '');
    return [
      parseInt(h.substr(0, 2), 16) / 255,
      parseInt(h.substr(2, 2), 16) / 255,
      parseInt(h.substr(4, 2), 16) / 255
    ];
  }

  // ── Palette + look presets ──────────────────────────────────────
  // LIGHT (hero): greige + present lime, kept light so dark ink text
  //   stays readable across the whole hero region.
  // DARK (bands/cta): mostly deep charcoal with calm on-brand lime
  //   wisps in the thin transition seam — over it the WHITE headings,
  //   sub copy and inner cards stay clearly readable.
  var PRESETS = {
    light: {
      colors: ['F2F1E6', 'CBEB4E', 'DEE6C2'],
      scale: 1.05, rotation: 0.0, proportion: 0.44, softness: 0.80,
      shape: 2.0, shapeScale: 0.50, distortion: 0.30, swirl: 0.85,
      swirlIterations: 8.0, speed: 0.00015, staticPhase: 6.0
    },
    dark: {
      // c1 deep charcoal · c2 brand lime (thin seam = low presence) · c3 mid charcoal.
      // proportion pushed low so most of the field stays charcoal and the lime
      // reads as calm wisps rather than broad neon ribbons; a dark scrim in CSS
      // (.band::before) further protects the white copy sitting over it.
      colors: ['0B0B0B', 'D2FF37', '202020'],
      scale: 0.92, rotation: 0.0, proportion: 0.37, softness: 0.62,
      shape: 2.0, shapeScale: 0.5, distortion: 0.20, swirl: 0.55,
      swirlIterations: 8.0, speed: 0.00010, staticPhase: 6.0
    }
  };

  // ── Mount one warp field on one canvas ──────────────────────────
  function mount(canvas, preset) {
    if (!canvas) return;
    var section = canvas.closest('.hero-liquid, .band, .cta-band') || canvas.parentElement;

    var gl = null;
    try {
      gl = canvas.getContext('webgl2', {
        antialias: false,
        alpha: true,
        premultipliedAlpha: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power'
      });
    } catch (e) { gl = null; }

    // No WebGL2 → leave the CSS fallback background in place.
    if (!gl) { canvas.style.display = 'none'; return; }

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('[qw-liquid] shader compile failed:', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    function fail() { canvas.style.display = 'none'; }

    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { fail(); return; }

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[qw-liquid] program link failed:', gl.getProgramInfoLog(prog));
      fail();
      return;
    }
    gl.useProgram(prog);

    // A VAO is required to draw in a WebGL2 core context.
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    var U = {};
    ['u_time', 'u_pixelRatio', 'u_resolution', 'u_scale', 'u_rotation',
     'u_color1', 'u_color2', 'u_color3', 'u_proportion', 'u_softness',
     'u_shape', 'u_shapeScale', 'u_distortion', 'u_swirl', 'u_swirlIterations'
    ].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    var c1 = hex(preset.colors[0]);
    var c2 = hex(preset.colors[1]);
    var c3 = hex(preset.colors[2]);
    gl.uniform4f(U.u_color1, c1[0], c1[1], c1[2], 1.0);
    gl.uniform4f(U.u_color2, c2[0], c2[1], c2[2], 1.0);
    gl.uniform4f(U.u_color3, c3[0], c3[1], c3[2], 1.0);

    gl.uniform1f(U.u_scale, preset.scale);
    gl.uniform1f(U.u_rotation, preset.rotation);
    gl.uniform1f(U.u_proportion, preset.proportion);
    gl.uniform1f(U.u_softness, preset.softness);
    gl.uniform1f(U.u_shape, preset.shape);
    gl.uniform1f(U.u_shapeScale, preset.shapeScale);
    gl.uniform1f(U.u_distortion, preset.distortion);
    gl.uniform1f(U.u_swirl, preset.swirl);
    gl.uniform1f(U.u_swirlIterations, preset.swirlIterations);

    var t0 = performance.now();
    var raf = 0;
    var running = false;
    var visible = true;
    var speed = preset.speed;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);   // cap DPR ≤ 2
      var r = canvas.getBoundingClientRect();
      var cssW = Math.max(1, Math.round(r.width));
      var cssH = Math.max(1, Math.round(r.height));
      var w = Math.max(1, Math.round(cssW * dpr));
      var h = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.u_resolution, w, h);
      gl.uniform1f(U.u_pixelRatio, dpr);
    }

    function draw(uTime) {
      gl.uniform1f(U.u_time, uTime);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function frame(now) {
      raf = 0;
      // Slow, premium drift.
      draw((now - t0) * speed);
      if (running) raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    // A single static frame (fixed phase) for reduced-motion or when paused.
    function drawStatic() { draw(preset.staticPhase); }

    resize();

    if (reduce) {
      drawStatic();
    } else {
      start();
    }

    // Redraw on layout change (loom stacks on mobile, cards reflow, etc.).
    function onResize() {
      resize();
      if (reduce) { drawStatic(); }
      else if (!running) { drawStatic(); }  // running loop repaints on its own
    }
    window.addEventListener('resize', onResize, { passive: true });
    if ('ResizeObserver' in window) {
      try { new ResizeObserver(onResize).observe(section); } catch (e) {}
    }

    // Pause when this field is scrolled offscreen — only in-view sections
    // spend a frame, so several canvases never animate at once.
    if ('IntersectionObserver' in window && !reduce) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          visible = en.isIntersecting;
          if (visible && !document.hidden) start();
          else stop();
        });
      }, { threshold: 0 });
      io.observe(section);
    }

    // Pause when the tab is hidden.
    document.addEventListener('visibilitychange', function () {
      if (reduce) return;
      if (document.hidden) stop();
      else if (visible) start();
    });

    // Recover cleanly from a lost GL context.
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stop(); }, false);
  }

  // ── Boot: hero (light) + every flagged dark section canvas ──────
  mount(document.getElementById('heroLiquid'), PRESETS.light);

  var dark = document.querySelectorAll('canvas[data-liquid="dark"]');
  for (var i = 0; i < dark.length; i++) mount(dark[i], PRESETS.dark);
})();
