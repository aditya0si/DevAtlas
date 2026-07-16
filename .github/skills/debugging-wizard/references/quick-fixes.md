# Quick Fixes

Common error patterns and their immediate solutions.

## Python

### ImportError / ModuleNotFoundError

```python
# Error: ModuleNotFoundError: No module named 'x'

# Quick fixes:
# 1. Install missing package
pip install x

# 2. Check virtual environment is activated
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# 3. Check PYTHONPATH
python -c "import sys; print(sys.path)"

# 4. For relative imports, ensure running as module
# Instead of: python script.py
python -m package.module
```

### IndentationError

```python
# Error: IndentationError: unexpected indent

# Quick fixes:
# 1. Check for tabs vs spaces (PEP 8: 4 spaces)
# 2. Ensure consistent indentation throughout file
# 3. Use editor: View → Show Whitespace

# VS Code: File → Preferences → Settings → Editor: Render Whitespace
```

### TypeError: 'NoneType' has no len()

```python
# Error: TypeError: object of type 'NoneType' has no len()

# Quick fix: add None check
result = get_data()
if result is None:
    result = []
# Now safe to use len(result)
```

### KeyError in Dictionary

```python
# Error: KeyError: 'missing_key'

# Quick fixes:
# 1. Use .get() with default
value = my_dict.get('missing_key', 'default')

# 2. Check if key exists
if 'missing_key' in my_dict:
    value = my_dict['missing_key']

# 3. Use defaultdict (collections)
from collections import defaultdict
my_dict = defaultdict(list)
```

### UnicodeDecodeError

```python
# Error: UnicodeDecodeError: 'utf-8' codec can't decode byte 0xff

# Quick fix: specify encoding
with open('file.txt', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Or detect encoding:
import chardet
with open('file.txt', 'rb') as f:
    result = chardet.detect(f.read())
    encoding = result['encoding']
```

## JavaScript / TypeScript

### Cannot read property 'x' of undefined

```javascript
// Error: TypeError: Cannot read property 'name' of undefined

// Quick fixes:
// 1. Optional chaining
const name = user?.name;

// 2. Nullish coalescing
const name = user?.name ?? 'Anonymous';

// 3. Default value
const user = data.user || {};
const name = user.name;
```

### Promise rejection unhandled

```javascript
// Error: UnhandledPromiseRejectionWarning

// Quick fix: add .catch() or try/catch
async function fetchData() {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error('Fetch failed:', error);
    throw error;  // Re-throw if needed
  }
}
```

### Maximum call stack size exceeded

```javascript
// Error: RangeError: Maximum call stack size exceeded

// Quick fixes:
// 1. Check for infinite recursion
// 2. Add base case to recursive function
function factorial(n) {
  if (n <= 1) return 1;  // Base case
  return n * factorial(n - 1);
}

// 3. Convert recursion to iteration
function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}
```

### CORS Error

```javascript
// Error: Access to fetch at '...' from origin '...' has been blocked by CORS policy

// Quick fixes:
// 1. Server: add CORS headers
// Express:
app.use(cors({ origin: 'http://localhost:3000' }));

// 2. Development: use proxy
// package.json:
// "proxy": "http://localhost:8000"

// 3. Not a client-side fix — server must allow origin
```

## Go

### Goroutine Leak

```go
// Symptom: goroutines accumulate, memory grows

// Quick fix: ensure channels are closed
func process(items []Item) {
    var wg sync.WaitGroup
    ch := make(chan Item)

    go func() {
        for item := range ch {  // Exits when ch is closed
            processItem(item)
        }
    }()

    for _, item := range items {
        ch <- item
    }
    close(ch)  // Critical: signal no more items
    wg.Wait()
}
```

### nil pointer dereference

```go
// Error: panic: runtime error: invalid memory address or nil pointer dereference

// Quick fix: add nil check
func getName(user *User) string {
    if user == nil {
        return "Anonymous"
    }
    return user.Name
}
```

## Java

### ConcurrentModificationException

```java
// Error: java.util.ConcurrentModificationException

// Quick fix: use Iterator.remove()
List<String> list = new ArrayList<>(Arrays.asList("a", "b", "c"));
Iterator<String> it = list.iterator();
while (it.hasNext()) {
    String item = it.next();
    if (shouldRemove(item)) {
        it.remove();  // Safe removal during iteration
    }
}

// Or use removeIf():
list.removeIf(item -> shouldRemove(item));
```

### OutOfMemoryError

