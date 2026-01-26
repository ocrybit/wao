import { HyperBEAM } from "../../src/test.js"

async function main() {
  console.log("Starting HyperBEAM...")
  const hbeam = await new HyperBEAM({ reset: true }).ready()
  const hb = hbeam.hb

  console.log("HyperBEAM ready at:", hbeam.url)
  console.log("Address:", hbeam.addr)

  try {
    console.log("Spawning process...")
    const { pid } = await hb.spawn()
    console.log("Process spawned, pid:", pid)

    console.log("Scheduling message with data: 'abc'...")
    const result = await hb.schedule({
      pid,
      data: "abc",
    })
    console.log("Schedule result:", result)
    console.log("Slot:", result.slot)
  } catch (e) {
    console.error("Error:", e)
    console.error("Error message:", e.message)
  } finally {
    console.log("Killing HyperBEAM...")
    await hbeam.kill()
    process.exit(0)
  }
}

main()
