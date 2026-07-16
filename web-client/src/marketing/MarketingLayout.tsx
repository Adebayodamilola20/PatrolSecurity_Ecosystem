// Vendored from the standalone Lumina marketing site (lumina-saas).
//
// The nav and footer wrap every public marketing page, so the template's
// top-level App became this route layout: <Routes> is now <Outlet />, and the
// pages it renders are ordinary children. Auth CTAs ("Log in", "Get Started",
// "Sign In") all lead to /login — the real client portal sign-in.
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ReactLenis } from 'lenis/react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown, ArrowRight } from 'lucide-react';

// Nav mirrors the shape competitors in this category use — Blog, Solutions,
// Docs, Pricing, FAQ, Contact — over our own chrome. The Solutions dropdown
// deep-links into the dedicated /solutions page (each row has a matching id).
const SOLUTIONS_MENU = [
    { label: 'Guard management', to: '/solutions#guard-management', dot: 'bg-teal-500' },
    { label: 'GPS tracking', to: '/solutions#gps-tracking', dot: 'bg-cyan-500' },
    { label: 'Emergency response', to: '/solutions#emergency-response', dot: 'bg-teal-500' },
    { label: 'Patrol verification', to: '/solutions#patrol-verification', dot: 'bg-cyan-500' },
    { label: 'Control room', to: '/solutions#control-room', dot: 'bg-teal-500' },
    { label: 'Access control', to: '/solutions#access-control', dot: 'bg-cyan-500' },
];

const MOBILE_LINKS = [
    { label: 'Blog', to: '/blog' },
    { label: 'Solutions', to: '/solutions' },
    { label: 'Docs', to: '/docs' },
    { label: 'Pricing', to: '/#pricing' },
    { label: 'FAQ', to: '/#faq' },
    { label: 'Contact', to: '/contact' },
];

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
    <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        // 🔥 OPTIMIZATION: Added transform-gpu
        className="transform-gpu"
    >
        {children}
    </motion.div>
);