```java
// Error: java.lang.OutOfMemoryError: Java heap space

// Quick fixes:
// 1. Increase heap size
java -Xmx4g -jar app.jar

// 2. Check for memory leaks (unclosed resources)
// Use try-with-resources:
try (BufferedReader br = new BufferedReader(new FileReader(file))) {
    // Use br
}  // Automatically closed

// 3. Profile with VisualVM or JProfiler
```

## C/C++

### Segmentation Fault

```c
// Error: Segmentation fault (core dumped)

// Quick fixes:
// 1. Check for null pointers
if (ptr != NULL) {
    *ptr = 42;
}

// 2. Check array bounds
for (int i = 0; i < ARRAY_SIZE; i++) {  // Not <=
    arr[i] = i;
}

// 3. Use valgrind to find exact location
valgrind --leak-check=full ./myprogram
```

### Use After Free

```c
// Error: Corruption / crash after free

// Quick fix: set pointer to NULL after free
free(ptr);
ptr = NULL;  // Prevents accidental reuse

// Or use smart pointers (C++):
std::unique_ptr<MyClass> ptr = std::make_unique<MyClass>();
```

## SQL

### Syntax Error

```sql
-- Error: syntax error near 'FROM'

-- Quick fixes:
-- 1. Check for missing quotes around strings
SELECT * FROM users WHERE name = 'John';  -- Not: name = John

-- 2. Check for reserved words used as column names
-- Use backticks or brackets:
SELECT `order` FROM table;  -- MySQL
SELECT [order] FROM table;  -- SQL Server

-- 3. Check for missing semicolons (some databases)
```

### Deadlock

```sql
-- Error: Deadlock found when trying to get lock

-- Quick fixes:
-- 1. Access tables in consistent order across transactions
-- 2. Keep transactions short
-- 3. Use lower isolation level if safe
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- 4. Add indexes to reduce lock duration
CREATE INDEX idx_user_id ON orders(user_id);
```

## Docker

### Container exits immediately

```bash
# Symptom: docker run exits with code 0 or 1 immediately

# Quick fixes:
# 1. Check if main process is foreground
# Dockerfile:
CMD ["python", "app.py"]  # Not: python app.py &

# 2. Check logs
docker logs <container_id>

# 3. Override command to debug
docker run -it <image> /bin/bash
```

### Cannot connect to Docker daemon

```bash
# Error: Cannot connect to the Docker daemon

# Quick fixes:
# 1. Start Docker Desktop (Windows/Mac)
# 2. Start Docker daemon (Linux)
sudo systemctl start docker

# 3. Check permissions (Linux)
sudo usermod -aG docker $USER
# Log out and back in
```

## Git

### Accidentally committed to wrong branch

```bash
# Quick fix: move commit to correct branch
git branch correct-branch
git reset --hard HEAD~1  # Remove commit from current branch
git checkout correct-branch
git cherry-pick <commit-hash>
```

### Accidentally deleted branch

```bash
# Quick fix: recover from reflog
git reflog
# Find commit hash before deletion
git branch recovered-branch <commit-hash>
```

### Merge conflict

```bash
# Quick fix workflow:
# 1. Open conflicted files
# 2. Look for <<<<<<< HEAD markers
# 3. Choose correct version or combine
# 4. Remove conflict markers
# 5. Stage resolved files
git add <resolved-files>
git commit
```

## General

### "It works on my machine"

```bash
# Quick diagnostic checklist:
# 1. Compare dependency versions
pip freeze | diff - local_pip_free.txt

# 2. Compare environment variables
env | sort > local_env.txt

# 3. Check OS differences
uname -a  # Linux/Mac
systeminfo | findstr /B /C:"OS Name" /C:"OS Version"  # Windows

# 4. Check file paths (case sensitivity)
ls /path/to/file  # Linux: case-sensitive
dir C:\path\to\file  # Windows: case-insensitive
```

### Heisenbug (disappears when debugging)

```bash
# Symptom: bug vanishes when adding logging/breakpoints

# Quick fixes:
# 1. Timing issue: add small delay
import time
time.sleep(0.1)

# 2. Race condition: add synchronization
# 3. Memory issue: check for uninitialized variables
# 4. Use non-invasive debugging (logging, not breakpoints)
```

### 502 Bad Gateway

```bash
# Quick diagnostic:
# 1. Check if backend service is running
systemctl status myapp

# 2. Check logs
journalctl -u myapp -f

# 3. Check if port is listening
netstat -tlnp | grep :8000

# 4. Check reverse proxy config (nginx)
nginx -t
cat /etc/nginx/sites-enabled/myapp
```
