// The Solutions page mirrors the information architecture of guard-management
// competitors (a stack of "what we solve" cards, each paired with a product
// visual) but in our own design: FadeUp reveals, blurred teal glows, white
// cards on white, teal/cyan gradients. Content is adapted to what Evergreen
// actually does — patrol monitoring — not copied verbatim.
import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import {
    ArrowRight, Shield, Navigation, Siren, QrCode, MessageSquare, LayoutDashboard,
    DoorOpen, Users, CheckCircle2, MapPin, AlertTriangle, ScanLine,
    BadgeCheck, ChevronRight,
} from 'lucide-react';

import heroDashboard from '../assets/product/hero-dashboard.png';
import clientPortalShot from '../assets/product/client-portal.png';

const FadeUp = ({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) => (
    <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.55, delay, ease: 'easeOut' }}
        className={`transform-gpu will-change-transform ${className}`}
    >
        {children}
    </motion.div>
);

/* ------------------------------------------------------------------ visuals */

// One shared dashboard chrome so the eight mockups read as one product. The
// title bar carries the traffic lights + a teal status dot; the body is
// solution-specific.
function MockFrame({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="relative">
            <div className="absolute -inset-6 bg-teal-500/15 blur-[70px] rounded-full pointer-events-none transform-gpu" />
            <div className="relative rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.10)] overflow-hidden">
                <div className="flex items-center gap-2 px-4 h-10 border-b border-slate-100 bg-slate-50/70">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                    <span className="ml-2 text-[11px] font-medium text-slate-500">{label}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-teal-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" /> Live
                    </span>
                </div>
                <div className="p-4">{children}</div>
            </div>
        </div>
    );
}

