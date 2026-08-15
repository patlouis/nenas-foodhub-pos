import { useEffect, useRef } from "react"

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

// Stack of open modals so nesting works: Escape closes only the topmost, and
// the scroll lock survives until the last one closes.
const openModals: object[] = []

export default function Modal({ open, onClose, title, children }: ModalProps) {
  // Ref so the effect depends only on `open`; an inline onClose arrow changes
  // identity every render and would churn the stack.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const token = {}
    openModals.push(token)
    document.body.style.overflow = "hidden"

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openModals[openModals.length - 1] === token) {
        onCloseRef.current()
      }
    }
    document.addEventListener("keydown", onKey)

    return () => {
      document.removeEventListener("keydown", onKey)
      const i = openModals.indexOf(token)
      if (i !== -1) openModals.splice(i, 1)
      if (openModals.length === 0) document.body.style.overflow = ""
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-[var(--shadow)]"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="m-0">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-[var(--text)] transition-colors hover:bg-[var(--social-bg)] hover:text-[var(--text-h)]"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
