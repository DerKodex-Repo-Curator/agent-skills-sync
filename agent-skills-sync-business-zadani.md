# Business zadání: Personal Agent Skills Sync

## 1. Název projektu

**Personal Agent Skills Sync**

Pracovní název VS Code extensionu: **Agent Skills Sync**

------------------------------------------------------------------------

## 2. Executive summary

Cílem projektu je vytvořit VS Code extension, který umožní uživateli
automaticky synchronizovat jeho **osobní AI agent skills mezi více
počítači**.

Typický uživatel používá například macOS i Windows a má na obou
zařízeních nainstalované AI coding tools jako Claude Code nebo Codex.
Skills jsou však dnes typicky uloženy lokálně na konkrétním počítači.

Extension vytvoří jednu **centrální osobní skill knihovnu** uloženou ve
zvoleném remote storage a automaticky:

- stáhne skills při spuštění VS Code,
- nahraje nové nebo změněné skills,
- detekuje konflikty,
- umožní jejich řešení,
- synchronizuje skills do globálního adresáře AI agenta.

Extension se **nesoustředí na synchronizaci skills do projektů**. Jeho
hlavním účelem je synchronizace **osobní globální skill knihovny
uživatele mezi jeho zařízeními**.

------------------------------------------------------------------------

# 3. Problém

## Současný stav

Uživatel si vytvoří osobní AI skill například:

``` text
pdf-processing
data-analysis
code-review
financial-modeling
```

Skill je uložen lokálně na jednom zařízení, například:

``` text
~/.claude/skills/
```

Uživatel následně pracuje na jiném počítači.

Výsledek:

``` text
Mac                         Windows
──────────────────          ──────────────────
pdf-processing              pdf-processing
data-analysis               ❌
code-review                 ❌
```

Uživatel musí:

- ručně kopírovat skills,
- používat vlastní Git repository,
- synchronizovat celý `.claude` adresář,
- nebo znovu instalovat skills z externích zdrojů.

## Problém

**Osobní AI skills jsou pro uživatele hodnotný a opakovaně používaný
asset, ale nejsou automaticky dostupné na všech jeho zařízeních.**

Existující nástroje se většinou zaměřují na:

- instalaci skills do konkrétního projektu,
- distribuci skills do workspace,
- synchronizaci skills mezi různými agenty na jednom zařízení.

Chybí jednoduché řešení typu:

> **„Moje osobní AI skills mě následují na každém počítači.“**

------------------------------------------------------------------------

# 4. Produktová hypotéza

Pokud uživateli umožníme synchronizovat jeho osobní AI skills mezi
zařízeními pomocí jednoduchého VS Code extensionu, pak:

- snížíme tření při práci na více zařízeních,
- zvýšíme hodnotu osobních skills,
- odstraníme potřebu ručního Git workflow,
- vytvoříme přirozenou vrstvu mezi uživatelem a AI coding tools.

## Klíčová hypotéza

> **Uživatelé, kteří používají AI coding agenty na více zařízeních,
> budou ochotni svěřit synchronizaci svých osobních skills
> specializovanému nástroji, pokud bude nastavení jednoduché a data
> zůstanou pod jejich kontrolou.**

------------------------------------------------------------------------

# 5. Cílová skupina

## Primární cílová skupina

Developers a power users, kteří:

- používají Claude Code, Codex nebo podobné AI coding tools,
- pracují na více počítačích,
- používají Windows i macOS,
- vytvářejí vlastní skills,
- mají vlastní AI workflow a konfiguraci.

### Typický uživatel

> Developer používá Mac doma a Windows v práci. Má 20 vlastních Claude
> skills. Skills průběžně upravuje a vytváří nové. Nechce řešit Git
> repository ani ručně kopírovat soubory.

------------------------------------------------------------------------

## Sekundární cílová skupina

- AI-assisted developers
- AI consultants
- indie hackers
- technical founders
- AI workflow enthusiasts

------------------------------------------------------------------------

# 6. Produktová vize

> **One personal AI skill library. Available on every machine.**

Česky:

> **Jedna osobní knihovna AI skills. Dostupná na každém zařízení.**

Extension má fungovat podobně jako:

- Dropbox pro soubory,
- VS Code Settings Sync pro nastavení,

ale pro:

> **osobní skills AI agentů.**

------------------------------------------------------------------------

# 7. Produktový princip

## Důležitá diferenciace

Extension **není primárně skill marketplace**.

Extension **není project skill installer**.

Extension **není skill repository browser**.

Extension je:

> **Personal Skills Synchronization Layer**

------------------------------------------------------------------------

# 8. Scope MVP

## MVP musí podporovat

### 8.1 Globální Claude Code skills

Primární synchronizovaný adresář:

``` text
~/.claude/skills/
```

