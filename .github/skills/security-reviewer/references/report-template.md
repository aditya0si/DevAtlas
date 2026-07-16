# Security Report Template

## Executive Summary

**Assessment Date:** YYYY-MM-DD
**Assessor:** [Name/Role]
**Scope:** [Systems/applications reviewed]
**Overall Risk Rating:** [Critical/High/Medium/Low]

### Key Findings

- **Critical:** X findings
- **High:** X findings
- **Medium:** X findings
- **Low:** X findings
- **Informational:** X findings

### Top Risks

1. [Brief description of highest risk]
2. [Brief description of second highest risk]
3. [Brief description of third highest risk]

## Findings Summary

| ID | Severity | Title | File/Location |
|----|----------|-------|---------------|
| FIND-001 | Critical | [Title] | [File:Line] |
| FIND-002 | High | [Title] | [File:Line] |
| ... | ... | ... | ... |

## Detailed Findings

### FIND-001: [Title]

**Severity:** Critical (CVSS X.X)
**CWE:** CWE-XXX
**OWASP:** A0X:YYYY

**Description:**
[Detailed description of the vulnerability]

**Location:**
- File: `path/to/file.ext`
- Line: XX
- Function: `function_name()`

**Impact:**
[What an attacker could achieve]

**Proof of Concept:**
```[language]
[Minimal code or steps to reproduce]
```

**Remediation:**
[Specific steps to fix]

**References:**
- [Link to CWE]
- [Link to OWASP]
- [Link to documentation]

## Recommendations

### Immediate (0-7 days)

1. [Critical fix 1]
2. [Critical fix 2]

### Short-term (1-4 weeks)

1. [High priority fix 1]
2. [High priority fix 2]

### Long-term (1-3 months)

1. [Medium/Low priority improvements]
2. [Process improvements]

## Appendix

### Tools Used

- [Tool name] v[version]
- [Tool name] v[version]

### Scope

- [Included systems]
- [Excluded systems]

### Methodology

1. Automated scanning with [tools]
2. Manual code review of [areas]
3. Configuration review of [systems]
4. [Additional methods]
