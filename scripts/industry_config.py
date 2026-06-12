"""Industry- and trade-specific copy and styling for generated preview sites."""

INDUSTRY_CONFIG = {
    "home_services": {
        "theme": {
            "primary": "#1e6f9f",
            "primary_dark": "#155a80",
            "accent": "#f97316",
            "text": "#1f2937",
            "muted": "#6b7280",
            "bg": "#f8fafc",
            "hero_gradient": "linear-gradient(135deg, #1e6f9f 0%, #155a80 100%)",
        },
        "hero_image": "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&q=80",
        "section_image": "https://images.unsplash.com/photo-1504149926379-3c3b64a2a7b5?w=800&q=80",
        "services": [
            "Emergency repairs & service calls",
            "Installations & replacements",
            "Maintenance plans for peace of mind",
            "Free estimates for local homeowners",
        ],
        "tagline_template": "Trusted local home service professionals serving {city} and surrounding communities.",
        "about_template": (
            "{name} provides reliable home services throughout Orange County. "
            "Our team focuses on quality workmanship, clear communication, and "
            "getting the job done right the first time."
        ),
    },
    "auto": {
        "theme": {
            "primary": "#b91c1c",
            "primary_dark": "#991b1b",
            "accent": "#fbbf24",
            "text": "#111827",
            "muted": "#6b7280",
            "bg": "#f9fafb",
            "hero_gradient": "linear-gradient(135deg, #991b1b 0%, #1f2937 100%)",
        },
        "hero_image": "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=1200&q=80",
        "section_image": "https://images.unsplash.com/photo-1625047509168-a7026f36de0c?w=800&q=80",
        "services": [
            "Diagnostics & repair",
            "Oil changes & routine maintenance",
            "Brake, tire, and engine service",
            "Honest estimates — no surprises",
        ],
        "tagline_template": "Dependable auto service for drivers in {city} and all of Orange County.",
        "about_template": (
            "{name} is a local auto shop committed to keeping your vehicle running safely. "
            "We combine experienced technicians with straightforward service you can trust."
        ),
    },
    "professional": {
        "theme": {
            "primary": "#1e3a5f",
            "primary_dark": "#152a45",
            "accent": "#c9a227",
            "text": "#1f2937",
            "muted": "#6b7280",
            "bg": "#f8fafc",
            "hero_gradient": "linear-gradient(135deg, #1e3a5f 0%, #152a45 100%)",
        },
        "hero_image": "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1200&q=80",
        "section_image": "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80",
        "services": [
            "Personalized consultations",
            "Clear guidance for complex decisions",
            "Responsive communication",
            "Serving clients across Orange County",
        ],
        "tagline_template": "Professional services tailored to clients in {city} and Orange County.",
        "about_template": (
            "{name} helps local clients navigate important decisions with clarity and care. "
            "We focus on practical advice, attention to detail, and long-term relationships."
        ),
    },
    "plumber": {
        "theme": {
            "primary": "#0c4a6e",
            "primary_dark": "#082f49",
            "accent": "#0ea5e9",
            "text": "#0f172a",
            "muted": "#64748b",
            "bg": "#f0f9ff",
            "hero_gradient": "linear-gradient(135deg, #0c4a6e 0%, #0369a1 55%, #0ea5e9 100%)",
        },
        "hero_image": "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=1200&q=80",
        "section_image": "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&q=80",
        "hero_badge": "24/7 Emergency Service Available",
        "trust_badges": ["Licensed & Insured", "Free Estimates", "Same-Day Service"],
        "services": [
            {
                "title": "Emergency Plumbing Repairs",
                "description": "Burst pipes, major leaks, and backed-up drains — fast response when every minute counts.",
                "image": "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600&q=80",
            },
            {
                "title": "Drain Cleaning & Sewer Service",
                "description": "Clear stubborn clogs and restore flow with professional equipment and lasting results.",
                "image": "https://images.unsplash.com/photo-1748399132710-d509b7ef3e64?w=600&q=80",
            },
            {
                "title": "Water Heater Repair & Installation",
                "description": "Tank and tankless water heaters serviced, repaired, or replaced with energy-efficient options.",
                "image": "https://images.unsplash.com/photo-1722604831786-656f0bac1502?w=600&q=80",
            },
            {
                "title": "Fixture & Pipe Installation",
                "description": "Faucets, toilets, garbage disposals, and repiping done right the first time.",
                "image": "https://images.unsplash.com/photo-1739176566047-d9573b6c9fac?w=600&q=80",
                "image_secondary": "https://images.unsplash.com/photo-1694827893591-af9b80361599?w=600&q=80",
            },
        ],
        "features": [
            {
                "title": "Fast local response",
                "description": "We know {city} neighborhoods and arrive prepared to diagnose and fix the problem quickly.",
            },
            {
                "title": "Upfront, honest pricing",
                "description": "Clear quotes before work begins — no surprise fees or pressure to upsell.",
            },
            {
                "title": "Quality workmanship",
                "description": "Every job is done to code with quality parts and work we stand behind.",
            },
        ],
        "blog_posts": [
            {
                "title": "5 Signs You Need a Plumber Right Away",
                "excerpt": "Slow drains, water stains, and low pressure often signal bigger problems. Learn when to call a pro before damage spreads.",
                "date": "March 2026",
                "image": "https://images.unsplash.com/photo-1763100351670-756f71d57c9f?w=600&q=80",
            },
            {
                "title": "How to Prevent Costly Pipe Leaks at Home",
                "excerpt": "Simple maintenance habits — checking supply lines, knowing your shut-off valve, and watching water pressure — can save thousands.",
                "date": "February 2026",
                "image": "https://images.unsplash.com/photo-1771235920955-ce44a568803c?w=600&q=80",
            },
            {
                "title": "Tank vs. Tankless Water Heaters: What Homeowners Should Know",
                "excerpt": "Compare upfront cost, energy use, and lifespan to choose the right water heater for your household.",
                "date": "January 2026",
                "image": "https://images.unsplash.com/photo-1601914697928-0b536e76d048?w=600&q=80",
            },
        ],
        "cta_headline": "Need a plumber in {city}?",
        "cta_text": "Call today for a free estimate. Emergency service available.",
        "tagline_template": "Trusted plumbing professionals serving {city} and surrounding cities.",
        "about_template": (
            "{name} is a local plumbing company dedicated to reliable repairs, clean installations, "
            "and honest service for homeowners and businesses in {city}. From emergency leaks to "
            "planned upgrades, our team delivers quality work you can count on."
        ),
    },
    "hvac": {
        "theme": {
            "primary": "#1e40af",
            "primary_dark": "#1e3a8a",
            "accent": "#22c55e",
            "text": "#0f172a",
            "muted": "#64748b",
            "bg": "#f8fafc",
            "hero_gradient": "linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #059669 100%)",
        },
        "hero_image": "https://images.unsplash.com/photo-1758798157512-f0a864c696c9?w=1200&q=80",
        "section_image": "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=800&q=80",
        "hero_badge": "Heating & Cooling Experts",
        "trust_badges": ["Licensed Technicians", "Free Estimates", "All Brands Serviced"],
        "services": [
            {
                "title": "AC Repair & Installation",
                "description": "Keep your home cool with expert diagnostics, repairs, and new system installations.",
                "image": "https://images.unsplash.com/photo-1758798157512-f0a864c696c9?w=600&q=80",
            },
            {
                "title": "Heating & Furnace Service",
                "description": "Furnace tune-ups, heat pump service, and reliable warmth when temperatures drop.",
                "image": "https://images.unsplash.com/photo-1650551182956-47efa0f90b64?w=600&q=80",
            },
            {
                "title": "Preventive Maintenance Plans",
                "description": "Seasonal check-ups that extend equipment life, improve efficiency, and prevent breakdowns.",
                "image": "https://images.unsplash.com/photo-1604176857763-71877b24864e?w=600&q=80",
            },
            {
                "title": "Indoor Air Quality Solutions",
                "description": "Duct cleaning, filtration upgrades, and humidity control for healthier indoor air.",
                "image": "https://images.unsplash.com/photo-1558358235-a0a93f68a52c?w=600&q=80",
            },
        ],
        "features": [
            {
                "title": "Comfort you can feel",
                "description": "Properly sized systems and precise repairs keep every room in your {city} home comfortable year-round.",
            },
            {
                "title": "Energy-smart solutions",
                "description": "We recommend efficient equipment and maintenance that lowers utility bills over time.",
            },
            {
                "title": "Certified technicians",
                "description": "Experienced HVAC pros who explain options clearly and respect your home.",
            },
        ],
        "blog_posts": [
            {
                "title": "How to Prepare Your AC for Southern California Summers",
                "excerpt": "A pre-season tune-up, clean filters, and clear condenser coils help your system run efficiently when heat peaks.",
                "date": "March 2026",
                "image": "https://images.unsplash.com/photo-1758798157512-f0a864c696c9?w=600&q=80",
            },
            {
                "title": "7 Warning Signs Your Furnace Needs Professional Attention",
                "excerpt": "Strange noises, uneven heating, and rising energy bills are signals it's time to schedule a service call.",
                "date": "February 2026",
                "image": "https://images.unsplash.com/photo-1685041358608-a96d870cd45e?w=600&q=80",
            },
            {
                "title": "Simple Ways to Lower Your HVAC Energy Bill",
                "excerpt": "Smart thermostat settings, sealed ducts, and regular filter changes make a real difference month to month.",
                "date": "January 2026",
                "image": "https://images.unsplash.com/photo-1770625467384-304e461ef1be?w=600&q=80",
            },
        ],
        "cta_headline": "Stay comfortable in {city}",
        "cta_text": "Schedule a free estimate for repair, maintenance, or a new system.",
        "tagline_template": "Expert heating and air conditioning for homes and businesses in {city} and Southern California.",
        "about_template": (
            "{name} helps {city} families stay comfortable through every season. Our HVAC team handles "
            "repairs, maintenance, and installations with a focus on reliability, efficiency, and "
            "straightforward recommendations you can trust."
        ),
    },
    "roofer": {
        "theme": {
            "primary": "#7c2d12",
            "primary_dark": "#431407",
            "accent": "#ea580c",
            "text": "#1c1917",
            "muted": "#78716c",
            "bg": "#fafaf9",
            "hero_gradient": "linear-gradient(135deg, #431407 0%, #7c2d12 50%, #c2410c 100%)",
        },
        "hero_image": "https://images.unsplash.com/photo-1763665814605-a6489a3bf2a0?w=1200&q=80",
        "section_image": "https://images.unsplash.com/photo-1727777266423-6a33048e4894?w=800&q=80",
        "hero_badge": "Roof Repair & Replacement",
        "trust_badges": ["Licensed & Bonded", "Free Inspections", "Storm Damage Help"],
        "services": [
            {
                "title": "Roof Repair & Leak Fixes",
                "description": "Stop leaks fast with targeted repairs that protect your home from water damage.",
                "image": "https://images.unsplash.com/photo-1590365876016-da05ac533e83?w=600&q=80",
            },
            {
                "title": "Full Roof Replacement",
                "description": "Quality shingles, tile, and flat roofing installed with attention to ventilation and drainage.",
                "image": "https://images.unsplash.com/photo-1763665814605-a6489a3bf2a0?w=600&q=80",
            },
            {
                "title": "Roof Inspections & Maintenance",
                "description": "Catch small issues early with thorough inspections and proactive maintenance.",
                "image": "https://images.unsplash.com/photo-1614418583513-8e96d9160333?w=600&q=80",
            },
            {
                "title": "Gutter & Flashing Service",
                "description": "Proper water management with gutter repair, cleaning, and flashing replacement.",
                "image": "https://images.unsplash.com/photo-1634853982486-c06f0e17940f?w=600&q=80",
            },
        ],
        "features": [
            {
                "title": "Built for SoCal weather",
                "description": "Roofing solutions designed for sun exposure, wind, and seasonal rain in {city}.",
            },
            {
                "title": "Detailed inspections",
                "description": "We document damage clearly and explain repair vs. replacement options upfront.",
            },
            {
                "title": "Lasting protection",
                "description": "Quality materials and proven installation methods that stand up over time.",
            },
        ],
        "blog_posts": [
            {
                "title": "How Often Should You Inspect Your Roof?",
                "excerpt": "Most homeowners benefit from an annual check and an extra look after heavy storms or high winds.",
                "date": "March 2026",
                "image": "https://images.unsplash.com/photo-1600612707884-c424a2ba812e?w=600&q=80",
            },
            {
                "title": "What to Do After Storm Damage to Your Roof",
                "excerpt": "Document the damage, avoid DIY climbs, and call a licensed roofer for a safe professional assessment.",
                "date": "February 2026",
                "image": "https://images.unsplash.com/photo-1590365876016-da05ac533e83?w=600&q=80",
            },
            {
                "title": "Choosing the Right Roofing Material for Your Home",
                "excerpt": "Compare asphalt shingles, tile, and flat systems on cost, lifespan, and curb appeal.",
                "date": "January 2026",
                "image": "https://images.unsplash.com/photo-1528223871781-8f4c984f6164?w=600&q=80",
            },
        ],
        "cta_headline": "Protect your home in {city}",
        "cta_text": "Request a free roof inspection and honest estimate today.",
        "tagline_template": "Professional roofing services for {city} homeowners — repairs, replacements, and inspections.",
        "about_template": (
            "{name} provides dependable roofing for properties throughout {city} and Southern California. "
            "Whether you need emergency leak repair, a full replacement, or a routine inspection, "
            "our crew delivers durable results and clear communication from start to finish."
        ),
    },
}

INDUSTRY_LABELS = {
    "home_services": "Home Services",
    "auto": "Auto Services",
    "professional": "Professional Services",
    "plumber": "Plumbing Services",
    "hvac": "HVAC Services",
    "roofer": "Roofing Services",
}
