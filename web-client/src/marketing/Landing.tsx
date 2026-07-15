// Vendored from the standalone Lumina marketing site (lumina-saas).
//
// This is the client portal's front door: the first thing a visitor sees at "/".
// The copy, testimonials and imagery are placeholder content carried over from
// the template and are slated for replacement — only the auth CTAs have been
// rewired, and they point at the real portal login at /login.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import {
    ArrowRight, Sparkles, Lock, Network, Zap, Search, Smartphone, CheckCircle2, Shield,
    ZapIcon, Globe, Home, BarChart2, Folder, Settings, ChevronDown, Bell, Plus, ArrowLeft,
    FileText, Link as LinkIcon, Hash, ArrowUpRight, MousePointer2, Users, Cpu, ChevronLeft,
    ChevronRight, MessageSquare
} from 'lucide-react';

const FadeDown = ({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) => (
    <motion.div
        initial={{ opacity: 0, y: -30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5, delay, ease: "easeOut" }}
        // 🔥 OPTIMIZATION: Added transform-gpu and will-change-transform
        className={`transform-gpu will-change-transform ${className}`}
    >
        {children}
    </motion.div>
);

export default function Landing() {
    // Which FAQ row is expanded; null means all collapsed.
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const [testimonialIndex, setTestimonialIndex] = useState(0);

    const testimonials = [
        {
            quote: "Evergreen has completely transformed how I organize my research. The bi-directional linking is a game-changer for connecting complex ideas.",
            name: "Sarah Jenkins",
            role: "Product Manager at TechFlow",
            avatar: "https://picsum.photos/seed/sarah100/100"
        },
        {
            quote: "The speed of the interface is incredible. I've tried every note-taking app out there, and nothing comes close to Evergreen's performance and clarity.",
            name: "Marcus Chen",
            role: "Senior Software Engineer",
            avatar: "https://picsum.photos/seed/marcus100/100"
        },
        {
            quote: "Finally, an app that respects my privacy without sacrificing features. The E2E encryption gives me peace of mind for all my sensitive projects.",
            name: "Elena Rodriguez",
            role: "Creative Director",
            avatar: "https://picsum.photos/seed/elena100/100"
        }
    ];

    const nextTestimonial = () => {
        setTestimonialIndex((prev) => (prev + 1) % testimonials.length);
    };

    const prevTestimonial = () => {
        setTestimonialIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
    };

    const faqData = [
        {
            question: "How secure is my data with End-to-End Encryption?",
            answer: "Evergreen uses industry-standard AES-256 encryption. Your notes are encrypted locally on your device before being synced to our servers. We never have access to your private keys or the content of your notes."
        },
        {
            question: "How does the offline mode work?",
            answer: "Evergreen is built with a local-first architecture. You can create, edit, and organize your notes without an internet connection. Once you're back online, Evergreen automatically resolves any conflicts and syncs your changes across all devices."
        },
        {
            question: "Are there any limits on AI usage?",
            answer: "Starter users get a limited number of AI interactions per month. Pro and Enterprise users enjoy unlimited access to our AI Assistant, powered by the latest large language models for brainstorming, summarizing, and research."
        },
        {
            question: "Can I export my data if I decide to leave?",
            answer: "Absolutely. We believe in data sovereignty. You can export your entire knowledge base in standard Markdown format at any time, ensuring your notes remain accessible and portable regardless of the platform you use."
        },
        {
            question: "Which devices is Evergreen compatible with?",
            answer: "Evergreen is available as a native desktop app for macOS, Windows, and Linux. We also offer a powerful web application and mobile apps for iOS and Android, ensuring your second brain is always within reach."
        }
    ];

    return (
        <main>
            {/* 2. HERO SECTION */}
            <section className="relative overflow-hidden pt-24 pb-16 mt-12 px-6 min-h-screen flex flex-col items-center bg-white">
                {/* 1. Grid Pattern Layer */}
                <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.06)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

                {/* 2. Ambient Glow Layer */}
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-teal-500/10 blur-[120px] rounded-full pointer-events-none z-0" />

                {/* 3. Bottom Gradient for smooth transition */}
                <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-white to-transparent pointer-events-none z-0" />

                <div className="relative z-10 w-full max-w-7xl mx-auto text-center flex flex-col items-center flex-1">
                    <FadeDown>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 mb-8 backdrop-blur-sm">
                            <Sparkles className="w-3 h-3 text-teal-400" />
                            <span>✨ New AI Features</span>
                        </div>
                    </FadeDown>
                    <FadeDown delay={0.1}>
                        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter mb-6 max-w-4xl mx-auto leading-[1.1] bg-clip-text text-transparent bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-900/40 drop-shadow-sm">
                            Think better.<br className="hidden md:block" /> Write faster.
                        </h1>
                    </FadeDown>
                    <FadeDown delay={0.2}>
                        <p className="text-lg md:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
                            The networked note-taking tool designed for speed, clarity, and focus.
                        </p>
                    </FadeDown>
                    <FadeDown delay={0.3}>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link to="/login" className="w-full sm:w-auto bg-gradient-to-r from-teal-600 to-cyan-500 text-white px-8 py-3.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(20,184,166,0.4)]">
                                Start Free Trial <ArrowRight className="w-4 h-4" />
                            </Link>
                            <button className="w-full sm:w-auto bg-slate-50 text-slate-900 border border-slate-200 px-8 py-3.5 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors backdrop-blur-sm">
                                View Demo
                            </button>
                        </div>
                    </FadeDown>

                    {/* Dashboard Mockup */}
                    <div style={{ perspective: '1200px' }} className="w-full mt-24 relative mx-auto max-w-6xl hidden md:block mb-16">
                        <motion.div
                            initial={{ scale: 0.85, y: 300, rotateX: 50, opacity: 0 }}
                            whileInView={{ scale: 1, y: 0, rotateX: 0, opacity: 1 }}
                            viewport={{ once: true, margin: "-150px" }}
                            transition={{ type: "spring", stiffness: 60, damping: 20, mass: 1.5 }}
                            className="w-full transform-gpu"
                        >
                            <div>
                                {/* 🔥 OPTIMIZATION: Added transform-gpu, will-change-transform */}
                                <div className="absolute inset-0 bg-gradient-to-b from-teal-500/20 to-cyan-500/20 blur-[100px] rounded-full -z-10 transform translate-y-8 pointer-events-none transform-gpu will-change-transform" />

                                <div className="w-full min-h-[750px] pb-8 bg-[#050505] border border-white/10 rounded-3xl shadow-2xl flex overflow-hidden relative backdrop-blur-2xl">
                                    {/* Top Glow Effects */}
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[2px] bg-gradient-to-r from-transparent via-teal-500 to-transparent opacity-80 z-50 transform-gpu" />
                                    <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-full h-40 bg-teal-500/20 blur-[100px] pointer-events-none z-40 transform-gpu will-change-transform" />

                                    {/* Floating Left Sidebar */}
                                    <div className="absolute left-6 top-12 -translate-y-12 w-16 bg-[#111] border border-white/5 rounded-full py-8 flex flex-col items-center gap-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] z-20 transform-gpu">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-600 to-cyan-500 flex items-center justify-center shadow-[0_0_15px_rgba(20,184,166,0.4)]">
                                            <Home className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-gray-500 hover:text-white transition-colors cursor-pointer">
                                            <BarChart2 className="w-5 h-5" />
                                        </div>
                                        <div className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-gray-500 hover:text-white transition-colors cursor-pointer">
                                            <Folder className="w-5 h-5" />
                                        </div>
                                        <div className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-gray-500 hover:text-white transition-colors cursor-pointer mt-auto">
                                            <Settings className="w-5 h-5" />
                                        </div>
                                    </div>

                                    {/* Main Content Area */}
                                    <div className="flex-1 flex flex-col pl-24 lg:pl-28 pr-6 py-8 relative z-10 h-full overflow-y-auto overflow-x-hidden">
                                        {/* Header */}
                                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
                                            <h2 className="text-2xl font-bold text-white">Good Evening, Alex!</h2>
                                            <div className="flex items-center gap-4">
                                                <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-300 flex items-center gap-2">
                                                    Personal Workspace <ChevronDown className="w-4 h-4" />
                                                </div>
                                                <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 shrink-0">
                                                    <Bell className="w-5 h-5" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col lg:flex-row gap-8 flex-1">
                                            {/* Left Column Cards */}
                                            <div className="w-full lg:w-72 flex flex-col gap-4">
                                                <div className="h-40 rounded-2xl bg-gradient-to-br from-teal-900/40 to-black border border-teal-500/20 p-5 flex flex-col justify-between relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 rounded-full blur-2xl -mr-10 -mt-10 transition-transform group-hover:scale-110 transform-gpu will-change-transform" />
                                                    <div className="flex justify-between items-start">
                                                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                                            <Sparkles className="w-4 h-4 text-teal-400" />
                                                        </div>
                                                        <span className="text-xs text-gray-400">Core Notes</span>
                                                    </div>
                                                    <div>
                                                        <div className="text-lg font-semibold text-white mb-1">Project Alpha</div>
                                                        <div className="text-sm text-gray-400">Updated 2h ago</div>
                                                    </div>
                                                </div>
                                                <div className="h-40 rounded-2xl bg-gradient-to-br from-cyan-900/40 to-black border border-cyan-500/20 p-5 flex flex-col justify-between relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl -mr-10 -mt-10 transition-transform group-hover:scale-110 transform-gpu will-change-transform" />
                                                    <div className="flex justify-between items-start">
                                                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                                            <Network className="w-4 h-4 text-cyan-400" />
                                                        </div>
                                                        <span className="text-xs text-gray-400">Research</span>
                                                    </div>
                                                    <div>
                                                        <div className="text-lg font-semibold text-white mb-1">Q3 Strategy</div>
                                                        <div className="text-sm text-gray-400">Updated 5h ago</div>
                                                    </div>
                                                </div>
                                                <div className="h-24 rounded-2xl border border-dashed border-white/20 bg-white/5 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer gap-2">
                                                    <Plus className="w-5 h-5" /> Add Workspace
                                                </div>
                                            </div>

                                            {/* Middle Column List */}
                                            <div className="flex-1 flex flex-col">
                                                <div className="flex justify-between items-end mb-6">
                                                    <div>
                                                        <h3 className="text-lg font-semibold text-white mb-1">Networked Notes</h3>
                                                        <p className="text-sm text-gray-500">Recent Activity</p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>
                                                        <button className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white"><ArrowRight className="w-4 h-4" /></button>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-3">
                                                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center">
                                                                <FileText className="w-5 h-5 text-teal-400" />
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-medium text-white">Meeting Notes: Design Sync</div>
                                                                <div className="text-xs text-gray-500">Shared with Design Team</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-6">
                                                            <span className="text-sm text-gray-400">2 mins ago</span>
                                                            <div className="w-12 h-6 rounded-full bg-teal-600 flex items-center p-1 cursor-pointer">
                                                                <div className="w-4 h-4 rounded-full bg-white transform translate-x-6 shadow-sm" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                                                                <LinkIcon className="w-5 h-5 text-cyan-400" />
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-medium text-white">Competitor Analysis</div>
                                                                <div className="text-xs text-gray-500">Linked to Q3 Strategy</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-6">
                                                            <span className="text-sm text-gray-400">1 hour ago</span>
                                                            <div className="w-12 h-6 rounded-full bg-white/10 flex items-center p-1 cursor-pointer">
                                                                <div className="w-4 h-4 rounded-full bg-gray-400 shadow-sm" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center">
                                                                <Hash className="w-5 h-5 text-teal-400" />
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-medium text-white">Product Roadmap 2026</div>
                                                                <div className="text-xs text-gray-500">Tag added: #planning</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-6">
                                                            <span className="text-sm text-gray-400">Yesterday</span>
                                                            <div className="w-12 h-6 rounded-full bg-teal-600 flex items-center p-1 cursor-pointer">
                                                                <div className="w-4 h-4 rounded-full bg-white transform translate-x-6 shadow-sm" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Bottom Widgets */}
                                        <div className="mt-8">
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className="text-sm font-semibold text-white">Quick Summary</h3>
                                                <span className="text-xs text-teal-400 cursor-pointer hover:underline">View All</span>
                                            </div>
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-between h-32 relative overflow-hidden">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-xs text-gray-400">Active Notes</span>
                                                        <ArrowUpRight className="w-3 h-3 text-cyan-400" />
                                                    </div>
                                                    <div className="text-2xl font-bold text-white">1,204</div>
                                                    <div className="absolute bottom-0 left-0 right-0 h-12 opacity-50">
                                                        <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full">
                                                            <path d="M0,30 L0,15 C10,15 20,25 30,20 C40,15 50,5 60,10 C70,15 80,25 90,20 C95,17 100,10 100,10 L100,30 Z" fill="rgba(20,184,166,0.3)" />
                                                        </svg>
                                                    </div>
                                                </div>
                                                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-between h-32 relative overflow-hidden">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-xs text-gray-400">Connections</span>
                                                        <ArrowUpRight className="w-3 h-3 text-cyan-400" />
                                                    </div>
                                                    <div className="text-2xl font-bold text-white">8,432</div>
                                                    <div className="absolute bottom-0 left-0 right-0 h-12 opacity-50">
                                                        <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full">
                                                            <path d="M0,30 L0,20 C15,20 25,10 40,15 C55,20 65,25 80,15 C90,8 100,20 100,20 L100,30 Z" fill="rgba(6,182,212,0.3)" />
                                                        </svg>
                                                    </div>
                                                </div>
                                                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-between h-32 relative overflow-hidden">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-xs text-gray-400">Daily Goal</span>
                                                        <ArrowUpRight className="w-3 h-3 text-teal-400" />
                                                    </div>
                                                    <div className="text-2xl font-bold text-white">85%</div>
                                                    <div className="absolute bottom-4 left-4 right-4 flex items-end gap-1 h-8">
                                                        <div className="w-1/6 bg-white/10 rounded-t-sm h-[40%]" />
                                                        <div className="w-1/6 bg-white/10 rounded-t-sm h-[60%]" />
                                                        <div className="w-1/6 bg-white/10 rounded-t-sm h-[30%]" />
                                                        <div className="w-1/6 bg-white/10 rounded-t-sm h-[80%]" />
                                                        <div className="w-1/6 bg-teal-500 rounded-t-sm h-[100%]" />
                                                        <div className="w-1/6 bg-white/10 rounded-t-sm h-[50%]" />
                                                    </div>
                                                </div>
                                                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-between h-32 relative overflow-hidden items-center justify-center">
                                                    <div className="absolute top-4 left-4 flex justify-between items-start w-[calc(100%-2rem)]">
                                                        <span className="text-xs text-gray-400">Sync Status</span>
                                                        <ArrowUpRight className="w-3 h-3 text-cyan-400" />
                                                    </div>
                                                    <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-cyan-400 border-r-teal-500 mt-4 flex items-center justify-center">
                                                        <span className="text-xs font-bold text-white">100%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Sidebar */}
                                    <div className="hidden lg:flex w-64 bg-white/[0.02] border-l border-white/10 p-6 flex-col z-10 relative h-full">
                                        <div className="flex justify-between items-center mb-6">
                                            <h3 className="text-lg font-semibold text-white">Contacts</h3>
                                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 cursor-pointer hover:text-white">
                                                <Search className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 mb-4">Recently active</p>
                                        <div className="flex flex-col gap-4 flex-1">
                                            <div className="flex items-center gap-3 cursor-pointer group">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">MT</div>
                                                <div>
                                                    <div className="text-sm font-medium text-white group-hover:text-teal-400 transition-colors">Mike Taylor</div>
                                                    <div className="text-xs text-gray-500">Design Lead</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 cursor-pointer group">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm shadow-lg">JG</div>
                                                <div>
                                                    <div className="text-sm font-medium text-white group-hover:text-cyan-400 transition-colors">Jack Green</div>
                                                    <div className="text-xs text-gray-500">Engineering</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 cursor-pointer group">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-rose-500 flex items-center justify-center text-white font-bold text-sm shadow-lg">CL</div>
                                                <div>
                                                    <div className="text-sm font-medium text-white group-hover:text-teal-400 transition-colors">Carmen Lewis</div>
                                                    <div className="text-xs text-gray-500">Product Manager</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 cursor-pointer group">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm shadow-lg">MR</div>
                                                <div>
                                                    <div className="text-sm font-medium text-white group-hover:text-cyan-400 transition-colors">Micheal R.</div>
                                                    <div className="text-xs text-gray-500">Marketing</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Bottom Notification Card */}
                                        <div className="mt-auto bg-gradient-to-br from-teal-500/10 to-cyan-500/10 border border-white/10 rounded-xl p-4 relative overflow-hidden">
                                            <div className="absolute -right-4 -top-4 w-16 h-16 bg-teal-500/20 rounded-full blur-xl transform-gpu will-change-transform" />
                                            <Bell className="w-5 h-5 text-teal-400 mb-2" />
                                            <div className="text-sm font-medium text-white mb-1">Weekly Review</div>
                                            <div className="text-xs text-gray-400 mb-3">Your network grew by 12% this week!</div>
                                            <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors ml-auto">
                                                <ArrowRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Ambient Section Transition Glow */}
            <div className="relative w-full h-10 pointer-events-none flex justify-center z-0">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl h-64 bg-teal-500/10 blur-[120px] rounded-full transform-gpu will-change-transform pointer-events-none" />
            </div>

            {/* 3. LOGO CLOUD */}
            <section className="py-12 border-y border-slate-200 bg-slate-50 relative">
                <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
                    <p className="text-sm font-medium text-slate-500 mb-8 uppercase tracking-widest">Trusted by innovative teams</p>
                    <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale">
                        <div className="flex items-center gap-2 text-xl font-bold"><Globe className="w-6 h-6" /> Acme Corp</div>
                        <div className="flex items-center gap-2 text-xl font-bold"><ZapIcon className="w-6 h-6" /> Bolt.io</div>
                        <div className="flex items-center gap-2 text-xl font-bold"><Shield className="w-6 h-6" /> SecureNet</div>
                        <div className="flex items-center gap-2 text-xl font-bold"><Network className="w-6 h-6" /> GraphSys</div>
                        <div className="flex items-center gap-2 text-xl font-bold"><Sparkles className="w-6 h-6" /> Nova</div>
                    </div>
                </div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[150vw] max-w-[1800px] h-[500px] bg-[radial-gradient(ellipse_at_bottom,_rgba(6,182,212,0.08)_0%,_transparent_60%)] pointer-events-none z-0 transform-gpu will-change-transform" />
            </section>

            {/* 4. FEATURES */}
            <section id="features" className="py-32 px-6 relative bg-white">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150vw] max-w-[1800px] h-[500px] bg-[radial-gradient(ellipse_at_top,_rgba(6,182,212,0.08)_0%,_transparent_60%)] pointer-events-none z-0 transform-gpu will-change-transform" />
                {/* Background Stars & Glow specific to Features */}
                <div
                    className="absolute inset-0 z-0 opacity-[0.1] pointer-events-none transform-gpu"
                    style={{ backgroundImage: 'radial-gradient(rgba(15,23,42,0.35) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
                />
                {/* Central subtle light bleed */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl h-96 bg-teal-600/10 blur-[120px] pointer-events-none rounded-full z-0 transform-gpu will-change-transform" />

                <div className="relative z-10 max-w-7xl mx-auto">
                    <FadeDown>
                        <div className="text-center mb-20">
                            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                                Everything you need.<br />Nothing you don't.
                            </h2>
                            <p className="text-slate-600 max-w-2xl mx-auto text-lg">
                                Designed for absolute focus and blazing fast performance.
                            </p>
                        </div>
                    </FadeDown>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                        {/* Feature 1 */}
                        <FadeDown delay={0.1}>
                            <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden flex flex-col h-[400px] group hover:border-slate-300 transition-colors shadow-xl">
                                <div className="h-1/2 bg-slate-50 relative flex items-center justify-center overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-b from-teal-500/10 to-transparent" />
                                    <div className="relative w-48 h-32 bg-white border border-slate-200 rounded-xl p-4 shadow-lg transform group-hover:scale-105 transition-transform duration-500 flex flex-col justify-between">
                                        <div className="flex justify-between items-center">
                                            <div className="w-8 h-2 bg-slate-200 rounded" />
                                            <div className="w-4 h-4 rounded-full bg-teal-500/20 flex items-center justify-center"><Network className="w-2 h-2 text-teal-400" /></div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="w-full h-1.5 bg-slate-100 rounded" />
                                            <div className="w-3/4 h-1.5 bg-slate-100 rounded" />
                                            <div className="w-1/2 h-1.5 bg-slate-100 rounded" />
                                        </div>
                                    </div>
                                </div>
                                <div className="h-1/2 p-6 flex flex-col">
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-4 text-teal-400">
                                        <Network className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900 mb-2">Networked Notes</h3>
                                    <p className="text-sm text-slate-600 leading-relaxed">
                                        Connect ideas effortlessly with bi-directional linking. Build a knowledge graph that grows.
                                    </p>
                                </div>
                            </div>
                        </FadeDown>

                        {/* Feature 2 */}
                        <FadeDown delay={0.2}>
                            <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden flex flex-col h-[400px] group hover:border-slate-300 transition-colors shadow-xl">
                                <div className="h-1/2 bg-slate-50 relative flex items-center justify-center overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 to-transparent" />
                                    <div className="relative w-48 h-32 bg-white border border-slate-200 rounded-xl p-4 shadow-lg transform group-hover:-translate-y-2 transition-transform duration-500 flex items-center justify-center">
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(6,182,212,0.1),_transparent)] pointer-events-none transform-gpu" />
                                        <div className="w-16 h-16 rounded-full border border-cyan-500/30 flex items-center justify-center relative">
                                            <div className="absolute inset-0 rounded-full border border-cyan-500/10 animate-[ping_3s_infinite]" />
                                            <Lock className="w-6 h-6 text-cyan-400" />
                                        </div>
                                    </div>
                                </div>
                                <div className="h-1/2 p-6 flex flex-col">
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-4 text-cyan-400">
                                        <Lock className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900 mb-2">E2E Encryption</h3>
                                    <p className="text-sm text-slate-600 leading-relaxed">
                                        Your thoughts are private. Encrypted on device before reaching servers.
                                    </p>
                                </div>
                            </div>
                        </FadeDown>

                        {/* Feature 3 */}
                        <FadeDown delay={0.3}>
                            <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden flex flex-col h-[400px] group hover:border-slate-300 transition-colors shadow-xl">
                                <div className="h-1/2 bg-slate-50 relative flex items-center justify-center overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-b from-teal-500/10 to-transparent" />
                                    <div className="relative w-48 h-32 bg-white border border-slate-200 rounded-xl p-4 shadow-lg transform group-hover:rotate-2 transition-transform duration-500 flex flex-col gap-3">
                                        <div className="w-full h-8 rounded bg-slate-50 flex items-center px-2 gap-2">
                                            <Cpu className="w-3 h-3 text-teal-400" />
                                            <div className="w-16 h-1 bg-slate-200 rounded" />
                                        </div>
                                        <div className="flex-1 rounded border border-teal-500/20 bg-teal-500/5 p-2 space-y-1.5">
                                            <div className="w-full h-1 bg-teal-400/30 rounded" />
                                            <div className="w-5/6 h-1 bg-teal-400/30 rounded" />
                                            <div className="w-4/5 h-1 bg-teal-400/30 rounded" />
                                        </div>
                                    </div>
                                </div>
                                <div className="h-1/2 p-6 flex flex-col">
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-4 text-teal-400">
                                        <Sparkles className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900 mb-2">AI Assistant</h3>
                                    <p className="text-sm text-slate-600 leading-relaxed">
                                        Summarize long meetings and brainstorm ideas with deeply integrated AI.
                                    </p>
                                </div>
                            </div>
                        </FadeDown>

                        {/* Feature 4 (Spans 2 columns) */}
                        <FadeDown delay={0.4} className="lg:col-span-2">
                            <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden flex flex-col sm:flex-row h-auto sm:h-[300px] group hover:border-slate-300 transition-colors shadow-xl">
                                <div className="sm:w-1/2 h-48 sm:h-full bg-slate-50 relative flex items-center justify-center overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-yellow-500/10" />
                                    <div className="relative w-64 h-40 bg-white border border-slate-200 rounded-xl shadow-lg p-3 flex flex-col transform group-hover:scale-105 transition-transform duration-500">
                                        <div className="flex gap-2 mb-2">
                                            <div className="w-12 h-6 bg-slate-100 rounded border border-slate-300 flex items-center justify-center text-[8px] font-mono text-slate-600">⌘ K</div>
                                            <div className="flex-1 h-6 bg-slate-50 rounded border border-slate-200 flex items-center px-2">
                                                <div className="w-1 h-3 bg-yellow-400 animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="flex-1 bg-slate-50 rounded border border-slate-200 mt-2 p-2 space-y-2">
                                            <div className="flex items-center gap-2 text-[8px] text-slate-500"><div className="w-2 h-2 bg-slate-100 rounded" /> Create new note</div>
                                            <div className="flex items-center gap-2 text-[8px] text-slate-500"><div className="w-2 h-2 bg-slate-100 rounded" /> Search files</div>
                                            <div className="flex items-center gap-2 text-[8px] text-slate-500"><div className="w-2 h-2 bg-slate-100 rounded" /> Change theme</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="sm:w-1/2 p-8 sm:p-10 flex flex-col justify-center">
                                    <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center mb-6 text-yellow-400">
                                        <Zap className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-slate-900 mb-3">Keyboard First Design</h3>
                                    <p className="text-base text-slate-600 leading-relaxed">
                                        Navigate the entire application, create notes, and execute commands without ever touching your mouse. Built for absolute speed.
                                    </p>
                                </div>
                            </div>
                        </FadeDown>

                        {/* Feature 5 */}
                        <FadeDown delay={0.5}>
                            <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden flex flex-col h-[300px] group hover:border-slate-300 transition-colors shadow-xl">
                                <div className="h-1/2 bg-slate-50 relative flex items-center justify-center overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-b from-green-500/10 to-transparent" />
                                    <div className="relative flex items-center gap-4 transform group-hover:-translate-y-1 transition-transform duration-500">
                                        <div className="w-12 h-16 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-lg relative">
                                            <Smartphone className="w-4 h-4 text-slate-500" />
                                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-white animate-pulse" />
                                        </div>
                                        <div className="h-[1px] w-8 bg-slate-200" />
                                        <div className="w-16 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-lg relative">
                                            <Globe className="w-4 h-4 text-slate-500" />
                                        </div>
                                    </div>
                                </div>
                                <div className="h-1/2 p-6 flex flex-col justify-center">
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-3 text-green-400">
                                        <Smartphone className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 mb-1">Offline Ready</h3>
                                    <p className="text-sm text-slate-600 leading-relaxed">
                                        Work seamlessly on airplanes. Changes sync instantly when back online.
                                    </p>
                                </div>
                            </div>
                        </FadeDown>

                    </div>
                </div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[150vw] max-w-[1800px] h-[500px] bg-[radial-gradient(ellipse_at_bottom,_rgba(20,184,166,0.08)_0%,_transparent_60%)] pointer-events-none z-0 transform-gpu will-change-transform" />
            </section>

            {/* 5. HOW IT WORKS */}
            <section id="how-it-works" className="py-32 px-6 bg-white relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150vw] max-w-[1800px] h-[500px] bg-[radial-gradient(ellipse_at_top,_rgba(20,184,166,0.08)_0%,_transparent_60%)] pointer-events-none z-0 transform-gpu will-change-transform" />
                <div className="max-w-7xl mx-auto">
                    <FadeDown>
                        <div className="text-center mb-32">
                            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                                How it works.
                            </h2>
                            <p className="text-slate-600 max-w-2xl mx-auto text-lg">
                                Seamlessly integrate into your daily routine without friction.
                            </p>
                        </div>
                    </FadeDown>

                    {/* Step 1 */}
                    <div className="flex flex-col lg:flex-row items-center gap-20 mb-48">
                        <div className="flex-1 order-1 lg:order-1">
                            <FadeDown>
                                <div className="max-w-lg">
                                    <div className="flex items-center gap-3 text-teal-400 mb-6">
                                        <Sparkles className="w-6 h-6" />
                                        <span className="text-sm font-semibold uppercase tracking-widest">Step 01</span>
                                    </div>
                                    <h3 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                                        Capture instantly
                                    </h3>
                                    <p className="text-slate-600 text-lg leading-relaxed mb-8">
                                        Use our global quick-capture shortcut to jot down ideas from anywhere on your computer. Never lose a fleeting thought again.
                                    </p>
                                    <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 w-fit">
                                        <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-100 text-xs font-mono text-slate-700">
                                            <kbd className="opacity-50">⌥</kbd> <kbd>Space</kbd>
                                        </div>
                                        <span className="text-sm text-slate-600">Quick Capture Shortcut</span>
                                    </div>
                                </div>
                            </FadeDown>
                        </div>
                        <div className="flex-1 order-2 lg:order-2 w-full" style={{ perspective: '1200px' }}>
                            <motion.div
                                initial={{ rotateY: -10, rotateX: 5, opacity: 0, y: 40 }}
                                whileInView={{ rotateY: 0, rotateX: 0, opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-100px" }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                                className="relative aspect-video rounded-2xl bg-slate-50 border border-slate-200 p-8 flex items-center justify-center shadow-2xl overflow-hidden group transform-gpu"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 via-transparent to-cyan-500/10 opacity-50 transform-gpu" />

                                <div className="w-full flex justify-center items-center overflow-hidden">
                                    <div className="transform scale-75 origin-center sm:scale-100 w-full max-w-md">
                                        <div className="relative w-full bg-white border border-slate-200 rounded-2xl shadow-[0_0_50px_rgba(15,23,42,0.10)] p-6 transform group-hover:scale-[1.02] transition-transform duration-500">
                                            <div className="absolute -top-12 right-0 flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 backdrop-blur-md transform-gpu">
                                                <div className="w-6 h-6 rounded bg-teal-500 flex items-center justify-center shadow-[0_0_10px_rgba(20,184,166,0.5)]">
                                                    <LinkIcon className="w-3 h-3 text-slate-900" />
                                                </div>
                                                <span className="text-[10px] text-slate-600 font-medium">Web Clipper</span>
                                            </div>

                                            <div className="flex items-center justify-between mb-6">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-3 h-3 rounded-full bg-red-500/30 border border-red-500/50" />
                                                    <div className="w-3 h-3 rounded-full bg-yellow-500/30 border border-yellow-500/50" />
                                                    <div className="w-3 h-3 rounded-full bg-green-500/30 border border-green-500/50" />
                                                </div>
                                                <div className="px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-[10px] text-slate-500 font-mono">
                                                    Evergreen Capture
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="h-12 w-full bg-slate-50 border border-slate-200 rounded-xl flex items-center px-4 text-slate-700 text-sm">
                                                    <span className="opacity-50 italic">What's on your mind?</span>
                                                    <div className="ml-1 w-[1px] h-4 bg-teal-500 animate-pulse" />
                                                </div>
                                                <div className="flex gap-2">
                                                    <div className="h-8 px-4 bg-teal-500/20 border border-teal-500/30 rounded-lg flex items-center text-[10px] text-teal-300 font-medium">
                                                        #ideas
                                                    </div>
                                                    <div className="h-8 px-4 bg-cyan-500/20 border border-cyan-500/30 rounded-lg flex items-center text-[10px] text-cyan-300 font-medium">
                                                        #project-alpha
                                                    </div>
                                                    <button className="h-8 px-4 ml-auto bg-slate-900 text-white rounded-lg text-[10px] font-bold hover:bg-slate-700 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                                                        Save Note
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                                    <span className="text-[10px]">Syncing to Cloud</span>
                                                </div>
                                                <div className="flex -space-x-2">
                                                    {[1, 2, 3].map((i) => (
                                                        <div key={i} className="w-6 h-6 rounded-full border-2 border-slate-200 bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-600">
                                                            {String.fromCharCode(64 + i)}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex flex-col lg:flex-row items-center gap-20 mb-48">
                        <div className="flex-1 order-2 lg:order-1 w-full" style={{ perspective: '1200px' }}>
                            <motion.div
                                initial={{ rotateY: 10, rotateX: 5, opacity: 0, y: 40 }}
                                whileInView={{ rotateY: 0, rotateX: 0, opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-100px" }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                                className="relative aspect-video rounded-2xl bg-slate-50 border border-slate-200 p-8 flex items-center justify-center shadow-2xl overflow-hidden group transform-gpu"
                            >
                                <div className="absolute inset-0 bg-gradient-to-bl from-cyan-500/10 via-transparent to-teal-500/10 opacity-50 transform-gpu" />

                                <div className="w-full h-full flex justify-center items-center overflow-hidden">
                                    <div className="transform scale-75 origin-center sm:scale-100 relative w-full h-full flex items-center justify-center">
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-[300px] h-[300px] border border-slate-100 rounded-full animate-[spin_30s_linear_infinite]" />
                                            <div className="w-[150px] h-[150px] border border-slate-100 rounded-full absolute animate-[spin_20s_linear_infinite_reverse]" />
                                        </div>

                                        <div className="relative z-10 flex items-center justify-center">
                                            <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-300 backdrop-blur-xl flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform duration-500 relative transform-gpu">
                                                <div className="absolute inset-0 bg-slate-100 rounded-2xl animate-ping opacity-20" />
                                                <FileText className="w-8 h-8 text-slate-900" />
                                            </div>

                                            {[
                                                { x: -110, y: -90, icon: Sparkles, color: 'text-teal-400', label: 'Idea' },
                                                { x: 130, y: -50, icon: Hash, color: 'text-cyan-400', label: 'Tag' },
                                                { x: -90, y: 110, icon: LinkIcon, color: 'text-slate-500', label: 'Ref' },
                                                { x: 110, y: 100, icon: Zap, color: 'text-yellow-400', label: 'Action' },
                                                { x: 0, y: -140, icon: MessageSquare, color: 'text-teal-500', label: 'Comment' },
                                                { x: 150, y: 60, icon: Globe, color: 'text-cyan-500', label: 'Public' },
                                            ].map((node, i) => (
                                                <div
                                                    key={i}
                                                    className="absolute w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 backdrop-blur-md flex flex-col items-center justify-center shadow-xl group/node transform-gpu"
                                                    style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
                                                >
                                                    <node.icon className={`w-5 h-5 ${node.color} group-hover/node:scale-110 transition-transform`} />
                                                    <span className="text-[6px] text-slate-500 mt-1 uppercase tracking-tighter">{node.label}</span>
                                                    <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" style={{ zIndex: -1 }}>
                                                        <motion.line
                                                            x1="50%" y1="50%"
                                                            x2={-node.x + 24} y2={-node.y + 24}
                                                            stroke="rgba(255,255,255,0.15)"
                                                            strokeWidth="1"
                                                            strokeDasharray="4 4"
                                                            initial={{ strokeDashoffset: 0 }}
                                                            animate={{ strokeDashoffset: -20 }}
                                                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                                            // 🔥 OPTIMIZATION: added willChange
                                                            style={{ willChange: 'stroke-dashoffset' }}
                                                        />
                                                    </svg>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/60 border border-slate-200 backdrop-blur-md transform-gpu">
                                            <Network className="w-3 h-3 text-cyan-400" />
                                            <span className="text-[10px] text-slate-600 font-mono">Graph View Active</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                        <div className="flex-1 order-1 lg:order-2">
                            <FadeDown>
                                <div className="max-w-lg lg:ml-auto">
                                    <div className="flex items-center gap-3 text-cyan-400 mb-6">
                                        <Network className="w-6 h-6" />
                                        <span className="text-sm font-semibold uppercase tracking-widest">Step 02</span>
                                    </div>
                                    <h3 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                                        Connect the dots
                                    </h3>
                                    <p className="text-slate-600 text-lg leading-relaxed mb-8">
                                        Link related notes together to build a personal knowledge base. Discover hidden connections and generate new insights.
                                    </p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 group hover:bg-slate-100 transition-colors">
                                            <div className="text-slate-900 font-bold mb-1 flex items-center gap-2">
                                                <LinkIcon className="w-3 h-3 text-teal-400" />
                                                [[Backlinks]]
                                            </div>
                                            <div className="text-xs text-slate-500">Automatic discovery</div>
                                        </div>
                                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 group hover:bg-slate-100 transition-colors">
                                            <div className="text-slate-900 font-bold mb-1 flex items-center gap-2">
                                                <Network className="w-3 h-3 text-cyan-400" />
                                                Graph View
                                            </div>
                                            <div className="text-xs text-slate-500">Visual mapping</div>
                                        </div>
                                    </div>
                                </div>
                            </FadeDown>
                        </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex flex-col lg:flex-row items-center gap-20 mb-48">
                        <div className="flex-1 order-1 lg:order-1">
                            <FadeDown>
                                <div className="max-w-lg">
                                    <div className="flex items-center gap-3 text-teal-400 mb-6">
                                        <Users className="w-6 h-6" />
                                        <span className="text-sm font-semibold uppercase tracking-widest">Step 03</span>
                                    </div>
                                    <h3 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                                        Collaborate in real-time
                                    </h3>
                                    <p className="text-slate-600 text-lg leading-relaxed mb-8">
                                        Share workspaces with your team and edit notes together. See cursors fly across the screen with zero latency.
                                    </p>
                                    <div className="flex -space-x-3">
                                        {[1, 2, 3, 4, 5].map((i) => (
                                            <div key={i} className={`w-10 h-10 rounded-full border-2 border-white bg-gradient-to-br ${i % 2 === 0 ? 'from-teal-500 to-teal-600' : 'from-cyan-400 to-blue-500'} flex items-center justify-center text-[10px] font-bold shadow-lg`}>
                                                {String.fromCharCode(64 + i)}
                                            </div>
                                        ))}
                                        <div className="w-10 h-10 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 backdrop-blur-sm transform-gpu">
                                            +18
                                        </div>
                                    </div>
                                </div>
                            </FadeDown>
                        </div>
                        <div className="flex-1 order-2 lg:order-2 w-full" style={{ perspective: '1200px' }}>
                            <motion.div
                                initial={{ rotateY: -10, rotateX: 5, opacity: 0, y: 40 }}
                                whileInView={{ rotateY: 0, rotateX: 0, opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-100px" }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                                className="relative aspect-video rounded-2xl bg-slate-50 border border-slate-200 p-8 flex items-center justify-center shadow-2xl overflow-hidden group transform-gpu"
                            >
                                <div className="absolute inset-0 bg-gradient-to-tr from-teal-500/10 via-transparent to-cyan-500/10 opacity-50 transform-gpu" />

                                <div className="w-full h-full flex justify-center items-center overflow-hidden">
                                    <div className="transform scale-75 origin-center sm:scale-100 w-full h-full">
                                        <div className="relative w-full h-full bg-white border border-slate-200 rounded-2xl shadow-2xl p-8 flex flex-col group-hover:translate-y-[-4px] transition-transform duration-500">
                                            <div className="flex items-center gap-4 mb-8">
                                                <div className="w-12 h-6 bg-slate-100 rounded-lg" />
                                                <div className="ml-auto flex gap-2">
                                                    <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200" />
                                                    <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200" />
                                                </div>
                                            </div>
                                            <div className="space-y-4 relative">
                                                <div className="w-full h-4 bg-slate-50 rounded" />
                                                <div className="w-5/6 h-4 bg-slate-50 rounded" />
                                                <div className="w-4/5 h-4 bg-slate-50 rounded relative">
                                                    <div className="absolute inset-0 bg-teal-500/10 rounded-sm" />
                                                    <div className="absolute -top-1 left-12 flex flex-col items-start animate-bounce">
                                                        <MousePointer2 className="w-4 h-4 text-teal-500 fill-teal-500 drop-shadow-[0_0_5px_rgba(20,184,166,0.5)]" />
                                                        <div className="bg-teal-500 text-white text-[8px] px-1.5 py-0.5 rounded-sm font-bold shadow-lg">Sarah</div>
                                                    </div>
                                                </div>
                                                <div className="w-full h-4 bg-slate-50 rounded" />
                                                <div className="w-2/3 h-4 bg-slate-50 rounded relative">
                                                    <div className="absolute -top-1 left-14 flex flex-col items-start animate-pulse">
                                                        <MousePointer2 className="w-4 h-4 text-cyan-500 fill-cyan-500 drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]" />
                                                        <div className="bg-cyan-500 text-white text-[8px] px-1.5 py-0.5 rounded-sm font-bold shadow-lg flex items-center gap-1">
                                                            Alex
                                                            <div className="flex gap-0.5">
                                                                <div className="w-0.5 h-0.5 bg-slate-900 rounded-full animate-bounce" />
                                                                <div className="w-0.5 h-0.5 bg-slate-900 rounded-full animate-bounce [animation-delay:0.2s]" />
                                                                <div className="w-0.5 h-0.5 bg-slate-900 rounded-full animate-bounce [animation-delay:0.4s]" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="w-3/4 h-4 bg-slate-50 rounded relative">
                                                    <div className="absolute -top-1 right-14 flex flex-col items-start">
                                                        <MousePointer2 className="w-4 h-4 text-teal-500 fill-teal-500 drop-shadow-[0_0_5px_rgba(20,184,166,0.5)]" />
                                                        <div className="bg-teal-500 text-white text-[8px] px-1.5 py-0.5 rounded-sm font-bold shadow-lg">James</div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="absolute bottom-8 right-8 w-52 bg-slate-50 border border-slate-200 backdrop-blur-xl rounded-xl p-4 shadow-2xl transform rotate-2 group-hover:rotate-0 transition-transform duration-500 transform-gpu">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <div className="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center text-[8px] font-bold text-white shadow-[0_0_10px_rgba(20,184,166,0.5)]">S</div>
                                                    <span className="text-[10px] font-bold text-slate-800">Sarah</span>
                                                    <span className="text-[8px] text-slate-500 ml-auto">2m ago</span>
                                                </div>
                                                <p className="text-[10px] text-slate-600 leading-relaxed">
                                                    Should we link this to the Q3 strategy note?
                                                </p>
                                                <div className="mt-3 flex items-center gap-2">
                                                    <div className="flex-1 px-2 py-1 rounded bg-slate-50 border border-slate-200 text-[8px] text-slate-500">Reply...</div>
                                                    <div className="flex -space-x-1">
                                                        <div className="w-4 h-4 rounded-full bg-cyan-500 border border-white" />
                                                        <div className="w-4 h-4 rounded-full bg-teal-500 border border-white" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>

                    {/* Step 4 */}
                    <div className="flex flex-col lg:flex-row items-center gap-20">
                        <div className="flex-1 order-2 lg:order-1 w-full" style={{ perspective: '1200px' }}>
                            <motion.div
                                initial={{ rotateY: 10, rotateX: 5, opacity: 0, y: 40 }}
                                whileInView={{ rotateY: 0, rotateX: 0, opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-100px" }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                                className="relative aspect-video rounded-2xl bg-slate-50 border border-slate-200 p-8 flex items-center justify-center shadow-2xl overflow-hidden group transform-gpu"
                            >
                                <div className="absolute inset-0 bg-gradient-to-bl from-cyan-500/10 via-transparent to-teal-500/10 opacity-50 transform-gpu" />

                                <div className="w-full h-full flex justify-center items-center overflow-hidden">
                                    <div className="transform scale-75 origin-center sm:scale-100 w-full h-full">
                                        <div className="relative w-full h-full bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col group-hover:scale-[1.02] transition-transform duration-500">
                                            <div className="h-12 bg-gray-50 border-b border-gray-100 flex items-center px-4 gap-4">
                                                <div className="flex gap-1.5">
                                                    <div className="w-2 h-2 rounded-full bg-red-400" />
                                                    <div className="w-2 h-2 rounded-full bg-yellow-400" />
                                                    <div className="w-2 h-2 rounded-full bg-green-400" />
                                                </div>
                                                <div className="flex-1 h-7 bg-white border border-gray-200 rounded-md flex items-center px-3 text-[9px] text-gray-400 font-mono">
                                                    evergreen.so/blog/future-of-work
                                                </div>
                                            </div>
                                            <div className="p-10 flex-1 bg-white relative">
                                                <div className="absolute top-6 right-6 px-2 py-1 rounded bg-green-500/10 border border-green-500/20 text-[8px] text-green-600 font-bold flex items-center gap-1">
                                                    <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                                                    LIVE
                                                </div>
                                                <div className="max-w-xs mx-auto">
                                                    <div className="w-24 h-2 bg-teal-500/20 rounded mb-4" />
                                                    <div className="w-full h-10 bg-gray-900 rounded-md mb-8" />
                                                    <div className="space-y-4">
                                                        <div className="w-full h-3 bg-gray-100 rounded" />
                                                        <div className="w-full h-3 bg-gray-100 rounded" />
                                                        <div className="w-4/5 h-3 bg-gray-100 rounded" />
                                                        <div className="w-full h-3 bg-gray-100 rounded" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="absolute top-12 left-12 -translate-x-12 -translate-y-12 w-72 bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-6 backdrop-blur-xl transform-gpu">
                                                <div className="flex items-center gap-4 mb-6">
                                                    <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                                                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold text-white">Site Published</div>
                                                        <div className="text-[9px] text-gray-500">Live at evergreen.so/blog</div>
                                                    </div>
                                                </div>
                                                <div className="space-y-3">
                                                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            whileInView={{ width: "100%" }}
                                                            transition={{ duration: 1.5, ease: "easeInOut" }}
                                                            className="h-full bg-green-500 transform-gpu"
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10">
                                                        <span className="text-[9px] text-gray-400">Custom Domain</span>
                                                        <span className="text-[9px] text-white font-mono bg-white/10 px-1.5 py-0.5 rounded">active</span>
                                                    </div>
                                                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10">
                                                        <span className="text-[9px] text-gray-400">SEO Indexing</span>
                                                        <span className="text-[9px] text-white font-mono bg-white/10 px-1.5 py-0.5 rounded">enabled</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                        <div className="flex-1 order-1 lg:order-2">
                            <FadeDown>
                                <div className="max-w-lg lg:ml-auto">
                                    <div className="flex items-center gap-3 text-cyan-400 mb-6">
                                        <Globe className="w-6 h-6" />
                                        <span className="text-sm font-semibold uppercase tracking-widest">Step 04</span>
                                    </div>
                                    <h3 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                                        Publish to the web
                                    </h3>
                                    <p className="text-slate-600 text-lg leading-relaxed mb-8">
                                        Turn your notes into a beautiful public blog, documentation site, or personal wiki with a single click.
                                    </p>
                                    <button className="group flex items-center gap-3 px-8 py-4 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700 transition-all hover:scale-105 active:scale-95 shadow-xl">
                                        <Globe className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                                        Publish Now
                                    </button>
                                </div>
                            </FadeDown>
                        </div>
                    </div>
                </div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[150vw] max-w-[1800px] h-[500px] bg-[radial-gradient(ellipse_at_bottom,_rgba(6,182,212,0.08)_0%,_transparent_60%)] pointer-events-none z-0 transform-gpu will-change-transform" />
            </section>

            {/* 6.7. ADVANCED CAPABILITIES */}
            <section id="advanced-capabilities" className="py-32 px-6 relative bg-white">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150vw] max-w-[1800px] h-[500px] bg-[radial-gradient(ellipse_at_top,_rgba(6,182,212,0.08)_0%,_transparent_60%)] pointer-events-none z-0 transform-gpu will-change-transform" />
                <div className="max-w-6xl mx-auto relative z-10">
                    <FadeDown>
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                                Advanced capabilities.
                            </h2>
                            <p className="text-slate-600 text-lg max-w-2xl mx-auto">
                                Leverage smart AI and data-driven insights to boost your productivity.
                            </p>
                        </div>
                    </FadeDown>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-5">
                            <FadeDown className="h-full">
                                <div className="bg-white border border-slate-200 rounded-3xl p-8 flex flex-col h-full relative overflow-hidden group">
                                    <div className="relative z-10 mb-8">
                                        <h3 className="text-2xl font-bold text-slate-900 mb-2">Smart Auto-Organization</h3>
                                        <p className="text-slate-600">Put your note tagging on auto-pilot.</p>
                                    </div>

                                    <div className="flex-1 space-y-3 relative z-10">
                                        {[
                                            { title: 'Project Alpha draft', time: '2m ago', status: 'Organized', color: 'text-teal-400' },
                                            { title: 'Meeting with team', time: '1h ago', status: 'Synced', color: 'text-cyan-400' },
                                            { title: 'Research notes: AI', time: '3h ago', status: 'Organized', color: 'text-teal-400' },
                                            { title: 'Weekly sync summary', time: 'Yesterday', status: 'Archived', color: 'text-slate-500' },
                                        ].map((note, i) => (
                                            <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between group-hover:bg-slate-100 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-2 rounded-full bg-slate-200" />
                                                    <span className="text-sm font-medium text-slate-800">{note.title}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-[10px] text-slate-500">{note.time}</span>
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${note.color}`}>{note.status}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Glow optimized */}
                                    <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-teal-500/20 blur-3xl pointer-events-none transform-gpu will-change-transform" />
                                </div>
                            </FadeDown>
                        </div>

                        <div className="lg:col-span-7 flex flex-col gap-6">
                            <FadeDown>
                                <div className="bg-white border border-slate-200 rounded-3xl p-8 flex flex-col sm:flex-row items-center gap-8 relative overflow-hidden group h-full">
                                    <div className="relative w-32 h-32 flex-shrink-0">
                                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl rotate-6 opacity-20 transform-gpu" />
                                        <div className="absolute inset-2 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl -rotate-3 opacity-40 transform-gpu" />
                                        <div className="absolute inset-4 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg transform-gpu">
                                            <LinkIcon className="w-8 h-8 text-slate-900" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-slate-900 mb-2">All-in-one integrations</h3>
                                        <p className="text-slate-600">Connect to 70+ apps in one click.</p>
                                    </div>
                                </div>
                            </FadeDown>

                            <FadeDown>
                                <div className="bg-white border border-slate-200 rounded-3xl p-8 flex flex-col h-full relative overflow-hidden group">
                                    <div className="mb-8">
                                        <h3 className="text-2xl font-bold text-slate-900 mb-2">Knowledge Performance</h3>
                                        <p className="text-slate-600">Keep your second brain growing.</p>
                                    </div>
                                    <div className="flex-1 mt-8 flex flex-col justify-end">
                                        <div className="flex items-end justify-between h-32 w-full gap-2">
                                            {[40, 70, 45, 90, 65, 85, 50].map((height, i) => {
                                                const isPeak = height >= 85;
                                                const colorClass = i < 2 ? 'from-cyan-500 to-blue-500' : i < 5 ? 'from-cyan-600 to-teal-500' : 'from-teal-500 to-teal-500';
                                                const glowClass = i < 2 ? 'shadow-[0_0_15px_rgba(6,182,212,0.5)]' : i < 5 ? 'shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'shadow-[0_0_15px_rgba(217,70,239,0.5)]';
                                                return (
                                                    <div key={i} className="w-full relative group flex justify-center h-full items-end">
                                                        <motion.div
                                                            initial={{ height: 0 }}
                                                            whileInView={{ height: `${height}%` }}
                                                            viewport={{ once: true }}
                                                            transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
                                                            className={`w-full max-w-[24px] rounded-t-sm bg-gradient-to-t ${colorClass} ${glowClass} ${isPeak ? 'opacity-100' : 'opacity-80'} transform-gpu`}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="flex justify-between items-center mt-4 text-[10px] text-slate-500 font-mono font-medium uppercase tracking-widest">
                                            <span>Mon</span><span>Wed</span><span>Fri</span><span>Sun</span>
                                        </div>
                                    </div>
                                </div>
                            </FadeDown>
                        </div>
                    </div>
                </div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[150vw] max-w-[1800px] h-[500px] bg-[radial-gradient(ellipse_at_bottom,_rgba(6,182,212,0.08)_0%,_transparent_60%)] pointer-events-none z-0 transform-gpu will-change-transform" />
            </section>

            {/* 5.5. TESTIMONIALS */}
            <section className="py-24 md:py-32 px-6 relative bg-white min-h-[50vh] h-auto">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150vw] max-w-[1800px] h-[500px] bg-[radial-gradient(ellipse_at_top,_rgba(6,182,212,0.08)_0%,_transparent_60%)] pointer-events-none z-0 transform-gpu will-change-transform" />
                <div className="max-w-7xl mx-auto relative z-10">
                    <FadeDown>
                        <div className="text-center mx-auto mb-16">
                            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                                What other professionals say
                            </h2>
                            <p className="text-slate-600 text-lg max-w-2xl mx-auto">
                                Join a community of thinkers who are redefining their productivity.
                            </p>
                        </div>
                    </FadeDown>

                    <div className="max-w-5xl mx-auto bg-slate-50 border border-slate-200 rounded-3xl overflow-hidden shadow-2xl relative min-h-[50vh] h-auto">
                        <div className="grid grid-cols-1 lg:grid-cols-12">
                            <div className="lg:col-span-8 px-6 py-24 md:p-16 flex flex-col items-center justify-center md:items-start md:justify-between relative overflow-hidden min-h-[50vh] h-auto text-center md:text-left">
                                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(20,184,166,0.15),_transparent_70%)] pointer-events-none z-0 transform-gpu will-change-transform" />
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={testimonialIndex}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        transition={{ duration: 0.4, ease: "easeOut" }}
                                        className="relative z-10 w-full transform-gpu"
                                    >
                                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 md:left-auto md:-translate-x-0 md:-left-6 text-teal-500/20 text-8xl font-serif">"</div>
                                        <p className="text-xl md:text-2xl text-slate-900 font-medium leading-relaxed relative z-10 text-center md:text-left">
                                            "{testimonials[testimonialIndex].quote}"
                                        </p>
                                    </motion.div>
                                </AnimatePresence>

                                <div className="flex items-center justify-center md:justify-start gap-4 mt-12 relative z-10 w-full">
                                    <button onClick={prevTestimonial} className="w-12 h-12 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-900 hover:bg-slate-100 transition-all active:scale-95">
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <button onClick={nextTestimonial} className="w-12 h-12 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-900 hover:bg-slate-100 transition-all active:scale-95">
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="lg:col-span-4 px-6 py-24 md:p-16 bg-white/60 border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col items-center justify-center md:items-start md:justify-between relative min-h-[50vh] h-auto">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={testimonialIndex}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 1.1 }}
                                        transition={{ duration: 0.4, ease: "easeOut" }}
                                        className="flex flex-col items-center md:items-start w-full transform-gpu"
                                    >
                                        <img
                                            src={testimonials[testimonialIndex].avatar}
                                            alt={testimonials[testimonialIndex].name}
                                            className="w-20 h-20 rounded-full bg-slate-100 border-2 border-teal-500/30 mb-6 object-cover shadow-[0_0_20px_rgba(20,184,166,0.2)]"
                                            referrerPolicy="no-referrer"
                                        />
                                        <h4 className="text-xl font-bold text-slate-900 mb-1 text-center md:text-left">
                                            {testimonials[testimonialIndex].name}
                                        </h4>
                                        <p className="text-sm text-slate-500 text-center md:text-left">
                                            {testimonials[testimonialIndex].role}
                                        </p>
                                    </motion.div>
                                </AnimatePresence>

                                <div className="flex justify-center md:justify-start gap-2 mt-8 lg:mt-0 w-full">
                                    {testimonials.map((_, i) => (
                                        <div
                                            key={i}
                                            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === testimonialIndex ? 'w-4 bg-teal-500' : 'bg-slate-200'}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[150vw] max-w-[1800px] h-[500px] bg-[radial-gradient(ellipse_at_bottom,_rgba(20,184,166,0.08)_0%,_transparent_60%)] pointer-events-none z-0 transform-gpu will-change-transform" />
            </section>

            {/* 6. PRICING */}
            <section id="pricing" className="py-32 px-6 relative bg-white">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150vw] max-w-[1800px] h-[500px] bg-[radial-gradient(ellipse_at_top,_rgba(20,184,166,0.08)_0%,_transparent_60%)] pointer-events-none z-0 transform-gpu will-change-transform" />
                <div className="max-w-6xl mx-auto relative z-10">
                    <FadeDown>
                        <div className="text-center mb-20">
                            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                                Simple, transparent pricing.
                            </h2>
                            <p className="text-slate-600 max-w-2xl mx-auto text-lg">
                                Start for free, upgrade when you need more power.
                            </p>
                        </div>
                    </FadeDown>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-md lg:max-w-none mx-auto">
                        <FadeDown delay={0.1}>
                            <div className="p-8 rounded-3xl border border-slate-200 bg-slate-50 flex flex-col h-full">
                                <h3 className="text-2xl font-bold text-slate-900 mb-2">Starter</h3>
                                <p className="text-slate-600 mb-6">Perfect for individuals getting started.</p>
                                <div className="mb-8">
                                    <span className="text-5xl font-bold text-slate-900">$0</span>
                                    <span className="text-slate-500">/month</span>
                                </div>
                                <ul className="space-y-4 mb-8 flex-1">
                                    <li className="flex items-center gap-3 text-slate-700"><CheckCircle2 className="w-5 h-5 text-slate-500" /> Up to 1,000 notes</li>
                                    <li className="flex items-center gap-3 text-slate-700"><CheckCircle2 className="w-5 h-5 text-slate-500" /> Basic search</li>
                                    <li className="flex items-center gap-3 text-slate-700"><CheckCircle2 className="w-5 h-5 text-slate-500" /> Web & Desktop apps</li>
                                    <li className="flex items-center gap-3 text-slate-500"><CheckCircle2 className="w-5 h-5 text-slate-300" /> <span className="line-through">AI Assistant</span></li>
                                </ul>
                                <button className="w-full bg-slate-100 text-slate-900 px-6 py-3 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
                                    Get Started Free
                                </button>
                            </div>
                        </FadeDown>

                        <FadeDown delay={0.2}>
                            <div className="p-8 rounded-3xl border border-teal-500/50 bg-slate-50 flex flex-col h-full relative shadow-[0_0_30px_rgba(20,184,166,0.15)]">
                                <div className="absolute top-0 right-8 transform -translate-y-1/2">
                                    <span className="bg-gradient-to-r from-teal-600 to-cyan-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                                        Most Popular
                                    </span>
                                </div>
                                <h3 className="text-2xl font-bold text-slate-900 mb-2">Pro</h3>
                                <p className="text-slate-600 mb-6">For power users and professionals.</p>
                                <div className="mb-8">
                                    <span className="text-5xl font-bold text-slate-900">$12</span>
                                    <span className="text-slate-500">/month</span>
                                </div>
                                <ul className="space-y-4 mb-8 flex-1">
                                    <li className="flex items-center gap-3 text-slate-700"><CheckCircle2 className="w-5 h-5 text-teal-500" /> Unlimited notes</li>
                                    <li className="flex items-center gap-3 text-slate-700"><CheckCircle2 className="w-5 h-5 text-teal-500" /> Advanced search & filters</li>
                                    <li className="flex items-center gap-3 text-slate-700"><CheckCircle2 className="w-5 h-5 text-teal-500" /> Priority support</li>
                                    <li className="flex items-center gap-3 text-slate-700"><CheckCircle2 className="w-5 h-5 text-teal-500" /> Unlimited AI Assistant</li>
                                </ul>
                                <button className="w-full bg-gradient-to-r from-teal-600 to-cyan-500 text-white px-6 py-3 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(20,184,166,0.3)]">
                                    Upgrade to Pro
                                </button>
                            </div>
                        </FadeDown>

                        <FadeDown delay={0.3}>
                            <div className="p-8 rounded-3xl border border-slate-200 bg-slate-50 flex flex-col h-full">
                                <h3 className="text-2xl font-bold text-slate-900 mb-2">Enterprise</h3>
                                <p className="text-slate-600 mb-6">For large teams and organizations.</p>
                                <div className="mb-8">
                                    <span className="text-5xl font-bold text-slate-900">$49</span>
                                    <span className="text-slate-500">/month</span>
                                </div>
                                <ul className="space-y-4 mb-8 flex-1">
                                    <li className="flex items-center gap-3 text-slate-700"><CheckCircle2 className="w-5 h-5 text-slate-500" /> Everything in Pro</li>
                                    <li className="flex items-center gap-3 text-slate-700"><CheckCircle2 className="w-5 h-5 text-slate-500" /> SAML SSO</li>
                                    <li className="flex items-center gap-3 text-slate-700"><CheckCircle2 className="w-5 h-5 text-slate-500" /> Advanced analytics</li>
                                    <li className="flex items-center gap-3 text-slate-700"><CheckCircle2 className="w-5 h-5 text-slate-500" /> Dedicated success manager</li>
                                </ul>
                                <button className="w-full bg-slate-100 text-slate-900 px-6 py-3 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
                                    Contact Sales
                                </button>
                            </div>
                        </FadeDown>
                    </div>
                </div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[150vw] max-w-[1800px] h-[500px] bg-[radial-gradient(ellipse_at_bottom,_rgba(6,182,212,0.08)_0%,_transparent_60%)] pointer-events-none z-0 transform-gpu will-change-transform" />
            </section>

            {/* 6.5. FAQ */}
            <section id="faq" className="py-32 px-6 relative bg-white">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150vw] max-w-[1800px] h-[500px] bg-[radial-gradient(ellipse_at_top,_rgba(6,182,212,0.08)_0%,_transparent_60%)] pointer-events-none z-0 transform-gpu will-change-transform" />
                <div className="max-w-7xl mx-auto relative z-10">
                    <FadeDown>
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6 bg-gradient-to-r from-slate-900 to-slate-500 bg-clip-text text-transparent">
                                Got questions?
                            </h2>
                            <p className="text-slate-600 text-lg">
                                Everything you need to know about Evergreen and how it works.
                            </p>
                        </div>
                    </FadeDown>

                    <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-10 max-w-3xl mx-auto shadow-2xl">
                        <div className="space-y-2">
                            {faqData.map((faq, index) => (
                                <div key={index}>
                                    <FadeDown delay={index * 0.1}>
                                        <div className="border-b border-slate-100 last:border-0">
                                            <button
                                                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                                                className="w-full text-left px-6 py-5 rounded-2xl hover:bg-slate-50 transition-colors duration-200 flex justify-between items-center group"
                                            >
                                                <span className="text-lg font-medium text-slate-800 group-hover:text-slate-900 transition-colors">
                                                    {faq.question}
                                                </span>
                                                <motion.div
                                                    animate={{ rotate: openIndex === index ? 180 : 0 }}
                                                    transition={{ duration: 0.3, ease: "easeInOut" }}
                                                    className="text-slate-500 group-hover:text-slate-900 transform-gpu"
                                                >
                                                    <ChevronDown className="w-5 h-5" />
                                                </motion.div>
                                            </button>
                                            <AnimatePresence>
                                                {openIndex === index && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.3, ease: "easeInOut" }}
                                                        className="overflow-hidden transform-gpu"
                                                    >
                                                        <p className="px-6 pb-6 text-slate-600 leading-relaxed">
                                                            {faq.answer}
                                                        </p>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </FadeDown>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Ambient Section Transition Glow */}
            <div className="relative w-full h-10 pointer-events-none flex justify-center z-0">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl h-64 bg-teal-500/10 blur-[120px] rounded-full transform-gpu will-change-transform pointer-events-none" />
            </div>

            {/* 7. BOTTOM CTA */}
            <section className="py-24 md:py-32 px-6 relative min-h-[50vh] h-auto">
                <div className="relative rounded-3xl bg-slate-50 border border-slate-200 px-6 py-24 md:p-20 overflow-hidden shadow-2xl max-w-5xl mx-auto min-h-[50vh] h-auto flex flex-col justify-center">
                    {/* Background Glow Effects optimized */}
                    <div className="absolute inset-0 bg-gradient-to-t from-teal-500/10 to-transparent blur-3xl -z-10 transform-gpu will-change-transform pointer-events-none" />

                    {/* Sharp Glowing Line at Bottom */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-[2px] bg-gradient-to-r from-transparent via-teal-500 to-transparent opacity-100 transform-gpu pointer-events-none" />

                    {/* Wide Ambient Glow under the Line optimized */}
                    <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-full h-48 bg-teal-600/40 blur-[100px] pointer-events-none transform-gpu will-change-transform" />

                    <div className="relative z-10 flex flex-col items-center text-center">
                        <FadeDown>
                            <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 mb-6">
                                Ready to upgrade your <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-600 to-teal-600">mind?</span>
                            </h2>
                            <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
                                Join thousands of professionals who use Evergreen to think better and write faster. Try it free for 14 days.
                            </p>

                            <form className="flex flex-col sm:flex-row gap-4 w-full max-w-xl mx-auto mb-6" onSubmit={(e) => e.preventDefault()}>
                                <input
                                    type="email"
                                    placeholder="Enter your company email"
                                    className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-6 py-4 focus:outline-none focus:border-teal-500 transition-colors placeholder:text-slate-400"
                                    required
                                />
                                <button
                                    type="submit"
                                    className="bg-gradient-to-r from-teal-600 to-cyan-500 text-white px-8 py-4 rounded-xl text-base font-medium hover:opacity-90 transition-opacity whitespace-nowrap shadow-[0_0_20px_rgba(20,184,166,0.4)]"
                                >
                                    Get 14 Days Free Trial
                                </button>
                            </form>

                            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                                <div className="flex gap-1 text-yellow-400">
                                    {[...Array(5)].map((_, i) => (
                                        <span key={i} className="text-xl leading-none">&#9733;</span>
                                    ))}
                                </div>
                                <span className="text-sm text-slate-600">Trusted by 10,000+ professionals</span>
                            </div>
                        </FadeDown>
                    </div>
                </div>
            </section>

            {/* Ambient Section Transition Glow */}
            <div className="relative w-full h-10 pointer-events-none flex justify-center z-0">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl h-64 bg-teal-500/10 blur-[120px] rounded-full transform-gpu will-change-transform pointer-events-none" />
            </div>

        </main>
    );
}
