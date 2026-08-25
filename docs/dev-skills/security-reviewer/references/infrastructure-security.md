# Infrastructure Security Reference

## Cloud Security

### AWS

```bash
# AWS Security Hub
aws securityhub get-findings --filters '{"SeverityLabel":[{"Value":"CRITICAL","Comparison":"EQUALS"}]}'

# IAM analysis
aws iam get-account-authorization-details

# S3 bucket audit
aws s3 ls | while read bucket; do
  aws s3api get-bucket-acl --bucket $bucket
done
```

### Azure

```bash
# Azure Security Center
az security assessment list

# Key Vault audit
az keyvault list --query "[].name"
```

### GCP

```bash
# Security Command Center
gcloud scc findings list

# IAM audit
gcloud projects get-iam-policy PROJECT_ID
```

## Container Security

```bash
# Trivy container scan
trivy image nginx:latest

# Docker bench
docker-bench-security

# Kubernetes audit
kubesec scan deployment.yaml
```

## DevSecOps

### CI/CD Security

```yaml
# GitHub Actions security
- name: Run Trivy
  uses: aquasecurity/trivy-action@master
  with:
    scan-type: 'fs'
    format: 'sarif'
    output: 'trivy-results.sarif'

- name: Upload to GitHub Security
  uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: 'trivy-results.sarif'
```

### Dependency Scanning

```bash
# Python
pip-audit
safety check

# Node.js
npm audit --audit-level=moderate
yarn audit

# Go
govulncheck ./...

# Rust
cargo audit
```

## Compliance

### CIS Benchmarks

```bash
# Docker CIS benchmark
docker-bench-security

# Kubernetes CIS benchmark
kube-bench run --targets node,policies,psp
```

### SOC2 / ISO27001

Key controls to verify:
- Access control and identity management
- Encryption at rest and in transit
- Logging and monitoring
- Incident response procedures
- Change management
- Vulnerability management

## Network Security

```bash
# Firewall rules audit
# AWS
aws ec2 describe-security-groups

# Network scanning (authorized only)
nmap -sV -sC target.com

# TLS/SSL audit
testssl.sh target.com
sslyze target.com
```

## Secrets Management

```bash
# HashiCorp Vault audit
vault audit list
vault audit enable file file_path=/var/log/vault_audit.log

# AWS Secrets Manager
aws secretsmanager list-secrets
aws secretsmanager get-secret-value --secret-id <id>
```
