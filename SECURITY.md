# Security Policy

## Reporting a Vulnerability

If you believe you have discovered a security vulnerability in interfaceNode, please do not open a public GitHub issue.

Report it privately, either way:

- **GitHub:** on the [interfaceNode repository](https://github.com/AtkinEngineering/interfaceNode/security), go to **Security → Report a vulnerability**. Only you and Atkin Engineering can see the report.
- **Email:** [temp-pocket-3g@icloud.com](mailto:temp-pocket-3g@icloud.com?subject=Report%20security%20vulnerability) (a permanent Atkin Engineering address)

Include:

- Description of the vulnerability
- Affected firmware version
- Steps to reproduce
- Relevant logs or evidence
- Any suggested mitigation

## Response times

All times are calendar days from the date the report is received:

| Step | Within |
| ---- | ------ |
| Acknowledge the report | 1 week |
| Tell the reporter our assessment: whether the vulnerability is confirmed, its severity, and the planned fix release | 3 weeks |
| Release a fix | 8 weeks |
| Release a fix for a vulnerability that is being actively exploited | 3 weeks |

We keep the reporter informed until the fix is released, and coordinate public disclosure with them. A security advisory is published in the firmware repository when the fix is released, naming the fixed version and crediting the reporter if they wish. Please don't disclose the vulnerability publicly before then.

If a vulnerability is being actively exploited, the fix is released within 3 weeks, and we follow the reporting obligations of the EU Cyber Resilience Act.

## Security updates

Security updates are provided free of charge for 7 years from each unit's production date. The end date (month and year) is printed on the product label and box.

interfaceNode never connects to the internet, so it can't check for or announce updates itself. All firmware, including security fixes, is published on the Releases tab of the firmware repository: [github.com/AtkinEngineering/interfaceNode/releases](https://github.com/AtkinEngineering/interfaceNode/releases). Use GitHub's **Watch → Custom → Releases** to be notified of new releases.

- Security fixes are released as **patch versions** (`major.minor.PATCH`, e.g. 1.2.3 → 1.2.4) as soon as they are ready, separately from feature releases, and free of charge.
- The changelog of each release marks security fixes as such.
- Every release package includes a software bill of materials (`SBOM.spdx`) and a vulnerability report (`SBOM_report.md`) checked against the National Vulnerability Database at release time.
