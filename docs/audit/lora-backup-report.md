# COVA LoRA Backup Report

**Date:** 2026-04-19  
**Operator:** Claude Code  
**Budget:** $0 (no fal/Modal calls)  
**Source:** `experiments/lora_audit/inventory.json`

---

## Download Results

| # | LoRA Name | Status | File Size | SHA-256 |
|---|-----------|--------|-----------|---------|
| 1 | COVASCANDINAV | OK | 89,745,224 B (85.6 MB) | `4a64d31e973e1b1156949aecd27b6166f346143ebe9fbbca6ac8c2d8ca7cddfe` |
| 2 | COVAJAPANDI | OK | 89,745,224 B (85.6 MB) | `80558f5f9c2d7fa70a018884602b9e6a16495519cc353e1f50f1b04f51fcc3d0` |
| 3 | COVABIOPHILIC | OK | 89,745,224 B (85.6 MB) | `ea15827c023fe7b77c742682d1bb69836bc2aa331480e0e04e016b5b78250622` |
| 4 | COVAMINIMAL | OK | 89,745,224 B (85.6 MB) | `54611bbcd832cb3606d3229db84affb08de127085eb55ed7b02e1acdc0d4fa1f` |
| 5 | COVAMIDCENTURY | OK | 89,745,224 B (85.6 MB) | `40d5818969b99c10e6b2957ecde4f189f30fcefe1216910ed8881e81337ba9b0` |
| 6 | COVACOASTAL | OK | 89,745,224 B (85.6 MB) | `75e301963fda4574b4a86e0287fea57a493f5e355ed720ee95cb6ae5d8db64b7` |
| 7 | COVABOHEMIAN | OK | 89,745,224 B (85.6 MB) | `c46706a9f28d5b4a40cbab3ac9ffca92e55c9c829e018e757c9f3ea274d0d072` |
| 8 | COVAINDUSTRIAL | OK | 89,745,224 B (85.6 MB) | `bc5e111c8b7ad2c43116cabdaeb462f118ecabb5e04921546964bcdf22188ea1` |
| 9 | COVAFARMHOUSE | OK | 89,745,224 B (85.6 MB) | `d49c05c35ed02365b9c17ec63cd53bf4b238f0472d89bb74169c934491de556f` |
| 10 | COVAARTDECO | OK | 89,745,224 B (85.6 MB) | `9d5a0af870c0a71abfe8be837261d2253595acc31d2f559ede1d92a23c3e35ad` |

**All 10 downloads succeeded.** No fal.media URLs expired.

---

## File Integrity

- All 10 files are exactly **89,745,224 bytes** (85.6 MB each) — consistent with FLUX.1-dev LoRA weights at fal.ai default rank
- All files have valid safetensors headers (magic bytes: `4067 0100 0000 0000`)
- SHA-256 hashes computed and recorded in individual `.meta.json` files

---

## Total Disk Usage

| Location | Size |
|----------|------|
| Local (`lora-backups/`) | 897,452,240 B (855.9 MB) — safetensors only |
| Local (with metadata) | ~897.5 MB |
| Supabase Storage (`lora-backups` bucket) | ~897.5 MB |
| **Combined (local + Supabase)** | **~1.75 GB** |

---

## Supabase Storage URLs

Bucket: `lora-backups` (private, service-role-only access)

| LoRA | Supabase Path |
|------|--------------|
| COVASCANDINAV | `lora-backups/COVASCANDINAV_2026-04-17.safetensors` |
| COVAJAPANDI | `lora-backups/COVAJAPANDI_2026-04-17.safetensors` |
| COVABIOPHILIC | `lora-backups/COVABIOPHILIC_2026-04-17.safetensors` |
| COVAMINIMAL | `lora-backups/COVAMINIMAL_2026-04-17.safetensors` |
| COVAMIDCENTURY | `lora-backups/COVAMIDCENTURY_2026-04-17.safetensors` |
| COVACOASTAL | `lora-backups/COVACOASTAL_2026-04-17.safetensors` |
| COVABOHEMIAN | `lora-backups/COVABOHEMIAN_2026-04-17.safetensors` |
| COVAINDUSTRIAL | `lora-backups/COVAINDUSTRIAL_2026-04-17.safetensors` |
| COVAFARMHOUSE | `lora-backups/COVAFARMHOUSE_2026-04-17.safetensors` |
| COVAARTDECO | `lora-backups/COVAARTDECO_2026-04-17.safetensors` |

Full URL pattern: `https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/lora-backups/{NAME}_2026-04-17.safetensors`

Each safetensors file has a companion `.meta.json` in the same bucket.

---

## Registry Patch

Saved to: `docs/audit/lora-registry.backup-urls.patch`

Adds `backupUrl?: string` field to the `LoraConfig` interface and populates it with Supabase URLs when resolving custom LoRAs. The primary `url` field (from `style_loras` table) is unchanged. This is additive safety only — if fal.media URLs expire in the `style_loras` table, the backup URLs provide a recovery path.

**Status:** NOT committed. Review and apply when ready.

---

## Failed Downloads

**None.** All 10 fal.media URLs returned HTTP 200 and downloaded successfully.

---

## Training Details Reference

| LoRA | Steps | Default Scale | Trigger | Full Trigger | Archetype |
|------|-------|---------------|---------|--------------|-----------|
| COVASCANDINAV | 1500 | 0.88 | COVASCANDINAV | cvscn interior | Scandinavian |
| COVAJAPANDI | 1500 | 0.88 | COVAJAPANDI | cvwmn interior | Japandi |
| COVABIOPHILIC | 2000 | 0.92 | COVABIOPHILIC | cvbio interior | Biophilic |
| COVAMINIMAL | 1500 | 0.95 | COVAMINIMAL | cvscn interior | Minimalist |
| COVAMIDCENTURY | 1500 | 0.85 | COVAMIDCENTURY | cvmcm interior | Mid-Century Modern |
| COVACOASTAL | 1500 | 0.85 | COVACOASTAL | cvcst interior | Coastal |
| COVABOHEMIAN | 2000 | 0.78 | COVABOHEMIAN | cvboh interior | Bohemian |
| COVAINDUSTRIAL | 2000 | 0.80 | COVAINDUSTRIAL | cvind interior | Industrial |
| COVAFARMHOUSE | 1500 | 0.85 | COVAFARMHOUSE | cvfrm interior | Farmhouse |
| COVAARTDECO | 1500 | 0.82 | COVAARTDECO | cvdco interior | Art Deco |

All trained on **2026-04-17** via `fal-ai/flux-lora-fast-training` (FLUX.1-dev base).
