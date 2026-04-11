async function main() {
  const Replicate = (await import("replicate")).default;
  const r = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  // Try different model names for SAM2
  for (const name of [
    "schananas/grounded_sam",
    "lucataco/segment-anything-2",
    "meta/sam-2",
  ]) {
    try {
      const [owner, modelName] = name.split("/");
      const model = await r.models.get(owner!, modelName!);
      console.log(`Model ${name}:`, model.latest_version?.id);
      const schema =
        model.latest_version?.openapi_schema?.components?.schemas?.Input;
      if (schema) {
        console.log("Input schema keys:", Object.keys(schema.properties || {}));
      }
    } catch (e: any) {
      console.log(`${name}: ${e.message?.slice(0, 80)}`);
    }
  }
}
main().catch(console.error);
