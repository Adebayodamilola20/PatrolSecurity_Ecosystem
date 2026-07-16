// Vendored from the standalone Lumina marketing site (lumina-saas), rebranded
// to Evergreen and rebuilt around what the patrol platform actually does.
//
// The hero and its dashboard mockup are carried over untouched. Everything
// below it follows the information architecture common to guard-management
// sites: what it is -> who it's for -> the control room -> the guard app ->
// the client portal -> compliance -> why the old way fails -> pricing -> FAQ.
//
// The design language is ours throughout: FadeDown reveals, blurred teal
// glows, white cards on white, teal/cyan gradients.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import {
    ArrowRight, Sparkles, Lock, Network, Search, Smartphone, CheckCircle2, Shield, Home,
    BarChart2, Folder, Settings, ChevronDown, Bell, Plus, ArrowLeft, FileText,
    Link as LinkIcon, Hash, ArrowUpRight, Users, MessageSquare, MapPin, QrCode, Clock,
    Building2, Stethoscope, GraduationCap, Warehouse, CalendarDays, Camera, AlertTriangle, X,
    Activity, Radio, WifiOff, Map, BarChart3, Printer, ScanLine, ClipboardList, UserCheck,
    Siren, Fingerprint, FileCheck2, ShieldCheck, Navigation, TrendingUp, Eye
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

/* ------------------------------------------------------------------ content */

const TRUST = [
    { icon: Lock, title: 'Encrypted & audited', sub: 'Every action leaves a trail' },
    { icon: Navigation, title: 'GPS-verified', sub: 'Scans checked against the geofence' },
    { icon: WifiOff, title: 'Works offline', sub: 'Syncs when the guard is back online' },
    { icon: FileCheck2, title: 'Client-ready proof', sub: 'Reports your clients can open' },
];

const OVERVIEW = [
    { title: 'Patrol monitoring', body: 'Run guards, sites, patrols, incidents and reports from one control room.' },
    { title: 'Live guard tracking', body: 'See who is on duty on a live map, with GPS-backed movement history.' },
    { title: 'QR patrol verification', body: 'Checkpoint scans carry time, location and the guard who made them.' },
    { title: 'Panic alerts', body: 'One tap routes an emergency to your control room with GPS context.' },
];

const PILLARS = [
    {
        icon: Navigation,
        title: 'Real-time guard tracking',
        body: 'Live positions, movement history and clock-in photos tell you where field teams are during an active shift — not where they said they were.',
    },
    {
        icon: QrCode,
        title: 'Patrols, checkpoints and post orders',
        body: 'QR checkpoints verify patrol activity against a site geofence, and post orders pop on scan so the guard acknowledges them on the spot.',
    },
    {
        icon: FileCheck2,
        title: 'Incidents and proof of service',
        body: 'Photo-backed incident reports, handovers and pass-on logs replace scattered WhatsApp updates with an audit trail you can hand a client.',
    },
];

const INDUSTRIES = [
    { icon: Shield, title: 'Security companies', body: 'Guard management, patrol verification, incident reporting and control-room coordination.' },
    { icon: Home, title: 'Residential estates', body: 'Gate access control, patrol verification and incident logs for HOAs.' },
    { icon: Building2, title: 'Commercial property', body: 'Malls, office parks and industrial site security management.' },
    { icon: Stethoscope, title: 'Hospitals & clinics', body: 'Incident reporting, response coordination and audit trails.' },
    { icon: GraduationCap, title: 'Schools & campuses', body: 'Panic workflows, controlled access and incident tracking.' },
    { icon: Warehouse, title: 'Warehouses & industrial', body: 'Shift check-ins, patrol verification and truck movement logs.' },
    { icon: CalendarDays, title: 'Event security', body: 'Temporary operations with incidents, panic alerts and audit trails.' },
];

const CONTROL_ROOM_TABS = [
    { icon: BarChart3, label: 'Live monitoring', title: 'Security operations overview', body: 'Guards on duty, scans today, open alerts and response readiness in one view.' },
    { icon: Map, label: 'Live map', title: 'Every officer, live', body: 'Positions update as guards move, with breadcrumb history per shift.' },
    { icon: ScanLine, label: 'Patrol history', title: 'Every scan, verified', body: 'Filter by site, officer or date and open any scan for its GPS proof.' },
    { icon: AlertTriangle, label: 'Alerts', title: 'Missed patrols surface themselves', body: 'Checkpoints past their interval raise an alert before the client notices.' },
    { icon: FileText, label: 'Reports', title: 'Reports your clients can open', body: 'Daily activity and maintenance reports generate as PDFs, ready to send.' },
];

