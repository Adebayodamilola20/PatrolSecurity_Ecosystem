import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, MapPin, Phone, Zap, ChevronDown, MessageCircle } from 'lucide-react';

/**
 * FadeDown Component - OPTIMIZED
 * Added transform-gpu and will-change-transform for buttery 60fps performance.
 */
const FadeDown = ({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) => (
    <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.8, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
        className={`transform-gpu will-change-transform ${className}`}
    >
        {children}
    </motion.div>
);

// OPTIMIZATION: Moved static data OUTSIDE the component to prevent re-allocation on every render/state change.
//
// We are a Nigerian guarding operation serving Nigerian sites — the template
// shipped a San Francisco address and a US phone number, which told every
// visitor we were somebody else. Email and phone are tappable so a caller on a
// phone does not have to copy them out by hand.
const CONTACT_METHODS = [
    { icon: Mail, title: "Chat to sales", value: "hello@evergreenprotection.com", href: "mailto:hello@evergreenprotection.com", color: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/20" },
    { icon: MapPin, title: "Visit us", value: "Victoria Island, Lagos", href: null, color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
    { icon: Phone, title: "Call us", value: "+234 800 000 0000", href: "tel:+2348000000000", color: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/20" }
];

// These were three circles pointing at "#" — they looked like social accounts
// and did nothing when clicked, which is worse in a demo than not having them.
// They are quick actions now, aimed at the only two channels we actually run.
const SOCIAL_LINKS = [
    { icon: MessageCircle, label: "WhatsApp us", href: "https://wa.me/2348000000000", hoverColor: "hover:text-emerald-500" },
    { icon: Mail, label: "Email us", href: "mailto:hello@evergreenprotection.com", hoverColor: "hover:text-teal-600" },
    { icon: Phone, label: "Call us", href: "tel:+2348000000000", hoverColor: "hover:text-cyan-600" }
];

const GLOBAL_HUBS = [
    { city: "Lagos", label: "Head office", icon: MapPin, glow: "bg-teal-500/5" },
    { city: "Abuja", label: "North central", icon: MapPin, glow: "bg-cyan-500/5" },
    { city: "Port Harcourt", label: "South south", icon: MapPin, glow: "bg-teal-500/5" }
];

const FAQS = [
    {
        question: "Do you offer enterprise support?",
        answer: "Yes. Our Custom plan includes a dedicated account manager, priority phone support and an SLA written around your posts and shift pattern."
    },
    {
        question: "Can I book a personalised demo?",
        answer: "Absolutely. We will walk your control room through a live patrol on one of your own sites — clock-in, QR scan, incident and the report your client would see."
    },
    {
        question: "What are your support hours?",
        answer: "Office support runs 8am–6pm WAT, Monday to Saturday. Guarding does not stop, so panic alerts and emergency escalations are monitored around the clock."
    },
    {
        question: "Is my data secure?",
        answer: "Every request is encrypted in transit, photos are never served from a permanent public link, and each client only ever sees their own sites — tenant isolation is enforced on the server, not hidden in the interface."
    }
];

const ContactUs = () => {
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Form submission logic would go here
    };

    return (
        <div className="min-h-screen bg-white text-slate-900 selection:bg-teal-500/30 selection:text-teal-200 font-sans overflow-x-hidden pt-32 pb-20 relative">
            {/* Background Ambient Glows */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden transform-gpu">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-teal-500/10 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-500/10 blur-[120px]" />
            </div>

            <div className="max-w-6xl mx-auto px-6 relative z-10">
                {/* 1. HEADER */}
                <section className="text-center mb-12 relative">
                    <FadeDown>
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
                            Get in{' '}
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-600 to-cyan-600">
                                Touch
                            </span>
                        </h1>
                        <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed mb-8">
                            Have a question, or want to see verified patrols running on your own sites? We'd love to hear from you.
                        </p>
                    </FadeDown>

                    {/* Support SLA Badge */}
                    <FadeDown delay={0.1}>
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm font-medium mb-16 shadow-[0_0_15px_rgba(20,184,166,0.1)] transform-gpu">
                            <Zap className="w-4 h-4" /> Average response time: Under 2 hours
                        </div>
                    </FadeDown>

                    {/* Header Background Glow */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-teal-500/5 to-cyan-500/5 blur-[100px] -z-10 rounded-full transform-gpu" />
                </section>

                {/* 2. MAIN LAYOUT GRID */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start mb-32">

                    {/* LEFT COLUMN: CONTACT INFO */}
                    <div className="space-y-6">
                        {CONTACT_METHODS.map((method, idx) => {
                            const Card = method.href ? 'a' : 'div';
                            return (
                                <FadeDown key={idx} delay={0.1 + (idx * 0.1)}>
                                    <Card
                                        {...(method.href ? { href: method.href } : {})}
                                        className="block bg-slate-50 border border-slate-200 rounded-2xl p-6 backdrop-blur-md hover:bg-slate-100 transition-all duration-300 transform-gpu group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 shrink-0 rounded-xl ${method.bg} flex items-center justify-center border ${method.border} group-hover:scale-110 transition-transform`}>
                                                <method.icon className={`w-6 h-6 ${method.color}`} />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wider">{method.title}</h3>
                                                {/* The address is long enough to overflow a phone-width
                                                    card, so it wraps rather than pushing the layout wide. */}
                                                <p className="text-lg font-semibold text-slate-900 break-words">{method.value}</p>
                                            </div>
                                        </div>
                                    </Card>
                                </FadeDown>
                            );
                        })}

                        {/* Social Links */}
                        <FadeDown delay={0.4} className="pt-6">
                            <div className="flex items-center gap-4">
                                {SOCIAL_LINKS.map((social, idx) => (
                                    <a
                                        key={idx}
                                        href={social.href}
                                        aria-label={social.label}
                                        title={social.label}
                                        className={`w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 transition-all duration-300 hover:bg-slate-100 hover:border-slate-300 transform-gpu hover:-translate-y-1 ${social.hoverColor}`}
                                    >
                                        <social.icon className="w-5 h-5" />
                                    </a>
                                ))}
                            </div>
                        </FadeDown>
                    </div>

                    {/* RIGHT COLUMN: THE FORM */}
                    <FadeDown delay={0.2}>
                        <div className="bg-slate-50 border border-slate-200 backdrop-blur-xl rounded-3xl p-8 shadow-2xl relative overflow-hidden transform-gpu">
                            {/* Internal Glow */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 blur-[80px] -mr-20 -mt-20 pointer-events-none transform-gpu" />

                            <form onSubmit={handleSubmit} className="relative z-10 space-y-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-600 ml-1">First Name</label>
                                        <input
                                            type="text"
                                            placeholder="Jane"
                                            className="w-full bg-white/70 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all placeholder:text-slate-400"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-600 ml-1">Last Name</label>
                                        <input
                                            type="text"
                                            placeholder="Doe"
                                            className="w-full bg-white/70 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all placeholder:text-slate-400"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-600 ml-1">Email Address</label>
                                    <input
                                        type="email"
                                        placeholder="jane@company.com"
                                        className="w-full bg-white/70 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all placeholder:text-slate-400"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-600 ml-1">Message</label>
                                    <textarea
                                        rows={4}
                                        placeholder="How can we help you?"
                                        className="w-full bg-white/70 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all placeholder:text-slate-400 resize-none"
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="w-full bg-gradient-to-r from-teal-600 to-cyan-500 text-white py-4 rounded-xl font-bold text-lg hover:opacity-90 transition-all shadow-[0_0_20px_rgba(20,184,166,0.3)] hover:shadow-[0_0_30px_rgba(20,184,166,0.5)] active:scale-[0.98] transform-gpu"
                                >
                                    Send Message
                                </button>
                            </form>
                        </div>
                    </FadeDown>
                </div>

                {/* 3. GLOBAL PRESENCE SECTION */}
                <section className="mb-32">
                    <FadeDown>
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Where we operate</h2>
                            <p className="text-slate-600 max-w-xl mx-auto">On the ground across Nigeria, supporting control rooms and guard teams on Lagos time.</p>
                        </div>
                    </FadeDown>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {GLOBAL_HUBS.map((hub, idx) => (
                            <FadeDown key={idx} delay={idx * 0.1}>
                                <div className="bg-slate-50 border border-slate-200 p-8 rounded-3xl hover:bg-slate-100 transition-all relative overflow-hidden group transform-gpu">
                                    <div className={`absolute inset-0 ${hub.glow} blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform-gpu`} />
                                    <div className="relative z-10">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                            <hub.icon className="w-6 h-6 text-slate-600 group-hover:text-slate-900 transition-colors" />
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-900 mb-1">{hub.city}</h3>
                                        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">{hub.label}</p>
                                    </div>
                                </div>
                            </FadeDown>
                        ))}
                    </div>
                </section>

                {/* 4. FREQUENTLY ASKED QUESTIONS SECTION */}
                <section className="max-w-3xl mx-auto">
                    <FadeDown>
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Frequently Asked Questions</h2>
                            <p className="text-slate-600">Everything you need to know about our enterprise support and services.</p>
                        </div>
                    </FadeDown>

                    <div className="space-y-4">
                        {FAQS.map((faq, idx) => (
                            <FadeDown key={idx} delay={idx * 0.1}>
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden backdrop-blur-sm transform-gpu">
                                    <button
                                        onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                                        className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors group outline-none"
                                    >
                                        <span className="text-lg font-medium text-slate-800 group-hover:text-slate-900 transition-colors">{faq.question}</span>
                                        <ChevronDown
                                            className={`w-5 h-5 text-slate-500 transition-transform duration-300 transform-gpu ${openFaq === idx ? 'rotate-180 text-slate-900' : ''}`}
                                        />
                                    </button>
                                    <AnimatePresence initial={false}>
                                        {openFaq === idx && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                                className="overflow-hidden" // OPTIMIZATION: Prevents text spilling during animation
                                            >
                                                <div className="px-6 pb-6 text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
                                                    {faq.answer}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </FadeDown>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default ContactUs;