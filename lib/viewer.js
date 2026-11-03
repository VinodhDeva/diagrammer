// Diagrammer viewer runtime: theme, motion, export, zoom/pan, and an inspector that traces
// upstream/downstream connections. Inlined into every page; reads only the embedded source JSON.
(function () {
  'use strict';
  var root = document.documentElement;
  var svgs = Array.prototype.slice.call(document.querySelectorAll('svg.dg'));
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };

  // ---- Theme -------------------------------------------------------------
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    svgs.forEach(function (s) { s.classList.toggle('dark', t === 'dark'); });
  }
  applyTheme(store.get('diagrammer-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  document.getElementById('theme').onclick = function () {
    var t = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(t);
    store.set('diagrammer-theme', t);
  };

  // ---- Motion ------------------------------------------------------------
  var motionBtn = document.getElementById('motion');
  function setLive(on) {
    svgs.forEach(function (s) { s.classList.toggle('live', on); });
    motionBtn.setAttribute('aria-pressed', String(on));
    motionBtn.textContent = on ? 'Motion: on' : 'Motion: off';
  }
  var m = store.get('diagrammer-motion');
  setLive(m ? m === 'on' : !matchMedia('(prefers-reduced-motion: reduce)').matches);
  motionBtn.onclick = function () {
    var on = motionBtn.getAttribute('aria-pressed') !== 'true';
    setLive(on);
    store.set('diagrammer-motion', on ? 'on' : 'off');
  };

  // ---- Export (first diagram) ---------------------------------------------
  var svgBtn = document.getElementById('svg'), pngBtn = document.getElementById('png');
  if (svgs[0] && svgBtn) {
    var svg0 = svgs[0];
    var fileName = (document.title || 'diagram').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    var save = function (blob, ext) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName + '.' + ext;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    };
    // A clean copy: an image snapshots frame 0, where reveal animations are still invisible.
    var svgText = function (still) {
      var c = svg0.cloneNode(true);
      if (still) c.classList.remove('live');
      c.classList.remove('has-focus');
      c.removeAttribute('style');
      Array.prototype.forEach.call(c.querySelectorAll('[tabindex]'), function (el) {
        el.removeAttribute('tabindex'); el.removeAttribute('role'); el.removeAttribute('aria-label');
        el.classList.remove('is-focus', 'is-up', 'is-down');
      });
      return new XMLSerializer().serializeToString(c);
    };
    svgBtn.onclick = function () { save(new Blob([svgText(false)], { type: 'image/svg+xml' }), 'svg'); };
    pngBtn.onclick = function () {
      var img = new Image(), w = svg0.viewBox.baseVal.width, h = svg0.viewBox.baseVal.height;
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = w * 2; c.height = h * 2;
        var x = c.getContext('2d');
        x.scale(2, 2);
        x.drawImage(img, 0, 0, w, h);
        c.toBlob(function (b) { save(b, 'png'); });
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText(true));
    };
  }

  // ---- Zoom and pan --------------------------------------------------------
  svgs.forEach(function (svg) {
    var canvas = svg.closest('.canvas');
    if (!canvas) return;
    var vb = svg.viewBox.baseVal, natW = vb.width, natH = vb.height, scale = 1;
    var bar = document.createElement('div');
    bar.className = 'zoombar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Zoom');
    bar.innerHTML = '<button type="button" data-z="out" aria-label="Zoom out">−</button>'
      + '<span class="zoom-level" aria-live="polite"></span>'
      + '<button type="button" data-z="in" aria-label="Zoom in">+</button>'
      + '<button type="button" data-z="fit">Fit</button>'
      + '<button type="button" data-z="one">100%</button>'
      + '<span class="zoom-hint">Ctrl/⌘ + scroll to zoom · drag to pan</span>';
    canvas.parentNode.insertBefore(bar, canvas);
    var level = bar.querySelector('.zoom-level');
    var fit = function () { return Math.min(1, (canvas.clientWidth - 18) / natW); };
    var set = function (s, cx, cy) {
      var old = scale;
      scale = Math.max(0.15, Math.min(4, s));
      // Keep the point under the cursor (or the view centre) in place.
      var px = cx == null ? canvas.clientWidth / 2 : cx, py = cy == null ? canvas.clientHeight / 2 : cy;
      var fx = (canvas.scrollLeft + px) / old, fy = (canvas.scrollTop + py) / old;
      svg.style.width = natW * scale + 'px';
      svg.style.height = natH * scale + 'px';
      canvas.scrollLeft = fx * scale - px;
      canvas.scrollTop = fy * scale - py;
      level.textContent = Math.round(scale * 100) + '%';
      canvas.classList.toggle('pannable', canvas.scrollWidth > canvas.clientWidth || canvas.scrollHeight > canvas.clientHeight);
    };
    // Default: whole diagram when that stays readable, otherwise 75% and scroll.
    set(Math.max(fit(), Math.min(1, 0.75)));
    canvas.scrollLeft = 0;
    canvas.scrollTop = 0;
    bar.onclick = function (ev) {
      var z = ev.target.getAttribute && ev.target.getAttribute('data-z');
      if (z === 'in') set(scale * 1.25);
      else if (z === 'out') set(scale / 1.25);
      else if (z === 'fit') set(fit());
      else if (z === 'one') set(1);
    };
    canvas.addEventListener('wheel', function (ev) {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      var r = canvas.getBoundingClientRect();
      set(scale * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), ev.clientX - r.left, ev.clientY - r.top);
    }, { passive: false });
    var drag = null;
    canvas.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 || ev.target.closest('[tabindex]')) return;
      drag = { x: ev.clientX, y: ev.clientY, l: canvas.scrollLeft, t: canvas.scrollTop, moved: false };
    });
    window.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; canvas.classList.add('panning'); }
      canvas.scrollLeft = drag.l - dx;
      canvas.scrollTop = drag.t - dy;
    });
    window.addEventListener('pointerup', function () {
      if (drag && drag.moved) canvas.dataset.justPanned = '1';
      drag = null;
      canvas.classList.remove('panning');
    });
  });

  // ---- Models: items and links per diagram, from the embedded source -----------------
  var source = null;
  try { source = JSON.parse(document.getElementById('diagram-source').textContent); } catch (e) { return; }
  var pageType = (document.querySelector('meta[name="diagram-type"]') || {}).content;
  var diagrams = pageType === 'explainer'
    ? source.panels.filter(function (p) { return p.kind === 'diagram'; }).map(function (p) { return { type: p.diagram_type, ir: p.diagram }; })
    : [{ type: pageType, ir: source }];

  var GRAPH = {
    architecture: ['nodes', 'edges'], workflow: ['steps', 'transitions'], dataflow: ['nodes', 'flows'],
    lifecycle: ['states', 'transitions'], erd: ['entities', 'relationships'], class: ['classes', 'relations'],
  };
  var name = function (it) { return it.label || it.name || it.id || it.at; };
  var linkLabel = function (l) {
    return [l.label, l.guard && '[' + l.guard + ']', l.cardinality, l.kind && !l.label ? l.kind : null].filter(Boolean).join(' ');
  };

  function buildModel(type, ir, svg) {
    var items = [], links = [], linkEls = [], itemEl, extra = function () { return []; };
    var byId = function (sel) { return function (it) { return svg.querySelector(sel + '[data-id="' + CSS.escape(it.id) + '"]'); }; };
    if (GRAPH[type]) {
      items = ir[GRAPH[type][0]];
      links = ir[GRAPH[type][1]] || [];
      linkEls = Array.prototype.slice.call(svg.querySelectorAll('.edge'));
      itemEl = byId('.node');
    } else if (type === 'tree') {
      items = ir.nodes;
      links = ir.nodes.filter(function (n) { return n.parent !== undefined; }).map(function (n) { return { from: n.parent, to: n.id }; });
      linkEls = Array.prototype.slice.call(svg.querySelectorAll('.edge'));
      itemEl = byId('.node');
    } else if (type === 'sequence') {
      items = ir.participants.concat(ir.messages.map(function (msg, i) {
        return { id: '#msg' + i, msg: msg, i: i, label: (i + 1) + '. ' + msg.label, kind: msg.kind || 'sync' };
      }));
      links = ir.messages;
      linkEls = Array.prototype.slice.call(svg.querySelectorAll('.msg'));
      itemEl = function (it) { return it.msg ? linkEls[it.i] : svg.querySelector('.node[data-id="' + CSS.escape(it.id) + '"]'); };
    } else if (type === 'waterfall') {
      items = ir.spans;
      links = ir.spans.filter(function (s) { return s.parent !== undefined; }).map(function (s) { return { from: s.parent, to: s.id, label: 'contains' }; });
      itemEl = byId('.span');
      var total = Math.max.apply(null, ir.spans.map(function (s) { return s.start + s.duration; })) || 1;
      var unit = ir.meta.unit || 'ms';
      extra = function (s) {
        var kids = ir.spans.filter(function (c) { return c.parent === s.id; });
        var busy = kids.reduce(function (sum, c) { return sum + c.duration; }, 0);
        return [['Starts', s.start + ' ' + unit], ['Duration', s.duration + ' ' + unit], ['Share of total', Math.round(s.duration / total * 1000) / 10 + '%'],
          kids.length ? ['Self time', Math.max(0, s.duration - busy) + ' ' + unit + ' (approx.)'] : null, ['Status', s.status || 'ok']];
      };
    } else if (type === 'timeline') {
      items = ir.events.map(function (e, i) { return Object.assign({ id: '#ev' + i, i: i }, e); });
      itemEl = function (it) { return svg.querySelector('.event[data-i="' + it.i + '"]'); };
      var lanes = {};
      (ir.lanes || []).forEach(function (l) { lanes[l.id] = l.label; });
      extra = function (e) { return [['When', e.at], e.lane ? ['Lane', lanes[e.lane] || e.lane] : null]; };
    }
    if (type === 'erd') extra = function (e) {
      return e.attributes.map(function (a) { return [((a.key || []).join(' ').toUpperCase() + ' ' + a.name).trim(), a.type + (a.nullable ? ' (nullable)' : '') + (a.references ? ' → ' + a.references : '')]; });
    };
    if (type === 'class') extra = function (c) {
      return (c.attributes || []).map(function (a) { return ['Attribute', a]; }).concat((c.methods || []).map(function (x) { return ['Method', x]; }));
    };
    if (type === 'sequence') {
      var who = function (id) { var p = ir.participants.filter(function (x) { return x.id === id; })[0]; return p ? p.label : id; };
      extra = function (it) { return it.msg ? [['From', who(it.msg.from)], ['To', who(it.msg.to)], ['Step', String(it.i + 1)]] : []; };
    }

    var groups = {};
    (ir.groups || []).forEach(function (g) { groups[g.id] = g.label; });
    var model = { type: type, svg: svg, items: items, links: links, linkEls: linkEls, itemEl: itemEl, extra: extra, groups: groups, byId: {} };
    items.forEach(function (it) { model.byId[it.id] = it; });
    return model;
  }

  // Direct neighbours: links that end at the item (upstream) and links that start at it (downstream).
  function neighbours(model, it) {
    var up = [], down = [];
    if (it.msg) {
      up.push({ id: it.msg.from, via: 'sends' });
      down.push({ id: it.msg.to, via: 'receives' });
      return { up: up, down: down, upLinks: [], downLinks: [] };
    }
    var upLinks = [], downLinks = [];
    model.links.forEach(function (l, i) {
      // In a sequence the neighbour is the message itself, whose name already carries the label.
      var target = model.type === 'sequence' ? '#msg' + i : null;
      var via = target ? '' : linkLabel(l);
      if (l.to === it.id) { upLinks.push(i); up.push({ id: target || l.from, via: via }); }
      if (l.from === it.id) { downLinks.push(i); down.push({ id: target || l.to, via: via }); }
    });
    return { up: up, down: down, upLinks: upLinks, downLinks: downLinks };
  }

  // ---- Inspector panel -------------------------------------------------------
  var panel = document.createElement('aside');
  panel.className = 'inspector';
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-label', 'Details');
  panel.hidden = true;
  document.body.appendChild(panel);
  var active = null; // { model, item, pinned }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function clear(model) {
    model.svg.classList.remove('has-focus');
    Array.prototype.forEach.call(model.svg.querySelectorAll('.is-focus,.is-up,.is-down'), function (el) {
      el.classList.remove('is-focus', 'is-up', 'is-down');
    });
  }

  function show(model, it, pinned) {
    if (active) clear(active.model);
    active = { model: model, item: it, pinned: pinned };
    var nb = neighbours(model, it);
    var mark = function (el, cls) { if (el) el.classList.add(cls); };
    model.svg.classList.add('has-focus');
    mark(model.itemEl(it), 'is-focus');
    nb.upLinks.forEach(function (i) { mark(model.linkEls[i], 'is-up'); });
    nb.downLinks.forEach(function (i) { mark(model.linkEls[i], 'is-down'); });
    nb.up.forEach(function (n) { if (model.byId[n.id]) mark(model.itemEl(model.byId[n.id]), 'is-up'); });
    nb.down.forEach(function (n) { if (model.byId[n.id]) mark(model.itemEl(model.byId[n.id]), 'is-down'); });

    var rows = [['Kind', it.kind || (it.msg ? 'message' : '')], it.group ? ['Group', model.groups[it.group] || it.group] : null,
      it.parent && model.type === 'tree' ? ['Parent', name(model.byId[it.parent] || { id: it.parent })] : null]
      .concat(model.extra(it)).filter(function (r) { return r && r[1]; });
    var list = function (title, cls, xs) {
      if (!xs.length) return '<h3>' + title + ' <span class="count">0</span></h3><p class="none">None</p>';
      return '<h3>' + title + ' <span class="count">' + xs.length + '</span></h3><ul class="' + cls + '">'
        + xs.map(function (n) {
          var target = model.byId[n.id];
          return '<li><button type="button" data-goto="' + esc(n.id) + '">' + esc(target ? name(target) : n.id) + '</button>'
            + (n.via ? ' <span class="via">' + esc(n.via) + '</span>' : '') + '</li>';
        }).join('') + '</ul>';
    };
    var connected = model.type !== 'timeline';
    panel.innerHTML = '<div class="insp-head"><strong>' + esc(name(it)) + '</strong>'
      + '<button type="button" class="insp-close" aria-label="Close details">×</button></div>'
      + (it.description ? '<p class="desc">' + esc(it.description) + '</p>' : '')
      + (rows.length ? '<dl>' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>' : '')
      + (connected ? list('Upstream · incoming', 'up', nb.up) + list('Downstream · outgoing', 'down', nb.down) : '')
      + '<p class="insp-hint">' + (pinned ? 'Pinned. Esc or × to close.' : 'Click or press Enter to pin.') + '</p>';
    panel.hidden = false;
    panel.classList.toggle('pinned', pinned);
    panel.querySelector('.insp-close').onclick = function () { hide(true); };
    Array.prototype.forEach.call(panel.querySelectorAll('[data-goto]'), function (b) {
      b.onclick = function () {
        var target = model.byId[b.getAttribute('data-goto')];
        var el = target && model.itemEl(target);
        if (!el) return;
        show(model, target, true);
        el.scrollIntoView({ block: 'center', inline: 'center' });
        el.focus({ preventScroll: true });
      };
    });
  }

  function hide(force) {
    if (!active || (active.pinned && !force)) return;
    var el = force && active.model.itemEl(active.item);
    clear(active.model);
    active = null;
    panel.hidden = true;
    if (el && document.activeElement && panel.contains(document.activeElement)) el.focus({ preventScroll: true });
  }

  // ---- Wire items: hover, focus, click, keyboard ------------------------------------------
  diagrams.forEach(function (d, k) {
    var svg = svgs[k];
    if (!svg || !d.ir) return;
    var model = buildModel(d.type, d.ir, svg);
    svg.setAttribute('role', 'group');
    model.items.forEach(function (it) {
      var el = model.itemEl(it);
      if (!el) return;
      // The renderer applies default kinds; read them back from the k-* class so labels name them.
      if (!it.kind) { var k = /\bk-([\w-]+)/.exec(el.getAttribute('class')); if (k) it.kind = k[1]; }
      var nb = neighbours(model, it);
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', [it.kind, name(it)].filter(Boolean).join(' ')
        + (model.type === 'timeline' ? '' : ', ' + nb.up.length + ' upstream, ' + nb.down.length + ' downstream'));
      el.addEventListener('pointerenter', function () { if (!active || !active.pinned) show(model, it, false); });
      el.addEventListener('pointerleave', function () { hide(false); });
      // Keyboard focus only; a mouse click focuses too and is handled by the click listener.
      el.addEventListener('focus', function () {
        if (el.matches(':focus-visible') && (!active || active.item !== it)) show(model, it, active ? active.pinned : false);
      });
      // From the keyboard, pinning moves focus into the panel; Esc (hide) returns it to the item.
      var toggle = function (fromKey) {
        if (active && active.item === it && active.pinned) return hide(true);
        show(model, it, true);
        if (fromKey) (panel.querySelector('[data-goto]') || panel.querySelector('.insp-close')).focus();
      };
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var canvas = svg.closest('.canvas');
        if (canvas && canvas.dataset.justPanned) { delete canvas.dataset.justPanned; return; }
        toggle();
      });
      // SVG elements have no .click(), so keys call the toggle directly.
      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(true); }
      });
    });
    svg.addEventListener('click', function () {
      var canvas = svg.closest('.canvas');
      if (canvas && canvas.dataset.justPanned) { delete canvas.dataset.justPanned; return; }
      hide(true);
    });
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') hide(true); });
})();
