/* ============================================================
   crr.js — EMI Quote Workup (Customer Request Review)
   Phase 2.1: list-first panel backed by crr_workups, PLUS
   Jordan's best-effort "Load from Word" importer (CRRv7).
   The importer unzips an existing .docx/.docm CRR with fflate,
   parses word/document.xml, heuristically extracts fields /
   checkboxes / spec tables, and applies them via applyFormData
   (the same restore path used to load a saved draft). Word EXPORT
   stays removed; fflate is back only for the import unzip.
   Everything is in an IIFE; exports are window.openCrrPanel and
   window.refreshCrrBadge.
   ============================================================ */

/* ---- embedded fflate (ZIP) — attaches to window.fflate ---- */
!function(f){typeof module!='undefined'&&typeof exports=='object'?module.exports=f():typeof define!='undefined'&&define.amd?define(f):(typeof self!='undefined'?self:this).fflate=f()}(function(){var _e={};"use strict";var t=(typeof module!='undefined'&&typeof exports=='object'?function(_f){"use strict";var e,t=";var __w=require('worker_threads');__w.parentPort.on('message',function(m){onmessage({data:m})}),postMessage=function(m,t){__w.parentPort.postMessage(m,t)},close=process.exit;self=global";try{e=require("worker_threads").Worker}catch(e){}exports.default=e?function(r,n,o,a,s){var u=!1,i=new e(r+t,{eval:!0}).on("error",(function(e){return s(e,null)})).on("message",(function(e){return s(null,e)})).on("exit",(function(e){e&&!u&&s(Error("exited with code "+e),null)}));return i.postMessage(o,a),i.terminate=function(){return u=!0,e.prototype.terminate.call(i)},i}:function(e,t,r,n,o){setImmediate((function(){return o(Error("async operations unsupported - update to Node 12+ (or Node 10-11 with the --experimental-worker CLI flag)"),null)}));var a=function(){};return{terminate:a,postMessage:a}};return _f}:function(_f){"use strict";var e={};_f.default=function(r,t,s,a,n){var o=new Worker(e[t]||(e[t]=URL.createObjectURL(new Blob([r+';addEventListener("error",function(e){e=e.error;postMessage({$e$:[e.message,e.code,e.stack]})})'],{type:"text/javascript"}))));return o.onmessage=function(e){var r=e.data,t=r.$e$;if(t){var s=Error(t[0]);s.code=t[1],s.stack=t[2],n(s,null)}else n(null,r)},o.postMessage(s,a),o};return _f})({}),n=Uint8Array,r=Uint16Array,e=Int32Array,i=new n([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0]),o=new n([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0]),s=new n([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),a=function(t,n){for(var i=new r(31),o=0;o<31;++o)i[o]=n+=1<<t[o-1];var s=new e(i[30]);for(o=1;o<30;++o)for(var a=i[o];a<i[o+1];++a)s[a]=a-i[o]<<5|o;return{b:i,r:s}},u=a(i,2),h=u.b,f=u.r;h[28]=258,f[258]=28;for(var l=a(o,0),c=l.b,p=l.r,v=new r(32768),d=0;d<32768;++d){var g=(43690&d)>>1|(21845&d)<<1;v[d]=((65280&(g=(61680&(g=(52428&g)>>2|(13107&g)<<2))>>4|(3855&g)<<4))>>8|(255&g)<<8)>>1}var y=function(t,n,e){for(var i=t.length,o=0,s=new r(n);o<i;++o)t[o]&&++s[t[o]-1];var a,u=new r(n);for(o=1;o<n;++o)u[o]=u[o-1]+s[o-1]<<1;if(e){a=new r(1<<n);var h=15-n;for(o=0;o<i;++o)if(t[o])for(var f=o<<4|t[o],l=n-t[o],c=u[t[o]-1]++<<l,p=c|(1<<l)-1;c<=p;++c)a[v[c]>>h]=f}else for(a=new r(i),o=0;o<i;++o)t[o]&&(a[o]=v[u[t[o]-1]++]>>15-t[o]);return a},m=new n(288);for(d=0;d<144;++d)m[d]=8;for(d=144;d<256;++d)m[d]=9;for(d=256;d<280;++d)m[d]=7;for(d=280;d<288;++d)m[d]=8;var b=new n(32);for(d=0;d<32;++d)b[d]=5;var w=y(m,9,0),x=y(m,9,1),z=y(b,5,0),k=y(b,5,1),M=function(t){for(var n=t[0],r=1;r<t.length;++r)t[r]>n&&(n=t[r]);return n},S=function(t,n,r){var e=n/8|0;return(t[e]|t[e+1]<<8)>>(7&n)&r},A=function(t,n){var r=n/8|0;return(t[r]|t[r+1]<<8|t[r+2]<<16)>>(7&n)},T=function(t){return(t+7)/8|0},D=function(t,r,e){return(null==r||r<0)&&(r=0),(null==e||e>t.length)&&(e=t.length),new n(t.subarray(r,e))};_e.FlateErrorCode={UnexpectedEOF:0,InvalidBlockType:1,InvalidLengthLiteral:2,InvalidDistance:3,StreamFinished:4,NoStreamHandler:5,InvalidHeader:6,NoCallback:7,InvalidUTF8:8,ExtraFieldTooLong:9,InvalidDate:10,FilenameTooLong:11,StreamFinishing:12,InvalidZipData:13,UnknownCompressionMethod:14};var C=["unexpected EOF","invalid block type","invalid length/literal","invalid distance","stream finished","no stream handler",,"no callback","invalid UTF-8 data","extra field too long","date not in range 1980-2099","filename too long","stream finishing","invalid zip data"],I=function(t,n,r){var e=Error(n||C[t]);if(e.code=t,Error.captureStackTrace&&Error.captureStackTrace(e,I),!r)throw e;return e},U=function(t,r,e,a){var u=t.length,f=a?a.length:0;if(!u||r.f&&!r.l)return e||new n(0);var l=!e,p=l||2!=r.i,v=r.i;l&&(e=new n(3*u));var d=function(t){var r=e.length;if(t>r){var i=new n(Math.max(2*r,t));i.set(e),e=i}},g=r.f||0,m=r.p||0,b=r.b||0,w=r.l,z=r.d,C=r.m,U=r.n,F=8*u;do{if(!w){g=S(t,m,1);var E=S(t,m+1,3);if(m+=3,!E){var Z=t[(J=T(m)+4)-4]|t[J-3]<<8,q=J+Z;if(q>u){v&&I(0);break}p&&d(b+Z),e.set(t.subarray(J,q),b),r.b=b+=Z,r.p=m=8*q,r.f=g;continue}if(1==E)w=x,z=k,C=9,U=5;else if(2==E){var O=S(t,m,31)+257,G=S(t,m+10,15)+4,L=O+S(t,m+5,31)+1;m+=14;for(var H=new n(L),j=new n(19),N=0;N<G;++N)j[s[N]]=S(t,m+3*N,7);m+=3*G;var P=M(j),B=(1<<P)-1,Y=y(j,P,1);for(N=0;N<L;){var J,K=Y[S(t,m,B)];if(m+=15&K,(J=K>>4)<16)H[N++]=J;else{var Q=0,R=0;for(16==J?(R=3+S(t,m,3),m+=2,Q=H[N-1]):17==J?(R=3+S(t,m,7),m+=3):18==J&&(R=11+S(t,m,127),m+=7);R--;)H[N++]=Q}}var V=H.subarray(0,O),W=H.subarray(O);C=M(V),U=M(W),w=y(V,C,1),z=y(W,U,1)}else I(1);if(m>F){v&&I(0);break}}p&&d(b+131072);for(var X=(1<<C)-1,$=(1<<U)-1,_=m;;_=m){var tt=(Q=w[A(t,m)&X])>>4;if((m+=15&Q)>F){v&&I(0);break}if(Q||I(2),tt<256)e[b++]=tt;else{if(256==tt){_=m,w=null;break}var nt=tt-254;tt>264&&(nt=S(t,m,(1<<(it=i[N=tt-257]))-1)+h[N],m+=it);var rt=z[A(t,m)&$],et=rt>>4;if(rt||I(3),m+=15&rt,W=c[et],et>3){var it=o[et];W+=A(t,m)&(1<<it)-1,m+=it}if(m>F){v&&I(0);break}p&&d(b+131072);var ot=b+nt;if(b<W){var st=f-W,at=Math.min(W,ot);for(st+b<0&&I(3);b<at;++b)e[b]=a[st+b]}for(;b<ot;++b)e[b]=e[b-W]}}r.l=w,r.p=_,r.b=b,r.f=g,w&&(g=1,r.m=C,r.d=z,r.n=U)}while(!g);return b!=e.length&&l?D(e,0,b):e.subarray(0,b)},F=function(t,n,r){var e=n/8|0;t[e]|=r<<=7&n,t[e+1]|=r>>8},E=function(t,n,r){var e=n/8|0;t[e]|=r<<=7&n,t[e+1]|=r>>8,t[e+2]|=r>>16},Z=function(t,e){for(var i=[],o=0;o<t.length;++o)t[o]&&i.push({s:o,f:t[o]});var s=i.length,a=i.slice();if(!s)return{t:N,l:0};if(1==s){var u=new n(i[0].s+1);return u[i[0].s]=1,{t:u,l:1}}i.sort((function(t,n){return t.f-n.f})),i.push({s:-1,f:25001});var h=i[0],f=i[1],l=0,c=1,p=2;for(i[0]={s:-1,f:h.f+f.f,l:h,r:f};c!=s-1;)h=i[i[l].f<i[p].f?l++:p++],f=i[l!=c&&i[l].f<i[p].f?l++:p++],i[c++]={s:-1,f:h.f+f.f,l:h,r:f};var v=a[0].s;for(o=1;o<s;++o)a[o].s>v&&(v=a[o].s);var d=new r(v+1),g=q(i[c-1],d,0);if(g>e){o=0;var y=0,m=g-e,b=1<<m;for(a.sort((function(t,n){return d[n.s]-d[t.s]||t.f-n.f}));o<s;++o){var w=a[o].s;if(!(d[w]>e))break;y+=b-(1<<g-d[w]),d[w]=e}for(y>>=m;y>0;){var x=a[o].s;d[x]<e?y-=1<<e-d[x]++-1:++o}for(;o>=0&&y;--o){var z=a[o].s;d[z]==e&&(--d[z],++y)}g=e}return{t:new n(d),l:g}},q=function(t,n,r){return-1==t.s?Math.max(q(t.l,n,r+1),q(t.r,n,r+1)):n[t.s]=r},O=function(t){for(var n=t.length;n&&!t[--n];);for(var e=new r(++n),i=0,o=t[0],s=1,a=function(t){e[i++]=t},u=1;u<=n;++u)if(t[u]==o&&u!=n)++s;else{if(!o&&s>2){for(;s>138;s-=138)a(32754);s>2&&(a(s>10?s-11<<5|28690:s-3<<5|12305),s=0)}else if(s>3){for(a(o),--s;s>6;s-=6)a(8304);s>2&&(a(s-3<<5|8208),s=0)}for(;s--;)a(o);s=1,o=t[u]}return{c:e.subarray(0,i),n:n}},G=function(t,n){for(var r=0,e=0;e<n.length;++e)r+=t[e]*n[e];return r},L=function(t,n,r){var e=r.length,i=T(n+2);t[i]=255&e,t[i+1]=e>>8,t[i+2]=255^t[i],t[i+3]=255^t[i+1];for(var o=0;o<e;++o)t[i+o+4]=r[o];return 8*(i+4+e)},H=function(t,n,e,a,u,h,f,l,c,p,v){F(n,v++,e),++u[256];for(var d=Z(u,15),g=d.t,x=d.l,k=Z(h,15),M=k.t,S=k.l,A=O(g),T=A.c,D=A.n,C=O(M),I=C.c,U=C.n,q=new r(19),H=0;H<T.length;++H)++q[31&T[H]];for(H=0;H<I.length;++H)++q[31&I[H]];for(var j=Z(q,7),N=j.t,P=j.l,B=19;B>4&&!N[s[B-1]];--B);var Y,J,K,Q,R=p+5<<3,V=G(u,m)+G(h,b)+f,W=G(u,g)+G(h,M)+f+14+3*B+G(q,N)+2*q[16]+3*q[17]+7*q[18];if(c>=0&&R<=V&&R<=W)return L(n,v,t.subarray(c,c+p));if(F(n,v,1+(W<V)),v+=2,W<V){Y=y(g,x,0),J=g,K=y(M,S,0),Q=M;var X=y(N,P,0);for(F(n,v,D-257),F(n,v+5,U-1),F(n,v+10,B-4),v+=14,H=0;H<B;++H)F(n,v+3*H,N[s[H]]);v+=3*B;for(var $=[T,I],_=0;_<2;++_){var tt=$[_];for(H=0;H<tt.length;++H)F(n,v,X[rt=31&tt[H]]),v+=N[rt],rt>15&&(F(n,v,tt[H]>>5&127),v+=tt[H]>>12)}}else Y=w,J=m,K=z,Q=b;for(H=0;H<l;++H){var nt=a[H];if(nt>255){var rt;E(n,v,Y[257+(rt=nt>>18&31)]),v+=J[rt+257],rt>7&&(F(n,v,nt>>23&31),v+=i[rt]);var et=31&nt;E(n,v,K[et]),v+=Q[et],et>3&&(E(n,v,nt>>5&8191),v+=o[et])}else E(n,v,Y[nt]),v+=J[nt]}return E(n,v,Y[256]),v+J[256]},j=new e([65540,131080,131088,131104,262176,1048704,1048832,2114560,2117632]),N=new n(0),P=function(t,s,a,u,h,l){var c=l.z||t.length,v=new n(u+c+5*(1+Math.ceil(c/7e3))+h),d=v.subarray(u,v.length-h),g=l.l,y=7&(l.r||0);if(s){y&&(d[0]=l.r>>3);for(var m=j[s-1],b=m>>13,w=8191&m,x=(1<<a)-1,z=l.p||new r(32768),k=l.h||new r(x+1),M=Math.ceil(a/3),S=2*M,A=function(n){return(t[n]^t[n+1]<<M^t[n+2]<<S)&x},C=new e(25e3),I=new r(288),U=new r(32),F=0,E=0,Z=l.i||0,q=0,O=l.w||0,G=0;Z+2<c;++Z){var N=A(Z),P=32767&Z,B=k[N];if(z[P]=B,k[N]=P,O<=Z){var Y=c-Z;if((F>7e3||q>24576)&&(Y>423||!g)){y=H(t,d,0,C,I,U,E,q,G,Z-G,y),q=F=E=0,G=Z;for(var J=0;J<286;++J)I[J]=0;for(J=0;J<30;++J)U[J]=0}var K=2,Q=0,R=w,V=P-B&32767;if(Y>2&&N==A(Z-V))for(var W=Math.min(b,Y)-1,X=Math.min(32767,Z),$=Math.min(258,Y);V<=X&&--R&&P!=B;){if(t[Z+K]==t[Z+K-V]){for(var _=0;_<$&&t[Z+_]==t[Z+_-V];++_);if(_>K){if(K=_,Q=V,_>W)break;var tt=Math.min(V,_-2),nt=0;for(J=0;J<tt;++J){var rt=Z-V+J&32767,et=rt-z[rt]&32767;et>nt&&(nt=et,B=rt)}}}V+=(P=B)-(B=z[P])&32767}if(Q){C[q++]=268435456|f[K]<<18|p[Q];var it=31&f[K],ot=31&p[Q];E+=i[it]+o[ot],++I[257+it],++U[ot],O=Z+K,++F}else C[q++]=t[Z],++I[t[Z]]}}for(Z=Math.max(Z,O);Z<c;++Z)C[q++]=t[Z],++I[t[Z]];y=H(t,d,g,C,I,U,E,q,G,Z-G,y),g||(l.r=7&y|d[y/8|0]<<3,y-=7,l.h=k,l.p=z,l.i=Z,l.w=O)}else{for(Z=l.w||0;Z<c+g;Z+=65535){var st=Z+65535;st>=c&&(d[y/8|0]=g,st=c),y=L(d,y+1,t.subarray(Z,st))}l.i=c}return D(v,0,u+T(y)+h)},B=function(){for(var t=new Int32Array(256),n=0;n<256;++n){for(var r=n,e=9;--e;)r=(1&r&&-306674912)^r>>>1;t[n]=r}return t}(),Y=function(){var t=-1;return{p:function(n){for(var r=t,e=0;e<n.length;++e)r=B[255&r^n[e]]^r>>>8;t=r},d:function(){return~t}}},J=function(){var t=1,n=0;return{p:function(r){for(var e=t,i=n,o=0|r.length,s=0;s!=o;){for(var a=Math.min(s+2655,o);s<a;++s)i+=e+=r[s];e=(65535&e)+15*(e>>16),i=(65535&i)+15*(i>>16)}t=e,n=i},d:function(){return(255&(t%=65521))<<24|(65280&t)<<8|(255&(n%=65521))<<8|n>>8}}},K=function(t,r,e,i,o){if(!o&&(o={l:1},r.dictionary)){var s=r.dictionary.subarray(-32768),a=new n(s.length+t.length);a.set(s),a.set(t,s.length),t=a,o.w=s.length}return P(t,null==r.level?6:r.level,null==r.mem?o.l?Math.ceil(1.5*Math.max(8,Math.min(13,Math.log(t.length)))):20:12+r.mem,e,i,o)},Q=function(t,n){var r={};for(var e in t)r[e]=t[e];for(var e in n)r[e]=n[e];return r},R=function(t,n,r){for(var e=t(),i=""+t,o=i.slice(i.indexOf("[")+1,i.lastIndexOf("]")).replace(/\s+/g,"").split(","),s=0;s<e.length;++s){var a=e[s],u=o[s];if("function"==typeof a){n+=";"+u+"=";var h=""+a;if(a.prototype)if(-1!=h.indexOf("[native code]")){var f=h.indexOf(" ",8)+1;n+=h.slice(f,h.indexOf("(",f))}else for(var l in n+=h,a.prototype)n+=";"+u+".prototype."+l+"="+a.prototype[l];else n+=h}else r[u]=a}return n},V=[],W=function(t){var n=[];for(var r in t)t[r].buffer&&n.push((t[r]=new t[r].constructor(t[r])).buffer);return n},X=function(n,r,e,i){if(!V[e]){for(var o="",s={},a=n.length-1,u=0;u<a;++u)o=R(n[u],o,s);V[e]={c:R(n[a],o,s),e:s}}var h=Q({},V[e].e);return(0,t.default)(V[e].c+";onmessage=function(e){for(var k in e.data)self[k]=e.data[k];onmessage="+r+"}",e,h,W(h),i)},$=function(){return[n,r,e,i,o,s,h,c,x,k,v,C,y,M,S,A,T,D,I,U,Tt,it,ot]},_=function(){return[n,r,e,i,o,s,f,p,w,m,z,b,v,j,N,y,F,E,Z,q,O,G,L,H,T,D,P,K,kt,it]},tt=function(){return[pt,gt,ct,Y,B]},nt=function(){return[vt,dt]},rt=function(){return[yt,ct,J]},et=function(){return[mt]},it=function(t){return postMessage(t,[t.buffer])},ot=function(t){return t&&{out:t.size&&new n(t.size),dictionary:t.dictionary}},st=function(t,n,r,e,i,o){var s=X(r,e,i,(function(t,n){s.terminate(),o(t,n)}));return s.postMessage([t,n],n.consume?[t.buffer]:[]),function(){s.terminate()}},at=function(t){return t.ondata=function(t,n){return postMessage([t,n],[t.buffer])},function(n){n.data.length?(t.push(n.data[0],n.data[1]),postMessage([n.data[0].length])):t.flush()}},ut=function(t,n,r,e,i,o,s){var a,u=X(t,e,i,(function(t,r){t?(u.terminate(),n.ondata.call(n,t)):Array.isArray(r)?1==r.length?(n.queuedSize-=r[0],n.ondrain&&n.ondrain(r[0])):(r[1]&&u.terminate(),n.ondata.call(n,t,r[0],r[1])):s(r)}));u.postMessage(r),n.queuedSize=0,n.push=function(t,r){n.ondata||I(5),a&&n.ondata(I(4,0,1),null,!!r),n.queuedSize+=t.length,u.postMessage([t,a=r],[t.buffer])},n.terminate=function(){u.terminate()},o&&(n.flush=function(){u.postMessage([])})},ht=function(t,n){return t[n]|t[n+1]<<8},ft=function(t,n){return(t[n]|t[n+1]<<8|t[n+2]<<16|t[n+3]<<24)>>>0},lt=function(t,n){return ft(t,n)+4294967296*ft(t,n+4)},ct=function(t,n,r){for(;r;++n)t[n]=r,r>>>=8},pt=function(t,n){var r=n.filename;if(t[0]=31,t[1]=139,t[2]=8,t[8]=n.level<2?4:9==n.level?2:0,t[9]=3,0!=n.mtime&&ct(t,4,Math.floor(new Date(n.mtime||Date.now())/1e3)),r){t[3]=8;for(var e=0;e<=r.length;++e)t[e+10]=r.charCodeAt(e)}},vt=function(t){31==t[0]&&139==t[1]&&8==t[2]||I(6,"invalid gzip data");var n=t[3],r=10;4&n&&(r+=2+(t[10]|t[11]<<8));for(var e=(n>>3&1)+(n>>4&1);e>0;e-=!t[r++]);return r+(2&n)},dt=function(t){var n=t.length;return(t[n-4]|t[n-3]<<8|t[n-2]<<16|t[n-1]<<24)>>>0},gt=function(t){return 10+(t.filename?t.filename.length+1:0)},yt=function(t,n){var r=n.level,e=0==r?0:r<6?1:9==r?3:2;if(t[0]=120,t[1]=e<<6|(n.dictionary&&32),t[1]|=31-(t[0]<<8|t[1])%31,n.dictionary){var i=J();i.p(n.dictionary),ct(t,2,i.d())}},mt=function(t,n){return(8!=(15&t[0])||t[0]>>4>7||(t[0]<<8|t[1])%31)&&I(6,"invalid zlib data"),(t[1]>>5&1)==+!n&&I(6,"invalid zlib data: "+(32&t[1]?"need":"unexpected")+" dictionary"),2+(t[1]>>3&4)};function bt(t,n){return"function"==typeof t&&(n=t,t={}),this.ondata=n,t}var wt=function(){function t(t,r){if("function"==typeof t&&(r=t,t={}),this.ondata=r,this.o=t||{},this.s={l:0,i:32768,w:32768,z:32768},this.b=new n(98304),this.o.dictionary){var e=this.o.dictionary.subarray(-32768);this.b.set(e,32768-e.length),this.s.i=32768-e.length}}return t.prototype.p=function(t,n){this.ondata(K(t,this.o,0,0,this.s),n)},t.prototype.push=function(t,r){this.ondata||I(5),this.s.l&&I(4);var e=t.length+this.s.z;if(e>this.b.length){if(e>2*this.b.length-32768){var i=new n(-32768&e);i.set(this.b.subarray(0,this.s.z)),this.b=i}var o=this.b.length-this.s.z;this.b.set(t.subarray(0,o),this.s.z),this.s.z=this.b.length,this.p(this.b,!1),this.b.set(this.b.subarray(-32768)),this.b.set(t.subarray(o),32768),this.s.z=t.length-o+32768,this.s.i=32766,this.s.w=32768}else this.b.set(t,this.s.z),this.s.z+=t.length;this.s.l=1&r,(this.s.z>this.s.w+8191||r)&&(this.p(this.b,r||!1),this.s.w=this.s.i,this.s.i-=2)},t.prototype.flush=function(){this.ondata||I(5),this.s.l&&I(4),this.p(this.b,!1),this.s.w=this.s.i,this.s.i-=2},t}();_e.Deflate=wt;var xt=function(){return function(t,n){ut([_,function(){return[at,wt]}],this,bt.call(this,t,n),(function(t){var n=new wt(t.data);onmessage=at(n)}),6,1)}}();function zt(t,n,r){return r||(r=n,n={}),"function"!=typeof r&&I(7),st(t,n,[_],(function(t){return it(kt(t.data[0],t.data[1]))}),0,r)}function kt(t,n){return K(t,n||{},0,0)}_e.AsyncDeflate=xt,_e.deflate=zt,_e.deflateSync=kt;var Mt=function(){function t(t,r){"function"==typeof t&&(r=t,t={}),this.ondata=r;var e=t&&t.dictionary&&t.dictionary.subarray(-32768);this.s={i:0,b:e?e.length:0},this.o=new n(32768),this.p=new n(0),e&&this.o.set(e)}return t.prototype.e=function(t){if(this.ondata||I(5),this.d&&I(4),this.p.length){if(t.length){var r=new n(this.p.length+t.length);r.set(this.p),r.set(t,this.p.length),this.p=r}}else this.p=t},t.prototype.c=function(t){this.s.i=+(this.d=t||!1);var n=this.s.b,r=U(this.p,this.s,this.o);this.ondata(D(r,n,this.s.b),this.d),this.o=D(r,this.s.b-32768),this.s.b=this.o.length,this.p=D(this.p,this.s.p/8|0),this.s.p&=7},t.prototype.push=function(t,n){this.e(t),this.c(n)},t}();_e.Inflate=Mt;var St=function(){return function(t,n){ut([$,function(){return[at,Mt]}],this,bt.call(this,t,n),(function(t){var n=new Mt(t.data);onmessage=at(n)}),7,0)}}();function At(t,n,r){return r||(r=n,n={}),"function"!=typeof r&&I(7),st(t,n,[$],(function(t){return it(Tt(t.data[0],ot(t.data[1])))}),1,r)}function Tt(t,n){return U(t,{i:2},n&&n.out,n&&n.dictionary)}_e.AsyncInflate=St,_e.inflate=At,_e.inflateSync=Tt;var Dt=function(){function t(t,n){this.c=Y(),this.l=0,this.v=1,wt.call(this,t,n)}return t.prototype.push=function(t,n){this.c.p(t),this.l+=t.length,wt.prototype.push.call(this,t,n)},t.prototype.p=function(t,n){var r=K(t,this.o,this.v&&gt(this.o),n&&8,this.s);this.v&&(pt(r,this.o),this.v=0),n&&(ct(r,r.length-8,this.c.d()),ct(r,r.length-4,this.l)),this.ondata(r,n)},t.prototype.flush=function(){wt.prototype.flush.call(this)},t}();_e.Gzip=Dt,_e.Compress=Dt;var Ct=function(){return function(t,n){ut([_,tt,function(){return[at,wt,Dt]}],this,bt.call(this,t,n),(function(t){var n=new Dt(t.data);onmessage=at(n)}),8,1)}}();function It(t,n,r){return r||(r=n,n={}),"function"!=typeof r&&I(7),st(t,n,[_,tt,function(){return[Ut]}],(function(t){return it(Ut(t.data[0],t.data[1]))}),2,r)}function Ut(t,n){n||(n={});var r=Y(),e=t.length;r.p(t);var i=K(t,n,gt(n),8),o=i.length;return pt(i,n),ct(i,o-8,r.d()),ct(i,o-4,e),i}_e.AsyncGzip=Ct,_e.AsyncCompress=Ct,_e.gzip=It,_e.compress=It,_e.gzipSync=Ut,_e.compressSync=Ut;var Ft=function(){function t(t,n){this.v=1,this.r=0,Mt.call(this,t,n)}return t.prototype.push=function(t,r){if(Mt.prototype.e.call(this,t),this.r+=t.length,this.v){var e=this.p.subarray(this.v-1),i=e.length>3?vt(e):4;if(i>e.length){if(!r)return}else this.v>1&&this.onmember&&this.onmember(this.r-e.length);this.p=e.subarray(i),this.v=0}Mt.prototype.c.call(this,r),!this.s.f||this.s.l||r||(this.v=T(this.s.p)+9,this.s={i:0},this.o=new n(0),this.push(new n(0),r))},t}();_e.Gunzip=Ft;var Et=function(){return function(t,n){var r=this;ut([$,nt,function(){return[at,Mt,Ft]}],this,bt.call(this,t,n),(function(t){var n=new Ft(t.data);n.onmember=function(t){return postMessage(t)},onmessage=at(n)}),9,0,(function(t){return r.onmember&&r.onmember(t)}))}}();function Zt(t,n,r){return r||(r=n,n={}),"function"!=typeof r&&I(7),st(t,n,[$,nt,function(){return[qt]}],(function(t){return it(qt(t.data[0],t.data[1]))}),3,r)}function qt(t,r){var e=vt(t);return e+8>t.length&&I(6,"invalid gzip data"),U(t.subarray(e,-8),{i:2},r&&r.out||new n(dt(t)),r&&r.dictionary)}_e.AsyncGunzip=Et,_e.gunzip=Zt,_e.gunzipSync=qt;var Ot=function(){function t(t,n){this.c=J(),this.v=1,wt.call(this,t,n)}return t.prototype.push=function(t,n){this.c.p(t),wt.prototype.push.call(this,t,n)},t.prototype.p=function(t,n){var r=K(t,this.o,this.v&&(this.o.dictionary?6:2),n&&4,this.s);this.v&&(yt(r,this.o),this.v=0),n&&ct(r,r.length-4,this.c.d()),this.ondata(r,n)},t.prototype.flush=function(){wt.prototype.flush.call(this)},t}();_e.Zlib=Ot;var Gt=function(){return function(t,n){ut([_,rt,function(){return[at,wt,Ot]}],this,bt.call(this,t,n),(function(t){var n=new Ot(t.data);onmessage=at(n)}),10,1)}}();function Lt(t,n,r){return r||(r=n,n={}),"function"!=typeof r&&I(7),st(t,n,[_,rt,function(){return[Ht]}],(function(t){return it(Ht(t.data[0],t.data[1]))}),4,r)}function Ht(t,n){n||(n={});var r=J();r.p(t);var e=K(t,n,n.dictionary?6:2,4);return yt(e,n),ct(e,e.length-4,r.d()),e}_e.AsyncZlib=Gt,_e.zlib=Lt,_e.zlibSync=Ht;var jt=function(){function t(t,n){Mt.call(this,t,n),this.v=t&&t.dictionary?2:1}return t.prototype.push=function(t,n){if(Mt.prototype.e.call(this,t),this.v){if(this.p.length<6&&!n)return;this.p=this.p.subarray(mt(this.p,this.v-1)),this.v=0}n&&(this.p.length<4&&I(6,"invalid zlib data"),this.p=this.p.subarray(0,-4)),Mt.prototype.c.call(this,n)},t}();_e.Unzlib=jt;var Nt=function(){return function(t,n){ut([$,et,function(){return[at,Mt,jt]}],this,bt.call(this,t,n),(function(t){var n=new jt(t.data);onmessage=at(n)}),11,0)}}();function Pt(t,n,r){return r||(r=n,n={}),"function"!=typeof r&&I(7),st(t,n,[$,et,function(){return[Bt]}],(function(t){return it(Bt(t.data[0],ot(t.data[1])))}),5,r)}function Bt(t,n){return U(t.subarray(mt(t,n&&n.dictionary),-4),{i:2},n&&n.out,n&&n.dictionary)}_e.AsyncUnzlib=Nt,_e.unzlib=Pt,_e.unzlibSync=Bt;var Yt=function(){function t(t,n){this.o=bt.call(this,t,n)||{},this.G=Ft,this.I=Mt,this.Z=jt}return t.prototype.i=function(){var t=this;this.s.ondata=function(n,r){t.ondata(n,r)}},t.prototype.push=function(t,r){if(this.ondata||I(5),this.s)this.s.push(t,r);else{if(this.p&&this.p.length){var e=new n(this.p.length+t.length);e.set(this.p),e.set(t,this.p.length)}else this.p=t;this.p.length>2&&(this.s=31==this.p[0]&&139==this.p[1]&&8==this.p[2]?new this.G(this.o):8!=(15&this.p[0])||this.p[0]>>4>7||(this.p[0]<<8|this.p[1])%31?new this.I(this.o):new this.Z(this.o),this.i(),this.s.push(this.p,r),this.p=null)}},t}();_e.Decompress=Yt;var Jt=function(){function t(t,n){Yt.call(this,t,n),this.queuedSize=0,this.G=Et,this.I=St,this.Z=Nt}return t.prototype.i=function(){var t=this;this.s.ondata=function(n,r,e){t.ondata(n,r,e)},this.s.ondrain=function(n){t.queuedSize-=n,t.ondrain&&t.ondrain(n)}},t.prototype.push=function(t,n){this.queuedSize+=t.length,Yt.prototype.push.call(this,t,n)},t}();function Kt(t,n,r){return r||(r=n,n={}),"function"!=typeof r&&I(7),31==t[0]&&139==t[1]&&8==t[2]?Zt(t,n,r):8!=(15&t[0])||t[0]>>4>7||(t[0]<<8|t[1])%31?At(t,n,r):Pt(t,n,r)}function Qt(t,n){return 31==t[0]&&139==t[1]&&8==t[2]?qt(t,n):8!=(15&t[0])||t[0]>>4>7||(t[0]<<8|t[1])%31?Tt(t,n):Bt(t,n)}_e.AsyncDecompress=Jt,_e.decompress=Kt,_e.decompressSync=Qt;var Rt=function(t,r,e,i){for(var o in t){var s=t[o],a=r+o,u=i;Array.isArray(s)&&(u=Q(i,s[1]),s=s[0]),s instanceof n?e[a]=[s,u]:(e[a+="/"]=[new n(0),u],Rt(s,a,e,i))}},Vt="undefined"!=typeof TextEncoder&&new TextEncoder,Wt="undefined"!=typeof TextDecoder&&new TextDecoder,Xt=0;try{Wt.decode(N,{stream:!0}),Xt=1}catch(t){}var $t=function(t){for(var n="",r=0;;){var e=t[r++],i=(e>127)+(e>223)+(e>239);if(r+i>t.length)return{s:n,r:D(t,r-1)};i?3==i?(e=((15&e)<<18|(63&t[r++])<<12|(63&t[r++])<<6|63&t[r++])-65536,n+=String.fromCharCode(55296|e>>10,56320|1023&e)):n+=String.fromCharCode(1&i?(31&e)<<6|63&t[r++]:(15&e)<<12|(63&t[r++])<<6|63&t[r++]):n+=String.fromCharCode(e)}},_t=function(){function t(t){this.ondata=t,Xt?this.t=new TextDecoder:this.p=N}return t.prototype.push=function(t,r){if(this.ondata||I(5),r=!!r,this.t)return this.ondata(this.t.decode(t,{stream:!0}),r),void(r&&(this.t.decode().length&&I(8),this.t=null));this.p||I(4);var e=new n(this.p.length+t.length);e.set(this.p),e.set(t,this.p.length);var i=$t(e),o=i.s,s=i.r;r?(s.length&&I(8),this.p=null):this.p=s,this.ondata(o,r)},t}();_e.DecodeUTF8=_t;var tn=function(){function t(t){this.ondata=t}return t.prototype.push=function(t,n){this.ondata||I(5),this.d&&I(4),this.ondata(nn(t),this.d=n||!1)},t}();function nn(t,r){if(r){for(var e=new n(t.length),i=0;i<t.length;++i)e[i]=t.charCodeAt(i);return e}if(Vt)return Vt.encode(t);var o=t.length,s=new n(t.length+(t.length>>1)),a=0,u=function(t){s[a++]=t};for(i=0;i<o;++i){if(a+5>s.length){var h=new n(a+8+(o-i<<1));h.set(s),s=h}var f=t.charCodeAt(i);f<128||r?u(f):f<2048?(u(192|f>>6),u(128|63&f)):f>55295&&f<57344?(u(240|(f=65536+(1047552&f)|1023&t.charCodeAt(++i))>>18),u(128|f>>12&63),u(128|f>>6&63),u(128|63&f)):(u(224|f>>12),u(128|f>>6&63),u(128|63&f))}return D(s,0,a)}function rn(t,n){if(n){for(var r="",e=0;e<t.length;e+=16384)r+=String.fromCharCode.apply(null,t.subarray(e,e+16384));return r}if(Wt)return Wt.decode(t);var i=$t(t),o=i.s;return(r=i.r).length&&I(8),o}_e.EncodeUTF8=tn,_e.strToU8=nn,_e.strFromU8=rn;var en=function(t){return 1==t?3:t<6?2:9==t?1:0},on=function(t,n){return n+30+ht(t,n+26)+ht(t,n+28)},sn=function(t,n,r){var e=ht(t,n+28),i=rn(t.subarray(n+46,n+46+e),!(2048&ht(t,n+8))),o=n+46+e,s=ft(t,n+20),a=r&&4294967295==s?an(t,o):[s,ft(t,n+24),ft(t,n+42)],u=a[0],h=a[1],f=a[2];return[ht(t,n+10),u,h,i,o+ht(t,n+30)+ht(t,n+32),f]},an=function(t,n){for(;1!=ht(t,n);n+=4+ht(t,n+2));return[lt(t,n+12),lt(t,n+4),lt(t,n+20)]},un=function(t){var n=0;if(t)for(var r in t){var e=t[r].length;e>65535&&I(9),n+=e+4}return n},hn=function(t,n,r,e,i,o,s,a){var u=e.length,h=r.extra,f=a&&a.length,l=un(h);ct(t,n,null!=s?33639248:67324752),n+=4,null!=s&&(t[n++]=20,t[n++]=r.os),t[n]=20,n+=2,t[n++]=r.flag<<1|(o<0&&8),t[n++]=i&&8,t[n++]=255&r.compression,t[n++]=r.compression>>8;var c=new Date(null==r.mtime?Date.now():r.mtime),p=c.getFullYear()-1980;if((p<0||p>119)&&I(10),ct(t,n,p<<25|c.getMonth()+1<<21|c.getDate()<<16|c.getHours()<<11|c.getMinutes()<<5|c.getSeconds()>>1),n+=4,-1!=o&&(ct(t,n,r.crc),ct(t,n+4,o<0?-o-2:o),ct(t,n+8,r.size)),ct(t,n+12,u),ct(t,n+14,l),n+=16,null!=s&&(ct(t,n,f),ct(t,n+6,r.attrs),ct(t,n+10,s),n+=14),t.set(e,n),n+=u,l)for(var v in h){var d=h[v],g=d.length;ct(t,n,+v),ct(t,n+2,g),t.set(d,n+4),n+=4+g}return f&&(t.set(a,n),n+=f),n},fn=function(t,n,r,e,i){ct(t,n,101010256),ct(t,n+8,r),ct(t,n+10,r),ct(t,n+12,e),ct(t,n+16,i)},ln=function(){function t(t){this.filename=t,this.c=Y(),this.size=0,this.compression=0}return t.prototype.process=function(t,n){this.ondata(null,t,n)},t.prototype.push=function(t,n){this.ondata||I(5),this.c.p(t),this.size+=t.length,n&&(this.crc=this.c.d()),this.process(t,n||!1)},t}();_e.ZipPassThrough=ln;var cn=function(){function t(t,n){var r=this;n||(n={}),ln.call(this,t),this.d=new wt(n,(function(t,n){r.ondata(null,t,n)})),this.compression=8,this.flag=en(n.level)}return t.prototype.process=function(t,n){try{this.d.push(t,n)}catch(t){this.ondata(t,null,n)}},t.prototype.push=function(t,n){ln.prototype.push.call(this,t,n)},t}();_e.ZipDeflate=cn;var pn=function(){function t(t,n){var r=this;n||(n={}),ln.call(this,t),this.d=new xt(n,(function(t,n,e){r.ondata(t,n,e)})),this.compression=8,this.flag=en(n.level),this.terminate=this.d.terminate}return t.prototype.process=function(t,n){this.d.push(t,n)},t.prototype.push=function(t,n){ln.prototype.push.call(this,t,n)},t}();_e.AsyncZipDeflate=pn;var vn=function(){function t(t){this.ondata=t,this.u=[],this.d=1}return t.prototype.add=function(t){var r=this;if(this.ondata||I(5),2&this.d)this.ondata(I(4+8*(1&this.d),0,1),null,!1);else{var e=nn(t.filename),i=e.length,o=t.comment,s=o&&nn(o),a=i!=t.filename.length||s&&o.length!=s.length,u=i+un(t.extra)+30;i>65535&&this.ondata(I(11,0,1),null,!1);var h=new n(u);hn(h,0,t,e,a,-1);var f=[h],l=function(){for(var t=0,n=f;t<n.length;t++)r.ondata(null,n[t],!1);f=[]},c=this.d;this.d=0;var p=this.u.length,v=Q(t,{f:e,u:a,o:s,t:function(){t.terminate&&t.terminate()},r:function(){if(l(),c){var t=r.u[p+1];t?t.r():r.d=1}c=1}}),d=0;t.ondata=function(e,i,o){if(e)r.ondata(e,i,o),r.terminate();else if(d+=i.length,f.push(i),o){var s=new n(16);ct(s,0,134695760),ct(s,4,t.crc),ct(s,8,d),ct(s,12,t.size),f.push(s),v.c=d,v.b=u+d+16,v.crc=t.crc,v.size=t.size,c&&v.r(),c=1}else c&&l()},this.u.push(v)}},t.prototype.end=function(){var t=this;2&this.d?this.ondata(I(4+8*(1&this.d),0,1),null,!0):(this.d?this.e():this.u.push({r:function(){1&t.d&&(t.u.splice(-1,1),t.e())},t:function(){}}),this.d=3)},t.prototype.e=function(){for(var t=0,r=0,e=0,i=0,o=this.u;i<o.length;i++)e+=46+(h=o[i]).f.length+un(h.extra)+(h.o?h.o.length:0);for(var s=new n(e+22),a=0,u=this.u;a<u.length;a++){var h;hn(s,t,h=u[a],h.f,h.u,-h.c-2,r,h.o),t+=46+h.f.length+un(h.extra)+(h.o?h.o.length:0),r+=h.b}fn(s,t,this.u.length,e,r),this.ondata(null,s,!0),this.d=2},t.prototype.terminate=function(){for(var t=0,n=this.u;t<n.length;t++)n[t].t();this.d=2},t}();function dn(t,r,e){e||(e=r,r={}),"function"!=typeof e&&I(7);var i={};Rt(t,"",i,r);var o=Object.keys(i),s=o.length,a=0,u=0,h=s,f=Array(s),l=[],c=function(){for(var t=0;t<l.length;++t)l[t]()},p=function(t,n){xn((function(){e(t,n)}))};xn((function(){p=e}));var v=function(){var t=new n(u+22),r=a,e=u-a;u=0;for(var i=0;i<h;++i){var o=f[i];try{var s=o.c.length;hn(t,u,o,o.f,o.u,s);var l=30+o.f.length+un(o.extra),c=u+l;t.set(o.c,c),hn(t,a,o,o.f,o.u,s,u,o.m),a+=16+l+(o.m?o.m.length:0),u=c+s}catch(t){return p(t,null)}}fn(t,a,f.length,e,r),p(null,t)};s||v();for(var d=function(t){var n=o[t],r=i[n],e=r[0],h=r[1],d=Y(),g=e.length;d.p(e);var y=nn(n),m=y.length,b=h.comment,w=b&&nn(b),x=w&&w.length,z=un(h.extra),k=0==h.level?0:8,M=function(r,e){if(r)c(),p(r,null);else{var i=e.length;f[t]=Q(h,{size:g,crc:d.d(),c:e,f:y,m:w,u:m!=n.length||w&&b.length!=x,compression:k}),a+=30+m+z+i,u+=76+2*(m+z)+(x||0)+i,--s||v()}};if(m>65535&&M(I(11,0,1),null),k)if(g<16e4)try{M(null,kt(e,h))}catch(t){M(t,null)}else l.push(zt(e,h,M));else M(null,e)},g=0;g<h;++g)d(g);return c}function gn(t,r){r||(r={});var e={},i=[];Rt(t,"",e,r);var o=0,s=0;for(var a in e){var u=e[a],h=u[0],f=u[1],l=0==f.level?0:8,c=(M=nn(a)).length,p=f.comment,v=p&&nn(p),d=v&&v.length,g=un(f.extra);c>65535&&I(11);var y=l?kt(h,f):h,m=y.length,b=Y();b.p(h),i.push(Q(f,{size:h.length,crc:b.d(),c:y,f:M,m:v,u:c!=a.length||v&&p.length!=d,o:o,compression:l})),o+=30+c+g+m,s+=76+2*(c+g)+(d||0)+m}for(var w=new n(s+22),x=o,z=s-o,k=0;k<i.length;++k){var M;hn(w,(M=i[k]).o,M,M.f,M.u,M.c.length);var S=30+M.f.length+un(M.extra);w.set(M.c,M.o+S),hn(w,o,M,M.f,M.u,M.c.length,M.o,M.m),o+=16+S+(M.m?M.m.length:0)}return fn(w,o,i.length,z,x),w}_e.Zip=vn,_e.zip=dn,_e.zipSync=gn;var yn=function(){function t(){}return t.prototype.push=function(t,n){this.ondata(null,t,n)},t.compression=0,t}();_e.UnzipPassThrough=yn;var mn=function(){function t(){var t=this;this.i=new Mt((function(n,r){t.ondata(null,n,r)}))}return t.prototype.push=function(t,n){try{this.i.push(t,n)}catch(t){this.ondata(t,null,n)}},t.compression=8,t}();_e.UnzipInflate=mn;var bn=function(){function t(t,n){var r=this;n<32e4?this.i=new Mt((function(t,n){r.ondata(null,t,n)})):(this.i=new St((function(t,n,e){r.ondata(t,n,e)})),this.terminate=this.i.terminate)}return t.prototype.push=function(t,n){this.i.terminate&&(t=D(t,0)),this.i.push(t,n)},t.compression=8,t}();_e.AsyncUnzipInflate=bn;var wn=function(){function t(t){this.onfile=t,this.k=[],this.o={0:yn},this.p=N}return t.prototype.push=function(t,r){var e=this;if(this.onfile||I(5),this.p||I(4),this.c>0){var i=Math.min(this.c,t.length),o=t.subarray(0,i);if(this.c-=i,this.d?this.d.push(o,!this.c):this.k[0].push(o),(t=t.subarray(i)).length)return this.push(t,r)}else{var s=0,a=0,u=void 0,h=void 0;this.p.length?t.length?((h=new n(this.p.length+t.length)).set(this.p),h.set(t,this.p.length)):h=this.p:h=t;for(var f=h.length,l=this.c,c=l&&this.d,p=function(){var t,n=ft(h,a);if(67324752==n){s=1,u=a,v.d=null,v.c=0;var r=ht(h,a+6),i=ht(h,a+8),o=2048&r,c=8&r,p=ht(h,a+26),d=ht(h,a+28);if(f>a+30+p+d){var g=[];v.k.unshift(g),s=2;var y,m=ft(h,a+18),b=ft(h,a+22),w=rn(h.subarray(a+30,a+=30+p),!o);4294967295==m?(t=c?[-2]:an(h,a),m=t[0],b=t[1]):c&&(m=-1),a+=d,v.c=m;var x={name:w,compression:i,start:function(){if(x.ondata||I(5),m){var t=e.o[i];t||x.ondata(I(14,"unknown compression type "+i,1),null,!1),(y=m<0?new t(w):new t(w,m,b)).ondata=function(t,n,r){x.ondata(t,n,r)};for(var n=0,r=g;n<r.length;n++)y.push(r[n],!1);e.k[0]==g&&e.c?e.d=y:y.push(N,!0)}else x.ondata(null,N,!0)},terminate:function(){y&&y.terminate&&y.terminate()}};m>=0&&(x.size=m,x.originalSize=b),v.onfile(x)}return"break"}if(l){if(134695760==n)return u=a+=12+(-2==l&&8),s=3,v.c=0,"break";if(33639248==n)return u=a-=4,s=3,v.c=0,"break"}},v=this;a<f-4&&"break"!==p();++a);if(this.p=N,l<0){var d=h.subarray(0,s?u-12-(-2==l&&8)-(134695760==ft(h,u-16)&&4):a);c?c.push(d,!!s):this.k[+(2==s)].push(d)}if(2&s)return this.push(h.subarray(a),r);this.p=h.subarray(a)}r&&(this.c&&I(13),this.p=null)},t.prototype.register=function(t){this.o[t.compression]=t},t}();_e.Unzip=wn;var xn="function"==typeof queueMicrotask?queueMicrotask:"function"==typeof setTimeout?setTimeout:function(t){t()};function zn(t,r,e){e||(e=r,r={}),"function"!=typeof e&&I(7);var i=[],o=function(){for(var t=0;t<i.length;++t)i[t]()},s={},a=function(t,n){xn((function(){e(t,n)}))};xn((function(){a=e}));for(var u=t.length-22;101010256!=ft(t,u);--u)if(!u||t.length-u>65558)return a(I(13,0,1),null),o;var h=ht(t,u+8);if(h){var f=h,l=ft(t,u+16),c=4294967295==l||65535==f;if(c){var p=ft(t,u-12);(c=101075792==ft(t,p))&&(f=h=ft(t,p+32),l=ft(t,p+48))}for(var v=r&&r.filter,d=function(r){var e=sn(t,l,c),u=e[0],f=e[1],p=e[2],d=e[3],g=e[4],y=on(t,e[5]);l=g;var m=function(t,n){t?(o(),a(t,null)):(n&&(s[d]=n),--h||a(null,s))};if(!v||v({name:d,size:f,originalSize:p,compression:u}))if(u)if(8==u){var b=t.subarray(y,y+f);if(p<524288||f>.8*p)try{m(null,Tt(b,{out:new n(p)}))}catch(t){m(t,null)}else i.push(At(b,{size:p},m))}else m(I(14,"unknown compression type "+u,1),null);else m(null,D(t,y,y+f));else m(null,null)},g=0;g<f;++g)d()}else a(null,{});return o}function kn(t,r){for(var e={},i=t.length-22;101010256!=ft(t,i);--i)(!i||t.length-i>65558)&&I(13);var o=ht(t,i+8);if(!o)return{};var s=ft(t,i+16),a=4294967295==s||65535==o;if(a){var u=ft(t,i-12);(a=101075792==ft(t,u))&&(o=ft(t,u+32),s=ft(t,u+48))}for(var h=r&&r.filter,f=0;f<o;++f){var l=sn(t,s,a),c=l[0],p=l[1],v=l[2],d=l[3],g=l[4],y=on(t,l[5]);s=g,h&&!h({name:d,size:p,originalSize:v,compression:c})||(c?8==c?e[d]=Tt(t.subarray(y,y+p),{out:new n(v)}):I(14,"unknown compression type "+c):e[d]=D(t,y,y+p))}return e}_e.unzip=zn,_e.unzipSync=kn;return _e});

(function(){
'use strict';

/* ---- ported form logic (verbatim; document-wide selectors scoped to #crrRoot) ---- */
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
               'custEmail','custPhone','custFax','eqUnitName','eqCables','eqModes','eqReaction',
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


// === Default the date to today ===
(function defaultDate() {
  const d = new Date();
  const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  $('quoteDate').value = iso;
})();

// Set initial Section VII hint
refreshQuoteReqHint();


/* ============================================================
   Phase 2 — Supabase persistence, list view, draft/finished
   lifecycle, and the open-count badge. Uses the page globals
   sb, currentEmployee, employees (available because this is a
   native module, not an iframe). Reuses collectFormData() /
   applyFormData() from the form logic above as the lossless
   serialize / restore pair against the crr_workups.data blob.
   ============================================================ */

let crrCurrentQuote = null;   // quote_number open in the form (null = list view)
let crrDirty       = false;   // unsaved edits in the open form
let crrList        = [];      // cached crr_workups rows for the list

function crrEmpId() {
  return (typeof currentEmployee !== 'undefined' && currentEmployee) ? currentEmployee.id : null;
}
function crrEmpName(id) {
  if (id == null) return '';
  try {
    if (typeof employees !== 'undefined' && Array.isArray(employees)) {
      const e = employees.find(x => x.id === id);
      if (e) return e.name || e.initials || '';
    }
  } catch (_) {}
  return '';
}
function crrFmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function crrEscHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---- view switching ----
function crrShowForm() {
  const lv = document.getElementById('crrListView');
  const fv = document.getElementById('crrFormView');
  if (lv) lv.style.display = 'none';
  if (fv) fv.style.display = 'flex';
}
function crrShowList() {
  const lv = document.getElementById('crrListView');
  const fv = document.getElementById('crrFormView');
  if (fv) fv.style.display = 'none';
  if (lv) lv.style.display = '';
}

// ---- list ----
async function crrLoadList() {
  if (typeof sb === 'undefined' || !sb) return;
  const { data, error } = await sb.from('crr_workups')
    .select('quote_number,customer_company,status,updated_at,updated_by')
    .order('updated_at', { ascending: false });
  if (error) { console.error('crr list:', error); setStatus('Could not load workups', 'warn'); return; }
  crrList = data || [];
  crrRenderList();
  refreshCrrBadge();
}

function crrRowHtml(r) {
  return '<tr class="crr-li" data-q="' + crrEscHtml(r.quote_number) + '">'
       + '<td class="crr-q">' + crrEscHtml(r.quote_number) + '</td>'
       + '<td>' + crrEscHtml(r.customer_company) + '</td>'
       + '<td>' + crrEscHtml(crrEmpName(r.updated_by)) + '</td>'
       + '<td>' + crrEscHtml(crrFmtDate(r.updated_at)) + '</td>'
       + '</tr>';
}

function crrRenderList() {
  const wrap = document.getElementById('crrListBody');
  if (!wrap) return;
  const open   = crrList.filter(r => r.status !== 'finished');
  const closed = crrList.filter(r => r.status === 'finished');
  const head = '<thead><tr><th>Quote #</th><th>Company</th><th>Last edited by</th><th>Updated</th></tr></thead>';

  let html = '';
  html += '<div class="crr-list-head"><h2>Open Workups <span class="crr-count">' + open.length + '</span></h2>'
        + '<button type="button" class="crr-btn primary" id="crrNewBtn">+ New Workup</button></div>';
  html += '<div id="crrNewForm" class="crr-newform" style="display:none">'
        + '<input type="text" id="crrNewQuote" placeholder="Quote # (e.g. 26-160)" autocomplete="off"/>'
        + '<input type="text" id="crrNewCompany" placeholder="Company" autocomplete="off"/>'
        + '<input type="date" id="crrNewDate"/>'
        + '<button type="button" class="crr-btn primary" id="crrCreateBtn">Create</button>'
        + '<button type="button" class="crr-btn" id="crrCancelNewBtn">Cancel</button>'
        + '<span class="crr-newmsg" id="crrNewMsg"></span></div>';
  html += open.length
        ? '<table class="crr-list">' + head + '<tbody>' + open.map(crrRowHtml).join('') + '</tbody></table>'
        : '<div class="crr-empty">No open workups.</div>';
  html += '<div class="crr-closed-head" id="crrClosedToggle">'
        + '<span class="crr-caret">&#9656;</span> Closed Workups <span class="crr-count">' + closed.length + '</span></div>';
  html += '<div id="crrClosedWrap" style="display:none">'
        + (closed.length
            ? '<table class="crr-list">' + head + '<tbody>' + closed.map(crrRowHtml).join('') + '</tbody></table>'
            : '<div class="crr-empty">No closed workups.</div>')
        + '</div>';
  wrap.innerHTML = html;

  // default the new-workup date to today
  const nd = document.getElementById('crrNewDate');
  if (nd) {
    const d = new Date();
    nd.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // wire controls
  document.getElementById('crrNewBtn').addEventListener('click', crrShowNewForm);
  document.getElementById('crrCreateBtn').addEventListener('click', crrCreateWorkup);
  document.getElementById('crrCancelNewBtn').addEventListener('click', crrHideNewForm);
  const toggle = document.getElementById('crrClosedToggle');
  toggle.addEventListener('click', () => {
    const cw = document.getElementById('crrClosedWrap');
    const show = cw.style.display === 'none';
    cw.style.display = show ? '' : 'none';
    toggle.querySelector('.crr-caret').innerHTML = show ? '&#9662;' : '&#9656;';
  });
  wrap.querySelectorAll('tr.crr-li').forEach(tr => {
    tr.addEventListener('click', () => crrOpenWorkup(tr.dataset.q));
  });
}

function crrShowNewForm() {
  const f = document.getElementById('crrNewForm');
  if (f) { f.style.display = 'flex'; const q = document.getElementById('crrNewQuote'); if (q) q.focus(); }
}
function crrHideNewForm() {
  const f = document.getElementById('crrNewForm');
  if (f) { f.style.display = 'none'; const m = document.getElementById('crrNewMsg'); if (m) m.textContent = ''; }
}

async function crrCreateWorkup() {
  if (typeof sb === 'undefined' || !sb) return;
  const q       = document.getElementById('crrNewQuote').value.trim();
  const company = document.getElementById('crrNewCompany').value.trim();
  const date    = document.getElementById('crrNewDate').value;
  const msg     = document.getElementById('crrNewMsg');
  if (!q) { msg.textContent = 'Quote # is required.'; return; }
  if (crrList.some(r => r.quote_number === q)) { msg.textContent = 'That quote # already exists.'; return; }

  // Seed an empty form with the three creation fields, then snapshot it.
  crrClearForm();
  const qn = document.getElementById('quoteNo');     if (qn) qn.value = q;
  const cc = document.getElementById('custCompany'); if (cc) cc.value = company;
  const qd = document.getElementById('quoteDate');   if (qd && date) qd.value = date;

  const payload = {
    quote_number: q,
    customer_company: company || null,
    status: 'draft',
    data: collectFormData(),
    created_by: crrEmpId(),
    updated_by: crrEmpId()
  };
  const { error } = await sb.from('crr_workups').insert(payload);
  if (error) { console.error('crr create:', error); msg.textContent = 'Create failed: ' + (error.message || error); return; }
  crrHideNewForm();
  await crrLoadList();
  crrOpenWorkup(q);
}

async function crrOpenWorkup(quoteNo) {
  if (typeof sb === 'undefined' || !sb) return;
  const { data, error } = await sb.from('crr_workups').select('*').eq('quote_number', quoteNo).single();
  if (error || !data) { console.error('crr open:', error); setStatus('Could not open workup', 'warn'); return; }

  if (data.data) { applyFormData(data.data); } else { crrClearForm(); }

  // Quote # can be edited while the workup is a draft (e.g. consolidating
  // two workups on the same unit onto one quote #). Locked once finished.
  const qn = document.getElementById('quoteNo');
  if (qn) { qn.value = data.quote_number; qn.readOnly = (data.status === 'finished'); }

  crrCurrentQuote = data.quote_number;
  crrDirty = false;

  const lbl = document.getElementById('crrFormQuote');
  if (lbl) lbl.textContent = 'Quote #' + data.quote_number;
  const finBtn  = document.getElementById('crrFinishBtn');
  const saveBtn = document.getElementById('crrSaveDraftBtn');
  const loadWordBtn = document.getElementById('loadWord');
  const reopenBtn = document.getElementById('crrReopenBtn');
  const isFinished = data.status === 'finished';
  if (finBtn)  finBtn.style.display  = isFinished ? 'none' : '';
  if (saveBtn) saveBtn.style.display = isFinished ? 'none' : '';
  if (loadWordBtn) loadWordBtn.style.display = isFinished ? 'none' : '';
  if (reopenBtn) reopenBtn.style.display = isFinished ? '' : 'none';

  crrShowForm();
  setStatus(isFinished ? 'Finished workup (view only).' : 'Draft loaded.', 'ok');
}

// Clear every form field/checkbox/spec back to empty (was the old Reset).
function crrClearForm() {
  document.querySelectorAll('#crrRoot input[type=text],#crrRoot input[type=email],#crrRoot input[type=tel],#crrRoot input[type=date],#crrRoot input[type=number],#crrRoot textarea').forEach(el => { el.value = ''; });
  document.querySelectorAll('#crrRoot input[type=checkbox]').forEach(cb => { cb.checked = false; });
  state.enabledSpecs = {};
  state.specRows = {};
  document.querySelectorAll('#specOpts label').forEach(l => l.classList.remove('on'));
  renderAllTables();
  updateSizeCm();
  refreshQuoteReqHint();
}

async function crrSave(finish) {
  if (typeof sb === 'undefined' || !sb || !crrCurrentQuote) return;

  // Quote # is the primary key on crr_workups, so if it was edited we have
  // to rename the existing row (not just resave under the old number).
  const qn = document.getElementById('quoteNo');
  const newQ = qn ? qn.value.trim() : crrCurrentQuote;
  if (!newQ) { setStatus('Quote # is required.', 'warn'); return; }
  if (newQ !== crrCurrentQuote) {
    const { data: dupe, error: dupeErr } = await sb.from('crr_workups')
      .select('quote_number').eq('quote_number', newQ).maybeSingle();
    if (dupeErr) { console.error('crr rename check:', dupeErr); setStatus('Rename check failed: ' + (dupeErr.message || dupeErr), 'warn'); return; }
    if (dupe) { setStatus('Quote # ' + newQ + ' already exists — pick a different number.', 'warn'); return; }
    const { error: renameErr } = await sb.from('crr_workups')
      .update({ quote_number: newQ, updated_by: crrEmpId(), updated_at: new Date().toISOString() })
      .eq('quote_number', crrCurrentQuote);
    if (renameErr) { console.error('crr rename:', renameErr); setStatus('Rename failed: ' + (renameErr.message || renameErr), 'warn'); return; }
    crrCurrentQuote = newQ;
    const lbl = document.getElementById('crrFormQuote');
    if (lbl) lbl.textContent = 'Quote #' + newQ;
  }

  const cc = document.getElementById('custCompany');
  const payload = {
    quote_number: crrCurrentQuote,
    customer_company: cc ? (cc.value.trim() || null) : null,
    data: collectFormData(),
    status: finish ? 'finished' : 'draft',
    updated_by: crrEmpId(),
    updated_at: new Date().toISOString()
  };
  if (finish) { payload.closed_by = crrEmpId(); payload.closed_at = new Date().toISOString(); }

  const { error } = await sb.from('crr_workups').upsert(payload, { onConflict: 'quote_number' });
  if (error) { console.error('crr save:', error); setStatus('Save failed: ' + (error.message || error), 'warn'); return; }

  crrDirty = false;
  if (finish) {
    setStatus('Workup finished.', 'ok');
    await crrBackToList(true);
  } else {
    setStatus('Draft saved.', 'ok');
    crrLoadList(); // refresh cache + badge in the background
  }
}

// Reopen a finished workup as a draft (update-only so the data blob is untouched).
async function crrReopen() {
  if (typeof sb === 'undefined' || !sb || !crrCurrentQuote) return;
  if (!window.confirm('Reopen this finished workup as a draft? It moves back to Open Workups and becomes editable.')) return;
  const { error } = await sb.from('crr_workups')
    .update({ status: 'draft', closed_at: null, closed_by: null, updated_by: crrEmpId(), updated_at: new Date().toISOString() })
    .eq('quote_number', crrCurrentQuote);
  if (error) { console.error('crr reopen:', error); setStatus('Reopen failed: ' + (error.message || error), 'warn'); return; }
  setStatus('Workup reopened as draft.', 'ok');
  refreshCrrBadge();
  await crrOpenWorkup(crrCurrentQuote); // re-render in editable draft mode
}

async function crrBackToList(skipDirtyCheck) {
  if (!skipDirtyCheck && crrDirty) {
    if (!window.confirm('You have unsaved changes. Leave without saving?')) return;
  }
  crrCurrentQuote = null;
  crrDirty = false;
  crrShowList();
  await crrLoadList();
}

// ---- open-count badge (drafts) ----
function refreshCrrBadge() {
  const badge = document.getElementById('crrBadge');
  if (!badge) return;
  if (typeof sb === 'undefined' || !sb) return;
  sb.from('crr_workups')
    .select('quote_number', { count: 'exact', head: true })
    .neq('status', 'finished')
    .then(({ count }) => {
      const n = count || 0;
      badge.textContent = n;
      badge.style.display = n > 0 ? '' : 'none';
    })
    .catch(() => {});
}
window.refreshCrrBadge = refreshCrrBadge;

// ---- one-time form wiring: dirty tracking + the form-bar buttons ----
(function crrWireForm() {
  const root = document.getElementById('crrRoot');
  if (root) {
    root.addEventListener('input',  () => { crrDirty = true; });
    root.addEventListener('change', () => { crrDirty = true; });
  }
  const save = document.getElementById('crrSaveDraftBtn'); if (save) save.addEventListener('click', () => crrSave(false));
  const fin  = document.getElementById('crrFinishBtn');    if (fin)  fin.addEventListener('click',  () => crrSave(true));
  const back = document.getElementById('crrBackBtn');      if (back) back.addEventListener('click', () => crrBackToList(false));
  const reopen = document.getElementById('crrReopenBtn');  if (reopen) reopen.addEventListener('click', crrReopen);
})();

// Keep the badge live without needing to open the panel (like Surveys/Tasks).
setInterval(() => { try { refreshCrrBadge(); } catch (_) {} }, 60000);

// ===== Workspace panel entry point =====
window.openCrrPanel = function (el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  (el || document.getElementById('navCrr'))?.classList.add('active');
  const tb = document.getElementById('topbarName');
  if (tb) tb.textContent = 'EMI Quote WU';
  if (typeof showProjectView === 'function') showProjectView('panel-crr');
  crrShowList();
  crrLoadList();
};


/* ---- Word importer (CRRv7, verbatim; sets crrDirty on success) ---- */

// === Word import — best-effort extraction from existing .docx/.docm files ===
// Strategy: unzip with fflate, parse word/document.xml as XML, walk the body
// to collect paragraphs and tables in order, then run heuristic extractors to
// match field labels (fuzzy) and recognize spec tables by their column headers.
// Real-world documents are messy — fields that don't match expected patterns
// are skipped, not guessed at. A status report after import shows what was
// captured vs. what couldn't be parsed so the user can verify.

$('loadWord').addEventListener('click', () => $('wordInput').click());

$('wordInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = ''; // reset so the same file can be picked again
  if (!file) return;
  setStatus('Reading Word file…', 'info');
  try {
    const result = await importFromWord(file);
    if (result.success) {
      crrDirty = true;
      // Build status message — show counts so user knows what came through
      const counts = [];
      if (result.fieldCount > 0) counts.push(result.fieldCount + ' field' + (result.fieldCount!==1?'s':''));
      if (result.checkCount > 0) counts.push(result.checkCount + ' checkbox' + (result.checkCount!==1?'es':''));
      if (result.specCount > 0) counts.push(result.specCount + ' spec table' + (result.specCount!==1?'s':''));
      if (result.rowCount > 0) counts.push(result.rowCount + ' test row' + (result.rowCount!==1?'s':''));
      const summary = counts.length > 0
        ? 'Imported from ' + file.name + ': ' + counts.join(', ') + '. Please verify all values.'
        : 'Imported from ' + file.name + ' but nothing recognized. Document structure may differ from expected templates.';
      setStatus(summary, counts.length > 0 ? 'ok' : 'warn');
    } else {
      setStatus('Could not parse ' + file.name + ': ' + (result.error || 'unknown error'), 'warn');
    }
  } catch (err) {
    console.error('[WORD-IMPORT]', err);
    setStatus('Could not parse ' + file.name + ': ' + (err.message || err), 'warn');
  }
});

// Main import entry point — returns {success, fieldCount, checkCount, specCount, rowCount, error?}
async function importFromWord(file) {
  // 1. Read + unzip
  const buf = await file.arrayBuffer();
  let zipFiles;
  try {
    zipFiles = fflate.unzipSync(new Uint8Array(buf));
  } catch (e) {
    return { success: false, error: 'Not a valid Word file (zip read failed)' };
  }
  if (!zipFiles['word/document.xml']) {
    return { success: false, error: 'Not a Word document (missing document.xml)' };
  }
  // 2. Parse XML
  const xmlStr = new TextDecoder('utf-8').decode(zipFiles['word/document.xml']);
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
  const perr = xmlDoc.getElementsByTagName('parsererror')[0];
  if (perr) return { success: false, error: 'XML parse error: ' + perr.textContent.slice(0, 120) };

  // 3. Collect body items in order — paragraphs + tables
  const body = xmlDoc.getElementsByTagName('w:body')[0];
  if (!body) return { success: false, error: 'No body in document' };
  const items = walkBodyItems(body);

  // 4. Pull out tables for table-based extraction, and a flat text dump for keyword detection
  const tables = items.filter(it => it.type === 'table').map(it => it.table);
  const flatText = items.map(it => it.type === 'para' ? it.text : tableToText(it.table)).join('\n');

  // 5. Extract — start with a blank form-data shape that matches collectFormData's output
  const out = {
    version: 1,
    fields: {},
    checks: {},
    enabledSpecs: {},
    specRows: {},
  };
  let fieldCount = 0, checkCount = 0, specCount = 0, rowCount = 0;

  // ── Field extraction from tables ──
  // Walk every cell looking for label-like text, then take adjacent non-empty cell as the value
  // The .docm templates ship with a placeholder "Sss   x" sitting in the
  // Quote No. cell. Real techs often type the actual quote number AFTER the
  // placeholder rather than replacing it, producing "Sss   x26-123". Strip
  // this known pattern from any extracted value before storing.
  const scrubPlaceholders = (s) => {
    return String(s || '').replace(/^Sss\s+x\s*/i, '').trim();
  };
  const setField = (id, val) => {
    val = scrubPlaceholders(val);
    if (!val) return;
    out.fields[id] = val;
    fieldCount++;
  };

  // Label → field id mapping. Fuzzy match (case-insensitive, ignoring punctuation/whitespace).
  // Order matters: more specific labels first so they win over generic ones.
  const LABEL_MAP = [
    [['quote no', 'quote number'], 'quoteNo'],
    [['date'], 'quoteDate'],
    [['customer', 'company'], 'custCompany'],
    [['address'], 'custAddress'],
    [['name', 'contact name'], 'custName'],
    [['title'], 'custTitle'],
    [['e-mail', 'email'], 'custEmail'],
    [['phone'], 'custPhone'],
    [['fax'], 'custFax'],
    [['number of cables', 'cables'], 'eqCables'],
    [['modes of operation', 'mode'], 'eqModes'],
    [['immunity reaction time', 'reaction time'], 'eqReaction'],
    // Note: 'size' is special — needs L/W/H parsing, handled separately below
    [['weight'], 'eqWeight'],
    [['current'], 'eqCurrent'],
    [['voltage', 'voltage requirements'], 'eqVoltage'],
    [['emc other', 'other'], 'specOtherText'],
    [['special test requirements', 'rentals, complex setup'], 'specialReq'],
  ];

  const normalize = s => String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')          // collapse all whitespace (incl. newlines) to single space FIRST
    .replace(/[^a-z0-9 ]/g, ' ')   // replace remaining non-alphanumerics with space (not empty)
    .replace(/\s+/g, ' ')          // collapse runs of spaces again
    .trim();

  for (const tbl of tables) {
    for (let ri = 0; ri < tbl.length; ri++) {
      const row = tbl[ri];
      for (let ci = 0; ci < row.length; ci++) {
        const cellText = String(row[ci] || '').trim();
        if (!cellText) continue;
        const norm = normalize(cellText);
        // Strip trailing colon from labels like "Quote No.:" or "Name:"
        const cleanLabel = norm.replace(/[:.]+$/, '').trim();
        // Check each label mapping
        for (const [labels, fieldId] of LABEL_MAP) {
          if (out.fields[fieldId]) continue; // already captured
          // Match if the cell text:
          //   - is exactly the label, OR
          //   - starts with "label " (cell contains "Label: ...content..."), OR
          //   - ends with the label (cell is "Section V Special test requirements"), OR
          //   - matches the label with whitespace removed (compact form)
          const matchedLabel = labels.find(l =>
            cleanLabel === l ||
            cleanLabel.startsWith(l + ' ') ||
            cleanLabel.endsWith(' ' + l) ||
            cleanLabel === l.replace(/\s/g, '')
          );
          if (matchedLabel) {
            // Determine the value. Three cases:
            //   1. Cell contains "Label: actual content" — extract the content after the colon
            //   2. Value is in the cell to the right
            //   3. Value is in the cell below
            let value = '';
            // Case 1: cell has content beyond the label itself.
            // Take everything after the last colon in the ORIGINAL (not normalized) text.
            // But only if there's substantial content beyond the label.
            const colonIdx = cellText.lastIndexOf(':');
            if (colonIdx >= 0 && colonIdx < cellText.length - 2) {
              const afterColon = cellText.slice(colonIdx + 1).trim();
              // Only use if it doesn't itself look like a label
              if (afterColon && !looksLikeLabel(afterColon)) {
                value = afterColon;
              }
            }
            // Case 2: cell to the right
            if (!value) {
              for (let cj = ci + 1; cj < row.length; cj++) {
                const v = String(row[cj] || '').trim();
                if (v && !looksLikeLabel(v)) { value = v; break; }
                if (v && looksLikeLabel(v)) break; // another label, stop searching this row
              }
            }
            // Case 3: cell below
            if (!value && ri + 1 < tbl.length && tbl[ri + 1][ci]) {
              const v = String(tbl[ri + 1][ci] || '').trim();
              if (v && !looksLikeLabel(v)) value = v;
            }
            if (value) setField(fieldId, value);
            break;
          }
        }
      }
    }
  }

  // ── Special: parse size into L/W/H ──
  // Look for cells containing "Size:" and parse the adjacent text. Templates
  // use formats like "12 x 8 x 6 in", "12.5 × 8 × 6", "10 in x 8 in x 4 in".
  for (const tbl of tables) {
    for (let ri = 0; ri < tbl.length; ri++) {
      const row = tbl[ri];
      for (let ci = 0; ci < row.length; ci++) {
        const norm = normalize(row[ci]);
        if (norm === 'size' || norm.startsWith('size ') || norm === 'dimensions') {
          // Look in adjacent cells for the size string
          let sizeText = '';
          for (let cj = ci + 1; cj < row.length; cj++) {
            const v = String(row[cj] || '').trim();
            if (v) { sizeText = v; break; }
          }
          if (sizeText) {
            const parsed = parseSizeString(sizeText);
            if (parsed.L) { out.fields.eqSizeL = parsed.L; fieldCount++; }
            if (parsed.W) { out.fields.eqSizeW = parsed.W; fieldCount++; }
            if (parsed.H) { out.fields.eqSizeH = parsed.H; fieldCount++; }
          }
        }
      }
    }
  }

  // ── Checkbox extraction ──
  // Scan flatText for ☒/☑ glyphs near known labels (within ~60 chars). Section
  // VII text can contain these as informational noise, so we constrain to the
  // first 5000 chars (typically Section IV territory) for the spec/witness checks.
  const isChecked = (label, scope) => {
    const text = scope || flatText;
    // Look for "☒ label" or "label ☒" patterns (with some flexibility)
    const labelEscaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('[☒☑✓✔Xx]\\s*(?:[^\\n]{0,3})?' + labelEscaped, 'i');
    return re.test(text);
  };

  const setCheck = (key, val) => {
    if (val) { out.checks[key] = true; checkCount++; }
  };

  // Section II — Information requested
  setCheck('reqQuote',   isChecked('Quote'));
  setCheck('reqLit',     isChecked('Literature'));
  setCheck('reqVisit',   isChecked('Sales visit') || isChecked('Sales\\s*visit'));

  // Section III — Power characteristics. Use a tighter scope to avoid Section VII contamination
  const sec3Scope = flatText.slice(0, 8000);
  setCheck('pwrAC',    isChecked('AC', sec3Scope));
  setCheck('pwrDC',    isChecked('DC', sec3Scope));
  setCheck('pwr50',    isChecked('50\\s*Hz', sec3Scope));
  setCheck('pwr60',    isChecked('60\\s*Hz', sec3Scope));
  setCheck('pwr400',   isChecked('400\\s*Hz', sec3Scope));
  setCheck('pwr1ph',   isChecked('1\\s*phase', sec3Scope) || isChecked('Single\\s*phase', sec3Scope));
  setCheck('pwr3ph',   isChecked('3\\s*phase', sec3Scope) || isChecked('Three\\s*phase', sec3Scope));
  setCheck('pwrY',     isChecked('Y', sec3Scope));
  setCheck('pwrDelta', isChecked('Delta', sec3Scope) || isChecked('Δ', sec3Scope));

  // Section IV — Test specifications + witness/CUI
  setCheck('specMS461',     isChecked('MIL[\\-\\s]*STD[\\-\\s]*461') || isChecked('MILSTD461'));
  setCheck('specMS1399',    isChecked('MIL[\\-\\s]*STD[\\-\\s]*1399') || isChecked('MILSTD1399'));
  setCheck('specEMCOther',  isChecked('EMC other'));
  setCheck('govWitness',    isChecked('Government witness'));
  setCheck('cuiReq',        isChecked('CUI'));

  // ── Spec table extraction ──
  // Find tables whose first row contains spec-style headers, then determine
  // which spec (461F/G, 300B/P1, DC Mag) by looking at body text + filename.
  const fname = (file.name || '').toLowerCase();
  const docTextLower = flatText.toLowerCase();

  // Determine which spec(s) this document covers.
  // Use (?![a-z]) instead of \b for boundary — \b treats underscores as word chars,
  // so "300B_DC" wouldn't match /300\s*b\b/. We need to allow boundaries on _ too.
  const hint461F = /461\s*f(?![a-z])/i.test(fname) || /461\s*f(?![a-z])/i.test(docTextLower);
  const hint461G = /461\s*g(?![a-z])/i.test(fname) || /461\s*g(?![a-z])/i.test(docTextLower);
  const hint300B = /300\s*b(?![a-z])/i.test(fname) || /1399[^\n]{0,40}300\s*b(?![a-z])/i.test(docTextLower);
  const hint300P1 = /300[^\n]{0,5}part\s*1/i.test(fname) || /300[^\n]{0,5}part\s*1/i.test(docTextLower);
  const hintDCMag = /dc[\s_-]*mag/i.test(fname) || /dc magnetics/i.test(docTextLower);

  // Helper: classify a single EMI/DCM-style row by its test name
  // Returns 'emi' | 'dcmag' | 'unknown'
  const classifyEmiRow = (row) => {
    const testName = String(row[0] || '').trim();
    // DC Mag rows: test name contains "DC Mag" or "magnetic"
    if (/dc\s*mag/i.test(testName) || /magnetic/i.test(testName)) return 'dcmag';
    // EMI tests have codes like CE101, CS114, RE102, RS103 — letter+digit
    if (/^(CE|CS|RE|RS)\d/i.test(testName)) return 'emi';
    // Otherwise unknown — could be a blank separator row or something weird
    return 'unknown';
  };

  // Walk tables looking for spec headers
  // EMI/DCM-style header: [Test, Description, Time, Comments]
  // PQ-style header: [Requirement, ..., Time (hr), ..., 1399 Paragraph, ...]
  for (const tbl of tables) {
    if (!tbl.length) continue;
    const header = tbl[0].map(c => normalize(c));
    // Match EMI/DCM header
    const isEmiDcmHeader = header.length >= 4 &&
                            header[0] === 'test' &&
                            header[1] === 'description' &&
                            (header[2] === 'time' || header[2].startsWith('time')) &&
                            header[3] === 'comments';
    // Match PQ header
    const isPqHeader = header.some(h => h.includes('requirement')) &&
                        header.some(h => h.startsWith('time')) &&
                        header.some(h => h.includes('paragraph'));

    if (isEmiDcmHeader) {
      // Get test rows (skip header). Trim to 4 cells.
      const allRows = tbl.slice(1).map(r => [
        String(r[0] || '').trim(),
        String(r[1] || '').trim(),
        String(r[2] || '').trim(),
        String(r[3] || '').trim(),
      ]).filter(r => r.some(c => c)); // drop fully empty rows
      if (allRows.length === 0) continue;
      // Split rows by classification — EMI tests vs DC Mag tests vs unknown.
      // Combined templates (D, E, F) put DC Mag as a single row at the bottom
      // of the EMI test table. We want both specs separately.
      const emiRows = allRows.filter(r => classifyEmiRow(r) === 'emi');
      const dcmagRows = allRows.filter(r => classifyEmiRow(r) === 'dcmag');
      const unknownRows = allRows.filter(r => classifyEmiRow(r) === 'unknown');

      // Decide where unknown rows go — if the doc looks like a DC-Mag-only doc
      // (small table, hintDCMag is set, no EMI rows), treat unknowns as dcmag.
      // Otherwise default unknowns into EMI (preserves user content).
      if (emiRows.length === 0 && dcmagRows.length === 0 && hintDCMag) {
        dcmagRows.push(...unknownRows);
      } else if (emiRows.length > 0) {
        emiRows.push(...unknownRows);
      } else if (dcmagRows.length > 0) {
        dcmagRows.push(...unknownRows);
      }

      // Emit EMI spec if any EMI rows
      if (emiRows.length > 0) {
        let specKey;
        if (hint461G && !hint461F) specKey = 'emi461g';
        else if (hint461F && !hint461G) specKey = 'emi461f';
        else if (hint461G) specKey = 'emi461g';
        else if (hint461F) specKey = 'emi461f';
        else {
          // Guess by test names: CS115 only in G, CS106 only in F
          const hasCS115 = emiRows.some(r => /^cs115/i.test(r[0]));
          const hasCS106 = emiRows.some(r => /^cs106/i.test(r[0]));
          if (hasCS115 && !hasCS106) specKey = 'emi461g';
          else if (hasCS106 && !hasCS115) specKey = 'emi461f';
          else specKey = 'emi461g';
        }
        // Merge with existing rows if this spec was already populated
        // (rare — multiple EMI tables in one doc — but possible)
        if (out.enabledSpecs[specKey] && out.specRows[specKey]) {
          out.specRows[specKey] = out.specRows[specKey].concat(emiRows);
          rowCount += emiRows.length;
        } else {
          out.enabledSpecs[specKey] = true;
          out.specRows[specKey] = emiRows;
          specCount++;
          rowCount += emiRows.length;
        }
      }
      // Emit DC Mag spec if any DC Mag rows
      if (dcmagRows.length > 0) {
        if (out.enabledSpecs.dcmag && out.specRows.dcmag) {
          out.specRows.dcmag = out.specRows.dcmag.concat(dcmagRows);
          rowCount += dcmagRows.length;
        } else {
          out.enabledSpecs.dcmag = true;
          out.specRows.dcmag = dcmagRows;
          specCount++;
          rowCount += dcmagRows.length;
        }
      }
    } else if (isPqHeader) {
      // PQ header columns might be in different order. Identify each column's role.
      const cols = header.map(h => {
        if (h.includes('requirement') && !h.includes('test')) return 'requirement';
        if (h.startsWith('time')) return 'time';
        if (h.includes('1399') && h.includes('paragraph')) return 'paragraph';
        if (h.includes('test requirement') || h === 'test') return 'testReq';
        if (h.includes('tables') || h.includes('figures')) return 'tables';
        return null;
      });
      const idxOf = role => cols.findIndex(c => c === role);
      const iReq = idxOf('requirement');
      const iTime = idxOf('time');
      const iPara = idxOf('paragraph');
      const iTestReq = idxOf('testReq');
      const iTables = idxOf('tables');
      const allPqRows = tbl.slice(1).map(r => [
        iReq >= 0 ? String(r[iReq] || '').trim() : '',
        iTime >= 0 ? String(r[iTime] || '').trim() : '',
        iPara >= 0 ? String(r[iPara] || '').trim() : '',
        iTestReq >= 0 ? String(r[iTestReq] || '').trim() : '',
        iTables >= 0 ? String(r[iTables] || '').trim() : '',
      ]).filter(r => r.some(c => c));
      if (allPqRows.length === 0) continue;

      // Split out DC Mag rows — some templates (e.g. 554F) cram DC Magnetics
      // into the PQ table as a normal requirement row. Detect by the
      // requirement column containing "DC Mag" or "magnetic".
      const dcMagRowsFromPq = [];
      const pqRows = [];
      for (const r of allPqRows) {
        const req = r[0];
        if (/dc\s*mag/i.test(req) || /magnetic/i.test(req)) {
          // Convert PQ shape to DC Mag shape [test, description, time, comments]
          // PQ shape is [requirement, time, paragraph, testReq, tables]
          // Map: requirement → test, paragraph or "DOD-STD-1399 Section 070" → description,
          //      time → time, tables → comments (most informative cell for DC Mag)
          dcMagRowsFromPq.push([
            r[0], // test
            r[2] || 'DOD-STD-1399 Section 070', // description — fallback to standard ref
            r[1], // time
            r[4] || r[3], // comments — prefer tables col, fall back to test req col
          ]);
        } else {
          pqRows.push(r);
        }
      }

      // Emit PQ section (if any rows left after splitting out DC Mag)
      if (pqRows.length > 0) {
        let specKey;
        if (hint300B && !hint300P1) specKey = 'pq300b';
        else if (hint300P1 && !hint300B) specKey = 'pq300p1';
        else if (hint300B) specKey = 'pq300b';
        else if (hint300P1) specKey = 'pq300p1';
        else {
          // Look at paragraph cells to guess. 300B uses "B5.3.X" style. 300P1 uses plain "5.3.X".
          const anyB = pqRows.some(r => /^b\s*5/i.test(r[2]));
          specKey = anyB ? 'pq300b' : 'pq300p1';
        }
        if (out.enabledSpecs[specKey] && out.specRows[specKey]) {
          out.specRows[specKey] = out.specRows[specKey].concat(pqRows);
          rowCount += pqRows.length;
        } else {
          out.enabledSpecs[specKey] = true;
          out.specRows[specKey] = pqRows;
          specCount++;
          rowCount += pqRows.length;
        }
      }
      // Emit DC Mag rows extracted from the PQ table
      if (dcMagRowsFromPq.length > 0) {
        if (out.enabledSpecs.dcmag && out.specRows.dcmag) {
          out.specRows.dcmag = out.specRows.dcmag.concat(dcMagRowsFromPq);
          rowCount += dcMagRowsFromPq.length;
        } else {
          out.enabledSpecs.dcmag = true;
          out.specRows.dcmag = dcMagRowsFromPq;
          specCount++;
          rowCount += dcMagRowsFromPq.length;
        }
      }
    }
  }

  // ── Section VII quote requirements text ──
  // Look for a paragraph or single-cell table containing "Special requirements for quote"
  // or "VII" and take the text content.
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let text = item.type === 'para' ? item.text : tableToText(item.table);
    if (/special requirements for quote/i.test(text) || /^vii\s/i.test(text)) {
      // Strip the leading label
      let cleaned = text.replace(/^vii\s*/i, '')
                        .replace(/special requirements for quote\s*:?\s*/i, '')
                        .trim();
      if (cleaned && cleaned.length > 20) {
        out.fields.quoteReq = cleaned;
        fieldCount++;
        break;
      }
    }
  }

  // ── Apply to form ──
  applyFormData(out);

  return { success: true, fieldCount, checkCount, specCount, rowCount };
}

// Helper: walk the body, return ordered items {type, text, table}
function walkBodyItems(body) {
  const items = [];
  for (const child of body.children) {
    const lname = child.localName;
    if (lname === 'p') {
      items.push({ type: 'para', text: extractParaText(child) });
    } else if (lname === 'tbl') {
      items.push({ type: 'table', table: extractTable(child) });
    }
  }
  return items;
}

// Extract text from a w:p — concatenate all w:t runs
function extractParaText(p) {
  const texts = p.getElementsByTagName('w:t');
  let out = '';
  for (const t of texts) out += t.textContent;
  return out;
}

// Extract a table as 2D array of cell text
function extractTable(tbl) {
  const rows = [];
  for (const tr of tbl.getElementsByTagName('w:tr')) {
    const cells = [];
    for (const tc of tr.getElementsByTagName('w:tc')) {
      // Concatenate all paragraphs in the cell with \n
      const paras = tc.getElementsByTagName('w:p');
      const cellText = Array.from(paras).map(extractParaText).join('\n').trim();
      cells.push(cellText);
    }
    rows.push(cells);
  }
  return rows;
}

// Flatten a table to plain text for keyword scans
function tableToText(tbl) {
  return tbl.map(r => r.join(' | ')).join('\n');
}

// Decide if a string is itself a label (so we don't take a label as a value)
function looksLikeLabel(s) {
  const t = String(s || '').trim().toLowerCase().replace(/[:.]+$/, '');
  const LABEL_KEYWORDS = ['quote no', 'date', 'customer', 'company', 'address', 'name',
    'title', 'e-mail', 'email', 'phone', 'fax', 'cables', 'modes', 'reaction',
    'size', 'weight', 'voltage', 'current', 'special test', 'rentals'];
  return LABEL_KEYWORDS.some(k => t === k || t.endsWith(' ' + k) || t.startsWith(k + ' '));
}

// Parse "12 x 8 x 6 in" → {L:"12", W:"8", H:"6"}
function parseSizeString(s) {
  if (!s) return {};
  // Strip units
  const cleaned = s.replace(/inch(es)?|in\.?|cm|mm/gi, '').trim();
  // Try common separators: x, ×, by
  const m = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)/i);
  if (m) return { L: m[1], W: m[2], H: m[3] };
  // Try just one or two dimensions
  const m2 = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)/i);
  if (m2) return { L: m2[1], W: m2[2] };
  return {};
}
})();
