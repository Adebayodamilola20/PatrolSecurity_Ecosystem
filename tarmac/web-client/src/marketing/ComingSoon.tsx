import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, ArrowLeft } from 'lucide-react';

/**
 * Placeholder for nav destinations that exist in the bar but not yet as
 * content — Blog and Docs. Better than a link that bounces off the catch-all
 * back to the home page, which reads as a broken site.
 */
export default function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
    return (
        <section className="relative min-h-[70vh] flex items-center justify-center px-6 py-32 overflow-hidden bg-white">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-80 bg-teal-500/10 blur-[120px] rounded-full pointer-events-none transform-gpu" />
            <div
                className="absolute inset-0 z-0 opacity-[0.35] pointer-events-none transform-gpu"
                style={{ backgroundImage: 'radial-gradient(rgba(15,23,42,0.08) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
            />
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="relative z-10 text-center max-w-xl transform-gpu"
            >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 mb-6">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                    Coming soon
                </div>
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 mb-5">{title}</h1>
                <p className="text-lg text-slate-600 mb-10 leading-relaxed">{blurb}</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link
                        to="/"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-50 text-slate-900 border border-slate-200 px-6 py-3 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back home
                    </Link>
                    <Link
                        to="/contact"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-teal-600 to-cyan-500 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-[0_0_20px_rgba(20,184,166,0.3)]"
                    >
                        Talk to us <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </motion.div>
        </section>
    );
}
