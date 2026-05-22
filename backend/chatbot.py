"""
AI Assistant Chatbot Module
Handles Google Gemini API integration with offline fallback
"""

import os
import logging
from typing import Optional, Dict, List

from dotenv import load_dotenv

load_dotenv()

from google import genai



logger = logging.getLogger(__name__)

# Configure Gemini API
_api_key = os.getenv("GOOGLE_API_KEY")
if _api_key:
    client = genai.Client(api_key=_api_key)
    logger.info("Gemini API configured successfully.")
else:
    logger.warning("GOOGLE_API_KEY not found — Gemini will be unavailable.")


# ── FIX #2: Expanded offline knowledge base (50+ topics, keyword-matched) ──────
OFFLINE_KNOWLEDGE_BASE: Dict[str, Dict] = {
    # keys are comma-separated trigger keywords; value = answer text
    "port scan,port scanning,nmap,open ports": {
        "answer": (
            "A **port scan** probes a host to discover which TCP/UDP ports are open. "
            "Network admins use tools like nmap for legitimate audits; attackers use it to "
            "fingerprint services before exploiting them. "
            "Common types: SYN scan (stealthy), connect scan (full TCP), UDP scan. "
            "Detection: watch for sequential port probes or unusual source IPs in short windows."
        )
    },
    "lateral movement,pivot,pivoting,east-west traffic": {
        "answer": (
            "**Lateral movement** is how attackers spread through a network after initial access. "
            "They hop from one compromised host to another using stolen credentials, "
            "remote services (RDP, SSH, SMB), or exploits. "
            "Detection: monitor unusual inter-host connections, credential reuse across systems, "
            "and unexpected admin tool usage (PsExec, WMI, PowerShell remoting)."
        )
    },
    "isolation forest,iforest,anomaly detection,unsupervised ml": {
        "answer": (
            "**Isolation Forest** is an unsupervised ML algorithm for anomaly detection. "
            "It randomly selects a feature and a split value, building trees that isolate data points. "
            "Anomalies are isolated in fewer splits (short path length) because they are rare and different. "
            "NetSentinel uses it to flag unusual network behaviour without needing labelled attack data."
        )
    },
    "ddos,denial of service,volumetric attack,amplification": {
        "answer": (
            "A **DDoS (Distributed Denial of Service)** attack floods a target with traffic from "
            "many sources, exhausting bandwidth, CPU, or connections. "
            "Types: volumetric (UDP floods, ICMP floods), protocol (SYN floods, Ping of Death), "
            "application layer (HTTP floods, Slowloris). "
            "Mitigation: rate limiting, anycast scrubbing, geo-blocking, CDN, and upstream filtering."
        )
    },
    "brute force,password spray,credential stuffing,dictionary attack": {
        "answer": (
            "A **brute force attack** systematically tries passwords or keys until it finds the right one. "
            "Variants:\n"
            "• **Dictionary attack** — tries common words/passwords from a wordlist.\n"
            "• **Credential stuffing** — reuses breached username/password pairs.\n"
            "• **Password spraying** — tries one common password against many accounts to avoid lockouts.\n"
            "Detection: watch for multiple failed logins from the same IP or against the same account. "
            "Defences: MFA, account lockout, CAPTCHA, rate limiting login endpoints."
        )
    },
    "phishing,spear phishing,email attack,social engineering": {
        "answer": (
            "**Phishing** tricks users into revealing credentials or installing malware via fake emails/sites. "
            "Spear phishing targets specific individuals with personalised lures. "
            "Whaling targets executives. Vishing uses voice calls. Smishing uses SMS. "
            "Defences: email filtering (SPF/DKIM/DMARC), user awareness training, MFA, and URL sandboxing."
        )
    },
    "sql injection,sqli,database attack,injection attack": {
        "answer": (
            "**SQL Injection (SQLi)** inserts malicious SQL code into input fields to manipulate the database. "
            "Attackers can dump data, bypass authentication, or delete records. "
            "Types: classic, blind (boolean/time-based), out-of-band. "
            "Prevention: parameterised queries / prepared statements, input validation, WAF, least-privilege DB accounts."
        )
    },
    "xss,cross site scripting,reflected xss,stored xss": {
        "answer": (
            "**Cross-Site Scripting (XSS)** injects malicious scripts into web pages viewed by other users. "
            "Stored XSS persists in the database; reflected XSS is embedded in a URL; DOM-based XSS is client-side. "
            "Attackers steal cookies, redirect users, or deface sites. "
            "Prevention: output encoding, Content Security Policy (CSP), input validation, HTTPOnly cookies."
        )
    },
    "ransomware,encryption malware,ransom": {
        "answer": (
            "**Ransomware** encrypts victim files and demands payment for the decryption key. "
            "Modern ransomware also exfiltrates data ('double extortion'). "
            "Spread: phishing, RDP exploitation, drive-by downloads, supply chain. "
            "Prevention: offline/air-gapped backups, patching, email filtering, EDR, network segmentation. "
            "Response: isolate host immediately, do NOT pay unless all else fails, restore from clean backup."
        )
    },
    "malware,virus,trojan,worm,spyware,rootkit": {
        "answer": (
            "**Malware** is malicious software designed to harm, exploit, or gain unauthorised access. "
            "Types:\n"
            "• Virus — attaches to files, spreads on execution.\n"
            "• Worm — self-replicates across networks without user action.\n"
            "• Trojan — disguised as legitimate software.\n"
            "• Rootkit — hides deep in the OS to maintain stealth persistence.\n"
            "• Spyware — silently monitors and exfiltrates user activity.\n"
            "Detection: AV/EDR signatures, behavioural analysis, memory scanning."
        )
    },
    "firewall,packet filter,stateful inspection,next gen firewall": {
        "answer": (
            "A **firewall** controls network traffic based on rules. "
            "Types:\n"
            "• Packet filter — inspects headers (IP, port, protocol).\n"
            "• Stateful — tracks connection state for more context-aware decisions.\n"
            "• NGFW (Next-Gen) — adds application awareness, IPS, TLS inspection, and threat intelligence.\n"
            "Best practice: default-deny, explicit allow rules, segment zones (DMZ, internal, guest)."
        )
    },
    "ids,ips,intrusion detection,intrusion prevention,snort,suricata": {
        "answer": (
            "**IDS (Intrusion Detection System)** monitors traffic and alerts on suspicious patterns. "
            "**IPS (Intrusion Prevention System)** can also block malicious traffic inline. "
            "Signature-based IDS matches known attack patterns; anomaly-based detects deviations from baseline. "
            "Popular open-source tools: Snort, Suricata, Zeek. "
            "NetSentinel complements network IDS/IPS with ML-based anomaly detection."
        )
    },
    "vulnerability,cve,cvss,patch,zero day": {
        "answer": (
            "A **vulnerability** is a weakness exploitable by an attacker. "
            "CVE (Common Vulnerabilities and Exposures) is the standard identifier (e.g. CVE-2024-12345). "
            "CVSS scores severity 0–10. A **zero-day** is unpatched and unknown to the vendor. "
            "Management: regular scanning (Nessus, OpenVAS), patch prioritisation by CVSS + exposure, and "
            "compensating controls (WAF, network segmentation) for unpatchable systems."
        )
    },
    "incident response,ir,containment,eradication,recovery,dfir": {
        "answer": (
            "**Incident Response (IR)** follows 6 phases (NIST SP 800-61):\n"
            "1. **Preparation** — policies, playbooks, tools, training.\n"
            "2. **Detection & Analysis** — identify and triage the incident.\n"
            "3. **Containment** — limit damage (isolate hosts, block IPs, revoke credentials).\n"
            "4. **Eradication** — remove malware, close access vectors.\n"
            "5. **Recovery** — restore services, validate integrity.\n"
            "6. **Post-Incident** — lessons learned, improve controls.\n"
            "NetSentinel supports phases 2–3 with real-time detection and alert workflows."
        )
    },
    "false positive,false negative,alert fatigue,tuning": {
        "answer": (
            "A **false positive** is an alert on benign activity (noise). "
            "A **false negative** is a missed real threat (dangerous). "
            "Alert fatigue from too many false positives causes analysts to ignore real threats. "
            "Tuning strategies: raise thresholds, add allowlists for known-good activity, "
            "correlate multiple signals before alerting, and use ML scoring to prioritise alerts."
        )
    },
    "privilege escalation,local privilege escalation,sudo,token impersonation": {
        "answer": (
            "**Privilege escalation** lets an attacker gain higher permissions than granted. "
            "Vertical escalation: low-priv user → admin/root via exploits, misconfigured sudo/SUID, "
            "kernel exploits, or weak service accounts. "
            "Horizontal escalation: accessing another user's resources at the same privilege level. "
            "Detection: unexpected sudo/su usage, new admin account creation, token theft (pass-the-hash/ticket)."
        )
    },
    "encryption,tls,ssl,aes,rsa,pki,certificate": {
        "answer": (
            "**Encryption** protects data confidentiality. Key concepts:\n"
            "• **TLS/SSL** — encrypts data in transit (use TLS 1.2+ only; disable SSL 3.0, TLS 1.0/1.1).\n"
            "• **AES-256** — symmetric encryption standard for data at rest.\n"
            "• **RSA / ECC** — asymmetric encryption for key exchange and signatures.\n"
            "• **PKI** — certificate authorities issue X.509 certs to authenticate identities.\n"
            "Always enforce HSTS, verify certificate chains, and rotate keys regularly."
        )
    },
    "vpn,virtual private network,ipsec,wireguard,openvpn": {
        "answer": (
            "A **VPN (Virtual Private Network)** creates an encrypted tunnel over untrusted networks. "
            "Protocols: IPSec (site-to-site), OpenVPN (SSL-based, flexible), WireGuard (modern, fast). "
            "Use cases: remote access, site-to-site connectivity, securing public Wi-Fi. "
            "Limitation: VPNs don't stop threats from inside the tunnel — complement with zero-trust architecture."
        )
    },
    "zero trust,ztna,microsegmentation,least privilege": {
        "answer": (
            "**Zero Trust** assumes no user or device is trusted by default, even inside the network. "
            "Principles: verify every request (identity + device posture), enforce least-privilege access, "
            "and microsegment the network to limit blast radius. "
            "Implementation: MFA, identity-aware proxies (ZTNA), endpoint health checks, continuous monitoring. "
            "Replaces the outdated 'trusted inside, untrusted outside' perimeter model."
        )
    },
    "siem,log management,splunk,elastic,log correlation": {
        "answer": (
            "A **SIEM (Security Information and Event Management)** centralises log collection, correlation, "
            "and alerting across the environment. "
            "It aggregates logs from firewalls, servers, endpoints, and cloud services, "
            "applies correlation rules to detect multi-step attacks, and stores events for forensics. "
            "Popular platforms: Splunk, IBM QRadar, Microsoft Sentinel, Elastic SIEM. "
            "NetSentinel can feed alerts into a SIEM for unified visibility."
        )
    },
    "mfa,multi factor authentication,two factor,2fa,otp,totp": {
        "answer": (
            "**MFA (Multi-Factor Authentication)** requires two or more verification factors: "
            "something you know (password), something you have (OTP device/app), "
            "something you are (biometric). "
            "TOTP (Time-based OTP — e.g. Google Authenticator) is better than SMS (SIM-swap risk). "
            "Phishing-resistant MFA: FIDO2/WebAuthn hardware keys (YubiKey). "
            "MFA is the single most effective control against credential-based attacks."
        )
    },
    "osint,open source intelligence,reconnaissance,footprinting": {
        "answer": (
            "**OSINT (Open-Source Intelligence)** gathers information from publicly available sources. "
            "Attackers use it in reconnaissance: company websites, LinkedIn, Shodan (exposed devices), "
            "WHOIS, DNS records, GitHub leaks, paste sites. "
            "Defenders use OSINT to understand their own attack surface. "
            "Tools: Maltego, theHarvester, Recon-ng, Shodan, SpiderFoot."
        )
    },
    "netsentinel,how does netsentinel,netsentinel features,netsentinel work": {
        "answer": (
            "**NetSentinel** is a cybersecurity incident detection and response platform. "
            "It works in three layers:\n"
            "1. **Data collection** — ingests network traffic, logs, and system events.\n"
            "2. **Analysis** — applies ML (Isolation Forest, statistical baselines) and rule-based heuristics "
            "to detect anomalies such as port scans, lateral movement, DDoS, and brute force.\n"
            "3. **Response** — generates real-time alerts, tracks incidents, and supports analyst workflows.\n"
            "The chatbot (me!) answers questions about security concepts and platform features."
        )
    },
    "network traffic,packet capture,pcap,wireshark,deep packet inspection": {
        "answer": (
            "**Network traffic analysis** inspects packets to understand communication patterns and detect threats. "
            "Packet capture (PCAP) records raw frames — tools: Wireshark, tcpdump. "
            "Deep packet inspection (DPI) looks inside payloads for signatures. "
            "Flow-based analysis (NetFlow/IPFIX) is less detailed but scalable for high-volume environments. "
            "NetSentinel uses flow metadata and protocol statistics to detect anomalies at scale."
        )
    },
    "man in the middle,mitm,arp spoofing,dns spoofing,ssl stripping": {
        "answer": (
            "A **Man-in-the-Middle (MitM)** attack positions the attacker between two communicating parties "
            "to intercept or modify traffic. "
            "Common techniques: ARP spoofing (poisons local ARP cache), DNS spoofing (redirects DNS responses), "
            "SSL stripping (downgrades HTTPS to HTTP). "
            "Prevention: enforce HTTPS/HSTS, DNSSEC, Dynamic ARP Inspection on switches, MFA."
        )
    },
    "supply chain attack,software supply chain,dependency confusion,solarwinds": {
        "answer": (
            "A **supply chain attack** compromises software or hardware before it reaches the end user — "
            "e.g., injecting malware into a legitimate software update (SolarWinds, XZ Utils). "
            "Dependency confusion attacks exploit how package managers resolve private vs public packages. "
            "Mitigations: software bill of materials (SBOM), dependency pinning, code signing, "
            "SLSA framework, and reviewing third-party vendor security posture."
        )
    },
    "data exfiltration,data breach,dlp,data loss prevention": {
        "answer": (
            "**Data exfiltration** is the unauthorised transfer of data out of an organisation. "
            "Channels: email, USB, cloud uploads, DNS tunnelling, covert C2 channels. "
            "Detection: DLP tools monitor outbound data for sensitive patterns (PII, card numbers), "
            "anomalous large transfers, or access to sensitive files outside business hours. "
            "NetSentinel can flag unusual outbound traffic volumes and destinations."
        )
    },
    "threat intelligence,ioc,indicator of compromise,ttps,mitre att&ck": {
        "answer": (
            "**Threat intelligence** is evidence-based knowledge about adversary behaviour. "
            "IOCs (Indicators of Compromise): malicious IPs, domains, hashes, URLs. "
            "TTPs (Tactics, Techniques, Procedures): *how* attackers operate — mapped in **MITRE ATT&CK**. "
            "ATT&CK is a globally accessible knowledge base of adversary techniques used for detection, "
            "purple teaming, and gap analysis. "
            "NetSentinel can be enriched with threat feeds to correlate alerts against known IOCs."
        )
    },
    "penetration test,pentest,red team,ethical hacking,bug bounty": {
        "answer": (
            "**Penetration testing** simulates attacks on systems with permission to find vulnerabilities. "
            "Phases: scoping, reconnaissance, scanning, exploitation, post-exploitation, reporting. "
            "Types: black-box (no prior knowledge), white-box (full knowledge), grey-box (partial). "
            "Red team exercises are more advanced, mimicking APT behaviour over longer periods. "
            "Bug bounty programmes crowd-source security research through platforms like HackerOne and Bugcrowd."
        )
    },
    "secure network,network security,harden,hardening,best practice": {
        "answer": (
            "Network security best practices (defence in depth):\n"
            "• Patch and update all systems promptly.\n"
            "• Segment networks (VLANs, DMZ) to limit lateral movement.\n"
            "• Enforce MFA and least-privilege access.\n"
            "• Deploy NGFW, IDS/IPS, and EDR.\n"
            "• Monitor with SIEM / NetSentinel — alert on anomalies.\n"
            "• Encrypt data in transit (TLS 1.3) and at rest (AES-256).\n"
            "• Run regular vulnerability scans and penetration tests.\n"
            "• Maintain and test an incident response plan."
        )
    },
    "cloud security,aws,azure,gcp,cloud misconfiguration,s3 bucket": {
        "answer": (
            "**Cloud security** addresses risks unique to cloud environments. "
            "Common misconfigurations: public S3 buckets, over-permissive IAM roles, exposed management ports. "
            "Shared responsibility: the provider secures the infrastructure; you secure your data and config. "
            "Best practices: use Infrastructure as Code (IaC) scanning (Checkov, tfsec), "
            "enable CloudTrail/audit logs, enforce MFA on root, use security groups over open 0.0.0.0/0, "
            "and run cloud security posture management (CSPM) tools."
        )
    },
}


