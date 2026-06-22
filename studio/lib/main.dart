// Quantum Studio — embedded Flutter Web Dev workspace (v3, feature-parity).
// Native-Flutter header + Code editor + compile + Edit Visual (drag/size/instruct).
// Preview is an <iframe> (HtmlElementView); the drag overlay JS is injected into
// it (same-origin /flutter-app). Talks to server.cjs; reads the BYOK key from the
// same localStorage the React shell uses.
import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
import 'dart:js_util' as jsutil;
import 'dart:ui_web' as ui_web;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:auto_size_text/auto_size_text.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_staggered_animations/flutter_staggered_animations.dart';
import 'package:shimmer/shimmer.dart';
import 'package:percent_indicator/percent_indicator.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';
import 'package:smooth_page_indicator/smooth_page_indicator.dart' hide SlideEffect, ScaleEffect;
import 'package:flutter_spinkit/flutter_spinkit.dart';

void main() => runApp(const StudioApp());

final html.IFrameElement _previewFrame = html.IFrameElement()
  ..style.border = 'none'
  ..style.width = '100%'
  ..style.height = '100%';

bool _viewRegistered = false;
void _registerView() {
  if (_viewRegistered) return;
  _viewRegistered = true;
  ui_web.platformViewRegistry.registerViewFactory('quantum-preview', (int _) => _previewFrame);
}

// Drag/select overlay injected into the preview iframe (semantics-based, since
// Flutter paints to canvas). Ported verbatim from the proven React version.
const String _dragJs = r'''(function(){
  var active=false; var sel=null, totalDx=0, totalDy=0;
  var hoverBox=null, selBox=null; var dragging=false, sx=0, sy=0, baseLeft=0, baseTop=0;
  function mkBox(style){ var d=document.createElement('div');
    d.style.cssText='position:fixed;pointer-events:none;z-index:999999;border-radius:4px;display:none;box-sizing:border-box;'+style;
    document.body.appendChild(d); return d; }
  function place(b,r){ b.style.left=r.left+'px'; b.style.top=r.top+'px'; b.style.width=r.width+'px'; b.style.height=r.height+'px'; b.style.display='block'; }
  function enableSemantics(){ var ph=document.querySelector('flt-semantics-placeholder');
    if(ph){ try{ ph.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); }catch(e){} } }
  var tries=0; var timer=setInterval(function(){ enableSemantics();
    if(document.querySelector('flt-semantics')||++tries>30) clearInterval(timer); },400);
  function nodesAt(x,y){ var out=[], all=document.querySelectorAll('flt-semantics');
    for(var i=0;i<all.length;i++){ var r=all[i].getBoundingClientRect();
      if(r.width>3&&r.height>3&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom) out.push({el:all[i],r:r,area:r.width*r.height}); }
    out.sort(function(a,b){return a.area-b.area;}); return out; }
  function labelOf(el){ var l=(el.getAttribute('aria-label')||el.textContent||'').trim(); return (l||el.getAttribute('role')||'widget').slice(0,80); }
  function roleOf(el){ return el.getAttribute('role')||'widget'; }
  document.addEventListener('mousemove',function(e){ if(!active) return;
    if(dragging){ e.preventDefault(); e.stopPropagation(); var dx=e.clientX-sx, dy=e.clientY-sy;
      selBox.style.left=(baseLeft+dx)+'px'; selBox.style.top=(baseTop+dy)+'px'; return; }
    var ns=nodesAt(e.clientX,e.clientY); if(!hoverBox) hoverBox=mkBox('border:2px dashed #5eead4;background:rgba(94,234,212,.05);');
    if(ns.length){ place(hoverBox,ns[0].r); document.body.style.cursor='pointer'; } else { hoverBox.style.display='none'; document.body.style.cursor=''; } },true);
  document.addEventListener('mousedown',function(e){ if(!active||e.button!==0) return;
    e.preventDefault(); e.stopPropagation(); var ns=nodesAt(e.clientX,e.clientY); if(!ns.length) return;
    var el=ns[0].el, r=ns[0].r;
    if(sel!==el){ sel=el; totalDx=0; totalDy=0; if(!selBox) selBox=mkBox('border:2px solid #5eead4;background:rgba(94,234,212,.1);');
      place(selBox,r); window.parent.postMessage({__qdrag__:true,type:'select',elementText:labelOf(el),elementTag:roleOf(el)},'*'); }
    dragging=true; sx=e.clientX; sy=e.clientY; var br=selBox.getBoundingClientRect(); baseLeft=br.left; baseTop=br.top; document.body.style.cursor='move'; },true);
  document.addEventListener('mouseup',function(e){ if(!active||!dragging) return;
    e.preventDefault(); e.stopPropagation(); dragging=false; totalDx+=e.clientX-sx; totalDy+=e.clientY-sy; document.body.style.cursor='pointer';
    if(sel) window.parent.postMessage({__qdrag__:true,type:'moved',elementText:labelOf(sel),elementTag:roleOf(sel),dx:Math.round(totalDx),dy:Math.round(totalDy)},'*'); },true);
  document.addEventListener('click',function(e){ if(active){ e.preventDefault(); e.stopPropagation(); } },true);
  window.addEventListener('message',function(ev){ if(!ev.data||!ev.data.__qdragcmd__) return;
    if(ev.data.cmd==='setActive'){ active=ev.data.val; if(!active){ if(hoverBox)hoverBox.style.display='none'; if(selBox)selBox.style.display='none'; sel=null; document.body.style.cursor=''; } else enableSemantics(); }
    if(ev.data.cmd==='clearSel'){ if(selBox)selBox.style.display='none'; sel=null; totalDx=0; totalDy=0; } });
})();''';

const _brand = Color(0xFF5EEAD4);
const _blue = Color(0xFF54C5F8);
const _bg = Color(0xFF0F1318);
const _bg2 = Color(0xFF11151C);
const _line = Color(0xFF1F2733);
const _text = Color(0xFFE6EDF3);
const _muted = Color(0xFF8B98A9);

class StudioApp extends StatelessWidget {
  const StudioApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: _bg,
        colorScheme: ColorScheme.fromSeed(
          seedColor: _brand,
          brightness: Brightness.dark,
          surface: _bg,
        ),
        textTheme: TextTheme(
          titleLarge: TextStyle(color: _text, fontWeight: FontWeight.w600),
          titleMedium: TextStyle(color: _text, fontWeight: FontWeight.w500),
          bodyMedium: TextStyle(color: _text),
          bodySmall: TextStyle(color: _muted),
          labelLarge: TextStyle(color: _text),
        ),
        appBarTheme: AppBarTheme(
          backgroundColor: _bg,
          foregroundColor: _text,
          elevation: 0,
          scrolledUnderElevation: 0,
          centerTitle: false,
          titleTextStyle: TextStyle(color: _text, fontSize: 14, fontWeight: FontWeight.w600),
        ),
        cardTheme: CardTheme(
          color: _bg2,
          elevation: 1,
          margin: EdgeInsets.all(8),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Color(0xFF0B0D11),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: BorderSide(color: _line),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: BorderSide(color: _line),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: BorderSide(color: _brand, width: 1.5),
          ),
          labelStyle: TextStyle(color: _muted, fontSize: 12),
          hintStyle: TextStyle(color: _muted, fontSize: 12),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: _brand,
            foregroundColor: Color(0xFF06231F),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            textStyle: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(foregroundColor: _brand, textStyle: TextStyle(fontSize: 12)),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: _text,
            side: BorderSide(color: _line),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            textStyle: TextStyle(fontSize: 12),
          ),
        ),
        iconButtonTheme: IconButtonThemeData(
          style: IconButton.styleFrom(foregroundColor: _muted, splashRadius: 18),
        ),
        tabBarTheme: TabBarTheme(
          labelColor: _brand,
          unselectedLabelColor: _muted,
          indicatorColor: _brand,
          indicatorSize: TabBarIndicatorSize.tab,
          labelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          unselectedLabelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
        ),
        switchTheme: SwitchThemeData(
          thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? _brand : _muted),
          trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? _brand.withValues(alpha: 0.3) : _line),
        ),
        sliderTheme: SliderThemeData(
          activeTrackColor: _brand,
          inactiveTrackColor: _line,
          thumbColor: _brand,
          overlayColor: _brand.withValues(alpha: 0.12),
          valueIndicatorColor: _brand,
          valueIndicatorTextStyle: TextStyle(color: Color(0xFF06231F), fontSize: 11),
        ),
        checkboxTheme: CheckboxThemeData(
          fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? _brand : Colors.transparent),
          checkColor: WidgetStateProperty.resolveWith((s) => const Color(0xFF06231F)),
          side: BorderSide(color: _line),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        ),
        radioTheme: RadioThemeData(
          fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? _brand : _muted),
        ),
        chipTheme: ChipThemeData(
          backgroundColor: _bg2,
          labelStyle: TextStyle(color: _text, fontSize: 12),
          side: BorderSide(color: _line),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          padding: EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        ),
        tooltipTheme: TooltipThemeData(
          decoration: BoxDecoration(color: _bg2, borderRadius: BorderRadius.circular(6), border: Border.all(color: _line)),
          textStyle: TextStyle(color: _text, fontSize: 11),
          padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        ),
        dialogTheme: DialogTheme(
          backgroundColor: _bg2,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          titleTextStyle: TextStyle(color: _text, fontSize: 16, fontWeight: FontWeight.w600),
          contentTextStyle: TextStyle(color: _text, fontSize: 13),
        ),
        bottomSheetTheme: BottomSheetThemeData(
          backgroundColor: _bg2,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
        ),
        popupMenuTheme: PopupMenuThemeData(
          color: _bg2,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          textStyle: TextStyle(color: _text, fontSize: 12),
        ),
      ),
      home: const StudioHome(),
    );
  }
}

enum Phase { idle, compiling, done, error }

class StudioHome extends StatefulWidget {
  const StudioHome({super.key});
  @override
  State<StudioHome> createState() => _StudioHomeState();
}

