// Works out what the cashier owes back from the cash the customer handed
// over. The tender arrives as the raw string the input holds so that "not
// typed yet" stays distinguishable from a deliberate 0.
//
// Returns positive for change owed, negative when the customer is still
// short, and null when there is nothing usable to compare — the confirm
// modal renders no change row at all in that case.
export function getChange(amountReceived: string, total: number): number | null {
  const trimmed = amountReceived.trim()
  if (!trimmed) return null

  const received = Number(trimmed)
  // A negative tender is nonsense rather than a shortfall, so it reads as
  // "nothing entered" instead of showing a wildly wrong Short amount.
  if (!Number.isFinite(received) || received < 0) return null

  return received - total
}
