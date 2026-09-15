/* One clock drives the physical model, observation and graph cursor. */
(() => {
  'use strict';
  const M=window.ExoplanetModel, $=id=>document.getElementById(id);
  const configs={
    rv:{
      kicker:'01 / RADIAL VELOCITY', title:'행성이 별을 흔들면, 파장이 움직입니다.',
      desc:'공통 질량 중심을 도는 별의 운동이 스펙트럼과 속도 곡선에 남습니다.',target:'중심별의 스펙트럼',
      sceneLabel:'궤도 위에서 본 모습',sceneNote:'별의 흔들림은 확대 표시 · 아래쪽은 관측자 방향의 궤도면 투영입니다.',
      obsNote:'흡수선의 좌우 이동을 확대했습니다. 파란색·빨간색은 편이 방향이며 별 자체의 색 변화가 아닙니다.',
      valueLabel:'중심별의 시선 속도',unit:'m/s',graphLabel:'시선 속도 (m/s)',legend:'중심별 시선 속도',baseline:'속도 0',
      limitTitle:'정면에서 보면, 앞뒤 움직임이 사라집니다.',
      limitText:'궤도 경사각을 0°로 바꿔 보세요. 별은 계속 공전하지만 시선에 수직으로 움직이므로 도플러 편이가 없습니다. 그래프가 수평이 되는 것은 행성이 없어서가 아닙니다.',
      clue:'진폭은 질량의 단서, 반복 간격은 공전 주기',clueNote:'별의 질량·주기·궤도 경사 등 다른 조건이 같을 때, 무거운 행성일수록 별의 시선 속도 진폭이 큽니다. 경사각을 모르면 최소 질량을 구합니다.',
      challenge:'질량을 두 배로 바꾸면 무엇이 달라질까요?',challengeNote:'주기는 그대로 두고 질량만 1 → 2 목성 질량으로 바꿔 보세요. 이어서 경사각도 낮춰 보세요.',
      modelNote:'태양 질량의 별과 원궤도를 가정합니다. 시선 속도 진폭은 질량·주기·경사각에 따른 원궤도 식으로 계산합니다. 양수는 멀어짐, 음수는 다가옴입니다. 화면 속 별의 궤도는 확대된 도식이며 실제 거리 척도가 아닙니다.',
      sliders:[['mass','행성 질량',0.2,3,0.1,'목성 질량','가벼움','무거움'],['period','공전 주기',1,12,0.5,'일','빠른 공전','느린 공전'],['inclination','궤도 경사각 i',0,90,1,'°','0° 정면','90° 옆면']],
      presets:[['질량 2배',{mass:2}],['옆면에서 보기',{inclination:90}],['정면에서 보기',{inclination:0}]],limit:{inclination:0},start:0.125
    },
    transit:{
      kicker:'02 / TRANSIT',title:'별 앞을 지날 때, 별빛이 줄어듭니다.',
      desc:'행성이 별을 가리는 면적과 밝기 곡선의 깊이를 연결해 보세요.',target:'중심별의 밝기',
      sceneLabel:'궤도 위에서 본 모습',sceneNote:'궤도 모형은 크기·거리 비율을 확대 표시합니다. 별을 가리는 실제 투영 위치는 관측 화면에서 확인하세요.',
      obsNote:'관측 화면은 별 반지름에 대한 행성 크기·위치 비율을 반영합니다. 별 뒤를 지날 때는 별빛을 가리지 않습니다.',
      valueLabel:'중심별의 상대 밝기',unit:'%',graphLabel:'상대 밝기 (%)',legend:'중심별 밝기',baseline:'평상시 밝기 100%',
      limitTitle:'행성이 있어도, 시선에서 빗나가면 가리지 못합니다.',
      limitText:'경사각을 75°로 낮춰 보세요. 공전은 계속되지만 관측 화면에서는 행성이 별 위쪽을 비켜 갑니다. 식현상은 궤도를 거의 옆면에서 볼 때만 나타납니다.',
      clue:'감소 깊이는 반지름의 단서',clueNote:'완전히 들어온 행성의 밝기 감소율 ≈ (행성 반지름 ÷ 별 반지름)². 이 밝기 곡선만으로 행성의 질량은 알 수 없습니다.',
      challenge:'반지름이 두 배면, 감소 깊이는 몇 배일까요?',challengeNote:'반지름 비 0.10과 0.20을 비교하면 1%와 4%의 감소를 확인할 수 있습니다. 두 경우 모두 옆면(90°)으로 맞추세요.',
      modelNote:'태양과 같은 질량·반지름의 별, 원궤도, 균일한 별 표면 밝기를 가정합니다. 겹친 두 원의 면적으로 밝기 감소를 계산하며 주연 감광·행성 자체의 빛·이차 식은 생략합니다. 공전 주기에 따라 궤도 반지름도 케플러 법칙으로 바뀝니다.',
      sliders:[['radius','행성 반지름 / 별 반지름',0.03,0.2,0.01,'','작은 행성','큰 행성'],['period','공전 주기',1,12,0.5,'일','빠른 공전','느린 공전'],['inclination','궤도 경사각 i',0,90,1,'°','0° 정면','90° 옆면']],
      presets:[['1% 감소',{radius:0.1,inclination:90}],['4% 감소',{radius:0.2,inclination:90}],['별을 비켜 가기',{inclination:75}]],limit:{inclination:75,period:3},start:0.0625
    },
    lens:{
      kicker:'03 / MICROLENSING',title:'앞쪽의 중력이, 뒤쪽 별빛을 모읍니다.',
      desc:'한 번의 우연한 정렬 속에서 배경별의 밝기와 행성의 짧은 흔적을 찾아보세요.',target:'뒤쪽 배경별의 밝기',
      sceneLabel:'하늘에 투영한 상대 위치',sceneNote:'배경별은 뒤쪽, 렌즈별·행성은 앞쪽입니다. 같은 화면에 투영했으며 실제로 서로 충돌하지 않습니다.',
      obsNote:'망원경에서는 분리되지 않는 배경별의 빛을 합쳐 측정합니다. 아래 밝은 점은 그 밝기 변화를 확대해 표현합니다.',
      valueLabel:'배경별의 밝기 증폭',unit:'배',graphLabel:'배경별 밝기 (배)',legend:'행성을 포함한 모형',baseline:'렌즈별만 있을 때',
      limitTitle:'우연한 정렬이 끝나면, 같은 신호가 반복되지 않습니다.',
      limitText:'통과 경로를 빗나가게 하면 배경별의 밝아짐과 행성 흔적이 약해집니다. 공전 주기에 따른 반복 신호가 아니라, 서로 다른 별이 시선에서 우연히 가까워지는 사건입니다. 재생은 사건 끝에서 멈춥니다.',
      clue:'짧은 추가 변화는 렌즈별 주위 행성의 단서',clueNote:'작은 질량의 행성에도 민감할 수 있지만 정렬과 관측 시점이 중요합니다. 실제 행성 신호는 밝아짐뿐 아니라 감소도 나타날 수 있습니다.',
      challenge:'렌즈별의 큰 봉우리와 행성의 짧은 흔적을 구분해 보세요.',challengeNote:'‘행성 영향’ 체크를 끄고 켜 보세요. 행성 위치를 옮기면 짧은 변화가 나타나는 시점도 바뀝니다.',
      modelNote:'렌즈별만의 곡선은 점광원·점렌즈 식 A(u) = (u²+2) / [u√(u²+4)], u² = u₀² + (t/10일)²를 사용합니다. 행성 신호는 위치와 질량 효과를 비교하는 가우스형 교육 도식이며 실제 이중 렌즈 방정식의 해가 아닙니다. 점선 타원은 이 도식에서 행성 영향이 큰 영역입니다. 실제 신호의 부호·모양·발생 위치는 달라질 수 있습니다.',
      sliders:[['impact','배경별과의 최소 이격 u₀',0.1,1.5,0.05,'','가까운 정렬','빗나간 정렬'],['mass','행성 질량',0.1,3,0.1,'목성 질량','짧은 흔적','넓은 흔적'],['offset','행성 흔적의 위치',-1.5,1.5,0.05,'','먼저 통과','나중 통과']],
      checkbox:['planet','행성 영향 포함 (교육용 도식)'],
      presets:[['행성 흔적 보기',{impact:0.25,planet:true},0.6125],['행성 없이',{planet:false}],['빗나가게 하기',{impact:1.5}]],limit:{impact:1.5},start:0.5
    },
    direct:{
      kicker:'04 / DIRECT IMAGING',title:'눈부신 별빛을 가리면, 행성이 드러납니다.',
      desc:'공전 위치·거리·밝기를 바꾸며 별과 행성을 분리해 볼 수 있는지 확인하세요.',target:'행성 자체의 적외선',
      sceneLabel:'궤도 위에서 본 모습',sceneNote:'궤도 배치는 설명용입니다. 관측 화면은 같은 각도 눈금으로 보여주어 멀어질수록 작게 보입니다.',
      obsNote:'중앙 원은 빛 가리개와 분리 한계 0.15″입니다. 화면의 행성 밝기는 비교를 위한 도식입니다.',
      valueLabel:'별과 행성의 겉보기 각거리',unit:'″',graphLabel:'겉보기 각거리 (″)',legend:'별–행성 각거리',baseline:'분리 한계 0.15″',
      limitTitle:'너무 붙어 보이거나 어두우면, 행성이 묻힙니다.',
      limitText:'항성계가 멀면 별과 행성의 겉보기 간격이 작아집니다. 빛 가리개를 꺼도 눈부신 별빛에 묻힙니다. 충분한 각거리, 별빛 억제, 밝은 행성이라는 조건이 함께 필요합니다.',
      clue:'행성의 빛과 위치를 직접 측정',clueNote:'같은 지구 거리라면 별에서 멀리 떨어진 행성은 분리하기 쉽습니다. 젊고 뜨거운 행성은 스스로 내는 적외선이 강해 유리합니다.',
      challenge:'멀어지는 두 종류의 거리를 비교해 보세요.',challengeNote:'‘별–행성 거리’를 늘린 뒤 ‘지구–항성계 거리’를 늘려 보세요. 관측 화면의 간격은 각각 어떻게 달라질까요?',
      modelNote:'태양 질량의 별과 원궤도를 가정해 P² = a³ (년·AU)를 사용합니다. 각거리는 투영된 별–행성 거리(AU) / 지구 거리(pc)로 계산합니다. 0.15″ 분리 한계·별빛 잔광·적외선 밝기는 가상의 장비에 대한 교육용 기준이며 실제 관측 성능이나 검출 확률을 나타내지 않습니다. 적외선 밝기는 같은 별에 대한 상대 세기로 두며 거리 증가에 따른 전체 광자 수 감소는 생략합니다.',
      sliders:[['orbit','별–행성 거리',2,12,0.5,'AU','별 가까이','별에서 멀리'],['distance','지구–항성계 거리',10,100,5,'pc','우리와 가까움','우리와 멂'],['inclination','궤도 경사각 i',0,90,1,'°','0° 정면','90° 옆면'],['brightness','행성의 적외선 밝기',0.1,3,0.1,'상대값','어두움','밝음']],
      checkbox:['mask','별빛 가리개 켜기'],
      presets:[['가리개 끄기',{mask:false}],['먼 항성계',{distance:100}],['어두운 행성',{brightness:0.1}]],limit:{distance:100},start:0
    }
  };
  let method='rv',p={...M.defaults.rv},progress=configs.rv.start,playing=false,speed=1,lastFrame=0,limitSaved=null,transitZoom=false;
  let graphCache='',graphScale=null,lastRender=0;
  const fmt=(n,d=2)=>Math.abs(n)<1e-9 ? (0).toFixed(d) : n.toFixed(d);
  const text=(x,y,content,cls='',anchor='start')=>`<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${content}</text>`;
  const line=(x1,y1,x2,y2,color='#61768a',dash='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
  const circle=(x,y,r,fill,extra='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
  function defs(prefix){return `<defs><radialGradient id="${prefix}-star"><stop stop-color="#fffbe4"/><stop offset=".55" stop-color="#ffdc8a"/><stop offset="1" stop-color="#e8a847"/></radialGradient><radialGradient id="${prefix}-glow"><stop stop-color="#ffe3a1" stop-opacity=".7"/><stop offset="1" stop-color="#e8ad61" stop-opacity="0"/></radialGradient><radialGradient id="${prefix}-planet"><stop stop-color="#b6f1e8"/><stop offset=".5" stop-color="#54bfb4"/><stop offset="1" stop-color="#267d81"/></radialGradient><linearGradient id="spectrum"><stop stop-color="#7562dd"/><stop offset=".2" stop-color="#4694e8"/><stop offset=".42" stop-color="#47cdb9"/><stop offset=".62" stop-color="#e2d770"/><stop offset=".82" stop-color="#e99b66"/><stop offset="1" stop-color="#d76778"/></linearGradient></defs>`;}
  const stars=Array.from({length:34},(_,i)=>circle(10+(i*137)%580,15+(i*83)%285,i%4===0?1.2:.7,'#b3c9dd',`opacity="${.13+(i%3)*.08}"`)).join('');
  function star(x,y,r,prefix){return circle(x,y,r*2.4,`url(#${prefix}-glow)`)+circle(x,y,r,`url(#${prefix}-star)`);}
  function planet(x,y,r,prefix){return circle(x,y,r,`url(#${prefix}-planet)`)+circle(x,y,r+5,'none','stroke="#74dacb" stroke-opacity=".3"');}
  function arrow(x,y,dx,dy,color='#78d8cd') {
    const length=Math.hypot(dx,dy);if(length<2)return '';
    const ux=dx/length,uy=dy/length,ex=x+dx,ey=y+dy;
    return line(x,y,ex,ey,color)+`<path d="M${ex-ux*8-uy*4},${ey-uy*8+ux*4} L${ex},${ey} L${ex-ux*8+uy*4},${ey-uy*8-ux*4}" fill="none" stroke="${color}" stroke-width="2"/>`;
  }
  function domain(){return method==='transit'&&transitZoom?[p.period*.13,p.period*.37]:M.domain(method,p);}
  function timeValue(){const d=domain();return d[0]+progress*(d[1]-d[0]);}
  function setPlaying(value){playing=value;$('play').textContent=value?'Ⅱ 일시정지':(method==='lens'&&progress>=1?'↺ 다시 보기':'▶ 재생');lastFrame=0;}
  function displayParam(key,value,unit){return key==='radius'?fmt(value):key==='impact'||key==='offset'?fmt(value):`${Number.isInteger(value)?value:fmt(value,1)}${unit==='°'?'°':unit?' '+unit:''}`;}
  function chooseMethod(next){
    method=next;p={...M.defaults[next]};progress=configs[next].start;limitSaved=null;transitZoom=false;setPlaying(false);
    document.body.dataset.activeMethod=next;
    $('sky-panel').hidden=next!=='rv';
    $('observation').setAttribute('viewBox',next==='rv'?'0 0 440 155':'0 0 440 215');
    $('observation-step').textContent=next==='rv'?'3':'2';
    $('graph-step').textContent=next==='rv'?'4':'3';
    $('observation-title').textContent=next==='rv'?'별빛의 스펙트럼':'내 시선에서 본 모습';
    $('zoom-transit').hidden=next!=='transit';$('zoom-transit').setAttribute('aria-pressed','false');$('zoom-transit').textContent='식 구간 확대';$('graph-hint').hidden=next==='transit';
    document.querySelectorAll('[data-method]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.method===next)));
    const c=configs[next];
    for(const [id,key] of Object.entries({'method-kicker':'kicker','method-title':'title','method-desc':'desc','target-name':'target','scene-view-label':'sceneLabel','scene-note':'sceneNote','observation-note':'obsNote','value-label':'valueLabel','limit-title':'limitTitle','limit-explanation':'limitText','clue':'clue','clue-note':'clueNote','challenge':'challenge','challenge-note':'challengeNote','model-note':'modelNote'}))$(id).textContent=c[key];
    $('scene-guide').textContent=c.sceneNote;$('observation-guide').textContent=c.obsNote;
    $('parameters').innerHTML=c.sliders.map(([key,label,min,max,step,unit,left,right])=>`<div class="parameter"><div class="range-heading"><label for="param-${key}">${label}</label><output id="out-${key}" for="param-${key}">${displayParam(key,p[key],unit)}</output></div><input id="param-${key}" data-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${p[key]}"><div class="range-ends"><span>${left}</span><span>${right}</span></div></div>`).join('')+(c.checkbox?`<label class="switch-row"><input type="checkbox" id="param-${c.checkbox[0]}" data-key="${c.checkbox[0]}" ${p[c.checkbox[0]]?'checked':''}>${c.checkbox[1]}</label>`:'');
    $('presets').innerHTML=c.presets.map((item,i)=>`<button data-preset="${i}">${item[0]}</button>`).join('');
    $('graph-legend').innerHTML=`<span class="legend-line">${c.legend}</span><span class="legend-line dashed">${c.baseline}</span>`;
    updateParameters();
  }
  function updateParameters(){
    for(const [key,,,,,unit] of configs[method].sliders){$('param-'+key).value=p[key];$('out-'+key).textContent=displayParam(key,p[key],unit);}
    const check=configs[method].checkbox;if(check)$('param-'+check[0]).checked=p[check[0]];
    $('limit-toggle').setAttribute('aria-pressed',String(!!limitSaved));$('limit-toggle').textContent=limitSaved?'원래 조건으로 ↩':'한계 확인 ↗';
    $('quick-limit').setAttribute('aria-pressed',String(!!limitSaved));$('quick-limit').textContent=limitSaved?'조건 복원':'한계 확인';
    const d=domain(),unit=method==='direct'?'년':'일';
    $('time-start').textContent=fmt(d[0],transitZoom?2:0)+unit;$('time-end').textContent=fmt(d[1],transitZoom?2:method==='direct'?1:0)+unit;
    graphCache='';buildGraph();render();
  }
  function drawOrbit(s){
    if(window.matchMedia('(min-width:641px)').matches)return drawCompactOrbit(s);
    const cx=292,cy=140,rx=180,ry=91;
    const th=s.theta,px=cx+rx*Math.cos(th),py=cy+ry*Math.sin(th);
    const wobble=method==='rv'?10+9*p.mass:0;
    const sx=cx-wobble*Math.cos(th),sy=cy-wobble*.62*Math.sin(th);
    let out=defs('s')+stars+`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#5d7387" stroke-dasharray="4 6"/>`;
    out+=line(cx,42,cx,255,'#42586b','3 6')+line(94,cy,487,cy,'#32495c','3 6');
    if(method==='rv')out+=`<ellipse cx="${cx}" cy="${cy}" rx="${wobble}" ry="${wobble*.62}" fill="none" stroke="#9e8b69" stroke-dasharray="3 4"/>`+line(sx,sy,px,py,'#3f5c69','3 5');
    out+=star(sx,sy,20,'s');
    if(method==='rv'){
      out+=line(cx-5,cy,cx+5,cy,'#fff')+line(cx,cy-5,cx,cy+5,'#fff');
      out+=text(26,35,'공통 질량 중심 주위를 함께 공전','bright')+text(26,57,'+ 공통 질량 중심 · 별의 궤도 확대','subtext');
      out+=arrow(sx,sy,wobble*Math.sin(th)*1.3,-wobble*.62*Math.cos(th)*1.3,'#efc66e');
    }else out+=text(26,35,'행성의 공전 위치','bright');
    out+=planet(px,py,method==='transit'?8+p.radius*30:10,'s');
    out+=text(px+(px>cx?-18:18),py-17,'행성','aqua',px>cx?'end':'start');
    out+=text(sx+29,sy+7,'중심별','gold');
    const tilt=p.inclination,projection=Math.sin(M.rad(tilt));
    out+=arrow(cx,253,0,34*projection,'#9dbbd0')+circle(cx,297,9,'#459dc9')+text(cx+17,301,'관측자 방향','bright');
    out+=text(26,294,`i = ${tilt}°${tilt===0?' · 정면':tilt===90?' · 옆면':''}`,'subtext');
    if(tilt===0)out+=text(392,291,'시선은 궤도면에 수직','subtext');
    else out+=text(405,291,'아래 = 가까운 쪽','subtext');
    return out;
  }
  function drawLens(s){
    const cx=295,cy=163,scale=52,lx=cx+s.tau*scale,ly=cy+p.impact*scale;
    const px=lx-p.offset*scale,py=ly-.25*scale;
    let out=defs('s')+stars+text(24,30,'서로 다른 거리의 별이 시선에서 가까워지는 순간','bright');
    out+=line(70,ly,545,ly,'#728ba0','4 6')+arrow(523,ly,21,0,'#728ba0');
    out+=text(24,58,'뒤쪽 배경별 = 고정 / 앞쪽 렌즈별 = 이동','subtext');
    out+=circle(lx,ly,52,'none','stroke="#a6bacb" stroke-opacity=".4" stroke-dasharray="3 5"');
    out+=line(cx,cy,cx,ly,'#8faaba','3 4')+text(570,82,`최소 이격 u₀ = ${fmt(p.impact)}`,'subtext','end');
    out+=star(cx,cy,12,'s')+line(cx-13,cy-10,cx-79,cy-52,'#dfbd7c')+text(cx-83,cy-57,'배경별 (뒤)','gold','end');
    out+=circle(lx,ly,15,'#a79ec0','stroke="#ded9eb" stroke-width="2"')+text(lx,ly+34,'렌즈별 (앞)','','middle');
    if(p.planet){
      out+=line(lx,ly,px,py,'#688994','3 4')+planet(px,py,7,'s');
      out+=`<ellipse cx="${px}" cy="${py}" rx="${Math.max(5,s.sigma*scale*2)}" ry="${.28*scale}" fill="#73dbc5" fill-opacity=".1" stroke="#73dbc5" stroke-dasharray="3 4"/>`;
      const labelX=M.clamp(px+30,180,428);
      out+=line(px,py-10,labelX-5,py-53,'#78ccbb')+text(labelX,py-58,'행성 영향 영역','aqua');
    }
    out+=text(26,293,'렌즈별·행성 → 빛의 경로를 휨 → 배경별의 빛이 모임','subtext');
    return out;
  }
  function rvObservation(s){
    const shift=s.value/450*38;
    let out=defs('o')+text(22,26,'별빛을 펼친 스펙트럼','bright');
    out+=text(22,48,'짧은 파장 · 청색 쪽','subtext')+text(418,48,'긴 파장 · 적색 쪽','subtext','end');
    out+=`<rect x="24" y="62" width="392" height="40" rx="5" fill="url(#spectrum)"/>`;
    for(const x of [112,196,270,344])out+=`<rect x="${x+shift-2}" y="62" width="4" height="40" fill="#132030"/>`+line(x,108,x,124,'#b9c9d5','3 3');
    out+=text(220,145,'점선: 정지한 별의 흡수선 위치','subtext','middle');
    return out;
  }
  function drawCompactOrbit(s){
    const cx=300,cy=100,rx=205,ry=55,wobble=method==='rv'?10+9*p.mass:0;
    const px=cx+rx*Math.cos(s.theta),py=cy+ry*Math.sin(s.theta);
    const sx=cx-wobble*Math.cos(s.theta),sy=cy-wobble*.5*Math.sin(s.theta);
    let out=defs('s')+`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#5d7387" stroke-dasharray="4 6"/>`;
    out+=line(cx,34,cx,170,'#42586b','3 6');
    if(method==='rv')out+=`<ellipse cx="${cx}" cy="${cy}" rx="${wobble}" ry="${wobble*.5}" fill="none" stroke="#9e8b69" stroke-dasharray="3 4"/>`+line(sx,sy,px,py,'#3f5c69','3 5');
    out+=star(sx,sy,16,'s')+planet(px,py,9,'s');
    out+=text(sx+25,sy+7,'중심별','gold')+text(px+(px>cx?-16:16),py-13,'행성','aqua',px>cx?'end':'start');
    if(method==='rv')out+=line(cx-4,cy,cx+4,cy,'#fff')+line(cx,cy-4,cx,cy+4,'#fff')+arrow(sx,sy,wobble*Math.sin(s.theta),-wobble*.5*Math.cos(s.theta),'#efc66e');
    out+=text(24,26,method==='rv'?'공통 질량 중심 주위를 함께 공전':'행성의 공전 위치','subtext');
    out+=arrow(cx,170,0,20*Math.sin(M.rad(p.inclination)),'#9dbbd0')+circle(cx,201,7,'#459dc9')+text(cx+15,206,'관측자 방향','bright');
    out+=text(24,204,`i = ${p.inclination}° · ${p.inclination===0?'정면':p.inclination===90?'옆면':'기울임'}`,'subtext');
    return out;
  }
  function rvSky(s){
    const cx=220,cy=100,flatten=Math.cos(M.rad(p.inclination));
    const wobble=10+9*p.mass,sx=cx-wobble*s.x,sy=cy-wobble*s.y;
    let out=defs('v')+text(18,24,`궤도 경사 i = ${p.inclination}° · ${p.inclination===0?'정면':p.inclination===90?'옆면':'기울어진 모습'}`,'subtext');
    out+=`<ellipse cx="${cx}" cy="${cy}" rx="155" ry="${Math.max(.3,70*flatten)}" fill="none" stroke="#59788b" stroke-dasharray="4 5"/>`;
    out+=`<ellipse cx="${cx}" cy="${cy}" rx="${wobble}" ry="${Math.max(.3,wobble*flatten)}" fill="none" stroke="#b59c6d" stroke-dasharray="3 4"/>`;
    const planetSvg=planet(cx+155*s.x,cy+70*s.y,8,'v');
    if(s.z<=0)out+=planetSvg;
    out+=star(sx,sy,13,'v');
    if(s.z>0)out+=planetSvg;
    out+=line(cx-4,cy,cx+4,cy,'#fff')+line(cx,cy-4,cx,cy+4,'#fff');
    out+=text(18,184,'주황: 중심별 · 초록: 행성 · +: 질량 중심','subtext');
    out+=text(220,207,p.inclination===0?'좌우·상하 운동만 보임 → 시선 속도 0':'화면에 수직인 앞뒤 운동 → 스펙트럼 편이','aqua','middle');
    return out;
  }
  function transitObservation(s){
    const cx=220,cy=102,r=65,x=cx+s.x*s.a*r,y=cy-s.y*s.a*r;
    let out=defs('o')+text(20,25,'관측자의 하늘 · 중심별 확대','subtext');
    out+=line(20,cy,420,cy,'#405568','3 5');
    if(s.z<=0 && x>-20 && x<460 && y>-20 && y<230)out+=planet(x,y,p.radius*r,'o');
    out+=star(cx,cy,r,'o');
    // Uniform disk matches the model's no-limb-darkening assumption.
    out+=circle(cx,cy,r,'#ffd67f');
    if(s.z>0 && x>-20 && x<460 && y>-20 && y<230)out+=circle(x,y,p.radius*r,'#163c4b','stroke="#70cdbd" stroke-width="1"');
    if(x<0||x>440||y<0||y>185)out+=circle(M.clamp(x,15,425),M.clamp(y,43,180),5,'none','stroke="#7cd9c9" stroke-dasharray="2 2"')+text(220,196,'행성은 확대 화면 바깥에 있습니다.','subtext','middle');
    else out+=text(220,196,s.z>0?'앞쪽 통과 · 겹친 면적만큼 별빛 감소':'뒤쪽 통과 · 중심별의 밝기는 그대로','subtext','middle');
    return out;
  }
  function lensObservation(s){
    let out=defs('o')+text(20,26,'관측 대상은 뒤쪽 배경별입니다.','bright');
    const radius=13+Math.min(22,(s.value-1)*5);
    out+=circle(220,104,radius*3.2,'url(#o-glow)')+star(220,104,radius,'o');
    out+=text(220,176,`평상시의 ${fmt(s.value)}배`,'gold','middle');
    out+=text(220,199,'별의 크기가 아닌 밝기의 변화를 표현','subtext','middle');
    return out;
  }
  function directObservation(s){
    const cx=220,cy=102,scale=75,x=cx+s.x*p.orbit/p.distance*scale,y=cy-s.y*p.orbit/p.distance*scale;
    let out=defs('o')+text(20,24,'적외선 관측 · 각도 눈금 고정','subtext');
    for(const r of [37.5,75])out+=circle(cx,cy,r,'none','stroke="#354d61" stroke-dasharray="3 5"');
    out+=line(330,185,405,185,'#9bb4c8')+text(367,204,'1″','subtext','middle');
    if(p.mask){
      out+=circle(cx,cy,30,'url(#o-glow)','opacity=".35"');
      out+=circle(cx,cy,11.25,'#050e18','stroke="#ba9870" stroke-width="1.5"');
      if(s.separation>.15 && s.detectable)out+=planet(x,y,3+p.brightness,'o');
    }else{
      out+=circle(cx,cy,175,'url(#o-glow)')+star(cx,cy,19,'o');
      out+=line(45,cy,395,cy,'#e6d1aa')+line(cx,35,cx,170,'#e6d1aa');
    }
    out+=text(220,193,s.detectable?'행성의 빛을 분리해 관측':'행성의 빛을 분리하기 어려움',s.detectable?'aqua':'subtext','middle');
    return out;
  }
  function buildGraph(){
    const [t0,t1]=domain(),c=configs[method];
    const points=Array.from({length:1001},(_,i)=>{const t=t0+(t1-t0)*i/1000;return {t,...M[method](t,p)};});
    let min,max,baseline;
    if(method==='rv'){max=Math.max(180,M.rv(0,p).k*1.15);min=-max;baseline=0;}
    if(method==='transit'){min=95;max=100.6;baseline=100;}
    if(method==='lens'){min=.8;max=Math.max(3,Math.max(...points.map(s=>s.value))*1.12);baseline=1;}
    if(method==='direct'){min=0;max=Math.max(.3,p.orbit/p.distance*1.12);baseline=.15;}
    const box=$('graph').getBoundingClientRect();
    const wide=window.matchMedia('(min-width:641px)').matches;
    const canvasWidth=wide&&box.height>0?Math.max(620,box.width/box.height*290):620;
    const font=wide&&box.height>0?Math.max(16,12*290/box.height):17;
    $('graph').setAttribute('viewBox',`0 0 ${canvasWidth} 290`);
    $('graph').style.setProperty('--graph-font',font+'px');
    const left=Math.max(65,font*3),right=canvasWidth-24,top=32,bottom=239;
    const gx=t=>left+(t-t0)/(t1-t0)*(right-left),gy=v=>bottom-(v-min)/(max-min)*(bottom-top);
    graphScale={min,max,left,right,top,bottom,t0,t1,gx,gy,font};
    let out=text(left,17,c.graphLabel,'','start');
    if(method==='direct')out+=`<rect x="${left}" y="${gy(.15)}" width="${right-left}" height="${bottom-gy(.15)}" fill="#fff3e2"/>`;
    for(let j=0;j<=4;j++){
      const v=min+(max-min)*j/4,y=gy(v);
      out+=line(left,y,right,y,'#e5ebe9')+`<text x="${left-9}" y="${y+4}" text-anchor="end" fill="#6e808b" font-size="11">${fmt(v,method==='rv'?0:method==='direct'?2:1)}</text>`;
    }
    for(let j=0;j<=4;j++){
      const t=t0+(t1-t0)*j/4,x=gx(t);
      out+=`<text x="${x}" y="${bottom+21}" text-anchor="middle" fill="#6e808b" font-size="11">${fmt(t,transitZoom?2:method==='direct'?1:0)}</text>`;
    }
    out+=`<text x="${(left+right)/2}" y="282" text-anchor="middle" fill="#6e808b" font-size="12">시간 (${method==='direct'?'년':'일'})${method==='lens'?' · 0일 = 렌즈별이 가장 가까운 때':''}</text>`;
    const path=fn=>points.map((s,i)=>`${i?'L':'M'}${gx(s.t).toFixed(2)},${gy(fn(s)).toFixed(2)}`).join(' ');
    if(method==='lens')out+=`<path d="${path(s=>s.base)}" fill="none" stroke="#9b896f" stroke-width="2" stroke-dasharray="6 4"/>`;
    else out+=line(left,gy(baseline),right,gy(baseline),'#aa8c68','6 4');
    out+=`<path d="${path(s=>s.value)}" fill="none" stroke="#168e87" stroke-opacity=".25" stroke-width="3"/>`;
    if(method==='direct')out+=text(right-4,gy(.15)-7,'이 아래는 분리 불가','','end');
    out+=`<path id="curve-progress" fill="none" stroke="#087f80" stroke-width="2.6" stroke-linecap="round"/>`;
    graphCache=out;
    // Reuse points while the clock advances; parameter changes rebuild this cache.
    graphScale.points=points;
  }
  function drawGraph(s,t){
    const g=graphScale,x=g.gx(t),y=g.gy(s.value);
    let out=graphCache;
    const past=g.points.filter(pt=>pt.t<=t);
    past.push({t,value:s.value});
    const path=past.map((pt,i)=>`${i?'L':'M'}${g.gx(pt.t).toFixed(1)},${g.gy(pt.value).toFixed(1)}`).join(' ');
    out=out.replace('id="curve-progress"',`id="curve-progress" d="${path}"`);
    out+=line(x,g.top,x,g.bottom,'#3c7371','4 5')+circle(x,y,7,'#fff','stroke="#087f80" stroke-width="2.5"');
    const labelHalf=Math.max(61,g.font*3.6),labelHeight=Math.max(24,g.font+9);
    const labelX=M.clamp(x,g.left+labelHalf+5,g.right-labelHalf-5),labelY=y<65?y+12:y-labelHeight-8;
    out+=`<rect x="${labelX-labelHalf}" y="${labelY}" width="${labelHalf*2}" height="${labelHeight}" rx="6" fill="#0d6d6c"/>`;
    out+=`<text x="${labelX}" y="${labelY+labelHeight-6}" text-anchor="middle" fill="white" font-size="11">${fmt(s.value,method==='rv'?1:2)} ${configs[method].unit}</text>`;
    $('graph').innerHTML=out;
  }
  function statusAndInsights(s){
    let status='',insight='',quality=1,meter='',warning=false;
    if(method==='rv'){
      warning=p.inclination===0;
      status=warning?'편이 없음':Math.abs(s.value)<.1?'방향 전환 · 시선 속도 0':s.value>0?'멀어짐 · 적색 편이':'다가옴 · 청색 편이';
      quality=Math.sin(M.rad(p.inclination));
      insight=warning?'별은 계속 움직여도 시선 방향 성분이 0이므로 그래프가 수평입니다.':`주기 ${p.period}일 · 속도 진폭 ${fmt(s.k,1)} m/s. 현재 별은 ${Math.abs(s.value)<.1?'시선 방향 속도가 0인 위치입니다.':s.value>0?'우리에게서 멀어지고 있습니다.':'우리에게 다가오고 있습니다.'}`;
      meter=warning?'시선 성분 0':`옆면 대비 ${Math.round(quality*100)}%`;
    }else if(method==='transit'){
      warning=!s.canTransit;quality=1-M.transit(p.period/4,p).value/100;quality=quality/(p.radius*p.radius);
      status=warning?'별을 비켜 감':s.loss>1e-7?`별빛 ${fmt(s.loss*100)}% 감소`:s.z>0?'별 앞쪽 · 아직 겹치지 않음':'별 뒤쪽 · 밝기 유지';
      insight=warning?'현재 경사에서는 별 원반을 가로지르지 않아 밝기 감소가 생기지 않습니다.':`반지름 비 ${fmt(p.radius)} → 중심 통과 시 최대 ${fmt(p.radius*p.radius*100)}% 감소. 밝기 감소는 ${p.period}일마다 반복됩니다.`;
      meter=warning?'식현상 없음':`최대 ${fmt((1-M.transit(p.period/4,p).value/100)*100)}% 감소`;
    }else if(method==='lens'){
      quality=s.alignment;warning=p.impact>.6;
      status=progress>=1?'통과 사건 종료':s.anomaly>.05?'행성의 추가 흔적':Math.abs(s.tau)<.4?'렌즈별의 정렬':'배경별 밝기 관측';
      insight=`렌즈별만: ${fmt(s.base)}배${p.planet?` · 행성 도식의 추가 변화: +${fmt(s.anomaly)}배`:''}. ${progress>=1?'다시 보기는 같은 사건의 되감기입니다.':'전체 봉우리는 일시적 정렬의 신호이며 주기적으로 반복되지 않습니다.'}`;
      meter=warning?'행성 흔적 거의 없음':p.planet?'행성 영향 경로 근처':'행성 영향 끔';if(!p.planet)quality=0;
    }else{
      quality=s.detectable?1:s.separation<.15?Math.min(.3,s.separation/.15*.3):.12;warning=!s.detectable;
      status=!p.mask?'강한 별빛에 묻힘':s.separation<=.15?'분리 한계 안쪽':s.detectable?'행성을 분리해 관측':'행성이 너무 어두움';
      insight=`현재 각거리 ${fmt(s.separation,3)}″ · 분리 한계 0.15″. ${!p.mask?'가리개를 켜 별빛을 억제해 보세요.':s.separation<=.15?'화면에서 별과 행성의 위치가 너무 가깝습니다.':!s.detectable?'각거리가 충분해도 잔광보다 어두워 관측하기 어렵습니다.':'별빛을 억제한 화면에서 행성을 찾을 수 있습니다.'}`;
      meter=s.detectable?'관측 조건 충족':status;
    }
    $('signal-status').textContent=status;$('signal-status').classList.toggle('warning',warning);
    $('graph-insight').textContent=insight;$('limit-bar').style.width=`${M.clamp(quality,0,1)*100}%`;
    $('graph-guide').textContent=insight;
    $('limit-bar').style.background=warning?'#b87939':'#087f80';$('limit-meter-label').textContent=meter;
    $('current-value').textContent=`${method==='rv'&&s.value>.05?'+':''}${fmt(s.value,method==='rv'?1:method==='direct'?3:2)} ${configs[method].unit}`;
  }
  function render(){
    const t=timeValue(),s=M[method](t,p);
    $('scene').setAttribute('viewBox',method!=='lens'&&window.matchMedia('(min-width:641px)').matches?'0 0 600 220':'0 0 600 320');
    $('time').value=Math.round(progress*1000);$('time-value').textContent=`${fmt(t,method==='direct'?1:2)} ${method==='direct'?'년':'일'}`;
    $('time').setAttribute('aria-valuetext',$('time-value').textContent);
    $('scene').innerHTML=method==='lens'?drawLens(s):drawOrbit(s);
    if(method==='rv')$('sky').innerHTML=rvSky(s);
    $('observation').innerHTML=({rv:rvObservation,transit:transitObservation,lens:lensObservation,direct:directObservation})[method](s);
    $('observation').setAttribute('aria-label',`${configs[method].target}: ${fmt(s.value)} ${configs[method].unit}`);
    statusAndInsights(s);drawGraph(s,t);
  }
  document.querySelectorAll('[data-method]').forEach(b=>b.addEventListener('click',()=>chooseMethod(b.dataset.method)));
  $('parameters').addEventListener('input',e=>{
    const key=e.target.dataset.key;if(!key)return;
    p[key]=e.target.type==='checkbox'?e.target.checked:Number(e.target.value);limitSaved=null;updateParameters();
  });
  $('presets').addEventListener('click',e=>{
    const b=e.target.closest('[data-preset]');if(!b)return;
    const item=configs[method].presets[Number(b.dataset.preset)];Object.assign(p,item[1]);if(item[2]!==undefined)progress=item[2];
    limitSaved=null;setPlaying(false);updateParameters();
  });
  $('limit-toggle').addEventListener('click',()=>{
    if(limitSaved){p={...limitSaved};limitSaved=null;}else{limitSaved={...p};Object.assign(p,configs[method].limit);}
    setPlaying(false);updateParameters();
  });
  $('quick-limit').addEventListener('click',()=>$('limit-toggle').click());
  $('play').addEventListener('click',()=>{if(progress>=1)progress=0;setPlaying(!playing);render();});
  $('reset').addEventListener('click',()=>chooseMethod(method));
  $('speed').addEventListener('change',e=>{speed=Number(e.target.value);});
  $('time').addEventListener('input',e=>{setPlaying(false);progress=Number(e.target.value)/1000;render();});
  $('zoom-transit').addEventListener('click',()=>{
    const oldTime=timeValue();transitZoom=!transitZoom;setPlaying(false);
    const [a,b]=domain();progress=transitZoom?.5:M.clamp((oldTime-a)/(b-a),0,1);
    $('zoom-transit').setAttribute('aria-pressed',String(transitZoom));$('zoom-transit').textContent=transitZoom?'전체 주기 보기':'식 구간 확대';updateParameters();
  });
  // Horizontal gestures scrub time; vertical gestures retain native page scrolling.
  function addScrubbing(svg,kind){
    let start=null;
    function seek(e){
      // SVGs may be letterboxed when the tablet viewport changes height.
      const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse()),x=point.x,y=point.y;
      setPlaying(false);
      if(kind==='graph')progress=M.clamp((x-graphScale.left)/(graphScale.right-graphScale.left),0,1);
      else if(method==='lens')progress=M.clamp(((x-295)/52+4)/8,0,1);
      else{
        const compact=window.matchMedia('(min-width:641px)').matches;
        const angle=(Math.atan2((y-(compact?100:140))/(compact?55:91),(x-(compact?300:292))/(compact?205:180))+M.TAU)%M.TAU;
        const period=method==='direct'?p.orbit**1.5:p.period,[a,b]=domain(),t=timeValue();
        const cycle=Math.floor(Math.max(0,t-1e-8)/period);
        progress=M.clamp((cycle*period+angle/M.TAU*period-a)/(b-a),0,1);
      }
      render();
    }
    svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;start={x:e.clientX,y:e.clientY,id:e.pointerId,horizontal:false};svg.setPointerCapture(e.pointerId);});
    svg.addEventListener('pointermove',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(!start.horizontal&&Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){start=null;return;}if(Math.abs(dx)>5){start.horizontal=true;seek(e);}});
    svg.addEventListener('pointerup',e=>{if(start){if(!start.horizontal&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<10)seek(e);start=null;}});
    svg.addEventListener('pointercancel',()=>{start=null;});
  }
  addScrubbing($('graph'),'graph');addScrubbing($('scene'),'scene');
  document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false);});
  function tick(now){
    if(playing){
      if(lastFrame){progress+=Math.min(now-lastFrame,100)/1000*speed/32;if(progress>=1){if(method==='lens'){progress=1;setPlaying(false);}else progress%=1;}}
      lastFrame=now;
      if(now-lastRender>33){render();lastRender=now;}
    }
    requestAnimationFrame(tick);
  }
  chooseMethod('rv');
  new ResizeObserver(()=>{buildGraph();render();}).observe($('graph'));
  requestAnimationFrame(tick);
})();
