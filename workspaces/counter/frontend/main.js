import { dryrun, message, createDataItemSigner } from "@permaweb/aoconnect"

let processId = null
let wallet = null

// DOM elements
const processInput = document.getElementById("processId")
const connectBtn = document.getElementById("connectBtn")
const counterDisplay = document.getElementById("counter-display")
const countEl = document.getElementById("count")
const incBtn = document.getElementById("incBtn")
const decBtn = document.getElementById("decBtn")
const resetBtn = document.getElementById("resetBtn")
const refreshBtn = document.getElementById("refreshBtn")
const amountInput = document.getElementById("amount")
const incAmountBtn = document.getElementById("incAmountBtn")
const decAmountBtn = document.getElementById("decAmountBtn")
const statusEl = document.getElementById("status")

function setStatus(msg, type = "") {
  statusEl.textContent = msg
  statusEl.className = type
}

function setLoading(loading) {
  const buttons = [incBtn, decBtn, resetBtn, refreshBtn, incAmountBtn, decAmountBtn]
  buttons.forEach(btn => btn.disabled = loading)
}

async function connectWallet() {
  if (!window.arweaveWallet) {
    setStatus("Please install ArConnect wallet", "error")
    return false
  }

  await window.arweaveWallet.connect(["ACCESS_ADDRESS", "SIGN_TRANSACTION"])
  wallet = window.arweaveWallet
  return true
}

async function getCount() {
  try {
    const result = await dryrun({
      process: processId,
      tags: [{ name: "Action", value: "Get" }],
    })

    if (result.Messages?.[0]?.Data) {
      const data = JSON.parse(result.Messages[0].Data)
      countEl.textContent = data.count
      return data.count
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error")
  }
}

async function sendAction(action, tags = []) {
  if (!wallet) {
    const connected = await connectWallet()
    if (!connected) return
  }

  setLoading(true)
  setStatus(`Sending ${action}...`)

  try {
    await message({
      process: processId,
      signer: createDataItemSigner(wallet),
      tags: [{ name: "Action", value: action }, ...tags],
    })

    // Wait a moment for the message to process
    await new Promise(r => setTimeout(r, 1000))
    await getCount()
    setStatus(`${action} successful!`, "success")
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error")
  } finally {
    setLoading(false)
  }
}

// Event listeners
connectBtn.addEventListener("click", async () => {
  const pid = processInput.value.trim()
  if (!pid) {
    setStatus("Please enter a Process ID", "error")
    return
  }

  processId = pid
  setStatus("Connecting...")

  try {
    await getCount()
    counterDisplay.classList.remove("hidden")
    setStatus("Connected!", "success")
  } catch (err) {
    setStatus(`Failed to connect: ${err.message}`, "error")
  }
})

incBtn.addEventListener("click", () => sendAction("Inc"))
decBtn.addEventListener("click", () => sendAction("Dec"))
resetBtn.addEventListener("click", () => sendAction("Reset"))
refreshBtn.addEventListener("click", () => {
  setStatus("Refreshing...")
  getCount().then(() => setStatus("Refreshed!", "success"))
})

incAmountBtn.addEventListener("click", () => {
  const amount = amountInput.value
  sendAction("Inc", [{ name: "Amount", value: amount }])
})

decAmountBtn.addEventListener("click", () => {
  const amount = amountInput.value
  sendAction("Dec", [{ name: "Amount", value: amount }])
})

// Allow Enter key to connect
processInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") connectBtn.click()
})
