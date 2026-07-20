/* ============================================================
   QUOTEWRIGHT — hero liquid field
   A same-origin (CSP-safe) reproduction of the paper-design / Framer
   "warp" WebGL shader, mounted behind the hero → loom → ticker region.
   No external scripts, no libraries. WebGL2 only; graceful fallback
   to the CSS gradient on .hero-liquid when WebGL2 is unavailable.
   Performance/a11y: DPR capped at 2, RAF paused offscreen
   (IntersectionObserver) and on document.hidden, single static frame
   under prefers-reduced-motion.
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('heroLiquid');
  if (!canvas) return;
  var section = canvas.closest('.hero-liquid') || canvas.parentElement;

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

  // No WebGL2 → leave the .hero-liquid CSS gradient in place.
  if (!gl) { canvas.style.display = 'none'; return; }

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

  function hex(h) {
    h = h.replace('#', '');
    return [
      parseInt(h.substr(0, 2), 16) / 255,
      parseInt(h.substr(2, 2), 16) / 255,
      parseInt(h.substr(4, 2), 16) / 255
    ];
  }

  // ── Palette: Seam Studio light theme, greige + lime only (no cool blue).
  //    A light greige, a present on-brand lime that carries real coverage,
  //    and a warm sage-greige for depth — all kept light so dark ink text
  //    stays readable, but bold enough that the field visibly spans the page. ──
  var c1 = hex('F2F1E6');  // light greige (lightest)
  var c2 = hex('CBEB4E');  // present on-brand lime (the star, near full presence)
  var c3 = hex('DEE6C2');  // warm sage-greige for depth (replaces the cool tint)
  gl.uniform4f(U.u_color1, c1[0], c1[1], c1[2], 1.0);
  gl.uniform4f(U.u_color2, c2[0], c2[1], c2[2], 1.0);
  gl.uniform4f(U.u_color3, c3[0], c3[1], c3[2], 1.0);

  // ── Look uniforms — bolder, page-spanning flow. Larger features (u_scale),
  //    more visible drift (u_swirl/u_distortion), biased toward lime
  //    (u_proportion), still smooth and premium (no hard edges). ──
  gl.uniform1f(U.u_scale, 1.05);
  gl.uniform1f(U.u_rotation, 0.0);
  gl.uniform1f(U.u_proportion, 0.44);
  gl.uniform1f(U.u_softness, 0.80);
  gl.uniform1f(U.u_shape, 2.0);          // halves — smooth, no hard edges
  gl.uniform1f(U.u_shapeScale, 0.50);
  gl.uniform1f(U.u_distortion, 0.30);
  gl.uniform1f(U.u_swirl, 0.85);
  gl.uniform1f(U.u_swirlIterations, 8.0);

  var t0 = performance.now();
  var raf = 0;
  var running = false;
  var visible = true;

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
    // Slow, premium drift: ~0.15 shader-time units per second.
    draw((now - t0) * 0.00015);
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
  function drawStatic() { draw(6.0); }

  resize();

  if (reduce) {
    drawStatic();
  } else {
    start();
  }

  // Redraw on layout change (loom stacks on mobile, ticker reflows, etc.).
  function onResize() {
    resize();
    if (reduce) { drawStatic(); }
    else if (!running) { drawStatic(); }  // running loop repaints on its own
  }
  window.addEventListener('resize', onResize, { passive: true });
  if ('ResizeObserver' in window) {
    try { new ResizeObserver(onResize).observe(section); } catch (e) {}
  }

  // Pause when the field is scrolled offscreen.
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
})();
