"use client";

import { CheckCircle2, Circle, Loader2, AlertCircle } from 'lucide-react';
import type { IngestionTask } from '@/services/dataIngestion';

interface IngestionProgressProps {
    tasks: IngestionTask[];
    isVisible: boolean;
}

export default function IngestionProgress({ tasks, isVisible }: IngestionProgressProps) {
    const overallProgress = tasks.length > 0
        ? Math.round(tasks.reduce((acc, task) => acc + task.progress, 0) / tasks.length)
        : 0;

    const isAllCompleted = tasks.every(t => t.status === 'completed');

    if (!isVisible && !isAllCompleted) return null;

    return isVisible ? (
        <div className="animate-fade-in-up bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-3xl p-4 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col">
                    <h3 className="text-[13px] font-black text-zinc-900 dark:text-white uppercase tracking-tight">수도권 지하철 데이터 최적화</h3>
                    <p className="text-[10px] text-zinc-500 font-bold">50여 개의 공공데이터 세트를 실시간 동기화 중입니다.</p>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[16px] font-black text-blue-500 font-mono">{overallProgress}%</span>
                </div>
            </div>

            <div className="w-full h-1.5 bg-zinc-100 dark:bg-white/5 rounded-full overflow-hidden mb-5">
                <div
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${overallProgress}%` }}
                />
            </div>

            <div className="space-y-2 max-h-[160px] overflow-y-auto no-scrollbar pr-1">
                {tasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between group">
                        <div className="flex items-center gap-2.5">
                            <div className="shrink-0">
                                {task.status === 'completed' ? (
                                    <CheckCircle2 size={14} className="text-emerald-500" />
                                ) : task.status === 'running' ? (
                                    <Loader2 size={14} className="text-blue-500 animate-spin" />
                                ) : task.status === 'failed' ? (
                                    <AlertCircle size={14} className="text-rose-500" />
                                ) : (
                                    <Circle size={14} className="text-zinc-300 dark:text-zinc-700" />
                                )}
                            </div>
                            <span className={`text-[11px] font-bold ${task.status === 'completed' ? 'text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                {task.label}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {task.status === 'running' && (
                                <span className="text-[10px] font-black text-blue-500/80 font-mono">{task.progress}%</span>
                            )}
                            {task.status === 'completed' && (
                                <span className="text-[9px] font-black text-emerald-500/60 uppercase tracking-tighter">완료</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    ) : null;
}