class _StudioHomeState extends State<StudioHome> with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  Phase _phase = Phase.idle;
  String _error = '';
  String? _lastGood;
  bool _aiFixing = false;

  bool _editMode = false;
  String? _lastReceivedSrc;
  String? _selText, _selTag;
  Map? _selNode;   // A2UI: currently selected node for the property panel (actual spec instance)
  final Map<String, TextEditingController> _pc = {};   // property-panel field controllers (cleared on reselect)
  int _dx = 0, _dy = 0;
  final Map<String, int> _sizeOps = {};
  String? _dragStatus;

  Map<String, dynamic>? _uiJson;   // A2UI spec — when set, render JSON instantly (no compile)

  final _codeCtrl = TextEditingController();
  final _instrCtrl = TextEditingController();
  StreamSubscription<html.MessageEvent>? _msgSub;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() { if (!_tabController.indexIsChanging) setState(() {}); });
    _registerView();
    _previewFrame.onLoad.listen((_) { if (_editMode) _injectOverlay(); });
    _msgSub = html.window.onMessage.listen(_onMessage);
    // Restore the last A2UI so reopening the studio (fresh iframe) still has a UI to edit.
    try {
      final saved = html.window.localStorage['quantum_a2ui'];
      if (saved != null && saved.isNotEmpty) {
        final spec = jsonDecode(saved);
        if (spec is Map) { _uiJson = Map<String, dynamic>.from(spec); _phase = Phase.done; }
      } else {
        // First launch — load the calculator demo
        Future.microtask(() => _loadCalculatorExample());
      }
    } catch (_) {}
    // Handshake: tell the parent (React shell) we're ready to receive source.
    // Posted a few times in case the parent's listener attaches slightly later.
    void announce() { try { jsutil.callMethod(jsutil.getProperty(html.window, 'parent'), 'postMessage', [jsutil.jsify({'quantumStudioReady': true}), '*']); } catch (_) {} }
    _beacon('boot + announce ready');
    announce();
    Timer(const Duration(milliseconds: 300), announce);
    Timer(const Duration(milliseconds: 900), announce);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _msgSub?.cancel();
    _codeCtrl.dispose();
    _instrCtrl.dispose();
    super.dispose();
  }

  void _beacon(String m, [int? n]) {
    try { html.HttpRequest.request('/dbg?src=studio&m=${Uri.encodeComponent(m)}${n != null ? '&n=$n' : ''}'); } catch (_) {}
  }

  // dart:html turns a postMessage'd JS object into a Dart Map (structured clone),
  // so read Map keys first; fall back to js_util for genuine JS objects.
  dynamic _prop(dynamic o, String k) {
    try { if (o is Map) return o[k]; } catch (_) {}
    try { return jsutil.getProperty(o, k); } catch (_) { return null; }
  }

  void _onMessage(html.MessageEvent e) {
    final d = e.data;
    // A2UI: a declarative JSON UI spec → render instantly, no compile.
    final ui = _prop(d, 'quantumUi');
    if (ui != null) {
      try {
        final spec = ui is String ? jsonDecode(ui) : jsutil.dartify(ui);
        if (spec is Map) _applyUi(Map<String, dynamic>.from(spec), ui is String ? ui : jsonEncode(spec));
      } catch (_) {}
      return;
    }
    final src = _prop(d, 'quantumSource');
    if (src is String) {
      _uiJson = null;   // switching back to Dart-compile mode
      if (src == _lastReceivedSrc) return;   // retries send the same source — handle once
      _lastReceivedSrc = src;
      _beacon('received source', src.length);
      _codeCtrl.text = src;
      _compile(src);
      return;
    }
    if (_prop(d, '__qdrag__') == true) {
      final type = _prop(d, 'type');
      if (type == 'select') {
        setState(() {
          _selText = _prop(d, 'elementText')?.toString();
          _selTag = _prop(d, 'elementTag')?.toString();
          _dx = 0; _dy = 0; _sizeOps.clear(); _instrCtrl.clear();
        });
      } else if (type == 'moved') {
        setState(() {
          _selText = _prop(d, 'elementText')?.toString();
          _selTag = _prop(d, 'elementTag')?.toString();
          _dx = (_prop(d, 'dx') as num?)?.toInt() ?? 0;
          _dy = (_prop(d, 'dy') as num?)?.toInt() ?? 0;
        });
      }
    }
  }

  Map<String, dynamic>? _cloud() {
    try { final s = html.window.localStorage['quantum_cloud']; if (s != null) return jsonDecode(s) as Map<String, dynamic>; } catch (_) {}
    return null;
  }

  void _frameCmd(Map<String, dynamic> m) {
    try { _previewFrame.contentWindow?.postMessage(jsutil.jsify(m), '*'); } catch (_) {}
  }

  void _injectOverlay() {
    try {
      // contentDocument isn't on the dart:html IFrameElement binding here — reach
      // it through js_util (the iframe is same-origin, so this is allowed).
      final win = jsutil.getProperty(_previewFrame, 'contentWindow');
      if (win == null) return;
      final doc = jsutil.getProperty(win, 'document');
      if (doc == null) return;
      final existing = jsutil.callMethod(doc, 'getElementById', ['__qdrag__']);
      if (existing == null) {
        final s = jsutil.callMethod(doc, 'createElement', ['script']);
        jsutil.setProperty(s, 'id', '__qdrag__');
        jsutil.setProperty(s, 'text', _dragJs);
        final body = jsutil.getProperty(doc, 'body');
        if (body != null) jsutil.callMethod(body, 'appendChild', [s]);
      }
      _frameCmd({'__qdragcmd__': true, 'cmd': 'setActive', 'val': true});
    } catch (_) {}
  }

  Future<dynamic> _post(String url, Map<String, dynamic> body) async {
    final c = _cloud();
    if (c != null) body['cloud'] = c;
    final resp = await html.HttpRequest.request(url,
        method: 'POST',
        requestHeaders: {'Content-Type': 'application/json'},
        sendData: jsonEncode(body));
    return jsonDecode(resp.responseText ?? '{}');
  }

  // Reload the last A2UI (from the saved spec, or recompile the Code tab) — fresh state.
  void _reloadUi() {
    try {
      final saved = html.window.localStorage['quantum_a2ui'];
      if (saved != null && saved.isNotEmpty) {
        final spec = jsonDecode(saved);
        if (spec is Map) { _applyUi(Map<String, dynamic>.from(spec), saved); return; }
      }
    } catch (_) {}
    if (_codeCtrl.text.trim().isNotEmpty) _compile(_codeCtrl.text);
  }

  // Calculator A2UI spec for demo
  static const String _calculatorSpec = '''
{
  "a2ui": 1,
  "state": {"display": ""},
  "root": {
    "type": "scaffold",
    "background": "#0f0f23",
    "children": [{
      "type": "column",
      "gap": 8,
      "padding": 16,
      "children": [
        {
          "type": "container",
          "color": "#1a1a3e",
          "radius": 16,
          "padding": 20,
          "height": 90,
          "children": [{
            "type": "text",
            "text": "\${display|0}",
            "fontSize": 44,
            "bold": true,
            "color": "#ffffff",
            "align": "right"
          }]
        },
        {
          "type": "grid",
          "columns": 4,
          "gap": 8,
          "ratio": 1,
          "children": [
            {"type":"button","label":"C",  "color":"#ff4757","textColor":"#ffffff","radius":12,"action":{"set":"display","to":""}},
            {"type":"button","label":"←",  "color":"#ff6b81","textColor":"#ffffff","radius":12,"action":{"backspace":"display"}},
            {"type":"button","label":"%",  "color":"#57606f","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"%"}},
            {"type":"button","label":"÷",  "color":"#ffa502","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"/"}},
            {"type":"button","label":"7",  "color":"#2f3542","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"7"}},
            {"type":"button","label":"8",  "color":"#2f3542","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"8"}},
            {"type":"button","label":"9",  "color":"#2f3542","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"9"}},
            {"type":"button","label":"×",  "color":"#ffa502","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"*"}},
            {"type":"button","label":"4",  "color":"#2f3542","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"4"}},
            {"type":"button","label":"5",  "color":"#2f3542","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"5"}},
            {"type":"button","label":"6",  "color":"#2f3542","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"6"}},
            {"type":"button","label":"−",  "color":"#ffa502","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"-"}},
            {"type":"button","label":"1",  "color":"#2f3542","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"1"}},
            {"type":"button","label":"2",  "color":"#2f3542","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"2"}},
            {"type":"button","label":"3",  "color":"#2f3542","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"3"}},
            {"type":"button","label":"+",  "color":"#ffa502","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"+"}},
            {"type":"button","label":"±",  "color":"#57606f","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"-"}},
            {"type":"button","label":"0",  "color":"#2f3542","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"0"}},
            {"type":"button","label":".",  "color":"#57606f","textColor":"#ffffff","radius":12,"action":{"append":"display","text":"."}},
            {"type":"button","label":"=",  "color":"#2ed573","textColor":"#ffffff","radius":12,"action":{"eval":"display"}}
          ]
        }
      ]
    }]
  }
}
''';

  void _loadCalculatorExample() {
    try {
      final spec = jsonDecode(_calculatorSpec);
      if (spec is Map) _applyUi(Map<String, dynamic>.from(spec), _calculatorSpec);
    } catch (_) {}
  }

  // Apply an A2UI spec to the preview and persist it so it survives studio reloads.
  void _applyUi(Map<String, dynamic> spec, String raw) {
    setState(() { _uiJson = spec; _phase = Phase.done; _error = ''; _selNode = null; _pc.clear(); });
    _tabController.animateTo(0);
    try { html.window.localStorage['quantum_a2ui'] = raw; } catch (_) {}
  }

  Future<void> _compile(String src) async {
    if (src.trim().isEmpty) return;
    // A2UI: if the source is a JSON UI spec, render it instantly (no compile).
    final s = src.trim();
    if (s.startsWith('{')) {
      try {
        final spec = jsonDecode(s);
        if (spec is Map && (spec['type'] != null || spec['root'] != null)) {
          _applyUi(Map<String, dynamic>.from(spec), s);
          return;
        }
      } catch (_) {/* not JSON */}
    }
    // Dart compilation is disabled — Web Dev is A2UI-only. Anything that is not a
    // valid A2UI JSON spec shows a notice instead of running the old Flutter build.
    setState(() {
      _uiJson = null;
      _phase = Phase.error;
      _error = 'Mode Dart dinonaktifkan — Web Dev sekarang A2UI (JSON). Kirim spec A2UI JSON, bukan kode Dart.';
    });
  }

  Future<void> _aiFix() async {
    if (_aiFixing) return;
    setState(() => _aiFixing = true);
    try {
      final d = await _post('/flutter/fix', {'source': _codeCtrl.text, 'error': _error});
      if (d['source'] != null) { _codeCtrl.text = d['source'].toString(); await _compile(_codeCtrl.text); }
    } catch (_) {}
    if (mounted) setState(() => _aiFixing = false);
  }

  void _revert() { if (_lastGood == null) return; _codeCtrl.text = _lastGood!; _compile(_lastGood!); }

  void _toggleEdit() {
    setState(() { _editMode = !_editMode; if (!_editMode) _selNode = null; });
    if (_uiJson != null) return;   // A2UI editing is in-widget (tap to select) — no iframe overlay
    if (_editMode) { _injectOverlay(); } else { _frameCmd({'__qdragcmd__': true, 'cmd': 'setActive', 'val': false}); _clearSel(); }
  }

  void _clearSel() {
    setState(() { _selText = null; _selTag = null; _dx = 0; _dy = 0; _sizeOps.clear(); _instrCtrl.clear(); });
    _frameCmd({'__qdragcmd__': true, 'cmd': 'clearSel'});
  }

  void _bump(String k, int step) {
    setState(() { final v = (_sizeOps[k] ?? 0) + step; if (v == 0) { _sizeOps.remove(k); } else { _sizeOps[k] = v; } });
  }

  String _sizeInstruction() {
    const L = {'width': 'lebar', 'height': 'tinggi', 'padding': 'padding', 'font': 'ukuran font', 'radius': 'sudut border (borderRadius)'};
    return _sizeOps.entries.map((e) => '${e.value > 0 ? 'tambah' : 'kurangi'} ${L[e.key]} sekitar ${e.value.abs()}px').join(', ');
  }

  Future<void> _applyEdit() async {
    if (_selText == null) return;
    final instr = [_sizeInstruction(), _instrCtrl.text.trim()].where((s) => s.isNotEmpty).join('. ');
    final moved = _dx.abs() >= 4 || _dy.abs() >= 4;
    if (!moved && instr.isEmpty) return;
    setState(() => _dragStatus = 'AI memperbarui…');
    try {
      final d = await _post('/flutter/move', {
        'source': _codeCtrl.text, 'elementText': _selText, 'elementTag': _selTag,
        'dx': _dx, 'dy': _dy, 'instruction': instr,
      });
      if (d['source'] != null) {
        _codeCtrl.text = d['source'].toString();
        _clearSel();
        setState(() => _dragStatus = 'Mengkompilasi…');
        await _compile(_codeCtrl.text);
      } else if (d['error'] != null) {
        setState(() { _phase = Phase.error; _error = d['error'].toString(); });
      }
    } catch (_) {}
    if (mounted) setState(() => _dragStatus = null);
  }

  @override
  Widget build(BuildContext context) {
    final isPreview = _tabController.index == 0;
    return Scaffold(
      body: Column(children: [
        _buildHeader(),
        if (_phase == Phase.error) _buildErrorBar(),
        if (_editMode && isPreview) _buildEditBar(),
        if (_editMode && isPreview && _selText != null) _buildSizePanel(),
        Expanded(child: TabBarView(
          controller: _tabController,
          children: [
            _buildPreview(),
            _buildCode(),
          ],
        )),
      ]),
    );
  }

  Widget _buildHeader() {
    return AppBar(
      toolbarHeight: 44,
      backgroundColor: _bg,
      elevation: 0,
      scrolledUnderElevation: 0,
      leading: const Padding(
        padding: EdgeInsets.only(left: 12),
        child: Icon(Icons.auto_awesome, size: 18, color: _brand),
      ),
      title: const Text('Quantum Studio'),
      titleSpacing: 6,
      actions: [
        Padding(
          padding: const EdgeInsets.only(right: 4),
          child: _badge(_phase == Phase.compiling ? '⏳ compile…' : 'Flutter', _phase == Phase.compiling ? const Color(0xFFFBBF24) : _blue),
        ),
        _iconBtn(Icons.play_arrow_rounded, 'Compile', () => _compile(_codeCtrl.text)),
        _iconBtn(_editMode ? Icons.edit : Icons.edit_outlined, 'Edit Visual', _toggleEdit, active: _editMode),
        _iconBtn(Icons.refresh, 'Muat ulang', _reloadUi),
        _iconBtn(Icons.calculate_outlined, 'Contoh Kalkulator', _loadCalculatorExample),
        _iconBtn(Icons.open_in_new, 'Buka di tab', () => html.window.open(_previewFrame.src ?? '/flutter-app/index.html', '_blank')),
        const SizedBox(width: 4),
      ],
      bottom: const TabBar(
        tabs: [
          Tab(icon: Icon(Icons.phone_iphone, size: 14), text: 'Preview'),
          Tab(icon: Icon(Icons.code, size: 14), text: 'Code'),
        ],
      ),
    );
  }

  Widget _badge(String t, Color c) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: c.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
        child: Text(t, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: c)),
      );

  Widget _iconBtn(IconData icon, String tip, VoidCallback onTap, {bool active = false}) => IconButton(
        onPressed: onTap, icon: Icon(icon, size: 18, color: active ? _blue : _muted), tooltip: tip, splashRadius: 18,
      );

  Widget _buildEditBar() {
    final hasMove = _dx.abs() >= 4 || _dy.abs() >= 4;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: (_selText != null ? _brand : _blue).withValues(alpha: 0.07),
        border: const Border(bottom: BorderSide(color: _line)),
      ),
      child: _selText == null
          ? const Text('Klik widget di preview untuk memilih — lalu atur ukuran atau seret',
              style: TextStyle(fontSize: 12, color: _blue))
          : Row(children: [
              Flexible(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                    decoration: BoxDecoration(color: _brand.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(4)),
                    child: Text((_selText ?? '').length > 30 ? '${_selText!.substring(0, 30)}…' : _selText!,
                        style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: _brand)),
                  ),
                  Text(hasMove ? 'digeser $_dx px, $_dy px' : 'seret untuk pindah / atur ukuran',
                      style: const TextStyle(fontSize: 11, color: _muted)),
                ]),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: SizedBox(
                  height: 32,
                  child: TextField(
                    controller: _instrCtrl,
                    style: const TextStyle(fontSize: 12, color: _text),
                    decoration: InputDecoration(
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
                      hintText: 'instruksi: ubah warna jadi merah…',
                      hintStyle: const TextStyle(color: _muted, fontSize: 12),
                      filled: true, fillColor: const Color(0xFF0B0D11),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: _line)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: _line)),
                    ),
                    onSubmitted: (_) => _applyEdit(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              TextButton(onPressed: _clearSel, child: const Text('Batal', style: TextStyle(color: _muted))),
              FilledButton(
                onPressed: _dragStatus != null ? null : _applyEdit,
                style: FilledButton.styleFrom(backgroundColor: _brand, foregroundColor: const Color(0xFF06231F)),
                child: Text(_dragStatus ?? 'Terapkan'),
              ),
            ]),
    );
  }

  Widget _buildSizePanel() {
    Widget row(String key, String label, int step) {
      final v = _sizeOps[key];
      return Row(mainAxisSize: MainAxisSize.min, children: [
        Text(label, style: const TextStyle(fontSize: 11, color: _muted)),
        const SizedBox(width: 4),
        _sBtn('−', () => _bump(key, -step)),
        SizedBox(width: 32, child: Text(v == null ? '·' : (v > 0 ? '+$v' : '$v'),
            textAlign: TextAlign.center, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: v == null ? _muted : _blue))),
        _sBtn('+', () => _bump(key, step)),
      ]);
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(color: _blue.withValues(alpha: 0.05), border: const Border(bottom: BorderSide(color: _line))),
      child: Wrap(spacing: 16, runSpacing: 6, children: [
        row('width', 'Lebar', 20), row('height', 'Tinggi', 20), row('padding', 'Padding', 8),
        row('font', 'Font', 2), row('radius', 'Sudut', 4),
      ]),
    );
  }

  Widget _sBtn(String t, VoidCallback onTap) => InkWell(
        onTap: onTap,
        child: Container(
          width: 24, height: 24, alignment: Alignment.center,
          decoration: BoxDecoration(color: _bg2, borderRadius: BorderRadius.circular(6), border: Border.all(color: _line)),
          child: Text(t, style: const TextStyle(fontSize: 15, color: _text)),
        ),
      );

  Widget _buildErrorBar() {
    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(maxHeight: 150),
      padding: const EdgeInsets.all(12),
      color: const Color(0x14F87171),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.warning_amber_rounded, size: 16, color: Color(0xFFF87171)),
            const SizedBox(width: 8),
            const Text('Compile gagal', style: TextStyle(color: Color(0xFFFCA5A5), fontWeight: FontWeight.w600)),
            const Spacer(),
            TextButton(onPressed: _aiFixing ? null : _aiFix, child: Text(_aiFixing ? 'Memperbaiki…' : '✦ Perbaiki (AI)', style: const TextStyle(color: _brand))),
            if (_lastGood != null) TextButton(onPressed: _revert, child: const Text('↩ Versi berfungsi', style: TextStyle(color: _brand))),
          ]),
          const SizedBox(height: 6),
          SelectableText(_error, style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: Color(0xFFFCA5A5))),
        ]),
      ),
    );
  }

  Widget _buildPreview() {
    // A2UI: render the JSON spec instantly — no iframe, no compile.
    if (_uiJson != null) {
      final preview = _phoneFrame(Container(color: Colors.white, child: A2UIView(
        spec: _uiJson!, editMode: _editMode, selected: _selNode,
        onSelect: (node) => setState(() { _selNode = node; _pc.clear(); }),
        onChange: () => setState(() { _pc.clear(); }),   // drag-resize → refresh property panel fields
      )));
      if (!_editMode) return preview;
      return Row(children: [Expanded(child: preview), _a2uiPanel()]);
    }
    // Edit mode but no A2UI loaded yet → explain instead of showing an empty gray frame.
    if (_editMode) {
      return _phoneFrame(Container(color: Colors.white, alignment: Alignment.center,
        child: const Padding(padding: EdgeInsets.all(24), child: Text(
          'Belum ada antarmuka untuk diedit.\n\nGenerate UI lewat Web Dev (chat), atau tempel A2UI JSON di tab Code lalu ▶ — setelah itu ketuk elemen untuk mengeditnya.',
          textAlign: TextAlign.center, style: TextStyle(color: Color(0xFF64748B), fontSize: 13, height: 1.6)))));
    }
    return _phoneFrame(Stack(children: [
      const Positioned.fill(child: HtmlElementView(viewType: 'quantum-preview')),
      if (_phase == Phase.compiling)
        Positioned.fill(child: Container(color: _bg, child: const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
          CircularProgressIndicator(color: _brand, strokeWidth: 3), SizedBox(height: 14),
          Text('Mengkompilasi Flutter…', style: TextStyle(color: _brand, fontSize: 13)),
        ])))),
      if (_phase == Phase.idle)
        const Positioned.fill(child: Center(child: Text('Kirim/tulis kode Dart, lalu Compile', style: TextStyle(color: _muted, fontSize: 13)))),
    ]));
  }

  // Device (phone) mockup that frames the preview, centered on a neutral backdrop.
  Widget _phoneFrame(Widget child) {
    return Container(
      color: const Color(0xFFE5E7EB),
      child: Center(
        child: LayoutBuilder(builder: (ctx, c) {
          double h = c.maxHeight - 28;
          double w = h * 390 / 844;
          final maxW = c.maxWidth - 28;
          if (w > maxW) { w = maxW; h = w * 844 / 390; }
          if (h < 0 || w < 0) return const SizedBox.shrink();
          return Card(
            elevation: 12,
            shadowColor: Colors.black38,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(42)),
            color: Colors.black,
            child: SizedBox(
              width: w, height: h,
              child: Padding(
                padding: const EdgeInsets.all(11),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(32),
                  child: Stack(children: [
                    Positioned.fill(child: child),
                    // Notch / camera island — realistis seperti iPhone dynamic island
                    Positioned(
                      top: 6, left: 0, right: 0,
                      child: Center(
                        child: Container(
                          width: 90, height: 16,
                          decoration: BoxDecoration(
                            color: Colors.black,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                width: 6, height: 6,
                                decoration: BoxDecoration(
                                  color: const Color(0xFF1A1A2E),
                                  shape: BoxShape.circle,
                                  border: Border.all(color: const Color(0xFF2A2A3E), width: 0.5),
                                ),
                              ),
                              const SizedBox(width: 14),
                              Container(
                                width: 28, height: 4,
                                decoration: BoxDecoration(
                                  color: Colors.grey.shade800,
                                  borderRadius: BorderRadius.circular(2),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ]),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  // ── A2UI property panel (Figma-like): edit the selected node's props live ──
  Color? _hex(String? v) { if (v == null || v.isEmpty) return null; var s = v.replaceAll('#', '').trim(); if (s.length == 6) s = 'ff$s'; final i = int.tryParse(s, radix: 16); return i == null ? null : Color(i); }
  bool _isBtnType(String t) { t = t.toLowerCase(); return t == 'button' || t == 'elevatedbutton' || t == 'textbutton' || t == 'iconbutton'; }

  Widget _pLabel(String s) => Padding(padding: const EdgeInsets.only(top: 12, bottom: 4),
      child: Text(s, style: const TextStyle(color: _muted, fontSize: 11, fontWeight: FontWeight.w600)));
  InputDecoration _pInput() => InputDecoration(isDense: true, filled: true, fillColor: const Color(0xFF0B0D11),
      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: _line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: _line)));

  Widget _pText(String label, Map n, String key) {
    final c = _pc.putIfAbsent('t_$key', () => TextEditingController(text: '${n[key] ?? ''}'));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_pLabel(label),
      TextField(controller: c, style: const TextStyle(color: _text, fontSize: 12), decoration: _pInput(),
        onChanged: (v) { n[key] = v; setState(() {}); })]);
  }
  Widget _pNum(String label, Map n, String key) {
    final c = _pc.putIfAbsent('n_$key', () => TextEditingController(text: n[key] == null ? '' : '${n[key]}'));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_pLabel(label),
      TextField(controller: c, keyboardType: TextInputType.number, style: const TextStyle(color: _text, fontSize: 12), decoration: _pInput(),
        onChanged: (v) { final d = double.tryParse(v); if (d != null) { n[key] = d; } else if (v.isEmpty) { n.remove(key); } setState(() {}); })]);
  }
  Widget _pBool(String label, Map n, String key) => Padding(padding: const EdgeInsets.only(top: 8),
      child: Row(children: [Expanded(child: Text(label, style: const TextStyle(color: _text, fontSize: 12))),
        Switch(value: n[key] == true, onChanged: (v) => setState(() => n[key] = v))]));
  Widget _pColor(String label, Map n, String key) {
    const sw = ['#ffffff', '#000000', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#1e293b', '#0b1220', '#64748b', '#a855f7'];
    final c = _pc.putIfAbsent('c_$key', () => TextEditingController(text: '${n[key] ?? ''}'));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_pLabel(label),
      Wrap(spacing: 6, runSpacing: 6, children: sw.map((h) => GestureDetector(
        onTap: () { n[key] = h; c.text = h; setState(() {}); },
        child: Container(width: 24, height: 24, decoration: BoxDecoration(color: _hex(h), borderRadius: BorderRadius.circular(5), border: Border.all(color: _line))))).toList()),
      const SizedBox(height: 6),
      TextField(controller: c, style: const TextStyle(color: _text, fontSize: 12), decoration: _pInput().copyWith(hintText: '#rrggbb', hintStyle: const TextStyle(color: _muted, fontSize: 12)),
        onChanged: (v) { n[key] = v; setState(() {}); })]);
  }
  Widget _pSelect(String label, Map n, String key, List<String> opts) {
    final cur = opts.contains('${n[key] ?? ''}') ? '${n[key] ?? ''}' : '';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_pLabel(label),
      Container(
        decoration: BoxDecoration(color: const Color(0xFF0B0D11), borderRadius: BorderRadius.circular(6), border: Border.all(color: _line)),
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: DropdownButtonHideUnderline(child: DropdownButton<String>(
          isExpanded: true, dropdownColor: const Color(0xFF0B0D11), value: cur,
          style: const TextStyle(color: _text, fontSize: 12),
          items: opts.map((o) => DropdownMenuItem(value: o, child: Text(o.isEmpty ? '(default)' : o, style: const TextStyle(color: _text, fontSize: 12)))).toList(),
          onChanged: (v) { if (v == null || v.isEmpty) { n.remove(key); } else { n[key] = v; } setState(() {}); })))]);
  }
  Widget _pList(String label, Map n, String key) {
    final cur = (n[key] is List) ? (n[key] as List).join(', ') : '';
    final c = _pc.putIfAbsent('l_$key', () => TextEditingController(text: cur));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_pLabel('$label (pisahkan koma)'),
      TextField(controller: c, style: const TextStyle(color: _text, fontSize: 12), decoration: _pInput(),
        onChanged: (v) { n[key] = v.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList(); setState(() {}); })]);
  }
  Widget _pGradient(String label, Map n) {
    final g = n['gradient'];
    final list = (g is List && g.length >= 2) ? g : null;
    final ca = _pc.putIfAbsent('g0', () => TextEditingController(text: list != null ? '${list[0]}' : ''));
    final cb = _pc.putIfAbsent('g1', () => TextEditingController(text: list != null ? '${list[1]}' : ''));
    void apply() {
      final av = ca.text.trim(), bv = cb.text.trim();
      if (av.isEmpty && bv.isEmpty) { n.remove('gradient'); } else { n['gradient'] = [av, bv]; }
      setState(() {});
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_pLabel('$label (2 warna)'),
      Row(children: [
        Expanded(child: TextField(controller: ca, style: const TextStyle(color: _text, fontSize: 12), decoration: _pInput().copyWith(hintText: '#dari', hintStyle: const TextStyle(color: _muted, fontSize: 11)), onChanged: (_) => apply())),
        const SizedBox(width: 6),
        Expanded(child: TextField(controller: cb, style: const TextStyle(color: _text, fontSize: 12), decoration: _pInput().copyWith(hintText: '#ke', hintStyle: const TextStyle(color: _muted, fontSize: 11)), onChanged: (_) => apply())),
      ])]);
  }

  Widget _a2uiPanel() {
    final n = _selNode;
    return Container(
      width: 248,
      decoration: const BoxDecoration(color: _bg, border: Border(left: BorderSide(color: _line))),
      child: n == null
          ? const Center(child: Padding(padding: EdgeInsets.all(18),
              child: Text('Ketuk elemen di preview untuk mengeditnya', textAlign: TextAlign.center, style: TextStyle(color: _muted, fontSize: 12))))
          : Builder(builder: (_) {
            final type = '${n['type'] ?? ''}'.toLowerCase();
            final isBtn = _isBtnType(type);
            return ListView(padding: const EdgeInsets.all(12), children: [
              Row(children: [const Text('Properti', style: TextStyle(color: _text, fontSize: 13, fontWeight: FontWeight.w700)),
                const Spacer(), _badge(type.isEmpty ? 'node' : type, _blue)]),
              if (n.containsKey('text')) _pText('Teks', n, 'text'),
              if (n.containsKey('label') || isBtn) _pText('Label', n, 'label'),
              // ── TEXT ──
              if (type == 'text') ...[
                _pNum('Ukuran font', n, 'fontSize'),
                _pSelect('Ketebalan', n, 'weight', const ['', '300', '400', '500', '600', '700', '800', '900']),
                _pBool('Tebal', n, 'bold'),
                _pBool('Italic', n, 'italic'),
                _pNum('Spasi huruf', n, 'letterSpacing'),
                _pSelect('Rata teks', n, 'align', const ['', 'left', 'center', 'right', 'justify']),
                _pColor('Warna', n, 'color'),
              ],
              // ── BUTTON ──
              if (isBtn) ...[
                _pColor('Warna tombol', n, 'color'),
                _pColor('Warna teks', n, 'textColor'),
                _pNum('Radius', n, 'radius'),
                _pNum('Ukuran font', n, 'fontSize'),
                _pNum('Elevation', n, 'elevation'),
                _pNum('Padding', n, 'padding'),
              ],
              // ── general color for other nodes ──
              if (type != 'scaffold' && type != 'text' && type != 'container' && !isBtn) _pColor('Warna', n, 'color'),
              // ── SCAFFOLD ──
              if (type == 'scaffold') ...[_pColor('Latar', n, 'background'), _pGradient('Gradient latar', n), _pColor('Warna AppBar', n, 'appBarColor')],
              // ── CONTAINER ──
              if (type == 'container') ...[
                _pColor('Warna', n, 'color'),
                _pGradient('Gradient', n),
                _pNum('Padding', n, 'padding'), _pNum('Margin', n, 'margin'),
                _pNum('Radius', n, 'radius'), _pNum('Lebar', n, 'width'), _pNum('Tinggi', n, 'height'),
                _pColor('Warna border', n, 'borderColor'), _pNum('Tebal border', n, 'borderWidth'),
                _pBool('Bayangan (shadow)', n, 'shadow'),
                _pSelect('Posisi isi', n, 'alignment', const ['', 'center', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'left', 'right', 'top', 'bottom']),
              ],
              // ── CARD ──
              if (type == 'card') ...[_pColor('Warna', n, 'color'), _pNum('Radius', n, 'radius'), _pNum('Elevation', n, 'elevation'), _pNum('Padding', n, 'padding')],
              // ── COLUMN / ROW ──
              if (type == 'column' || type == 'row') ...[
                _pNum('Jarak (gap)', n, 'gap'),
                _pSelect('Align utama', n, 'align', const ['', 'start', 'center', 'end', 'between', 'around']),
                _pSelect('Align silang', n, 'cross', const ['', 'start', 'center', 'end', 'stretch']),
              ],
              // ── GRID ──
              if (type == 'grid' || type == 'gridview') ...[_pNum('Kolom', n, 'columns'), _pNum('Jarak (gap)', n, 'gap'), _pNum('Rasio', n, 'ratio')],
              if (type == 'wrap') _pNum('Jarak (gap)', n, 'gap'),
              if (type == 'padding') _pNum('Padding', n, 'all'),
              if (type == 'sizedbox') ...[_pNum('Lebar', n, 'width'), _pNum('Tinggi', n, 'height')],
              if (type == 'expanded') _pNum('Flex', n, 'flex'),
              if (type == 'icon') ...[_pText('Nama ikon', n, 'icon'), _pNum('Ukuran', n, 'size'), _pColor('Warna', n, 'color')],
              if (type == 'image') ...[_pText('URL', n, 'url'), _pNum('Lebar', n, 'width'), _pNum('Tinggi', n, 'height')],
              if (type == 'switch' || type == 'checkbox') ...[_pText('Field state (bind)', n, 'bind'), _pColor('Warna aktif', n, 'color')],
              if (type == 'slider') ...[_pText('Field state (bind)', n, 'bind'), _pNum('Min', n, 'min'), _pNum('Max', n, 'max'), _pNum('Langkah', n, 'step'), _pColor('Warna', n, 'color')],
              if (type == 'textfield') ...[_pText('Label', n, 'label'), _pText('Hint', n, 'hint'), _pText('Field state (bind)', n, 'bind'), _pBool('Password (obscure)', n, 'obscure'), _pNum('Radius', n, 'radius'), _pText('Ikon prefix', n, 'icon')],
              if (type == 'dropdown' || type == 'select') ...[_pText('Label', n, 'label'), _pText('Field state (bind)', n, 'bind'), _pList('Opsi', n, 'options')],
              if (type == 'radio') ...[_pText('Field state (bind)', n, 'bind'), _pList('Opsi', n, 'options'), _pColor('Warna', n, 'color')],
              if (type == 'progress' || type == 'progressbar') ...[_pNum('Nilai (0–1)', n, 'value'), _pText('Field state (bind)', n, 'bind'), _pColor('Warna', n, 'color'), _pColor('Warna track', n, 'trackColor'), _pNum('Tinggi', n, 'height')],
              if (type == 'chip') ...[_pText('Label', n, 'label'), _pColor('Warna', n, 'color'), _pColor('Warna teks', n, 'textColor'), _pText('Ikon', n, 'icon')],
              const SizedBox(height: 12),
              TextButton(onPressed: () => setState(() => _selNode = null), child: const Text('Tutup pilihan', style: TextStyle(color: _muted))),
            ]);
          }),
    );
  }

  Widget _buildCode() {
    return Container(
      color: const Color(0xFF0B0D11),
      padding: const EdgeInsets.all(12),
      child: TextField(
        controller: _codeCtrl, maxLines: null, expands: true,
        style: const TextStyle(fontFamily: 'monospace', fontSize: 13, color: Color(0xFFCBD5E1), height: 1.5),
        decoration: const InputDecoration(border: InputBorder.none, hintText: 'lib/main.dart — kode Dart Flutter…', hintStyle: TextStyle(color: _muted)),
      ),
    );
  }
}

