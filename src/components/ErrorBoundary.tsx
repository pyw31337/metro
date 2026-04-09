"use client";

import { Component, ReactNode } from "react";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: any) {
        console.error("[Metro Live] Uncaught error:", error, info);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback ?? (
                <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-white dark:bg-zinc-950 p-8 text-center">
                    <div className="text-4xl mb-4">🚇</div>
                    <h2 className="text-[18px] font-black text-zinc-900 dark:text-white mb-2">오류가 발생했습니다</h2>
                    <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-6 max-w-[280px]">
                        앱 로딩 중 문제가 발생했습니다.<br/>새로고침하면 해결될 수 있습니다.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-3 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[14px] font-black active:scale-95 transition-all"
                    >
                        새로고침
                    </button>
                    {this.state.error && (
                        <p className="mt-4 text-[9px] text-zinc-300 dark:text-zinc-700 font-mono max-w-[300px] truncate">
                            {this.state.error.message}
                        </p>
                    )}
                </div>
            );
        }
        return this.props.children;
    }
}