const StatusPill = ({ tone, label }: { tone: 'ok' | 'warn' | 'bad'; label: string }) => {
    const map = {
        ok: 'text-teal-700 bg-teal-500/10 border-teal-500/20',
        warn: 'text-amber-700 bg-amber-500/10 border-amber-500/20',
        bad: 'text-red-700 bg-red-500/10 border-red-500/20',
    } as const;
    return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${map[tone]}`}>{label}</span>;
};

function MapMock() {
    return (
        <MockFrame label="Live guard map">
            <div className="relative h-56 rounded-xl bg-slate-900 overflow-hidden">
                <div className="absolute inset-0 opacity-30"
                    style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
                <svg viewBox="0 0 300 200" className="absolute inset-0 w-full h-full">
                    <path d="M30,160 C70,150 90,90 140,95 C180,99 190,50 250,60" fill="none" stroke="#2dd4bf" strokeWidth="2.5" strokeDasharray="4 5" />
                    <circle cx="30" cy="160" r="4" fill="#2dd4bf" />
                    <circle cx="140" cy="95" r="4" fill="#2dd4bf" />
                    <circle cx="250" cy="60" r="6" fill="#22d3ee" />
                    <circle cx="250" cy="60" r="12" fill="none" stroke="#22d3ee" strokeWidth="1.5" opacity="0.5" />
                </svg>
                <div className="absolute top-3 left-3 flex items-center gap-1.5 text-[10px] font-medium text-white/90">
                    <MapPin className="w-3 h-3 text-teal-400" /> SC-03 · on route
                </div>
                <div className="absolute bottom-3 left-3 right-3 rounded-lg bg-white/95 backdrop-blur px-3 py-2 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold text-slate-900">Guard 03 — Nasfat Estate</p>
                        <p className="text-[10px] text-slate-500">4.2 km patrolled · 2h 14m on shift</p>
                    </div>
                    <StatusPill tone="ok" label="Verified" />
                </div>
            </div>
        </MockFrame>
    );
}

function AlertMock() {
    return (
        <MockFrame label="Control room">
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 mb-3">
                <div className="flex items-center gap-2">
                    <Siren className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-semibold text-red-700">Panic alert — Adejuwon T.</span>
                    <span className="ml-auto text-[10px] text-red-500 font-medium">just now</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1.5">GPS 6.52°N, 3.37°E · Main gate · device online</p>
            </div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Nearest guards</p>
            <div className="space-y-2">
                {[['SC-07', '120 m', true], ['SC-02', '340 m', false]].map(([id, dist, near]) => (
                    <div key={id as string} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                        <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-teal-500/10 text-teal-600 text-[10px] font-bold flex items-center justify-center">{(id as string).slice(-2)}</span>
                            <span className="text-[11px] font-medium text-slate-900">{id}</span>
                            <span className="text-[10px] text-slate-500">{dist}</span>
                        </div>
                        {near ? (
                            <span className="text-[10px] font-semibold text-white bg-gradient-to-r from-teal-600 to-cyan-500 px-2.5 py-1 rounded-md">Assign</span>
                        ) : (
                            <span className="text-[10px] font-medium text-slate-400">Standby</span>
                        )}
                    </div>
                ))}
            </div>
        </MockFrame>
    );
}

function CheckpointMock() {
    const rows: [string, 'ok' | 'warn' | 'bad', string][] = [
        ['Main gate · SC-KN75', 'ok', 'Verified 4m ago'],
        ['Rear perimeter · SC-KN71', 'warn', 'Due in 6m'],
        ['Car park · SC-KN7C', 'bad', 'Overdue 12m'],
        ['Generator bay · SC-KN76', 'ok', 'Verified 22m ago'],
    ];
    return (
        <MockFrame label="Patrol history">
            <div className="space-y-2">
                {rows.map(([name, tone, meta]) => (
                    <div key={name} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                            <span className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center">
                                <QrCode className="w-3.5 h-3.5 text-teal-400" />
                            </span>
                            <div>
                                <p className="text-[11px] font-semibold text-slate-900">{name}</p>
                                <p className="text-[10px] text-slate-500">{meta}</p>
                            </div>
                        </div>
                        <StatusPill tone={tone} label={tone === 'ok' ? 'Verified' : tone === 'warn' ? 'Due' : 'Overdue'} />
                    </div>
                ))}
            </div>
        </MockFrame>
    );
}

function ControlMock() {
    const tiles = [
        ['Guards on duty', '18', Users],
        ['Scans today', '204', ScanLine],
        ['Open alerts', '3', AlertTriangle],
        ['Sites live', '11', LayoutDashboard],
    ] as const;
    return (
        <MockFrame label="Operations overview">
            <div className="grid grid-cols-2 gap-2.5 mb-3">
                {tiles.map(([label, val, Icon]) => (
                    <div key={label} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500">{label}</span>
                            <Icon className="w-3.5 h-3.5 text-teal-600" />
                        </div>
                        <p className="text-xl font-bold text-slate-900 mt-1">{val}</p>
                    </div>
                ))}
            </div>
            <div className="rounded-xl bg-slate-900 p-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Live feed</p>
                {[['SC-KN75 verified', 'Nasfat Estate'], ['Incident filed', 'Ikorodu Depot']].map(([a, b]) => (
                    <div key={a} className="flex items-center gap-2 py-1">
                        <CheckCircle2 className="w-3 h-3 text-teal-400" />
                        <span className="text-[11px] text-white">{a}</span>
                        <span className="text-[10px] text-slate-500 ml-auto">{b}</span>
                    </div>
                ))}
            </div>
        </MockFrame>
    );
}

function AccessMock() {
    const rows: [string, string, 'ok' | 'bad'][] = [
        ['Visitor · Blue Toyota', 'Guard SC-02 · 18:04', 'ok'],
        ['Resident · Flat 14B', 'Guard SC-02 · 18:11', 'ok'],
        ['Unlisted vehicle', 'Guard SC-07 · 18:22', 'bad'],
    ];
    return (
        <MockFrame label="Access control">
            <div className="space-y-2">
                {rows.map(([who, meta, tone]) => (
                    <div key={who} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                            <span className="w-7 h-7 rounded-lg bg-teal-500/10 flex items-center justify-center">
                                <DoorOpen className="w-3.5 h-3.5 text-teal-600" />
                            </span>
                            <div>
                                <p className="text-[11px] font-semibold text-slate-900">{who}</p>
                                <p className="text-[10px] text-slate-500">{meta}</p>
                            </div>
                        </div>
                        <StatusPill tone={tone} label={tone === 'ok' ? 'Allowed' : 'Denied'} />
                    </div>
                ))}
                <p className="text-[10px] text-slate-400 pt-1">Every decision logged — guard, timestamp, result. No hardware needed.</p>
            </div>
        </MockFrame>
    );
}

function RosterMock() {
    const rows: [string, string, 'ok' | 'warn'][] = [
        ['Adejuwon Tope', 'Armed · CPR', 'ok'],
        ['Musa Ibrahim', 'Firearm cert expires 14d', 'warn'],
        ['Grace Eze', 'Supervisor · First aid', 'ok'],
    ];
    return (
        <MockFrame label="Personnel">
            <div className="space-y-2">
                {rows.map(([name, cert, tone]) => (
                    <div key={name} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 text-white text-[10px] font-bold flex items-center justify-center">
                                {name.split(' ').map((w) => w[0]).join('')}
                            </span>
                            <div>
                                <p className="text-[11px] font-semibold text-slate-900">{name}</p>
                                <p className="text-[10px] text-slate-500">{cert}</p>
                            </div>
                        </div>
                        {tone === 'ok'
                            ? <BadgeCheck className="w-4 h-4 text-teal-600" />
                            : <StatusPill tone="warn" label="Renew" />}
                    </div>
                ))}
            </div>
        </MockFrame>
    );
}

function DashboardShot() {
    return (
        <div className="relative">
            <div className="absolute -inset-6 bg-teal-500/15 blur-[80px] rounded-full pointer-events-none transform-gpu" />
            <div className="relative rounded-2xl border border-white/10 bg-[#050505] shadow-2xl overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[2px] bg-gradient-to-r from-transparent via-teal-500 to-transparent opacity-80 z-20" />
                <img src={heroDashboard} alt="Evergreen patrol monitoring dashboard" className="relative z-10 w-full h-auto block" />
            </div>
        </div>
    );
}

function PhoneShot() {
    return (
        <div className="relative mx-auto w-[260px]">
            <div className="absolute -inset-8 bg-teal-500/15 blur-[80px] rounded-full pointer-events-none transform-gpu" />
            <img src={clientPortalShot} alt="Evergreen client portal on mobile" className="lp-float relative w-full h-auto block drop-shadow-2xl" />
        </div>
    );
}

const VISUALS: Record<string, () => React.ReactElement> = {
    dashboard: DashboardShot,
    map: MapMock,
    alert: AlertMock,
    checkpoint: CheckpointMock,
    phone: PhoneShot,
    control: ControlMock,
    access: AccessMock,
    roster: RosterMock,
};

/* ------------------------------------------------------------------ content */

type Solution = {
    id: string;
    icon: React.ElementType;
    tag: string;
    title: string;
    body: string;
    points: string[];
    visual: keyof typeof VISUALS;
};

const SOLUTIONS: Solution[] = [
    {
        id: 'guard-management',
        icon: Shield,
        tag: 'Guard management software',
        title: 'One platform for your whole guarding operation',
        body: 'Guards, patrols, incidents, live tracking, QR verification, panic alerts, access control and client-ready reports — run from one mobile-first platform instead of five disconnected tools.',
        points: ['Guards, sites and patrols in one place', 'Mobile-first, built for the field', 'Client-ready reporting out of the box'],
        visual: 'dashboard',
    },
    {
        id: 'gps-tracking',
        icon: Navigation,
        tag: 'GPS guard tracking',
        title: 'Prove every shift with location data',
        body: 'When a client asks whether guards actually patrolled last night, show them the GPS route, timestamps and shift data. Evidence, not phone calls.',
        points: ['Live positions on a map', 'Replayable movement trail per shift', 'Clock-in photo and GPS on every shift'],
        visual: 'map',
    },
    {
        id: 'emergency-response',
        icon: Siren,
        tag: 'Emergency response',
        title: 'From panic alert to guard assignment in seconds',
        body: 'One tap sends GPS, identity and device data to your control room. Your operator sees who is nearest and assigns a guard — all within seconds.',
        points: ['One-tap panic from the guard app', 'Nearest-guard routing for operators', 'Full context: location, identity, device'],
        visual: 'alert',
    },
    {
        id: 'patrol-verification',
        icon: QrCode,
        tag: 'Patrol verification',
        title: 'QR proof at every checkpoint',
        body: 'Guards scan tamper-proof QR checkpoints with their phone. Your dashboard shows overdue, due and never-scanned points, sorted by priority.',
        points: ['Scans verified against the site geofence', 'Overdue points surface themselves', 'Off-duty scans are refused, not recorded'],
        visual: 'checkpoint',
    },
    {
        id: 'client-communication',
        icon: MessageSquare,
        tag: 'Client communication',
        title: 'Professional updates, not WhatsApp',
        body: 'Give clients verified activity through their own portal, not WhatsApp groups. Your team reviews every report before a client ever sees it.',
        points: ['A portal per client, scoped to their sites', 'Reviewed before it reaches the client', 'Coverage numbers only — never guard identities'],
        visual: 'phone',
    },
    {
        id: 'control-room',
        icon: LayoutDashboard,
        tag: 'Control room',
        title: 'Your full operation on one screen',
        body: 'Incidents, guards, alerts and patrol status on one live screen. Your control room gets full operational visibility without switching tools.',
        points: ['Live feed of scans, incidents and alerts', 'Guards on duty and sites live at a glance', 'Missed patrols raise an alert automatically'],
        visual: 'control',
    },
    {
        id: 'access-control',
        icon: DoorOpen,
        tag: 'Digital access control',
        title: 'Replace the sign-in book',
        body: 'Guards scan QR codes to verify residents and visitors. Every decision is logged — guard, timestamp, result. No turnstiles, no card readers, no hardware to install.',
        points: ['Visitor and vehicle logging at the gate', 'Every entry decision is auditable', 'Runs on the phone the guard already carries'],
        visual: 'access',
    },
    {
        id: 'team-management',
        icon: Users,
        tag: 'Guard team management',
        title: 'Profiles, skills and certifications',
        body: 'Keep guard records, qualifications and expiry dates in one place. See who is qualified, who needs renewal and who is available — without paper files.',
        points: ['Certifications with expiry tracking', 'Availability and assignment at a glance', 'No more paper personnel files'],
        visual: 'roster',
    },
];

/* --------------------------------------------------------------------- page */

export default function Solutions() {
    return (
        <main className="bg-white text-slate-900">
            {/* HERO */}
            <section className="relative pt-36 pb-20 px-6 overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-teal-500/[0.10] blur-[130px] rounded-full pointer-events-none transform-gpu" />
                <div
                    className="absolute inset-0 z-0 opacity-[0.35] pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(rgba(15,23,42,0.06) 1px, transparent 1px)', backgroundSize: '38px 38px', maskImage: 'linear-gradient(to bottom, black, transparent)' }}
                />
                <div className="relative z-10 max-w-4xl mx-auto text-center">
                    <FadeUp>
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 mb-6">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" /> Solutions
                        </span>
                    </FadeUp>
                    <FadeUp delay={0.05}>
                        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
                            What Evergreen solves for{' '}
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-600 to-cyan-600">modern security teams</span>
                        </h1>
                    </FadeUp>
                    <FadeUp delay={0.1}>
                        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
                            Eight problems every guarding operation runs into — and how one mobile-first platform handles each of them, with proof your clients can open.
                        </p>
                    </FadeUp>
                    <FadeUp delay={0.15}>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
                            <Link to="/contact" className="w-full sm:w-auto bg-gradient-to-r from-teal-600 to-cyan-500 text-white px-8 py-3.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(20,184,166,0.4)]">
                                Talk to sales <ArrowRight className="w-4 h-4" />
                            </Link>
                            <Link to="/#pricing" className="w-full sm:w-auto bg-slate-50 text-slate-900 border border-slate-200 px-8 py-3.5 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">
                                See pricing
                            </Link>
                        </div>
                    </FadeUp>
                </div>
            </section>

            {/* SOLUTION ROWS */}
            <section className="pb-8">
                {SOLUTIONS.map((s, i) => {
                    const Visual = VISUALS[s.visual];
                    const Icon = s.icon;
                    const flip = i % 2 === 1;
                    return (
                        <div
                            key={s.id}
                            id={s.id}
                            className={`px-6 py-16 md:py-24 ${i % 2 === 1 ? 'bg-slate-50/60 border-y border-slate-200' : 'bg-white'}`}
                        >
                            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                                {/* Copy */}
                                <FadeUp className={flip ? 'lg:order-2' : ''}>
                                    <div className="inline-flex items-center gap-2 text-teal-600 mb-4">
                                        <span className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                                            <Icon className="w-4 h-4" />
                                        </span>
                                        <span className="text-xs font-semibold uppercase tracking-wide">{s.tag}</span>
                                    </div>
                                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">{s.title}</h2>
                                    <p className="text-slate-600 leading-relaxed mb-6">{s.body}</p>
                                    <ul className="space-y-2.5">
                                        {s.points.map((p) => (
                                            <li key={p} className="flex items-start gap-2.5 text-sm text-slate-700">
                                                <CheckCircle2 className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
                                                {p}
                                            </li>
                                        ))}
                                    </ul>
                                </FadeUp>

                                {/* Visual */}
                                <FadeUp delay={0.1} className={flip ? 'lg:order-1' : ''}>
                                    <Visual />
                                </FadeUp>
                            </div>
                        </div>
                    );
                })}
            </section>

            {/* BOTTOM CTA */}
            <section className="px-6 py-28">
                <FadeUp>
                    <div className="max-w-5xl mx-auto relative rounded-3xl border border-slate-200 bg-slate-900 overflow-hidden px-8 py-16 text-center">
                        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-3/4 h-40 bg-teal-500/25 blur-[100px] pointer-events-none transform-gpu" />
                        <div className="relative z-10">
                            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">See it on your own sites</h2>
                            <p className="text-slate-300 max-w-xl mx-auto mb-8">Spin up Evergreen against a real site and watch the first verified patrol land in your control room.</p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <Link to="/contact" className="w-full sm:w-auto bg-gradient-to-r from-teal-600 to-cyan-500 text-white px-8 py-3.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(20,184,166,0.4)]">
                                    Book a demo <ArrowRight className="w-4 h-4" />
                                </Link>
                                <Link to="/login" className="w-full sm:w-auto bg-white/10 text-white border border-white/15 px-8 py-3.5 rounded-lg text-sm font-medium hover:bg-white/15 transition-colors inline-flex items-center justify-center gap-1.5">
                                    Sign In <ChevronRight className="w-4 h-4" />
                                </Link>
                            </div>
                        </div>
                    </div>
                </FadeUp>
            </section>
        </main>
    );
}