// ───────────────────────── A2UI renderer ─────────────────────────
// Server-driven UI: render a declarative JSON spec into real Flutter widgets at
// runtime — no Dart codegen, no compile. spec = { state?:{...}, root:{...} } or
// just a node. Each node: { type, ...props, children?:[...] }. Supports simple
// state + actions so counters/calculators work.
class A2UIView extends StatefulWidget {
  final Map<String, dynamic> spec;
  final bool editMode;                       // tap nodes to select (Figma-like editing)
  final Map? selected;                       // currently selected node (for highlight)
  final void Function(Map node)? onSelect;   // called when a node is tapped in editMode
  final VoidCallback? onChange;              // called after a drag-resize mutates a prop
  const A2UIView({super.key, required this.spec, this.editMode = false, this.selected, this.onSelect, this.onChange});
  @override
  State<A2UIView> createState() => _A2UIViewState();
}

class _A2UIViewState extends State<A2UIView> {
  late Map<String, dynamic> _state;
  final GlobalKey _selMeasureKey = GlobalKey();   // measures the selected widget for drag-resize

  @override
  void initState() {
    super.initState();
    _state = Map<String, dynamic>.from(widget.spec['state'] as Map? ?? {});
  }

  @override
  void didUpdateWidget(A2UIView old) {
    super.didUpdateWidget(old);
    if (old.spec != widget.spec) _state = Map<String, dynamic>.from(widget.spec['state'] as Map? ?? {});
  }

