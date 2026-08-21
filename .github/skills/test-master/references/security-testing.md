# Security Testing Reference

## OWASP Top 10 Test Checklist

### 1. Injection

```javascript
test('SQL injection is prevented', async () => {
  const maliciousInput = "'; DROP TABLE users; --";
  const response = await request(app)
    .get(`/api/users?name=${encodeURIComponent(maliciousInput)}`);
  expect(response.status).toBe(400); // Or safe handling
});
```

### 2. Broken Authentication

```javascript
test('rejects invalid JWT', async () => {
  const response = await request(app)
    .get('/api/users/me')
    .set('Authorization', 'Bearer invalid.token.here');
  expect(response.status).toBe(401);
});

test('rejects expired JWT', async () => {
  const expiredToken = generateToken({ sub: 'user' }, { exp: Date.now() / 1000 - 3600 });
  const response = await request(app)
    .get('/api/users/me')
    .set('Authorization', `Bearer ${expiredToken}`);
  expect(response.status).toBe(401);
});
```

### 3. Sensitive Data Exposure

```javascript
test('password not returned in response', async () => {
  const response = await request(app).post('/api/users').send({
    email: 'test@example.com',
    password: 'secret123'
  });
  expect(response.body.password).toBeUndefined();
  expect(response.body.hashedPassword).toBeUndefined();
});
```

### 4. XXE (XML External Entities)

```javascript
test('rejects XML with external entities', async () => {
  const xml = `<?xml version="1.0"?>
    <!DOCTYPE foo [
      <!ENTITY xxe SYSTEM "file:///etc/passwd">
    ]>
    <user>&xxe;</user>`;
  
  const response = await request(app)
    .post('/api/parse')
    .set('Content-Type', 'application/xml')
    .send(xml);
  
  expect(response.status).toBe(400); // Or safe parsing
});
```

### 5. Broken Access Control

```javascript
test('user cannot access another user data', async () => {
  const userAToken = generateToken({ sub: 'user-a' });
  const response = await request(app)
    .get('/api/users/user-b-id')
    .set('Authorization', `Bearer ${userAToken}`);
  expect(response.status).toBe(403);
});
```

### 6. Security Misconfiguration

```javascript
test('debug mode disabled in production', () => {
  expect(app.get('env')).not.toBe('development');
});

test('security headers present', async () => {
  const response = await request(app).get('/');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(response.headers['x-frame-options']).toBe('DENY');
});
```

### 7. XSS

```javascript
test('escapes user input in HTML', async () => {
  const xss = '<script>alert("xss")</script>';
  const response = await request(app)
    .post('/api/comments')
    .send({ text: xss });
  
  expect(response.body.text).not.toContain('<script>');
  expect(response.body.text).toContain('&lt;script&gt;');
});
```

### 8. Insecure Deserialization

```javascript
test('rejects pickle payloads', async () => {
  const response = await request(app)
    .post('/api/deserialize')
    .send(picklePayload);
  expect(response.status).toBe(400);
});
```

### 9. Known Vulnerabilities

```bash
# Run dependency audit
npm audit --audit-level=high
pip-audit
```

### 10. Insufficient Logging

```javascript
test('failed login is logged', async () => {
  const logs = captureLogs(() =>
    request(app).post('/api/login').send({ email: 'test', password: 'wrong' })
  );
  expect(logs).toContain('Login failed');
});
```