const TEAM_TABS = [
    { icon: Users, label: 'Personnel', title: 'Your whole roster', body: 'Roles, assignments and status for every officer on the account.' },
    { icon: MapPin, label: 'Live guard map', title: 'Who is where, right now', body: 'On-duty officers on a live map, scoped to the sites they are assigned.' },
    { icon: Clock, label: 'Timesheets', title: 'Hours that reconcile themselves', body: 'Clock-in and clock-out photos, GPS and totals per officer and shift.' },
    { icon: TrendingUp, label: 'Analytics', title: 'Performance you can act on', body: 'Patrol volume, verification rate and incidents over any period.' },
];

const SITE_TABS = [
    { icon: Building2, label: 'Locations', title: 'Every site you protect', body: 'Sites, their geofence and the patrol points inside each of them.' },
    { icon: QrCode, label: 'Checkpoints', title: 'QR points that prove presence', body: 'Each checkpoint carries its own interval and grace period.' },
    { icon: Printer, label: 'QR generator', title: 'Print and mount', body: 'Generate and download checkpoint QR codes ready for the wall.' },
    { icon: ClipboardList, label: 'Post orders', title: 'Instructions that must be read', body: 'Assign post orders to guards; they pop on scan and require acknowledgement.' },
    { icon: UserCheck, label: 'Access control', title: 'Visitors and vehicles', body: 'Log visitor entry and exit and truck movements at the gate.' },
];

const GUARD_APP = [
    { icon: Camera, title: 'Clock in with a photo', body: 'A shift starts with a photo and GPS, so attendance is never a debate.' },
    { icon: ScanLine, title: 'Scan checkpoints', body: 'Scan the QR at each point. Off-duty scans are refused, not recorded.' },
    { icon: ClipboardList, title: 'Post orders on scan', body: 'Instructions pop at the point and require acknowledgement before moving on.' },
    { icon: Siren, title: 'Panic and incidents', body: 'Raise an emergency or file a photo-backed incident from the same app.' },
];

const CLIENT_PORTAL = [
    { icon: Activity, title: 'Overview', body: 'Guards on duty, patrols today and last activity across their sites.' },
    { icon: ScanLine, title: 'Patrol activity', body: 'Every verified scan at their locations, with time and GPS status.' },
    { icon: MapPin, title: 'Locations', body: 'Their sites, the patrol points inside them, and history per point.' },
    { icon: FileText, title: 'Reports', body: 'Daily activity reports delivered as PDFs they can download.' },
];

const COMPLIANCE = [
    {
        icon: Fingerprint,
        title: 'Data protection',
        items: ['Photos stored as authorized links, never public URLs', 'Access scoped to the client who owns the record', 'GPS trails expire on a retention schedule'],
    },
    {
        icon: Lock,
        title: 'Operational controls',
        items: ['Rotating sessions with automatic idle lock-out', 'Role-based access for admins, supervisors and guards', 'Full audit log of every privileged action'],
    },
    {
        icon: ShieldCheck,
        title: 'Proof you can defend',
        items: ['Scans carry GPS, timestamp and the officer who made them', 'Incidents carry photos and severity', 'Reports generate from the record, not from memory'],
    },
];

const PROBLEMS = [
    { icon: MessageSquare, title: 'Patrol proof lives in WhatsApp', body: 'Real events get lost between random messages and non-stop chatter.' },
    { icon: Eye, title: 'No real visibility during a shift', body: 'Supervisors spend the day reconciling where teams are and what was actually done.' },
    { icon: Clock, title: 'Attendance is a debate', body: 'Without a photo and a location, a clock-in is just a claim.' },
    { icon: FileText, title: 'Reports get written from memory', body: 'Hours go into rebuilding a night that the system should already know.' },
    { icon: AlertTriangle, title: 'Clients only hear about failures', body: 'A missed patrol reaches the client before it reaches you.' },
];

const SOLUTIONS = [
    { icon: QrCode, title: 'Verified patrols', body: 'Every scan carries GPS, a timestamp and the officer — checked against the site geofence.' },
    { icon: Navigation, title: 'Live tracking and history', body: 'See the team during the shift and replay the movement trail afterwards.' },
    { icon: Camera, title: 'Photo-backed clock-ins', body: 'Shifts start with a photo and a location. Off-duty scans are refused outright.' },
    { icon: FileCheck2, title: 'Reports that generate themselves', body: 'Daily activity PDFs build from the records your guards already created.' },
    { icon: Users, title: 'A portal your clients can open', body: 'Clients see patrol activity at their own sites — without ever seeing guard identities.' },
];

