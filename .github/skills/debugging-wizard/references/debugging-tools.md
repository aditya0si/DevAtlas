# Debugging Tools

Language-specific debuggers and inspection tools.

## Python

### pdb (Built-in)

```bash
python -m pdb script.py
```

**Key commands:**
- `b <line>` — set breakpoint
- `b <file>:<line>` — breakpoint in specific file
- `c` — continue execution
- `n` — step over (next line)
- `s` — step into function
- `r` — step out (return)
- `p <expr>` — print expression value
- `pp <expr>` — pretty-print
- `bt` — print full traceback
- `u <n>` — move up stack frame
- `d <n>` — move down stack frame
- `q` — quit debugger

### ipdb (Enhanced pdb)

```bash
pip install ipdb
python -m ipdb script.py
```

Features: syntax highlighting, tab completion, better introspection.

### pudb (Full-screen console debugger)

```bash
pip install pudb
python -m pudb script.py
```

Visual interface with source code view, stack, variables, and breakpoints.

### debugpy (VS Code / IDE integration)

```python
import debugpy

# Allow debugger to attach
debugpy.listen(("0.0.0.0", 5678))
debugpy.wait_for_client()  # Pause until debugger connects

# Set breakpoint programmatically
debugpy.breakpoint()
```

### py-spy (Production profiling)

```bash
# Profile running Python process without modifying code
py-spy top --pid 12345
py-spy record -d 30 --pid 12345 -o profile.svg
```

### memory_profiler

```python
from memory_profiler import profile

@profile
def my_function():
    # ...
```

## JavaScript / Node.js

### Node.js Inspector

```bash
node --inspect-brk script.js
# Opens inspector on ws://127.0.0.1:9229/devtools/browser/...
```

**Chrome DevTools:**
1. Open `chrome://inspect`
2. Click "Configure" → add `localhost:9229`
3. Click "inspect" next to your target

**VS Code:**
```json
// .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Launch Program",
  "program": "${workspaceFolder}/script.js",
  "runtimeArgs": ["--inspect-brk"]
}
```

### ndb (Node debugger by Google)

```bash
npm install -g ndb
ndb script.js
```

Enhanced debugging experience with Chrome DevTools.

### 0x (Flame graph profiler)

```bash
npx 0x script.js
```

Generates flame graphs for performance analysis.

## Go

### delve (Official debugger)

```bash
go install github.com/go-delve/delve/cmd/dlv@latest

dlv debug ./cmd/server
```

**Key commands:**
- `break main.go:55` — set breakpoint
- `continue` — resume execution
- `next` — step over
- `step` — step into
- `out` — step out
- `print myVar` — print variable
- `display myVar` — auto-print on stop
- `goroutines` — list all goroutines
- `threads` — list OS threads

### pp (Pretty print)

```go
import "github.com/k0kubun/pp"

pp.Println(myVar)
```

## Java

### jdb (Built-in)

```bash
jdb -classpath target/classes com.example.Main
```

### IntelliJ / Eclipse Debugger

Attach to remote JVM:
```bash
java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005 -jar app.jar
```

## C/C++

### gdb (GNU Debugger)

```bash
gdb ./myprogram
```

**Key commands:**
- `break main` — break at main
- `break file.c:42` — break at line
- `run` — start program
- `next` — step over
- `step` — step into
- `finish` — step out
- `print var` — print variable
- `bt` — backtrace
- `info locals` — show local variables
- `watch var` — watch variable changes

### lldb (LLVM Debugger)

```bash
lldb ./myprogram
(lldb) breakpoint set --name main
(lldb) run
(lldb) next
(lldb) frame variable
```

## Rust

### rust-gdb / rust-lldb

```bash
rust-gdb ./target/debug/myapp
```

Pretty-printers for Rust types automatically enabled.

### CodeLLDB (VS Code extension)

```json
// .vscode/launch.json
{
  "type": "lldb",
  "request": "launch",
  "name": "Debug",
  "program": "${workspaceFolder}/target/debug/myapp",
  "args": [],
  "cwd": "${workspaceFolder}"
}
```

## PHP

### Xdebug + IDE

```ini
; php.ini
zend_extension=xdebug.so
xdebug.mode=debug
xdebug.start_with_request=yes
```

### PHP built-in server with debugger

```bash
php -dxdebug.mode=debug -dxdebug.start_with_request=yes -S localhost:8000
```

## Ruby

### byebug

```ruby
# Gemfile
gem 'byebug', group: [:development, :test]

# In code:
byebug

# Commands:
# step, next, finish, break, continue, info, list
```

### ruby-debug-ide (VS Code)

```bash
gem install ruby-debug-ide
gem install debase
```

## General Purpose

### strace (Linux system calls)

```bash
strace -f -tt -o trace.log ./myprogram
grep -i error trace.log
```

### ltrace (Library calls)

```bash
ltrace -f -o trace.log ./myprogram
```

### tcpdump / Wireshark (Network)

```bash
tcpdump -i eth0 -w capture.pcap
```

### htop / top (Process inspection)

```bash
top -Hp <pid>  # Linux threads
htop            # Interactive process viewer
```

### Wireshark (GUI network analysis)

Filter by process, protocol, or port to inspect network-related bugs.

## IDE Integration Tips

**VS Code:**
- Set `"console": "integratedTerminal"` for input/output debugging
- Use `"args": []` to pass CLI arguments
- Use `"env": {"KEY": "value"}` for environment variables
- Conditional breakpoints: right-click breakpoint → "Edit Breakpoint" → add condition

**IntelliJ / PyCharm:**
- Evaluate Expression: Alt+F8 during breakpoint
- Log Message: right-click breakpoint → "Log Message" (no pause)
- Exception Breakpoints: Run → View Breakpoints → check "Exception Breakpoints"

## Remote Debugging

### SSH Tunnel

```bash
# On remote machine:
debugpy --listen 0.0.0.0:5678 --wait-for-client script.py

# On local machine:
ssh -L 5678:localhost:5678 user@remote
# Then attach local debugger to localhost:5678
```

### Docker

```bash
docker run -p 5678:5678 myimage
# Attach debugger to localhost:5678
```

### Kubernetes

```bash
kubectl port-forward pod/myapp-pod 5678:5678
# Attach debugger to localhost:5678
```