  // Interpolate ${field} from state into a string. Supports ${field|default}.
  String _interp(String s) => s.replaceAllMapped(RegExp(r'\$\{(\w+)(?:\|([^}]*))?\}'), (m) => '${_state[m[1]] ?? m[2] ?? ''}');

  void _act(dynamic action) {
    if (action is! Map) return;
    setState(() {
      if (action['set'] != null) _state[action['set']] = action['to'];
      if (action['inc'] != null) _state[action['inc']] = ((num.tryParse('${_state[action['inc']] ?? 0}') ?? 0) + (action['by'] ?? 1));
      if (action['dec'] != null) _state[action['dec']] = ((num.tryParse('${_state[action['dec']] ?? 0}') ?? 0) - (action['by'] ?? 1));
      if (action['append'] != null) _state[action['append']] = '${_state[action['append']] ?? ''}${action['text'] ?? ''}';
      if (action['clear'] != null) _state[action['clear']] = '';
      if (action['backspace'] != null) { final s = '${_state[action['backspace']] ?? ''}'; _state[action['backspace']] = s.isEmpty ? s : s.substring(0, s.length - 1); }
      if (action['eval'] != null) { final r = _calc('${_state[action['eval']] ?? ''}'); _state[action['eval']] = r; }
    });
  }

