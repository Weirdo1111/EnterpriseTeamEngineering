// A small in-process worker drains the durable MySQL queue. Multiple server instances
// may run this loop: SKIP LOCKED claims each job once. Nothing sensitive is logged.
export function startCodeWorker(codes: { processNext(): Promise<boolean> }) {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending = Promise.resolve()
  function schedule(delay: number) {
    if (!stopped) timer = setTimeout(run, delay)
  }
  function run() {
    pending = (async () => {
      try {
        const handled = await codes.processNext()
        schedule(handled ? 0 : 1000)
      } catch {
        console.error('Authentication delivery worker failed; retrying database queue.')
        schedule(1000)
      }
    })()
  }
  schedule(0)
  return async () => {
    stopped = true
    if (timer) clearTimeout(timer)
    await pending
  }
}
