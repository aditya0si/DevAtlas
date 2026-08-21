# Secret Scanning Reference

## Gitleaks

```bash
# Detect secrets in current directory
gitleaks detect --source=. --report-path=gitleaks-report.json

# Detect on specific path
gitleaks detect --source=./src --report-format=json

# Verbose output
gitleaks detect --source=. --verbose

# With custom config
gitleaks detect --config=.gitleaks.toml
```

## trufflehog

```bash
# Scan filesystem
trufflehog filesystem .

# Scan git history
trufflehog git file://. --json

# With specific rules
trufflehog filesystem . --only-verified
```

## Common secret patterns

### API Keys

```
AWS: AKIA[0-9A-Z]{16}
GitHub: ghp_[0-9a-zA-Z]{36}
Slack: xox[baprs]-[0-9a-zA-Z-]+
Stripe: sk_live_[0-9a-zA-Z]{24,}
```

### Database Credentials

```
postgres://[^:]+:[^@]+@[^/]+/\w+
mysql://[^:]+:[^@]+@[^/]+/\w+
mongodb(\+srv)?://[^:]+:[^@]+@[^/]+
```

### Private Keys

```
-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----
```

### JWT Secrets

```
eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*
```

## Remediation

1. **Immediate:** Rotate exposed credentials
2. **Short-term:** Remove from git history (`git filter-branch` or `bfg`)
3. **Long-term:** Use secret management (Vault, AWS Secrets Manager, env vars)
4. **Prevention:** Add pre-commit hooks, CI scanning

## Pre-commit hook

```yaml
# .pre-commit-config.yaml
- repo: https://github.com/gitleaks/gitleaks
  rev: v8.18.0
  hooks:
    - id: gitleaks
```

## CI integration

```yaml
# GitHub Actions
- name: Run gitleaks
  uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
