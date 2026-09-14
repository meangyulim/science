/* Circular-orbit teaching models; usable in the browser and in Node validation. */
(function(root) {
  'use strict';
  const TAU = 2 * Math.PI;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rad = d => d * Math.PI / 180;
  const defaults = {
    rv: {mass:1, period:3, inclination:90},
    transit: {radius:0.1, period:3, inclination:90},
    lens: {impact:0.25, mass:1, offset:0.9, planet:true},
    direct: {orbit:8, distance:20, inclination:60, brightness:2, mask:true}
  };
  function overlap(d, r, R=1) {
    if (d >= R+r) return 0;
    if (d <= Math.abs(R-r)) return Math.PI * Math.min(r,R)**2;
    const a = Math.acos(clamp((d*d + r*r-R*R)/(2*d*r), -1, 1));
    const b = Math.acos(clamp((d*d + R*R-r*r)/(2*d*R), -1, 1));
    return r*r*a + R*R*b - 0.5*Math.sqrt(Math.max(0,(-d+r+R)*(d+r-R)*(d-r+R)*(d+r+R)));
  }
  function orbit(t, period, inclination) {
    const theta = TAU*t/period;
    return {theta, x:Math.cos(theta), y:Math.sin(theta)*Math.cos(rad(inclination)), z:Math.sin(theta)*Math.sin(rad(inclination))};
  }
  function rv(t,p) {
    const k = 28.4329*p.mass*(p.period/365.25)**(-1/3)/(1+0.0009546*p.mass)**(2/3)*Math.sin(rad(p.inclination));
    return {...orbit(t,p.period,p.inclination), k, value:k*Math.cos(TAU*t/p.period)};
  }
  function transit(t,p) {
    const pos = orbit(t,p.period,p.inclination);
    const a = 215.032*(p.period/365.25)**(2/3); // a / R_sun for a solar-mass primary
    const separation = a*Math.hypot(pos.x,pos.y);
    const loss = pos.z > 0 ? overlap(separation,p.radius)/Math.PI : 0;
    return {...pos, a, separation, loss, value:100*(1-loss), canTransit:a*Math.cos(rad(p.inclination)) < 1+p.radius};
  }
  function lens(t,p) {
    const tau=t/10, u=Math.hypot(tau,p.impact);
    const base=(u*u+2)/(u*Math.sqrt(u*u+4));
    // The planetary deviation is deliberately schematic, not a binary-lens solver.
    // Its position and width match the highlighted region in the sky-plane view.
    const sigma=0.1*Math.sqrt(p.mass);
    const alignment=Math.exp(-0.5*((p.impact-0.25)/0.14)**2);
    const anomaly=p.planet ? 0.85*Math.sqrt(p.mass)*alignment*Math.exp(-0.5*((tau-p.offset)/sigma)**2) : 0;
    return {tau,u,base,anomaly,alignment,sigma,value:base+anomaly};
  }
  function direct(t,p) {
    const period=p.orbit**1.5;
    const pos=orbit(t,period,p.inclination);
    const separation=p.orbit/p.distance*Math.hypot(pos.x,pos.y);
    const threshold=p.mask ? 0.3+0.9*Math.exp(-((separation/0.45)**2)) : 20;
    return {...pos,period,separation,threshold,detectable:separation>0.15 && p.brightness>threshold,value:separation};
  }
  function domain(method,p) { return method==='lens' ? [-40,40] : method==='direct' ? [0,2*p.orbit**1.5] : [0,12]; }
  const api={TAU,clamp,rad,defaults,overlap,orbit,rv,transit,lens,direct,domain};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.ExoplanetModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
