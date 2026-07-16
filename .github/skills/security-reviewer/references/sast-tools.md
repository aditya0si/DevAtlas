# SAST Tools Reference

## Semgrep

```bash
# Run all rules
semgrep --config=auto .

# Run specific rulesets
semgrep --config=p/security-audit .
semgrep --config=p/secrets .

# Output formats
semgrep --config=auto --json .
semgrep --config=auto --sarif .
```

## Bandit (Python)

```bash
# Run on src directory
bandit -r ./src

# With specific confidence/severity
bandit -r ./src -ll  # low and above
bandit -r ./src -ii  # high and above

# Generate report
bandit -r ./src -f json -o bandit-report.json
```

## ESLint Security (JavaScript/TypeScript)

```bash
# Install
npm install --save-dev eslint-plugin-security

# Run
npx eslint --plugin security --rule 'security/*: error' .
```

## gosec (Go)

```bash
# Run
gosec -fmt=json -out=gosec-report.json ./...

# With specific rules
gosec -include=G101,G102,G201 ./...
```

## npm audit (Node.js)

```bash
# Check for vulnerabilities
npm audit --audit-level=moderate

# Fix automatically
npm audit fix

# Generate report
npm audit --json > npm-audit.json
```

## Trivy (Multi-language, containers)

```bash
# Filesystem scan
trivy fs .

# Specific severity
trivy fs --severity HIGH,CRITICAL .

# SBOM generation
trivy fs --format cyclonedx .
```

## Checkov (Infrastructure as Code)

```bash
# Scan Terraform/CloudFormation/K8s
checkov -d .

# With specific checks
checkov -c CKV_AWS_1,CKV_AWS_2 .
```

## Integration patterns

```bash
# CI pipeline example
semgrep --config=auto --error .
bandit -r ./src -ll
gitleaks detect --source=. --report-path=gitleaks.json
trivy fs --exit-code 1 --severity CRITICAL .
```
