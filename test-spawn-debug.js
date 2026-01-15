import { spawn } from "child_process"

console.log("=== Spawn Debug Test ===\n")

// Test 1: Simple spawn with immediate exit
console.log("Test 1: Simple echo command")
const start1 = Date.now()
const p1 = spawn("echo", ["hello world"])
p1.stdout.on("data", d => console.log("stdout:", d.toString().trim()))
p1.on("close", code => {
  console.log(`Test 1 completed in ${Date.now() - start1}ms, exit code: ${code}\n`)
  runTest2()
})

function runTest2() {
  console.log("Test 2: Sleep 1 second then exit")
  const start2 = Date.now()
  const p2 = spawn("sleep", ["1"])
  p2.on("close", code => {
    console.log(`Test 2 completed in ${Date.now() - start2}ms, exit code: ${code}\n`)
    runTest3()
  })
}

function runTest3() {
  console.log("Test 3: Spawn with kill after 2 seconds")
  const start3 = Date.now()
  const p3 = spawn("sleep", ["10"])

  setTimeout(() => {
    console.log("Killing process...")
    p3.kill("SIGKILL")
  }, 2000)

  p3.on("close", code => {
    console.log(`Test 3 completed in ${Date.now() - start3}ms, exit code: ${code}\n`)
    console.log("=== All tests passed ===")
    process.exit(0)
  })
}

// Timeout safety
setTimeout(() => {
  console.log("TIMEOUT: Test took too long, exiting")
  process.exit(1)
}, 10000)