Extension musí synchronizovat obsah tohoto adresáře.

------------------------------------------------------------------------

### 8.2 Remote storage

MVP podporuje **GitHub private repository**.

Příklad:

``` text
github.com/user/my-agent-skills
```

Repozitář je vlastněn uživatelem.

Extension nepoužívá vlastní cloud storage.

------------------------------------------------------------------------

### 8.3 GitHub authentication

Uživatel se přihlásí pomocí GitHub OAuth.

Po přihlášení extension:

- zobrazí dostupné private repositories,
- umožní vybrat repository,
- umožní vybrat branch.

Preferovaný UX:

``` text
Sign in with GitHub
        ↓
Select repository
        ↓
Select branch
        ↓
Sync enabled
```

------------------------------------------------------------------------

### 8.4 Automatický download při startu VS Code

Při spuštění VS Code:

``` text
VS Code starts
        ↓
Extension activates
        ↓
Check remote repository
        ↓
Compare local and remote state
        ↓
Download changes
        ↓
Update ~/.claude/skills/
```

Pokud nejsou konflikty, synchronizace proběhne automaticky.

------------------------------------------------------------------------

### 8.5 Automatický upload změn

Extension sleduje globální skills directory.

Příklad:

``` text
~/.claude/skills/pdf-processing/SKILL.md
```

Pokud uživatel soubor změní:

``` text
File changed
        ↓
Debounce 3 seconds
        ↓
Detect change
        ↓
Sync to GitHub
```

Extension nesmí uploadovat každou změnu okamžitě bez debounce.

------------------------------------------------------------------------

### 8.6 Nové skills

Pokud uživatel vytvoří:

``` text
~/.claude/skills/new-skill/
```

extension detekuje nový skill a synchronizuje jej do remote repository.

------------------------------------------------------------------------

### 8.7 Konflikty

Pokud dojde ke změně stejného skillu na dvou zařízeních:

``` text
Mac       → Skill A modified
Windows   → Skill A modified
```

extension nesmí automaticky přepsat jednu verzi druhou.

Musí zobrazit konflikt.

Preferované řešení:

``` text
Skill conflict detected

[Compare versions]
[Keep local]
[Use remote]
```

Pro volbu **Compare versions** použít nativní VS Code diff editor.

------------------------------------------------------------------------

### 8.8 Status indikátor

VS Code status bar musí zobrazovat stav synchronizace.

Příklady:

``` text
✓ Skills Synced
↻ Syncing Skills
⚠ Skill Conflict
✕ Sync Error
```

Kliknutí otevře detailní stav.

------------------------------------------------------------------------

# 9. Non-goals MVP

MVP nebude obsahovat:

- skill marketplace,
- veřejné sdílení skills,
- skill discovery,
- AI generování skills,
- synchronizaci celého `.claude` adresáře,
- synchronizaci projektových skills,
- synchronizaci Claude settings,
- synchronizaci `CLAUDE.md`,
- Codex support,
- Cursor support,
- vlastní cloud storage.

Tyto funkce mohou být předmětem budoucího rozšíření.

------------------------------------------------------------------------

# 10. Uživatelský scénář

## Scenario: první zařízení

Uživatel nainstaluje extension.

Zobrazí se:

> **Set up Agent Skills Sync**

Uživatel:

1.  klikne na **Connect GitHub**,
2.  autorizuje extension,
3.  vybere private repository,
4.  zvolí branch,
5.  potvrdí synchronizaci.

Extension zjistí lokální skills:

``` text
5 local skills found
```

Zobrazí:

> **Upload local skills to remote repository?**

Uživatel potvrdí.

Skills jsou nahrány.

------------------------------------------------------------------------

## Scenario: druhé zařízení

Uživatel nainstaluje extension na druhém počítači.

Přihlásí se ke stejnému GitHub účtu.

Vybere stejné repository.

Extension zjistí:

``` text
Remote skills found: 5
Local skills found: 0
```

Zobrazí:

> **5 skills available remotely. Download now?**

Uživatel potvrdí.

Skills jsou nainstalovány do:

``` text
~/.claude/skills/
```

------------------------------------------------------------------------

## Scenario: změna skillu

Uživatel upraví:

``` text
SKILL.md
```

Extension:

1.  detekuje změnu,
2.  počká na debounce period,
3.  vytvoří remote update,
4.  nahraje změnu.

Status bar:

``` text
✓ Skills Synced
```

------------------------------------------------------------------------

## Scenario: konflikt

Mac upraví skill:

``` text
pdf-processing
```

Windows upraví stejný skill.

Mac provede sync.

Windows se následně pokusí synchronizovat.

Extension zobrazí:

> **Skill conflict detected**

Uživatel má možnost:

- Keep Local
- Use Remote
- Compare