def _extract_keyword_map() -> List[tuple]:
    """Build a flat list of (keyword, answer) from the nested KB."""
    result = []
    for key_str, value in OFFLINE_KNOWLEDGE_BASE.items():
        keywords = [k.strip() for k in key_str.split(",")]
        for kw in keywords:
            result.append((kw, value["answer"]))
    return result

_KEYWORD_MAP = _extract_keyword_map()


def find_offline_answer(question: str) -> Optional[str]:
    """Search offline knowledge base using keyword matching."""
    normalized = question.lower().strip()

    # Score each keyword by how well it matches the question
    best_score = 0
    best_answer = None

    for keyword, answer in _KEYWORD_MAP:
        if keyword in normalized:
            score = len(keyword)  # longer match = more specific = higher score
            if score > best_score:
                best_score = score
                best_answer = answer

    return best_answer


def get_gemini_response(question: str, conversation_history: List[Dict]) -> str:
    """Get response from Google Gemini API using new google-genai SDK."""
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set.")

    system_prompt = (
        "You are a helpful AI assistant for NetSentinel, a cybersecurity incident "
        "detection and response platform. Explain security concepts simply and concisely. "
        "Answer in the same language the user writes in (French or English). "
        "Key facts: NetSentinel uses IsolationForest and ML algorithms to detect threats "
        "like port scans, lateral movement, DDoS, and brute force from network logs."
    )

    full_prompt = f"{system_prompt}\n\nUser: {question}\nAssistant:"

    from google import genai as _genai
    from google.genai import errors as _gerrors
    import time

    client = _genai.Client(api_key=api_key)

    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash-lite",   # lightest free-tier model
                contents=full_prompt,
            )
            return response.text
        except _gerrors.ClientError as e:
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                if attempt == 0:
                    time.sleep(5)
                    continue
                raise RuntimeError(
                    "Gemini free-tier quota exhausted for today. "
                    "The offline knowledge base will answer instead."
                ) from e
            raise

