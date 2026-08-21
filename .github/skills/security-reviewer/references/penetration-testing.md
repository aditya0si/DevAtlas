# Penetration Testing Reference

## Reconnaissance

```bash
# Port scanning
nmap -sV -sC -p- target.com

# Service enumeration
nmap -sV --script=vuln target.com

# Directory enumeration
gobuster dir -u https://target.com -w /usr/share/wordlists/dirb/common.txt

# Subdomain enumeration
amass enum -d target.com
subfinder -d target.com
```

## Web Application Testing

```bash
# Burp Suite (manual)
# - Proxy traffic through Burp
# - Analyze requests/responses
# - Test for injection, auth bypass, etc.

# OWASP ZAP (automated)
zap-cli quick-scan --spider --self-contained https://target.com

# SQLMap (SQL injection)
sqlmap -u "https://target.com?id=1" --batch --level=3 --risk=2

# Nikto (web server scanner)
nikto -h https://target.com
```

## Authentication Testing

```bash
# Hydra (brute force - authorized only)
hydra -l admin -P passwords.txt target.com http-post-form "/login:user=^USER^&pass=^PASS^:F=incorrect"

# JWT testing
# - Check for none algorithm
# - Test weak secrets (jwt_tool)
jwt_tool.py <token> -T

# Session testing
# - Check session fixation
# - Test session timeout
# - Verify secure flags on cookies
```

## Scope and Authorization

**Before any active testing:**

1. **Written authorization** — Signed agreement defining scope
2. **Rules of engagement** — What is allowed, what is off-limits
3. **Time window** — When testing is permitted
4. **Contact information** — Who to contact if issues arise
5. **Emergency stop** — How to halt testing if needed

**Scope checklist:**

- [ ] Target systems identified (IPs, domains, URLs)
- [ ] Testing methods approved (passive vs active)
- [ ] Data handling agreed (no production data modification)
- [ ] Reporting format defined
- [ ] Legal sign-off obtained

## Proof of Concept Guidelines

- **Minimum necessary** — Demonstrate impact, don't maximize damage
- **Non-destructive** — No data loss, no service disruption
- **Time-limited** — Stop after confirming exploitability
- **Documented** — Record all steps for reproducibility
- **Responsible** — Report immediately if critical finding discovered

## Reporting Critical Findings

If a critical vulnerability is discovered during testing:

1. **Stop testing** that specific vector
2. **Document** the finding with proof-of-concept
3. **Notify** the stakeholder immediately
4. **Provide** remediation guidance
5. **Wait** for confirmation before proceeding