  // Tiny safe arithmetic evaluator (+ - * / and decimals, with precedence). No Dart eval.
  String _calc(String expr) {
    try {
      final src = expr.replaceAll('×', '*').replaceAll('x', '*').replaceAll('X', '*').replaceAll('÷', '/').replaceAll(':', '/').replaceAll('−', '-');
      final toks = <String>[]; final re = RegExp(r'\d*\.?\d+|[+\-*/()]');
      for (final m in re.allMatches(src)) toks.add(m[0]!);
      int pos = 0;
      late double Function() expr2, term, factor;
      expr2 = () { var v = term(); while (pos < toks.length && (toks[pos] == '+' || toks[pos] == '-')) { final op = toks[pos++]; final r = term(); v = op == '+' ? v + r : v - r; } return v; };
      term = () { var v = factor(); while (pos < toks.length && (toks[pos] == '*' || toks[pos] == '/')) { final op = toks[pos++]; final r = factor(); v = op == '*' ? v * r : v / r; } return v; };
      factor = () { if (pos < toks.length && toks[pos] == '(') { pos++; final v = expr2(); if (pos < toks.length && toks[pos] == ')') pos++; return v; } if (pos < toks.length && toks[pos] == '-') { pos++; return -factor(); } return double.tryParse(toks[pos++]) ?? 0; };
      final result = expr2();
      if (result == result.roundToDouble()) return result.toInt().toString();
      return result.toStringAsFixed(6).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
    } catch (_) { return 'Error'; }
  }

