# Red Team Adversarial Reference

## Method

Adopt the perspective of a motivated, capable adversary. Identify how they would attack the idea/plan/system, then build defenses.

## Process

### 1. Define the Adversary

Who wants this to fail? What are their motivations and capabilities?

**Adversary profiles:**

| Profile | Motivation | Capability | Access |
|---------|-----------|------------|--------|
| Competitor | Market share | High | Public info |
| Malicious insider | Revenge, profit | Very high | Internal systems |
| Script kiddie | Notoriety | Low | Public tools |
| Nation-state | Espionage, disruption | Very high | Advanced tools |
| Accidental actor | Unintentional | N/A | User error |

### 2. Map Attack Surface

What can the adversary interact with? Where are the boundaries?

- Public interfaces (APIs, UIs, CLIs)
- Internal interfaces (not exposed but reachable)
- Supply chain (dependencies, build process)
- Human layer (social engineering, process gaps)

### 3. Identify Attack Vectors

For each surface, list specific attack vectors:

| Surface | Vector | Difficulty | Impact |
|---------|--------|-----------|--------|
| [Surface] | [Vector] | Easy/Med/Hard | High/Med/Low |

### 4. Analyze Perverse Incentives

Where does the system create incentives for bad behavior?

- Who benefits from gaming the system?
- What shortcuts are rewarded?
- Where do incentives misalign with intended outcomes?

### 5. Design Defenses

For each high-risk vector:

- **Prevent:** Can we eliminate the attack surface?
- **Detect:** Can we notice the attack in progress?
- **Respond:** Can we contain and recover?
- **Deter:** Can we raise the cost of attack?

## Output Template

```
Steelmanned Thesis:
[User's position in strongest form]

Adversary Profile:
- Who: [Adversary type]
- Motivation: [Why they want this to fail]
- Capability: [What they can do]
- Access: [What they can reach]

Attack Surface Map:
1. [Surface] — [Description]
2. [Surface] — [Description]
...

Ranked Attack Vectors:

1. [Vector] — Difficulty: [X], Impact: [Y]
   - Method: [How they'd execute]
   - Perverse incentive: [Why the system encourages this]
   - Defense: [Prevent/Detect/Respond/Deter]

2. ...

Perverse Incentives Identified:
- [Incentive 1]: [Description and mitigation]
- [Incentive 2]: [Description and mitigation]

Defense Priorities:
1. [Highest priority defense]
2. [Second priority]
3. [Third priority]
```

## Usage Notes

- Think like an adversary, not a defender
- Consider both technical and non-technical attacks
- Don't ignore "boring" attacks — they're often the most likely
- Always close the loop with defenses, not just vulnerabilities
