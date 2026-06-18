import { useState } from "react"
import { useAuth } from "../auth"
import { inputCls, btnPrimaryCls, fieldLabelCls } from "../components/ui"

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      // On success the app re-renders into the POS — nothing else to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-8 shadow-[var(--shadow)]">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold tracking-tight text-[var(--text-h)]">
            POS System
          </div>
          <p className="mt-1 text-sm text-[var(--text)]">
            Log in to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className={fieldLabelCls}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className={inputCls}
            />
          </label>
          <label className={fieldLabelCls}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className={inputCls}
            />
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className={`${btnPrimaryCls} mt-1 w-full`}
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  )
}