  Color? _color(dynamic v) {
    if (v is! String) return null;
    var h = v.replaceAll('#', '');
    if (h.length == 6) h = 'FF$h';
    final n = int.tryParse(h, radix: 16);
    return n == null ? null : Color(n);
  }
  double? _d(dynamic v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));

  // ---------- design helpers (gradient, shadow, border, alignment, type) ----------
  Alignment? _align(dynamic v) {
    switch ('$v') {
      case 'top': return Alignment.topCenter;
      case 'bottom': return Alignment.bottomCenter;
      case 'left': return Alignment.centerLeft;
      case 'right': return Alignment.centerRight;
      case 'topLeft': case 'topleft': return Alignment.topLeft;
      case 'topRight': case 'topright': return Alignment.topRight;
      case 'bottomLeft': case 'bottomleft': return Alignment.bottomLeft;
      case 'bottomRight': case 'bottomright': return Alignment.bottomRight;
      case 'center': return Alignment.center;
    }
    return null;
  }
  Gradient? _gradient(dynamic v) {
    List? cols; Alignment begin = Alignment.topLeft, end = Alignment.bottomRight;
    if (v is List && v.length >= 2) { cols = v; }
    else if (v is Map && v['colors'] is List) {
      cols = v['colors'];
      begin = _align(v['begin']) ?? begin; end = _align(v['end']) ?? end;
    }
    if (cols == null) return null;
    return LinearGradient(begin: begin, end: end,
      colors: cols.map<Color>((e) => _color(e) ?? Colors.transparent).toList());
  }
  List<BoxShadow>? _shadow(dynamic v) {
    if (v == null || v == false) return null;
    if (v == true) return const [BoxShadow(color: Color(0x33000000), blurRadius: 12, offset: Offset(0, 4))];
    if (v is Map) return [BoxShadow(color: _color(v['color']) ?? const Color(0x33000000),
      blurRadius: _d(v['blur']) ?? 12, spreadRadius: _d(v['spread']) ?? 0,
      offset: Offset(_d(v['dx']) ?? 0, _d(v['dy']) ?? 4))];
    return null;
  }
  BoxBorder? _border(Map n) {
    final w = _d(n['borderWidth']); final c = _color(n['borderColor']);
    if (w == null && c == null) return null;
    return Border.all(color: c ?? const Color(0xFFE0E0E0), width: w ?? 1);
  }
  TextAlign? _textAlign(dynamic v) {
    switch ('$v') {
      case 'center': return TextAlign.center;
      case 'right': case 'end': return TextAlign.right;
      case 'left': case 'start': return TextAlign.left;
      case 'justify': return TextAlign.justify;
    }
    return null;
  }
  FontWeight _weight(dynamic w, dynamic bold) {
    if (bold == true) return FontWeight.bold;
    switch ('$w') {
      case 'bold': case '700': case 'w700': return FontWeight.w700;
      case '100': case 'w100': return FontWeight.w100;
      case '200': case 'w200': return FontWeight.w200;
      case '300': case 'w300': return FontWeight.w300;
      case '400': case 'w400': case 'normal': return FontWeight.w400;
      case '500': case 'w500': return FontWeight.w500;
      case '600': case 'w600': return FontWeight.w600;
      case '800': case 'w800': return FontWeight.w800;
      case '900': case 'w900': return FontWeight.w900;
    }
    return FontWeight.normal;
  }
  // insert spacing (gap) between children of a column/row
  List<Widget> _gap(List<Widget> ws, double? g, bool horizontal) {
    if (g == null || g <= 0 || ws.length < 2) return ws;
    final out = <Widget>[];
    for (var i = 0; i < ws.length; i++) {
      if (i > 0) out.add(SizedBox(width: horizontal ? g : 0, height: horizontal ? 0 : g));
      out.add(ws[i]);
    }
    return out;
  }

  IconData _icon(String name) {
    const m = {'add': Icons.add, 'remove': Icons.remove, 'close': Icons.close, 'check': Icons.check,
      'star': Icons.star, 'star_border': Icons.star_border, 'home': Icons.home, 'settings': Icons.settings,
      'search': Icons.search, 'delete': Icons.delete, 'edit': Icons.edit, 'menu': Icons.menu,
      'favorite': Icons.favorite, 'favorite_border': Icons.favorite_border, 'person': Icons.person,
      'arrow_back': Icons.arrow_back, 'arrow_forward': Icons.arrow_forward, 'play': Icons.play_arrow,
      'pause': Icons.pause, 'stop': Icons.stop, 'share': Icons.share, 'more': Icons.more_vert,
      'notifications': Icons.notifications, 'mail': Icons.mail, 'phone': Icons.phone, 'camera': Icons.camera_alt,
      'shopping_cart': Icons.shopping_cart, 'lock': Icons.lock, 'visibility': Icons.visibility,
      'calendar': Icons.calendar_today, 'location': Icons.location_on, 'wifi': Icons.wifi,
      'battery': Icons.battery_full, 'cloud': Icons.cloud, 'download': Icons.download, 'upload': Icons.upload,
      'refresh': Icons.refresh, 'thumb_up': Icons.thumb_up, 'info': Icons.info, 'warning': Icons.warning,
      'chevron_right': Icons.chevron_right, 'chevron_left': Icons.chevron_left, 'expand_more': Icons.expand_more};
    return m[name] ?? Icons.circle;
  }

  List<Widget> _kids(dynamic c) => (c is List) ? c.map<Widget>(_node).toList() : const [];

  bool _isBtn(String t) => t == 'button' || t == 'elevatedbutton' || t == 'textbutton' || t == 'iconbutton';
  // A row of buttons (a grid) should fill the width evenly so it never overflows
  // the device frame — wrap each cell in Expanded automatically.
  List<Widget> _rowKids(dynamic c) {
    if (c is! List) return const [];
    final allBtn = c.isNotEmpty && c.every((e) => e is Map && _isBtn('${e['type'] ?? ''}'.toLowerCase()));
    if (!allBtn) return c.map<Widget>(_node).toList();
    return c.map<Widget>((e) => Expanded(child: Padding(padding: const EdgeInsets.all(4), child: _node(e)))).toList();
  }
  // Clamp explicit widths: a very large width means "fill" — use infinity so it
  // fits the parent instead of overflowing.
  double? _cw(dynamic v) { final d = _d(v); if (d == null) return null; return d >= 600 ? double.infinity : d; }

  // Wrap a built widget so it can be tapped to select + highlighted, without
  // changing layout (foregroundDecoration paints over the child).
  Widget _wrapSel(dynamic n, Widget w) {
    if (!widget.editMode || n is! Map) return w;
    // Flex widgets (Expanded/Flexible/Spacer) MUST stay direct children of a
    // Row/Column — wrapping them in a Container breaks layout (empty render in
    // edit mode). Skip the selection wrapper for those.
    final t = '${n['type'] ?? ''}'.toLowerCase();
    if (t == 'expanded' || t == 'flexible' || t == 'spacer') return w;
    final sel = identical(n, widget.selected);
    final base = GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => widget.onSelect?.call(n),
      child: Container(
        key: sel ? _selMeasureKey : null,
        foregroundDecoration: BoxDecoration(
          border: Border.all(color: sel ? const Color(0xFF3B82F6) : const Color(0x223B82F6), width: sel ? 2 : 1),
        ),
        child: w,
      ),
    );
    if (!sel) return base;
    // Selected → add draggable resize handles directly on the blue outline so the
    // user can size by dragging instead of typing in the property panel.
    final isText = t == 'text';
    return Stack(clipBehavior: Clip.none, children: [
      base,
      if (!isText) Positioned(top: 0, bottom: 8, right: -5, child: _edgeHandle(n, horizontal: true)),
      if (!isText) Positioned(left: 0, right: 8, bottom: -5, child: _edgeHandle(n, horizontal: false)),
      Positioned(right: -7, bottom: -7, child: _cornerHandle(n, isText)),
    ]);
  }

  Size? _measureSel() {
    try { final ro = _selMeasureKey.currentContext?.findRenderObject(); if (ro is RenderBox && ro.hasSize) return ro.size; } catch (_) {}
    return null;
  }
  Widget _edgeHandle(Map n, {required bool horizontal}) {
    double sw = 0, sh = 0;
    return MouseRegion(
      cursor: horizontal ? SystemMouseCursors.resizeLeftRight : SystemMouseCursors.resizeUpDown,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onPanStart: (_) { final s = _measureSel(); sw = s?.width ?? (_d(n['width']) ?? 0); sh = s?.height ?? (_d(n['height']) ?? 0); },
        onPanUpdate: (d) {
          setState(() {
            if (horizontal) { sw += d.delta.dx; n['width'] = sw.clamp(20.0, 2000.0).roundToDouble(); }
            else { sh += d.delta.dy; n['height'] = sh.clamp(20.0, 2000.0).roundToDouble(); }
          });
        },
        onPanEnd: (_) => widget.onChange?.call(),
        child: Container(width: horizontal ? 14 : null, height: horizontal ? null : 14, alignment: Alignment.center,
          child: Container(width: horizontal ? 4 : 30, height: horizontal ? 30 : 4,
            decoration: BoxDecoration(color: const Color(0xFF3B82F6), borderRadius: BorderRadius.circular(3),
              boxShadow: const [BoxShadow(color: Color(0x553B82F6), blurRadius: 4)]))),
      ),
    );
  }
  Widget _cornerHandle(Map n, bool isText) {
    double sw = 0, sh = 0, sf = 0;
    return MouseRegion(
      cursor: isText ? SystemMouseCursors.resizeUpDown : SystemMouseCursors.resizeUpLeftDownRight,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onPanStart: (_) { final s = _measureSel(); sw = s?.width ?? 0; sh = s?.height ?? 0; sf = _d(n['fontSize']) ?? 14; },
        onPanUpdate: (d) {
          setState(() {
            if (isText) { sf += d.delta.dy * 0.4; n['fontSize'] = sf.clamp(8.0, 160.0).roundToDouble(); }
            else { sw += d.delta.dx; sh += d.delta.dy; n['width'] = sw.clamp(20.0, 2000.0).roundToDouble(); n['height'] = sh.clamp(20.0, 2000.0).roundToDouble(); }
          });
        },
        onPanEnd: (_) => widget.onChange?.call(),
        child: Container(width: 16, height: 16,
          decoration: BoxDecoration(color: const Color(0xFF3B82F6), borderRadius: BorderRadius.circular(4),
            border: Border.all(color: Colors.white, width: 2))),
      ),
    );
  }

  Widget _node(dynamic n) => _wrapSel(n, _buildNode(n));

  Widget _buildNode(dynamic n) {
    if (n == null) return const SizedBox.shrink();
    if (n is String) return Text(_interp(n));
    if (n is! Map) return const SizedBox.shrink();
    final t = ('${n['type'] ?? 'container'}').toLowerCase();
    switch (t) {
      case 'scaffold':
        final body = n['body'] != null ? _node(n['body']) : (n['children'] != null ? Column(children: _kids(n['children'])) : null);
        final grad = _gradient(n['gradient']);
        return Scaffold(
          backgroundColor: _color(n['background']) ?? Colors.white,
          appBar: n['appBar'] != null || n['title'] != null
              ? AppBar(title: Text(_interp('${(n['appBar'] is Map ? n['appBar']['title'] : n['title']) ?? ''}')),
                  backgroundColor: _color(n['appBarColor']),
                  foregroundColor: _color(n['appBarTextColor']))
              : null,
          body: grad != null
              ? Container(decoration: BoxDecoration(gradient: grad), child: body)
              : body,
          floatingActionButton: n['fab'] != null ? _node(n['fab']) : null,
        );
      case 'column':
        return Column(mainAxisAlignment: _mainAxis(n['align']), crossAxisAlignment: _crossAxis(n['cross']), children: _gap(_kids(n['children']), _d(n['gap']), false));
      case 'row':
        return Row(mainAxisAlignment: _mainAxis(n['align']), crossAxisAlignment: _crossAxis(n['cross']), children: _gap(_rowKids(n['children']), _d(n['gap']), true));
      case 'grid':
      case 'gridview':
        return GridView.count(
          crossAxisCount: (n['columns'] is num) ? (n['columns'] as num).toInt() : 2,
          mainAxisSpacing: _d(n['gap']) ?? 8, crossAxisSpacing: _d(n['gap']) ?? 8,
          childAspectRatio: _d(n['ratio']) ?? 1, shrinkWrap: true,
          padding: EdgeInsets.all(_d(n['padding']) ?? 8),
          physics: const NeverScrollableScrollPhysics(), children: _kids(n['children']));
      case 'wrap':
        return Wrap(spacing: _d(n['gap']) ?? 8, runSpacing: _d(n['gap']) ?? 8, children: _kids(n['children']));
      case 'center': return Center(child: _node(n['child']));
      case 'expanded': return Expanded(flex: (n['flex'] ?? 1), child: _node(n['child']));
      case 'spacer': return const Spacer();
      case 'padding': return Padding(padding: EdgeInsets.all(_d(n['all']) ?? 8), child: _node(n['child']));
      case 'sizedbox': return SizedBox(width: _d(n['width']), height: _d(n['height']), child: n['child'] != null ? _node(n['child']) : null);
      case 'container':
        final grad = _gradient(n['gradient']);
        return Container(
          width: _cw(n['width']), height: _d(n['height']),
          alignment: _align(n['alignment']),
          padding: n['padding'] != null ? EdgeInsets.all(_d(n['padding']) ?? 0) : null,
          margin: n['margin'] != null ? EdgeInsets.all(_d(n['margin']) ?? 0) : null,
          decoration: BoxDecoration(
            color: grad == null ? _color(n['color']) : null,
            gradient: grad,
            borderRadius: BorderRadius.circular(_d(n['radius']) ?? 0),
            border: _border(n),
            boxShadow: _shadow(n['shadow']),
          ),
          child: n['child'] != null ? _node(n['child']) : (n['children'] != null ? Column(children: _gap(_kids(n['children']), _d(n['gap']), false)) : null),
        );
      case 'card':
        return Card(
          margin: EdgeInsets.all(_d(n['margin']) ?? 8),
          color: _color(n['color']),
          elevation: _d(n['elevation']) ?? 1,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(_d(n['radius']) ?? 12)),
          child: Padding(padding: EdgeInsets.all(_d(n['padding']) ?? 12), child: _node(n['child'])));
      case 'text':
        return Text(_interp('${n['text'] ?? ''}'),
          textAlign: _textAlign(n['align']),
          style: TextStyle(fontSize: _d(n['fontSize']) ?? 14, color: _color(n['color']),
            letterSpacing: _d(n['letterSpacing']), height: _d(n['lineHeight']),
            fontStyle: n['italic'] == true ? FontStyle.italic : FontStyle.normal,
            fontWeight: _weight(n['weight'], n['bold'])));
      case 'icon': return Icon(_icon('${n['icon'] ?? n['name'] ?? 'circle'}'), size: _d(n['size']) ?? 24, color: _color(n['color']));
      case 'image': return n['url'] != null ? Image.network('${n['url']}', height: _d(n['height']), width: _d(n['width'])) : const SizedBox.shrink();
      case 'button':
      case 'elevatedbutton':
        return ElevatedButton(onPressed: widget.editMode ? () => widget.onSelect?.call(n) : () => _act(n['onTap']),
          style: ElevatedButton.styleFrom(
            backgroundColor: _color(n['color']), foregroundColor: _color(n['textColor']),
            elevation: _d(n['elevation']),
            padding: n['padding'] != null ? EdgeInsets.all(_d(n['padding']) ?? 12) : null,
            shape: n['radius'] != null ? RoundedRectangleBorder(borderRadius: BorderRadius.circular(_d(n['radius']) ?? 8)) : null,
            textStyle: n['fontSize'] != null ? TextStyle(fontSize: _d(n['fontSize']), fontWeight: FontWeight.w600) : const TextStyle(fontWeight: FontWeight.w600)),
          child: Text(_interp('${n['label'] ?? n['text'] ?? 'Button'}')));
      case 'textbutton':
        return TextButton(onPressed: widget.editMode ? () => widget.onSelect?.call(n) : () => _act(n['onTap']),
          style: TextButton.styleFrom(foregroundColor: _color(n['textColor'])),
          child: Text(_interp('${n['label'] ?? n['text'] ?? 'Button'}')));
      case 'iconbutton':
        return IconButton(onPressed: widget.editMode ? () => widget.onSelect?.call(n) : () => _act(n['onTap']), icon: Icon(_icon('${n['icon'] ?? 'add'}'), color: _color(n['color'])));
      case 'textfield':
        return Padding(padding: const EdgeInsets.all(8), child: IgnorePointer(ignoring: widget.editMode, child: TextField(
          obscureText: n['obscure'] == true,
          keyboardType: n['keyboard'] == 'number' ? TextInputType.number : (n['keyboard'] == 'email' ? TextInputType.emailAddress : null),
          onChanged: (v) { if (n['bind'] != null) setState(() => _state[n['bind']] = v); },
          decoration: InputDecoration(
            labelText: n['label'] != null ? '${n['label']}' : null,
            hintText: '${n['hint'] ?? ''}',
            prefixIcon: n['icon'] != null ? Icon(_icon('${n['icon']}')) : null,
            filled: n['fill'] != null, fillColor: _color(n['fill']),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(_d(n['radius']) ?? 4))))));
      case 'switch':
        return SwitchListTile(
          title: Text(_interp('${n['label'] ?? ''}')),
          activeColor: _color(n['color']),
          value: _state[n['bind']] == true,
          onChanged: widget.editMode ? null : (v) { if (n['bind'] != null) setState(() => _state[n['bind']] = v); });
      case 'checkbox':
        return CheckboxListTile(
          title: Text(_interp('${n['label'] ?? ''}')),
          activeColor: _color(n['color']),
          controlAffinity: ListTileControlAffinity.leading,
          value: _state[n['bind']] == true,
          onChanged: widget.editMode ? null : (v) { if (n['bind'] != null) setState(() => _state[n['bind']] = v == true); });
      case 'slider':
        final mn = _d(n['min']) ?? 0, mx = _d(n['max']) ?? 100;
        final cur = (_d(_state[n['bind']]) ?? mn).clamp(mn, mx);
        return Slider(
          min: mn, max: mx, value: cur, activeColor: _color(n['color']),
          divisions: n['step'] != null ? ((mx - mn) / (_d(n['step']) ?? 1)).round() : null,
          label: '${cur.round()}',
          onChanged: widget.editMode ? null : (v) { if (n['bind'] != null) setState(() => _state[n['bind']] = v); });
      case 'dropdown':
      case 'select':
        final opts = (n['options'] is List) ? (n['options'] as List).map((e) => '$e').toList() : <String>[];
        final cur = opts.contains('${_state[n['bind']] ?? ''}') ? '${_state[n['bind']]}' : null;
        return Padding(padding: const EdgeInsets.all(8), child: InputDecorator(
          decoration: InputDecoration(labelText: n['label'] != null ? '${n['label']}' : null, border: const OutlineInputBorder(), contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4)),
          child: DropdownButtonHideUnderline(child: DropdownButton<String>(
            isExpanded: true, value: cur, hint: Text('${n['hint'] ?? 'Pilih…'}'),
            items: opts.map((o) => DropdownMenuItem(value: o, child: Text(o))).toList(),
            onChanged: widget.editMode ? null : (v) { if (n['bind'] != null) setState(() => _state[n['bind']] = v); }))));
      case 'radio':
        final ropts = (n['options'] is List) ? (n['options'] as List).map((e) => '$e').toList() : <String>[];
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: ropts.map((o) => RadioListTile<String>(
          title: Text(o), value: o, activeColor: _color(n['color']),
          groupValue: '${_state[n['bind']] ?? ''}',
          onChanged: widget.editMode ? null : (v) { if (n['bind'] != null) setState(() => _state[n['bind']] = v); })).toList());
      case 'progress':
      case 'progressbar':
        final pv = n['bind'] != null ? _d(_state[n['bind']]) : _d(n['value']);
        return Padding(padding: const EdgeInsets.all(8), child: ClipRRect(borderRadius: BorderRadius.circular(_d(n['radius']) ?? 6),
          child: LinearProgressIndicator(value: pv, minHeight: _d(n['height']) ?? 8,
            color: _color(n['color']), backgroundColor: _color(n['trackColor']) ?? const Color(0x22000000))));
      case 'chip':
        return Chip(label: Text(_interp('${n['label'] ?? n['text'] ?? ''}')),
          backgroundColor: _color(n['color']),
          labelStyle: TextStyle(color: _color(n['textColor'])),
          avatar: n['icon'] != null ? Icon(_icon('${n['icon']}'), size: 18, color: _color(n['textColor'])) : null);
      case 'listview':
      case 'list':
        return ListView(padding: const EdgeInsets.all(8), children: _kids(n['children']));
      case 'divider': return const Divider();
      // ── Enhanced widgets from new packages ──
      case 'google_text':
      case 'gtext':
        final font = '${n['font'] ?? 'poppins'}';
        return Text(_interp('${n['text'] ?? ''}'),
          textAlign: _textAlign(n['align']),
          style: GoogleFonts.getFont(font,
            fontSize: _d(n['fontSize']) ?? 14, color: _color(n['color']),
            letterSpacing: _d(n['letterSpacing']), height: _d(n['lineHeight']),
            fontStyle: n['italic'] == true ? FontStyle.italic : FontStyle.normal,
            fontWeight: _weight(n['weight'], n['bold'])));
      case 'auto_text':
      case 'autotext':
        return AutoSizeText(_interp('${n['text'] ?? ''}'),
          maxLines: (n['maxLines'] ?? 3), minFontSize: _d(n['minFontSize']) ?? 10,
          textAlign: _textAlign(n['align']),
          style: TextStyle(fontSize: _d(n['fontSize']) ?? 14, color: _color(n['color']),
            fontWeight: _weight(n['weight'], n['bold'])));
      case 'animated':
      case 'animate':
        final child = _node(n['child']);
        final dur = (_d(n['duration']) ?? 400).toInt();
        final delay = (_d(n['delay']) ?? 0).toInt();
        final effects = <Effect>[];
        if (n['fadeIn'] == true) effects.add(FadeEffect(duration: Duration(milliseconds: dur)));
        if (n['slideUp'] == true) effects.add(SlideEffect(begin: const Offset(0, 0.3), end: Offset.zero, duration: Duration(milliseconds: dur)));
        if (n['slideDown'] == true) effects.add(SlideEffect(begin: const Offset(0, -0.3), end: Offset.zero, duration: Duration(milliseconds: dur)));
        if (n['scale'] == true) effects.add(ScaleEffect(begin: const Offset(0.8, 0.8), end: const Offset(1, 1), duration: Duration(milliseconds: dur)));
        if (n['shake'] == true) effects.add(ShakeEffect(duration: Duration(milliseconds: dur)));
        if (n['blur'] == true) effects.add(BlurEffect(begin: const Offset(8, 8), end: Offset.zero, duration: Duration(milliseconds: dur)));
        return child.animate(delay: Duration(milliseconds: delay)).animate(onPlay: (c) => c.repeat(), effects: effects.isEmpty ? [FadeEffect(duration: Duration(milliseconds: dur))] : effects);
      case 'shimmer':
        return Shimmer.fromColors(
          baseColor: _color(n['baseColor']) ?? const Color(0xFFE0E0E0),
          highlightColor: _color(n['highlightColor']) ?? const Color(0xFFF5F5F5),
          child: _node(n['child']));
      case 'glass':
      case 'glassmorphism':
        return Container(
          width: _d(n['width']) ?? 200, height: _d(n['height']) ?? 100,
          padding: n['padding'] != null ? EdgeInsets.all(_d(n['padding']) ?? 12) : const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(_d(n['radius']) ?? 16),
            gradient: LinearGradient(
              begin: Alignment.topLeft, end: Alignment.bottomRight,
              colors: [
                (_color(n['color']) ?? Colors.white).withValues(alpha: 0.2),
                (_color(n['color']) ?? Colors.white).withValues(alpha: 0.05),
              ]),
            border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
          ),
          child: n['child'] != null ? _node(n['child']) : null);
      case 'circular_progress':
      case 'circular':
        final cv = n['bind'] != null ? _d(_state[n['bind']]) : _d(n['value']);
        return CircularProgressIndicator(
          value: cv, color: _color(n['color']),
          strokeWidth: _d(n['strokeWidth']) ?? 4,
          backgroundColor: _color(n['trackColor']) ?? const Color(0x22000000));
      case 'linear_percent':
        final lpv = (n['bind'] != null ? _d(_state[n['bind']]) : _d(n['value'])) ?? 0.5;
        return LinearPercentIndicator(
          percent: lpv.clamp(0, 1), lineHeight: _d(n['height']) ?? 12,
          progressColor: _color(n['color']), backgroundColor: _color(n['trackColor']) ?? const Color(0x22000000),
          barRadius: Radius.circular(_d(n['radius']) ?? 6),
          padding: EdgeInsets.all(_d(n['padding']) ?? 8),
          center: n['label'] != null ? Text(_interp('${n['label']}'), style: TextStyle(fontSize: _d(n['fontSize']) ?? 10, color: Colors.white)) : null);
      case 'circular_percent':
        final cpv = (n['bind'] != null ? _d(_state[n['bind']]) : _d(n['value'])) ?? 0.5;
        return CircularPercentIndicator(
          percent: cpv.clamp(0, 1), radius: _d(n['radius']) ?? 40,
          lineWidth: _d(n['strokeWidth']) ?? 8,
          progressColor: _color(n['color']), backgroundColor: _color(n['trackColor']) ?? const Color(0x22000000),
          circularStrokeCap: CircularStrokeCap.round,
          center: n['label'] != null ? Text(_interp('${n['label']}'), style: TextStyle(fontSize: _d(n['fontSize']) ?? 14, fontWeight: FontWeight.bold, color: _color(n['textColor']))) : null);
      case 'chart':
      case 'bar_chart':
        final data = (n['data'] is List) ? (n['data'] as List) : [];
        return SizedBox(height: _d(n['height']) ?? 200,
          child: BarChart(BarChartData(
            barGroups: data.asMap().entries.map((e) => BarChartGroupData(x: e.key,
              barRods: [BarChartRodData(toY: _d(e.value) ?? 0, color: _color(n['color']) ?? const Color(0xFF5EEAD4), width: 16, borderRadius: const BorderRadius.vertical(top: Radius.circular(4)))]
            )).toList(),
            gridData: const FlGridData(show: false),
            borderData: FlBorderData(show: false),
            titlesData: const FlTitlesData(show: false),
          )));
      case 'pie_chart':
        final pdata = (n['data'] is List) ? (n['data'] as List) : [];
        final colors = (n['colors'] is List) ? (n['colors'] as List).map((c) => _color(c) ?? Colors.grey).toList() : [const Color(0xFF5EEAD4), const Color(0xFFFF9500), const Color(0xFFA5A5A5), const Color(0xFF333333)];
        return SizedBox(height: _d(n['height']) ?? 200,
          child: PieChart(PieChartData(sections: pdata.asMap().entries.map((e) =>
            PieChartSectionData(value: _d(e.value) ?? 1, color: colors[e.key % colors.length], radius: _d(n['radius']) ?? 40, showTitle: false)
          ).toList(), centerSpaceRadius: _d(n['innerRadius']) ?? 20)));
      case 'staggered_grid':
      case 'masonry':
        return MasonryGridView.count(
          crossAxisCount: (n['columns'] is num) ? (n['columns'] as num).toInt() : 2,
          mainAxisSpacing: _d(n['gap']) ?? 8, crossAxisSpacing: _d(n['gap']) ?? 8,
          shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
          padding: EdgeInsets.all(_d(n['padding']) ?? 8),
          itemCount: _kids(n['children']).length, itemBuilder: (ctx, i) => _kids(n['children'])[i]);
      case 'spinkit':
        final spType = '${n['spinner'] ?? 'fading_circle'}';
        final spColor = _color(n['color']) ?? const Color(0xFF5EEAD4);
        final spSize = _d(n['size']) ?? 40.0;
        switch (spType) {
          case 'wave': return SpinKitWave(color: spColor, size: spSize);
          case 'pulse': return SpinKitPulse(color: spColor, size: spSize);
          case 'ring': return SpinKitRing(color: spColor, size: spSize, lineWidth: _d(n['strokeWidth']) ?? 4);
          case 'circle': return SpinKitCircle(color: spColor, size: spSize);
          case 'chasing_dots': return SpinKitChasingDots(color: spColor, size: spSize);
          case 'fading_four': return SpinKitFadingFour(color: spColor, size: spSize);
          default: return SpinKitFadingCircle(color: spColor, size: spSize);
        }
      case 'animated_list':
      case 'staggered_list':
        final listKids = _kids(n['children']);
        return AnimationLimiter(child: Column(children:
          List.generate(listKids.length, (i) =>
            AnimationConfiguration.staggeredList(
              position: i, duration: const Duration(milliseconds: 375),
              child: SlideAnimation(verticalOffset: 50,
                child: FadeInAnimation(child: listKids[i]))))));
      case 'svg':
        return n['url'] != null ? SvgPicture.network('${n['url']}', height: _d(n['height']), width: _d(n['width']), color: _color(n['color'])) : const SizedBox.shrink();
      case 'cached_image':
        return n['url'] != null ? CachedNetworkImage(
          imageUrl: '${n['url']}', height: _d(n['height']), width: _d(n['width']),
          fit: BoxFit.cover,
          placeholder: (c, u) => const SpinKitFadingCircle(color: Colors.grey, size: 30),
          errorWidget: (c, u, e) => const Icon(Icons.broken_image, color: Colors.grey)) : const SizedBox.shrink();
      default:
        return n['children'] != null ? Column(children: _kids(n['children'])) : (n['child'] != null ? _node(n['child']) : const SizedBox.shrink());
    }
  }

  MainAxisAlignment _mainAxis(dynamic a) => {
    'center': MainAxisAlignment.center, 'end': MainAxisAlignment.end, 'between': MainAxisAlignment.spaceBetween,
    'around': MainAxisAlignment.spaceAround, 'evenly': MainAxisAlignment.spaceEvenly,
  }[a] ?? MainAxisAlignment.start;
  CrossAxisAlignment _crossAxis(dynamic a) => {
    'center': CrossAxisAlignment.center, 'end': CrossAxisAlignment.end, 'stretch': CrossAxisAlignment.stretch,
  }[a] ?? CrossAxisAlignment.center;

  @override
  Widget build(BuildContext context) {
    final root = widget.spec['root'] ?? widget.spec;
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF5EEAD4), brightness: Brightness.dark),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
        appBarTheme: const AppBarTheme(backgroundColor: Color(0xFF5EEAD4), foregroundColor: Color(0xFF06231F), elevation: 0),
        cardTheme: const CardTheme(elevation: 2, margin: EdgeInsets.all(0)),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Color(0xFFF1F5F9),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
          contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        ),
      ),
      // Build the root (Scaffold) directly — never wrap it in the edit-selection
      // GestureDetector/Container (that broke its background fill → gray). Child
      // nodes are still wrapped for selection via _node() inside _buildNode().
      home: _buildNode(root),
    );
  }
}
