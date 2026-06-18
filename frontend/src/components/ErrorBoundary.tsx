import { Component, type ErrorInfo, type ReactNode } from "react"
import { btnPrimaryCls } from "./ui"

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// React error boundaries must be class components — there is no hook
// equivalent. Catches render errors anywhere below it so one broken page
// doesn't take down the whole app with a blank screen.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-dvh w-full items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-8 text-center shadow-[var(--shadow)]">
          <h1 className="m-0 text-lg font-semibold text-[var(--text-h)]">Something went wrong</h1>
          <p className="mt-2 text-sm text-[var(--text)]">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className={`${btnPrimaryCls} mt-5 w-full`}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
