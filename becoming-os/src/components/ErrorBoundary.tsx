// Keeps a crash in one page from blanking the whole app: the page shows what
// went wrong, and the navigation stays usable.
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode; whole?: boolean }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("BECOMING OS page error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const detail = `${error.name}: ${error.message}`;
    return (
      <div role="alert" className={this.props.whole ? "mx-auto max-w-lg px-4 py-16" : "py-6"}>
        <div className="rounded-2xl border border-alert/40 bg-panel p-6">
          <div className="eyebrow mb-2 text-alert">Something went wrong</div>
          <h1 className="text-[26px] leading-tight text-bone">This page couldn't open</h1>
          <p className="mt-2 text-[13.5px] text-mute">Your records are safe. Try again, or pick another page. If it keeps happening, send this message to Claude:</p>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-raised p-3 text-[12px] text-bone">{detail}</pre>
          <button type="button" onClick={() => this.setState({ error: null })}
            className="mt-4 inline-flex h-10 items-center rounded-xl border border-line px-4 text-[13px] font-medium text-bone hover:bg-raised">Try again</button>
        </div>
      </div>
    );
  }
}
