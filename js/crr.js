/* ============================================================
   crr.js — Customer Request Review (Quote Workup)
   Ported verbatim from CRRv4.html. Two changes only:
     1) embedded fflate UMD kept as a page global (window.fflate)
     2) the form logic is wrapped in an IIFE so its ~30 helper
        names never touch the workspace's global scope; the only
        export is window.openCrrPanel.
   All document-wide selectors were scoped to #crrRoot so the form
   only ever reads/writes its own fields.
   Phase 1: works exactly as the standalone (local JSON save,
   client-side Word export). Supabase persistence + the My Tasks
   deep-link land in Phase 2.
   ============================================================ */

/* ---- embedded fflate (ZIP) — attaches to window.fflate ---- */
!function(f){typeof module!='undefined'&&typeof exports=='object'?module.exports=f():typeof define!='undefined'&&define.amd?define(f):(typeof self!='undefined'?self:this).fflate=f()}(function(){var _e={};"use strict";var t=(typeof module!='undefined'&&typeof exports=='object'?function(_f){"use strict";var e,t=";var __w=require('worker_threads');__w.parentPort.on('message',function(m){onmessage({data:m})}),postMessage=function(m,t){__w.parentPort.postMessage(m,t)},close=process.exit;self=global";try{e=require("worker_threads").Worker}catch(e){}exports.default=e?function(r,n,o,a,s){var u=!1,i=new e(r+t,{eval:!0}).on("error",(function(e){return s(e,null)})).on("message",(function(e){return s(null,e)})).on("exit",(function(e){e&&!u&&s(Error("exited with code "+e),null)}));return i.postMessage(o,a),i.terminate=function(){return u=!0,e.prototype.terminate.call(i)},i}:function(e,t,r,n,o){setImmediate((function(){return o(Error("async operations unsupported - update to Node 12+ (or Node 10-11 with the --experimental-worker CLI flag)"),null)}));var a=function(){};return{terminate:a,postMessage:a}};return _f}:function(_f){"use strict";var e={};_f.default=function(r,t,s,a,n){var o=new Worker(e[t]||(e[t]=URL.createObjectURL(new Blob([r+';addEventListener("error",function(e){e=e.error;postMessage({$e$:[e.message,e.code,e.stack]})})'],{type:"text/javascript"}))));return o.onmessage=function(e){var r=e.data,t=r.$e$;if(t){var s=Error(t[0]);s.code=t[1],s.stack=t[2],n(s,null)}else n(null,r)},o.postMessage(s,a),o};return _f})({}),n=Uint8Array,r=Uint16Array,e=Int32Array,i=new n([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0]),o=new n([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0]),s=new n([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),a=function(t,n){for(var i=new r(31),o=0;o<31;++o)i[o]=n+=1<<t[o-1];var s=new e(i[30]);for(o=1;o<30;++o)for(var a=i[o];a<i[o+1];++a)s[a]=a-i[o]<<5|o;return{b:i,r:s}},u=a(i,2),h=u.b,f=u.r;h[28]=258,f[258]=28;for(var l=a(o,0),c=l.b,p=l.r,v=new r(32768),d=0;d<32768;++d){var g=(43690&d)>>1|(21845&d)<<1;v[d]=((65280&(g=(61680&(g=(52428&g)>>2|(13107&g)<<2))>>4|(3855&g)<<4))>>8|(255&g)<<8)>>1}var y=function(t,n,e){for(var i=t.length,o=0,s=new r(n);o<i;++o)t[o]&&++s[t[o]-1];var a,u=new r(n);for(o=1;o<n;++o)u[o]=u[o-1]+s[o-1]<<1;if(e){a=new r(1<<n);var h=15-n;for(o=0;o<i;++o)if(t[o])for(var f=o<<4|t[o],l=n-t[o],c=u[t[o]-1]++<<l,p=c|(1<<l)-1;c<=p;++c)a[v[c]>>h]=f}else for(a=new r(i),o=0;o<i;++o)t[o]&&(a[o]=v[u[t[o]-1]++]>>15-t[o]);return a},m=new n(288);for(d=0;d<144;++d)m[d]=8;for(d=144;d<256;++d)m[d]=9;for(d=256;d<280;++d)m[d]=7;for(d=280;d<288;++d)m[d]=8;var b=new n(32);for(d=0;d<32;++d)b[d]=5;var w=y(m,9,0),x=y(m,9,1),z=y(b,5,0),k=y(b,5,1),M=function(t){for(var n=t[0],r=1;r<t.length;++r)t[r]>n&&(n=t[r]);return n},S=function(t,n,r){var e=n/8|0;return(t[e]|t[e+1]<<8)>>(7&n)&r},A=function(t,n){var r=n/8|0;return(t[r]|t[r+1]<<8|t[r+2]<<16)>>(7&n)},T=function(t){return(t+7)/8|0},D=function(t,r,e){return(null==r||r<0)&&(r=0),(null==e||e>t.length)&&(e=t.length),new n(t.subarray(r,e))};_e.FlateErrorCode={UnexpectedEOF:0,InvalidBlockType:1,InvalidLengthLiteral:2,InvalidDistance:3,StreamFinished:4,NoStreamHandler:5,InvalidHeader:6,NoCallback:7,InvalidUTF8:8,ExtraFieldTooLong:9,InvalidDate:10,FilenameTooLong:11,StreamFinishing:12,InvalidZipData:13,UnknownCompressionMethod:14};var C=["unexpected EOF","invalid block type","invalid length/literal","invalid distance","stream finished","no stream handler",,"no callback","invalid UTF-8 data","extra field too long","date not in range 1980-2099","filename too long","stream finishing","invalid zip data"],I=function(t,n,r){var e=Error(n||C[t]);if(e.code=t,Error.captureStackTrace&&Error.captureStackTrace(e,I),!r)throw e;return e},U=function(t,r,e,a){var u=t.length,f=a?a.length:0;if(!u||r.f&&!r.l)return e||new n(0);var l=!e,p=l||2!=r.i,v=r.i;l&&(e=new n(3*u));var d=function(t){var r=e.length;if(t>r){var i=new n(Math.max(2*r,t));i.set(e),e=i}},g=r.f||0,m=r.p||0,b=r.b||0,w=r.l,z=r.d,C=r.m,U=r.n,F=8*u;do{if(!w){g=S(t,m,1);var E=S(t,m+1,3);if(m+=3,!E){var Z=t[(J=T(m)+4)-4]|t[J-3]<<8,q=J+Z;if(q>u){v&&I(0);break}p&&d(b+Z),e.set(t.subarray(J,q),b),r.b=b+=Z,r.p=m=8*q,r.f=g;continue}if(1==E)w=x,z=k,C=9,U=5;else if(2==E){var O=S(t,m,31)+257,G=S(t,m+10,15)+4,L=O+S(t,m+5,31)+1;m+=14;for(var H=new n(L),j=new n(19),N=0;N<G;++N)j[s[N]]=S(t,m+3*N,7);m+=3*G;var P=M(j),B=(1<<P)-1,Y=y(j,P,1);for(N=0;N<L;){var J,K=Y[S(t,m,B)];if(m+=15&K,(J=K>>4)<16)H[N++]=J;else{var Q=0,R=0;for(16==J?(R=3+S(t,m,3),m+=2,Q=H[N-1]):17==J?(R=3+S(t,m,7),m+=3):18==J&&(R=11+S(t,m,127),m+=7);R--;)H[N++]=Q}}var V=H.subarray(0,O),W=H.subarray(O);C=M(V),U=M(W),w=y(V,C,1),z=y(W,U,1)}else I(1);if(m>F){v&&I(0);break}}p&&d(b+131072);for(var X=(1<<C)-1,$=(1<<U)-1,_=m;;_=m){var tt=(Q=w[A(t,m)&X])>>4;if((m+=15&Q)>F){v&&I(0);break}if(Q||I(2),tt<256)e[b++]=tt;else{if(256==tt){_=m,w=null;break}var nt=tt-254;tt>264&&(nt=S(t,m,(1<<(it=i[N=tt-257]))-1)+h[N],m+=it);var rt=z[A(t,m)&$],et=rt>>4;if(rt||I(3),m+=15&rt,W=c[et],et>3){var it=o[et];W+=A(t,m)&(1<<it)-1,m+=it}if(m>F){v&&I(0);break}p&&d(b+131072);var ot=b+nt;if(b<W){var st=f-W,at=Math.min(W,ot);for(st+b<0&&I(3);b<at;++b)e[b]=a[st+b]}for(;b<ot;++b)e[b]=e[b-W]}}r.l=w,r.p=_,r.b=b,r.f=g,w&&(g=1,r.m=C,r.d=z,r.n=U)}while(!g);return b!=e.length&&l?D(e,0,b):e.subarray(0,b)},F=function(t,n,r){var e=n/8|0;t[e]|=r<<=7&n,t[e+1]|=r>>8},E=function(t,n,r){var e=n/8|0;t[e]|=r<<=7&n,t[e+1]|=r>>8,t[e+2]|=r>>16},Z=function(t,e){for(var i=[],o=0;o<t.length;++o)t[o]&&i.push({s:o,f:t[o]});var s=i.length,a=i.slice();if(!s)return{t:N,l:0};if(1==s){var u=new n(i[0].s+1);return u[i[0].s]=1,{t:u,l:1}}i.sort((function(t,n){return t.f-n.f})),i.push({s:-1,f:25001});var h=i[0],f=i[1],l=0,c=1,p=2;for(i[0]={s:-1,f:h.f+f.f,l:h,r:f};c!=s-1;)h=i[i[l].f<i[p].f?l++:p++],f=i[l!=c&&i[l].f<i[p].f?l++:p++],i[c++]={s:-1,f:h.f+f.f,l:h,r:f};var v=a[0].s;for(o=1;o<s;++o)a[o].s>v&&(v=a[o].s);var d=new r(v+1),g=q(i[c-1],d,0);if(g>e){o=0;var y=0,m=g-e,b=1<<m;for(a.sort((function(t,n){return d[n.s]-d[t.s]||t.f-n.f}));o<s;++o){var w=a[o].s;if(!(d[w]>e))break;y+=b-(1<<g-d[w]),d[w]=e}for(y>>=m;y>0;){var x=a[o].s;d[x]<e?y-=1<<e-d[x]++-1:++o}for(;o>=0&&y;--o){var z=a[o].s;d[z]==e&&(--d[z],++y)}g=e}return{t:new n(d),l:g}},q=function(t,n,r){return-1==t.s?Math.max(q(t.l,n,r+1),q(t.r,n,r+1)):n[t.s]=r},O=function(t){for(var n=t.length;n&&!t[--n];);for(var e=new r(++n),i=0,o=t[0],s=1,a=function(t){e[i++]=t},u=1;u<=n;++u)if(t[u]==o&&u!=n)++s;else{if(!o&&s>2){for(;s>138;s-=138)a(32754);s>2&&(a(s>10?s-11<<5|28690:s-3<<5|12305),s=0)}else if(s>3){for(a(o),--s;s>6;s-=6)a(8304);s>2&&(a(s-3<<5|8208),s=0)}for(;s--;)a(o);s=1,o=t[u]}return{c:e.subarray(0,i),n:n}},G=function(t,n){for(var r=0,e=0;e<n.length;++e)r+=t[e]*n[e];return r},L=function(t,n,r){var e=r.length,i=T(n+2);t[i]=255&e,t[i+1]=e>>8,t[i+2]=255^t[i],t[i+3]=255^t[i+1];for(var o=0;o<e;++o)t[i+o+4]=r[o];return 8*(i+4+e)},H=function(t,n,e,a,u,h,f,l,c,p,v){F(n,v++,e),++u[256];for(var d=Z(u,15),g=d.t,x=d.l,k=Z(h,15),M=k.t,S=k.l,A=O(g),T=A.c,D=A.n,C=O(M),I=C.c,U=C.n,q=new r(19),H=0;H<T.length;++H)++q[31&T[H]];for(H=0;H<I.length;++H)++q[31&I[H]];for(var j=Z(q,7),N=j.t,P=j.l,B=19;B>4&&!N[s[B-1]];--B);var Y,J,K,Q,R=p+5<<3,V=G(u,m)+G(h,b)+f,W=G(u,g)+G(h,M)+f+14+3*B+G(q,N)+2*q[16]+3*q[17]+7*q[18];if(c>=0&&R<=V&&R<=W)return L(n,v,t.subarray(c,c+p));if(F(n,v,1+(W<V)),v+=2,W<V){Y=y(g,x,0),J=g,K=y(M,S,0),Q=M;var X=y(N,P,0);for(F(n,v,D-257),F(n,v+5,U-1),F(n,v+10,B-4),v+=14,H=0;H<B;++H)F(n,v+3*H,N[s[H]]);v+=3*B;for(var $=[T,I],_=0;_<2;++_){var tt=$[_];for(H=0;H<tt.length;++H)F(n,v,X[rt=31&tt[H]]),v+=N[rt],rt>15&&(F(n,v,tt[H]>>5&127),v+=tt[H]>>12)}}else Y=w,J=m,K=z,Q=b;for(H=0;H<l;++H){var nt=a[H];if(nt>255){var rt;E(n,v,Y[257+(rt=nt>>18&31)]),v+=J[rt+257],rt>7&&(F(n,v,nt>>23&31),v+=i[rt]);var et=31&nt;E(n,v,K[et]),v+=Q[et],et>3&&(E(n,v,nt>>5&8191),v+=o[et])}else E(n,v,Y[nt]),v+=J[nt]}return E(n,v,Y[256]),v+J[256]},j=new e([65540,131080,131088,131104,262176,1048704,1048832,2114560,2117632]),N=new n(0),P=function(t,s,a,u,h,l){var c=l.z||t.length,v=new n(u+c+5*(1+Math.ceil(c/7e3))+h),d=v.subarray(u,v.length-h),g=l.l,y=7&(l.r||0);if(s){y&&(d[0]=l.r>>3);for(var m=j[s-1],b=m>>13,w=8191&m,x=(1<<a)-1,z=l.p||new r(32768),k=l.h||new r(x+1),M=Math.ceil(a/3),S=2*M,A=function(n){return(t[n]^t[n+1]<<M^t[n+2]<<S)&x},C=new e(25e3),I=new r(288),U=new r(32),F=0,E=0,Z=l.i||0,q=0,O=l.w||0,G=0;Z+2<c;++Z){var N=A(Z),P=32767&Z,B=k[N];if(z[P]=B,k[N]=P,O<=Z){var Y=c-Z;if((F>7e3||q>24576)&&(Y>423||!g)){y=H(t,d,0,C,I,U,E,q,G,Z-G,y),q=F=E=0,G=Z;for(var J=0;J<286;++J)I[J]=0;for(J=0;J<30;++J)U[J]=0}var K=2,Q=0,R=w,V=P-B&32767;if(Y>2&&N==A(Z-V))for(var W=Math.min(b,Y)-1,X=Math.min(32767,Z),$=Math.min(258,Y);V<=X&&--R&&P!=B;){if(t[Z+K]==t[Z+K-V]){for(var _=0;_<$&&t[Z+_]==t[Z+_-V];++_);if(_>K){if(K=_,Q=V,_>W)break;var tt=Math.min(V,_-2),nt=0;for(J=0;J<tt;++J){var rt=Z-V+J&32767,et=rt-z[rt]&32767;et>nt&&(nt=et,B=rt)}}}V+=(P=B)-(B=z[P])&32767}if(Q){C[q++]=268435456|f[K]<<18|p[Q];var it=31&f[K],ot=31&p[Q];E+=i[it]+o[ot],++I[257+it],++U[ot],O=Z+K,++F}else C[q++]=t[Z],++I[t[Z]]}}for(Z=Math.max(Z,O);Z<c;++Z)C[q++]=t[Z],++I[t[Z]];y=H(t,d,g,C,I,U,E,q,G,Z-G,y),g||(l.r=7&y|d[y/8|0]<<3,y-=7,l.h=k,l.p=z,l.i=Z,l.w=O)}else{for(Z=l.w||0;Z<c+g;Z+=65535){var st=Z+65535;st>=c&&(d[y/8|0]=g,st=c),y=L(d,y+1,t.subarray(Z,st))}l.i=c}return D(v,0,u+T(y)+h)},B=function(){for(var t=new Int32Array(256),n=0;n<256;++n){for(var r=n,e=9;--e;)r=(1&r&&-306674912)^r>>>1;t[n]=r}return t}(),Y=function(){var t=-1;return{p:function(n){for(var r=t,e=0;e<n.length;++e)r=B[255&r^n[e]]^r>>>8;t=r},d:function(){return~t}}},J=function(){var t=1,n=0;return{p:function(r){for(var e=t,i=n,o=0|r.length,s=0;s!=o;){for(var a=Math.min(s+2655,o);s<a;++s)i+=e+=r[s];e=(65535&e)+15*(e>>16),i=(65535&i)+15*(i>>16)}t=e,n=i},d:function(){return(255&(t%=65521))<<24|(65280&t)<<8|(255&(n%=65521))<<8|n>>8}}},K=function(t,r,e,i,o){if(!o&&(o={l:1},r.dictionary)){var s=r.dictionary.subarray(-32768),a=new n(s.length+t.length);a.set(s),a.set(t,s.length),t=a,o.w=s.length}return P(t,null==r.level?6:r.level,null==r.mem?o.l?Math.ceil(1.5*Math.max(8,Math.min(13,Math.log(t.length)))):20:12+r.mem,e,i,o)},Q=function(t,n){var r={};for(var e in t)r[e]=t[e];for(var e in n)r[e]=n[e];return r},R=function(t,n,r){for(var e=t(),i=""+t,o=i.slice(i.indexOf("[")+1,i.lastIndexOf("]")).replace(/\s+/g,"").split(","),s=0;s<e.length;++s){var a=e[s],u=o[s];if("function"==typeof a){n+=";"+u+"=";var h=""+a;if(a.prototype)if(-1!=h.indexOf("[native code]")){var f=h.indexOf(" ",8)+1;n+=h.slice(f,h.indexOf("(",f))}else for(var l in n+=h,a.prototype)n+=";"+u+".prototype."+l+"="+a.prototype[l];else n+=h}else r[u]=a}return n},V=[],W=function(t){var n=[];for(var r in t)t[r].buffer&&n.push((t[r]=new t[r].constructor(t[r])).buffer);return n},X=function(n,r,e,i){if(!V[e]){for(var o="",s={},a=n.length-1,u=0;u<a;++u)o=R(n[u],o,s);V[e]={c:R(n[a],o,s),e:s}}var h=Q({},V[e].e);return(0,t.default)(V[e].c+";onmessage=function(e){for(var k in e.data)self[k]=e.data[k];onmessage="+r+"}",e,h,W(h),i)},$=function(){return[n,r,e,i,o,s,h,c,x,k,v,C,y,M,S,A,T,D,I,U,Tt,it,ot]},_=function(){return[n,r,e,i,o,s,f,p,w,m,z,b,v,j,N,y,F,E,Z,q,O,G,L,H,T,D,P,K,kt,it]},tt=function(){return[pt,gt,ct,Y,B]},nt=function(){return[vt,dt]},rt=function(){return[yt,ct,J]},et=function(){return[mt]},it=function(t){return postMessage(t,[t.buffer])},ot=function(t){return t&&{out:t.size&&new n(t.size),dictionary:t.dictionary}},st=function(t,n,r,e,i,o){var s=X(r,e,i,(function(t,n){s.terminate(),o(t,n)}));return s.postMessage([t,n],n.consume?[t.buffer]:[]),function(){s.terminate()}},at=function(t){return t.ondata=function(t,n){return postMessage([t,n],[t.buffer])},function(n){n.data.length?(t.push(n.data[0],n.data[1]),postMessage([n.data[0].length])):t.flush()}},ut=function(t,n,r,e,i,o,s){var a,u=X(t,e,i,(function(t,r){t?(u.terminate(),n.ondata.call(n,t)):Array.isArray(r)?1==r.length?(n.queuedSize-=r[0],n.ondrain&&n.ondrain(r[0])):(r[1]&&u.terminate(),n.ondata.call(n,t,r[0],r[1])):s(r)}));u.postMessage(r),n.queuedSize=0,n.push=function(t,r){n.ondata||I(5),a&&n.ondata(I(4,0,1),null,!!r),n.queuedSize+=t.length,u.postMessage([t,a=r],[t.buffer])},n.terminate=function(){u.terminate()},o&&(n.flush=function(){u.postMessage([])})},ht=function(t,n){return t[n]|t[n+1]<<8},ft=function(t,n){return(t[n]|t[n+1]<<8|t[n+2]<<16|t[n+3]<<24)>>>0},lt=function(t,n){return ft(t,n)+4294967296*ft(t,n+4)},ct=function(t,n,r){for(;r;++n)t[n]=r,r>>>=8},pt=function(t,n){var r=n.filename;if(t[0]=31,t[1]=139,t[2]=8,t[8]=n.level<2?4:9==n.level?2:0,t[9]=3,0!=n.mtime&&ct(t,4,Math.floor(new Date(n.mtime||Date.now())/1e3)),r){t[3]=8;for(var e=0;e<=r.length;++e)t[e+10]=r.charCodeAt(e)}},vt=function(t){31==t[0]&&139==t[1]&&8==t[2]||I(6,"invalid gzip data");var n=t[3],r=10;4&n&&(r+=2+(t[10]|t[11]<<8));for(var e=(n>>3&1)+(n>>4&1);e>0;e-=!t[r++]);return r+(2&n)},dt=function(t){var n=t.length;return(t[n-4]|t[n-3]<<8|t[n-2]<<16|t[n-1]<<24)>>>0},gt=function(t){return 10+(t.filename?t.filename.length+1:0)},yt=function(t,n){var r=n.level,e=0==r?0:r<6?1:9==r?3:2;if(t[0]=120,t[1]=e<<6|(n.dictionary&&32),t[1]|=31-(t[0]<<8|t[1])%31,n.dictionary){var i=J();i.p(n.dictionary),ct(t,2,i.d())}},mt=function(t,n){return(8!=(15&t[0])||t[0]>>4>7||(t[0]<<8|t[1])%31)&&I(6,"invalid zlib data"),(t[1]>>5&1)==+!n&&I(6,"invalid zlib data: "+(32&t[1]?"need":"unexpected")+" dictionary"),2+(t[1]>>3&4)};function bt(t,n){return"function"==typeof t&&(n=t,t={}),this.ondata=n,t}var wt=function(){function t(t,r){if("function"==typeof t&&(r=t,t={}),this.ondata=r,this.o=t||{},this.s={l:0,i:32768,w:32768,z:32768},this.b=new n(98304),this.o.dictionary){var e=this.o.dictionary.subarray(-32768);this.b.set(e,32768-e.length),this.s.i=32768-e.length}}return t.prototype.p=function(t,n){this.ondata(K(t,this.o,0,0,this.s),n)},t.prototype.push=function(t,r){this.ondata||I(5),this.s.l&&I(4);var e=t.length+this.s.z;if(e>this.b.length){if(e>2*this.b.length-32768){var i=new n(-32768&e);i.set(this.b.subarray(0,this.s.z)),this.b=i}var o=this.b.length-this.s.z;this.b.set(t.subarray(0,o),this.s.z),this.s.z=this.b.length,this.p(this.b,!1),this.b.set(this.b.subarray(-32768)),this.b.set(t.subarray(o),32768),this.s.z=t.length-o+32768,this.s.i=32766,this.s.w=32768}else this.b.set(t,this.s.z),this.s.z+=t.length;this.s.l=1&r,(this.s.z>this.s.w+8191||r)&&(this.p(this.b,r||!1),this.s.w=this.s.i,this.s.i-=2)},t.prototype.flush=function(){this.ondata||I(5),this.s.l&&I(4),this.p(this.b,!1),this.s.w=this.s.i,this.s.i-=2},t}();_e.Deflate=wt;var xt=function(){return function(t,n){ut([_,function(){return[at,wt]}],this,bt.call(this,t,n),(function(t){var n=new wt(t.data);onmessage=at(n)}),6,1)}}();function zt(t,n,r){return r||(r=n,n={}),"function"!=typeof r&&I(7),st(t,n,[_],(function(t){return it(kt(t.data[0],t.data[1]))}),0,r)}function kt(t,n){return K(t,n||{},0,0)}_e.AsyncDeflate=xt,_e.deflate=zt,_e.deflateSync=kt;var Mt=function(){function t(t,r){"function"==typeof t&&(r=t,t={}),this.ondata=r;var e=t&&t.dictionary&&t.dictionary.subarray(-32768);this.s={i:0,b:e?e.length:0},this.o=new n(32768),this.p=new n(0),e&&this.o.set(e)}return t.prototype.e=function(t){if(this.ondata||I(5),this.d&&I(4),this.p.length){if(t.length){var r=new n(this.p.length+t.length);r.set(this.p),r.set(t,this.p.length),this.p=r}}else this.p=t},t.prototype.c=function(t){this.s.i=+(this.d=t||!1);var n=this.s.b,r=U(this.p,this.s,this.o);this.ondata(D(r,n,this.s.b),this.d),this.o=D(r,this.s.b-32768),this.s.b=this.o.length,this.p=D(this.p,this.s.p/8|0),this.s.p&=7},t.prototype.push=function(t,n){this.e(t),this.c(n)},t}();_e.Inflate=Mt;var St=function(){return function(t,n){ut([$,function(){return[at,Mt]}],this,bt.call(this,t,n),(function(t){var n=new Mt(t.data);onmessage=at(n)}),7,0)}}();function At(t,n,r){return r||(r=n,n={}),"function"!=typeof r&&I(7),st(t,n,[$],(function(t){return it(Tt(t.data[0],ot(t.data[1])))}),1,r)}function Tt(t,n){return U(t,{i:2},n&&n.out,n&&n.dictionary)}_e.AsyncInflate=St,_e.inflate=At,_e.inflateSync=Tt;var Dt=function(){function t(t,n){this.c=Y(),this.l=0,this.v=1,wt.call(this,t,n)}return t.prototype.push=function(t,n){this.c.p(t),this.l+=t.length,wt.prototype.push.call(this,t,n)},t.prototype.p=function(t,n){var r=K(t,this.o,this.v&&gt(this.o),n&&8,this.s);this.v&&(pt(r,this.o),this.v=0),n&&(ct(r,r.length-8,this.c.d()),ct(r,r.length-4,this.l)),this.ondata(r,n)},t.prototype.flush=function(){wt.prototype.flush.call(this)},t}();_e.Gzip=Dt,_e.Compress=Dt;var Ct=function(){return function(t,n){ut([_,tt,function(){return[at,wt,Dt]}],this,bt.call(this,t,n),(function(t){var n=new Dt(t.data);onmessage=at(n)}),8,1)}}();function It(t,n,r){return r||(r=n,n={}),"function"!=typeof r&&I(7),st(t,n,[_,tt,function(){return[Ut]}],(function(t){return it(Ut(t.data[0],t.data[1]))}),2,r)}function Ut(t,n){n||(n={});var r=Y(),e=t.length;r.p(t);var i=K(t,n,gt(n),8),o=i.length;return pt(i,n),ct(i,o-8,r.d()),ct(i,o-4,e),i}_e.AsyncGzip=Ct,_e.AsyncCompress=Ct,_e.gzip=It,_e.compress=It,_e.gzipSync=Ut,_e.compressSync=Ut;var Ft=function(){function t(t,n){this.v=1,this.r=0,Mt.call(this,t,n)}return t.prototype.push=function(t,r){if(Mt.prototype.e.call(this,t),this.r+=t.length,this.v){var e=this.p.subarray(this.v-1),i=e.length>3?vt(e):4;if(i>e.length){if(!r)return}else this.v>1&&this.onmember&&this.onmember(this.r-e.length);this.p=e.subarray(i),this.v=0}Mt.prototype.c.call(this,r),!this.s.f||this.s.l||r||(this.v=T(this.s.p)+9,this.s={i:0},this.o=new n(0),this.push(new n(0),r))},t}();_e.Gunzip=Ft;var Et=function(){return function(t,n){var r=this;ut([$,nt,function(){return[at,Mt,Ft]}],this,bt.call(this,t,n),(function(t){var n=new Ft(t.data);n.onmember=function(t){return postMessage(t)},onmessage=at(n)}),9,0,(function(t){return r.onmember&&r.onmember(t)}))}}();function Zt(t,n,r){return r||(r=n,n={}),"function"!=typeof r&&I(7),st(t,n,[$,nt,function(){return[qt]}],(function(t){return it(qt(t.data[0],t.data[1]))}),3,r)}function qt(t,r){var e=vt(t);return e+8>t.length&&I(6,"invalid gzip data"),U(t.subarray(e,-8),{i:2},r&&r.out||new n(dt(t)),r&&r.dictionary)}_e.AsyncGunzip=Et,_e.gunzip=Zt,_e.gunzipSync=qt;var Ot=function(){function t(t,n){this.c=J(),this.v=1,wt.call(this,t,n)}return t.prototype.push=function(t,n){this.c.p(t),wt.prototype.push.call(this,t,n)},t.prototype.p=function(t,n){var r=K(t,this.o,this.v&&(this.o.dictionary?6:2),n&&4,this.s);this.v&&(yt(r,this.o),this.v=0),n&&ct(r,r.length-4,this.c.d()),this.ondata(r,n)},t.prototype.flush=function(){wt.prototype.flush.call(this)},t}();_e.Zlib=Ot;var Gt=function(){return function(t,n){ut([_,rt,function(){return[at,wt,Ot]}],this,bt.call(this,t,n),(function(t){var n=new Ot(t.data);onmessage=at(n)}),10,1)}}();function Lt(t,n,r){return r||(r=n,n={}),"function"!=typeof r&&I(7),st(t,n,[_,rt,function(){return[Ht]}],(function(t){return it(Ht(t.data[0],t.data[1]))}),4,r)}function Ht(t,n){n||(n={});var r=J();r.p(t);var e=K(t,n,n.dictionary?6:2,4);return yt(e,n),ct(e,e.length-4,r.d()),e}_e.AsyncZlib=Gt,_e.zlib=Lt,_e.zlibSync=Ht;var jt=function(){function t(t,n){Mt.call(this,t,n),this.v=t&&t.dictionary?2:1}return t.prototype.push=function(t,n){if(Mt.prototype.e.call(this,t),this.v){if(this.p.length<6&&!n)return;this.p=this.p.subarray(mt(this.p,this.v-1)),this.v=0}n&&(this.p.length<4&&I(6,"invalid zlib data"),this.p=this.p.subarray(0,-4)),Mt.prototype.c.call(this,n)},t}();_e.Unzlib=jt;var Nt=function(){return function(t,n){ut([$,et,function(){return[at,Mt,jt]}],this,bt.call(this,t,n),(function(t){var n=new jt(t.data);onmessage=at(n)}),11,0)}}();function Pt(t,n,r){return r||(r=n,n={}),"function"!=typeof r&&I(7),st(t,n,[$,et,function(){return[Bt]}],(function(t){return it(Bt(t.data[0],ot(t.data[1])))}),5,r)}function Bt(t,n){return U(t.subarray(mt(t,n&&n.dictionary),-4),{i:2},n&&n.out,n&&n.dictionary)}_e.AsyncUnzlib=Nt,_e.unzlib=Pt,_e.unzlibSync=Bt;var Yt=function(){function t(t,n){this.o=bt.call(this,t,n)||{},this.G=Ft,this.I=Mt,this.Z=jt}return t.prototype.i=function(){var t=this;this.s.ondata=function(n,r){t.ondata(n,r)}},t.prototype.push=function(t,r){if(this.ondata||I(5),this.s)this.s.push(t,r);else{if(this.p&&this.p.length){var e=new n(this.p.length+t.length);e.set(this.p),e.set(t,this.p.length)}else this.p=t;this.p.length>2&&(this.s=31==this.p[0]&&139==this.p[1]&&8==this.p[2]?new this.G(this.o):8!=(15&this.p[0])||this.p[0]>>4>7||(this.p[0]<<8|this.p[1])%31?new this.I(this.o):new this.Z(this.o),this.i(),this.s.push(this.p,r),this.p=null)}},t}();_e.Decompress=Yt;var Jt=function(){function t(t,n){Yt.call(this,t,n),this.queuedSize=0,this.G=Et,this.I=St,this.Z=Nt}return t.prototype.i=function(){var t=this;this.s.ondata=function(n,r,e){t.ondata(n,r,e)},this.s.ondrain=function(n){t.queuedSize-=n,t.ondrain&&t.ondrain(n)}},t.prototype.push=function(t,n){this.queuedSize+=t.length,Yt.prototype.push.call(this,t,n)},t}();function Kt(t,n,r){return r||(r=n,n={}),"function"!=typeof r&&I(7),31==t[0]&&139==t[1]&&8==t[2]?Zt(t,n,r):8!=(15&t[0])||t[0]>>4>7||(t[0]<<8|t[1])%31?At(t,n,r):Pt(t,n,r)}function Qt(t,n){return 31==t[0]&&139==t[1]&&8==t[2]?qt(t,n):8!=(15&t[0])||t[0]>>4>7||(t[0]<<8|t[1])%31?Tt(t,n):Bt(t,n)}_e.AsyncDecompress=Jt,_e.decompress=Kt,_e.decompressSync=Qt;var Rt=function(t,r,e,i){for(var o in t){var s=t[o],a=r+o,u=i;Array.isArray(s)&&(u=Q(i,s[1]),s=s[0]),s instanceof n?e[a]=[s,u]:(e[a+="/"]=[new n(0),u],Rt(s,a,e,i))}},Vt="undefined"!=typeof TextEncoder&&new TextEncoder,Wt="undefined"!=typeof TextDecoder&&new TextDecoder,Xt=0;try{Wt.decode(N,{stream:!0}),Xt=1}catch(t){}var $t=function(t){for(var n="",r=0;;){var e=t[r++],i=(e>127)+(e>223)+(e>239);if(r+i>t.length)return{s:n,r:D(t,r-1)};i?3==i?(e=((15&e)<<18|(63&t[r++])<<12|(63&t[r++])<<6|63&t[r++])-65536,n+=String.fromCharCode(55296|e>>10,56320|1023&e)):n+=String.fromCharCode(1&i?(31&e)<<6|63&t[r++]:(15&e)<<12|(63&t[r++])<<6|63&t[r++]):n+=String.fromCharCode(e)}},_t=function(){function t(t){this.ondata=t,Xt?this.t=new TextDecoder:this.p=N}return t.prototype.push=function(t,r){if(this.ondata||I(5),r=!!r,this.t)return this.ondata(this.t.decode(t,{stream:!0}),r),void(r&&(this.t.decode().length&&I(8),this.t=null));this.p||I(4);var e=new n(this.p.length+t.length);e.set(this.p),e.set(t,this.p.length);var i=$t(e),o=i.s,s=i.r;r?(s.length&&I(8),this.p=null):this.p=s,this.ondata(o,r)},t}();_e.DecodeUTF8=_t;var tn=function(){function t(t){this.ondata=t}return t.prototype.push=function(t,n){this.ondata||I(5),this.d&&I(4),this.ondata(nn(t),this.d=n||!1)},t}();function nn(t,r){if(r){for(var e=new n(t.length),i=0;i<t.length;++i)e[i]=t.charCodeAt(i);return e}if(Vt)return Vt.encode(t);var o=t.length,s=new n(t.length+(t.length>>1)),a=0,u=function(t){s[a++]=t};for(i=0;i<o;++i){if(a+5>s.length){var h=new n(a+8+(o-i<<1));h.set(s),s=h}var f=t.charCodeAt(i);f<128||r?u(f):f<2048?(u(192|f>>6),u(128|63&f)):f>55295&&f<57344?(u(240|(f=65536+(1047552&f)|1023&t.charCodeAt(++i))>>18),u(128|f>>12&63),u(128|f>>6&63),u(128|63&f)):(u(224|f>>12),u(128|f>>6&63),u(128|63&f))}return D(s,0,a)}function rn(t,n){if(n){for(var r="",e=0;e<t.length;e+=16384)r+=String.fromCharCode.apply(null,t.subarray(e,e+16384));return r}if(Wt)return Wt.decode(t);var i=$t(t),o=i.s;return(r=i.r).length&&I(8),o}_e.EncodeUTF8=tn,_e.strToU8=nn,_e.strFromU8=rn;var en=function(t){return 1==t?3:t<6?2:9==t?1:0},on=function(t,n){return n+30+ht(t,n+26)+ht(t,n+28)},sn=function(t,n,r){var e=ht(t,n+28),i=rn(t.subarray(n+46,n+46+e),!(2048&ht(t,n+8))),o=n+46+e,s=ft(t,n+20),a=r&&4294967295==s?an(t,o):[s,ft(t,n+24),ft(t,n+42)],u=a[0],h=a[1],f=a[2];return[ht(t,n+10),u,h,i,o+ht(t,n+30)+ht(t,n+32),f]},an=function(t,n){for(;1!=ht(t,n);n+=4+ht(t,n+2));return[lt(t,n+12),lt(t,n+4),lt(t,n+20)]},un=function(t){var n=0;if(t)for(var r in t){var e=t[r].length;e>65535&&I(9),n+=e+4}return n},hn=function(t,n,r,e,i,o,s,a){var u=e.length,h=r.extra,f=a&&a.length,l=un(h);ct(t,n,null!=s?33639248:67324752),n+=4,null!=s&&(t[n++]=20,t[n++]=r.os),t[n]=20,n+=2,t[n++]=r.flag<<1|(o<0&&8),t[n++]=i&&8,t[n++]=255&r.compression,t[n++]=r.compression>>8;var c=new Date(null==r.mtime?Date.now():r.mtime),p=c.getFullYear()-1980;if((p<0||p>119)&&I(10),ct(t,n,p<<25|c.getMonth()+1<<21|c.getDate()<<16|c.getHours()<<11|c.getMinutes()<<5|c.getSeconds()>>1),n+=4,-1!=o&&(ct(t,n,r.crc),ct(t,n+4,o<0?-o-2:o),ct(t,n+8,r.size)),ct(t,n+12,u),ct(t,n+14,l),n+=16,null!=s&&(ct(t,n,f),ct(t,n+6,r.attrs),ct(t,n+10,s),n+=14),t.set(e,n),n+=u,l)for(var v in h){var d=h[v],g=d.length;ct(t,n,+v),ct(t,n+2,g),t.set(d,n+4),n+=4+g}return f&&(t.set(a,n),n+=f),n},fn=function(t,n,r,e,i){ct(t,n,101010256),ct(t,n+8,r),ct(t,n+10,r),ct(t,n+12,e),ct(t,n+16,i)},ln=function(){function t(t){this.filename=t,this.c=Y(),this.size=0,this.compression=0}return t.prototype.process=function(t,n){this.ondata(null,t,n)},t.prototype.push=function(t,n){this.ondata||I(5),this.c.p(t),this.size+=t.length,n&&(this.crc=this.c.d()),this.process(t,n||!1)},t}();_e.ZipPassThrough=ln;var cn=function(){function t(t,n){var r=this;n||(n={}),ln.call(this,t),this.d=new wt(n,(function(t,n){r.ondata(null,t,n)})),this.compression=8,this.flag=en(n.level)}return t.prototype.process=function(t,n){try{this.d.push(t,n)}catch(t){this.ondata(t,null,n)}},t.prototype.push=function(t,n){ln.prototype.push.call(this,t,n)},t}();_e.ZipDeflate=cn;var pn=function(){function t(t,n){var r=this;n||(n={}),ln.call(this,t),this.d=new xt(n,(function(t,n,e){r.ondata(t,n,e)})),this.compression=8,this.flag=en(n.level),this.terminate=this.d.terminate}return t.prototype.process=function(t,n){this.d.push(t,n)},t.prototype.push=function(t,n){ln.prototype.push.call(this,t,n)},t}();_e.AsyncZipDeflate=pn;var vn=function(){function t(t){this.ondata=t,this.u=[],this.d=1}return t.prototype.add=function(t){var r=this;if(this.ondata||I(5),2&this.d)this.ondata(I(4+8*(1&this.d),0,1),null,!1);else{var e=nn(t.filename),i=e.length,o=t.comment,s=o&&nn(o),a=i!=t.filename.length||s&&o.length!=s.length,u=i+un(t.extra)+30;i>65535&&this.ondata(I(11,0,1),null,!1);var h=new n(u);hn(h,0,t,e,a,-1);var f=[h],l=function(){for(var t=0,n=f;t<n.length;t++)r.ondata(null,n[t],!1);f=[]},c=this.d;this.d=0;var p=this.u.length,v=Q(t,{f:e,u:a,o:s,t:function(){t.terminate&&t.terminate()},r:function(){if(l(),c){var t=r.u[p+1];t?t.r():r.d=1}c=1}}),d=0;t.ondata=function(e,i,o){if(e)r.ondata(e,i,o),r.terminate();else if(d+=i.length,f.push(i),o){var s=new n(16);ct(s,0,134695760),ct(s,4,t.crc),ct(s,8,d),ct(s,12,t.size),f.push(s),v.c=d,v.b=u+d+16,v.crc=t.crc,v.size=t.size,c&&v.r(),c=1}else c&&l()},this.u.push(v)}},t.prototype.end=function(){var t=this;2&this.d?this.ondata(I(4+8*(1&this.d),0,1),null,!0):(this.d?this.e():this.u.push({r:function(){1&t.d&&(t.u.splice(-1,1),t.e())},t:function(){}}),this.d=3)},t.prototype.e=function(){for(var t=0,r=0,e=0,i=0,o=this.u;i<o.length;i++)e+=46+(h=o[i]).f.length+un(h.extra)+(h.o?h.o.length:0);for(var s=new n(e+22),a=0,u=this.u;a<u.length;a++){var h;hn(s,t,h=u[a],h.f,h.u,-h.c-2,r,h.o),t+=46+h.f.length+un(h.extra)+(h.o?h.o.length:0),r+=h.b}fn(s,t,this.u.length,e,r),this.ondata(null,s,!0),this.d=2},t.prototype.terminate=function(){for(var t=0,n=this.u;t<n.length;t++)n[t].t();this.d=2},t}();function dn(t,r,e){e||(e=r,r={}),"function"!=typeof e&&I(7);var i={};Rt(t,"",i,r);var o=Object.keys(i),s=o.length,a=0,u=0,h=s,f=Array(s),l=[],c=function(){for(var t=0;t<l.length;++t)l[t]()},p=function(t,n){xn((function(){e(t,n)}))};xn((function(){p=e}));var v=function(){var t=new n(u+22),r=a,e=u-a;u=0;for(var i=0;i<h;++i){var o=f[i];try{var s=o.c.length;hn(t,u,o,o.f,o.u,s);var l=30+o.f.length+un(o.extra),c=u+l;t.set(o.c,c),hn(t,a,o,o.f,o.u,s,u,o.m),a+=16+l+(o.m?o.m.length:0),u=c+s}catch(t){return p(t,null)}}fn(t,a,f.length,e,r),p(null,t)};s||v();for(var d=function(t){var n=o[t],r=i[n],e=r[0],h=r[1],d=Y(),g=e.length;d.p(e);var y=nn(n),m=y.length,b=h.comment,w=b&&nn(b),x=w&&w.length,z=un(h.extra),k=0==h.level?0:8,M=function(r,e){if(r)c(),p(r,null);else{var i=e.length;f[t]=Q(h,{size:g,crc:d.d(),c:e,f:y,m:w,u:m!=n.length||w&&b.length!=x,compression:k}),a+=30+m+z+i,u+=76+2*(m+z)+(x||0)+i,--s||v()}};if(m>65535&&M(I(11,0,1),null),k)if(g<16e4)try{M(null,kt(e,h))}catch(t){M(t,null)}else l.push(zt(e,h,M));else M(null,e)},g=0;g<h;++g)d(g);return c}function gn(t,r){r||(r={});var e={},i=[];Rt(t,"",e,r);var o=0,s=0;for(var a in e){var u=e[a],h=u[0],f=u[1],l=0==f.level?0:8,c=(M=nn(a)).length,p=f.comment,v=p&&nn(p),d=v&&v.length,g=un(f.extra);c>65535&&I(11);var y=l?kt(h,f):h,m=y.length,b=Y();b.p(h),i.push(Q(f,{size:h.length,crc:b.d(),c:y,f:M,m:v,u:c!=a.length||v&&p.length!=d,o:o,compression:l})),o+=30+c+g+m,s+=76+2*(c+g)+(d||0)+m}for(var w=new n(s+22),x=o,z=s-o,k=0;k<i.length;++k){var M;hn(w,(M=i[k]).o,M,M.f,M.u,M.c.length);var S=30+M.f.length+un(M.extra);w.set(M.c,M.o+S),hn(w,o,M,M.f,M.u,M.c.length,M.o,M.m),o+=16+S+(M.m?M.m.length:0)}return fn(w,o,i.length,z,x),w}_e.Zip=vn,_e.zip=dn,_e.zipSync=gn;var yn=function(){function t(){}return t.prototype.push=function(t,n){this.ondata(null,t,n)},t.compression=0,t}();_e.UnzipPassThrough=yn;var mn=function(){function t(){var t=this;this.i=new Mt((function(n,r){t.ondata(null,n,r)}))}return t.prototype.push=function(t,n){try{this.i.push(t,n)}catch(t){this.ondata(t,null,n)}},t.compression=8,t}();_e.UnzipInflate=mn;var bn=function(){function t(t,n){var r=this;n<32e4?this.i=new Mt((function(t,n){r.ondata(null,t,n)})):(this.i=new St((function(t,n,e){r.ondata(t,n,e)})),this.terminate=this.i.terminate)}return t.prototype.push=function(t,n){this.i.terminate&&(t=D(t,0)),this.i.push(t,n)},t.compression=8,t}();_e.AsyncUnzipInflate=bn;var wn=function(){function t(t){this.onfile=t,this.k=[],this.o={0:yn},this.p=N}return t.prototype.push=function(t,r){var e=this;if(this.onfile||I(5),this.p||I(4),this.c>0){var i=Math.min(this.c,t.length),o=t.subarray(0,i);if(this.c-=i,this.d?this.d.push(o,!this.c):this.k[0].push(o),(t=t.subarray(i)).length)return this.push(t,r)}else{var s=0,a=0,u=void 0,h=void 0;this.p.length?t.length?((h=new n(this.p.length+t.length)).set(this.p),h.set(t,this.p.length)):h=this.p:h=t;for(var f=h.length,l=this.c,c=l&&this.d,p=function(){var t,n=ft(h,a);if(67324752==n){s=1,u=a,v.d=null,v.c=0;var r=ht(h,a+6),i=ht(h,a+8),o=2048&r,c=8&r,p=ht(h,a+26),d=ht(h,a+28);if(f>a+30+p+d){var g=[];v.k.unshift(g),s=2;var y,m=ft(h,a+18),b=ft(h,a+22),w=rn(h.subarray(a+30,a+=30+p),!o);4294967295==m?(t=c?[-2]:an(h,a),m=t[0],b=t[1]):c&&(m=-1),a+=d,v.c=m;var x={name:w,compression:i,start:function(){if(x.ondata||I(5),m){var t=e.o[i];t||x.ondata(I(14,"unknown compression type "+i,1),null,!1),(y=m<0?new t(w):new t(w,m,b)).ondata=function(t,n,r){x.ondata(t,n,r)};for(var n=0,r=g;n<r.length;n++)y.push(r[n],!1);e.k[0]==g&&e.c?e.d=y:y.push(N,!0)}else x.ondata(null,N,!0)},terminate:function(){y&&y.terminate&&y.terminate()}};m>=0&&(x.size=m,x.originalSize=b),v.onfile(x)}return"break"}if(l){if(134695760==n)return u=a+=12+(-2==l&&8),s=3,v.c=0,"break";if(33639248==n)return u=a-=4,s=3,v.c=0,"break"}},v=this;a<f-4&&"break"!==p();++a);if(this.p=N,l<0){var d=h.subarray(0,s?u-12-(-2==l&&8)-(134695760==ft(h,u-16)&&4):a);c?c.push(d,!!s):this.k[+(2==s)].push(d)}if(2&s)return this.push(h.subarray(a),r);this.p=h.subarray(a)}r&&(this.c&&I(13),this.p=null)},t.prototype.register=function(t){this.o[t.compression]=t},t}();_e.Unzip=wn;var xn="function"==typeof queueMicrotask?queueMicrotask:"function"==typeof setTimeout?setTimeout:function(t){t()};function zn(t,r,e){e||(e=r,r={}),"function"!=typeof e&&I(7);var i=[],o=function(){for(var t=0;t<i.length;++t)i[t]()},s={},a=function(t,n){xn((function(){e(t,n)}))};xn((function(){a=e}));for(var u=t.length-22;101010256!=ft(t,u);--u)if(!u||t.length-u>65558)return a(I(13,0,1),null),o;var h=ht(t,u+8);if(h){var f=h,l=ft(t,u+16),c=4294967295==l||65535==f;if(c){var p=ft(t,u-12);(c=101075792==ft(t,p))&&(f=h=ft(t,p+32),l=ft(t,p+48))}for(var v=r&&r.filter,d=function(r){var e=sn(t,l,c),u=e[0],f=e[1],p=e[2],d=e[3],g=e[4],y=on(t,e[5]);l=g;var m=function(t,n){t?(o(),a(t,null)):(n&&(s[d]=n),--h||a(null,s))};if(!v||v({name:d,size:f,originalSize:p,compression:u}))if(u)if(8==u){var b=t.subarray(y,y+f);if(p<524288||f>.8*p)try{m(null,Tt(b,{out:new n(p)}))}catch(t){m(t,null)}else i.push(At(b,{size:p},m))}else m(I(14,"unknown compression type "+u,1),null);else m(null,D(t,y,y+f));else m(null,null)},g=0;g<f;++g)d()}else a(null,{});return o}function kn(t,r){for(var e={},i=t.length-22;101010256!=ft(t,i);--i)(!i||t.length-i>65558)&&I(13);var o=ht(t,i+8);if(!o)return{};var s=ft(t,i+16),a=4294967295==s||65535==o;if(a){var u=ft(t,i-12);(a=101075792==ft(t,u))&&(o=ft(t,u+32),s=ft(t,u+48))}for(var h=r&&r.filter,f=0;f<o;++f){var l=sn(t,s,a),c=l[0],p=l[1],v=l[2],d=l[3],g=l[4],y=on(t,l[5]);s=g,h&&!h({name:d,size:p,originalSize:v,compression:c})||(c?8==c?e[d]=Tt(t.subarray(y,y+p),{out:new n(v)}):I(14,"unknown compression type "+c):e[d]=D(t,y,y+p))}return e}_e.unzip=zn,_e.unzipSync=kn;return _e});

/* ---- Customer Request Review form logic (scoped) ---- */
(function(){
'use strict';

/* ============================================================
   NU Customer Request Review — single-page tool
   Built as a sibling to classic-spec-builder.html.
   Data lives in vanilla JS state. No frameworks.
============================================================ */

// === NU Laboratories logo (base64 PNG) — reused from spec builder ===
const LOGO_B64="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";

// === Pre-populated test row data, extracted from .docm templates ===
// === EMI 461F test rows (10 tests) ===
const EMI_461F_ROWS = [
  [
    "CE101",
    "Conducted Emissions, Power Leads, 30 Hz to 10 kHz",
    "6",
    "Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461F Figure CE101-2 input power < 1 kVA."
  ],
  [
    "CE102",
    "Conducted Emissions, Power Leads, 10 kHz to 10 MHz",
    "8",
    "Tested on each AC power input leads for a total of two (2) tests. Tested to MIL-STD-461F Figure CE102-1 from 10 kHz to 10 MHz with 6 dB relaxation."
  ],
  [
    "CS101",
    "Conducted Susceptibility, Power Leads, 30 Hz to 150 kHz",
    "6",
    "≤100A/phase. Tested on each AC high side for a total of one (1) test. Tested to MIL-STD-461F Figure CS101-1. curve 1 and Figure CS101-2."
  ],
  [
    "CS106",
    "Conducted Susceptibility, Transients, Power Leads",
    "6",
    "Tested on each AC high side for a total of two (2) tests. Tested to MIL-STD-461F Figure CS106-1. Testing performed with a test generator compliant with CS06. The overshoot on this generator is slightly higher than specified in CS106 but the test results are generally accepted because this is considered worst case. Tested in charged mode of operation only"
  ],
  [
    "CS114",
    "Conducted Susceptibility, Bulk Cable Injection, 10 kHz to 200 MHz and from 4 kHz to 1 MHz at 77 dB µA",
    "1 day calibration 4 tests per day",
    "Bulk injection on the AC power input lead and on one (1) lead individually. Common mode test on the input leads for a total of three (3) tests for the power leads. One  (1) test on the signal leads for a total of four (4) tests. Tested to MIL-STD-461F Figure CS114-1 curve 2 from 10 kHz to 200 MHz and from 4 kHz to 1 MHz at 77 dB µA."
  ],
  [
    "CS116",
    "Conducted Susceptibility, Damped Sinusoidal Transients, Cables and\nPower Leads, 10 kHz to 100 MHz",
    "4 hrs setup and calibration\n6 tests per day",
    "Bulk injection on the AC power input lead and on each lead individually for a total of three (3) tests for the power leads. One (1) tests on the signal leads for a total of four (4) tests. Tested to MIL-STD-461F Figure CS116-2. Tested at the required discrete frequencies of 10 kHz, 100 kHz, 1 MHz, 10 MHz, 30 MHz and 100 MHz only."
  ],
  [
    "RE101",
    "Radiated Emissions, Magnetic Field, 30 Hz to 100 kHz",
    "",
    "Applicable to all enclosures including electrical cable interfaces.\nTested to MIL-STD-461F Figure RE101-2 from 30 Hz to 100 kHz"
  ],
  [
    "RE102",
    "Radiated Emissions, Electric Field, 10 kHz to 18 GHz",
    "",
    "Tested to MIL-STD-461F Figure RE102-1 for Metallic Ships below deck applications.\nAntenna positions:\n10 kHz to 30 MHz - 1 position\n30 MHz to 200 MHz - 1 position\n200 MHz to 1 GHz - 2 positions\n1 GHz to 15 GHz – 2 positions\n15 GHz to 18 GHz – 16 positions\nTested at width and cables only. Highest operating frequency not  known? Testing required to 10 times the highest operating frequency or 1 GHz (whichever is greater) or if not known, to 18 GHz."
  ],
  [
    "RS101",
    "Radiated Susceptibility, Magnetic Field, 30 Hz to 100 kHz",
    "22 minutes x number of positions. Reduced by 0.7 if two probes used. Allow 4 hrs setup and calibration. Allow time to position the sensors",
    "Applicable to all equipment enclosures including electrical cable interfaces for operating frequency 100 kHz or less and sensitivity better than 1 uV. Tested to MIL-STD-461F Figure RS101-1 from 30 Hz to 100 kHz at approximately 18 positions. Applicability depends on application."
  ],
  [
    "RS103",
    "Radiated Susceptibility, Electric Field, 2 MHz to 40 GHz",
    "",
    "Tested to MIL-STD-461F Table VII for Ships metallic below deck from 2 MHz to 18 GHz at 10 V/m.\nAntenna positions:\n2 MHz to 30 MHz 2 positions\n30 MHz to 200 MHz 1 position\n200 MHz to 1 GHz 1 positions\n1 GHz to 4 GHz 1 position\n4 GHz to 18 GHz 2 positions"
  ]
];

// === EMI 461G test rows (11 tests) ===
const EMI_461G_ROWS = [
  [
    "CE101",
    "Conducted Emissions, Audio Frequency Currents, Power Leads",
    "6",
    "Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461G Figure CE101-2 input power ≥ 1 kVA from 30 Hz to 10 kHz limit relaxed by 20 log (I/3)."
  ],
  [
    "CE102",
    "Conducted Emissions, Radio Frequency Potentials, Power Leads",
    "8",
    "Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461G Figure CE102-1 from 10 kHz to 10 MHz with 6 dB relaxation."
  ],
  [
    "CS101",
    "Conducted Susceptibility, Power Leads",
    "6",
    "Tested on the AC high side for a total of one (1) test. Tested to MIL-STD-461G Figure CS101-1 from 30 Hz to 150 kHz curve 1 and Figure CS101-2. Exempt from testing for normal operating current >30A per phase, or if >30A per phase with sensitivity worse than 1 uV or operating frequency >150 kHz."
  ],
  [
    "CS109",
    "Conducted Susceptibility, structure current",
    "0",
    "Test not applicable to handheld equipment or equipment with an operating sensitivity worse than 1 uV or operating frequency >100 kHz."
  ],
  [
    "CS114",
    "Conducted Susceptibility, Bulk Cable Injection",
    "1 day calibration, 2 tests per day",
    "Bulk injection on the AC power input and on the high side of the AC input leads. Common mode test on the input leads for a total of three (3) tests for the power leads. Five (5) tests on the signal leads for a total of eight (8) tests. Tested to MIL-STD-461G Figure CS114-1 curve 2 from 10 kHz to 200 MHz and from 4 kHz to 1 MHz at 77 dB µA."
  ],
  [
    "CS115",
    "Conducted susceptibility, bulk cable injection, impulse excitation.",
    "If applicable",
    "Bulk injection on the AC power input and on the high side individually for a total of two (2) tests for the power leads. One (1) tests on the signal leads for a total of three (3) tests. Tested to MIL-STD-461G Figure CS115-1 for one minute using 30 ns pulse at 5 amps, 30 Hz."
  ],
  [
    "CS116",
    "Conducted Susceptibility, Damped Sinusoidal Transients, Cables and Power Leads",
    "",
    "Bulk injection on the AC power input and on the high side and return individually for a total of three (3) tests for the power leads. Five (5) tests on the signal leads for a total of eight (8) tests. Tested to MIL-STD-461G Figure CS116-2. Tested at the required discrete frequencies of 10 kHz, 100 kHz, 1 MHz, 10 MHz, 30 MHz and 100 MHz only."
  ],
  [
    "RE101",
    "Radiated Emissions, Magnetic Field",
    "",
    "Applicable to all enclosures including\nelectrical cable interfaces\nTested to MIL-STD-461G Figure RE101-2 from 30 Hz to 100 kHz"
  ],
  [
    "RE102",
    "Radiated Emissions, Electric Field",
    "",
    "Tested to MIL-STD-461G Figure RE102-1 for Metallic Ships below deck applications\nAntenna positions:\n10 kHz to 30 MHz - 1 position\n30 MHz to 200 MHz - 1 position\n200 MHz to 1 GHz - 2 positions\n1 GHz to 15 GHz – 2 positions\n15 GHz to 18 GHz – 20 positions"
  ],
  [
    "RS101",
    "Radiated susceptibility, magnetic field",
    "22 minutes x number of positions. Reduced by 0.7 if two probes used. Allow 4 hrs setup and calibration. Allow time to position the sensors",
    "Applicable to all equipment enclosures including electrical cable interfaces. Applicability depends on application. Tested to MIL-STD-461G Figure RS101-1 from 30 Hz to 100 kHz at approximately 24 positions. Test not applicable to equipment with an operating sensitivity worse than 1 uV or operating frequency >100 kHz."
  ],
  [
    "RS103",
    "Radiated Susceptibility, Electric Field",
    "",
    "Tested to MIL-STD-461G Table XI for Ships metallic below deck from 2 MHz 18 GHz at 10 V/m.\nAntenna positions:\n2 MHz to 30 MHz 3 positions\n30 MHz to 200 MHz 1 position\n200 MHz to 1 GHz 2 positions\n1 GHz to 15 GHz 1 position\n15 GHz to 18 GHz 2 positions"
  ]
];

// === PQ 300B test rows ===
const PQ_300B_ROWS = [
  [
    "Voltage and frequency tolerance test",
    "8",
    "5.3.1",
    "Type 1 single phase (123/107) V ac,  (62/57) Hz",
    "Table II for shipboard and submarine applications"
  ],
  [
    "Voltage and frequency transient tolerance and recovery test",
    "8",
    "5.3.2",
    "138 V ac / 63.3 Hz; 92 V ac / 56.7 Hz",
    "Table III"
  ],
  [
    "Voltage spike test",
    "12",
    "5.3.3",
    "900 to 1000V peak\nline to line and line to ground or\n2400 to 2500V peak\nline to line and line to ground",
    "Set up to Figure 23, 24 or 25??\nVoltage spike impulse wave shape using the IEC 61000-4-5 1.2/50 uS open circuit waveform definition instead of the MIL-STD waveform. Overshoot may exceed figure. Or Voltage spike impulse wave shape of Figure 6 NAVSEA deviation for light fixture found in MIL-DTL-16377 (SSL)"
  ],
  [
    "Emergency condition test",
    "16",
    "5.3.4",
    "70 ms dropout, 2 minute dropout, voltage and frequency decay characteristics for half-load curve, frequency and voltage tolerance 67.2 Hz  for 2 minutes / 155.25 V ac for 2 min",
    "Figure 8\nTable VI"
  ],
  [
    "Grounding test",
    "4",
    "5.3.5",
    "100,000-ohm",
    "Each lead grounded individually for 5 minutes"
  ],
  [
    "User equipment power profile test",
    "8",
    "5.3.6",
    "User voltage and power characteristics",
    "Section 5.3.6 a. through m. as required\nNOTE: Inrush current measurement may be limited by the capabilities of the AC source used, which may not cover 10x nominal current or higher.  If inrush exceeds the capability of the source the measurement cannot be made as desired. We will report what is measured and make a best effort attempt using facility power directly (5 attempts)."
  ],
  [
    "Current waveform test",
    "3(6 if no 461)",
    "5.3.7",
    "120 Hz to 20 kHz <  than 1 kVA limits as applicable",
    "Requirement met using MIL-STD-461F/G test method CE101 with the frequency extended to 20 kHz. (A non-regulated power source may be needed for this test as regulated power source switching produces inconsistent current waveform data, but usually this is for <1A where testing is not required) If strictly followed this could prove to be difficult for us.\nRequirement for THD could be imposed in the procurement specification for devices that have unusual waveform. Not required for currents <1A per NAVSEA."
  ],
  [
    "Voltage and frequency modulation test",
    "16",
    "5.3.8",
    "Frequency modulation 0.5%\nVoltage modulation 2%\nVoltage modulation, Frequency modulation and Combined voltage and frequency modulation for periods of 17 msec, 75 msec, 250 msec, 500 msec, 1 sec, 5 sec and 10 sec each repeated ten consecutive times",
    "Table VII"
  ],
  [
    "Simulated human body leakage current test for personnel safety",
    "6",
    "5.3.9",
    "60 Hz to 700 Hz < 5 mA\n700 Hz to 100 kHz < 70 mA",
    "Figure 28\nFigure 31"
  ],
  [
    "Equipment insulation resistance test",
    "4",
    "5.3.10.1",
    "500 V dc for 60 seconds\nResistance to ground > 10 MΩ",
    "Insulation resistance test."
  ],
  [
    "Active ground",
    "4",
    "5.3.10.2",
    "Active ground test\nFor a 440-Vrms EUT, the AC source voltage shall be:\n440 × 1.414 = 622.2 Vpeak\nThe DC source voltage shall be: 505 VDC\nFor a 115-Vrms EUT, the AC source voltage shall be:\n115 × 1.414 = 162.6 Vpeak\nThe DC source voltage shall be: 155 VDC",
    "AGD is run on one line only per NAVSEA direction. Check if legacy requirements apply."
  ]
];

// === PQ 300 Part 1 test rows ===
const PQ_300P1_ROWS = [
  [
    "Grounding (susceptibility) test",
    "4",
    "5.3.1",
    "100,000-ohm",
    "Each lead grounded individually for 5 minutes"
  ],
  [
    "User equipment power profile test",
    "8",
    "5.3.2",
    "User voltage and power characteristics",
    "Section 5.3.2 a. through o. as required\nNOTE: Inrush current measurement may be limited by the capabilities of the AC source used, which may not cover 10x nominal current or higher.  If inrush exceeds the capability of the source the measurement cannot be made as desired. We will report what is measured and make a best effort attempt using facility power directly (5 attempts)."
  ],
  [
    "Voltage and frequency maximum departure tolerance test",
    "8",
    "5.3.3",
    "Type 1 singe phase (127/104) VAC,  (63/57) Hz or\nType 1 singe phase (484/396) VAC,  (63/57) Hz",
    "Table III for shipboard and submarine applications  Tested for 30 minutes in four (4) modes after temperature stability."
  ],
  [
    "Voltage and frequency transient tolerance and recovery (susceptibility) test",
    "8",
    "5.3.4",
    "138 VAC / 63.3 Hz; 92 VAC / 56.7 Hz  or\n528 VAC / 63.3 Hz; 352 VAC / 56.7 Hz",
    "Table IV duration for 2 seconds"
  ],
  [
    "Voltage spike (susceptibility) test",
    "12",
    "5.3.5",
    "900 to 1000V peak\nline to line and line to ground or\n2400 to 2500V peak\nline to line and line to ground",
    "Setup to Figure 28, 29 or Figure 30?\nVoltage spike impulse wave shape using the IEC 61000-4-5 1.2/50 uS open circuit waveform definition instead of the MIL-STD waveform. Overshoot may exceed figure. Or Voltage spike impulse wave shape of Figure 6 NAVSEA deviation for light fixture found in MIL-DTL-16377 (SSL)"
  ],
  [
    "Emergency conditions (susceptibility) test",
    "16",
    "5.3.6",
    "70 ms dropout, 2 minute dropout, voltage and frequency decay characteristics for half-load curve, frequency and voltage tolerance 67.2 Hz  for 2 minutes / 155.25 VAC for 2 minutes or\ntolerance 67.2 Hz  for 2 minutes / 594 VAC for 2 minutes",
    "Figure 9\nTable VII\nTc time to be provided by supplier or else default times shall be used."
  ],
  [
    "Current waveform (emission) test",
    "3 (6 if no 461)",
    "5.3.7",
    "Section 5.3.7 performed  in accordance with CE101 testing",
    "Requirement met using MIL-STD-461G test method CE101 with the frequency extended to 20 kHz.\n(A non-regulated power source may be needed for this test as regulated power source switching produces inconsistent current waveform data, but usually this is for <1A where testing is not required) If strictly followed this could prove to be difficult for us.\nRequirement for THD could be imposed in the procurement specification for devices that have unusual waveform. Not required for currents <1A per NAVSEA."
  ],
  [
    "Voltage and frequency modulation (susceptibility) test.",
    "16",
    "5.3.8",
    "Frequency modulation 0.5%\nVoltage modulation 2%\nVoltage modulation, Frequency modulation and Combined voltage and frequency modulation for periods of 50 msec, 500 msec, 1 sec, and 10 sec each repeated ten consecutive times",
    "Table VIII"
  ],
  [
    "Simulated human body impedance ground current test.",
    "6",
    "5.3.9",
    "60 Hz to 700 Hz < 5 mA\n700 Hz to 100 kHz < 70 mA",
    "Figure 33 through  Figure 36 depending on source of voltage"
  ],
  [
    "Equipment line-to-ground voltage (susceptibility) test.",
    "4",
    "5.3.10.1",
    "150 VDC (for 115 VAC) or 500 VDC (for 440 VAC) for 60 seconds\nResistance to ground > 10 MΩ",
    "Insulation resistance test"
  ],
  [
    "Equipment line-to-ground voltage (susceptibility) test AGD",
    "4",
    "5.3.10.2",
    "Active ground test\nFor a 440-Vrms EUT, the AC source voltage shall be:\n440 × 1.414 = 622.2 Vpeak\nThe DC source voltage shall be: 505 VDC\nFor a 115-Vrms EUT, the AC source voltage shall be:\n115 × 1.414 = 162.6 Vpeak\nThe DC source voltage shall be: 155 VDC",
    "AGD is run on one line only per NAVSEA direction. Check if legacy requirements apply."
  ]
];

// === DC Mag (single row) ===
const DC_MAG_ROWS = [
  [
    "DC Magnetics",
    "DOD-STD-1399 Section 070",
    "",
    "1600 A/m three orthogonal positions"
  ]
];

// === Spec definitions: which test data + how to render ===
const SPECS = {
  emi461f: {
    label: "MIL-STD-461F",
    columns: ["Test", "Description", "Time", "Comments"],
    columnClasses: ["col-key", "", "col-time", ""],
    initialRows: () => EMI_461F_ROWS.map(r => r.slice()),
  },
  emi461g: {
    label: "MIL-STD-461G",
    columns: ["Test", "Description", "Time", "Comments"],
    columnClasses: ["col-key", "", "col-time", ""],
    initialRows: () => EMI_461G_ROWS.map(r => r.slice()),
  },
  pq300b: {
    label: "MIL-STD-1399 Section 300B",
    columns: ["Requirement", "Time (hr)", "1399 Paragraph", "Test Requirement", "Tables / Figures"],
    columnClasses: ["", "col-time", "col-key", "", ""],
    initialRows: () => PQ_300B_ROWS.map(r => r.slice()),
  },
  pq300p1: {
    label: "MIL-STD-1399-300 Part 1",
    columns: ["Requirement", "Time (hr)", "1399 Paragraph", "Test Requirement", "Tables / Figures"],
    columnClasses: ["", "col-time", "col-key", "", ""],
    initialRows: () => PQ_300P1_ROWS.map(r => r.slice()),
  },
  dcmag: {
    label: "DC Magnetics",
    columns: ["Test", "Description", "Time", "Comments"],
    columnClasses: ["col-key", "", "col-time", ""],
    initialRows: () => DC_MAG_ROWS.map(r => r.slice()),
  },
};

// === State ===
// Form fields are read directly from DOM at save/export time.
// Spec tables hold their row data here (so toggling off/on doesn't reset edits).
const state = {
  enabledSpecs: {},   // { emi461f: true, ... }
  specRows: {},       // { emi461f: [[...], [...]], ... }
};

// === DOM helpers ===
const $ = (id) => document.getElementById(id);
const tablesContainer = $('tablesContainer');
const statusEl = $('status');

// === Init logo ===
$('logoImg').src = 'data:image/png;base64,' + LOGO_B64;

// === Status flash ===
let statusTimer = 0;
function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (kind ? (' ' + kind) : '');
  clearTimeout(statusTimer);
  if (kind) statusTimer = setTimeout(() => { statusEl.textContent = 'Ready.'; statusEl.className = 'status'; }, 4000);
}

// === Render a single spec table ===
function renderSpecTable(specKey) {
  const spec = SPECS[specKey];
  const rows = state.specRows[specKey] || [];
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.spec = specKey;

  const h2 = document.createElement('h2');
  h2.textContent = spec.label;
  card.appendChild(h2);

  const wrap = document.createElement('div');
  wrap.className = 'testtable-wrap';
  const tbl = document.createElement('table');
  tbl.className = 'testtable';

  // Header row
  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  const gut = document.createElement('th'); gut.className = 'gut'; gut.textContent = '#';
  htr.appendChild(gut);
  spec.columns.forEach((col, i) => {
    const th = document.createElement('th');
    th.textContent = col;
    if (spec.columnClasses[i]) th.className = spec.columnClasses[i];
    htr.appendChild(th);
  });
  thead.appendChild(htr);
  tbl.appendChild(thead);

  // Body rows
  const tbody = document.createElement('tbody');
  rows.forEach((row, ri) => {
    tbody.appendChild(buildRow(specKey, row, ri, spec));
  });
  tbl.appendChild(tbody);

  wrap.appendChild(tbl);
  card.appendChild(wrap);

  // Time total + shift total — recomputed on every cell edit via refreshTotal
  const totalsBar = document.createElement('div');
  totalsBar.className = 'time-totals';
  totalsBar.dataset.spec = specKey;
  totalsBar.style.cssText = 'margin-top:8px;padding:8px 12px;background:#f0f4f7;border:1px solid var(--line);border-radius:5px;font-size:12.5px;display:flex;gap:18px;align-items:center;flex-wrap:wrap';
  card.appendChild(totalsBar);
  refreshTimeTotal(specKey, totalsBar);

  // Add-row + clear actions
  const actions = document.createElement('div');
  actions.className = 'table-actions';
  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Add row';
  addBtn.addEventListener('click', () => {
    const blank = new Array(spec.columns.length).fill('');
    state.specRows[specKey].push(blank);
    refreshTable(specKey);
  });
  actions.appendChild(addBtn);
  card.appendChild(actions);

  tablesContainer.appendChild(card);
}

// Render the time/shift total into the bar element for one spec
function refreshTimeTotal(specKey, bar) {
  if (!bar) {
    bar = document.querySelector(`#crrRoot .time-totals[data-spec="${specKey}"]`);
    if (!bar) return;
  }
  const t = computeTimeTotal(specKey);
  const hrs = (Math.round(t.hours * 10) / 10).toString();
  const skippedNote = t.skipped > 0
    ? ` <span style="color:var(--muted);font-size:11px">(${t.skipped} row${t.skipped!==1?'s':''} skipped: non-numeric or blank)</span>`
    : '';
  bar.innerHTML =
    '<span><strong>Total hours:</strong> ' + hrs + '</span>' +
    '<span><strong>Shifts (8 hr):</strong> ' + t.shifts + '</span>' +
    skippedNote;
}

// === Build a single row TR ===
function buildRow(specKey, row, ri, spec) {
  const tr = document.createElement('tr');
  // gutter with row # + delete button
  const gut = document.createElement('td');
  gut.className = 'gut';
  const num = document.createElement('div'); num.textContent = ri + 1;
  const del = document.createElement('button');
  del.textContent = '×';
  del.title = 'Remove row';
  del.addEventListener('click', () => {
    state.specRows[specKey].splice(ri, 1);
    refreshTable(specKey);
  });
  gut.appendChild(num); gut.appendChild(del);
  tr.appendChild(gut);

  // Data cells
  spec.columns.forEach((_, ci) => {
    const td = document.createElement('td');
    if (spec.columnClasses[ci]) td.className = spec.columnClasses[ci];
    const ta = document.createElement('textarea');
    // Initial rows = newline count in value (gives correct starting height)
    ta.rows = Math.max(1, String(row[ci] || '').split(/\r?\n/).length);
    ta.value = row[ci] || '';
    ta.addEventListener('input', (e) => {
      state.specRows[specKey][ri][ci] = e.target.value;
      autosize(ta);
      // Only refresh totals if this is the Time column — cheap optimization
      if (ci === timeColumnIndex(specKey)) refreshTimeTotal(specKey);
    });
    td.appendChild(ta);
    tr.appendChild(td);
    // Two-pass autosize: once now, once after layout settles
    requestAnimationFrame(() => autosize(ta));
    setTimeout(() => autosize(ta), 50);
  });

  return tr;
}

function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

// === Size: inches → cm live conversion ===
function fmtCm(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '—';
  return (parseFloat(n) * 2.54).toFixed(1);
}
function updateSizeCm() {
  const L = $('eqSizeL').value, W = $('eqSizeW').value, H = $('eqSizeH').value;
  const any = (L !== '' || W !== '' || H !== '');
  if (!any) { $('eqSizeCm').textContent = '— cm —'; return; }
  $('eqSizeCm').textContent = '→ ' + fmtCm(L) + ' × ' + fmtCm(W) + ' × ' + fmtCm(H) + ' cm';
}
['eqSizeL','eqSizeW','eqSizeH'].forEach(id => {
  $(id).addEventListener('input', updateSizeCm);
});
updateSizeCm();

// === Section VII boilerplate fragments ===
// Assembled from the .docm templates' "Special requirements for quote" texts.
// Each spec contributes a fragment when checked. Common preamble + postamble
// always appear. User can freely edit the result; auto-overwrite is opt-in.
const QUOTE_REQ_FRAGMENTS = {
  preamble: 'Customer to supply cables and all peripheral and monitoring equipment (unless we already have it), one mode of operation.',
  emi:      'This quote is valid for ships, metallic below deck. This quote assumes that the susceptibility criteria can be determined in less than 3 seconds during the real-time operation of the EUT, and that if additional monitoring personnel are needed, they would be provided by the customer. Susceptibility determination provided by customer. Customer supplies ambient load if needed (depends on load).',
  pq:       'Customer to specify the best location for the thermocouple for 1399 temperature stability monitoring.',
  dcmag:    '', // No unique fragment in the source templates
  postamble:'Pricing is based on customer supplied information, the assumptions listed here, and acceptance of an approved test procedure. Specify any deviations here if known.',
};
function buildSuggestedQuoteReq() {
  const parts = [QUOTE_REQ_FRAGMENTS.preamble];
  const hasEmi = state.enabledSpecs.emi461f || state.enabledSpecs.emi461g;
  const hasPq  = state.enabledSpecs.pq300b  || state.enabledSpecs.pq300p1;
  const hasDc  = state.enabledSpecs.dcmag;
  if (hasEmi && QUOTE_REQ_FRAGMENTS.emi)    parts.push(QUOTE_REQ_FRAGMENTS.emi);
  if (hasPq  && QUOTE_REQ_FRAGMENTS.pq)     parts.push(QUOTE_REQ_FRAGMENTS.pq);
  if (hasDc  && QUOTE_REQ_FRAGMENTS.dcmag)  parts.push(QUOTE_REQ_FRAGMENTS.dcmag);
  parts.push(QUOTE_REQ_FRAGMENTS.postamble);
  return parts.join(' ');
}
function refreshQuoteReqHint() {
  // If textarea is empty, hint suggests applying. If non-empty AND differs
  // from current suggested, hint mentions update available.
  const current = $('quoteReq').value.trim();
  const suggested = buildSuggestedQuoteReq();
  const hint = $('suggestedReqHint');
  if (!current) {
    hint.textContent = '(empty — click to populate from selected specs)';
  } else if (current !== suggested.trim()) {
    hint.textContent = '(suggested text changed — click to overwrite your edits)';
  } else {
    hint.textContent = '(matches suggested text)';
  }
}
$('applySuggestedReq').addEventListener('click', () => {
  // Guard: nothing checked → no suggested text to apply
  const anySpec = Object.values(state.enabledSpecs).some(v => v);
  if (!anySpec) {
    setStatus('Select at least one spec table above before applying.', 'warn');
    return;
  }
  const current = $('quoteReq').value.trim();
  const suggested = buildSuggestedQuoteReq();
  // Case 1: already matches → no-op
  if (current === suggested.trim()) {
    setStatus('Text already matches the suggestion — nothing to apply.', 'ok');
    return;
  }
  // Case 2: textarea has content that doesn't match the suggestion → confirm
  // before destroying it (covers both unrelated edits AND prior partial applies)
  if (current.length > 0) {
    if (!confirm('Replace the current Section VII text with the freshly suggested text for your selected specs? Your existing text will be overwritten.')) {
      return;
    }
  }
  $('quoteReq').value = suggested;
  autosize($('quoteReq'));
  refreshQuoteReqHint();
  setStatus('Applied suggested text for selected specs.', 'ok');
});
$('quoteReq').addEventListener('input', () => { refreshQuoteReqHint(); autosize($('quoteReq')); });

// === Time totals per spec table ===
// Sum only pure-number cells (anything matching ^\s*\d+(\.\d+)?\s*$).
// Shifts = ceil(sum / 8). Skipped rows are reported so user knows what's missing.
function timeColumnIndex(specKey) {
  // EMI/DCMag: col 0=Test, 1=Description, 2=Time, 3=Comments  → time at index 2
  // PQ: col 0=Requirement, 1=Time, 2=Paragraph, 3=Test Req, 4=Tables → time at index 1
  const cols = SPECS[specKey].columns;
  return cols.findIndex(c => /^time/i.test(c));
}
function computeTimeTotal(specKey) {
  const rows = state.specRows[specKey] || [];
  const colIdx = timeColumnIndex(specKey);
  if (colIdx < 0 || rows.length === 0) return { hours: 0, shifts: 0, counted: 0, skipped: 0 };
  let counted = 0, skipped = 0, hours = 0;
  rows.forEach(r => {
    const raw = String(r[colIdx] || '').trim();
    if (!raw) { skipped++; return; }
    const m = raw.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
    if (m) { hours += parseFloat(m[1]); counted++; }
    else { skipped++; }
  });
  return { hours, shifts: Math.ceil(hours / 8), counted, skipped };
}

// === Re-render a single table without rebuilding everything ===
function refreshTable(specKey) {
  const oldCard = tablesContainer.querySelector(`[data-spec="${specKey}"]`);
  if (!oldCard) return;
  const newCard = (() => {
    const tmp = document.createElement('div');
    tablesContainer.appendChild(tmp);
    renderSpecTable(specKey);
    const out = tablesContainer.lastElementChild;
    tablesContainer.removeChild(tmp);
    return out;
  })();
  tablesContainer.insertBefore(newCard, oldCard);
  tablesContainer.removeChild(oldCard);
}

// === Re-render all enabled spec tables in selector order ===
function renderAllTables() {
  tablesContainer.innerHTML = '';
  Object.keys(SPECS).forEach(key => {
    if (state.enabledSpecs[key]) renderSpecTable(key);
  });
}

// === Toggle spec on/off ===
function setSpecEnabled(specKey, enabled) {
  state.enabledSpecs[specKey] = enabled;
  // Update pill visual
  const lbl = document.querySelector(`#specOpts label[data-spec="${specKey}"]`);
  if (lbl) lbl.classList.toggle('on', enabled);
  // Initialize row data if first enable
  if (enabled && !state.specRows[specKey]) {
    state.specRows[specKey] = SPECS[specKey].initialRows();
  }
  renderAllTables();
  refreshQuoteReqHint();
}

// === Wire up spec selector checkboxes ===
document.querySelectorAll('#specOpts input[type=checkbox]').forEach(cb => {
  cb.addEventListener('change', (e) => setSpecEnabled(e.target.dataset.spec, e.target.checked));
});

// === Form field collection ===
function collectFormData() {
  // Simple text/email/tel/date/textarea fields, gathered by id
  const ids = ['quoteNo','quoteDate','custCompany','custAddress','custName','custTitle',
               'custEmail','custPhone','custFax','eqCables','eqModes','eqReaction',
               'eqSizeL','eqSizeW','eqSizeH','eqWeight','eqCurrent','eqVoltage',
               'specOtherText','specialReq','quoteReq'];
  const fields = {};
  ids.forEach(id => { const el = $(id); if (el) fields[id] = el.value; });
  // Checkboxes
  const checks = {};
  document.querySelectorAll('#crrRoot input[type=checkbox][data-key]').forEach(cb => { checks[cb.dataset.key] = cb.checked; });
  checks.govWitness = $('govWitness').checked;
  checks.cuiReq = $('cuiReq').checked;
  // Specs + their rows (only enabled ones; preserve disabled rows in state too)
  return {
    version: 1,
    fields, checks,
    enabledSpecs: { ...state.enabledSpecs },
    specRows: { ...state.specRows },
  };
}

function applyFormData(d) {
  if (!d || typeof d !== 'object') return;
  // Fields
  Object.entries(d.fields || {}).forEach(([id, val]) => { const el = $(id); if (el) el.value = val; });
  // Checkboxes
  Object.entries(d.checks || {}).forEach(([key, val]) => {
    const cb = document.querySelector(`#crrRoot input[type=checkbox][data-key="${key}"]`);
    if (cb) cb.checked = !!val;
  });
  if (d.checks && 'govWitness' in d.checks) $('govWitness').checked = !!d.checks.govWitness;
  if (d.checks && 'cuiReq' in d.checks) $('cuiReq').checked = !!d.checks.cuiReq;
  // Specs
  state.enabledSpecs = { ...(d.enabledSpecs || {}) };
  state.specRows = { ...(d.specRows || {}) };
  // Sync spec selector pills + checkboxes
  document.querySelectorAll('#specOpts input[type=checkbox]').forEach(cb => {
    const enabled = !!state.enabledSpecs[cb.dataset.spec];
    cb.checked = enabled;
    const lbl = document.querySelector(`#specOpts label[data-spec="${cb.dataset.spec}"]`);
    if (lbl) lbl.classList.toggle('on', enabled);
  });
  renderAllTables();
  // Refresh derived UI elements that depend on loaded values
  updateSizeCm();
  refreshQuoteReqHint();
  if ($('quoteReq')) { autosize($('quoteReq')); }
  if ($('specialReq')) { autosize($('specialReq')); }
}

// === Save / Load JSON ===
$('saveJson').addEventListener('click', () => {
  const data = collectFormData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const fn = buildOutputFilename(data.fields.quoteNo, 'json');
  a.href = URL.createObjectURL(blob);
  a.download = fn;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus('Saved ' + fn, 'ok');
});

// Output filename: "{quote no} CRR.{ext}" if a quote number is set, otherwise
// a generic fallback. Quote number is sanitized to filesystem-safe characters
// but the " CRR" suffix uses a regular space (modern OSes handle this fine).
function buildOutputFilename(quoteNo, ext) {
  const q = String(quoteNo || '').trim();
  if (q) return sanitize(q) + ' CRR.' + ext;
  return 'Customer Request Review.' + ext;
}

$('loadJson').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const d = JSON.parse(ev.target.result);
      applyFormData(d);
      setStatus('Loaded ' + file.name, 'ok');
    } catch (err) {
      setStatus('Could not parse file: ' + err.message, 'warn');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

function sanitize(s) { return String(s || '').replace(/[^A-Za-z0-9_\-.]/g, '_'); }

// === Reset ===
$('resetBtn').addEventListener('click', () => {
  if (!confirm('Reset all fields and unselect all spec tables?')) return;
  // Clear all inputs (added 'number' to selector for the L/W/H size fields)
  document.querySelectorAll('#crrRoot input[type=text],#crrRoot input[type=email],#crrRoot input[type=tel],#crrRoot input[type=date],#crrRoot input[type=number],#crrRoot textarea').forEach(el => el.value = '');
  document.querySelectorAll('#crrRoot input[type=checkbox]').forEach(cb => cb.checked = false);
  // Reset specs
  state.enabledSpecs = {};
  state.specRows = {};
  document.querySelectorAll('#specOpts label').forEach(l => l.classList.remove('on'));
  renderAllTables();
  updateSizeCm();
  refreshQuoteReqHint();
  setStatus('All cleared.', 'ok');
});

// === Word export ===
// === Word export — generates .docx by modifying a base template ===
// Strategy: take the NU-branded template (header/footer already set up), strip
// its existing body, inject a freshly-built body with all CRR sections + any
// enabled spec tables. fflate handles ZIP unpacking/repacking.

const TEMPLATE_B64="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";

// ---------- Low-level XML helpers (copied from classic-spec-builder) ----------
function escapeXml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Run-property builder used by all text emitters in this module
function rprXml(opts) {
  opts = opts || {};
  const parts = ['<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'];
  if (opts.bold) parts.push('<w:b/>');
  if (opts.italic) parts.push('<w:i/>');
  if (opts.color) parts.push('<w:color w:val="' + opts.color + '"/>');
  const sz = opts.size || 20;
  parts.push('<w:sz w:val="' + sz + '"/>');
  parts.push('<w:szCs w:val="' + sz + '"/>');
  return '<w:rPr>' + parts.join('') + '</w:rPr>';
}

// Single text run, no line-break handling
function runXml(text, opts) {
  return '<w:r>' + rprXml(opts) + '<w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r>';
}

// Text with line breaks → multiple runs separated by <w:br/>
function multiRun(text, opts) {
  const lines = String(text == null ? "" : text).split(/\r?\n/);
  const rpr = rprXml(opts);
  let out = '';
  lines.forEach((line, i) => {
    const brk = i > 0 ? '<w:br/>' : '';
    out += '<w:r>' + rpr + brk + '<w:t xml:space="preserve">' + escapeXml(line) + '</w:t></w:r>';
  });
  return out;
}

// Single paragraph wrapper
function paraXml(runs, opts) {
  opts = opts || {};
  const spacing = '<w:spacing w:before="' + (opts.before || 60) + '" w:after="' + (opts.after || 60) + '"/>';
  const jc = opts.center ? '<w:jc w:val="center"/>' : '';
  const ind = opts.indent ? '<w:ind w:left="' + opts.indent + '"/>' : '';
  return '<w:p><w:pPr>' + spacing + jc + ind + '</w:pPr>' + runs + '</w:p>';
}

// Section heading — bold, larger, dark color
function sectionHeading(text) {
  return paraXml(runXml(text, { bold: true, size: 24, color: '1A2332' }), { before: 280, after: 120 });
}

// Sub-heading inside a section (e.g. "Information requested")
function subHeading(text) {
  return paraXml(runXml(text, { bold: true, size: 21, color: '1F6F6B' }), { before: 160, after: 60 });
}

// Plain paragraph
function textPara(text) {
  return paraXml(multiRun(text), { before: 40, after: 40 });
}

// ---------- Table cells & rows ----------
function tableCellXml(text, widthDxa, opts) {
  opts = opts || {};
  const sh = opts.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + opts.fill + '"/>' : '';
  const jc = opts.center ? '<w:jc w:val="center"/>' : '';
  const runs = multiRun(text, { bold: opts.bold, size: opts.size || 20 });
  return '<w:tc><w:tcPr><w:tcW w:w="' + widthDxa + '" w:type="dxa"/>' + sh +
    '<w:tcMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>' +
    '<w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>' +
    '<w:vAlign w:val="top"/></w:tcPr>' +
    '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>' + jc + '</w:pPr>' + runs + '</w:p></w:tc>';
}

function tableRowXml(cells, widths, opts) {
  opts = opts || {};
  let tr = '<w:tr>';
  if (opts.header) tr += '<w:trPr><w:tblHeader/></w:trPr>';
  for (let i = 0; i < cells.length; i++) {
    tr += tableCellXml(cells[i], widths[i], {
      fill: opts.fill,
      bold: opts.bold,
      center: opts.center,
      size: opts.size,
    });
  }
  return tr + '</w:tr>';
}

// Build a table given column widths and rows. Optional header row is bold + filled.
function buildTable(widths, rows, headerRow) {
  const totalW = widths.reduce((a, w) => a + w, 0);
  let t = '<w:tbl><w:tblPr><w:tblW w:w="' + totalW + '" w:type="dxa"/>' +
    '<w:tblBorders>' +
    '<w:top w:val="single" w:sz="4" w:color="A0A8B5"/>' +
    '<w:left w:val="single" w:sz="4" w:color="A0A8B5"/>' +
    '<w:bottom w:val="single" w:sz="4" w:color="A0A8B5"/>' +
    '<w:right w:val="single" w:sz="4" w:color="A0A8B5"/>' +
    '<w:insideH w:val="single" w:sz="4" w:color="C0C8D5"/>' +
    '<w:insideV w:val="single" w:sz="4" w:color="C0C8D5"/>' +
    '</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>' +
    '<w:tblGrid>' + widths.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>';
  if (headerRow) {
    t += tableRowXml(headerRow, widths, { header: true, bold: true, fill: 'E8EEF3', center: true });
  }
  rows.forEach(r => {
    const cells = [];
    for (let i = 0; i < widths.length; i++) cells.push(r[i] != null ? r[i] : '');
    t += tableRowXml(cells, widths);
  });
  return t + '</w:tbl>';
}

// ---------- CRR-specific builders ----------

// Form data table: rows of [label, value] pairs. 2 columns, label narrower.
function formTable(rows) {
  // Filter out rows where the value is blank — no point showing empty fields
  const filtered = rows.filter(r => String(r[1] || '').trim() !== '');
  if (filtered.length === 0) return paraXml(runXml('(no values entered)', { italic: true, color: '888888' }));
  return buildTable([2400, 6960], filtered);
}

// Checkbox group: produces a single paragraph with "☑ Quote   ☐ Literature   ..."
function checkboxLine(items) {
  // items: [{label, checked}]
  let runs = '';
  items.forEach((it, i) => {
    if (i > 0) runs += runXml('   ');
    runs += runXml(it.checked ? '☒' : '☐', { size: 22 });
    runs += runXml(' ' + it.label);
  });
  return paraXml(runs, { before: 30, after: 30 });
}

// ---------- Read form values from the DOM ----------
function readForm() {
  const text = (id) => ($(id) ? $(id).value || '' : '');
  const cb = (key) => {
    const el = document.querySelector('#crrRoot input[type=checkbox][data-key="' + key + '"]');
    return el ? !!el.checked : false;
  };
  return {
    quoteNo: text('quoteNo'),
    quoteDate: text('quoteDate'),
    custCompany: text('custCompany'),
    custAddress: text('custAddress'),
    custName: text('custName'),
    custTitle: text('custTitle'),
    custEmail: text('custEmail'),
    custPhone: text('custPhone'),
    custFax: text('custFax'),
    eqCables: text('eqCables'),
    eqModes: text('eqModes'),
    eqReaction: text('eqReaction'),
    eqSizeL: text('eqSizeL'),
    eqSizeW: text('eqSizeW'),
    eqSizeH: text('eqSizeH'),
    eqWeight: text('eqWeight'),
    eqCurrent: text('eqCurrent'),
    eqVoltage: text('eqVoltage'),
    specOtherText: text('specOtherText'),
    specialReq: text('specialReq'),
    quoteReq: text('quoteReq'),
    req: { quote: cb('reqQuote'), lit: cb('reqLit'), visit: cb('reqVisit') },
    pwr: {
      AC: cb('pwrAC'), DC: cb('pwrDC'),
      f50: cb('pwr50'), f60: cb('pwr60'), f400: cb('pwr400'),
      ph1: cb('pwr1ph'), ph3: cb('pwr3ph'),
      Y: cb('pwrY'), delta: cb('pwrDelta'),
    },
    specs: {
      MS461: cb('specMS461'),
      MS1399: cb('specMS1399'),
      EMCOther: cb('specEMCOther'),
      govWitness: $('govWitness').checked,
      cuiReq: $('cuiReq').checked,
    },
  };
}

// ---------- Section builders ----------

function buildSectionI(f) {
  let body = '';
  body += sectionHeading('I. Quote Information');
  body += formTable([
    ['Quote No.', f.quoteNo],
    ['Date', formatDate(f.quoteDate)],
  ]);
  return body;
}

function buildSectionII(f) {
  let body = '';
  body += sectionHeading('II. Customer');
  body += formTable([
    ['Company', f.custCompany],
    ['Address', f.custAddress],
    ['Contact name', f.custName],
    ['Title', f.custTitle],
    ['Email', f.custEmail],
    ['Phone', f.custPhone],
    ['Fax', f.custFax],
  ]);
  body += subHeading('Information requested');
  body += checkboxLine([
    { label: 'Quote', checked: f.req.quote },
    { label: 'Literature', checked: f.req.lit },
    { label: 'Sales visit', checked: f.req.visit },
  ]);
  return body;
}

function buildSectionIII(f) {
  let body = '';
  body += sectionHeading('III. Equipment to be Tested');
  // Size: build "L × W × H in (Lcm × Wcm × Hcm)" from numeric inputs
  const sizeText = formatSize(f.eqSizeL, f.eqSizeW, f.eqSizeH);
  body += formTable([
    ['Number of cables', f.eqCables],
    ['Modes of operation', f.eqModes],
    ['Immunity reaction time', f.eqReaction],
    ['Size (L × W × H)', sizeText],
    ['Weight', f.eqWeight],
    ['Voltage requirements', f.eqVoltage],
    ['Current', f.eqCurrent],
  ]);
  body += subHeading('Power characteristics');
  body += checkboxLine([
    { label: 'AC', checked: f.pwr.AC },
    { label: 'DC', checked: f.pwr.DC },
    { label: '50 Hz', checked: f.pwr.f50 },
    { label: '60 Hz', checked: f.pwr.f60 },
    { label: '400 Hz', checked: f.pwr.f400 },
  ]);
  body += checkboxLine([
    { label: 'Single phase', checked: f.pwr.ph1 },
    { label: 'Three phase', checked: f.pwr.ph3 },
    { label: 'Y', checked: f.pwr.Y },
    { label: 'Delta', checked: f.pwr.delta },
  ]);
  return body;
}

// Build the size string for Word: "12 × 8 × 6 in (30.5 × 20.3 × 15.2 cm)"
// Falls back gracefully if any dimensions are missing.
function formatSize(L, W, H) {
  const vals = [L, W, H];
  const all = vals.every(v => v !== '' && v !== null && v !== undefined && !isNaN(v));
  if (!all) {
    // Only render what's available
    const filled = vals.map(v => (v === '' || v === null || v === undefined || isNaN(v)) ? '?' : v);
    if (filled.every(v => v === '?')) return '';
    return filled.join(' × ') + ' in';
  }
  const cm = vals.map(v => (parseFloat(v) * 2.54).toFixed(1));
  return vals.join(' × ') + ' in (' + cm.join(' × ') + ' cm)';
}

function buildSectionIV(f) {
  let body = '';
  body += sectionHeading('IV. Test Specifications & Witness Requirements');
  body += checkboxLine([
    { label: 'MIL-STD-461', checked: f.specs.MS461 },
    { label: 'MIL-STD-1399', checked: f.specs.MS1399 },
    { label: 'EMC other', checked: f.specs.EMCOther },
  ]);
  if (f.specOtherText && f.specOtherText.trim()) {
    body += textPara('EMC other: ' + f.specOtherText);
  }
  body += checkboxLine([
    { label: 'Government witness requirement', checked: f.specs.govWitness },
    { label: 'CUI requirement', checked: f.specs.cuiReq },
  ]);
  return body;
}

function buildSectionV(f) {
  let body = '';
  body += sectionHeading('V. Special Test Requirements');
  if (f.specialReq && f.specialReq.trim()) {
    body += textPara(f.specialReq);
  } else {
    body += paraXml(runXml('(none specified)', { italic: true, color: '888888' }));
  }
  return body;
}

function buildSectionVII(f) {
  let body = '';
  body += sectionHeading('VII. Special Requirements for Quote');
  if (f.quoteReq && f.quoteReq.trim()) {
    body += textPara(f.quoteReq);
  } else {
    body += paraXml(runXml('(none specified)', { italic: true, color: '888888' }));
  }
  return body;
}

function buildSpecTables() {
  let body = '';
  Object.keys(SPECS).forEach(specKey => {
    if (!state.enabledSpecs[specKey]) return;
    const spec = SPECS[specKey];
    const rows = state.specRows[specKey] || [];
    if (rows.length === 0) return;
    body += sectionHeading(spec.label);
    // Compute column widths. Total content width is ~9360 dxa for letter portrait
    // with 1" margins. Distribute across columns proportionally.
    const widths = computeColWidths(spec);
    body += buildTable(widths, rows, spec.columns);
    // Time + shift totals line below the table
    const t = computeTimeTotal(specKey);
    const hrs = (Math.round(t.hours * 10) / 10).toString();
    let totalsTxt = 'Total hours: ' + hrs + '       Shifts (8 hr): ' + t.shifts;
    if (t.skipped > 0) {
      totalsTxt += '       (' + t.skipped + ' row' + (t.skipped !== 1 ? 's' : '') + ' skipped: non-numeric or blank)';
    }
    body += paraXml(runXml(totalsTxt, { bold: true, size: 20, color: '1F6F6B' }), { before: 80, after: 80 });
  });
  return body;
}

// Width allocation per spec — first/key/time columns narrower, description/comments wider
function computeColWidths(spec) {
  const totalW = 9360;
  const n = spec.columns.length;
  if (n === 4 && spec.columns[0] === 'Test') {
    // EMI / DC Mag: Test | Description | Time | Comments
    // narrow key, medium description+time, wide comments
    return [900, 2600, 1300, 4560];
  }
  if (n === 5 && spec.columns[0] === 'Requirement') {
    // PQ: Requirement | Time | 1399 Paragraph | Test Req | Tables/Figures
    return [2200, 1100, 1400, 2600, 2060];
  }
  // Fallback: equal columns
  const each = Math.floor(totalW / n);
  return new Array(n).fill(each);
}

// ---------- Putting it all together ----------

function buildCrrBodyXml() {
  const f = readForm();
  let body = '';
  // Title — replaces the template's existing title
  body += paraXml(runXml('Review of Customer Request', { bold: true, size: 32 }), { center: true, before: 60, after: 200 });
  if (f.quoteNo) {
    body += paraXml(runXml('Quote No. ' + f.quoteNo, { bold: true, size: 22, color: '6B7A8D' }), { center: true, before: 0, after: 200 });
  }
  body += buildSectionI(f);
  body += buildSectionII(f);
  body += buildSectionIII(f);
  body += buildSectionIV(f);
  body += buildSectionV(f);
  body += buildSpecTables();
  body += buildSectionVII(f);
  return body;
}

function formatDate(iso) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return m[2] + '/' + m[3] + '/' + m[1];
}

// Inject our body into the template's document.xml, replacing the existing content
function injectIntoTemplate(docXml, bodyXml) {
  // The template has an existing title "Test Specifications for Quote #" — find
  // and remove the paragraph that contains it, plus the empty paragraphs before
  // it (the spec builder template has a heading + an empty bold paragraph
  // before the title). We replace from the document's body start through the
  // sectPr-end paragraph.
  //
  // Conservative approach: find the first <w:p> in the body and the last <w:p>
  // before <w:sectPr>, and replace everything in between with our content.
  const bodyStartIdx = docXml.indexOf('<w:body>') + '<w:body>'.length;
  // Find the sectPr (page settings) — must preserve it. It's the last child of body.
  const sectPrIdx = docXml.indexOf('<w:sectPr', bodyStartIdx);
  if (sectPrIdx === -1) return docXml; // safety
  // The sectPr is usually wrapped in its own <w:p>. We want to preserve it
  // intact. Find the <w:p> that contains the sectPr.
  let sectParaStart = docXml.lastIndexOf('<w:p>', sectPrIdx);
  const sectParaStartAttr = docXml.lastIndexOf('<w:p ', sectPrIdx);
  if (sectParaStartAttr > sectParaStart) sectParaStart = sectParaStartAttr;
  // If sectPr isn't inside a <w:p>, just preserve it directly
  if (sectParaStart === -1 || sectParaStart < bodyStartIdx) {
    sectParaStart = sectPrIdx;
  }
  return docXml.slice(0, bodyStartIdx) + bodyXml + docXml.slice(sectParaStart);
}

function generateCrrDocxBytes() {
  const raw = Uint8Array.from(atob(TEMPLATE_B64), c => c.charCodeAt(0));
  const files = fflate.unzipSync(raw);
  const dec = new TextDecoder('utf-8'), enc = new TextEncoder();
  let docXml = dec.decode(files['word/document.xml']);
  const bodyXml = buildCrrBodyXml();
  docXml = injectIntoTemplate(docXml, bodyXml);
  files['word/document.xml'] = enc.encode(docXml);
  // Clean docProps
  const cleanCore = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:title>Review of Customer Request</dc:title><dc:creator>NU Laboratories</dc:creator>' +
    '<cp:lastModifiedBy>NU Laboratories</cp:lastModifiedBy><dc:language>en-US</dc:language></cp:coreProperties>';
  const cleanApp = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    '<Template>Normal</Template><Application>NU Customer Request Review</Application></Properties>';
  if (files['docProps/core.xml']) files['docProps/core.xml'] = enc.encode(cleanCore);
  if (files['docProps/app.xml']) files['docProps/app.xml'] = enc.encode(cleanApp);
  return fflate.zipSync(files, { level: 6 });
}

// Wire up the button
$('exportWord').addEventListener('click', () => {
  try {
    const bytes = generateCrrDocxBytes();
    const f = readForm();
    const name = buildOutputFilename(f.quoteNo, 'docx');
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('Exported ' + name, 'ok');
  } catch (err) {
    console.error(err);
    setStatus('Export failed: ' + (err.message || err), 'warn');
  }
});


// === Default the date to today ===
(function defaultDate() {
  const d = new Date();
  const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  $('quoteDate').value = iso;
})();

// Set initial Section VII hint
refreshQuoteReqHint();


// ===== Workspace panel entry point =====
window.openCrrPanel = function(el){
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  (el || document.getElementById('navCrr'))?.classList.add('active');
  const tb = document.getElementById('topbarName');
  if (tb) tb.textContent = 'Quote Workup';
  if (typeof showProjectView === 'function') showProjectView('panel-crr');
};

})();
