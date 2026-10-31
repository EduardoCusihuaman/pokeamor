"""Compile and render the actual GLSL with a surfaceless EGL/GLES2 context when available."""
import ctypes as C,ctypes.util,re
from pathlib import Path
lib=ctypes.util.find_library('EGL')
if not lib:raise SystemExit('SKIP: EGL is not available; physical WebGL validation remains pending.')
e=C.CDLL(lib)
e.eglGetProcAddress.argtypes=[C.c_char_p];e.eglGetProcAddress.restype=C.c_void_p
ptr=e.eglGetProcAddress(b'eglGetPlatformDisplayEXT')
if not ptr:raise SystemExit('SKIP: no surfaceless EGL display.')
platform=C.CFUNCTYPE(C.c_void_p,C.c_uint,C.c_void_p,C.POINTER(C.c_int))(ptr);d=platform(0x31DD,None,None)
e.eglInitialize.argtypes=[C.c_void_p,C.POINTER(C.c_int),C.POINTER(C.c_int)];e.eglInitialize.restype=C.c_uint
major=C.c_int();minor=C.c_int()
if not e.eglInitialize(d,C.byref(major),C.byref(minor)):raise SystemExit('SKIP: EGL could not initialize an offscreen renderer.')
e.eglBindAPI.argtypes=[C.c_uint];e.eglBindAPI(0x30A0)
attrs=(C.c_int*15)(0x3033,1,0x3040,4,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038,0x3038,0x3038)
e.eglChooseConfig.argtypes=[C.c_void_p,C.POINTER(C.c_int),C.POINTER(C.c_void_p),C.c_int,C.POINTER(C.c_int)];config=C.c_void_p();count=C.c_int();e.eglChooseConfig(d,attrs,C.byref(config),1,C.byref(count))
if not count.value:raise SystemExit('SKIP: no GLES2 configuration.')
e.eglCreatePbufferSurface.argtypes=[C.c_void_p,C.c_void_p,C.POINTER(C.c_int)];e.eglCreatePbufferSurface.restype=C.c_void_p;surface=e.eglCreatePbufferSurface(d,config,(C.c_int*5)(0x3057,16,0x3056,16,0x3038))
e.eglCreateContext.argtypes=[C.c_void_p,C.c_void_p,C.c_void_p,C.POINTER(C.c_int)];e.eglCreateContext.restype=C.c_void_p;ctx=e.eglCreateContext(d,config,None,(C.c_int*3)(0x3098,2,0x3038))
e.eglMakeCurrent.argtypes=[C.c_void_p,C.c_void_p,C.c_void_p,C.c_void_p]
if not e.eglMakeCurrent(d,surface,surface,ctx):raise SystemExit('SKIP: could not activate a GLES2 context.')
def fn(name,result,*args):
 p=e.eglGetProcAddress(name.encode());assert p,name
 return C.CFUNCTYPE(result,*args)(p)
ui=C.c_uint;it=C.c_int;fl=C.c_float;vp=C.c_void_p
create=fn('glCreateShader',ui,ui);sourcefn=fn('glShaderSource',None,ui,it,C.POINTER(C.c_char_p),C.POINTER(it));compilefn=fn('glCompileShader',None,ui);get=fn('glGetShaderiv',None,ui,ui,C.POINTER(it));log=fn('glGetShaderInfoLog',None,ui,it,C.POINTER(it),C.c_char_p)
text=Path('holo.js').read_text();shaders=[]
for name,kind in [('vertex',0x8B31),('fragment',0x8B30)]:
 src=re.search(r'const '+name+r'=`([\s\S]*?)`;',text)[1].encode();s=create(kind);p=C.c_char_p(src);sourcefn(s,1,C.byref(p),None);compilefn(s);ok=it();get(s,0x8B81,C.byref(ok));buf=C.create_string_buffer(4096);log(s,4096,None,buf);assert ok.value,f'{name}: {buf.value.decode()}';shaders.append(s)
program=fn('glCreateProgram',ui)();attach=fn('glAttachShader',None,ui,ui)
for s in shaders:attach(program,s)
fn('glLinkProgram',None,ui)(program);ok=it();fn('glGetProgramiv',None,ui,ui,C.POINTER(it))(program,0x8B82,C.byref(ok));assert ok.value,'link failed';fn('glUseProgram',None,ui)(program)
buffer=ui();fn('glGenBuffers',None,it,C.POINTER(ui))(1,C.byref(buffer));fn('glBindBuffer',None,ui,ui)(0x8892,buffer);data=(fl*8)(-1,-1,1,-1,-1,1,1,1);fn('glBufferData',None,ui,C.c_ssize_t,vp,ui)(0x8892,C.sizeof(data),data,0x88E4)
pos=fn('glGetAttribLocation',it,ui,C.c_char_p)(program,b'a_position');fn('glEnableVertexAttribArray',None,ui)(pos);fn('glVertexAttribPointer',None,ui,it,ui,C.c_ubyte,it,vp)(pos,2,0x1406,0,0,None);fn('glViewport',None,it,it,it,it)(0,0,16,16)
loc=fn('glGetUniformLocation',it,ui,C.c_char_p);u1=fn('glUniform1f',None,it,fl);u2=fn('glUniform2f',None,it,fl,fl);u1(loc(program,b'u_full'),1);u1(loc(program,b'u_finish'),2);u2(loc(program,b'u_resolution'),16,16);u1(loc(program,b'u_energy'),.8)
def render(x,y):
 u2(loc(program,b'u_light'),x,y);fn('glDrawArrays',None,ui,it,it)(5,0,4);pixels=(C.c_ubyte*1024)();fn('glReadPixels',None,it,it,it,it,ui,ui,vp)(0,0,16,16,0x1908,0x1401,pixels);return bytes(pixels)
a=render(-.6,.1);b=render(.6,.4);assert a!=b,'tilting must change the reflection';assert 0<max(a[3::4])<=134,'foil must remain translucent'
u1(loc(program,b'u_finish'),0);regular=render(.6,.4);assert regular!=b,'foil finishes must differ';u1(loc(program,b'u_full'),0);window=render(.6,.4);assert max(window[3::4])>0 and not any(window[3:64:4]),'window foil must preserve the printed margins';u1(loc(program,b'u_energy'),0);assert not any(render(0,0)[3::4]),'zero energy must be transparent'
print('PASS: actual GLSL compile/render, angle response, distinct foil finishes, margin mask and transparency.')
e.eglMakeCurrent(d,None,None,None);e.eglDestroyContext.argtypes=[vp,vp];e.eglDestroyContext(d,ctx);e.eglDestroySurface.argtypes=[vp,vp];e.eglDestroySurface(d,surface);e.eglTerminate.argtypes=[vp];e.eglTerminate(d)
