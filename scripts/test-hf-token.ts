import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '../.env.local') })
config({ path: resolve(process.cwd(), '.env.local') })

console.log('Token length:', process.env.HUGGINGFACE_API_TOKEN?.length)
console.log('Token start:', process.env.HUGGINGFACE_API_TOKEN?.slice(0, 6))
console.log()

const token = process.env.HUGGINGFACE_API_TOKEN

const tests = [
  {
    url: 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2',
    body: { inputs: 'a modern coastal living room sofa' },
  },
  {
    url: 'https://router.huggingface.co/hf-inference/models/openai/clip-vit-base-patch32',
    body: { inputs: 'a modern coastal living room sofa' },
  },
  {
    url: 'https://router.huggingface.co/hf-inference/models/openai/clip-vit-base-patch16',
    body: { inputs: 'a modern coastal living room sofa' },
  },
]

for (const { url, body } of tests) {
  console.log(`Testing: ${url}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log(`Status: ${res.status}`)
  console.log(`Body: ${text.slice(0, 300)}`)
  console.log()
}