const FAQ_DATA = [
    {
        question: 'How do you know a guard actually walked the patrol?',
        answer: 'Every checkpoint scan is verified against the site geofence and stored with GPS coordinates, a timestamp and the officer who made it. A guard who has not clocked in cannot scan at all — the scan is refused and never reaches a dashboard.',
    },
    {
        question: 'Does the guard app work without signal?',
        answer: 'Yes. Guards can clock in, scan checkpoints and file incidents offline. Everything syncs once the device is back online, and the original capture time is preserved rather than the upload time.',
    },
    {
        question: 'What do our clients actually see?',
        answer: 'Clients get their own portal showing patrol activity, locations and reports for their sites only. Guard identities are never exposed to clients — they see coverage numbers and verified activity, not names.',
    },
    {
        question: 'How are incident photos stored and protected?',
        answer: 'Photos are uploaded straight to object storage and referenced by an ID, never a permanent public URL. Viewing one mints a short-lived authorized link scoped to the person asking, and access is checked against the client who owns the record.',
    },
    {
        question: 'Can we prove what happened months later?',
        answer: 'Scans, shifts, incidents, handovers and reports are all retained as records, and every privileged action is written to an audit log. GPS breadcrumb trails expire on a configurable retention schedule so the database stays fast without losing the proof that matters.',
    },
    {
        question: 'How long does it take to get running?',
        answer: 'Add your sites, print the checkpoint QR codes, and invite your guards. Most teams are running verified patrols the same week — the app is the only thing guards need to install.',
    },
];

/* --------------------------------------------------------------- primitives */

