# Cova 360 LoRA Training Pipeline

Trains a FLUX LoRA model for generating equirectangular 360-degree interior room renders using the trigger word `COVAINTERIOR360`.

## Prerequisites

- Node.js 20.x
- `REPLICATE_API_TOKEN` environment variable set
- `zip` command available (pre-installed on macOS)

## Usage

```bash
export REPLICATE_API_TOKEN=r8_your_token_here
npx ts-node scripts/lora-training/train-cova-360.ts
```

## Pipeline Steps

1. Downloads indoor equirectangular HDRIs from Poly Haven (2:1 aspect ratio, 2048px+ wide)
2. Packages images with auto-generated captions into a ZIP
3. Uploads dataset to Replicate
4. Starts FLUX LoRA training via `ostris/flux-dev-lora-trainer`
5. Polls until training completes (up to 1 hour)
6. Downloads trained weights
7. Runs 5 test inferences to validate quality

## Training Configuration

| Parameter | Value |
|-----------|-------|
| Steps | 2000 |
| Batch size | 1 |
| Learning rate | 0.0004 |
| Resolution | 1024 |
| LoRA rank | 16 |
| Optimizer | adamw8bit |
| Autocaption | true |
| Trigger word | COVAINTERIOR360 |

## Output

- `dataset/` — downloaded and filtered training images
- `dataset/manifest.json` — metadata for all curated images
- `dataset/packaged/` — images with caption .txt files
- `dataset/training-dataset.zip` — packaged dataset for upload
- `test-outputs/training-result.json` — full training result from Replicate
- `test-outputs/test_*.jpg` — test inference outputs
- `test-outputs/inference-results.json` — test results summary

## Using the Trained Model

After training, the LoRA is available as `cova/cova-interior-360-lora` on Replicate. Include the trigger word `COVAINTERIOR360` in your prompt to activate the fine-tuned style.
