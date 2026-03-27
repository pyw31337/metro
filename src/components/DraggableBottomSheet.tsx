"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown, Minus } from "lucide-react";

interface DraggableBottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    snapPoints?: number[]; // [peek, mid, full]
    onSnap?: (point: number) => void;
}

export default function DraggableBottomSheet({ 
    isOpen, 
    onClose, 
    children, 
    snapPoints = [80, 400, 700] 
}: DraggableBottomSheetProps) {
    
    return (
        <div className="fixed inset-x-0 bottom-0 z-[2000] pointer-events-none">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        drag="y"
                        dragConstraints={{ top: -snapPoints[2] + snapPoints[0], bottom: 0 }}
                        dragElastic={0.15}
                        className="glass-premium rounded-t-[32px] w-full max-w-2xl mx-auto pointer-events-auto shadow-[0_-15px_50px_rgba(0,0,0,0.2)]"
                        style={{ height: snapPoints[2], marginBottom: -snapPoints[2] + snapPoints[0] }}
                    >
                        {/* ─── Drag Handle ────────────────────────────────────────── */}
                        <div className="flex flex-col items-center py-4 cursor-grab active:cursor-grabbing border-b border-white/5">
                            <div className="w-12 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 mb-1" />
                        </div>

                        {/* ─── Content Area ────────────────────────────────────────── */}
                        <div className="overflow-y-auto no-scrollbar h-full px-6 py-6 pb-20">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
