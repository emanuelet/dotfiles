## Resume Pipeline Rules

### Source of Truth
All resume tailoring must use `Main/Professional/` (Obsidian vault) as the exclusive source of truth for the user's professional experience:
- `Main/Professional/Personal Info.md` — name, title, location, summary
- `Main/Professional/Skills.md` — full skill inventory
- `Main/Professional/Skill Highlights.md` — prioritised skill highlights
- `Main/Professional/Career Highlights/*.md` — individual career achievements
- `Main/Professional/Experience/*.md` — each role with description, dates, tech

**NEVER fabricate** experience, skills, achievements, technologies, or metrics not present in these files. Every claim on the resume must trace back to source data.

### Material Improvement Gate
Before submitting any tailored resume, verify it is materially better than the base template:
1. Run Reactive Resume ATS analysis on base template (ID: `019e4e19-f7c7-7605-bc19-b7c5b0a7bc0a`)
2. Run on tailored resume
3. Pass only if `tailoredScore >= baseScore + 5` (scores < 5 apart are noise)
4. If fail, use base template instead — a clean generic resume beats a poorly-tailored one

### ATS Analysis Caveat
Reactive Resume's ATS analysis is **LLM-powered** (not algorithmic). Scores are subjective and noisy — only differences ≥ 5 points are meaningful. The analysis prompt instructs the AI not to invent achievements, but the LLM may still hallucinate.