export default function MarketingLayout() {
    const { pathname, hash } = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        setIsMobileMenuOpen(false);
        // The router does not scroll to #anchors on its own, and jumping to the
        // top would fight the nav's section links. Defer a frame so the target
        // section exists when arriving from another page.
        if (hash) {
            const id = hash.slice(1);
            requestAnimationFrame(() => {
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            return;
        }
        window.scrollTo(0, 0);
    }, [pathname, hash]);

    return (
        <div className="evergreen-site min-h-screen bg-white text-slate-900 selection:bg-teal-500/30 selection:text-teal-200 overflow-x-hidden relative">
            <ReactLenis root options={{ lerp: 0.05, duration: 1.5, smoothWheel: true }}>

                {/* 1. NAVBAR */}
                <nav className="fixed top-0 left-0 w-full z-50 bg-white/70 backdrop-blur-md border-b border-slate-200 transform-gpu">
                    <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                        <Link to="/" className="flex items-center gap-2 font-semibold text-lg tracking-tight text-slate-900 cursor-pointer">
                            <div className="w-6 h-6 bg-slate-900 rounded-md flex items-center justify-center">
                                <div className="w-2 h-2 bg-white rounded-sm" />
                            </div>
                            Evergreen
                        </Link>

                        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
                            <Link to="/blog" className="hover:text-slate-900 transition-colors">Blog</Link>

                            {/* Solutions dropdown — our glass card, jumping to the landing sections. */}
                            <div className="relative group py-4">
                                <Link to="/solutions" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
                                    Solutions <ChevronDown className="w-3 h-3 group-hover:rotate-180 transition-transform duration-300" />
                                </Link>

                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 z-50">
                                    {/* Invisible bridge to keep hover active */}
                                    <div className="absolute -top-4 left-0 w-full h-4"></div>

                                    <div className="bg-white/90 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-[0_20px_40px_rgba(15,23,42,0.12)] p-2 flex flex-col gap-1 relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-slate-100 to-transparent pointer-events-none" />

                                        {SOLUTIONS_MENU.map((item) => (
                                            <Link
                                                key={item.label}
                                                to={item.to}
                                                className="relative z-10 px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all flex items-center gap-2 group/item"
                                            >
                                                <div className={`w-1.5 h-1.5 rounded-full ${item.dot} opacity-0 group-hover/item:opacity-100 transition-opacity`} />
                                                {item.label}
                                            </Link>
                                        ))}

                                        <div className="h-[1px] w-full bg-slate-200 my-1 relative z-10" />
                                        <Link to="/solutions" className="relative z-10 px-4 py-2.5 text-sm font-medium text-teal-600 hover:bg-slate-100 rounded-xl transition-all flex items-center gap-1.5">
                                            View all solutions <ArrowRight className="w-3 h-3" />
                                        </Link>
                                    </div>
                                </div>
                            </div>

                            <Link to="/docs" className="hover:text-slate-900 transition-colors">Docs</Link>
                            <Link to="/#pricing" className="hover:text-slate-900 transition-colors">Pricing</Link>
                            <Link to="/#faq" className="hover:text-slate-900 transition-colors">FAQ</Link>
                            <Link to="/contact" className="hover:text-slate-900 transition-colors">Contact</Link>
                        </div>

                        <div className="hidden md:flex items-center gap-4">
                            <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Sign In</Link>
                            <Link to="/login" className="bg-gradient-to-r from-teal-600 to-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(20,184,166,0.3)] inline-flex items-center gap-1.5">
                                Start Free Trial <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                        <button 
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
                            className="md:hidden text-slate-600 hover:text-slate-900 transition-colors focus:outline-none"
                        >
                            {isMobileMenuOpen ? (
                                <X className="w-5 h-5" />
                            ) : (
                                <Menu className="w-5 h-5" />
                            )}
                        </button>
                    </div>

                    {/* Mobile Menu */}
                    <AnimatePresence>
                        {isMobileMenuOpen && (
                            <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                className="md:hidden border-t border-slate-200 bg-white/95 backdrop-blur-xl overflow-hidden"
                            >
                                <div className="px-6 py-4 flex flex-col gap-4">
                                    {MOBILE_LINKS.map((item) => (
                                        <Link
                                            key={item.label}
                                            to={item.to}
                                            onClick={() => setIsMobileMenuOpen(false)}
                                            className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors py-1"
                                        >
                                            {item.label}
                                        </Link>
                                    ))}

                                    <div className="h-[1px] w-full bg-slate-100 my-1" />

                                    {SOLUTIONS_MENU.map((item) => (
                                        <Link
                                            key={item.label}
                                            to={item.to}
                                            onClick={() => setIsMobileMenuOpen(false)}
                                            className="text-sm text-slate-500 hover:text-slate-900 transition-colors py-1 pl-3 border-l-2 border-slate-100"
                                        >
                                            {item.label}
                                        </Link>
                                    ))}

                                    <div className="h-[1px] w-full bg-slate-100 my-1" />

                                    <Link
                                        to="/login"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors py-1"
                                    >
                                        Sign In
                                    </Link>
                                    <Link
                                        to="/login"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="bg-gradient-to-r from-teal-600 to-cyan-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(20,184,166,0.3)] text-center mt-2"
                                    >
                                        Start Free Trial
                                    </Link>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </nav>


                <AnimatePresence mode="wait">
                    <PageWrapper key={pathname}>
                        <Outlet />
                    </PageWrapper>
                </AnimatePresence>


                {/* 8. FOOTER */}
                <footer className="bg-white relative overflow-hidden pt-24 pb-10 border-t border-slate-200">
                    <div className="max-w-7xl mx-auto px-6 relative z-10">
                        {/* Top Row (Brand & Nav) */}
                        <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-slate-200 pb-8 mb-12">
                            <div className="flex items-center gap-2 font-semibold text-xl tracking-tight text-slate-900">
                                <div className="w-6 h-6 bg-slate-900 rounded-md flex items-center justify-center">
                                    <div className="w-2 h-2 bg-white rounded-sm" />
                                </div>
                                Evergreen
                            </div>

                            <div className="hidden md:flex items-center gap-8 text-sm text-slate-600">
                                <a href="#" className="hover:text-slate-900 transition-colors">About</a>
                                <a href="#" className="hover:text-slate-900 transition-colors">Features</a>
                                <a href="#" className="hover:text-slate-900 transition-colors">Pricing</a>
                                <a href="#" className="hover:text-slate-900 transition-colors">Contact</a>
                            </div>

                            <Link to="/login" className="bg-slate-50 border border-slate-200 text-slate-900 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">
                                Get Started
                            </Link>
                        </div>

                        {/* Main Link Grid (4 Columns) */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 z-10 relative">
                            <div>
                                <h4 className="text-slate-900 font-semibold mb-6">Navigation</h4>
                                <ul className="space-y-4 text-sm">
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">Home</a></li>
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">Features</a></li>
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">Pricing</a></li>
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">About Us</a></li>
                                </ul>
                            </div>

                            <div>
                                <h4 className="text-slate-900 font-semibold mb-6">Documentation</h4>
                                <ul className="space-y-4 text-sm">
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">Getting Started</a></li>
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">API Reference <span className="text-[10px] opacity-50">↗</span></a></li>
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">Integrations</a></li>
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">Guides</a></li>
                                </ul>
                            </div>

                            <div>
                                <h4 className="text-slate-900 font-semibold mb-6">Legal</h4>
                                <ul className="space-y-4 text-sm">
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">Privacy Policy</a></li>
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">Terms of Service</a></li>
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">Cookie Policy</a></li>
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">Security</a></li>
                                </ul>
                            </div>

                            <div>
                                <h4 className="text-slate-900 font-semibold mb-6">Social Connect</h4>
                                <ul className="space-y-4 text-sm">
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">Twitter <span className="text-[10px] opacity-50">↗</span></a></li>
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">GitHub <span className="text-[10px] opacity-50">↗</span></a></li>
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">Discord <span className="text-[10px] opacity-50">↗</span></a></li>
                                    <li><a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1">LinkedIn <span className="text-[10px] opacity-50">↗</span></a></li>
                                </ul>
                            </div>
                        </div>

                        {/* Copyright Bar */}
                        <div className="bg-slate-50 rounded-2xl py-4 px-6 mt-16 z-10 relative flex flex-col md:flex-row justify-between items-center text-sm text-slate-500 gap-4">
                            <p>© 2026 Evergreen. All copyrights reserved.</p>
                            <p>Designed by Yacine</p>
                        </div>
                    </div>

                    {/* Giant Evergreen watermark behind the footer. Teal tint at a
                        readable opacity (the old slate-900/[0.04] was invisible on
                        white), sized to bleed past the sides, and sat behind the
                        link columns — high enough to show the moment the footer
                        scrolls in, not only at the very bottom. */}
                    <div className="absolute inset-x-0 bottom-16 text-center text-[20vw] leading-none font-black text-teal-950/[0.10] select-none pointer-events-none tracking-tighter whitespace-nowrap z-0">
                        Evergreen
                    </div>
                </footer>

                {/* 9. THE MAGIC SCROLL VIGNETTE (OPTIMIZED 🚀) */}
                <div className="fixed bottom-0 left-0 w-full h-24 pointer-events-none z-50 bg-gradient-to-t from-white via-white/80 to-transparent transform-gpu will-change-transform" />

            </ReactLenis>
        </div>
    );
}