def get_chatbot_response(
    question: str,
    conversation_history: List[Dict] = None,
    is_online: bool = True,
) -> Dict:
    """
    Return chatbot response, trying Gemini first, then offline KB.

    Returns:
        {
            "response": str,
            "usedFallback": bool,
            "source": "gemini" | "offline_kb" | "generic"
        }
    """
    if conversation_history is None:
        conversation_history = []

    logger.info(f"[Chatbot] question={question!r}  is_online={is_online}  api_key_set={bool(os.getenv('GOOGLE_API_KEY'))}")

    # ── Try Gemini ──────────────────────────────────────────────────────────────
    if is_online and os.getenv("GOOGLE_API_KEY"):
        try:
            response_text = get_gemini_response(question, conversation_history)
            logger.info("[Chatbot] Gemini responded successfully.")
            return {"response": response_text, "usedFallback": False, "source": "gemini"}
        except Exception as exc:
            logger.warning(f"[Chatbot] Gemini failed — {exc}. Falling back to offline KB.")

    # ── Try offline knowledge base ──────────────────────────────────────────────
    offline_answer = find_offline_answer(question)
    if offline_answer:
        logger.info("[Chatbot] Offline KB matched.")
        return {"response": offline_answer, "usedFallback": True, "source": "offline_kb"}

    # ── Generic fallback ────────────────────────────────────────────────────────
    logger.info("[Chatbot] No match found — returning generic response.")
    return {
        "response": (
            "I don't have a specific answer for that right now. "
            "Try asking about topics like: brute force, port scanning, lateral movement, "
            "ransomware, phishing, incident response, MFA, zero trust, or how NetSentinel works. "
            "For complex questions, make sure the chatbot is online so it can use the Gemini AI."
        ),
        "usedFallback": True,
        "source": "generic",
    }