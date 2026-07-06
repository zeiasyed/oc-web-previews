# Oracle Cloud Always Free VPS — Nexa lab hosting

Run both NexaDirect and NexaSource 24/7 on a **$0/month** ARM VM, with persistent SQLite state and no PC tunnel.

## What you get

| URL | App |
|-----|-----|
| https://demo-direct.nexa-trials.com | NexaDirect console |
| https://demo-edc.nexa-trials.com | NexaDirect mock EDC (legacy hostname) |
| https://demo-source.nexa-trials.com | NexaSource console |
| https://demo-source-edc.nexa-trials.com | NexaSource mock EDC |

Cloudflare stays in front (orange cloud / proxied A records). Origin is HTTP on port 80.

---

## 1. Create Oracle Cloud account

1. Sign up at [cloud.oracle.com](https://www.oracle.com/cloud/free/) (Always Free tier).
2. Create a **compartment** (default is fine).
3. Note your **home region** — free Ampere VMs are only in certain regions (e.g. Phoenix, Ashburn, Frankfurt).

---

## 2. Create the VM (Ampere A1)

**Compute → Instances → Create instance**

| Setting | Value |
|---------|--------|
| Name | `nexa-labs` |
| Image | **Ubuntu 22.04** or **24.04** (aarch64) |
| Shape | **VM.Standard.A1.Flex** — 2 OCPU, 12 GB RAM (fits both demos) |
| Boot volume | 50–100 GB |
| SSH keys | Paste your **public** key (`id_rsa.pub` or `id_ed25519.pub`) |

**Networking**

- Assign a **public IPv4** (not private only).
- Download or note the **VCN security list** for this subnet.

**Security list — ingress rules** (required):

| Source | Protocol | Port |
|--------|----------|------|
| `0.0.0.0/0` | TCP | 22 (SSH) |
| `0.0.0.0/0` | TCP | 80 (HTTP — Cloudflare origin) |

Port 443 is optional (Cloudflare can talk HTTP to origin when proxied).

Wait until the instance state is **Running**. Copy the **public IP**.

---

## 3. Push repo to GitHub

The VPS clones from GitHub on first setup. Commit and push `lab-vps/` to `main` before deploying:

```powershell
cd "...\oc-web-previews"
git add landing/nexa-trials/marketing/lab-vps landing/nexa-trials/marketing/deploy-labs-vps.ps1
git commit -m "Add Oracle VPS lab hosting"
git push origin main
```

---

## 4. Deploy from your PC

```powershell
cd "...\landing\nexa-trials\marketing"
.\deploy-labs-vps.ps1 -VpsIp 150.136.x.x
```

Optional flags:

```powershell
.\deploy-labs-vps.ps1 -VpsIp 150.136.x.x -SshUser ubuntu -SshKey $env:USERPROFILE\.ssh\id_ed25519
.\deploy-labs-vps.ps1 -VpsIp 150.136.x.x -DnsOnly          # DNS only, containers already running
.\deploy-labs-vps.ps1 -VpsIp 150.136.x.x -BootstrapOnly    # setup VM, point DNS later
```

**Prereqs on PC:**

- `nexa-trials\.cloudflare-credentials.json`
- `nexa-trials\.lab-access.local.json`
- OpenSSH (`ssh` / `scp`) — built into Windows 10+

First deploy takes **15–30 minutes** (Docker build, especially NexaSource on ARM).

---

## 5. Verify

```powershell
curl https://demo-direct.nexa-trials.com/health
curl https://demo-source.nexa-trials.com/health
```

Both should return JSON with `"ok": true`.

Stop the PC tunnel so you are not serving stale routes:

```powershell
# Close the run-all-labs.ps1 window; kill cloudflared if still running
```

---

## 6. Updates after code changes

**From PC** (re-runs full setup — safe, idempotent):

```powershell
.\deploy-labs-vps.ps1 -VpsIp 150.136.x.x
```

**On VPS** (faster):

```bash
sudo bash /opt/nexa-labs/landing/nexa-trials/marketing/lab-vps/update-labs.sh
```

---

## 7. Optional: auto-restart cron

```bash
sudo chmod +x /opt/nexa-labs/landing/nexa-trials/marketing/lab-vps/health-check.sh
sudo crontab -e
# Add:
*/5 * * * * /opt/nexa-labs/landing/nexa-trials/marketing/lab-vps/health-check.sh >> /var/log/nexa-labs-health.log 2>&1
```

---

## 8. Oracle cloud-init (alternative first boot)

Paste `cloud-init.yaml` from this folder into **Advanced options → Cloud init** when creating the instance. You still need to:

1. Upload `.env` with lab password (or run `deploy-labs-vps.ps1`).
2. Run `deploy-labs-vps.ps1 -DnsOnly` or full deploy to set Cloudflare DNS.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| SSH timeout | Check security list allows port 22; confirm public IP |
| 502 from Cloudflare | `ssh` in → `cd .../lab-vps && sudo docker compose ps` — restart with `docker compose up -d` |
| Build OOM on 1 OCPU / 6 GB | Use **2 OCPU / 12 GB** shape |
| Wrong auth | Edit `/opt/nexa-labs/landing/nexa-trials/marketing/lab-vps/.env`, then `docker compose up -d` |
| Demo state reset | Data lives in `/opt/nexa-labs/data/` — do not delete those folders |

---

## Cost comparison

| Option | Monthly cost | 24/7 | State persists |
|--------|--------------|------|----------------|
| PC + tunnel | $0 | Only if PC awake | Yes (local) |
| Render Free | $0 | No (sleeps) | No |
| Render Starter | ~$14 | Yes | Limited |
| **Oracle VPS (this)** | **$0** | **Yes** | **Yes** |

---

## File layout on VPS

```
/opt/nexa-labs/                          # git clone
/opt/nexa-labs/data/nexadirect/          # persistent NexaDirect demo_data + SQLite
/opt/nexa-labs/data/nexasource/          # persistent NexaSource demo_data + SQLite
/etc/nginx/sites-enabled/nexa-labs       # edge reverse proxy
```

Docker containers bind to `127.0.0.1:8070` and `:8071` only — not exposed publicly except via nginx.