function Eyebrow({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
    return (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 mb-6">
            <Icon className="w-3 h-3 text-teal-500" />
            <span>{children}</span>
        </div>
    );
}

function SectionHead({ eyebrow, icon, title, sub, center = true }: { eyebrow?: string; icon?: React.ElementType; title: React.ReactNode; sub?: string; center?: boolean }) {
    return (
        <FadeDown>
            <div className={`${center ? 'text-center mx-auto' : ''} max-w-3xl mb-16`}>
                {eyebrow && icon ? <Eyebrow icon={icon}>{eyebrow}</Eyebrow> : null}
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-5">{title}</h2>
                {sub ? <p className="text-slate-600 text-lg leading-relaxed">{sub}</p> : null}
            </div>
        </FadeDown>
    );
}

/** A light dashboard frame. The tab rail drives what the panel says — the
 *  chrome is deliberately abstract until the real screenshots land. */
function ScreenTabs({ tabs }: { tabs: { icon: React.ElementType; label: string; title: string; body: string }[] }) {
    const [active, setActive] = useState(0);
    const current = tabs[active];
    return (
        <div>
            <FadeDown delay={0.1}>
                <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
                    {tabs.map((tab, i) => {
                        const Icon = tab.icon;
                        const on = i === active;
                        return (
                            <button
                                key={tab.label}
                                onClick={() => setActive(i)}
                                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 border ${
                                    on
                                        ? 'bg-gradient-to-r from-teal-600 to-cyan-500 text-white border-transparent shadow-[0_0_20px_rgba(20,184,166,0.35)]'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </FadeDown>

            <FadeDown delay={0.2}>
                <div className="relative">
                    <div className="absolute -inset-x-10 -top-6 h-48 bg-teal-500/10 blur-[100px] rounded-full pointer-events-none transform-gpu" />
                    <div className="relative rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
                        {/* window chrome */}
                        <div className="h-11 border-b border-slate-100 bg-slate-50 flex items-center px-4 gap-3">
                            <div className="flex gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                            </div>
                            <div className="flex-1 max-w-sm h-6 rounded-md bg-white border border-slate-200 flex items-center px-3 text-[10px] text-slate-400 font-mono">
                                evergreen.so/{current.label.toLowerCase().replace(/ /g, '-')}
                            </div>
                        </div>

                        <div className="flex min-h-[380px]">
                            {/* sidebar rail */}
                            <div className="hidden sm:flex w-52 shrink-0 border-r border-slate-100 bg-slate-50/60 flex-col p-3 gap-1.5">
                                {tabs.map((tab, i) => {
                                    const Icon = tab.icon;
                                    return (
                                        <div
                                            key={tab.label}
                                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors ${
                                                i === active ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-400'
                                            }`}
                                        >
                                            <Icon className={`w-3.5 h-3.5 ${i === active ? 'text-teal-500' : ''}`} />
                                            {tab.label}
                                        </div>
                                    );
                                })}
                                <div className="mt-auto flex items-center gap-2 px-3 py-2 text-[10px] text-teal-600 font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" /> Live
                                </div>
                            </div>

                            {/* panel */}
                            <div className="flex-1 p-6 sm:p-8 relative overflow-hidden">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={active}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -12 }}
                                        transition={{ duration: 0.35, ease: 'easeOut' }}
                                        className="transform-gpu"
                                    >
                                        <h3 className="text-lg font-bold text-slate-900">{current.title}</h3>
                                        <p className="text-sm text-slate-600 mt-1 max-w-md">{current.body}</p>

                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
                                            {[0, 1, 2, 3].map((i) => (
                                                <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
                                                    <div className="w-10 h-1.5 rounded bg-slate-100 mb-3" />
                                                    <div className={`w-12 h-4 rounded ${i === 0 ? 'bg-teal-500/30' : 'bg-slate-200'}`} />
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden">
                                            {[0, 1, 2, 3, 4].map((i) => (
                                                <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i ? 'border-t border-slate-100' : 'bg-slate-50/60'}`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${i % 3 === 0 ? 'bg-teal-500' : 'bg-slate-300'}`} />
                                                    <div className="h-1.5 rounded bg-slate-100" style={{ width: `${28 + ((i * 13) % 34)}%` }} />
                                                    <div className="ml-auto h-1.5 w-10 rounded bg-slate-100" />
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                </div>
            </FadeDown>
        </div>
    );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative mx-auto w-[280px]">
            <div className="absolute -inset-8 bg-teal-500/15 blur-[80px] rounded-full pointer-events-none transform-gpu" />
            <div className="relative rounded-[2.5rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl overflow-hidden">
                <div className="rounded-[1.8rem] overflow-hidden bg-white">
                    <div className="h-6 bg-slate-900 flex items-center justify-center">
                        <div className="w-16 h-1 rounded-full bg-slate-700" />
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}

function AppFeature({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
    return (
        <div className="group rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-lg transition-all duration-300">
            <div className="flex items-start gap-4">
                <div className="w-10 h-10 shrink-0 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-600 group-hover:scale-105 transition-transform duration-300">
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <h4 className="font-semibold text-slate-900">{title}</h4>
                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">{body}</p>
                </div>
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------- page */

export default function Landing() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const [yearly, setYearly] = useState(false);

    const plans = [
        {
            name: 'Standard',
            tagline: 'Patrol verification for a single site.',
            monthly: 149,
            cta: 'Start free trial',
            featured: false,
            features: ['QR patrol verification', 'Clock-in with photo & GPS', 'Incident reporting', 'Daily activity reports', 'Up to 20 officers'],
        },
        {
            name: 'Professional',
            tagline: 'The full control room for a guarding operation.',
            monthly: 349,
            cta: 'Start free trial',
            featured: true,
            features: ['Everything in Standard', 'Live guard tracking & map', 'Post orders & handovers', 'Client portal access', 'Analytics & audit trail', 'Up to 50 officers'],
        },
        {
            name: 'Custom',
            tagline: 'Tailored to how your company already runs.',
            monthly: null,
            cta: 'Contact sales',
            featured: false,
            features: ['Everything in Professional', 'Unlimited officers & sites', 'Dedicated success manager', 'Custom report templates', 'Priority support'],
        },
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
                            <span>Built for guard teams and control rooms</span>
                        </div>
                    </FadeDown>
                    <FadeDown delay={0.1}>
                        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter mb-6 max-w-4xl mx-auto leading-[1.1] bg-clip-text text-transparent bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-900/40 drop-shadow-sm">
                            Every patrol,<br className="hidden md:block" /> provably done.
                        </h1>
                    </FadeDown>
                    <FadeDown delay={0.2}>
                        <p className="text-lg md:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
                            Live guard tracking, QR-verified patrols, incident reports and panic alerts — one system your clients can see into.
                        </p>
                    </FadeDown>
                    <FadeDown delay={0.3}>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link to="/login" className="w-full sm:w-auto bg-gradient-to-r from-teal-600 to-cyan-500 text-white px-8 py-3.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(20,184,166,0.4)]">
                                Start Free Trial <ArrowRight className="w-4 h-4" />
                            </Link>
                            <button className="w-full sm:w-auto bg-slate-50 text-slate-900 border border-slate-200 px-8 py-3.5 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors backdrop-blur-sm">
                                Book a demo
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

            {/* 3. TRUST BAR */}
            <section className="py-12 px-6 border-y border-slate-200 bg-slate-50/60">
                <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-6">
                    {TRUST.map((item, i) => {
                        const Icon = item.icon;
                        return (
                            <FadeDown key={item.title} delay={i * 0.05}>
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 shrink-0 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-teal-600">
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
                                        <p className="text-[11px] text-slate-500 truncate">{item.sub}</p>
                                    </div>
                                </div>
                            </FadeDown>
                        );
                    })}
                </div>
            </section>

            {/* 4. WHAT IS EVERGREEN */}
            <section className="py-24 px-6 bg-white relative overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-64 bg-teal-500/[0.07] blur-[120px] rounded-full pointer-events-none transform-gpu" />
                <div className="relative z-10 max-w-3xl mx-auto text-center">
                    <FadeDown>
                        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-5">What is Evergreen?</h2>
                        <p className="text-lg text-slate-600 leading-relaxed">
                            Evergreen is patrol monitoring software for security companies and control rooms. It handles
                            live guard tracking, QR patrol verification, incident reporting, panic alerts, access control
                            and client-ready operational records — in one platform, with a portal your clients can open
                            themselves.
                        </p>
                    </FadeDown>
                </div>
            </section>

            {/* 5. OVERVIEW CARDS */}
            <section className="pb-24 px-6 bg-white">
                <div className="max-w-7xl mx-auto">
                    <FadeDown>
                        <div className="max-w-3xl mb-12">
                            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-4">
                                Patrol monitoring built for guard teams
                            </h2>
                            <p className="text-slate-600 text-lg leading-relaxed">
                                Evergreen connects guard management, live tracking, QR patrol verification, incident
                                reports and panic alerts for security companies that need clear proof of service.
                            </p>
                        </div>
                    </FadeDown>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {OVERVIEW.map((card, i) => (
                            <FadeDown key={card.title} delay={i * 0.07}>
                                <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 hover:border-teal-500/40 hover:shadow-lg transition-all duration-300">
                                    <h3 className="font-semibold text-slate-900 mb-2">{card.title}</h3>
                                    <p className="text-sm text-slate-600 leading-relaxed">{card.body}</p>
                                </div>
                            </FadeDown>
                        ))}
                    </div>
                </div>
            </section>

            {/* 6. THREE PILLARS */}
            <section className="py-24 px-6 bg-slate-50/60 border-y border-slate-200 relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-80 bg-cyan-500/[0.07] blur-[120px] rounded-full pointer-events-none transform-gpu" />
                <div className="relative z-10 max-w-7xl mx-auto">
                    <SectionHead
                        title={<>One system for patrols,<br className="hidden md:block" /> incidents and proof</>}
                        sub="Evergreen helps security companies track guards, verify patrol activity, manage incidents and keep operational records in one place."
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {PILLARS.map((p, i) => {
                            const Icon = p.icon;
                            return (
                                <FadeDown key={p.title} delay={i * 0.1}>
                                    <div className="h-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-xl transition-shadow duration-300">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/15 to-cyan-500/10 border border-teal-500/20 flex items-center justify-center text-teal-600 mb-5">
                                            <Icon className="w-6 h-6" />
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-900 mb-3">{p.title}</h3>
                                        <p className="text-sm text-slate-600 leading-relaxed">{p.body}</p>
                                    </div>
                                </FadeDown>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* 7. INDUSTRIES */}
            <section id="solutions" className="py-32 px-6 bg-white relative overflow-hidden">
                <div
                    className="absolute inset-0 z-0 opacity-[0.35] pointer-events-none transform-gpu"
                    style={{ backgroundImage: 'radial-gradient(rgba(15,23,42,0.08) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
                />
                <div className="relative z-10 max-w-7xl mx-auto">
                    <SectionHead
                        eyebrow="Solutions"
                        icon={Shield}
                        title="Built for teams responsible for safety"
                        sub="Whether you run a guarding company, protect a property, or coordinate emergency response, Evergreen gives your team the same real-time picture."
                    />
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        {INDUSTRIES.map((item, i) => {
                            const Icon = item.icon;
                            return (
                                <FadeDown key={item.title} delay={i * 0.05}>
                                    <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 text-center hover:border-teal-500/40 hover:-translate-y-1 transition-all duration-300">
                                        <div className="w-10 h-10 mx-auto rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-600 mb-3">
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <h3 className="text-xs font-semibold text-slate-900 mb-1.5 leading-snug">{item.title}</h3>
                                        <p className="text-[11px] text-slate-500 leading-relaxed">{item.body}</p>
                                    </div>
                                </FadeDown>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* 8. CONTROL ROOM */}
            <section id="control-room" className="py-32 px-6 bg-slate-50/60 border-y border-slate-200">
                <div className="max-w-7xl mx-auto">
                    <SectionHead
                        eyebrow="Control room"
                        icon={Radio}
                        title="Run the whole operation from one dashboard"
                        sub="Real-time incident management, guard visibility, analytics and reporting for security companies."
                    />
                    <ScreenTabs tabs={CONTROL_ROOM_TABS} />
                </div>
            </section>

            {/* 9. TEAM */}
            <section className="py-32 px-6 bg-white">
                <div className="max-w-7xl mx-auto">
                    <SectionHead
                        eyebrow="Team management"
                        icon={Users}
                        title={<>Full control over your <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-600 to-cyan-600">security team</span></>}
                        sub="Manage officers, track locations in real time and monitor performance — all from one place."
                    />
                    <ScreenTabs tabs={TEAM_TABS} />
                </div>
            </section>

            {/* 10. SITES */}
            <section className="py-32 px-6 bg-slate-50/60 border-y border-slate-200">
                <div className="max-w-7xl mx-auto">
                    <SectionHead
                        eyebrow="Site management"
                        icon={Building2}
                        title="Every site, every checkpoint, at your fingertips"
                        sub="Set up locations, generate the QR codes your guards scan, and control who gets through the gate."
                    />
                    <ScreenTabs tabs={SITE_TABS} />
                </div>
            </section>

            {/* 11. GUARD APP */}
            <section className="py-32 px-6 bg-white relative overflow-hidden">
                <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-teal-500/[0.08] blur-[120px] rounded-full pointer-events-none transform-gpu" />
                <div className="relative z-10 max-w-7xl mx-auto">
                    <SectionHead
                        eyebrow="For your guards"
                        icon={Smartphone}
                        title={<>Your guards get a <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-600 to-cyan-600">real app</span></>}
                        sub="Assignments, patrol scanning and incident handling in one app that keeps working when the signal does not."
                    />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                        <div className="space-y-3 order-2 lg:order-1">
                            {GUARD_APP.map((f, i) => (
                                <FadeDown key={f.title} delay={i * 0.08}>
                                    <AppFeature {...f} />
                                </FadeDown>
                            ))}
                        </div>

                        <FadeDown delay={0.15} className="order-1 lg:order-2">
                            <PhoneFrame>
                                <div className="p-4 bg-gradient-to-b from-teal-500 to-cyan-500 text-white">
                                    <p className="text-sm font-semibold">On duty — Nasfat Mosque</p>
                                    <p className="text-[10px] opacity-90">Clocked in 2h 14m ago</p>
                                </div>
                                <div className="p-4 space-y-3 bg-white">
                                    <div className="rounded-xl border border-slate-200 p-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-semibold text-slate-900">Next checkpoint</span>
                                            <span className="text-[9px] text-teal-600 font-medium">Due 10m</span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-1">Main gate · SC-KN75</p>
                                    </div>
                                    <div className="rounded-xl bg-slate-900 p-4 text-center">
                                        <ScanLine className="w-7 h-7 text-teal-400 mx-auto mb-1.5" />
                                        <p className="text-[11px] font-semibold text-white">Scan checkpoint</p>
                                    </div>
                                    <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-3">
                                        <div className="flex items-center gap-2">
                                            <ClipboardList className="w-3.5 h-3.5 text-teal-600" />
                                            <span className="text-[10px] font-semibold text-slate-900">Post order — acknowledge</span>
                                        </div>
                                        <p className="text-[9px] text-slate-500 mt-1">Check perimeter lighting before proceeding.</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-lg border border-slate-200 p-2.5 text-center">
                                            <Camera className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                                            <p className="text-[9px] text-slate-600">Incident</p>
                                        </div>
                                        <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-center">
                                            <Siren className="w-4 h-4 text-red-500 mx-auto mb-1" />
                                            <p className="text-[9px] text-red-600 font-medium">Panic</p>
                                        </div>
                                    </div>
                                </div>
                            </PhoneFrame>
                        </FadeDown>
                    </div>

                    <div className="grid grid-cols-3 gap-6 mt-20 max-w-3xl mx-auto text-center">
                        {[
                            { big: 'iOS & Android', small: 'Available now' },
                            { big: 'Offline', small: 'Syncs when online' },
                            { big: 'Included', small: 'With every plan' },
                        ].map((s, i) => (
                            <FadeDown key={s.big} delay={i * 0.08}>
                                <p className="text-xl md:text-2xl font-bold text-slate-900">{s.big}</p>
                                <p className="text-xs text-slate-500 mt-1">{s.small}</p>
                            </FadeDown>
                        ))}
                    </div>
                </div>
            </section>

            {/* 12. CLIENT PORTAL */}
            <section className="py-32 px-6 bg-slate-50/60 border-y border-slate-200 relative overflow-hidden">
                <div className="absolute top-1/3 left-0 w-[500px] h-[500px] bg-cyan-500/[0.08] blur-[120px] rounded-full pointer-events-none transform-gpu" />
                <div className="relative z-10 max-w-7xl mx-auto">
                    <SectionHead
                        eyebrow="For your clients"
                        icon={Users}
                        title={<>Your clients stay <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-600 to-teal-600">informed</span></>}
                        sub="Clients open their own portal to see verified patrol activity at their sites — proof of service, without a phone call."
                    />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                        <FadeDown delay={0.15}>
                            <PhoneFrame>
                                <div className="p-4 bg-slate-900 text-white">
                                    <p className="text-sm font-semibold">Evergreen</p>
                                    <p className="text-[10px] text-slate-400">Welcome back, Nasfat Estate</p>
                                </div>
                                <div className="p-4 space-y-3 bg-white">
                                    <div className="rounded-xl border border-slate-200 p-3">
                                        <p className="text-[10px] text-slate-500">Patrols verified today</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-0.5">
                                            12<span className="text-sm text-slate-400 font-medium">/12</span>
                                        </p>
                                        <div className="h-1.5 mt-2 rounded-full bg-slate-100 overflow-hidden">
                                            <div className="h-full w-full bg-gradient-to-r from-teal-500 to-cyan-500" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-lg border border-slate-200 p-2.5">
                                            <p className="text-[9px] text-slate-500">Guards on duty</p>
                                            <p className="text-sm font-bold text-slate-900">4</p>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 p-2.5">
                                            <p className="text-[9px] text-slate-500">Open incidents</p>
                                            <p className="text-sm font-bold text-slate-900">0</p>
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                                        {['Main gate', 'Rear perimeter', 'Car park'].map((p, i) => (
                                            <div key={p} className={`flex items-center justify-between px-3 py-2 ${i ? 'border-t border-slate-100' : ''}`}>
                                                <span className="text-[10px] text-slate-700">{p}</span>
                                                <span className="inline-flex items-center gap-1 text-[9px] text-teal-600 font-medium">
                                                    <CheckCircle2 className="w-3 h-3" /> Verified
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </PhoneFrame>
                        </FadeDown>

                        <div className="space-y-3">
                            {CLIENT_PORTAL.map((f, i) => (
                                <FadeDown key={f.title} delay={i * 0.08}>
                                    <AppFeature {...f} />
                                </FadeDown>
                            ))}
                            <FadeDown delay={0.4}>
                                <p className="text-xs text-slate-500 pt-3 border-t border-slate-200 mt-4">
                                    Clients never see guard identities — only coverage numbers and verified activity.
                                </p>
                            </FadeDown>
                        </div>
                    </div>
                </div>
            </section>

            {/* 13. COMPLIANCE */}
            <section className="py-32 px-6 bg-white">
                <div className="max-w-7xl mx-auto">
                    <SectionHead
                        eyebrow="Trust"
                        icon={Lock}
                        title="Built for regulated security operations"
                        sub="The proof you hand a client is only worth what the system behind it can defend."
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {COMPLIANCE.map((c, i) => {
                            const Icon = c.icon;
                            return (
                                <FadeDown key={c.title} delay={i * 0.1}>
                                    <div className="h-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-xl transition-shadow duration-300">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/15 to-cyan-500/10 border border-teal-500/20 flex items-center justify-center text-teal-600 mb-5">
                                            <Icon className="w-6 h-6" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 mb-4">{c.title}</h3>
                                        <ul className="space-y-3">
                                            {c.items.map((item) => (
                                                <li key={item} className="flex items-start gap-2.5 text-sm text-slate-600">
                                                    <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
                                                    <span className="leading-relaxed">{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </FadeDown>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* 14. PROBLEMS VS SOLUTIONS */}
            <section className="py-32 px-6 bg-slate-50/60 border-y border-slate-200">
                <div className="max-w-7xl mx-auto">
                    <SectionHead
                        title="Why traditional patrol management fails teams"
                        sub="Most security teams still run on radio calls, chat groups and paper logs that do not talk to each other. The result is slow response, weak accountability, and clients who never get a clear picture."
                    />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <FadeDown>
                            <div className="h-full rounded-3xl border border-red-200 bg-red-50/40 p-8">
                                <div className="flex items-center gap-3 mb-7">
                                    <div className="w-11 h-11 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center text-red-500">
                                        <X className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900">The old way</h3>
                                </div>
                                <div className="space-y-6">
                                    {PROBLEMS.map((p) => {
                                        const Icon = p.icon;
                                        return (
                                            <div key={p.title} className="flex items-start gap-3">
                                                <Icon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="font-semibold text-slate-900 text-sm">{p.title}</p>
                                                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">{p.body}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </FadeDown>

                        <FadeDown delay={0.1}>
                            <div className="h-full rounded-3xl border border-teal-500/30 bg-teal-500/[0.04] p-8">
                                <div className="flex items-center gap-3 mb-7">
                                    <div className="w-11 h-11 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-600">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900">With Evergreen</h3>
                                </div>
                                <div className="space-y-6">
                                    {SOLUTIONS.map((s) => {
                                        const Icon = s.icon;
                                        return (
                                            <div key={s.title} className="flex items-start gap-3">
                                                <Icon className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="font-semibold text-slate-900 text-sm">{s.title}</p>
                                                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">{s.body}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </FadeDown>
                    </div>

                    <FadeDown delay={0.2}>
                        <div className="mt-10 rounded-3xl bg-gradient-to-r from-teal-600 to-cyan-500 p-10 text-center shadow-[0_20px_60px_rgba(20,184,166,0.25)]">
                            <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
                                Stop stitching operations together. Run them from one system.
                            </h3>
                            <p className="text-white/85 max-w-2xl mx-auto mb-7">
                                Every patrol, incident and shift in one record your supervisors trust and your clients can see.
                            </p>
                            <Link
                                to="/login"
                                className="inline-flex items-center gap-2 bg-white text-slate-900 px-8 py-3.5 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-colors"
                            >
                                Start free trial <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    </FadeDown>
                </div>
            </section>

            {/* 15. PRICING */}
            <section id="pricing" className="py-32 px-6 bg-white relative overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-80 bg-teal-500/[0.07] blur-[120px] rounded-full pointer-events-none transform-gpu" />
                <div className="relative z-10 max-w-7xl mx-auto">
                    <SectionHead
                        title="Start your free trial"
                        sub="Choose a plan and start a 7-day free trial. No payment method required."
                    />

                    <FadeDown>
                        <div className="flex items-center justify-center gap-4 mb-12">
                            <span className={`text-sm font-medium ${!yearly ? 'text-slate-900' : 'text-slate-500'}`}>Monthly</span>
                            <button
                                onClick={() => setYearly((v) => !v)}
                                aria-label="Toggle yearly pricing"
                                className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${yearly ? 'bg-teal-500' : 'bg-slate-200'}`}
                            >
                                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ${yearly ? 'translate-x-8' : 'translate-x-1'}`} />
                            </button>
                            <span className={`text-sm font-medium ${yearly ? 'text-slate-900' : 'text-slate-500'}`}>
                                Yearly <span className="text-teal-600">save 15%</span>
                            </span>
                        </div>
                    </FadeDown>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                        {plans.map((plan, i) => (
                            <FadeDown key={plan.name} delay={i * 0.1}>
                                <div
                                    className={`relative h-full rounded-3xl border p-8 transition-shadow duration-300 ${
                                        plan.featured
                                            ? 'border-teal-500/40 bg-white shadow-[0_20px_60px_rgba(20,184,166,0.18)]'
                                            : 'border-slate-200 bg-white hover:shadow-xl'
                                    }`}
                                >
                                    {plan.featured ? (
                                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-teal-600 to-cyan-500 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-wide">
                                            MOST POPULAR
                                        </span>
                                    ) : null}
                                    <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                                    <p className="text-sm text-slate-500 mt-1 mb-6">{plan.tagline}</p>
                                    <div className="mb-7">
                                        {plan.monthly === null ? (
                                            <p className="text-4xl font-bold text-slate-900">Custom</p>
                                        ) : (
                                            <p className="text-4xl font-bold text-slate-900">
                                                ${yearly ? Math.round(plan.monthly * 0.85) : plan.monthly}
                                                <span className="text-base text-slate-400 font-medium">/month</span>
                                            </p>
                                        )}
                                    </div>
                                    <Link
                                        to="/login"
                                        className={`block text-center w-full px-6 py-3 rounded-lg text-sm font-semibold transition-all ${
                                            plan.featured
                                                ? 'bg-gradient-to-r from-teal-600 to-cyan-500 text-white hover:opacity-90'
                                                : 'bg-slate-50 text-slate-900 border border-slate-200 hover:bg-slate-100'
                                        }`}
                                    >
                                        {plan.cta}
                                    </Link>
                                    <ul className="space-y-3 mt-7">
                                        {plan.features.map((f) => (
                                            <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
                                                <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </FadeDown>
                        ))}
                    </div>
                </div>
            </section>

            {/* 16. FAQ */}
            <section id="faq" className="py-32 px-6 bg-slate-50/60 border-y border-slate-200">
                <div className="max-w-3xl mx-auto">
                    <SectionHead
                        title="Frequently asked questions"
                        sub="Everything you need to know about how Evergreen proves what happened on shift."
                    />
                    <div className="space-y-3">
                        {FAQ_DATA.map((item, i) => (
                            <FadeDown key={item.question} delay={i * 0.05}>
                                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                                    <button
                                        onClick={() => setOpenIndex(openIndex === i ? null : i)}
                                        className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-slate-50 transition-colors"
                                    >
                                        <span className="font-semibold text-slate-900 text-sm">{item.question}</span>
                                        <ChevronDown
                                            className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-300 ${openIndex === i ? 'rotate-180 text-teal-500' : ''}`}
                                        />
                                    </button>
                                    <AnimatePresence initial={false}>
                                        {openIndex === i ? (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                                className="overflow-hidden"
                                            >
                                                <p className="px-5 pb-5 text-sm text-slate-600 leading-relaxed">{item.answer}</p>
                                            </motion.div>
                                        ) : null}
                                    </AnimatePresence>
                                </div>
                            </FadeDown>
                        ))}
                    </div>
                </div>
            </section>

            {/* 17. BOTTOM CTA */}
            <section className="py-32 px-6 bg-white relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl h-80 bg-teal-500/10 blur-[120px] rounded-full pointer-events-none transform-gpu" />
                <div className="relative z-10 max-w-3xl mx-auto text-center">
                    <FadeDown>
                        <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 mb-6">
                            Prove every patrol.
                        </h2>
                        <p className="text-lg text-slate-600 mb-10 max-w-xl mx-auto">
                            Start a free trial and run your first verified patrol this week.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                to="/login"
                                className="w-full sm:w-auto bg-gradient-to-r from-teal-600 to-cyan-500 text-white px-8 py-4 rounded-xl text-base font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(20,184,166,0.35)]"
                            >
                                Start free trial <ArrowRight className="w-4 h-4" />
                            </Link>
                            <Link
                                to="/contact"
                                className="w-full sm:w-auto bg-slate-50 text-slate-900 border border-slate-200 px-8 py-4 rounded-xl text-base font-semibold hover:bg-slate-100 transition-colors"
                            >
                                Contact sales
                            </Link>
                        </div>
                        <p className="text-xs text-slate-400 mt-5">Free 7-day trial — no payment method required.</p>
                    </FadeDown>
                </div>
            </section>
        </main>
    );
}
