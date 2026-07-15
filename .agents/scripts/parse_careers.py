import re, json

with open('/home/runner/workspace/.agents/outputs/career_full.txt') as f:
    raw = f.read()

# remove footer lines
raw = re.sub(r'ScorpStudy Career Explorer \| Page \d+ of \d+\n?', '', raw)

CATEGORIES = [
    "Technology & IT","Engineering","Medical & Healthcare","Business & Finance",
    "Government & Civil Service","Education","Law & Legal","Arts, Media & Creative",
    "Science & Research","Agriculture & Environment","Hospitality & Tourism","Skilled Trades",
    "Armed Forces & Security","Sports","Manufacturing & Production","Transportation & Logistics",
    "Retail & Sales","Real Estate & Property","Beauty & Wellness","Maritime & Aviation",
    "Energy & Utilities","Non-Profit & Social Services","Politics & Public Policy",
    "Religious & Community Services"
]
CAT_UPPER = {c.upper(): c for c in CATEGORIES}

# find all anchors: \n(\d{3})\n(Title line)\nOVERVIEW\n
anchor_re = re.compile(r'\n(\d{3})\n([^\n]+)\nOVERVIEW\n')
anchors = list(anchor_re.finditer(raw))
print("anchors found:", len(anchors))

def section(block, start_label, end_labels):
    pat = re.compile(re.escape(start_label) + r'\n(.*?)(?=' + '|'.join(re.escape(l)+r'\n' for l in end_labels) + ')', re.S)
    m = pat.search(block)
    return m.group(1).strip() if m else ""

careers = []
for i, m in enumerate(anchors):
    num = m.group(1)
    title = m.group(2).strip()
    start = m.end()
    end = anchors[i+1].start() if i+1 < len(anchors) else len(raw)
    block = raw[start:end]

    overview = section(block, "OVERVIEW", ["ROLES & RESPONSIBILITIES"])
    roles = section(block, "ROLES & RESPONSIBILITIES", ["WHY CHOOSE THIS CAREER"])
    why = section(block, "WHY CHOOSE THIS CAREER", ["CURRENT SCOPE & INDUSTRY TRENDS"])
    scope = section(block, "CURRENT SCOPE & INDUSTRY TRENDS", ["SALARY IN NEPAL"])
    salary_nepal_raw = section(block, "SALARY IN NEPAL", ["SALARY ABROAD"])
    salary_abroad_raw = section(block, "SALARY ABROAD — INTERNATIONAL COMPARISON", ["SKILLS & QUALIFICATIONS NEEDED"])
    skills_raw = section(block, "SKILLS & QUALIFICATIONS NEEDED", ["CAREER GROWTH PATH"])
    growth = section(block, "CAREER GROWTH PATH", ["ENTRY\n"])

    # category: an all-caps line matching known category, appears inside salary_nepal_raw tail
    category = None
    for line in block.split("\n"):
        line_s = line.strip()
        if line_s.upper() in CAT_UPPER and line_s.isupper():
            category = CAT_UPPER[line_s.upper()]
            break

    # clean salary_nepal: remove trailing category line if captured inside
    if category:
        salary_nepal_raw = re.sub(r'\n?' + re.escape(category.upper()) + r'\s*$', '', salary_nepal_raw).strip()

    # skills list: paragraph + bullet lines. Split by first sentence ending then lines
    skills_lines = [l.strip() for l in skills_raw.split("\n") if l.strip()]
    # paragraph is the long block of sentences before short bullet-like lines; bullets are short lines (<=6 words) at the end
    skill_items = []
    para_lines = []
    for l in skills_lines:
        if len(l.split()) <= 6 and not l.endswith('.') and para_lines:
            skill_items.append(l)
        else:
            para_lines.append(l)
    skills_paragraph = " ".join(para_lines)

    entry = mid = senior = None
    em = re.search(r'ENTRY\n(.*?)\nMID\n(.*?)\nSENIOR\n(.*?)\n', block, re.S)
    if em:
        entry, mid, senior = em.group(1).strip(), em.group(2).strip(), em.group(3).strip()

    gulf = western = australia = None
    fm = re.search(r'Gulf Countries \(UAE, Qatar, Saudi Arabia\)\n(.*?)\nUSA, Canada, UK & Western Europe\n(.*?)\nAustralia & New Zealand\n(.*?)(?:\n|$)', block, re.S)
    if fm:
        gulf, western, australia = fm.group(1).strip(), fm.group(2).strip(), fm.group(3).strip()

    careers.append({
        "id": num,
        "title": title,
        "category": category,
        "overview": overview,
        "roles": roles,
        "whyChoose": why,
        "scope": scope,
        "salaryNepal": salary_nepal_raw,
        "salaryAbroad": salary_abroad_raw,
        "skills": skill_items,
        "skillsIntro": skills_paragraph,
        "growth": growth,
        "salaryBands": {"entry": entry, "mid": mid, "senior": senior},
        "foreignSalary": {
            "gulf": gulf,
            "western": western,
            "australia": australia
        }
    })

with open('/home/runner/workspace/.agents/outputs/careers.json', 'w') as f:
    json.dump(careers, f, indent=1, ensure_ascii=False)

print("total careers parsed:", len(careers))
missing_cat = [c["id"] for c in careers if not c["category"]]
print("missing category:", len(missing_cat), missing_cat[:20])
missing_bands = [c["id"] for c in careers if not c["salaryBands"]["entry"]]
print("missing salary bands:", len(missing_bands), missing_bands[:20])
missing_foreign = [c["id"] for c in careers if not c["foreignSalary"]["gulf"]]
print("missing foreign:", len(missing_foreign), missing_foreign[:20])
missing_skills = [c["id"] for c in careers if not c["skills"]]
print("missing skills:", len(missing_skills), missing_skills[:20])
