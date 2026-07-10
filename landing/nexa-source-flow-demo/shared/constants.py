"""Study constants for NexaFlow demo (NovaPharm 20250012)."""

BUILD_VERSION = "2026.06.27-demo-b"

ALL_SUBJECTS = [
    "0103", "0104", "0105", "0106", "0107", "0108", "0109", "0110",
    "0111", "0112", "0113", "0115", "0116", "0117", "0118", "0119",
    "0120", "0121",
    "0303", "0304", "0305", "0306", "0307", "0308", "0310", "0311",
    "0312", "0313", "0314", "0315", "0316",
    "0503", "0504", "0508", "0509", "0510",
    "0704", "0705", "0706", "0707", "0711", "0712", "0713", "0714", "0715",
]

GROUP_2 = [
    "0115", "0116", "0117", "0118", "0119", "0120", "0121",
    "0310", "0311", "0312", "0313", "0314", "0315", "0316",
    "0508", "0509", "0510",
    "0711", "0712", "0713", "0714", "0715",
]
GROUP_1 = [s for s in ALL_SUBJECTS if s not in GROUP_2]

VISITS = [
    "Screening", "Day -1",
    "Day 1", "Day 2", "Day 3", "Day 4",
    "Day 5", "Day 6", "Day 7", "Day 8",
]

TARGET_CRFS_BY_VISIT = {
    "Screening": [
        "Date of Visit", "Disposition - Informed Consent",
        "Inclusion/Exclusion Criteria", "Demographics",
        "Medical History Summary", "Pregnancy History",
        "Abbreviated Physical Examination",
        "Vital Signs (Body Measurement)", "12-Lead ECG", "Vital Signs",
        "Pregnancy Test - Serum", "Reproductive System Findings", "FSH Test",
        "Clinical Chemistry", "Hematology", "Thyroid Stimulating Hormone",
        "Serology", "Drug Screen", "Urinalysis", "eGFR",
        "Complete Lipid Profile SCRN",
    ],
    "Day -1": [
        "Date of Visit", "Vital Signs (Body Measurement)", "Vital Signs",
        "12-Lead ECG", "Pregnancy Test - Urine",
        "Clinical Chemistry", "Hematology", "Drug Screen", "Alcohol Test",
        "Urinalysis", "eGFR",
    ],
    "Day 1": [
        "Date of Visit", "Randomization", "Study assignment", "Vital Signs",
        "Nexavorin Serum PK Collection", "Anti-Nexavorin Antibody",
        "Complete Lipid Profile", "PCSK9 Serum Level", "Nexavorin Administration",
    ],
    "Day 2": [
        "Date of Visit", "Vital Signs", "Nexavorin Serum PK Collection",
        "Complete Lipid Profile", "PCSK9 Serum Level",
    ],
    "Day 3": [
        "Date of Visit", "Vital Signs", "Nexavorin Serum PK Collection",
        "Complete Lipid Profile", "PCSK9 Serum Level",
    ],
    "Day 4": [
        "Date of Visit", "Vital Signs", "Nexavorin Serum PK Collection",
        "Complete Lipid Profile", "PCSK9 Serum Level",
    ],
    "Day 5": [
        "Date of Visit", "Vital Signs", "Nexavorin Serum PK Collection",
        "Complete Lipid Profile", "PCSK9 Serum Level",
    ],
    "Day 6": [
        "Date of Visit", "Vital Signs", "Nexavorin Serum PK Collection",
        "Complete Lipid Profile", "PCSK9 Serum Level",
    ],
    "Day 7": [
        "Date of Visit", "Vital Signs", "Nexavorin Serum PK Collection",
        "Complete Lipid Profile", "PCSK9 Serum Level",
    ],
    "Day 8": [
        "Date of Visit", "Vital Signs", "Nexavorin Serum PK Collection",
        "Complete Lipid Profile", "PCSK9 Serum Level", "Disposition - End of Study",
    ],
}

SUBJECT_LEVEL_FORMS = [
    "Adverse Events Summary",
    "Prior and Concomitant Medications Summary",
    "Prior and Concomitant Medications",
    "Disposition - End of Study",
]

STUDY_ID = "20250012"
SITE_NAME = "Westbridge Clinical Research Center"

# Demo study list (NovaPharm active; others shown as unavailable)
DEMO_STUDIES = [
    {
        "id": "20250012",
        "label": "NovaPharm 20250012 — A Phase 1 Study of Nexavorin (NVA-PH1)",
    },
    {
        "id": "45087-001",
        "label": "Crestova Therapeutics CRX-45087-001",
        "disabled": True,
    },
    {
        "id": "568088-008",
        "label": "Crestova Therapeutics CRX-568088-008",
        "disabled": True,
    },
]

CONSOLE_PORT = 5050
RAVE_PORT = 5051
FOLDER_RAW_CS = "10oUg6XqrO_UqjhFSlSVGdNX33NIqjgVi"