------------------------------------------------------------------------

# 11. Klíčové UX principy

## 11.1 Zero Git knowledge required

Uživatel nesmí potřebovat rozumět:

- Git commitům,
- Git branchím,
- merge,
- rebase.

GitHub je pouze backend.

------------------------------------------------------------------------

## 11.2 User owns the data

Extension musí jasně komunikovat:

> **Your skills are stored in your own GitHub repository.**

Extension nesmí v MVP vyžadovat vlastní backend.

------------------------------------------------------------------------

## 11.3 Automatic by default

Po dokončení setupu má být hlavní workflow automatické.

Uživatel by neměl běžně potřebovat:

``` text
git pull
git add
git commit
git push
```

------------------------------------------------------------------------

## 11.4 Never silently destroy data

Při konfliktu nebo nejasném stavu:

> **Prefer explicit conflict over silent overwrite.**

------------------------------------------------------------------------

# 12. Technické požadavky MVP

## Platformy

- macOS
- Windows

Linux není v MVP nutný, ale architektura by jej neměla blokovat.

------------------------------------------------------------------------

## VS Code

Extension musí fungovat jako standardní VS Code extension.

Minimální podporovaná verze VS Code bude definována při implementaci.

------------------------------------------------------------------------

## File system

Extension musí umět:

- monitorovat skills directory,
- detekovat nové soubory,
- detekovat změny,
- detekovat odstranění,
- synchronizovat nested directories.

------------------------------------------------------------------------

## Remote layer

MVP:

``` text
GitHub
```

GitHub API nebo embedded Git workflow.

Preferovaná varianta:

> **GitHub API + vlastní synchronizační logika**

Důvodem je snížení závislosti na lokální instalaci Git.

------------------------------------------------------------------------

# 13. Synchronizační model

Synchronizace musí být **state-based**, nikoli pouze timestamp-based.

Každý skill by měl být porovnáván minimálně podle:

``` text
Local state
Remote state
Last known synced state
```

Konceptuálně:

``` text
LOCAL
REMOTE
BASE
```

To umožní detekovat:

``` text
Local changed
Remote unchanged
→ upload local

Local unchanged
Remote changed
→ download remote

Local changed
Remote changed
→ conflict
```

Tento model je klíčový pro bezpečné bidirectional sync chování.

------------------------------------------------------------------------

# 14. Success metrics

## MVP success

MVP je úspěšné, pokud uživatel dokáže:

> **Nainstalovat extension na dvou počítačích a během 5 minut mít stejné
> globální skills na obou zařízeních.**

------------------------------------------------------------------------

## Produktové metriky

### Activation

- % uživatelů, kteří dokončí GitHub setup
- čas do prvního úspěšného syncu

### Usage

- počet synchronizovaných skills
- počet sync operací
- počet aktivních zařízení na uživatele

### Retention

- 7-day retention
- 30-day retention

### Reliability

- sync success rate
- conflict rate
- failed sync rate

------------------------------------------------------------------------

# 15. Competitive positioning

## Existing tools

Existující nástroje se typicky zaměřují na:

> **skill installation and project distribution**

## Agent Skills Sync

Positioning:

> **Personal cross-device skill synchronization**

### Jedna věta

> **Keep your personal AI skills synchronized across every computer you
> use.**

------------------------------------------------------------------------

# 16. Budoucí roadmapa

## Phase 2

- Codex support
- Cursor support
- configurable agent skill directories
- SFTP backend
- GitLab backend
- multiple skill libraries

------------------------------------------------------------------------

## Phase 3

- cross-agent deployment

Například:

``` text
Personal Skills
       ↓
Claude Code
Codex
Cursor
```

------------------------------------------------------------------------

## Phase 4

- skill profiles

Například:

``` text
Work
Personal
Consulting
Finance
```

------------------------------------------------------------------------

## Phase 5

- optional hosted sync
- encrypted cloud storage
- team libraries

------------------------------------------------------------------------

# 17. Klíčové produktové rozhodnutí

## Doporučení

MVP by mělo být **Claude Code-first**, ale produkt nesmí být
architektonicky pojmenován ani navržen jako čistě Claude-specific
extension.

Doporučený produktový koncept:

> **Agent Skills Sync**

Důvod:

Skills se velmi pravděpodobně stanou společnou vrstvou napříč AI coding
agenty.

Produkt by měl být připraven na budoucí podporu více agentů, ale MVP
musí zůstat úzké a jednoduché.

------------------------------------------------------------------------

# 18. Finální product statement

> **Agent Skills Sync is a VS Code extension that automatically keeps a
> developer's personal AI agent skills synchronized across all of their
> computers. Users own the storage, setup takes minutes, and daily
> synchronization happens automatically in the background.**
